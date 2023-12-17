const { Router } = require('hyper-express')
const routes = new Router()
const upload = require('./../controllers/uploadController')
const utils = require('./../controllers/utilsController')
const config = require('./../controllers/utils/ConfigManager')

routes.get('/nojs', async (req, res) => {
  return res.render('nojs', {
    config, utils, versions: utils.versionStrings
  }, !utils.devmode)
})

// HyperExpress defaults to 250kb
// https://github.com/kartikk221/hyper-express/blob/6.4.8/docs/Server.md#server-constructor-options
routes.post('/nojs', {
  max_body_length: parseInt(config.uploads.maxSize) * 1e6,
  middlewares: [
    async (req, res) => {
      // Assert Request type early
      utils.assertRequestType(req, 'multipart/form-data')
    }
  ]
}, async (req, res) => {
  // Map built-in Response.json() function into Response.render() accordingly
  // Since NoJS uploader needs to reply with a complete HTML page
  res._json = res.json
  res.json = (...args) => {
    const result = args[0]
    return res.render('nojs', {
      config,
      utils,
      versions: utils.versionStrings,
      errorMessage: result.success ? '' : (result.description || 'An unexpected error occurred.'),
      files: result.files || [{}]
    })
  }

  // Indicate uploadController.js to additionally process this request further
  // (skip request type assertion, parse token from form input, etc.)
  req.locals.nojs = true

  return upload.upload(req, res)
})

module.exports = routes
