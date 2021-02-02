const { sorter, select } = require('@feathersjs/adapter-commons');
const { MethodNotAllowed, BadRequest, NotFound, Forbidden, NotImplemented } = require('@feathersjs/errors');
const { genUuid, to, OptionsProxy } = require('../common');
const snapshot = require('../snapshot');

const debug = require('debug')('@feathersjs-offline:ownclass:base');


const mixins = {

  getEntries: async function (params = {}) {
    debug(`Calling getEntries(${JSON.stringify(params)}})`);
    let res = [];
    await this.local.getEntries(params)
      .then(entries => {
        res = entries
      });

    return Promise.resolve(res)
      .then(this._strip)
      .then(this._select(params));
  },

  // Allow access to our internal services (for application hooks and the demo). Use with care!

  get remote() {
    return this.remoteService;
  },

  set remote(value) { // Do not allow reassign
    throw new Forbidden(`You cannot change value of remote!`);
  },

  get local() {
    return this.localService;
  },

  set local(value) { // Do not allow reassign
    throw new Forbidden(`You cannot change value of local!`);
  },

  get queue() {
    return this.localQueue;
  },

  set queue(value) { // Do not allow reassign
    throw new Forbidden(`You cannot change value of queue!`);
  },

  /* Queue handling */

  /**
   * Allow queue processing (allowed when semaphore this.aIP === 0)
   */
  allowInternalProcessing: function (from) {
    debug(`    allowInternalProcessing: ${from} ${this.thisName} ${this.aIP - 1}`);
    this.aIP--;
  },
  /**
   * Disallow queue processing (when semaphore this.aIP !== 0)
   */
  disallowInternalProcessing: function (from) {
    debug(`    disallowInternalProcessing: ${from} ${this.thisName} ${this.aIP + 1}`);
    this.aIP++;
  },
  /**
   * Is queue processing allowed?
   */
  internalProcessingAllowed: function () {
    return this.aIP === 0;
  },

  _addQueuedEvent: async function (eventName, localRecord, arg1, arg2, arg3) {
    debug(`    _addQueuedEvent(${eventName}, ...) entered`);
    let [err, res] = await to(this.queue.create({ eventName, record: localRecord, arg1, arg2, arg3 }));
    debug(`    _addQueuedEvent(${eventName}, ${res.id}, ...) added: ${JSON.stringify(res)}`);
    return Promise.resolve(res.id);
  },

  _removeQueuedEvent: async function (eventName, id, localRecord, updatedAt) {
    debug(`    _removeQueuedEvent(${eventName}, ${id}, ...) entered`);

    const [err, res] = await to(this.queue.remove(id));

    return Promise.resolve(res);
  },

  /**
   * This method must be implemented in own-data and own-net classes extending this class
   */
  _processQueuedEvents: async function () {
    throw new NotImplemented(`_processQueuedEvents must be implemented!!!`);
  },

  /* Event listening */

  /* Synchronization */

  /**
   * Synchronize the relevant documents/items from the remote db with the local db.
   *
   * @param {boolean} bAll If true, we try to sync for the beginning of time.
   * @returns {boolean} True if the process was completed, false otherwise.
   */
  sync: async function (bAll = false) {
    while (!this.internalProcessingAllowed()) {
      console.log(`sync: await internalProcessing (aIP=${this.aIP})`);
      await new Promise(resolve => {
        setTimeout(() => {
          resolve(true);
        }, 200);
      });
    }

    const syncOptions = await this._getSyncOptions(bAll);
    debug(`${this.type}.sync(${JSON.stringify(syncOptions)}) started...`);
    let self = this;
    let result = true;

    let [err, snap] = await to(snapshot(this.remote, syncOptions))
    if (err) { // we silently ignore any errors
      if (err.className === 'timeout') {
        debug(`  TIMEOUT: ${JSON.stringify(err)}`);
      } else {
        debug(`  ERROR: ${JSON.stringify(err)}`);
      }
      // Ok, tell anyone interested about the result
      this.local.emit('synced', false);
      return false;
    }

    /*
     * For each row returned by snapshot we perform the following:
     *  - if it already exists locally
     *    - if it is marked as deleted
     *      - remove the row
     *    - otherwise
     *      - patch the row
     *  - otherwise
     *    - if it is not marked as deleted
     *      - create the row
     * Moreover we track the `onServerAt` to determine latest sync timestamp
     */
    debug(`  Applying received snapshot data... (${snap.length} items)`);
    let syncTS = new Date(0).toISOString();
    await Promise.all(snap.map(async (v) => {
      let [err, res] = await to(self.local.get(v[self.id]));
      if (res) {
        syncTS = syncTS < v.onServerAt ? v.onServerAt : syncTS;
        if (v.deletedAt) {
          [err, res] = await to(self.local.remove(v[self.id]));
        }
        else {
          [err, res] = await to(self.local.patch(v[self.id], v));
        }
        if (err) { result = false; }
      }
      else {
        if (!v.deletedAt) {
          syncTS = syncTS < v.onServerAt ? v.onServerAt : syncTS;
          [err, res] = await to(self.local.create(v));
          if (err) { result = false; }
        }
      }
    }));

    // Save last sync timestamp
    this.storage.setItem(this.thisName + '_syncedAt', new Date(syncTS).toISOString());

    if (result) // Wait until internal Processing is ok
      while (!await this._processQueuedEvents()) {
        await new Promise(resolve => {
          setTimeout(() => {
            resolve(true);
          }, 200);
        });
      };

    // Ok, tell anyone interested about the result
    this.local.emit('synced', result);

    return result;
  },

  /**
   * Determine the relevant options necessary for synchronizing this service.
   *
   * @param {boolean} bAll If true, we try to sync for the beginning of time.
   * @returns {object} The relevant options for snapshot().
   */
  _getSyncOptions: async function (bAll) {
    let query = Object.assign({}, { offline: { _forceAll: true }, $sort: { onServerAt: 1 } });
    let ts = bAll ? new Date(0).toISOString() : this.syncedAt;
    let syncTS = ts < this.syncedAt ? ts : this.syncedAt;

    if (syncTS !== new Date(ts)) {
      query.offline.onServerAt = new Date(syncTS);
    }

    return query;
  }

};

module.exports = { mixins,
  must: [ 'getEntries',
          'allowInternalProcessing', 'disallowInternalProcessing',
          'internalProcessingAllowed',
          'remote', 'local', 'queue',
          '_addQueuedEvent', '_removeQueuedEvent', '_processQueuedEvents',
          'sync', '_getSyncOptions'
        ],
  cond: []
};
