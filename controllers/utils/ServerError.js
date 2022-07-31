class ServerError extends Error {
  constructor (message, options = {}) {
    super(message)

    const {
      statusCode,
      code,
      logStack
    } = options

    this.statusCode = statusCode !== undefined
      ? statusCode
      : 500

    this.code = code

    this.logStack = logStack || false
  }
}

module.exports = ServerError
