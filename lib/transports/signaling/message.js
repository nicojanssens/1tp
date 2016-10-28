'use strict'

var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

function SignalingMessage() {
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:signaling:message'
  })
}

SignalingMessage.TYPE = {
  SYN: 0x0000,
  SYN_ACK: 0x0001,
  DATA: 0x0010,
  FIN: 0x0011,
  RST: 0x0100,
  ACK: 0x0101
}

module.exports = SignalingMessage
