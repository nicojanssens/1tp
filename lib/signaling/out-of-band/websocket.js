'use strict'

var AbstractSignaling = require('./abstract')
var hat = require('hat')
var io = require('socket.io-client')
var merge = require('merge')
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

var SIGNALING_TYPE = 'websocket-signaling'

function WebSocketSignaling (args) {
  if (!(this instanceof WebSocketSignaling)) {
    return new WebSocketSignaling(args)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:signaling:out-of-band:websocket'
  })
  // init
  this._args = merge(Object.create(WebSocketSignaling.DEFAULTS), args)
  AbstractSignaling.call(this)
  // done
  this._log.debug('created websocket signaling connector with args ' + JSON.stringify(this._args))
}

WebSocketSignaling.DEFAULTS = {
  url: 'http://1tp-registrar.microminion.io',
  reconnectionDelay: 0,
  reopenDelay: 0,
  forceNewConnection: true
}

// Inherit EventEmitter
util.inherits(WebSocketSignaling, AbstractSignaling)

WebSocketSignaling.prototype.register = function (callback, requestedRegistrationInfo, onSuccess, onFailure) {
  var uid, url
  if (this._socket) {
    var onlyOneConnectionError = 'only one connection allowed -- ignoring request'
    this._log.error(onlyOneConnectionError)
    this._error(onlyOneConnectionError, onFailure)
  }
  if (requestedRegistrationInfo !== undefined) {
    // verify registration info
    if (requestedRegistrationInfo.type !== SIGNALING_TYPE) {
      var signalingTypeError = 'incorrect registrationInfo: unexpected transportType -- ignoring request'
      this._log.error(signalingTypeError)
      this._error(signalingTypeError, onFailure)
      return
    }
    uid = requestedRegistrationInfo.uid
    url = requestedRegistrationInfo.url
  }
  // create random uid if undefined
  uid = uid || this._args.uid || hat()
  // use default websocket url if undefined
  url = url || this._args.url
  // create new registration info instance to be returned once registration succeeds
  var registrationInfo = {}
  registrationInfo.type = SIGNALING_TYPE
  registrationInfo.uid = uid
  registrationInfo.url = url
  // create socket
  var socket = io.connect(url, {
    'reconnection delay': this._args.reconnectionDelay,
    'reopen delay': this._args.reopenDelay,
    'force new connection': this._args.forceNewConnection
  })
  socket.on('connect', this.onConnected(callback, registrationInfo, onSuccess, onFailure))
  socket.on('disconnect', this.onDisconnected())
  socket.on('signaling', this.onIncomingMessage())
  socket.on('ping', this.onPing())
  this._socket = socket
}

WebSocketSignaling.prototype.deregister = function (registrationInfo, onSuccess, onFailure) {
  if (registrationInfo.type !== SIGNALING_TYPE) {
    var signalingTypeError = 'incorrect destinationInfo: unexpected signaling type -- ignoring request'
    this._log.error(signalingTypeError)
    this._error(signalingTypeError, onFailure)
  }
  if (registrationInfo.uid === undefined) {
    var undefinedSignalingIdError = 'incorrect destinationInfo: undefined uid -- ignoring request'
    this._log.error(undefinedSignalingIdError)
    this._error(undefinedSignalingIdError, onFailure)
  }
  if (registrationInfo.uid !== this._uid) {
    var unknownSignalingIdError = 'incorrect destinationInfo: unknown uid -- ignoring request'
    this._log.error(unknownSignalingIdError)
    this._error(unknownSignalingIdError, onFailure)
  }
  // send deregistration message over socket
  var deregistrationMsg = {}
  deregistrationMsg.username = registrationInfo.uid
  var self = this
  this._socket.emit('deregistration',
    deregistrationMsg,
    function (response, message) {
      // failure
      if (response !== '200') {
        var deregistrationError = 'deregistration failure: ' + message
        self._log.error(deregistrationError)
        self._error(deregistrationError, onFailure)
      }
      // success
      self._callback = undefined
      self._uid = undefined
      onSuccess()
    }
  )
}

WebSocketSignaling.prototype.send = function (message, destinationInfo, onSuccess, onFailure) {
  if (!this._callback) {
    var notRegisteredError = 'cannot send message when socket is not registered -- ignoring request'
    this._log.error(notRegisteredError)
    this._error(notRegisteredError, onFailure)
  }
  if (destinationInfo.type !== SIGNALING_TYPE) {
    var signalingTypeError = 'incorrect destinationInfo: unexpected signaling type -- ignoring request'
    this._log.error(signalingTypeError)
    this._error(signalingTypeError, onFailure)
  }
  if (destinationInfo.uid === undefined) {
    var unknownSignalingIdError = 'incorrect destinationInfo: undefined uid -- ignoring request'
    this._log.error(unknownSignalingIdError)
    this._error(unknownSignalingIdError, onFailure)
  }
  var signalingMsg = {}
  signalingMsg.content = message
  signalingMsg.to = destinationInfo.uid
  this._log.debug('sending message ' + JSON.stringify(signalingMsg))
  var self = this
  this._socket.emit('signaling',
    signalingMsg,
    function (response, message) {
      // failure
      if (response !== '200') {
        var sendError = 'Send error: ' + message
        self._log.error(sendError)
        self._error(sendError, onFailure)
      }
      // success
      onSuccess()
    }
  )
}

WebSocketSignaling.prototype.close = function (onSuccess, onFailure) {
  if (this._socket.connected) {
    this._socket.disconnect()
    this._socket = undefined
    this._callback = undefined
    this._uid = undefined
    onSuccess()
    return
  }
  this._log.debug('no connected socket found -- ignoring request')
  onSuccess()
}

WebSocketSignaling.prototype.onIncomingMessage = function () {
  var self = this
  return function (message, reply) {
    self._log.debug('incoming message ' + JSON.stringify(message))
    if (!self._callback) {
      var noRegisteredCallbackError = 'cannot find callback to pass message -- ignoring request'
      self._log.error(noRegisteredCallbackError)
      self._error(noRegisteredCallbackError)
    }
    self._callback(message.content)
    reply('200')
  }
}

WebSocketSignaling.prototype.onPing = function () {
  var self = this
  return function (message) {
    self._log.debug('incoming ping ' + JSON.stringify(message))
  }
}

WebSocketSignaling.prototype.onConnected = function (callback, registrationInfo, onSuccess, onFailure) {
  var self = this
  return function () {
    self._log.debug('connected to ' + self._args.url)
    // send registration message over socket
    var signalingMessage = {}
    signalingMessage.username = registrationInfo.uid
    self._socket.emit('registration',
      signalingMessage,
      function (response, message) {
        // failure
        if (response !== '200') {
          var registrationError = 'registration failure: ' + message
          self._log.error(registrationError)
          self._error(registrationError, onFailure)
        }
        // success
        self._callback = callback
        self._uid = registrationInfo.uid
        // done
        onSuccess(registrationInfo)
        self._log.debug('registration successful -- registrationInfo = ' + JSON.stringify(registrationInfo))
      }
    )
  }
}

WebSocketSignaling.prototype.onDisconnected = function () {
  var self = this
  return function () {
    self._log.debug('disconnected from ' + self._args.url)
  }
}

module.exports = WebSocketSignaling
