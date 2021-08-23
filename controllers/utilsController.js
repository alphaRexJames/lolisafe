const { promisify } = require('util')
const fetch = require('node-fetch')
const ffmpeg = require('fluent-ffmpeg')
const path = require('path')
const sharp = require('sharp')
const si = require('systeminformation')
const paths = require('./pathsController')
const perms = require('./permissionController')
const apiErrorsHandler = require('./handlers/apiErrorsHandler')
const ClientError = require('./utils/ClientError')
const ServerError = require('./utils/ServerError')
const config = require('./../config')
const logger = require('./../logger')
const db = require('knex')(config.database)

const self = {
  clamscan: {
    instance: null,
    version: null,
    groupBypass: config.uploads.scan.groupBypass || null,
    whitelistExtensions: (Array.isArray(config.uploads.scan.whitelistExtensions) &&
      config.uploads.scan.whitelistExtensions.length)
      ? config.uploads.scan.whitelistExtensions
      : null,
    maxSize: (parseInt(config.uploads.scan.maxSize) * 1e6) || null
  },
  gitHash: null,
  idSet: null,

  idMaxTries: config.uploads.maxTries || 1,

  imageExts: ['.gif', '.jpeg', '.jpg', '.png', '.svg', '.tif', '.tiff', '.webp'],
  videoExts: ['.3g2', '.3gp', '.asf', '.avchd', '.avi', '.divx', '.evo', '.flv', '.h264', '.h265', '.hevc', '.m2p', '.m2ts', '.m4v', '.mk3d', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.mxf', '.ogg', '.ogv', '.ps', '.qt', '.rmvb', '.ts', '.vob', '.webm', '.wmv'],
  audioExts: ['.flac', '.mp3', '.wav', '.wma'],

  stripTagsBlacklistedExts: Array.isArray(config.uploads.stripTags.blacklistExtensions)
    ? config.uploads.stripTags.blacklistExtensions
    : [],

  thumbsSize: config.uploads.generateThumbs.size || 200,
  ffprobe: promisify(ffmpeg.ffprobe),

  albumsCache: {},
  timezoneOffset: new Date().getTimezoneOffset()
}

const statsData = {
  system: {
    title: 'System',
    cache: null,
    generating: false,
    generatedAt: 0
  },
  fileSystems: {
    title: 'File Systems',
    cache: null,
    generating: false,
    generatedAt: 0
  },
  uploads: {
    title: 'Uploads',
    cache: null,
    generating: false,
    generatedAt: 0
  },
  users: {
    title: 'Users',
    cache: null,
    generating: false,
    generatedAt: 0
  },
  albums: {
    title: 'Albums',
    cache: null,
    generating: false,
    generatedAt: 0
  }
}

const cloudflareAuth = config.cloudflare && config.cloudflare.zoneId &&
  (config.cloudflare.apiToken || config.cloudflare.userServiceKey ||
  (config.cloudflare.apiKey && config.cloudflare.email))

self.mayGenerateThumb = extname => {
  extname = extname.toLowerCase()
  return (config.uploads.generateThumbs.image && self.imageExts.includes(extname)) ||
    (config.uploads.generateThumbs.video && self.videoExts.includes(extname))
}

// Expand if necessary (should be case-insensitive)
const extPreserves = [
  /\.tar\.\w+/i // tarballs
]

self.extname = (filename, lower) => {
  // Always return blank string if the filename does not seem to have a valid extension
  // Files such as .DS_Store (anything that starts with a dot, without any extension after) will still be accepted
  if (!/\../.test(filename)) return ''

  let multi = ''
  let extname = ''

  // check for multi-archive extensions (.001, .002, and so on)
  if (/\.\d{3}$/.test(filename)) {
    multi = filename.slice(filename.lastIndexOf('.') - filename.length)
    filename = filename.slice(0, filename.lastIndexOf('.'))
  }

  // check against extensions that must be preserved
  for (const extPreserve of extPreserves) {
    const match = filename.match(extPreserve)
    if (match && match[0]) {
      extname = match[0]
      break
    }
  }

  if (!extname) {
    extname = filename.slice(filename.lastIndexOf('.') - filename.length)
  }

  const str = extname + multi
  return lower ? str.toLowerCase() : str
}

self.escape = string => {
  // MIT License
  // Copyright(c) 2012-2013 TJ Holowaychuk
  // Copyright(c) 2015 Andreas Lubbe
  // Copyright(c) 2015 Tiancheng "Timothy" Gu

  if (!string) return string

  const str = String(string)
  const match = /["'&<>]/.exec(str)

  if (!match) return str

  let escape
  let html = ''
  let index = 0
  let lastIndex = 0

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = '&quot;'
        break
      case 38: // &
        escape = '&amp;'
        break
      case 39: // '
        escape = '&#39;'
        break
      case 60: // <
        escape = '&lt;'
        break
      case 62: // >
        escape = '&gt;'
        break
      default:
        continue
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index)
    }

    lastIndex = index + 1
    html += escape
  }

  return lastIndex !== index
    ? html + str.substring(lastIndex, index)
    : html
}

self.stripIndents = string => {
  if (!string) return
  const result = string.replace(/^[^\S\n]+/gm, '')
  const match = result.match(/^[^\S\n]*(?=\S)/gm)
  const indent = match && Math.min(...match.map(el => el.length))
  if (indent) {
    const regexp = new RegExp(`^.{${indent}}`, 'gm')
    return result.replace(regexp, '')
  }
  return result
}

self.assertUser = async token => {
  const user = await db.table('users')
    .where('token', token)
    .first()
  if (user) {
    if (user.enabled === false || user.enabled === 0) {
      throw new ClientError('This account has been disabled.', { statusCode: 403 })
    }
    return user
  } else {
    throw new ClientError('Invalid token.', { statusCode: 403 })
  }
}

self.authorize = async req => {
  const token = req.headers.token
  if (token === undefined) {
    throw new ClientError('No token provided.', { statusCode: 403 })
  }
  return self.assertUser(token)
}

self.generateThumbs = async (name, extname, force) => {
  extname = extname.toLowerCase()
  const thumbname = path.join(paths.thumbs, name.slice(0, -extname.length) + '.png')

  try {
    // Check if thumbnail already exists
    try {
      const lstat = await paths.lstat(thumbname)
      if (lstat.isSymbolicLink()) {
        // Unlink if symlink (should be symlink to the placeholder)
        await paths.unlink(thumbname)
      } else if (!force) {
        // Continue only if it does not exist, unless forced to
        return true
      }
    } catch (error) {
      // Re-throw non-ENOENT error
      if (error.code !== 'ENOENT') throw error
    }

    // Full path to input file
    const input = path.join(paths.uploads, name)

    // If image extension
    if (self.imageExts.includes(extname)) {
      const resizeOptions = {
        width: self.thumbsSize,
        height: self.thumbsSize,
        fit: 'contain',
        background: {
          r: 0,
          g: 0,
          b: 0,
          alpha: 0
        }
      }
      const image = sharp(input)
      const metadata = await image.metadata()
      if (metadata.width > resizeOptions.width || metadata.height > resizeOptions.height) {
        await image
          .resize(resizeOptions)
          .toFile(thumbname)
      } else if (metadata.width === resizeOptions.width && metadata.height === resizeOptions.height) {
        await image
          .toFile(thumbname)
      } else {
        const x = resizeOptions.width - metadata.width
        const y = resizeOptions.height - metadata.height
        await image
          .extend({
            top: Math.floor(y / 2),
            bottom: Math.ceil(y / 2),
            left: Math.floor(x / 2),
            right: Math.ceil(x / 2),
            background: resizeOptions.background
          })
          .toFile(thumbname)
      }
    } else if (self.videoExts.includes(extname)) {
      const metadata = await self.ffprobe(input)

      const duration = parseInt(metadata.format.duration)
      if (isNaN(duration)) {
        throw new Error('File does not have valid duration metadata')
      }

      const videoStream = metadata.streams && metadata.streams.find(s => s.codec_type === 'video')
      if (!videoStream || !videoStream.width || !videoStream.height) {
        throw new Error('File does not have valid video stream metadata')
      }

      await new Promise((resolve, reject) => {
        ffmpeg(input)
          .on('error', error => reject(error))
          .on('end', () => resolve())
          .screenshots({
            folder: paths.thumbs,
            filename: name.slice(0, -extname.length) + '.png',
            timestamps: ['20%'],
            size: videoStream.width >= videoStream.height
              ? `${self.thumbsSize}x?`
              : `?x${self.thumbsSize}`
          })
      })
        .catch(error => error) // Error passthrough
        .then(async error => {
          // FFMPEG would just warn instead of exiting with errors when dealing with incomplete files
          // Sometimes FFMPEG would throw errors but actually somehow succeeded in making the thumbnails
          // (this could be a fallback mechanism of fluent-ffmpeg library instead)
          // So instead we check if the thumbnail exists to really make sure
          try {
            await paths.lstat(thumbname)
            return true
          } catch (err) {
            if (err.code === 'ENOENT') {
              throw error || new Error('FFMPEG exited with empty output file')
            } else {
              throw error || err
            }
          }
        })
    } else {
      return false
    }
  } catch (error) {
    logger.error(`[${name}]: generateThumbs(): ${error.toString().trim()}`)
    try {
      await paths.unlink(thumbname).catch(() => {}) // try to unlink incomplete thumbs first
      await paths.symlink(paths.thumbPlaceholder, thumbname)
      return true
    } catch (err) {
      logger.error(err)
      return false
    }
  }

  return true
}

self.stripTags = async (name, extname) => {
  extname = extname.toLowerCase()
  if (self.stripTagsBlacklistedExts.includes(extname)) return false

  const fullpath = path.join(paths.uploads, name)
  let tmpfile, isError

  try {
    if (self.imageExts.includes(extname)) {
      tmpfile = path.join(paths.uploads, `tmp-${name}`)
      await paths.rename(fullpath, tmpfile)
      await sharp(tmpfile)
        .toFile(fullpath)
    } else if (config.uploads.stripTags.video && self.videoExts.includes(extname)) {
      tmpfile = path.join(paths.uploads, `tmp-${name}`)
      await paths.rename(fullpath, tmpfile)
      await new Promise((resolve, reject) => {
        ffmpeg(tmpfile)
          .output(fullpath)
          .outputOptions([
            // Experimental.
            '-c copy',
            '-map_metadata:g -1:g',
            '-map_metadata:s:v -1:g',
            '-map_metadata:s:a -1:g'
          ])
          .on('error', error => reject(error))
          .on('end', () => resolve(true))
          .run()
      })
    } else {
      return false
    }
  } catch (error) {
    logger.error(`[${name}]: stripTags(): ${error.toString().trim()}`)
    isError = true
  }

  if (tmpfile) {
    try {
      await paths.unlink(tmpfile)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`[${name}]: stripTags(): ${error.toString().trim()}`)
      }
    }
  }

  if (isError) {
    throw new ServerError('An error occurred while stripping tags. The format may not be supported.')
  }

  return true
}

self.unlinkFile = async (filename, predb) => {
  try {
    await paths.unlink(path.join(paths.uploads, filename))
  } catch (error) {
    // Re-throw non-ENOENT error
    if (error.code !== 'ENOENT') throw error
  }

  const identifier = filename.split('.')[0]

  // Do not remove from identifiers cache on pre-db-deletion
  if (!predb && self.idSet) {
    self.idSet.delete(identifier)
    // logger.log(`Removed ${identifier} from identifiers cache (deleteFile)`)
  }

  const extname = self.extname(filename, true)
  if (self.imageExts.includes(extname) || self.videoExts.includes(extname)) {
    try {
      await paths.unlink(path.join(paths.thumbs, `${identifier}.png`))
    } catch (error) {
      // Re-throw non-ENOENT error
      if (error.code !== 'ENOENT') throw error
    }
  }
}

self.bulkDeleteFromDb = async (field, values, user) => {
  // Always return an empty array on failure
  if (!user || !['id', 'name'].includes(field) || !values.length) return []

  // SQLITE_LIMIT_VARIABLE_NUMBER, which defaults to 999
  // Read more: https://www.sqlite.org/limits.html
  const MAX_VARIABLES_CHUNK_SIZE = 999
  const chunks = []
  while (values.length) {
    chunks.push(values.splice(0, MAX_VARIABLES_CHUNK_SIZE))
  }

  const failed = []
  const ismoderator = perms.is(user, 'moderator')

  try {
    const unlinkeds = []
    const albumids = []

    await Promise.all(chunks.map(async chunk => {
      const files = await db.table('files')
        .whereIn(field, chunk)
        .where(function () {
          if (!ismoderator) {
            this.where('userid', user.id)
          }
        })

      // Push files that could not be found in db
      failed.push(...chunk.filter(value => !files.find(file => file[field] === value)))

      // Unlink all found files
      const unlinked = []

      await Promise.all(files.map(async file => {
        try {
          await self.unlinkFile(file.name, true)
          unlinked.push(file)
        } catch (error) {
          logger.error(error)
          failed.push(file[field])
        }
      }))

      if (!unlinked.length) return

      // Delete all unlinked files from db
      await db.table('files')
        .whereIn('id', unlinked.map(file => file.id))
        .del()
      self.invalidateStatsCache('uploads')

      if (self.idSet) {
        unlinked.forEach(file => {
          const identifier = file.name.split('.')[0]
          self.idSet.delete(identifier)
          // logger.log(`Removed ${identifier} from identifiers cache (bulkDeleteFromDb)`)
        })
      }

      // Push album ids
      unlinked.forEach(file => {
        if (file.albumid && !albumids.includes(file.albumid)) {
          albumids.push(file.albumid)
        }
      })

      // Push unlinked files
      unlinkeds.push(...unlinked)
    }))

    if (unlinkeds.length) {
      // Update albums if necessary, but do not wait
      if (albumids.length) {
        db.table('albums')
          .whereIn('id', albumids)
          .update('editedAt', Math.floor(Date.now() / 1000))
          .catch(logger.error)
        self.invalidateAlbumsCache(albumids)
      }

      // Purge Cloudflare's cache if necessary, but do not wait
      if (config.cloudflare.purgeCache) {
        self.purgeCloudflareCache(unlinkeds.map(file => file.name), true, true)
          .then(results => {
            for (const result of results) {
              if (result.errors.length) {
                result.errors.forEach(error => logger.error(`[CF]: ${error}`))
              }
            }
          })
      }
    }
  } catch (error) {
    logger.error(error)
  }

  return failed
}

self.purgeCloudflareCache = async (names, uploads, thumbs) => {
  const errors = []
  if (!cloudflareAuth) {
    errors.push('Cloudflare auth is incomplete or missing')
  }
  if (!Array.isArray(names) || !names.length) {
    errors.push('Names array is invalid or empty')
  }
  if (errors.length) {
    return [{ success: false, files: [], errors }]
  }

  let domain = config.domain
  if (!uploads) domain = config.homeDomain

  const thumbNames = []
  names = names.map(name => {
    if (uploads) {
      const url = `${domain}/${name}`
      const extname = self.extname(name)
      if (thumbs && self.mayGenerateThumb(extname)) {
        thumbNames.push(`${domain}/thumbs/${name.slice(0, -extname.length)}.png`)
      }
      return url
    } else {
      return name === 'home' ? domain : `${domain}/${name}`
    }
  })
  names.push(...thumbNames)

  // Split array into multiple arrays with max length of 30 URLs
  // https://api.cloudflare.com/#zone-purge-files-by-url
  const MAX_LENGTH = 30
  const MAX_TRIES = 3 // only for rate limit and unexpected errors
  const chunks = []
  while (names.length) {
    chunks.push(names.splice(0, MAX_LENGTH))
  }

  const url = `https://api.cloudflare.com/client/v4/zones/${config.cloudflare.zoneId}/purge_cache`
  const results = []

  await Promise.all(chunks.map(async chunk => {
    const result = {
      success: false,
      files: chunk,
      errors: []
    }

    const headers = {
      'Content-Type': 'application/json'
    }
    if (config.cloudflare.apiToken) {
      headers.Authorization = `Bearer ${config.cloudflare.apiToken}`
    } else if (config.cloudflare.userServiceKey) {
      headers['X-Auth-User-Service-Key'] = config.cloudflare.userServiceKey
    } else if (config.cloudflare.apiKey && config.cloudflare.email) {
      headers['X-Auth-Key'] = config.cloudflare.apiKey
      headers['X-Auth-Email'] = config.cloudflare.email
    }

    for (let i = 0; i < MAX_TRIES; i++) {
      const _log = message => {
        let prefix = `[CF]: ${i + 1}/${MAX_TRIES}: ${path.basename(chunk[0])}`
        if (chunk.length > 1) prefix += ',\u2026'
        logger.log(`${prefix}: ${message}`)
      }

      try {
        const purge = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({ files: chunk }),
          headers
        })
        const response = await purge.json()

        const hasErrorsArray = Array.isArray(response.errors) && response.errors.length
        if (hasErrorsArray) {
          const rateLimit = response.errors.find(error => /rate limit/i.test(error.message))
          if (rateLimit && i < MAX_TRIES - 1) {
            _log(`${rateLimit.code}: ${rateLimit.message}. Retrying in a minute\u2026`)
            await new Promise(resolve => setTimeout(resolve, 60000))
            continue
          }
        }

        result.success = response.success
        result.errors = hasErrorsArray
          ? response.errors.map(error => `${error.code}: ${error.message}`)
          : []
      } catch (error) {
        const errorString = error.toString()
        if (i < MAX_TRIES - 1) {
          _log(`${errorString}. Retrying in 5 seconds\u2026`)
          await new Promise(resolve => setTimeout(resolve, 5000))
          continue
        }

        result.errors = [errorString]
      }

      results.push(result)
      break
    }
  }))

  return results
}

self.bulkDeleteExpired = async (dryrun, verbose) => {
  const timestamp = Date.now() / 1000
  const fields = ['id']
  if (verbose) fields.push('name')
  const sudo = { username: 'root' }

  const result = {}
  result.expired = await db.table('files')
    .where('expirydate', '<=', timestamp)
    .select(fields)

  if (!dryrun) {
    // Make a shallow copy
    const field = fields[0]
    const values = result.expired.slice().map(row => row[field])
    result.failed = await self.bulkDeleteFromDb(field, values, sudo)
  }

  return result
}

self.invalidateAlbumsCache = albumids => {
  for (const albumid of albumids) {
    delete self.albumsCache[albumid]
    delete self.albumsCache[`${albumid}-nojs`]
  }
}

self.invalidateStatsCache = type => {
  if (!['albums', 'users', 'uploads'].includes(type)) return
  statsData[type].cache = null
}

self.stats = async (req, res, next) => {
  try {
    const user = await self.authorize(req)

    const isadmin = perms.is(user, 'admin')
    if (!isadmin) throw new ClientError('', { statusCode: 403 })

    const hrstart = process.hrtime()
    const stats = {}
    Object.keys(statsData).forEach(key => {
      // Pre-assign object keys to fix their display order
      stats[statsData[key].title] = {}
    })

    const os = await si.osInfo()

    const getSystemInfo = async () => {
      const data = statsData.system

      if (!data.cache && data.generating) {
        stats[data.title] = false
      } else if (((Date.now() - data.generatedAt) <= 1000) || data.generating) {
        // Use cache for 1000 ms (1 second)
        stats[data.title] = data.cache
      } else {
        data.generating = true
        data.generatedAt = Date.now()

        const currentLoad = await si.currentLoad()
        const mem = await si.mem()
        const time = si.time()
        const nodeUptime = process.uptime()

        if (self.clamscan.instance) {
          try {
            self.clamscan.version = await self.clamscan.instance.get_version().then(s => s.trim())
          } catch (error) {
            logger.error(error)
            self.clamscan.version = 'Errored when querying version.'
          }
        }

        stats[data.title] = {
          Platform: `${os.platform} ${os.arch}`,
          Distro: `${os.distro} ${os.release}`,
          Kernel: os.kernel,
          Scanner: self.clamscan.version || 'N/A',
          'CPU Load': `${currentLoad.currentLoad.toFixed(1)}%`,
          'CPUs Load': currentLoad.cpus.map(cpu => `${cpu.load.toFixed(1)}%`).join(', '),
          'System Memory': {
            value: {
              used: mem.active,
              total: mem.total
            },
            type: 'byteUsage'
          },
          'Memory Usage': {
            value: process.memoryUsage().rss,
            type: 'byte'
          },
          'System Uptime': {
            value: time.uptime,
            type: 'uptime'
          },
          'Node.js': `${process.versions.node}`,
          'Service Uptime': {
            value: Math.floor(nodeUptime),
            type: 'uptime'
          }
        }

        // Update cache
        data.cache = stats[data.title]
        data.generating = false
      }
    }

    const getFileSystems = async () => {
      const data = statsData.fileSystems

      if (!data.cache && data.generating) {
        stats[data.title] = false
      } else if (((Date.now() - data.generatedAt) <= 60000) || data.generating) {
        // Use cache for 60000 ms (60 seconds)
        stats[data.title] = data.cache
      } else {
        data.generating = true
        data.generatedAt = Date.now()

        stats[data.title] = {}

        const fsSize = await si.fsSize()
        for (const fs of fsSize) {
          const obj = {
            value: {
              total: fs.size,
              used: fs.used
            },
            type: 'byteUsage'
          }
          // "available" is a new attribute in systeminformation v5, only tested on Linux,
          // so add an if-check just in case its availability is limited in other platforms
          if (typeof fs.available === 'number') {
            obj.value.available = fs.available
          }
          stats[data.title][`${fs.fs} (${fs.type}) on ${fs.mount}`] = obj
        }

        // Update cache
        data.cache = stats[data.title]
        data.generating = false
      }
    }

    const getUploadsStats = async () => {
      const data = statsData.uploads

      if (!data.cache && data.generating) {
        stats[data.title] = false
      } else if (data.cache) {
        // Cache will be invalidated with self.invalidateStatsCache() after any related operations
        stats[data.title] = data.cache
      } else {
        data.generating = true
        data.generatedAt = Date.now()

        stats[data.title] = {
          Total: 0,
          Images: 0,
          Videos: 0,
          Audios: 0,
          Others: 0,
          Temporary: 0,
          'Size in DB': {
            value: 0,
            type: 'byte'
          }
        }

        const getTotalCountAndSize = async () => {
          const uploads = await db.table('files')
            .select('size')
          stats[data.title].Total = uploads.length
          stats[data.title]['Size in DB'].value = uploads.reduce((acc, upload) => acc + parseInt(upload.size), 0)
        }

        const getImagesCount = async () => {
          stats[data.title].Images = await db.table('files')
            .where(function () {
              for (const ext of self.imageExts) {
                this.orWhere('name', 'like', `%${ext}`)
              }
            })
            .count('id as count')
            .then(rows => rows[0].count)
        }

        const getVideosCount = async () => {
          stats[data.title].Videos = await db.table('files')
            .where(function () {
              for (const ext of self.videoExts) {
                this.orWhere('name', 'like', `%${ext}`)
              }
            })
            .count('id as count')
            .then(rows => rows[0].count)
        }

        const getAudiosCount = async () => {
          stats[data.title].Audios = await db.table('files')
            .where(function () {
              for (const ext of self.audioExts) {
                this.orWhere('name', 'like', `%${ext}`)
              }
            })
            .count('id as count')
            .then(rows => rows[0].count)
        }

        const getOthersCount = async () => {
          stats[data.title].Temporary = await db.table('files')
            .whereNotNull('expirydate')
            .count('id as count')
            .then(rows => rows[0].count)
        }

        await Promise.all([
          getTotalCountAndSize(),
          getImagesCount(),
          getVideosCount(),
          getAudiosCount(),
          getOthersCount()
        ])

        stats[data.title].Others = stats[data.title].Total -
            stats[data.title].Images -
            stats[data.title].Videos -
            stats[data.title].Audios

        // Update cache
        data.cache = stats[data.title]
        data.generating = false
      }
    }

    const getUsersStats = async () => {
      const data = statsData.users

      if (!data.cache && data.generating) {
        stats[data.title] = false
      } else if (data.cache) {
        // Cache will be invalidated with self.invalidateStatsCache() after any related operations
        stats[data.title] = data.cache
      } else {
        data.generating = true
        data.generatedAt = Date.now()

        stats[data.title] = {
          Total: 0,
          Disabled: 0
        }

        const permissionKeys = Object.keys(perms.permissions).reverse()
        permissionKeys.forEach(p => {
          stats[data.title][p] = 0
        })

        const users = await db.table('users')
        stats[data.title].Total = users.length
        for (const user of users) {
          if (user.enabled === false || user.enabled === 0) {
            stats[data.title].Disabled++
          }

          user.permission = user.permission || 0
          for (const p of permissionKeys) {
            if (user.permission === perms.permissions[p]) {
              stats[data.title][p]++
              break
            }
          }
        }

        // Update cache
        data.cache = stats[data.title]
        data.generating = false
      }
    }

    const getAlbumsStats = async () => {
      const data = statsData.albums

      if (!data.cache && data.generating) {
        stats[data.title] = false
      } else if (data.cache) {
        // Cache will be invalidated with self.invalidateStatsCache() after any related operations
        stats[data.title] = data.cache
      } else {
        data.generating = true
        data.generatedAt = Date.now()

        stats[data.title] = {
          Total: 0,
          Disabled: 0,
          Public: 0,
          Downloadable: 0,
          'ZIP Generated': 0
        }

        const albums = await db.table('albums')
        stats[data.title].Total = albums.length

        const activeAlbums = []
        for (const album of albums) {
          if (!album.enabled) {
            stats[data.title].Disabled++
            continue
          }
          activeAlbums.push(album.id)
          if (album.download) stats[data.title].Downloadable++
          if (album.public) stats[data.title].Public++
          if (album.zipGeneratedAt) stats[data.title]['ZIP Generated']++
        }

        stats[data.title]['Files in albums'] = await db.table('files')
          .whereIn('albumid', activeAlbums)
          .count('id as count')
          .then(rows => rows[0].count)

        // Update cache
        data.cache = stats[data.title]
        data.generating = false
      }
    }

    await Promise.all([
      getSystemInfo(),
      getFileSystems(),
      getUploadsStats(),
      getUsersStats(),
      getAlbumsStats()
    ])

    return res.json({ success: true, stats, hrtime: process.hrtime(hrstart) })
  } catch (error) {
    // Reset generating state when encountering any errors
    Object.keys(statsData).forEach(key => {
      statsData[key].generating = false
    })
    return apiErrorsHandler(error)
  }
}

module.exports = self
