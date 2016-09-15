'use strict'

if (typeof window !== 'undefined') {
  module.exports = require('./info-browser')
} else {
  module.exports = require('./info-nodejs')
}
