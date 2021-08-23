class ServerError extends Error {
  constructor (message, options = {}) {
    super(message)

    const {
      statusCode,
      logStack
    } = options

    this.statusCode = statusCode !== undefined
      ? statusCode
      : 500

    this.logStack = logStack || false
  }
}

module.exports = ServerError
