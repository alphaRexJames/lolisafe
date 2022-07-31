const { inspect } = require('util')

const self = {}

// Only show shortened version (time) during development
const short = process.env.NODE_ENV === 'development'

const now = () => {
  const time = new Date()
  const parsed = {
    hours: time.getHours(),
    minutes: time.getMinutes(),
    seconds: time.getSeconds()
  }

  if (!short) {
    parsed.month = time.getMonth() + 1
    parsed.date = time.getDate()
  }

  // Add leading zeroes and slice
  Object.keys(parsed).forEach(key => {
    parsed[key] = ('0' + parsed[key]).slice(-2)
  })

  return (!short ? `${time.getFullYear()}-${parsed.month}-${parsed.date} ` : '') +
    `${parsed.hours}:${parsed.minutes}:${parsed.seconds}`
}

const clean = item => {
  if (typeof item === 'string') return item
  const cleaned = inspect(item, { depth: 0 })
  return cleaned
}

const write = (content, options = {}) => {
  const stream = options.error ? process.stderr : process.stdout
  stream.write(`[${now()}] ${options.prefix || ''}${clean(content)}\n`)
}

self.log = write

self.error = (content, options = {}) => {
  options.error = true
  write(content, options)
}

self.debug = (content, options = {}) => {
  if (process.env.NODE_ENV !== 'development') return
  write(content, options)
}

self.inspect = (...args) => {
  const options = {
    colors: true,
    depth: Infinity
  }
  if (args.length > 1 && typeof args[args.length - 1] === 'object') {
    Object.assign(options, args[args.length - 1])
    args.splice(args.length - 1, 1)
  }
  for (const arg of args) {
    console.log(inspect(arg, options))
  }
}

module.exports = self
