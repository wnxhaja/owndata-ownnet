const sift = require('sift');
const { sorter, select } = require('@feathersjs/adapter-commons');
const debug = require('debug')('@feathersjs-offline:ownclass:setup');
const ls = require('feathers-localstorage');
const clone = require('./clone');
const { OptionsProxy } = require('../common');
const localStorage = require('./local-storage');

const defaultOptions = {
  'id': 'id',
  'store': null,
  'storage': null,
  'useShortUuid': true,
  'throttle': null,
  'timedSync': 24 * 60 * 60 * 1000,
  'adapterTest': false,
  'matcher': sift,
  sorter,
  'fixedName': ''
};

const _adapterTestStrip = ['uuid', 'updatedAt', 'onServerAt', 'deletedAt'];

let nameIx = 0;

const attrStrip = (...attr) => {
  return (res) => {
    let result;
    if (Array.isArray(res)) {
      result = [];
      res.map((_v, i, arr) => {
        let obj = clone(arr[i]);
        attr.forEach(a => delete obj[a]);
        result.push(obj);
      })
    }
    else {
      result = clone(res);
      attr.forEach(a => delete result[a]);
    }
    return result;
  }
}


const mixins = {

  _setup: function (app, path) {  // This will be removed for future versions of Feathers
    debug(`_SetUp('${path}') started`);
    return this.setup(app, path);
  },

  setup: function (app, path) {
    debug(`SetUp('${path}') started`);
    if (this._setupPerformed) { // Assure we only run setup once
      return;
    }
    this._setupPerformed = true;

    const self = this;

    // this.id = this.id || this.options.id || defaultOptions.id;

    // Make sure we have at least default values for critical options and properties
    this.type = 'own-class';
    this.options = Object.assign({}, defaultOptions, this.options);
    this.thisName = !!this.options.fixedName ? this.options.fixedName : `${this.type}_offline_${nameIx++}_${path}`;

    // Get the service name and standard settings
    this.name = path;

    // Construct the two helper services
    this.localServiceName = this.thisName + '_local';
    this.localQueueName = this.thisName + '_queue';

    this.storage = this.options.storage ? this.options.storage : localStorage;
    this.localSpecOptions = { name: this.localServiceName, storage: this.storage, store: this.options.store, reuseKeys: !!this.options.fixedName};
    let localOptions = Object.assign({}, this.options, this.localSpecOptions);
    let queueOptions = { id: 'id', name: this.localQueueName, storage: this.storage, paginate: null, multi: true, reuseKeys: !!this.options.fixedName};

    debug(`  Setting up services '${this.localServiceName}' and '${this.localQueueName}'...`);
    app.use(this.localServiceName, ls(localOptions));
    app.use(this.localQueueName, ls(queueOptions));

    this.localService = app.service(this.localServiceName);
    this.localQueue = app.service(this.localQueueName);

    // We need to make sure that localService is properly initiated - make a dummy search
    //    (a quirk of feathers-localstorage)
    this.localService.ready();

    // Are we running adapterTests?
    if (this.options.adapterTest) {
      // Make sure the '_adapterTestStrip' attributes are stripped from results
      // However, we need to allow for having uuid as key
      const stripValues = Object.assign([], _adapterTestStrip);
      let idIx = stripValues.findIndex(v => { return v === self.id });
      if (idIx > -1) stripValues.splice(idIx, 1);
      this._strip = attrStrip(...stripValues);
    }
    else {
      this._strip = v => { return v };
    }

    // Make sure we always select the key (id) in our results
    this._select = (params, ...others) => (res) => { return select(params, ...others, self.id)(res) }

    // Initialize the service wrapper
    this.listening = false;
    this.aIP = 0; // Our semaphore for internal processing
    this.pQActive = false; // Our flag for avoiding more than one processing of queued operations at a time

    // Determine latest registered sync timestamp
    this.syncedAt = new Date(this.storage.getItem(this.thisName + '_syncedAt') || 0).toISOString();
    this.storage.setItem(this.thisName + '_syncedAt', new Date(this.syncedAt).toISOString());

    // This is necessary if we get updates to options (e.g. .options.multi = ['patch'])
    this._listenOptions(this.options);

    // Make sure that the wrapped service is setup correctly
    if (typeof this.remote.setup === 'function') {
      this.remote.setup(app, path);
    }

    // Should we perform a sync every timedSync?
    if (this.options.timedSync && Number.isInteger(this.options.timedSync) && this.options.timedSync > 0) {
      this._timedSyncHandle = setInterval(() => self.sync(), self.options.timedSync);
    }

    debug(`  options = ${JSON.stringify(this.options)}`);
    debug('  Done.');
    return true;
  },


  // Make sure the "wrapped" service also gets updates to options
  _listenOptions(opts) {
    const self = this;
    const optProxy = new OptionsProxy(self.thisName);

    // this.options = opts;
    this.options = optProxy.observe(Object.assign(
      {},
      { paginate: {} },
      defaultOptions,
      opts // self.options
    ));
    optProxy.watcher(() => {
      self.localService.options = Object.assign({}, self.options, self.localSpecOptions);
    });
  }
}

module.exports = { mixins,
  must: ['_setup', 'setup', '_listenOptions' ],
  cond: []
};