// Copyright 2014 Andrei Karpushonak

'use strict'

const ECMA_SIZES = require('./byte_size')
const Buffer = require('buffer/').Buffer

function allProperties (obj) {
  const stringProperties = []
  for (const prop in obj) {
    stringProperties.push(prop)
  }
  if (Object.getOwnPropertySymbols) {
    const symbolProperties = Object.getOwnPropertySymbols(obj)
    Array.prototype.push.apply(stringProperties, symbolProperties)
  }
  return stringProperties
}

function sizeOfObject (seen, object, options) {
  if (object == null) {
    return 0
  }

  let bytes = 0
  const properties = allProperties(object)
  for (let i = 0; i < properties.length; i++) {
    const key = properties[i]
    // Do not recalculate circular references
    if (typeof object[key] === 'object' && object[key] !== null) {
      if (seen.has(object[key])) {
        continue
      }
      seen.add(object[key])
    }

    bytes += getCalculator(seen, options)(key)
    try {
      bytes += getCalculator(seen, options)(object[key])
    } catch (ex) {
      if (ex instanceof RangeError) {
        // circular reference detected, final result might be incorrect
        // let's be nice and not throw an exception
        bytes = 0
      }
      if (ex.timeout) {
        throw ex
      }
    }
  }

  return bytes
}

function getCalculator (seen, options) {
  return function calculator (object) {
    if (options.timeoutAt && Date.now() >= options.timeoutAt) {
      const error = new Error(
        'Timeout reached. Make sure the object is not too deep.'
      )
      error.timeout = true
      throw error
    }

    if (Buffer.isBuffer(object)) {
      return object.length
    }

    const objectType = typeof object
    switch (objectType) {
      case 'string':
        return object.length * ECMA_SIZES.STRING
      case 'boolean':
        return ECMA_SIZES.BOOLEAN
      case 'number':
        return ECMA_SIZES.NUMBER
      case 'symbol':
        const isGlobalSymbol = Symbol.keyFor && Symbol.keyFor(object)
        return isGlobalSymbol
          ? Symbol.keyFor(object).length * ECMA_SIZES.STRING
          : (object.toString().length - 8) * ECMA_SIZES.STRING
      case 'object':
        if (Array.isArray(object)) {
          return object
            .map(getCalculator(seen, options))
            .reduce(function (acc, curr) {
              return acc + curr
            }, 0)
        } else {
          return sizeOfObject(seen, object, options)
        }
      default:
        return 0
    }
  }
}

/**
 * Main module's entry point
 * Calculates Bytes for the provided parameter
 * @param object - handles object/string/boolean/buffer
 * @returns {*}
 */
function sizeof (object, options = {}) {
  const timeoutAt = options.timeout ? Date.now() + options.timeout : null
  return getCalculator(new WeakSet(), { timeoutAt })(object)
}

module.exports = sizeof
