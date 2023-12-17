const NodeClam = require('clamscan')
const config = require('./ConfigManager')
const logger = require('./../../logger')

const self = {
  instance: null,
  version: null,
  groupBypass: config.uploads.scan.groupBypass || null,
  whitelistExtensions:
    (Array.isArray(config.uploads.scan.whitelistExtensions) && config.uploads.scan.whitelistExtensions.length)
      ? config.uploads.scan.whitelistExtensions
      : null,
  maxSize: (parseInt(config.uploads.scan.maxSize) * 1e6) || null
}

self.init = async () => {
  if (!config.uploads.scan || !config.uploads.scan.enabled) return

  if (!config.uploads.scan.clamOptions) {
    logger.error('Missing object config.uploads.scan.clamOptions (check config.sample.js)')
    process.exit(1)
  }

  self.instance = await new NodeClam().init(config.uploads.scan.clamOptions)
  self.version = await self.instance.getVersion().then(s => s.trim())

  logger.log(`Connection established with ${self.version}`)
}

module.exports = self
