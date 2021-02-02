// Main module for client
const { Unavailable } = require('@feathersjs/errors');
const { to, isObject, stripProps, genUuid, hash, hashOfRecord } = require('./common');
const { Owndata, owndataWrapper } = require('./owndata');
const { Ownnet, ownnetWrapper } = require('./ownnet');

const Standard = app => {
  if (typeof app.defaultService === 'function') {
    return app.defaultService
  }

  // Temporarily register non-sense path to initialize default service
  app.service('__@@__NON-SENSE');
  delete app.services['__@@__NON-SENSE'];
  
  if (typeof app.defaultService !== 'function') {
    throw new Unavailable(`Using 'Standard' does not make sense without first defining transport (e.g. REST or socket.io)!`);
  }
  return app.defaultService;
}

module.exports = {
  to, isObject, stripProps, genUuid, hash, hashOfRecord, Standard,
  Owndata, owndataWrapper, 
  Ownnet, ownnetWrapper
};
