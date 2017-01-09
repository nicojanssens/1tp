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
  // udp
  SYN: 0b0000,
  SYN_ACK: 0b0001,
  // udp and turn
  DATA: 0b0010,
  FIN: 0b0011,
  RST: 0b0100,
  ACK: 0b0101,
  // 1tp server and socket
  PING: 0b1000,
  PONG: 0b1001
}

var CODES = []
for (var type in MESSAGE) {
  CODES.push(MESSAGE[type])
}

// TRANSPORT MESSAGES //

function createSynPacket (sessionId, transactionId) {
  _log.debug('creating SYN packet')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = _createTransportPacket(MESSAGE.SYN, sessionId, transactionIdBytes)
  // done
  return data
}

function createSynAckPacket (sessionId, transactionId) {
  _log.debug('creating SYN-ACK packet')
  // message type
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = _createTransportPacket(MESSAGE.SYN_ACK, sessionId, transactionIdBytes)
  // done
  return data
}

function createDataPacket (sessionId, chunk) {
  _log.debug('creating DATA packet')
  // data chunk
  var chunkBytes = netstring.write(chunk)
  // create byte buffer
  var data = _createTransportPacket(MESSAGE.DATA, sessionId, chunkBytes)
  // done
  return data
}

function createFinPacket (sessionId, transactionId) {
  _log.debug('creating FIN packet')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = _createTransportPacket(MESSAGE.FIN, sessionId, transactionIdBytes)
  // done
  return data
}

function createRstPacket (sessionId, transactionId) {
  _log.debug('creating RST packet')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = _createTransportPacket(MESSAGE.RST, sessionId, transactionIdBytes)
  // done
  return data
}

function createAckPacket (sessionId, transactionId) {
  _log.debug('creating ACK packet')
  // check variables
  if (transactionId === undefined || transactionId === null) {
    transactionId = DUMMY_TRANSACTION_ID
  }
  // transaction id
  var transactionIdBytes = netstring.write(transactionId)
  // create byte buffer
  var data = _createTransportPacket(MESSAGE.ACK, sessionId, transactionIdBytes)
  // done
  return data
}

function _createTransportPacket (type, sessionId, payloadBytes) {
  if (sessionId === undefined || sessionId === null) {
    sessionId = DUMMY_SESSION_ID
  }
  // message type
  var typeByte = new Buffer(1)
  typeByte.writeUInt8(type)
  // version number
  var versionBytes = netstring.write(myUtils.version)
  // session id
  var sessionIdBytes = netstring.write(sessionId)
  // create byte buffer
  var data = Buffer.concat([typeByte, versionBytes, sessionIdBytes, payloadBytes])
  // done
  return data
}

function parseTransportPacket (bytes) {
  var result = {}
  // message type
  var type = bytes.slice(0, 1).readUInt8(0)
  if (!_isSignalingPacket(type)) {
    _log.debug('this is not a 1tp signaling packet')
    return
  }
  result.type = type
  // version number
  var otherBytes = bytes.slice(1, bytes.length)
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

function _isSignalingPacket (type) {
  return (CODES.indexOf(type) > -1)
}

function _isDataPacket (type) {
  return type === MESSAGE.DATA
}


// 1TP SERVER/SOCKET MESSAGES

function createPingPacket () {
  _log.debug('creating PING packet')
  // message type
  var typeByte = new Buffer(1)
  typeByte.writeUInt8(MESSAGE.PING)
  // done
  return typeByte
}

function createPongPacket () {
  _log.debug('creating PONG packet')
  // message type
  var typeByte = new Buffer(1)
  typeByte.writeUInt8(MESSAGE.PONG)
  // done
  return typeByte
}

function wrapDataPacket (chunk) {
  _log.debug('wrapping DATA packet')
  // message type
  var typeByte = new Buffer(1)
  typeByte.writeUInt8(MESSAGE.DATA)
  // data chunk
  var chunkBytes = netstring.write(chunk)
  // create byte buffer
  var data = Buffer.concat([typeByte, chunkBytes])
  // done
  return data
}

function parseSocketPacket (bytes) {
  var result = {}
  // message type
  var type = bytes.slice(0, 1).readUInt8(0)
  if ([MESSAGE.PING, MESSAGE.PONG, MESSAGE.DATA].indexOf(type) === -1) {
    _log.debug('this is not a socket packet')
    return
  }
  result.type = type
  if (type === MESSAGE.DATA) {
    var payloadBytes = bytes.slice(1, bytes.length)
    var payload = netstring.read(payloadBytes)
    result.data = payload[0]
  }
  return result
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
module.exports.wrapDataPacket = wrapDataPacket
module.exports.parseTransportPacket = parseTransportPacket
module.exports.parseSocketPacket = parseSocketPacket
