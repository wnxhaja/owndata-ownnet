//'use strict';
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
const OwnClass = require('../lib/own-common');

let package = 'ownclass';
let verbose = false;
let app;

// OwnClass is not as such expected to be used as a wrapper,
// but we can coerce it in the name of rigorous testing
class OwnclassClass extends OwnClass {
  constructor (opts = {}) {
    super(opts);
    this.type = 'own-class';
    this.__forTestingOnly = super._processQueuedEvents;
  }

  async _processQueuedEvents () {
    return Promise.resolve(true);
  }
}

let ownclassWrapperPaths = {};
const ownclassSetupPaths = () => {
  // console.log(`RUNNING ownclassSetupPaths... ${JSON.stringify(ownclassWrapperPaths, null, 2)}`);
  Object.keys(ownclassWrapperPaths).forEach(type => Object.keys(ownclassWrapperPaths[type]).forEach(path => {
    let ref = ownclassWrapperPaths[type][path];
    ref.service.setup(ref.app, path);
  }))
};


function ownclassWrapper (app, path, options = {}) {
  if (!(app && app.version && app.service && app.services) ) {
    throw new errors.Unavailable(`The FeathersJS app must be supplied as first argument`);
  }
  let location = stripSlashes(path);

  let old = app.service(location);
  if (typeof old === 'undefined') {
    throw new errors.Unavailable(`No prior service registered on path '${location}'`);
  }

  let opts = Object.assign({}, old.options, options);
  let service = new OwnclassClass(opts);

  service.remoteService = old;

  if (!ownclassWrapperPaths[service.type])
    ownclassWrapperPaths[service.type] = {};
  ownclassWrapperPaths[service.type][location] = { service, old, options, app }; 

  if (!app._isSetup && app.setup !== ownclassSetupPaths) {
    let old = app.setup.bind(app);
    app.setup = () => {
      console.log('HELLO FROM THE TRENCES !!!');
      old.call(app); ownclassSetupPaths();
      return app;
    }
  } else {
    console.log('SORRY MATE - FROM THE TRENCES !!!');
    ownclassSetupPaths(app);
  }

  return app;
}

ownclassWrapper.show = () => {
  console.log(`PATHS = ${JSON.stringify(ownclassWrapperPaths)}`);
}
const init = options => {return new OwnclassClass(options)};
init.Service = OwnclassClass;

describe(`${package}Wrapper tests`, () => {
  app = feathers();
  let testTitle = `${package}Wrapper adapterTests`
  adapterTests(testTitle, app, errors, ownclassWrapper, 'people');
  // adapterTests(testTitle, app, errors, ownclassWrapper, 'people-customId', 'customId');
  // adapterTests(testTitle, app, errors, ownclassWrapper, 'people-uuid', 'uuid');

  // wrapperBasic(`${package}Wrapper basic functionality`, app, errors, ownclassWrapper, 'wrapperBasic', verbose);
  // ownWrapper(`${package}Wrapper specific functionality`, app, errors, ownclassWrapper, 'ownWrapper', verbose, true);
  // syncTests(`${package}Wrapper sync functionality`, app, errors, init, 'syncTests', verbose, 9100, true);
  // eventsTests(`${package}Wrapper events functionality`, app, errors, ownclassWrapper, 'wrapperEvents', verbose);
  // localStorageTests(`${package}Wrapper storage functionality`, app, errors, ownclassWrapper, 'wrapperStorage', verbose);
  // restTests(`${package}Wrapper REST functionality`, app, errors, ownclassWrapper, 'wrapperREST', verbose, 7886, true);
  // socketioTests(`${package}Wrapper socket.io functionality`, app, errors, ownclassWrapper, 'wrapperSocketIo', verbose, 7886, true);

})
