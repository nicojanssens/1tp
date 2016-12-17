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
})

function TestObject () {
  events.EventEmitter.call(this)
}

// Inherit EventEmitter
util.inherits(TestObject, events.EventEmitter)

TestObject.prototype.doSomethingWrong = function (errorMsg, callback) {
  this._error(errorMsg, callback)
}
