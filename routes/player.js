const { Router } = require('hyper-express')
const routes = new Router()
const utils = require('./../controllers/utilsController')
const config = require('./../controllers/utils/ConfigManager')

const playerHandler = async (req, res) => {
  // Uploads identifiers parsing, etc., are strictly handled by client-side JS at src/js/player.js
  // Rendered page is persistently cached during production (its dynamic content is generated on client-side)
  return res.render('player', {
    config, utils, versions: utils.versionStrings
  }, !utils.devmode)
}

routes.get('/player/:identifier', playerHandler)
routes.get('/v/:identifier', playerHandler)

module.exports = routes
