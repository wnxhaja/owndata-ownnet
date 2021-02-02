const debug = require('debug')('@feathersjs-offline:ownclass:local-storage');


if (typeof localStorage === 'undefined') {
  debug('Simulating localStorage...');
  const LocalStorage = require('node-localstorage').LocalStorage;
  global.localStorage = localStorage = new LocalStorage('./.scratch');
}
else {
  debug('Utilizing built-in localStorage (or reuse already simulated storage)');
}

module.exports = localStorage;