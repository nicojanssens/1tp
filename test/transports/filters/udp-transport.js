'use strict'

var signalingFactory = require('../../../lib/signaling/in-band/factory')
var util = require('util')
var UdpTransport = require('../../../lib/transports/udp')

function FilteringUdpTransport (args) {
  if (!(this instanceof FilteringUdpTransport)) {
    return new FilteringUdpTransport(args)
  }
  // init
  this.filter = function () {
    // drop no messages
    return false
  }
  UdpTransport.call(this, args)
}

// Inherit from UdpSession
util.inherits(FilteringUdpTransport, UdpTransport)

FilteringUdpTransport.prototype._onIncomingBytes = function (bytes, rinfo) {
  var message = signalingFactory.parse(bytes)
  // if message passes the filter test
  if (this.filter(message)) {
    console.log('FilteringUdpTransport -- IGNORING message ' + JSON.stringify(message))
    // then return -- dropping request on the floor
    return
  }
  FilteringUdpTransport.super_.prototype._onIncomingBytes.call(this, bytes, rinfo)
}

FilteringUdpTransport.prototype.dropMessage = function (messageType) {
  this.filter = function (message) {
    if (message.type === messageType) {
      return true
    }
  }
}

module.exports = FilteringUdpTransport
