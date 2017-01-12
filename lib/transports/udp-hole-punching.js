'use strict'

var AbstractTransport = require('./abstract')
var merge = require('merge')
var myUtils = require('../utils')
var OneTpError = require('../error')
var Q = require('q')
var runtime = require('mm-runtime-info')
var UdpHolePuncher = require('udp-hole-puncher')
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

function UdpHolePunchingTransport (args) {
  if (!(this instanceof UdpHolePunchingTransport)) {
    return new UdpHolePunchingTransport(args)
  }
  AbstractTransport.call(this)
  // verify runtime compatibility
  if (!UdpHolePunchingTransport.isCompatibleWithRuntime()) {
    var errorMsg = 'UdpHolePunching transport cannot be used on this runtime'
    this._error(errorMsg)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:udp-hole-punching'
  })
  // verify signaling args
  if (args.signaling === undefined) {
    var signalingArgsError = 'incorrect args: signaling is undefined'
    this._log.error(signalingArgsError)
    throw new Error(signalingArgsError)
  }
  // merge args
  this._args = merge(Object.create(UdpHolePunchingTransport.DEFAULTS), args)
  // init
  // TODO
}

// Inherit from abstract transport
util.inherits(UdpHolePunchingTransport, AbstractTransport)

UdpHolePunchingTransport.DEFAULTS = {
  // TODO
}

UdpTransport.isCompatibleWithRuntime = function () {
  return !runtime.isBrowser()
}

UdpHolePunchingTransport.prototype.transportType = function () {
  return 'udp-hole-punching'
}

UdpHolePunchingTransport.prototype.listen = function (listeningInfo, onSuccess, onFailure) {
  // TODO
}

UdpHolePunchingTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
  // TODO
}

UdpHolePunchingTransport.prototype.abort = function (peerConnectionInfo, onSuccess, onFailure) {
  // TODO
}

UdpHolePunchingTransport.prototype.close = function (onSuccess, onFailure) {
  // TODO
}


module.exports = UdpHolePunchingTransport
