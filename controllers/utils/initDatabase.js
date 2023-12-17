const logger = require('./../../logger')

// Default root user's credentials
// Root user will only be created if "users" table is empty
const DEFAULT_ROOT_USERNAME = 'root'
const DEFAULT_ROOT_PASSWORD = 'changeme'

const initDatabase = async db => {
  // Create the tables we need to store galleries and files
  await db.schema.hasTable('albums').then(exists => {
    if (!exists) {
      return db.schema.createTable('albums', function (table) {
        table.increments()
        table.integer('userid')
        table.string('name')
        table.string('identifier')
        table.integer('enabled')
        table.integer('timestamp')
        table.integer('editedAt')
        table.integer('zipGeneratedAt')
        table.integer('download')
        table.integer('public')
        table.string('description')
      })
    }
  })

  await db.schema.hasTable('files').then(exists => {
    if (!exists) {
      return db.schema.createTable('files', function (table) {
        table.increments()
        table.integer('userid')
        table.string('name')
        table.string('original')
        table.string('type')
        table.string('size')
        table.string('hash')
        table.string('ip')
        table.integer('albumid')
        table.integer('timestamp')
        table.integer('expirydate')
      })
    }
  })

  await db.schema.hasTable('users').then(exists => {
    if (!exists) {
      return db.schema.createTable('users', function (table) {
        table.increments()
        table.string('username')
        table.string('password')
        table.string('token')
        table.integer('enabled')
        table.integer('timestamp')
        table.integer('permission')
        table.integer('registration')
      })
    }
  })

  const usersCount = await db.table('users')
    .count('id as count')
    .then(rows => rows[0].count)

  if (usersCount === 0) {
    const hash = await require('bcrypt').hash(DEFAULT_ROOT_PASSWORD, 10)
    const timestamp = Math.floor(Date.now() / 1000)
    await db.table('users')
      .insert({
        username: DEFAULT_ROOT_USERNAME,
        password: hash,
        token: require('randomstring').generate(64),
        timestamp,
        permission: require('./../permissionController').permissions.superadmin,
        registration: timestamp
      })
    logger.log(`Created user "${DEFAULT_ROOT_USERNAME}" with password "${DEFAULT_ROOT_PASSWORD}".`)
  }
}

module.exports = initDatabase
