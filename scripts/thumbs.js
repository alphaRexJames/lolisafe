const path = require('path')
const paths = require('../controllers/pathsController')
const utils = require('../controllers/utilsController')

const self = {
  mode: null,
  force: null,
  verbose: null,
  cfcache: null
}

self.mayGenerateThumb = extname => {
  return ([1, 3].includes(self.mode) && utils.imageExts.includes(extname)) ||
    ([2, 3].includes(self.mode) && utils.videoExts.includes(extname))
}

self.getFiles = async directory => {
  const names = await paths.readdir(directory)
  const files = []
  for (const name of names) {
    const lstat = await paths.lstat(path.join(directory, name))
    if (lstat.isFile() && !name.startsWith('.'))
      files.push(name)
  }
  return files
}

;(async () => {
  const location = process.argv[1].replace(process.cwd() + '/', '')
  const args = process.argv.slice(2)

  self.mode = parseInt(args[0])
  self.force = parseInt(args[1]) || 0
  self.verbose = parseInt(args[2]) || 0
  self.cfcache = parseInt(args[3]) || 0

  if (![1, 2, 3].includes(self.mode) ||
    ![0, 1].includes(self.force) ||
    ![0, 1].includes(self.verbose) ||
    args.includes('--help') ||
    args.includes('-h'))
    return console.log(utils.stripIndents(`
      Generate thumbnails.

      Usage  :
      node ${location} <mode=1|2|3> [force=0|1] [verbose=0|1] [cfcache=0|1]

      mode   : 1 = images only, 2 = videos only, 3 = both images and videos
      force  : 0 = no force (default), 1 = overwrite existing thumbnails
      verbose: 0 = only print missing thumbs (default), 1 = print all
      cfcache: 0 = do not clear cloudflare cache (default), 1 = clear cloudflare cache
    `))

  console.log('Looking through existing thumbnails\u2026')
  const uploads = await self.getFiles(paths.uploads)
  let thumbs = await self.getFiles(paths.thumbs)
  thumbs = thumbs.map(thumb => {
    const extname = path.extname(thumb)
    return thumb.slice(0, -extname.length)
  })

  console.log(`Found ${thumbs.length} existing thumbnails (may include placeholder symlinks).`)
  if (!self.verbose)
    console.log('Verbose logging disabled! Please be patient, this script may appear to be frozen but is actually working in the background.')

  const succeeded = []
  let error = 0
  let skipped = 0
  for (const upload of uploads) {
    const extname = utils.extname(upload)
    const basename = upload.slice(0, -extname.length)

    if (thumbs.includes(basename) && !self.force) {
      if (self.verbose) console.log(`${upload}: thumb exists.`)
      skipped++
    } else if (!self.mayGenerateThumb(extname)) {
      if (self.verbose) console.log(`${upload}: extension skipped.`)
      skipped++
    } else {
      const start = Date.now()
      const generated = await utils.generateThumbs(upload, extname, self.force)
      console.log(`${upload}: ${(Date.now() - start) / 1000}s: ${generated ? 'OK' : 'ERROR'}`)
      generated ? succeeded.push(upload) : error++
    }
  }
  console.log(`Success: ${succeeded.length}\nError: ${error}\nSkipped: ${skipped}`)

  if (self.cfcache && succeeded.length) {
    console.log('Purging Cloudflare\'s cache...')
    const results = await utils.purgeCloudflareCache(succeeded.map(name => {
      const extname = utils.extname(name)
      return `thumbs/${name.slice(0, -extname.length)}.png`
    }), true, false)
    for (let i = 0; i < results.length; i++) {
      if (results[i].errors.length)
        results[i].errors.forEach(error => console.error(`CF: ${error}`))
      console.log(`Status [${i}]: ${results[i].success ? 'OK' : 'ERROR'}`)
    }
  }
})()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
