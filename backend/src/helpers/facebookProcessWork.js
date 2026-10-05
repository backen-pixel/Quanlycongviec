'use strict';
module.exports = require('./processWork').createProcessWork({
  scope: 'FACEBOOK_LEGACY_THIS_PROCESS',
  onError: code => console.warn('[FB legacy]', code),
});
