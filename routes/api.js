const { Router } = require('hyper-express')
const routes = new Router()
const albums = require('./../controllers/albumsController')
const auth = require('./../controllers/authController')
const tokens = require('./../controllers/tokenController')
const upload = require('./../controllers/uploadController')
const utils = require('./../controllers/utilsController')
const config = require('./../controllers/utils/ConfigManager')

routes.get('/check', async (req, res) => {
  const obj = {
    private: config.private,
    enableUserAccounts: config.enableUserAccounts,
    maxSize: config.uploads.maxSize,
    chunkSize: config.uploads.chunkSize,
    fileIdentifierLength: config.uploads.fileIdentifierLength,
    stripTags: config.uploads.stripTags
  }
  if (utils.retentions.enabled && utils.retentions.periods._) {
    obj.temporaryUploadAges = utils.retentions.periods._
    obj.defaultTemporaryUploadAge = utils.retentions.default._
  }
  if (utils.clientVersion) {
    obj.version = utils.clientVersion
  }

  return res.json(obj)
})

/** ./controllers/authController.js */

routes.post('/login', utils.assertJSON, auth.verify)
routes.post('/register', utils.assertJSON, auth.register)
routes.post('/password/change', [auth.requireUser, utils.assertJSON], auth.changePassword)

routes.get('/users', auth.requireUser, auth.listUsers)
routes.get('/users/:page', auth.requireUser, auth.listUsers)

routes.post('/users/create', [auth.requireUser, utils.assertJSON], auth.createUser)
routes.post('/users/delete', [auth.requireUser, utils.assertJSON], auth.deleteUser)
routes.post('/users/disable', [auth.requireUser, utils.assertJSON], auth.disableUser)
routes.post('/users/edit', [auth.requireUser, utils.assertJSON], auth.editUser)

/** ./controllers/uploadController.js */

// HyperExpress defaults to 250kb
// https://github.com/kartikk221/hyper-express/blob/6.4.8/docs/Server.md#server-constructor-options
const uploadOptions = {
  max_body_length: parseInt(config.uploads.maxSize) * 1e6,
  middlewares: [
    auth.optionalUser
  ]
}
routes.post('/upload', uploadOptions, upload.upload)
routes.post('/upload/:albumid', uploadOptions, upload.upload)
routes.post('/upload/finishchunks', [auth.optionalUser, utils.assertJSON], upload.finishChunks)

routes.get('/uploads', auth.requireUser, upload.list)
routes.get('/uploads/:page', auth.requireUser, upload.list)
routes.get('/album/:albumid/:page', auth.requireUser, upload.list)

routes.get('/upload/get/:identifier', auth.requireUser, upload.get)
routes.post('/upload/delete', [auth.requireUser, utils.assertJSON], upload.delete)
routes.post('/upload/bulkdelete', [auth.requireUser, utils.assertJSON], upload.bulkDelete)

/** ./controllers/albumsController.js */

routes.get('/albums', auth.requireUser, albums.list)
routes.get('/albums/:page', auth.requireUser, albums.list)

routes.get('/album/get/:identifier', albums.get)
routes.get('/album/zip/:identifier', albums.generateZip)
routes.get('/album/:identifier', albums.getUpstreamCompat)

routes.post('/albums', [auth.requireUser, utils.assertJSON], albums.create)
routes.post('/albums/addfiles', [auth.requireUser, utils.assertJSON], albums.addFiles)
routes.post('/albums/delete', [auth.requireUser, utils.assertJSON], albums.delete)
routes.post('/albums/disable', [auth.requireUser, utils.assertJSON], albums.disable)
routes.post('/albums/edit', [auth.requireUser, utils.assertJSON], albums.edit)
routes.post('/albums/rename', [auth.requireUser, utils.assertJSON], albums.rename)

/** ./controllers/tokenController.js **/

routes.get('/tokens', auth.requireUser, tokens.list)
routes.post('/tokens/change', (req, res, next) => {
  auth.requireUser(req, res, next, {
    // Include user's "token" field into database query
    fields: ['token']
  })
}, tokens.change)
routes.post('/tokens/verify', utils.assertJSON, tokens.verify)

/** ./controllers/utilsController.js */

routes.get('/stats', [auth.requireUser], utils.stats)
routes.get('/stats/:category', [auth.requireUser], utils.statsCategory)

module.exports = routes
