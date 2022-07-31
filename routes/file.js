const { Router } = require('hyper-express')
const routes = new Router()
const utils = require('./../controllers/utilsController')
const config = require('./../config')

routes.get('/file/:identifier', async (req, res) => {
  // Uploads identifiers parsing, etc., are strictly handled by client-side JS at src/js/file.js
  // Rendered page is persistently cached during production (its dynamic content is generated on client-side)
  return res.render('file', {
    config, utils, versions: utils.versionStrings
  }, !utils.devmode)
})

module.exports = routes
