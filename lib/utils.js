'use strict'

var EventEmitter = require('events').EventEmitter
var hat = require('hat')
var Q = require('q')

var version = require('../package.json').version

var mixinEventEmitterErrorFunction = function (object) {
  // verify attrs
  if (object === undefined) {
    throw new Error('object is undefined -- cannot execute mixinEventEmitterErrorFunction')
  }
  if (!(object instanceof EventEmitter)) {
    throw new Error('object is not an EventEmitter -- cannot execute mixinEventEmitterErrorFunction')
  }
  // assign _error function
  object._error = function (error, callback) {
    // verify if error is defined
    if (error === undefined) {
      throw new Error('error is undefined -- cannot execute _error')
    }
    // execute callback (such as onFailure handler)
    if (callback !== undefined) {
      callback(error)
      return
    }
    // if error listener(s) registered, then throw error event
    if (object.listeners('error').length > 0) {
      object.emit('error', error)
      return
    }
    // else throw exception
    throw new Error(error)
  }
}

function generateSessionId () {
  return hat(32, 16)
}

function generateStreamId () {
  return hat(32, 16)
}

function generateTransactionId () {
  return hat(8, 16)
}

/** from http://stackoverflow.com/questions/4994201/is-object-empty */

// Speed up calls to hasOwnProperty
var hasOwnProperty = Object.prototype.hasOwnProperty

var isEmpty = function (obj) {
  // null and undefined are "empty"
  if (obj === null) {
    return true
  }

  // Assume if it has a length property with a non-zero value
  // that that property is correct.
  if (obj.length > 0) {
    return false
  }
  if (obj.length === 0) {
    return true
  }

  // Otherwise, does it have any properties of its own?
  // Note that this doesn't handle
  // toString and valueOf enumeration bugs in IE < 9
  for (var key in obj) {
    if (hasOwnProperty.call(obj, key)) return false
  }

  return true
}

module.exports.mixinEventEmitterErrorFunction = mixinEventEmitterErrorFunction
module.exports.generateSessionId = generateSessionId
module.exports.generateStreamId = generateStreamId
module.exports.generateTransactionId = generateTransactionId
module.exports.isEmpty = isEmpty
module.exports.version = version
