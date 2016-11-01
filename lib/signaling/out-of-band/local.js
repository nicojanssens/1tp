'use strict'

var AbstractSignaling = require('./abstract')
var hat = require('hat')
var util = require('util')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var signalingType = 'local-signaling'

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
    if (requestedRegistrationInfo.type !== signalingType) {
      var signalingTypeError = 'incorrect registrationInfo: unexpected transportType -- ignoring request'
      this._log.error(signalingTypeError)
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
    this._log.error(signalingTypeError)
    onFailure(signalingTypeError)
  }
  if (registrationInfo.uid === undefined) {
    var signalingIdError = 'incorrect destinationInfo: undefined uid -- ignoring request'
    this._log.error(signalingIdError)
    onFailure(signalingIdError)
  }
  delete this._listeners[registrationInfo.uid]
}

LocalSignaling.prototype.send = function (message, destinationInfo, onSuccess, onFailure) {
  if (destinationInfo.type !== signalingType) {
    var signalingTypeError = 'incorrect destinationInfo: unexpected signaling type -- ignoring request'
    this._log.error(signalingTypeError)
    onFailure(signalingTypeError)
  }
  if (destinationInfo.uid === undefined) {
    var signalingIdError = 'incorrect destinationInfo: undefined uid -- ignoring request'
    this._log.error(signalingIdError)
    onFailure(signalingIdError)
  }
  var callback = this._listeners[destinationInfo.uid]
  if (callback === undefined) {
    var unknownIdError = 'incorrect destinationInfo: unknown uid -- ignoring request'
    this._log.error(unknownIdError)
    onFailure(unknownIdError)
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
