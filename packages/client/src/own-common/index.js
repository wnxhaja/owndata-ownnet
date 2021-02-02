const { stripSlashes } = require('@feathersjs/commons');
const { error } = require('@feathersjs/errors');
const Proto = require('./uberprotoplus');
const OwnBase = require('./own-base');
const OwnCrud = require('./crud');
const OwnSetup = require('./setup');

const fnAll = [].concat(OwnBase.must).concat(OwnBase.cond)
                .concat(OwnCrud.must).concat(OwnCrud.cond)
                .concat(OwnSetup.must).concat(OwnSetup.cond);



/**
 * Return functions for wrapping and mixin given the `_processQueuedEvents`
 * implementation.
 * 
 * @param {obj} implObj An object with at least a proper implementation of
 *              `async _processQueuedEvents()` 
 */
const makeWrapper = (implObj, type = 'own-class') => {
  const ownWrapperPaths = {};

  const mixin = (service, path) => {
    service.remoteService = {};
    const remote = service.remoteService;

    // console.log(`Mixin(${type}) called on '${path}', options = ${JSON.stringify(ownWrapperPaths[path])}, ${JSON.stringify(service.options)}`);
    if (path in ownWrapperPaths) {
      console.log(`==> Mixin(${type}) executed on '${path}'`);
      // We proxy all methods we might overwrite during mixin
      fnAll.forEach(f => { if (typeof service[f] === 'function') remote[f] = service.proxy(f) });

      // Now, let's find out which methods to mixin
      const fnCrudAdd = OwnCrud.must.concat(OwnCrud.cond.filter(v => remote[v]));
      const fnBaseAdd = OwnBase.must.concat(OwnBase.cond.filter(v => remote[v]));
      const fnSetupAdd = OwnSetup.must.concat(OwnSetup.cond.filter(v => remote[v]));
      const fnImplAdd = implObj.must.concat(implObj.cond.filter(v => remote[v]));

      // Now we mixin needed methods
      // Proto.mixin(implObj.mixins, 
      //             Proto.mixin(OwnSetup.mixins, 
      //                         Proto.mixin(OwnBase.mixins, 
      //                                     Proto.mixin(OwnCrud.mixins,
      //                                                 service,
      //                                                 fnCrudAdd),
      //                                     fnBaseAdd),
      //                         fnSetupAdd),
      //             fnImplAdd);

      service.mixin(OwnBase.mixins);
      Object.assign(service, OwnSetup.mixins);
      Object.assign(service, OwnCrud.mixins);
      Object.assign(service, implObj.mixins);

      service['type'] = type;
      service['__forTestingOnly'] = OwnBase.mixins['_processQueuedEvents'];
      service.options = Object.assign(service.options||{}, ownWrapperPaths[path]);
      console.log(`NOW => ${Object.keys(service).join(', ')}`);
      console.log(`NOW REMOTE => ${Object.keys(service.remoteService).join(', ')}`);
      console.log(`NOW CREATE => ${service.remoteService.create.toString()}`);
    }
  };

  const wrapper = (app, path, options = {}) => {
    // if (!app.mixins.includes(mixin)) {
    //   console.log(`Adding mixin(${type}) to app`);
    //   app.mixins.push(mixin);
    // }

    let location = stripSlashes(path)
    // if (!app.services[location]) { // ***
    //   new error.NotAllowed(`The path '${location}' is not installed! (use wrapper() after app.use())`);
    //   // new error.NotAllowed(`The path '${location}' is already installed! (use wrapper() before app.use())`);
    // }

    let service = app.service(location); // ***
    console.log(`  ownclass '${location}' = ${JSON.stringify(options)}`);
    ownWrapperPaths[location] = options;
    mixin(service, location); // ***
    service.setup(app, location); // ***

    return app;
  }
  wrapper.getWrapped = () => {
    return Object.keys(ownWrapperPaths);
  }

  return wrapper;
}

module.exports = makeWrapper;
