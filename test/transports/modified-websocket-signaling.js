'use strict'

var util = require('util')
var WebSocketSignaling = require('../../lib/signaling/out-of-band/websocket')

var SIGNALING_TYPE = 'websocket-signaling'

function ModifiedWebSocketSignaling (args) {
  if (!(this instanceof ModifiedWebSocketSignaling)) {
    return new ModifiedWebSocketSignaling(args)
  }
  // init
  WebSocketSignaling.call(this, args)
}

// Inherit EventEmitter
util.inherits(ModifiedWebSocketSignaling, WebSocketSignaling)

// do not fire an error when a message was not properly delivered
ModifiedWebSocketSignaling.prototype.send = function (message, destinationInfo, onSuccess, onFailure) {
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
        //self._error(sendError, onFailure)
      }
      // success
      onSuccess()
    }
  )
}

module.exports = ModifiedWebSocketSignaling
