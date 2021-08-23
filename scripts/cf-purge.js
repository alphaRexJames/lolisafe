const utils = require('./../controllers/utilsController')

;(async () => {
  const location = process.argv[1].replace(process.cwd() + '/', '')
  const args = process.argv.slice(2)

  if (!args.length || args.includes('--help') || args.includes('-h')) {
    return console.log(utils.stripIndents(`
      Purge Cloudflare's cache.

      Usage:
      node ${location} ...filename

      filename:
      Upload names separated by space (will automatically include their thumbs if available).
    `).trim())
  }

  const results = await utils.purgeCloudflareCache(args, true, true)

  for (const result of results) {
    if (result.errors.length) {
      result.errors.forEach(error => console.error(`CF: ${error}`))
    } else {
      console.log(`URLs:\n${result.files.join('\n')}\n\nSuccess: ${result.success}`)
    }
  }
})()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
