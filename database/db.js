const init = async db => {
  // Create the tables we need to store galleries and files
  await db.schema.hasTable('albums').then(exists => {
    if (!exists)
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
  })

  await db.schema.hasTable('files').then(exists => {
    if (!exists)
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
  })

  await db.schema.hasTable('users').then(exists => {
    if (!exists)
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
  })

  const root = await db.table('users')
    .where('username', 'root')
    .first()

  if (!root) {
    const hash = await require('bcrypt').hash('changeme', 10)
    const timestamp = Math.floor(Date.now() / 1000)
    await db.table('users').insert({
      username: 'root',
      password: hash,
      token: require('randomstring').generate(64),
      timestamp,
      permission: require('./../controllers/permissionController').permissions.superadmin,
      registration: timestamp
    })
  }
}

module.exports = init
