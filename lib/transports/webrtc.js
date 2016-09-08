'use strict'

var AbstractTransport = require('./abstract')
var util = require('util')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

function WebRtcTransport (args) {
  if (!(this instanceof WebRtcTransport)) {
    return new WebRtcTransport(args)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:webrtc'
  })
  // verify args
  if (
    args.turnServer === undefined ||
    args.turnPort === undefined ||
    args.turnUsername === undefined ||
    args.turnPassword === undefined
  ) {
    var turnArgsError = 'incorrect args: turnServer and/or turnPort and/or turnUsername and/or turnPassword are undefined'
    this._log.error(turnArgsError)
    throw new Error(turnArgsError)
  }
  if (args.signaling === undefined) {
    var signalingArgsError = 'incorrect args: signaling is undefined'
    this._log.error(signalingArgsError)
    throw new Error(signalingArgsError)
  }
  // TODO: init

  AbstractTransport.call(this)
  this._signaling = args.signaling
  // accept new incoming connections
  this._acceptIncomingConnections = true
  // done
  this._log.debug('created turn transport')
}

// Inherit from abstract transport
util.inherits(WebRtcTransport, AbstractTransport)

WebRtcTransport.prototype.transportType = function () {
  return 'webrtc'
}

WebRtcTransport.prototype.connectTimeout = function () {
  return 2000
}

WebRtcTransport.prototype.listen = function (listeningInfo, onSuccess, onFailure) {
  // TODO
}

WebRtcTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
  // TODO
}

WebRtcTransport.prototype.close = function (onSuccess, onFailure) {
  // TODO
}
