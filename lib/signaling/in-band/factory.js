'use strict'

var myUtils = require('../../utils')
var netstring = require('netstring-stream')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:signaling:in-band:factory'
})

var DUMMY_SESSION_ID = 0
var DUMMY_TRANSACTION_ID = 0

var MESSAGE = {
  SYN: 0x0000,
  SYN_ACK: 0x0001,
  DATA: 0x0010,
  FIN: 0x0011,
  RST: 0x0100,
  ACK: 0x0101,
  PING: 0x0111,
  PONG: 0x1000
}

var CODES = []
for (var type in MESSAGE) {
  CODES.push(MESSAGE[type])
}

function createSynPacket (sessionId, transactionId) {
  _log.debug('creating SYN message')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = _createOneTpPacket(MESSAGE.SYN, sessionId, transactionIdBytes)
  // done
  return data
}

function createSynAckPacket (sessionId, transactionId) {
  _log.debug('creating SYN-ACK message')
  // message type
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = _createOneTpPacket(MESSAGE.SYN_ACK, sessionId, transactionIdBytes)
  // done
  return data
}

function createDataPacket (sessionId, chunk) {
  _log.debug('creating DATA message')
  // data chunk
  var chunkBytes = netstring.write(chunk)
  // create byte buffer
  var data = _createOneTpPacket(MESSAGE.DATA, sessionId, chunkBytes)
  // done
  return data
}

function createFinPacket (sessionId, transactionId) {
  _log.debug('creating FIN message')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = _createOneTpPacket(MESSAGE.FIN, sessionId, transactionIdBytes)
  // done
  return data
}

function createRstPacket (sessionId, transactionId) {
  _log.debug('creating RST message')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = _createOneTpPacket(MESSAGE.RST, sessionId, transactionIdBytes)
  // done
  return data
}

function createAckPacket (sessionId, transactionId) {
  _log.debug('creating ACK message')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = _createOneTpPacket(MESSAGE.ACK, sessionId, transactionIdBytes)
  // done
  return data
}

function createPingPacket (sessionId) {
  _log.debug('creating PING message')
  // dummy playload
  var payloadBytes = netstring.write(0)
  // create byte buffer
  var data = _createOneTpPacket(MESSAGE.PING, sessionId, payloadBytes)
  // done
  return data
}

function createPongPacket (sessionId) {
  _log.debug('creating PONG message')
  // dummy playload
  var payloadBytes = netstring.write(0)
  // create byte buffer
  var data = _createOneTpPacket(MESSAGE.PONG, sessionId, payloadBytes)
  // done
  return data
}

function _createOneTpPacket (type, sessionId, payloadBytes) {
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

function parse (bytes) {
  var result = {}
  var offset = 2
  // message type
  var type = bytes.slice(0, offset).readUInt16BE(0)
  if (!_isOneTpPacket(type)) {
    _log.debug('this is not a 1tp signaling packet')
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
  if (_isDataPacket(type)) {
    result.bytes = payloadBytes
  } else {
    result.transactionId = payloadBytes.toString()
  }
  // done
  return result
}

function _isOneTpPacket (type) {
  return (CODES.indexOf(type) > -1)
}

function _isDataPacket (type) {
  return type === MESSAGE.DATA
}

module.exports.MESSAGE = MESSAGE
module.exports.createSynPacket = createSynPacket
module.exports.createSynAckPacket = createSynAckPacket
module.exports.createDataPacket = createDataPacket
module.exports.createFinPacket = createFinPacket
module.exports.createRstPacket = createRstPacket
module.exports.createAckPacket = createAckPacket
module.exports.createPingPacket = createPingPacket
module.exports.createPongPacket = createPongPacket
module.exports.parse = parse
