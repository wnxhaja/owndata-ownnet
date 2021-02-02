const feathers = require('@feathersjs/feathers');
const { Service } = require('feathers-memory');

let ix = 0;

function newServicePath () {
  return '/tmp' + ix++;
}

function service1 (wrapper) {
  let path = newServicePath();
  return fromServiceNonPaginatedConfig(wrapper, path);
}

function service2 (wrapper, path) {
  app = feathers();
  wrapper(app, path);
  app.use(path, new Service({ multi: true }));
  return app.service(path);
}

function service3 (wrapper) {
  app = feathers();
  let path = newServicePath();
  wrapper(app, path);
  app.use(path,  new Service({ multi: true }));
  return app.service(path);
}

function service4 (wrapper, options) {
  app = feathers();
  let path = newServicePath();
  wrapper(app, path, options);
  app.use(path, new Service(options));
  return app.service(path);
}

function service5 (wrapper, path) {
  app = feathers();
  wrapper(app, path);
  app.use(path, new Service({ multi: true }));
  return { app, service: app.service(path)};
}

function fromServiceNonPaginatedConfig (wrapper, path) {
  app = feathers();
  wrapper(app, path);
  app.use(path, new Service({ multi: true }));
  return app.service(path);
}

module.exports = { newServicePath, service1, service2, service3, service4, service5, fromServiceNonPaginatedConfig };
