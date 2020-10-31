const bodyParser = require('body-parser')
const clamd = require('clamdjs')
const contentDisposition = require('content-disposition')
const express = require('express')
const helmet = require('helmet')
const nunjucks = require('nunjucks')
const path = require('path')
const RateLimit = require('express-rate-limit')
const readline = require('readline')
const serveStatic = require('serve-static')
const config = require('./config')
const logger = require('./logger')
const versions = require('./src/versions')
const safe = express()

logger.log('Starting lolisafe\u2026')

process.on('uncaughtException', error => {
  logger.error(error, { prefix: 'Uncaught Exception: ' })
})
process.on('unhandledRejection', error => {
  logger.error(error, { prefix: 'Unhandled Rejection (Promise): ' })
})

const paths = require('./controllers/pathsController')
const utils = require('./controllers/utilsController')

const album = require('./routes/album')
const api = require('./routes/api')
const nojs = require('./routes/nojs')

const db = require('knex')(config.database)

safe.use(helmet({
  contentSecurityPolicy: false,
  hsts: false
}))

if (config.hsts instanceof Object && Object.keys(config.hsts).length) {
  safe.use(helmet.hsts(config.hsts))
}

if (config.trustProxy) {
  safe.set('trust proxy', 1)
}

// https://mozilla.github.io/nunjucks/api.html#configure
nunjucks.configure('views', {
  autoescape: true,
  express: safe,
  noCache: process.env.NODE_ENV === 'development'
})
safe.set('view engine', 'njk')
safe.enable('view cache')

// Configure rate limits
if (Array.isArray(config.rateLimits) && config.rateLimits.length) {
  for (const rateLimit of config.rateLimits) {
    const limiter = new RateLimit(rateLimit.config)
    for (const route of rateLimit.routes) {
      safe.use(route, limiter)
    }
  }
}

safe.use(bodyParser.urlencoded({ extended: true }))
safe.use(bodyParser.json())

const cdnPages = [...config.pages]
let setHeaders = res => {
  res.set('Access-Control-Allow-Origin', '*')
}

const initServeStaticUploads = (opts = {}) => {
  if (config.setContentDisposition) {
    opts.preSetHeaders = async (res, req, path, stat) => {
      try {
        // Do only if accessing files from uploads' root directory (i.e. not thumbs, etc.)
        // and only if they are GET requests
        const relpath = path.replace(paths.uploads, '')
        if (relpath.indexOf('/', 1) === -1 && req.method === 'GET') {
          const name = relpath.substring(1)
          const file = await db.table('files')
            .where('name', name)
            .select('original')
            .first()
          res.set('Content-Disposition', contentDisposition(file.original, { type: 'inline' }))
        }
      } catch (error) {
        logger.error(error)
      }
    }
    // serveStatic is just a modified express/serve-static module that allows specifying
    // an async setHeaders function by the name preSetHeaders.
    // The module will wait for the said function before creating send stream to client.
    safe.use('/', serveStatic(paths.uploads, opts))
  } else {
    safe.use('/', express.static(paths.uploads, opts))
  }
}

// Cache control (safe.fiery.me)
if (config.cacheControl) {
  const cacheControls = {
    // max-age: 6 months
    static: 'public, max-age=15778800, immutable',
    // s-max-age: 6 months (only cache in CDN)
    cdn: 's-max-age=15778800, proxy-revalidate',
    // validate cache's validity before using them (soft cache)
    validate: 'no-cache',
    // do not use cache at all
    disable: 'no-store'
  }

  // By default soft cache everything
  safe.use('/', (req, res, next) => {
    res.set('Cache-Control', cacheControls.validate)
    next()
  })

  // If using CDN, cache public pages in CDN
  if (config.cacheControl !== 2) {
    cdnPages.push('api/check')
    for (const page of cdnPages) {
      safe.use(`/${page === 'home' ? '' : page}`, (req, res, next) => {
        res.set('Cache-Control', cacheControls.cdn)
        next()
      })
    }
  }

  // If serving uploads with node
  if (config.serveFilesWithNode) {
    initServeStaticUploads({
      setHeaders: res => {
        res.set('Access-Control-Allow-Origin', '*')
        // If using CDN, cache uploads in CDN as well
        // Use with cloudflare.purgeCache enabled in config file
        if (config.cacheControl !== 2) {
          res.set('Cache-Control', cacheControls.cdn)
        }
      }
    })
  }

  // Function for static assets.
  // This requires the assets to use version in their query string,
  // as they will be cached by clients for a very long time.
  setHeaders = res => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Cache-Control', cacheControls.static)
  }

  // Consider album ZIPs static as well, since they use version in their query string
  safe.use(['/api/album/zip'], (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    const versionString = parseInt(req.query.v)
    if (versionString > 0) {
      res.set('Cache-Control', cacheControls.static)
    } else {
      res.set('Cache-Control', cacheControls.disable)
    }
    next()
  })
} else if (config.serveFilesWithNode) {
  initServeStaticUploads()
}

// Static assets
safe.use('/', express.static(paths.public, { setHeaders }))
safe.use('/', express.static(paths.dist, { setHeaders }))

safe.use('/', album)
safe.use('/', nojs)
safe.use('/api', api)

;(async () => {
  try {
    // Init database
    await require('./database/db.js')(db)

    // Verify paths, create missing ones, clean up temp ones
    await paths.init()

    if (!Array.isArray(config.pages) || !config.pages.length) {
      logger.error('Config file does not have any frontend pages enabled')
      process.exit(1)
    }

    // Re-map version strings if cache control is enabled (safe.fiery.me)
    utils.versionStrings = {}
    if (config.cacheControl) {
      for (const type in versions) {
        utils.versionStrings[type] = `?_=${versions[type]}`
      }
      if (versions['1']) {
        utils.clientVersion = versions['1']
      }
    }

    // Cookie Policy
    if (config.cookiePolicy) {
      config.pages.push('cookiepolicy')
    }

    // Check for custom pages, otherwise fallback to Nunjucks templates
    for (const page of config.pages) {
      const customPage = path.join(paths.customPages, `${page}.html`)
      if (!await paths.access(customPage).catch(() => true)) {
        safe.get(`/${page === 'home' ? '' : page}`, (req, res, next) => res.sendFile(customPage))
      } else if (page === 'home') {
        safe.get('/', (req, res, next) => res.render(page, {
          config,
          versions: utils.versionStrings,
          gitHash: utils.gitHash
        }))
      } else {
        safe.get(`/${page}`, (req, res, next) => res.render(page, {
          config,
          versions: utils.versionStrings
        }))
      }
    }

    // Error pages
    safe.use((req, res, next) => {
      res.setHeader('Cache-Control', 'no-store')
      res.status(404).sendFile(path.join(paths.errorRoot, config.errorPages[404]))
    })

    safe.use((error, req, res, next) => {
      logger.error(error)
      res.setHeader('Cache-Control', 'no-store')
      res.status(500).sendFile(path.join(paths.errorRoot, config.errorPages[500]))
    })

    // Git hash
    if (config.showGitHash) {
      utils.gitHash = await new Promise((resolve, reject) => {
        require('child_process').exec('git rev-parse HEAD', (error, stdout) => {
          if (error) return reject(error)
          resolve(stdout.replace(/\n$/, ''))
        })
      })
      logger.log(`Git commit: ${utils.gitHash}`)
    }

    // Clamd scanner
    if (config.uploads.scan && config.uploads.scan.enabled) {
      const { ip, port } = config.uploads.scan
      const version = await clamd.version(ip, port)
      logger.log(`${ip}:${port} ${version}`)

      utils.clamd.scanner = clamd.createScanner(ip, port)
      if (!utils.clamd.scanner) {
        throw 'Could not create clamd scanner'
      }
    }

    // Cache file identifiers
    if (config.uploads.cacheFileIdentifiers) {
      utils.idSet = await db.table('files')
        .select('name')
        .then(rows => {
          return new Set(rows.map(row => row.name.split('.')[0]))
        })
      logger.log(`Cached ${utils.idSet.size} file identifiers`)
    }

    // Binds Express to port
    await new Promise(resolve => safe.listen(config.port, () => resolve()))
    logger.log(`lolisafe started on port ${config.port}`)

    // Cache control (safe.fiery.me)
    // Purge Cloudflare cache
    if (config.cacheControl && config.cacheControl !== 2) {
      if (config.cloudflare.purgeCache) {
        logger.log('Cache control enabled, purging Cloudflare\'s cache...')
        const results = await utils.purgeCloudflareCache(cdnPages)
        let errored = false
        let succeeded = 0
        for (const result of results) {
          if (result.errors.length) {
            if (!errored) errored = true
            result.errors.forEach(error => logger.log(`[CF]: ${error}`))
            continue
          }
          succeeded += result.files.length
        }
        if (!errored) {
          logger.log(`Successfully purged ${succeeded} cache`)
        }
      } else {
        logger.log('Cache control enabled without Cloudflare\'s cache purging')
      }
    }

    // Temporary uploads (only check for expired uploads if config.uploads.temporaryUploadsInterval is also set)
    if (Array.isArray(config.uploads.temporaryUploadAges) &&
      config.uploads.temporaryUploadAges.length &&
      config.uploads.temporaryUploadsInterval) {
      let temporaryUploadsInProgress = false
      const temporaryUploadCheck = async () => {
        if (temporaryUploadsInProgress) return

        temporaryUploadsInProgress = true
        try {
          const result = await utils.bulkDeleteExpired()

          if (result.expired.length) {
            let logMessage = `Expired uploads: ${result.expired.length} deleted`
            if (result.failed.length) {
              logMessage += `, ${result.failed.length} errored`
            }

            logger.log(logMessage)
          }
        } catch (error) {
          // Simply print-out errors, then continue
          logger.error(error)
        }

        temporaryUploadsInProgress = false
      }

      temporaryUploadCheck()
      setInterval(temporaryUploadCheck, config.uploads.temporaryUploadsInterval)
    }

    // NODE_ENV=development yarn start
    if (process.env.NODE_ENV === 'development') {
      // Add readline interface to allow evaluating arbitrary JavaScript from console
      readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: ''
      }).on('line', line => {
        try {
          if (line === 'rs') return
          if (line === '.exit') return process.exit(0)
          // eslint-disable-next-line no-eval
          logger.log(eval(line))
        } catch (error) {
          logger.error(error.toString())
        }
      }).on('SIGINT', () => {
        process.exit(0)
      })
      logger.log('DEVELOPMENT MODE: Disabled Nunjucks caching & enabled readline interface')
    }
  } catch (error) {
    logger.error(error)
    process.exit(1)
  }
})()
