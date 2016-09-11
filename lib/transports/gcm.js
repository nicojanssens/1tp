'use strict'

var AbstractTransport = require('./abstract')
var util = require('util')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

function GCMTransport (args) {
  if (!(this instanceof GCMTransport)) {
    return new GCMTransport(args)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:gcm'
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
  // TODO: init
  AbstractTransport.call(this)
  // accept new incoming connections
  this._acceptIncomingConnections = true
  // done
  this._log.debug('created gcm transport')
}

// Inherit from abstract transport
util.inherits(GCMTransport, AbstractTransport)

GCMTransport.prototype.transportType = function () {
  return 'gcm'
}

GCMTransport.prototype.connectTimeout = function () {
  return 1000 * 10
}

GCMTransport.prototype.listen = function (listeningInfo, onSuccess, onFailure) {
  // TODO
}

GCMTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
  // TODO
}

GCMTransport.prototype.close = function (onSuccess, onFailure) {
  // TODO
}

module.exports = GCMTransport
