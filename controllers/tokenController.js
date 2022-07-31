const randomstring = require('randomstring')
const perms = require('./permissionController')
const utils = require('./utilsController')
const ClientError = require('./utils/ClientError')
const ServerError = require('./utils/ServerError')
const logger = require('./../logger')

const self = {
  tokenLength: 64,
  tokenMaxTries: 3,

  onHold: new Set() // temporarily held random tokens
}

self.getUniqueToken = async res => {
  for (let i = 0; i < self.tokenMaxTries; i++) {
    const token = randomstring.generate(self.tokenLength)

    if (self.onHold.has(token)) {
      logger.debug(`Token ${utils.mask(token)} is currently held by another request (${i + 1}/${utils.idMaxTries}).`)
      continue
    }

    // Put token on-hold (wait for it to be inserted to DB)
    self.onHold.add(token)

    const user = await utils.db.table('users')
      .where('token', token)
      .select('id')
      .first()
    if (user) {
      self.onHold.delete(token)
      logger.debug(`User with token ${utils.mask(token)} already exists (${i + 1}/${utils.idMaxTries}).`)
      continue
    }

    // Unhold token once the Response has been sent
    if (res) {
      // Keep in an array for future-proofing
      // if a single Request needs to generate multiple tokens
      if (!res.locals.tokens) {
        res.locals.tokens = []
        res.once('finish', () => { self.unholdTokens(res) })
      }
      res.locals.tokens.push(token)
    }

    return token
  }

  throw new ServerError('Failed to allocate a unique token. Try again?')
}

self.unholdTokens = res => {
  if (!res.locals.tokens) return

  for (const token of res.locals.tokens) {
    self.onHold.delete(token)
    logger.debug(`Unheld token ${utils.mask(token)}.`)
  }

  delete res.locals.tokens
}

self.verify = async (req, res) => {
  utils.assertRequestType(req, 'application/json')

  // Parse POST body
  req.body = await req.json()

  const token = typeof req.body.token === 'string'
    ? req.body.token.trim()
    : ''

  if (!token) throw new ClientError('No token provided.', { statusCode: 403 })

  const user = await utils.db.table('users')
    .where('token', token)
    .select('username', 'permission')
    .first()

  if (!user) {
    throw new ClientError('Invalid token.', { statusCode: 403, code: 10001 })
  }

  const obj = {
    success: true,
    username: user.username,
    permissions: perms.mapPermissions(user)
  }

  const group = perms.group(user)
  if (group) {
    obj.group = group
    if (utils.retentions.enabled) {
      obj.retentionPeriods = utils.retentions.periods[group]
      obj.defaultRetentionPeriod = utils.retentions.default[group]
    }
  }

  if (utils.clientVersion) {
    obj.version = utils.clientVersion
  }

  return res.json(obj)
}

self.list = async (req, res) => {
  const user = await utils.authorize(req)
  return res.json({ success: true, token: user.token })
}

self.change = async (req, res) => {
  const user = await utils.authorize(req, 'token')

  const newToken = await self.getUniqueToken(res)

  await utils.db.table('users')
    .where('token', user.token)
    .update({
      token: newToken,
      timestamp: Math.floor(Date.now() / 1000)
    })

  return res.json({ success: true, token: newToken })
}

module.exports = self
