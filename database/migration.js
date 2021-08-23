const perms = require('./../controllers/permissionController')
const config = require('./../config')
const db = require('knex')(config.database)

const map = {
  files: {
    expirydate: 'integer'
  },
  albums: {
    editedAt: 'integer',
    zipGeneratedAt: 'integer',
    download: 'integer',
    public: 'integer',
    description: 'string'
  },
  users: {
    enabled: 'integer',
    permission: 'integer',
    registration: 'integer'
  }
}

;(async () => {
  const tableNames = Object.keys(map)
  for (const tableName of tableNames) {
    const columnNames = Object.keys(map[tableName])
    for (const columnName of columnNames) {
      if (await db.schema.hasColumn(tableName, columnName)) continue

      const columnType = map[tableName][columnName]
      await db.schema.table(tableName, table => {
        table[columnType](columnName)
      })
      console.log(`OK: ${tableName} <- ${columnName} (${columnType})`)
    }
  }

  await db.table('users')
    .where('username', 'root')
    .first()
    .update({
      permission: perms.permissions.superadmin
    })
    .then(result => {
      // NOTE: permissionController.js actually has a hard-coded check for "root" account so that
      // it will always have "superadmin" permission regardless of its permission value in database
      if (!result) return console.log('Unable to update root\'s permission into superadmin.')
      console.log(`Updated root's permission to ${perms.permissions.superadmin} (superadmin).`)
    })

  console.log('Migration finished! Now you may start lolisafe normally.')
})()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
