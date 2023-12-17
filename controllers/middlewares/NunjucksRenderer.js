const nunjucks = require('nunjucks')

class NunjucksRenderer {
  directory
  environment

  #persistentCaches = new Map()

  constructor (directory = '', options = {}) {
    if (typeof directory !== 'string') {
      throw new TypeError('Root directory must be a string value')
    }

    this.directory = directory

    this.environment = nunjucks.configure(
      this.directory,
      Object.assign(options, {
        autoescape: true
      })
    )
  }

  #middleware (req, res, next) {
    // Inject render() method into Response on each requests
    res.render = (...args) => this.#render(res, ...args)
    return next()
  }

  #render (res, path, context, usePersistentCache = false) {
    // If usePersistentCache is true, the rendered templates will be cached forever,
    // thus only use for absolutely static pages
    if (!path) {
      throw new Error('Missing Nunjucks template name.')
    }

    return new Promise((resolve, reject) => {
      const template = `${path}.njk`

      if (usePersistentCache) {
        const cached = this.#persistentCaches.get(template)
        if (cached) {
          return resolve(cached)
        }
      }

      this.environment.render(template, context, (err, html) => {
        if (err) {
          return reject(err)
        }
        if (usePersistentCache) {
          this.#persistentCaches.set(template, html)
        }
        resolve(html)
      })
    }).then(html => {
      res.header('Content-Type', 'text/html; charset=utf-8')
      res.send(html)
      return html
    })
  }

  get middleware () {
    return this.#middleware.bind(this)
  }
}

module.exports = NunjucksRenderer
