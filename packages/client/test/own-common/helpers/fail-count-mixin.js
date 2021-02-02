const errors = require('@feathersjs/errors');
const { throws } = require('assert');

/**
 * This sets up a mixin for a given method in a given service. The mixin
 * will be triggered `count` times (defaults to 1). After `count` activations
 * the mixin becomes "transparent" (x=>x).
 *
 * @param {string} type Typically 'Remote' or 'Client'
 * @param {string} serviceName Path of the service to be hooked into
 * @param {string} service The service to be hooked into
 * @param {string} method Method to fail
 * @param {number} count (optional, default 1) Number of times to fail
 * @param {feathersError} error (defaults to GeneralError) Error to fail with
 * @param {string} errText Text for error message
 */
function failCountMixin (type, serviceName, service, method, count = 1, error = errors.GeneralError, errText = 'Fail requested by user request - simulated general error') {
  let triggered = count;

  if (typeof service[method] !== 'function')
    throw new Error(`failCountMixin ERROR: '${method}' is not a function in service '${serviceName}'`);

  // // We call the normal method but internally it becomes the '_method'...
  // if (method.substr(0,1) !== '_') method = '_' + method;
  let orgMethod = service[method];

  service[method] = async (...args) => {
    if (triggered > 0) {
      console.log(`failCountMixin(${serviceName})[${method}]: cnt=${triggered}`)
      triggered--;
      throw new error(errText);
    }
    return orgMethod(...args);
  };
}

module.exports = failCountMixin;
