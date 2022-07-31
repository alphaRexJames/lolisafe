const STRATEGIES = [
  'LAST_GET_TIME',
  'GETS_COUNT'
]

class SimpleDataStore {
  #store
  #held
  #limit
  #strategy

  constructor (options = {}) {
    if (typeof options !== 'object') {
      throw new TypeError('Missing options object.')
    }

    if (!Number.isFinite(options.limit) || options.limit <= 1) {
      throw new TypeError('Limit must be a finite number that is at least 2.')
    }

    if (!STRATEGIES.includes(options.strategy)) {
      throw new TypeError(`Strategy must be one of these: ${STRATEGIES.map(s => `"${s}"`).join(', ')}.`)
    }

    this.#store = new Map()
    this.#held = new Set()
    this.#limit = options.limit
    this.#strategy = options.strategy
  }

  clear () {
    this.#store.clear()
    this.#held.clear()
  }

  delete (key) {
    // If key is in #held, assume is not in #store, thus return early
    return this.#held.delete(key) || this.#store.delete(key)
  }

  deleteStalest () {
    const stalest = this.getStalest()
    if (stalest) {
      return this.#store.delete(stalest)
    }
  }

  get (key) {
    // null should be used as an indicator for when key is held but not yet set with value
    if (this.#held.has(key)) {
      return null
    }

    const entry = this.#store.get(key)
    if (!entry) return entry

    switch (this.#strategy) {
      case STRATEGIES[0]:
        entry.stratval = Date.now()
        break
      case STRATEGIES[1]:
        entry.stratval++
        break
    }

    this.#store.set(key, entry)
    return entry.value
  }

  getStalest () {
    let stalest = [null, { stratval: Infinity }]
    switch (this.#strategy) {
      // both "lastGetTime" and "getsCount" simply must find lowest value
      // to determine the stalest entry
      case STRATEGIES[0]:
      case STRATEGIES[1]:
        for (const entry of this.#store) {
          if (entry[1].stratval < stalest[1].stratval) {
            stalest = entry
          }
        }
        break
    }

    // return its key only
    return stalest[0]
  }

  hold (key) {
    return this.#held.add(key) && true
  }

  set (key, value) {
    if (!this.#store.has(key) && this.#store.size >= this.#limit) {
      this.deleteStalest()
    }

    let stratval
    switch (this.#strategy) {
      case STRATEGIES[0]:
        stratval = Date.now()
        break
      case STRATEGIES[1]:
        stratval = 0
        break
    }

    if (this.#store.set(key, { value, stratval })) {
      this.#held.delete(key)
      return true
    }
    return false
  }

  get limit () {
    return this.#limit
  }

  set limit (_) {
    throw Error('This property is read-only.')
  }

  get size () {
    return this.#store.size
  }

  set size (_) {
    throw Error('This property is read-only.')
  }

  get strategy () {
    return this.#strategy
  }

  set strategy (_) {
    throw Error('This property is read-only.')
  }

  // Not advised to use the following functions during production
  // Mainly intended to "inspect" internal stores when required

  get store () {
    // return shallow copy
    return new Map(this.#store)
  }

  get held () {
    // return shallow copy
    return new Set(this.#held)
  }
}

module.exports = SimpleDataStore
module.exports.STRATEGIES = STRATEGIES
