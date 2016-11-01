'use strict'

var myUtils = require('../../utils')
var netstring = require('netstring-stream')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var DUMMY_SESSION_ID = 0
var DUMMY_TRANSACTION_ID = 0

function SignalingFactory() {
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:signaling:message'
  })
}

SignalingFactory.MESSAGE = {
  SYN: 0x0000,
  SYN_ACK: 0x0001,
  DATA: 0x0010,
  FIN: 0x0011,
  RST: 0x0100,
  ACK: 0x0101
}

SignalingFactory.CODES = []
for (var type in SignalingFactory.MESSAGE) {
  SignalingFactory.CODES.push(SignalingFactory.MESSAGE[type])
}

SignalingFactory.prototype.createSynPacket = function (sessionId, transactionId) {
  this._log.debug('creating SYN message')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = this._createOneTpPacket(SignalingFactory.MESSAGE.SYN, sessionId, transactionIdBytes)
  // done
  return data
}

SignalingFactory.prototype.createSynAckPacket = function (sessionId, transactionId) {
  this._log.debug('creating SYN-ACK message')
  // message type
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = this._createOneTpPacket(SignalingFactory.MESSAGE.SYN_ACK, sessionId, transactionIdBytes)
  // done
  return data
}

SignalingFactory.prototype.createDataPacket = function (sessionId, chunk) {
  this._log.debug('creating DATA message')
  // data chunk
  var chunkBytes = netstring.write(chunk)
  // create byte buffer
  var data = this._createOneTpPacket(SignalingFactory.MESSAGE.DATA, sessionId, chunkBytes)
  // done
  return data
}

SignalingFactory.prototype.createFinPacket = function (sessionId, transactionId) {
  this._log.debug('creating FIN message')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = this._createOneTpPacket(SignalingFactory.MESSAGE.FIN, sessionId, transactionIdBytes)
  // done
  return data
}

SignalingFactory.prototype.createRstPacket = function (sessionId, transactionId) {
  this._log.debug('creating RST message')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = this._createOneTpPacket(SignalingFactory.MESSAGE.RST, sessionId, transactionIdBytes)
  // done
  return data
}

SignalingFactory.prototype.createAckPacket = function (sessionId, transactionId) {
  this._log.debug('creating ACK message')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = this._createOneTpPacket(SignalingFactory.MESSAGE.ACK, sessionId, transactionIdBytes)
  // done
  return data
}

SignalingFactory.prototype._createOneTpPacket = function (type, sessionId, payloadBytes) {
  if (sessionId === undefined || sessionId === null) {
    sessionId = DUMMY_SESSION_ID
  }
  // message type
  var typeByte = new Buffer(2)
  typeByte.writeUInt16BE(type)
  // version number
  var versionBytes = netstring.write(myUtils.version)
  // session id
  var sessionIdBytes = netstring.write(sessionId)
  // create byte buffer
  var data = Buffer.concat([typeByte, versionBytes, sessionIdBytes, payloadBytes])
  // done
  return data
}

SignalingFactory.prototype.parse = function (bytes) {
  var result = {}
  var offset = 2
  // message type
  var type = bytes.slice(0, offset).readUInt16BE(0)
  if (!SignalingFactory._isOneTpPacket(type)) {
    this._log.debug('this is not a 1tp signaling packet')
    return
  }
  result.type = type
  // version number
  var otherBytes = bytes.slice(offset, bytes.length)
  var params = netstring.read(otherBytes)
  var versionBytes = params[0]
  result.version = versionBytes.toString()
  // session id
  var sessionIdBytes = params[1]
  result.sessionId = sessionIdBytes.toString()
  // payload
  var payloadBytes = params[2]
  if (SignalingFactory._isDataPacket(type)) {
    result.bytes = payloadBytes
  } else {
    result.transactionId = payloadBytes.toString()
  }
  // done
  return result
}

SignalingFactory._isOneTpPacket = function (type) {
  return (SignalingFactory.CODES.indexOf(type) > -1)
}

SignalingFactory._isDataPacket = function (type) {
  return type === SignalingFactory.MESSAGE.DATA
}

module.exports = SignalingFactory
