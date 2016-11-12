'use strict'

var events = require('events')
var myUtils = require('../lib/utils')
var Q = require('q')
var util = require('util')

var chai = require('chai')
var expect = chai.expect

var errorMsg = 'Oh ow'

describe('utils module', function () {
  it('should exec error handler', function (done) {
    var testObject = new TestObject()
    myUtils.mixinEventEmitterErrorFunction(testObject)
    var onError = function (error) {
      expect(error).to.equal(errorMsg)
      done()
    }
    testObject.doSomethingWrong(errorMsg, onError)
  })

  it('should fire a test error event', function (done) {
    var testObject = new TestObject()
    myUtils.mixinEventEmitterErrorFunction(testObject)
    testObject.on('error', function (error) {
      expect(error).to.equal(errorMsg)
      done()
    })
    testObject.doSomethingWrong(errorMsg)
  })

  it('should throw a test error', function (done) {
    var testObject = new TestObject()
    myUtils.mixinEventEmitterErrorFunction(testObject)
    expect(testObject.doSomethingWrong).to.throw(Error)
    done()
  })

  it('should complain about incorrect object type', function (done) {
    var fn = function () {
      myUtils.mixinEventEmitterErrorFunction('foo')
    }
    expect(fn).to.throw(Error)
    done()
  })

  it('should complain about undefined object', function (done) {
    var fn = function () {
      myUtils.mixinEventEmitterErrorFunction()
    }
    expect(fn).to.throw(Error)
    done()
  })

  it('should resolve timeout test promise properly', function (done) {
    var testPromise = Q.fcall(function () {
      console.log('promise resolved')
      return 'promise resolved'
    })
    var timeoutPromise = myUtils.resolvePromiseOnTimeout(testPromise, 500)
    timeoutPromise.then(function (result) {
      expect(result).to.not.be.undefined
      expect(result).to.equal('promise resolved')
      done()
    }).catch(function (error) {
      done(error)
    })
  })

  it('should resolve timeout test promise properly, delaying test promise', function (done) {
    var testPromise = Q.fcall(function () {
      console.log('promise resolved')
      return 'promise resolved'
    })
    var delayedTestPromise = Q.delay(100).then(function () {
      return testPromise
    })
    var timeoutPromise = myUtils.resolvePromiseOnTimeout(delayedTestPromise, 500)
    timeoutPromise.then(function (result) {
      expect(result).to.not.be.undefined
      expect(result).to.equal('promise resolved')
      done()
    }).catch(function (error) {
      done(error)
    })
  })

  it('should resolve timeout test promise, resolving undefined resulting from a timeout', function (done) {
    var timeoutCallbackExecuted = false
    var testPromise = Q.fcall(function () {
      console.log('promise resolved')
      return 'promise resolved'
    })
    var delayedTestPromise = Q.delay(1500).then(function () {
      console.log('1500 ms later ...')
      return testPromise
    })
    var onTimeoutP = Q.fcall(function () {
      timeoutCallbackExecuted = true
    })
    var timeoutPromise = myUtils.resolvePromiseOnTimeout(delayedTestPromise, 500, onTimeoutP)
    timeoutPromise.then(function (result) {
      expect(result).to.be.undefined
      expect(timeoutCallbackExecuted).to.be.true
      done()
    }).catch(function (error) {
      done(error)
    })
  })
})

function TestObject () {
  events.EventEmitter.call(this)
}

// Inherit EventEmitter
util.inherits(TestObject, events.EventEmitter)

TestObject.prototype.doSomethingWrong = function (errorMsg, callback) {
  this._error(errorMsg, callback)
}
