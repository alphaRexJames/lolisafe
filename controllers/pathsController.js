const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const config = require('./../config')
const logger = require('./../logger')

const self = {}

// Promisify these fs functions
const fsFuncs = [
  'access',
  'copyFile',
  'lstat',
  'mkdir',
  'readdir',
  'readFile',
  'rename',
  'rmdir',
  'stat',
  'symlink',
  'unlink',
  'writeFile'
]

for (const fsFunc of fsFuncs) {
  self[fsFunc] = promisify(fs[fsFunc])
}

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
  self.chunks,
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
  for (const p of verify) {
    try {
      fs.accessSync(p)
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err
      } else {
        fs.mkdirSync(p)
        logger.log(`Created directory: ${p}`)
      }
    }
  }
}

self.purgeChunks = async () => {
  // Purge any leftover in chunks directory
  const uuidDirs = await self.readdir(self.chunks)
  await Promise.all(uuidDirs.map(async uuid => {
    const root = path.join(self.chunks, uuid)
    const chunks = await self.readdir(root)
    await Promise.all(chunks.map(chunk =>
      self.unlink(path.join(root, chunk))
    ))
    await self.rmdir(root)
  }))
  if (uuidDirs.length) {
    logger.log(`Purged ${uuidDirs.length} unfinished chunks`)
  }
}

module.exports = self
