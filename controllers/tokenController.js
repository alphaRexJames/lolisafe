const randomstring = require('randomstring')
const perms = require('./permissionController')
const utils = require('./utilsController')
const config = require('./../config')
const logger = require('./../logger')
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
  const token = typeof req.body.token === 'string'
    ? req.body.token.trim()
    : ''

  if (!token) return res.json({ success: false, description: 'No token provided.' })

  try {
    const user = await db.table('users')
      .where('token', token)
      .select('username', 'permission')
      .first()

    if (!user) return res.json({ success: false, description: 'Invalid token.' })

    const obj = {
      success: true,
      username: user.username,
      permissions: perms.mapPermissions(user)
    }
    if (utils.clientVersion) obj.version = utils.clientVersion
    return res.json(obj)
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

self.list = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return
  return res.json({ success: true, token: user.token })
}

self.change = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const newToken = await self.generateUniqueToken()
  if (!newToken) {
    return res.json({
      success: false,
      description: 'Sorry, we could not allocate a unique token. Try again?'
    })
  }

  try {
    await db.table('users')
      .where('token', user.token)
      .update({
        token: newToken,
        timestamp: Math.floor(Date.now() / 1000)
      })
    self.onHold.delete(newToken)

    return res.json({
      success: true,
      token: newToken
    })
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

module.exports = self
