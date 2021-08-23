class ClientError extends Error {
  constructor (message, options = {}) {
    super(message)

    const {
      statusCode
    } = options

    this.statusCode = statusCode !== undefined
      ? statusCode
      : 400
  }
}

module.exports = ClientError
