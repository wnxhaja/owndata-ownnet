// 'use strict';
const feathers = require('@feathersjs/feathers');
const { stripSlashes } = require('@feathersjs/commons');
const errors = require('@feathersjs/errors');
const adapterTests = require('./own-common/helpers/adapter-test');

const wrapperBasic = require('./own-common/helpers/wrapper-basic-test');
const ownWrapper = require('./own-common/helpers/own-wrapper-test');
const syncTests = require('./own-common/helpers/sync-test');
const eventsTests = require('./own-common/helpers/events-test');
const localStorageTests = require('./own-common/helpers/local-storage-test');
// const restTests = require('./own-common/helpers/rest-test');
// const socketioTests = require('./own-common/helpers/socket-io-test');
const makeWrapper = require('../lib/own-common');

let package = 'ownclass';
let verbose = false;
let app;

const OwnclassImpl = {};
OwnclassImpl.mixins = {
  _processQueuedEvents: async function() {
    return Promise.resolve(true);
  }
};
OwnclassImpl.must = [ '_processQueuedEvents' ];
OwnclassImpl.cond = [];


// function completeAssign(target, ...sources) {
//   sources.forEach(source => {
//     let descriptors = Object.keys(source).reduce((descriptors, key) => {
//       descriptors[key] = Object.getOwnPropertyDescriptor(source, key);
//       return descriptors;
//     }, {});

//     // By default, Object.assign copies enumerable Symbols, too
//     Object.getOwnPropertySymbols(source).forEach(sym => {
//       let descriptor = Object.getOwnPropertyDescriptor(source, sym);
//       if (descriptor.enumerable) {
//         descriptors[sym] = descriptor;
//       }
//     });
//     Object.defineProperties(target, descriptors);
//   });
//   return target;
// }


const ownclassWrapper = makeWrapper(OwnclassImpl, package);
const init = ownclassWrapper;
//init.Service = (opts) => {class x extends OwnclassClass {constructor() {super(opts)}}};


describe(`${package}Wrapper tests`, () => {
  app = feathers();

  after(() => {
    console.log(`Wrapped paths: ${ownclassWrapper.getWrapped().join(', ')}.`);
  })

  adapterTests(`${package}Wrapper adapterTests`, app, errors, ownclassWrapper, 'people');
  // adapterTests(`${package}Wrapper adapterTests`, app, errors, ownclassWrapper, 'people-customId', 'customId');
  // adapterTests(`${package}Wrapper adapterTests`, app, errors, ownclassWrapper, 'people-uuid', 'uuid');

  // wrapperBasic(`${package}Wrapper basic functionality`, app, errors, ownclassWrapper, 'wrapperBasic', verbose);
  // ownWrapper(`${package}Wrapper specific functionality`, app, errors, ownclassWrapper, 'ownWrapper', verbose, true);
  syncTests(`${package}Wrapper sync functionality`, app, errors, init, 'syncTests', verbose, 9100, true);
  // eventsTests(`${package}Wrapper events functionality`, app, errors, ownclassWrapper, 'wrapperEvents', verbose);
  // localStorageTests(`${package}Wrapper storage functionality`, app, errors, ownclassWrapper, 'wrapperStorage', verbose);
  // restTests(`${package}Wrapper REST functionality`, app, errors, ownclassWrapper, 'wrapperREST', verbose, 7886, true);
  // socketioTests(`${package}Wrapper socket.io functionality`, app, errors, ownclassWrapper, 'wrapperSocketIo', verbose, 7886, true);

})
