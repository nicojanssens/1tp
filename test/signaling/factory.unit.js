'use strict'

var myUtils = require('../../lib/utils')
var signalingFactory = require('../../lib/signaling/in-band/factory')

var chai = require('chai')
var expect = chai.expect

var projectVersion = require('../../package.json').version

describe('Signaling factory', function () {
  this.timeout(2000)

  it('should correctly create and parse a SYN message', function () {
    var sessionId = myUtils.generateSessionId()
    var transactionId = myUtils.generateTransactionId()
    var data = signalingFactory.createSynPacket(sessionId, transactionId)
    expect(data).to.not.be.undefined
    var result = signalingFactory.parse(data)
    expect(result.type).to.equal(signalingFactory.MESSAGE.SYN)
    expect(result.version).to.equal(projectVersion)
    expect(result.sessionId).to.equal(sessionId)
    expect(result.transactionId).to.equal(transactionId)
  })

  it('should correctly create and parse a SYN-ACK message', function () {
    var sessionId = myUtils.generateSessionId()
    var transactionId = myUtils.generateTransactionId()
    var data = signalingFactory.createSynAckPacket(sessionId, transactionId)
    expect(data).to.not.be.undefined
    var result = signalingFactory.parse(data)
    expect(result.type).to.equal(signalingFactory.MESSAGE.SYN_ACK)
    expect(result.version).to.equal(projectVersion)
    expect(result.sessionId).to.equal(sessionId)
    expect(result.transactionId).to.equal(transactionId)
  })

  it('should correctly create and parse a ACK message', function () {
    var sessionId = myUtils.generateSessionId()
    var transactionId = myUtils.generateTransactionId()
    var data = signalingFactory.createAckPacket(sessionId, transactionId)
    expect(data).to.not.be.undefined
    var result = signalingFactory.parse(data)
    expect(result.type).to.equal(signalingFactory.MESSAGE.ACK)
    expect(result.version).to.equal(projectVersion)
    expect(result.sessionId).to.equal(sessionId)
    expect(result.transactionId).to.equal(transactionId)
  })

  it('should correctly create and parse a DATA message', function () {
    var chunk = new Buffer('DATA')
    var sessionId = myUtils.generateSessionId()
    var data = signalingFactory.createDataPacket(sessionId, chunk)
    expect(data).to.not.be.undefined
    var result = signalingFactory.parse(data)
    expect(result.type).to.equal(signalingFactory.MESSAGE.DATA)
    expect(result.version).to.equal(projectVersion)
    expect(result.sessionId).to.equal(sessionId)
    expect(result.bytes).to.deep.equal(chunk)
  })

  it('should correctly create and parse a FIN message', function () {
    var sessionId = myUtils.generateSessionId()
    var transactionId = myUtils.generateTransactionId()
    var data = signalingFactory.createFinPacket(sessionId, transactionId)
    expect(data).to.not.be.undefined
    var result = signalingFactory.parse(data)
    expect(result.type).to.equal(signalingFactory.MESSAGE.FIN)
    expect(result.version).to.equal(projectVersion)
    expect(result.sessionId).to.equal(sessionId)
    expect(result.transactionId).to.equal(transactionId)
  })

  it('should correctly create and parse a RST message', function () {
    var sessionId = myUtils.generateSessionId()
    var transactionId = myUtils.generateTransactionId()
    var data = signalingFactory.createRstPacket(sessionId, transactionId)
    expect(data).to.not.be.undefined
    var result = signalingFactory.parse(data)
    expect(result.type).to.equal(signalingFactory.MESSAGE.RST)
    expect(result.version).to.equal(projectVersion)
    expect(result.sessionId).to.equal(sessionId)
    expect(result.transactionId).to.equal(transactionId)
  })

})
