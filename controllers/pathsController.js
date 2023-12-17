const jetpack = require('fs-jetpack')
const path = require('path')
const config = require('./utils/ConfigManager')

const self = {}

self.uploads = path.resolve(config.uploads.folder)
self.chunks = config.uploads.chunksFolder
  ? path.resolve(config.uploads.chunksFolder)
  : path.join(self.uploads, 'chunks')
self.thumbs = path.join(self.uploads, 'thumbs')
self.zips = path.join(self.uploads, 'zips')

self.thumbPlaceholder = path.resolve(config.uploads.generateThumbs.placeholder || 'public/images/unavailable.png')

self.logs = path.resolve(config.logsFolder)

self.customPages = path.resolve('pages/custom')
self.dist = process.env.NODE_ENV === 'development'
  ? path.resolve('dist-dev')
  : path.resolve('dist')
self.public = path.resolve('public')

self.errorRoot = path.resolve(config.errorPages.rootDir)

const verify = [
  self.uploads,
  {
    path: self.chunks,
    criteria: { empty: true }
  },
  self.thumbs,
  self.zips,
  self.logs,
  self.customPages
]

if (['better-sqlite3', 'sqlite3'].includes(config.database.client)) {
  verify.unshift(path.resolve('database'))
}

self.initSync = () => {
  // Check & create directories (synchronous)
  for (const obj of verify) {
    if (typeof obj === 'object') {
      jetpack.dir(obj.path, obj.criteria)
    } else {
      jetpack.dir(obj)
    }
  }
}

module.exports = self
