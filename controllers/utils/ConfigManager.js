const config = require('./../../config')
const logger = require('./../../logger')

const self = {}

// Allow some config options to be overriden via env vars
const overrides = {
  PRIVATE: {
    key: 'private',
    type: 'boolean'
  },
  ENABLE_USER_ACCOUNTS: {
    key: 'enableUserAccounts',
    type: 'boolean'
  },
  SERVE_FILES_WITH_NODE: {
    key: 'serveFilesWithNode',
    type: 'boolean'
  },
  PORT: {
    key: 'port',
    type: 'number'
  },
  DOMAIN: 'domain',
  HOME_DOMAIN: 'homeDomain',
  TRUST_PROXY: {
    key: 'trustProxy',
    type: 'boolean'
  },
  SERVE_STATIC_QUICK: {
    key: 'useServeStaticQuick',
    type: 'boolean',
    default: true
  }
}

// Load from config file
for (const key of Object.keys(config)) {
  self[key] = config[key]
}

// Parse environment variables overrides
for (const name of Object.keys(overrides)) {
  if (typeof overrides[name] === 'object') {
    const key = overrides[name].key

    if (overrides[name].type === 'boolean') {
      switch (process.env[name]) {
        case '0':
        case 'false':
          self[key] = false
          break
        case '1':
        case 'true':
          self[key] = true
          break
      }
    } else if (overrides[name].type === 'number') {
      if (process.env[name] !== undefined) {
        self[key] = parseInt(process.env[name], 10)
      }
    } else {
      if (process.env[name] !== undefined) {
        self[key] = process.env[name]
      }
    }

    if (self[key] === undefined && overrides[name].default !== undefined) {
      self[key] = overrides[name].default
    }
  } else if (typeof overrides[name] === 'string') {
    const key = overrides[name]

    if (process.env[name] !== undefined) {
      self[key] = process.env[name]
    }
  } else {
    logger.debug(`Invalid config override key: ${name}`)
  }
}

logger.debug('ConfigManager initiated.')

module.exports = self
