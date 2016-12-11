'use strict'

var util = require('util')
var signalingFactory = require('../../../lib/signaling/in-band/factory')
var UdpSession = require('../../../lib/transports/session/udp')

function FilteringUdpSession (peerAddress, sessionId, socket, args) {
  if (!(this instanceof FilteringUdpSession)) {
    return new FilteringUdpSession(peerAddress, sessionId, socket, args)
  }
  // init
  this.filter = function () {
    // drop no messages
    return false
  }
  UdpSession.call(this, args)
}

// Inherit from UdpSession
util.inherits(FilteringUdpSession, UdpSession)

FilteringUdpSession.prototype._sendSignalingMessageReliablyP = function (bytes, transactionId) {
  var message = signalingFactory.parse(bytes)
  // if message passes the filter test
  if (this.filter(message)) {
    console.log('FilteringUdpSession -- IGNORING message ' + JSON.stringify(message))
    // then return -- dropping request on the floor
    return
  }
  return FilteringUdpSession.super_.prototype._sendSignalingMessageReliablyP.call(this, bytes, transactionId)
}
