'use strict'

var Retry = require('../../lib/signaling/in-band/retry')

var chai = require('chai')
var expect = chai.expect

describe('Retry logic', function () {
  this.timeout(5000)

  var retry = new Retry()

  it('should reject in the absence of a confirmation', function (done) {
    var eventName = 1
    var operation = function () {
      console.log('promise execution')
    }
    retry.executeP(operation, eventName)
      .then(function () {
        var error = new Error('not expecting promise to resolve')
        done(error)
      })
      .catch(function (error) {
        if (error.message === 'giving up, no more retries left') {
          // this is the expected behavior
          done()
        } else {
          done(error)
        }
      })
  })

  it('should resolve when receiving a confirmation', function (done) {
    var eventName = 2
    var ticks = 0
    var operation = function () {
      console.log('promise execution')
      ticks++
    }
    retry.executeP(operation, eventName)
      .then(function () {
        expect(ticks).to.equal(3)
        done()
      })
      .catch(function (error) {
        done(error)
      })
    setTimeout(function () {
      retry.confirm(eventName)
    }, 1500)
  })

  it('should reject when the operation throws an error', function (done) {
    var eventName = 3
    var operation = function () {
      throw new Error('woops')
    }
    retry.executeP(operation, eventName)
      .then(function () {
        var error = new Error('not expecting promise to resolve')
        done(error)
      })
      .catch(function (error) {
        if (error.message === 'woops') {
          // this is the expected behavior
          done()
        } else {
          done(error)
        }
      })
  })
})
