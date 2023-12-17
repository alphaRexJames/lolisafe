/*
 * ServeStaticQuick.
 *
 * This is intended as a compromise between ServeStatic handler and
 * ServeLiveDirectory middleware.
 *
 * This monitors and caches the configured directory's file tree for quick lookups,
 * thus allowing multiple instances of this middleware to be used together, if needed.
 *
 * When matches are found, it will then simply spawn ReadStream to the physical files.
 * Due to the fact that it does not have to pre-cache the whole files into memory,
 * this is likely the better choice to serve generic assets
 * in an environment where memory space is a premium.
 *
 * This class also has Conditional GETs support,
 * which involves handling cache-related headers such as
 * If-Match, If-Unmodified-Since, ETag, etc.
 * And partial bytes fetch by handling Content-Range header,
 * which is useful for streaming, among other things.
 */

const chokidar = require('chokidar')
const etag = require('etag')
const jetpack = require('fs-jetpack')
const serveUtils = require('./../utils/serveUtils')
const logger = require('./../../logger')

class ServeStaticQuick {
  directory
  files
  watcher

  #options
  #readyPromise
  #readyResolve

  constructor (directory, options = {}) {
    if (!directory || typeof directory !== 'string') {
      throw new TypeError('Root directory must be set')
    }

    this.directory = serveUtils.forwardSlashes(directory)

    // Ensure does not end with a forward slash
    if (this.directory.endsWith('/')) {
      this.directory = this.directory.slice(0, -1)
    }

    if (options.acceptRanges === undefined) {
      options.acceptRanges = true
    }

    if (options.etag === undefined) {
      options.etag = true
    }

    if (options.ignore && typeof options.ignore !== 'function') {
      // Unlike LiveDirectory, we only support function for simplicity's sake
      throw new TypeError('Middleware option ignore must be a function')
    }

    if (options.lastModified === undefined) {
      options.lastModified = true
    }

    if (options.setHeaders && typeof options.setHeaders !== 'function') {
      throw new TypeError('Middleware option setHeaders must be a function')
    }

    this.files = new Map()

    this.watcher = chokidar.watch(this.directory, {
      // fs.Stats object is already always available with add/addDir/change events
      alwaysStat: false,
      awaitWriteFinish: {
        pollInterval: 100,
        stabilityThreshold: 500
      }
    })

    this.#bindWatchHandlers()

    this.#options = options
  }

  get (path) {
    const stat = this.files.get(path)

    if (!stat || stat.isDirectory()) return

    return stat
  }

  handler (req, res, path, stat) {
    // Set Content-Type
    res.type(path)

    // Set header fields
    this.#setHeaders(req, res, stat)

    // Conditional GET support
    if (serveUtils.assertConditionalGET(req, res)) {
      return res.end()
    }

    // ReadStream options with Content-Range support if required
    const result = serveUtils.buildReadStreamOptions(req, res, stat, this.#options.acceptRanges)
    if (!result) {
      return res.end()
    }

    // HEAD support
    if (req.method === 'HEAD') {
      // If HEAD, also set Content-Length (must be string)
      res.header('Content-Length', String(result.length))
      return res.end()
    }

    if (result.length === 0) {
      res.end()
    }

    return this.#stream(req, res, path, stat, result)
  }

  // Returns a promise which resolves to true once ServeStaticQuick is ready
  ready () {
    // Resolve with true if ready is not a promise
    if (this.#readyPromise === true) return Promise.resolve(true)

    // Create a promise if one does not exist for ready event
    if (this.#readyPromise === undefined) {
      this.#readyPromise = new Promise((resolve) => (this.#readyResolve = resolve))
    }

    return this.#readyPromise
  }

  #bindWatchHandlers () {
    this.watcher.on('all', (event, path, stat) => {
      const relPath = serveUtils.relativePath(this.directory, path)

      if (!relPath) return // skips root directory

      switch (event) {
        case 'add':
        case 'addDir':
        case 'change':
          // Ensure relative path does not pass ignore function if set
          if (!this.#options.ignore || !this.#options.ignore(relPath, stat)) {
            this.files.set(relPath, stat)
          }
          break
        case 'unlink':
        case 'unlinkDir':
          this.files.delete(relPath)
          break
      }
    })

    // Bind 'ready' for when all files have been loaded
    this.watcher.once('ready', () => {
      // Resolve pending promise if one exists
      if (typeof this.#readyResolve === 'function') {
        this.#readyResolve()
        this.#readyResolve = null
      }

      // Mark instance as ready
      this.#readyPromise = true
    })
  }

  #middleware (req, res, next) {
    // Only process GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next()
    }

    // If root path is set, ensure it matches the request
    let path = req.path
    if (this.#options.root) {
      if (path.indexOf(this.#options.root) === 0) {
        // Re-map path for internal .get()
        path = path.replace(this.#options.root, '')
      } else {
        // Immediately proceed to next middleware otherwise
        return next()
      }
    }

    const stat = this.get(path)
    if (stat === undefined) {
      return next()
    }

    return this.handler(req, res, path, stat)
  }

  #setHeaders (req, res, stat) {
    // Always do external setHeaders function first,
    // in case it will overwrite the following default headers anyways
    if (this.#options.setHeaders) {
      this.#options.setHeaders(req, res)
    }

    if (this.#options.acceptRanges && !res.get('Accept-Ranges')) {
      res.header('Accept-Ranges', 'bytes')
    }

    if (this.#options.lastModified && !res.get('Last-Modified')) {
      const modified = stat.mtime.toUTCString()
      res.header('Last-Modified', modified)
    }

    if (this.#options.etag && !res.get('ETag')) {
      const val = etag(stat)
      res.header('ETag', val)
    }
  }

  #stream (req, res, path, stat, result) {
    const fullPath = this.directory + path
    const readStream = jetpack.createReadStream(fullPath, result.options)

    readStream.on('error', error => {
      readStream.destroy()
      logger.error(error)
    })

    // 2nd param will be set as Content-Length header (must be number)
    return res.stream(readStream, result.length)
  }

  get middleware () {
    return this.#middleware.bind(this)
  }
}

module.exports = ServeStaticQuick
