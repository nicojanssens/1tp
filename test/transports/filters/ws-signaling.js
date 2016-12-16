'use strict'

var util = require('util')
var WebSocketSignaling = require('../../../lib/signaling/out-of-band/websocket')

function FilteringWebSocketSignaling (args) {
  if (!(this instanceof FilteringWebSocketSignaling)) {
    return new FilteringWebSocketSignaling(args)
  }
  // init
  this.filter = function () {
    // drop no messages
    return false
  }
  WebSocketSignaling.call(this, args)
}

// Inherit from WebSocketSignaling
util.inherits(FilteringWebSocketSignaling, WebSocketSignaling)

// do not fire an error when a message was not properly delivered
FilteringWebSocketSignaling.prototype.send = function (message, destinationInfo, onSuccess, onFailure) {
  // if message passes the filter test
  if (this.filter(message)) {
    console.log('FilteringWebSocketSignaling -- IGNORING message ' + JSON.stringify(message))
    // then return -- dropping request on the floor
    onSuccess()
    return
  }
  // console.log('FilteringWebSocketSignaling -- SENDING message ' + JSON.stringify(message))
  FilteringWebSocketSignaling.super_.prototype.send.call(this, message, destinationInfo, onSuccess, onFailure)
}

module.exports = FilteringWebSocketSignaling
