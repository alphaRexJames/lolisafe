const jetpack = require('fs-jetpack')
const si = require('systeminformation')
const paths = require('./../pathsController')
const perms = require('./../permissionController')
const Constants = require('./Constants')
const ScannerManager = require('./ScannerManager')
const logger = require('./../../logger')

const self = {
  _buildExtsRegex: exts => {
    const str = exts.map(ext => ext.substring(1)).join('|')
    return new RegExp(`\\.(${str})$`, 'i')
  },

  Type: Object.freeze({
    // Should contain key value: string | number
    // Client is expected to automatically assume this type
    // if "type" attribute is not specified (number should also be localized)
    AUTO: 'auto',
    // Should contain key value: number
    UPTIME: 'uptime',
    // Should contain key value: number
    BYTE: 'byte',
    // Should contain key value: { used: number, total: number }
    BYTE_USAGE: 'byteUsage',
    // Should contain key value: number
    TEMP_CELSIUS: 'tempC',
    // Should contain key data: Array<{ key: string, value: number | string }>
    // and optionally a count/total
    DETAILED: 'detailed',
    // Should contain key value: null
    // May consider still displaying entries with this type in the frontend,
    // but mark as unavailable explicitly due to backend lacking the capabilities
    UNAVAILABLE: 'unavailable',
    // Hidden type should be skipped during iteration, can contain anything
    // These should be treated on a case by case basis on the frontend
    HIDDEN: 'hidden'
  }),

  cachedStats: {}
}

self.imageExtsRegex = self._buildExtsRegex(Constants.IMAGE_EXTS)
self.videoExtsRegex = self._buildExtsRegex(Constants.VIDEO_EXTS)
self.audioExtsRegex = self._buildExtsRegex(Constants.AUDIO_EXTS)

self.invalidateStatsCache = type => {
  if (!self.cachedStats[type]) return
  self.cachedStats[type].cache = null
}

self.getSystemInfo = async () => {
  const os = await si.osInfo()
  const cpu = await si.cpu()
  const cpuTemperature = await si.cpuTemperature()
  const currentLoad = await si.currentLoad()
  const mem = await si.mem()
  const time = si.time()

  return {
    Platform: `${os.platform} ${os.arch}`,
    Distro: `${os.distro} ${os.release}`,
    Kernel: os.kernel,
    CPU: `${cpu.cores} \u00d7 ${cpu.manufacturer} ${cpu.brand} @ ${cpu.speed.toFixed(2)}GHz`,
    'CPU Load': `${currentLoad.currentLoad.toFixed(1)}%`,
    'CPUs Load': currentLoad.cpus.map(cpu => `${cpu.load.toFixed(1)}%`).join(', '),
    'CPU Temperature': cpuTemperature && typeof cpuTemperature.main === 'number'
      ? {
          value: cpuTemperature.main,
          // Temperature value from this library is hard-coded to Celsius
          type: self.Type.TEMP_CELSIUS
        }
      : { value: null, type: self.Type.UNAVAILABLE },
    Memory: {
      value: {
        used: mem.active,
        total: mem.total
      },
      type: self.Type.BYTE_USAGE
    },
    Swap: mem && typeof mem.swaptotal === 'number' && mem.swaptotal > 0
      ? {
          value: {
            used: mem.swapused,
            total: mem.swaptotal
          },
          type: self.Type.BYTE_USAGE
        }
      : { value: null, type: self.Type.UNAVAILABLE },
    Uptime: {
      value: Math.floor(time.uptime),
      type: self.Type.UPTIME
    }
  }
}

self.getServiceInfo = async () => {
  const nodeUptime = process.uptime()

  return {
    'Node.js': `${process.versions.node}`,
    Scanner: ScannerManager.instance
      ? ScannerManager.version
      : { value: null, type: self.Type.UNAVAILABLE },
    'Memory Usage': {
      value: process.memoryUsage().rss,
      type: self.Type.BYTE
    },
    Uptime: {
      value: Math.floor(nodeUptime),
      type: self.Type.UPTIME
    }
  }
}

self.getFileSystems = async () => {
  const fsSize = await si.fsSize()

  const stats = {}

  for (const fs of fsSize) {
    const obj = {
      value: {
        total: fs.size,
        used: fs.used
      },
      type: self.Type.BYTE_USAGE
    }
    // "available" is a new attribute in systeminformation v5, only tested on Linux,
    // so add an if-check just in case its availability is limited in other platforms
    if (typeof fs.available === 'number') {
      obj.value.available = fs.available
    }
    stats[`${fs.fs} (${fs.type}) on ${fs.mount}`] = obj
  }

  return stats
}

self.getUploadsStats = async db => {
  const uploads = await db.table('files')
    .select('name', 'type', 'size', 'expirydate')

  const stats = {
    Total: uploads.length,
    Images: {
      value: 0,
      action: 'filter-uploads-with',
      actionData: 'is:image'
    },
    Videos: {
      value: 0,
      action: 'filter-uploads-with',
      actionData: 'is:video'
    },
    Audios: {
      value: 0,
      action: 'filter-uploads-with',
      actionData: 'is:audio'
    },
    Others: {
      value: 0,
      action: 'filter-uploads-with',
      actionData: '-is:image -is:video -is:audio'
    },
    Temporary: {
      value: 0,
      action: 'filter-uploads-with',
      actionData: 'expiry:>0'
    },
    'Size in DB': {
      value: 0,
      type: self.Type.BYTE
    },
    'Mime Types': {
      value: {},
      valueAction: 'filter-uploads-by-type',
      type: self.Type.DETAILED
    }
  }

  // Mime types container
  const types = {}

  for (const upload of uploads) {
    if (self.imageExtsRegex.test(upload.name)) {
      stats.Images.value++
    } else if (self.videoExtsRegex.test(upload.name)) {
      stats.Videos.value++
    } else if (self.audioExtsRegex.test(upload.name)) {
      stats.Audios.value++
    } else {
      stats.Others.value++
    }

    if (upload.expirydate !== null) {
      stats.Temporary.value++
    }

    stats['Size in DB'].value += parseInt(upload.size)

    if (types[upload.type] === undefined) {
      types[upload.type] = 0
    }

    types[upload.type]++
  }

  // Sort mime types by count, and alphabetical ordering of the types
  stats['Mime Types'].value = Object.keys(types)
    .sort((a, b) => {
      return types[b] - types[a] || a.localeCompare(b)
    })
    .reduce((acc, type) => {
      acc[type] = types[type]
      return acc
    }, {})

  return stats
}

self.getUsersStats = async db => {
  const stats = {
    Total: 0,
    Disabled: 0,
    Usergroups: {
      value: {},
      type: self.Type.DETAILED
    }
  }

  const permissionKeys = Object.keys(perms.permissions).reverse()
  permissionKeys.forEach(p => {
    stats.Usergroups.value[p] = 0
  })

  const users = await db.table('users')
  stats.Total = users.length
  for (const user of users) {
    if (user.enabled === false || user.enabled === 0) {
      stats.Disabled++
    }

    user.permission = user.permission || 0
    for (const p of permissionKeys) {
      if (user.permission === perms.permissions[p]) {
        stats.Usergroups.value[p]++
        break
      }
    }
  }

  return stats
}

self.getAlbumsStats = async db => {
  const stats = {
    Total: 0,
    Disabled: 0,
    Public: 0,
    Downloadable: 0,
    'ZIP Generated': 0
  }

  const albums = await db.table('albums')
  stats.Total = albums.length

  const activeAlbums = []
  for (const album of albums) {
    if (!album.enabled) {
      stats.Disabled++
      continue
    }
    activeAlbums.push(album.id)
    if (album.download) stats.Downloadable++
    if (album.public) stats.Public++
  }

  const files = await jetpack.listAsync(paths.zips)
  if (Array.isArray(files)) {
    stats['ZIP Generated'] = files.length
  }

  stats['Files in albums'] = await db.table('files')
    .whereIn('albumid', activeAlbums)
    .count('id as count')
    .then(rows => rows[0].count)

  return stats
}

self.statGenerators = {
  system: {
    title: 'System',
    funct: self.getSystemInfo,
    maxAge: 1000
  },
  service: {
    title: 'Service',
    funct: self.getServiceInfo,
    maxAge: 1000
  },
  fileSystems: {
    title: 'File Systems',
    funct: self.getFileSystems,
    maxAge: 1000
  },
  uploads: {
    title: 'Uploads',
    funct: self.getUploadsStats
  },
  users: {
    title: 'Users',
    funct: self.getUsersStats
  },
  albums: {
    title: 'Albums',
    funct: self.getAlbumsStats
  }
}

self.statNames = Object.keys(self.statGenerators)

self.generateStats = async (db, categories, force = false) => {
  let generators
  if (Array.isArray(categories) && categories.length) {
    generators = categories.map(category => {
      return [category, self.statGenerators[category]]
    })
  } else {
    generators = Object.entries(self.statGenerators)
  }

  await Promise.all(generators.map(async ([name, opts]) => {
    if (!self.cachedStats[name]) {
      self.cachedStats[name] = {
        cache: null,
        generating: false,
        generatedOn: 0
      }
    }

    // Skip if still generating
    if (self.cachedStats[name].generating) return

    // Skip if cache already exists, and satisfies the following...
    if (self.cachedStats[name].cache) {
      if (typeof opts.maxAge === 'number') {
        // maxAge is configured, is not forced to re-generated, and cache still satisfies it
        if (!force && Date.now() - self.cachedStats[name].generatedOn <= opts.maxAge) {
          return
        }
      } else if (!force) {
        // Otherwise, maxAge is not configured, and is not forced to re-generate
        return
      }
    }

    self.cachedStats[name].generating = true

    logger.debug(`${name}: Generating\u2026`)
    self.cachedStats[name].cache = await opts.funct(db)
      .catch(error => {
        logger.error(error)
        return null
      })

    self.cachedStats[name].generatedOn = Date.now()
    self.cachedStats[name].generating = false
    logger.debug(`${name}: OK`)
  }))
}

module.exports = self
