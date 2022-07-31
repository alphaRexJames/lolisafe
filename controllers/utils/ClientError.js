class ClientError extends Error {
  constructor (message, options = {}) {
    super(message)

    const {
      statusCode,
      code
    } = options

    this.statusCode = statusCode !== undefined
      ? statusCode
      : 400

    this.code = code
  }
}

module.exports = ClientError
