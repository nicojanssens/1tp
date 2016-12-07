'use strict'

var AbstractSignaling = require('./abstract')
var hat = require('hat')
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

var SIGNALING_TYPE = 'local-signaling'

function LocalSignaling () {
  if (!(this instanceof LocalSignaling)) {
    return new LocalSignaling()
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:signaling:out-of-band:local'
  })
  // init
  this._listeners = {}
  AbstractSignaling.call(this)
  // done
  this._log.debug('Created local signaling connector')
}

// Inherit EventEmitter
util.inherits(LocalSignaling, AbstractSignaling)

LocalSignaling.prototype.register = function (callback, requestedRegistrationInfo, onSuccess, onFailure) {
  var uid
  if (requestedRegistrationInfo !== undefined) {
    // verify registration info
    if (requestedRegistrationInfo.type !== SIGNALING_TYPE) {
      var signalingTypeError = 'incorrect registrationInfo: unexpected transportType -- ignoring request'
      this._log.error(signalingTypeError)
      this._error(signalingTypeError, onFailure)
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
  registrationInfo.type = SIGNALING_TYPE
  registrationInfo.uid = uid
  onSuccess(registrationInfo)
}

LocalSignaling.prototype.deregister = function (registrationInfo, onSuccess, onFailure) {
  if (registrationInfo.type !== SIGNALING_TYPE) {
    var signalingTypeError = 'incorrect destinationInfo: unexpected signaling type -- ignoring request'
    this._log.error(signalingTypeError)
    this._error(signalingTypeError, onFailure)
  }
  if (registrationInfo.uid === undefined) {
    var signalingIdError = 'incorrect destinationInfo: undefined uid -- ignoring request'
    this._log.error(signalingIdError)
    this._error(signalingIdError, onFailure)
  }
  delete this._listeners[registrationInfo.uid]
  onSuccess()
}

LocalSignaling.prototype.send = function (message, destinationInfo, onSuccess, onFailure) {
  if (destinationInfo.type !== SIGNALING_TYPE) {
    var signalingTypeError = 'incorrect destinationInfo: unexpected signaling type -- ignoring request'
    this._log.error(signalingTypeError)
    this._error(signalingTypeError, onFailure)
  }
  if (destinationInfo.uid === undefined) {
    var signalingIdError = 'incorrect destinationInfo: undefined uid -- ignoring request'
    this._log.error(signalingIdError)
    this._error(signalingIdError, onFailure)
  }
  var callback = this._listeners[destinationInfo.uid]
  if (callback === undefined) {
    var unknownIdError = 'incorrect destinationInfo: unknown uid -- ignoring request'
    this._log.error(unknownIdError)
    this._error(unknownIdError, onFailure)
  }
  this._log.debug('sending message ' + JSON.stringify(message) + ' to ' + JSON.stringify(destinationInfo))
  callback(message)
  onSuccess()
}

LocalSignaling.prototype.close = function (onSuccess, onFailure) {
  this._listeners = {}
  onSuccess()
}

module.exports = LocalSignaling
