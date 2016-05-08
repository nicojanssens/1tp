'use strict'

var AbstractSignaling = require('./abstract')
var hat = require('hat')
var util = require('util')

var signalingType = 'local-signaling'

var debug = require('debug')
var debugLog = debug('1tp:transports:signaling:local')
var errorLog = debug('1tp:transports:signaling:local:error')

function LocalSignaling () {
  if (!(this instanceof LocalSignaling)) {
    return new LocalSignaling()
  }
  this._listeners = {}
  AbstractSignaling.call(this)
  debugLog('Created local signaling connector')
}

// Inherit EventEmitter
util.inherits(LocalSignaling, AbstractSignaling)

LocalSignaling.prototype.register = function (callback, requestedRegistrationInfo, onSuccess, onFailure) {
  var uid
  if (requestedRegistrationInfo !== undefined) {
    // verify registration info
    if (requestedRegistrationInfo.type !== signalingType) {
      var signalingTypeError = 'incorrect registrationInfo: unexpected transportType -- ignoring request'
      errorLog(signalingTypeError)
      onFailure(signalingTypeError)
      return
    }
    uid = requestedRegistrationInfo.uid
  }
  // create random uid if undefined
  uid = uid || hat()
  // register callback
  this._listeners[uid] = callback
  // return actual registration info
  var registrationInfo = {}
  registrationInfo.type = signalingType
  registrationInfo.uid = uid
  onSuccess(registrationInfo)
}

LocalSignaling.prototype.deregister = function (registrationInfo, onSuccess, onFailure) {
  if (registrationInfo.type !== signalingType) {
    var signalingTypeError = 'incorrect destinationInfo: unexpected signaling type -- ignoring request'
    errorLog(signalingTypeError)
    onFailure(signalingTypeError)
  }
  if (registrationInfo.uid === undefined) {
    var signalingIdError = 'incorrect destinationInfo: undefined uid -- ignoring request'
    errorLog(signalingIdError)
    onFailure(signalingIdError)
  }
  delete this._listeners[registrationInfo.uid]
}

LocalSignaling.prototype.send = function (message, destinationInfo, onSuccess, onFailure) {
  if (destinationInfo.type !== signalingType) {
    var signalingTypeError = 'incorrect destinationInfo: unexpected signaling type -- ignoring request'
    errorLog(signalingTypeError)
    onFailure(signalingTypeError)
  }
  if (destinationInfo.uid === undefined) {
    var signalingIdError = 'incorrect destinationInfo: undefined uid -- ignoring request'
    errorLog(signalingIdError)
    onFailure(signalingIdError)
  }
  var callback = this._listeners[destinationInfo.uid]
  if (callback === undefined) {
    var unknownIdError = 'incorrect destinationInfo: unknown uid -- ignoring request'
    errorLog(unknownIdError)
    onFailure(unknownIdError)
  }
  debugLog('sending message ' + JSON.stringify(message) + ' to ' + JSON.stringify(destinationInfo))
  callback(message)
  onSuccess()
}

LocalSignaling.prototype.close = function (onSuccess, onFailure) {
  this._listeners = {}
  onSuccess()
}

module.exports = LocalSignaling
