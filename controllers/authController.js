const bcrypt = require('bcrypt')
const path = require('path')
const randomstring = require('randomstring')
const paths = require('./pathsController')
const perms = require('./permissionController')
const tokens = require('./tokenController')
const utils = require('./utilsController')
const config = require('./../config')
const logger = require('./../logger')
const db = require('knex')(config.database)

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
    // https://github.com/kelektiv/node.bcrypt.js#security-issues-and-concerns
    max: 64,
    // Length of randomized password
    // when resetting passwordthrough Dashboard's Manage Users.
    rand: 16
  }
}

// https://github.com/kelektiv/node.bcrypt.js#a-note-on-rounds
const saltRounds = 10

self.verify = async (req, res, next) => {
  const username = typeof req.body.username === 'string'
    ? req.body.username.trim()
    : ''
  if (!username) return res.json({ success: false, description: 'No username provided.' })

  const password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (!password) return res.json({ success: false, description: 'No password provided.' })

  try {
    const user = await db.table('users')
      .where('username', username)
      .first()

    if (!user) return res.json({ success: false, description: 'Username does not exist.' })

    if (user.enabled === false || user.enabled === 0) {
      return res.json({ success: false, description: 'This account has been disabled.' })
    }

    const result = await bcrypt.compare(password, user.password)
    if (result === false) {
      return res.json({ success: false, description: 'Wrong password.' })
    } else {
      return res.json({ success: true, token: user.token })
    }
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

self.register = async (req, res, next) => {
  if (config.enableUserAccounts === false) {
    return res.json({ success: false, description: 'Registration is currently disabled.' })
  }

  const username = typeof req.body.username === 'string'
    ? req.body.username.trim()
    : ''
  if (username.length < self.user.min || username.length > self.user.max) {
    return res.json({
      success: false,
      description: `Username must have ${self.user.min}-${self.user.max} characters.`
    })
  }

  const password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (password.length < self.pass.min || password.length > self.pass.max) {
    return res.json({
      success: false,
      description: `Password must have ${self.pass.min}-${self.pass.max} characters.`
    })
  }

  try {
    const user = await db.table('users')
      .where('username', username)
      .first()

    if (user) return res.json({ success: false, description: 'Username already exists.' })

    const hash = await bcrypt.hash(password, saltRounds)

    const token = await tokens.generateUniqueToken()
    if (!token) {
      return res.json({
        success: false,
        description: 'Sorry, we could not allocate a unique token. Try again?'
      })
    }

    await db.table('users')
      .insert({
        username,
        password: hash,
        token,
        enabled: 1,
        permission: perms.permissions.user,
        registration: Math.floor(Date.now() / 1000)
      })
    utils.invalidateStatsCache('users')
    tokens.onHold.delete(token)

    return res.json({ success: true, token })
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

self.changePassword = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (password.length < self.pass.min || password.length > self.pass.max) {
    return res.json({
      success: false,
      description: `Password must have ${self.pass.min}-${self.pass.max} characters.`
    })
  }

  try {
    const hash = await bcrypt.hash(password, saltRounds)

    await db.table('users')
      .where('id', user.id)
      .update('password', hash)

    return res.json({ success: true })
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

self.assertPermission = (user, target) => {
  if (!target) {
    throw new Error('Could not get user with the specified ID.')
  } else if (!perms.higher(user, target)) {
    throw new Error('The user is in the same or higher group as you.')
  } else if (target.username === 'root') {
    throw new Error('Root user may not be tampered with.')
  }
}

self.createUser = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const isadmin = perms.is(user, 'admin')
  if (!isadmin) return res.status(403).end()

  const username = typeof req.body.username === 'string'
    ? req.body.username.trim()
    : ''
  if (username.length < self.user.min || username.length > self.user.max) {
    return res.json({
      success: false,
      description: `Username must have ${self.user.min}-${self.user.max} characters.`
    })
  }

  let password = typeof req.body.password === 'string'
    ? req.body.password.trim()
    : ''
  if (password.length) {
    if (password.length < self.pass.min || password.length > self.pass.max) {
      return res.json({
        success: false,
        description: `Password must have ${self.pass.min}-${self.pass.max} characters.`
      })
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

  try {
    const user = await db.table('users')
      .where('username', username)
      .first()

    if (user) return res.json({ success: false, description: 'Username already exists.' })

    const hash = await bcrypt.hash(password, saltRounds)

    const token = await tokens.generateUniqueToken()
    if (!token) {
      return res.json({
        success: false,
        description: 'Sorry, we could not allocate a unique token. Try again?'
      })
    }

    await db.table('users')
      .insert({
        username,
        password: hash,
        token,
        enabled: 1,
        permission,
        registration: Math.floor(Date.now() / 1000)
      })
    utils.invalidateStatsCache('users')
    tokens.onHold.delete(token)

    return res.json({ success: true, username, password, group })
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

self.editUser = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const isadmin = perms.is(user, 'admin')
  if (!isadmin) return res.status(403).end()

  const id = parseInt(req.body.id)
  if (isNaN(id)) return res.json({ success: false, description: 'No user specified.' })

  try {
    const target = await db.table('users')
      .where('id', id)
      .first()
    self.assertPermission(user, target)

    const update = {}

    if (req.body.username !== undefined) {
      update.username = String(req.body.username).trim()
      if (update.username.length < self.user.min || update.username.length > self.user.max) {
        throw new Error(`Username must have ${self.user.min}-${self.user.max} characters.`)
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

    await db.table('users')
      .where('id', id)
      .update(update)
    utils.invalidateStatsCache('users')

    const response = { success: true, update }
    if (password) response.update.password = password
    return res.json(response)
  } catch (error) {
    logger.error(error)
    return res.status(500).json({
      success: false,
      description: error.message || 'An unexpected error occurred. Try again?'
    })
  }
}

self.disableUser = async (req, res, next) => {
  req.body = { id: req.body.id, enabled: false }
  return self.editUser(req, res, next)
}

self.deleteUser = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const isadmin = perms.is(user, 'admin')
  if (!isadmin) return res.status(403).end()

  const id = parseInt(req.body.id)
  const purge = req.body.purge
  if (isNaN(id)) return res.json({ success: false, description: 'No user specified.' })

  try {
    const target = await db.table('users')
      .where('id', id)
      .first()
    self.assertPermission(user, target)

    const files = await db.table('files')
      .where('userid', id)
      .select('id')

    if (files.length) {
      const fileids = files.map(file => file.id)
      if (purge) {
        const failed = await utils.bulkDeleteFromDb('id', fileids, user)
        if (failed.length) return res.json({ success: false, failed })
        utils.invalidateStatsCache('uploads')
      } else {
        // Clear out userid attribute from the files
        await db.table('files')
          .whereIn('id', fileids)
          .update('userid', null)
      }
    }

    // TODO: Figure out why can't we just just delete the albums from DB
    // DISCLAIMER: Upstream always had it coded this way for some reason
    const albums = await db.table('albums')
      .where('userid', id)
      .where('enabled', 1)
      .select('id', 'identifier')

    if (albums.length) {
      const albumids = albums.map(album => album.id)
      await db.table('albums')
        .whereIn('id', albumids)
        .del()
      utils.invalidateAlbumsCache(albumids)

      // Unlink their archives
      await Promise.all(albums.map(async album => {
        try {
          await paths.unlink(path.join(paths.zips, `${album.identifier}.zip`))
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
      }))
    }

    await db.table('users')
      .where('id', id)
      .del()
    utils.invalidateStatsCache('users')

    return res.json({ success: true })
  } catch (error) {
    return res.status(500).json({
      success: false,
      description: error.message || 'An unexpected error occurred. Try again?'
    })
  }
}

self.bulkDeleteUsers = async (req, res, next) => {
  // TODO
}

self.listUsers = async (req, res, next) => {
  const user = await utils.authorize(req, res)
  if (!user) return

  const isadmin = perms.is(user, 'admin')
  if (!isadmin) return res.status(403).end()

  try {
    const count = await db.table('users')
      .count('id as count')
      .then(rows => rows[0].count)
    if (!count) return res.json({ success: true, users: [], count })

    let offset = Number(req.params.page)
    if (isNaN(offset)) offset = 0
    else if (offset < 0) offset = Math.max(0, Math.ceil(count / 25) + offset)

    const users = await db.table('users')
      .limit(25)
      .offset(25 * offset)
      .select('id', 'username', 'enabled', 'timestamp', 'permission', 'registration')

    const pointers = {}
    for (const user of users) {
      user.groups = perms.mapPermissions(user)
      delete user.permission
      user.uploads = 0
      user.usage = 0
      pointers[user.id] = user
    }

    const uploads = await db.table('files')
      .whereIn('userid', Object.keys(pointers))
      .select('userid', 'size')

    for (const upload of uploads) {
      pointers[upload.userid].uploads++
      pointers[upload.userid].usage += parseInt(upload.size)
    }

    return res.json({ success: true, users, count })
  } catch (error) {
    logger.error(error)
    return res.status(500).json({ success: false, description: 'An unexpected error occurred. Try again?' })
  }
}

module.exports = self
