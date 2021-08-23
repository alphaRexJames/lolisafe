const randomstring = require('randomstring')
const perms = require('./permissionController')
const utils = require('./utilsController')
const apiErrorsHandler = require('./handlers/apiErrorsHandler')
const ClientError = require('./utils/ClientError')
const ServerError = require('./utils/ServerError')
const config = require('./../config')
const db = require('knex')(config.database)

const self = {
  tokenLength: 64,
  tokenMaxTries: 3,
  onHold: new Set()
}

self.generateUniqueToken = async () => {
  for (let i = 0; i < self.tokenMaxTries; i++) {
    const token = randomstring.generate(self.tokenLength)
    if (self.onHold.has(token)) continue

    // Put token on-hold (wait for it to be inserted to DB)
    self.onHold.add(token)

    const user = await db.table('users')
      .where('token', token)
      .select('id')
      .first()
    if (user) {
      self.onHold.delete(token)
      continue
    }

    return token
  }

  return null
}

self.verify = async (req, res, next) => {
  try {
    const token = typeof req.body.token === 'string'
      ? req.body.token.trim()
      : ''

    if (!token) throw new ClientError('No token provided.', { statusCode: 403 })

    const user = await db.table('users')
      .where('token', token)
      .select('username', 'permission')
      .first()

    if (!user) throw new ClientError('Invalid token.', { statusCode: 403 })

    const obj = {
      success: true,
      username: user.username,
      permissions: perms.mapPermissions(user)
    }

    if (utils.clientVersion) {
      obj.version = utils.clientVersion
    }

    await res.json(obj)
  } catch (error) {
    return apiErrorsHandler(error, req, res, next)
  }
}

self.list = async (req, res, next) => {
  try {
    const user = await utils.authorize(req)
    await res.json({ success: true, token: user.token })
  } catch (error) {
    return apiErrorsHandler(error, req, res, next)
  }
}

self.change = async (req, res, next) => {
  try {
    const user = await utils.authorize(req)

    const newToken = await self.generateUniqueToken()
    if (!newToken) {
      throw new ServerError('Failed to allocate a unique token. Try again?')
    }

    await db.table('users')
      .where('token', user.token)
      .update({
        token: newToken,
        timestamp: Math.floor(Date.now() / 1000)
      })
    self.onHold.delete(newToken)

    await res.json({ success: true, token: newToken })
  } catch (error) {
    return apiErrorsHandler(error, req, res, next)
  }
}

module.exports = self
