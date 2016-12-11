'use strict'

var util = require('util')
var WebSocketSignaling = require('../../../lib/signaling/out-of-band/websocket')

function FilteringWebSocketSignaling (args) {
  if (!(this instanceof FilteringWebSocketSignaling)) {
    return new FilteringWebSocketSignaling(args)
  }
  // init
  this._filter = (args.filter === undefined) ? function () { return false } : args.filter
  WebSocketSignaling.call(this, args)
}

// Inherit EventEmitter
util.inherits(FilteringWebSocketSignaling, WebSocketSignaling)

// do not fire an error when a message was not properly delivered
FilteringWebSocketSignaling.prototype.send = function (message, destinationInfo, onSuccess, onFailure) {
  // if message passes the filter test
  if (this._args.filter(message)) {
    console.log('IGNORING message ' + JSON.stringify(message))
    // then return -- dropping request on the floor
    return
  }
  FilteringWebSocketSignaling.super_.prototype.send.call(this, message, destinationInfo, onSuccess, onFailure)
}

module.exports = FilteringWebSocketSignaling
