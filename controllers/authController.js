const bcrypt = require('bcrypt')
const jetpack = require('fs-jetpack')
const path = require('path')
const randomstring = require('randomstring')
const paths = require('./pathsController')
const perms = require('./permissionController')
const tokens = require('./tokenController')
const utils = require('./utilsController')
const ClientError = require('./utils/ClientError')
const config = require('./utils/ConfigManager')

// Don't forget to update min/max length of text inputs in auth.njk
// when changing these values.
const self = {
  user: {
    min: 4,
    max: 32
  },
  pass: {
    min: 6,
    // Should not be more than 72 characters
    // https://github.com/kelektiv/node.bcrypt.js/tree/v5.0.1#security-issues-and-concerns
    max: 64,
    // Length of randomized password
    // when resetting password through Dashboard's Manage Users.
    rand: 16
  }
}

/** Preferences */

// https://github.com/kelektiv/node.bcrypt.js/tree/v5.0.1#a-note-on-rounds
const saltRounds = 10

const usersPerPage = config.dashboard
  ? Math.max(Math.min(config.dashboard.usersPerPage || 0, 100), 1)
  : 25

// ip is an optional parameter, which if set will be rate limited
// using tokens.authFailuresRateLimiter pool
self.assertUser = async (token, fields, ip) => {
  if (ip) {
    const rateLimiterRes = await tokens.authFailuresRateLimiter.get(ip)
    if (rateLimiterRes && rateLimiterRes.remainingPoints <= 0) {
      throw new ClientError('Too many auth failures. Try again in a while.', { statusCode: 429 })
    }
  }

  // Default fields/columns to fetch from database
  const _fields = ['id', 'username', 'enabled', 'timestamp', 'permission', 'registration']

  // Allow fetching additional fields/columns
  if (typeof fields === 'string') {
    fields = [fields]
  }
  if (Array.isArray(fields)) {
    _fields.push(...fields)
  }

  const user = await utils.db.table('users')
    .where('token', token)
    .select(_fields)
    .first()
  if (user) {
    if (user.enabled === false || user.enabled === 0) {
      throw new ClientError('This account has been disabled.', { statusCode: 403 })
    }
    return user
  } else {
    if (ip) {
      // Rate limit attempts with invalid token
      await tokens.authFailuresRateLimiter.consume(ip, 1)
    }
    throw new ClientError('Invalid token.', { statusCode: 403, code: 10001 })
  }
}

self.requireUser = (req, res, next, options = {}) => {
  // Throws when token is missing, thus use only for users-only routes
  const token = options.token || req.headers.token
  if (!token) {
    return next(new ClientError('No token provided.', { statusCode: 403 }))
  }

  self.assertUser(token, options.fields, req.ip)
    .then(user => {
      // Add user data to Request.locals.user
      req.locals.user = user
      return next()
    })
    .catch(next)
}

self.optionalUser = (req, res, next, options = {}) => {
  // Throws when token if missing only when private is set to true in config,
  // thus use for routes that can handle no auth requests
  const token = options.token || req.headers.token
  if (!token) {
    if (config.private === true) {
      return next(new ClientError('No token provided.', { statusCode: 403 }))
    } else {
      // Simply bypass this middleware otherwise
      return next()
    }
  }

  self.assertUser(token, options.fields, req.ip)
    .then(user => {
      // Add user data to Request.locals.user
      req.locals.user = user
      return next()
    })
    .catch(next)
}

self.verify = async (req, res) => {
  const username = typeof req.body.username === 'string'
    ? req.body.username.trim()
    : ''
  if (!username) {
    throw new ClientError('No username provided.')
  }

  const password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (!password) {
    throw new ClientError('No password provided.')
  }

  // Use tokens.authFailuresRateLimiter pool for /api/login as well
  const rateLimiterRes = await tokens.authFailuresRateLimiter.get(req.ip)
  if (rateLimiterRes && rateLimiterRes.remainingPoints <= 0) {
    throw new ClientError('Too many auth failures. Try again in a while.', { statusCode: 429 })
  }

  const user = await utils.db.table('users')
    .where('username', username)
    .first()

  if (!user) {
    await tokens.authFailuresRateLimiter.consume(req.ip, 1)
    throw new ClientError('Wrong credentials.', { statusCode: 403 })
  }

  if (user.enabled === false || user.enabled === 0) {
    throw new ClientError('This account has been disabled.', { statusCode: 403 })
  }

  const result = await bcrypt.compare(password, user.password)
  if (result === false) {
    await tokens.authFailuresRateLimiter.consume(req.ip, 1)
    throw new ClientError('Wrong credentials.', { statusCode: 403 })
  } else {
    return res.json({ success: true, token: user.token })
  }
}

self.register = async (req, res) => {
  if (config.enableUserAccounts === false) {
    throw new ClientError('Registration is currently disabled.', { statusCode: 403 })
  }

  const username = typeof req.body.username === 'string'
    ? req.body.username.trim()
    : ''
  if (username.length < self.user.min || username.length > self.user.max) {
    throw new ClientError(`Username must have ${self.user.min}-${self.user.max} characters.`)
  }

  // "root" user is not required if you have other users with superadmin permission,
  // so removing them via direct database query is possible.
  // However, protect it from being re-created via the API endpoints anyway.
  if (username === 'root') {
    throw new ClientError('Username is reserved.')
  }

  const password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (password.length < self.pass.min || password.length > self.pass.max) {
    throw new ClientError(`Password must have ${self.pass.min}-${self.pass.max} characters.`)
  }

  // Use tokens.authFailuresRateLimiter pool for /api/register as well
  const rateLimiterRes = await tokens.authFailuresRateLimiter.get(req.ip)
  if (rateLimiterRes && rateLimiterRes.remainingPoints <= 0) {
    throw new ClientError('Too many auth failures. Try again in a while.', { statusCode: 429 })
  }

  const user = await utils.db.table('users')
    .where('username', username)
    .first()

  if (user) {
    // Also consume rate limit to protect this route
    // from being brute-forced to find existing usernames
    await tokens.authFailuresRateLimiter.consume(req.ip, 1)
    throw new ClientError('Username already exists.')
  }

  const hash = await bcrypt.hash(password, saltRounds)

  const token = await tokens.getUniqueToken(res)

  await utils.db.table('users')
    .insert({
      username,
      password: hash,
      token,
      enabled: 1,
      permission: perms.permissions.user,
      registration: Math.floor(Date.now() / 1000)
    })

  utils.invalidateStatsCache('users')

  return res.json({ success: true, token })
}

self.changePassword = async (req, res) => {
  const password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (password.length < self.pass.min || password.length > self.pass.max) {
    throw new ClientError(`Password must have ${self.pass.min}-${self.pass.max} characters.`)
  }

  const hash = await bcrypt.hash(password, saltRounds)

  await utils.db.table('users')
    .where('id', req.locals.user.id)
    .update('password', hash)

  return res.json({ success: true })
}

self.assertPermission = (user, target) => {
  if (!perms.higher(user, target)) {
    throw new ClientError('The user is in the same or higher group as you.', { statusCode: 403 })
  }
}

self.createUser = async (req, res) => {
  const isadmin = perms.is(req.locals.user, 'admin')
  if (!isadmin) {
    return res.status(403).end()
  }

  const username = typeof req.body.username === 'string'
    ? req.body.username.trim()
    : ''
  if (username.length < self.user.min || username.length > self.user.max) {
    throw new ClientError(`Username must have ${self.user.min}-${self.user.max} characters.`)
  }

  // Please consult notes in self.register() function.
  if (username === 'root') {
    throw new ClientError('Username is reserved.')
  }

  let password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (password.length) {
    if (password.length < self.pass.min || password.length > self.pass.max) {
      throw new ClientError(`Password must have ${self.pass.min}-${self.pass.max} characters.`)
    }
  } else {
    password = randomstring.generate(self.pass.rand)
  }

  let group = req.body.group
  let permission
  if (group !== undefined) {
    permission = perms.permissions[group]
    if (typeof permission !== 'number' || permission < 0) {
      group = 'user'
      permission = perms.permissions.user
    }
  }

  const exists = await utils.db.table('users')
    .where('username', username)
    .first()

  if (exists) {
    throw new ClientError('Username already exists.')
  }

  const hash = await bcrypt.hash(password, saltRounds)

  const token = await tokens.getUniqueToken(res)

  await utils.db.table('users')
    .insert({
      username,
      password: hash,
      token,
      enabled: 1,
      permission,
      registration: Math.floor(Date.now() / 1000)
    })

  utils.invalidateStatsCache('users')

  return res.json({ success: true, username, password, group })
}

self.editUser = async (req, res) => {
  const isadmin = perms.is(req.locals.user, 'admin')
  if (!isadmin) {
    return res.status(403).end()
  }

  const id = parseInt(req.body.id)
  if (isNaN(id)) {
    throw new ClientError('No user specified.')
  }

  const target = await utils.db.table('users')
    .where('id', id)
    .first()

  if (!target) {
    throw new ClientError('Could not get user with the specified ID.')
  }

  // Ensure this user has permission to tamper with target user
  self.assertPermission(req.locals.user, target)

  const update = {}

  if (req.body.username !== undefined) {
    update.username = String(req.body.username).trim()
    if (update.username.length < self.user.min || update.username.length > self.user.max) {
      throw new ClientError(`Username must have ${self.user.min}-${self.user.max} characters.`)
    }
  }

  if (req.body.enabled !== undefined) {
    update.enabled = Boolean(req.body.enabled)
  }

  if (req.body.group !== undefined) {
    update.permission = perms.permissions[req.body.group]
    if (typeof update.permission !== 'number' || update.permission < 0) {
      update.permission = target.permission
    }
  }

  let password
  if (req.body.resetPassword) {
    password = randomstring.generate(self.pass.rand)
    update.password = await bcrypt.hash(password, saltRounds)
  }

  if (!Object.keys(update).length) {
    throw new ClientError('You are not editing any properties of this user.')
  }

  await utils.db.table('users')
    .where('id', id)
    .update(update)
  utils.invalidateStatsCache('users')

  const response = { success: true, update }
  if (password) {
    response.update.password = password
  }

  return res.json(response)
}

self.disableUser = async (req, res) => {
  // Re-map Request.body for .editUser()
  req.body = {
    id: req.body.id,
    enabled: false
  }

  return self.editUser(req, res)
}

self.deleteUser = async (req, res) => {
  const isadmin = perms.is(req.locals.user, 'admin')
  if (!isadmin) {
    return res.status(403).end()
  }

  const id = parseInt(req.body.id)
  const purge = req.body.purge
  if (isNaN(id)) {
    throw new ClientError('No user specified.')
  }

  const target = await utils.db.table('users')
    .where('id', id)
    .first()

  if (!target) {
    throw new ClientError('Could not get user with the specified ID.')
  }

  // Ensure this user has permission to tamper with target user
  self.assertPermission(req.locals.user, target)

  const files = await utils.db.table('files')
    .where('userid', id)
    .select('id')

  if (files.length) {
    const fileids = files.map(file => file.id)
    if (purge) {
      const failed = await utils.bulkDeleteFromDb('id', fileids, req.locals.user)
      utils.invalidateStatsCache('uploads')
      if (failed.length) {
        return res.json({ success: false, failed })
      }
    } else {
      // Clear out userid attribute from the files
      await utils.db.table('files')
        .whereIn('id', fileids)
        .update('userid', null)
    }
  }

  const albums = await utils.db.table('albums')
    .where('userid', id)
    .where('enabled', 1)
    .select('id', 'identifier')

  if (albums.length) {
    const albumids = albums.map(album => album.id)
    await utils.db.table('albums')
      .whereIn('id', albumids)
      .del()
    utils.deleteStoredAlbumRenders(albumids)

    // Unlink their album ZIP archives
    await Promise.all(albums.map(async album =>
      jetpack.removeAsync(path.join(paths.zips, `${album.identifier}.zip`))
    ))
  }

  await utils.db.table('users')
    .where('id', id)
    .del()
  utils.invalidateStatsCache('users')

  return res.json({ success: true })
}

self.bulkDeleteUsers = async (req, res) => {
  // TODO
}

self.listUsers = async (req, res) => {
  const isadmin = perms.is(req.locals.user, 'admin')
  if (!isadmin) {
    return res.status(403).end()
  }

  // Base result object
  const result = { success: true, users: [], usersPerPage, count: 0 }

  result.count = await utils.db.table('users')
    .count('id as count')
    .then(rows => rows[0].count)
  if (!result.count) {
    return res.json(result)
  }

  let offset = req.path_parameters && Number(req.path_parameters.page)
  if (isNaN(offset)) {
    offset = 0
  } else if (offset < 0) {
    offset = Math.max(0, Math.ceil(result.count / usersPerPage) + offset)
  }

  result.users = await utils.db.table('users')
    .limit(usersPerPage)
    .offset(usersPerPage * offset)
    .select('id', 'username', 'enabled', 'timestamp', 'permission', 'registration')

  const pointers = {}
  for (const user of result.users) {
    user.groups = perms.mapPermissions(user)
    delete user.permission
    user.uploads = 0
    user.usage = 0
    pointers[user.id] = user
  }

  const uploads = await utils.db.table('files')
    .whereIn('userid', Object.keys(pointers))
    .select('userid', 'size')

  for (const upload of uploads) {
    pointers[upload.userid].uploads++
    pointers[upload.userid].usage += parseInt(upload.size)
  }

  return res.json(result)
}

module.exports = self
