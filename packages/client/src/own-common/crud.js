const { sorter, select } = require('@feathersjs/adapter-commons');
const { MethodNotAllowed, BadRequest, NotFound, Forbidden, NotImplemented } = require('@feathersjs/errors');
const { genUuid, to } = require('../common');
const clone = require('./clone');
const debug = require('debug')('@feathersjs-offline:ownclass:service-base:crud');
const debugResult = require('debug')('result:@feathersjs-offline:ownclass:crud');
const debugDetail = require('debug')('detail:@feathersjs-offline:ownclass:crud');

// Beginning of time
const BOT = new Date(0);


const mixins = {

  async get (id, params) {
    debug(`Calling get(${JSON.stringify(id)}, ${JSON.stringify(params)}})`);
    return await this.local.get(id, params)
      .then(this._strip)
      .then(this._select(params))
      .catch(err => { throw err });
  },

  async _get (id, params) {
    debug(`Calling _get(${JSON.stringify(id)}, ${JSON.stringify(params)}})`);
    return await this.local._get(id, params)
      .then(this._strip)
      .then(this._select(params))
      .catch(err => { throw err });
  },

  async find (params) {
    debug(`Calling find(${JSON.stringify(params)}})`);
    debug(`  rows=${JSON.stringify(await this.getEntries())}`);
    return this.local.find(params)
      .then(this._strip)
      .then(this._select(params))
      .then(res => {
        debug(`  result find: ${JSON.stringify(res)}, options = ${JSON.stringify(this.local.options)}`);
        return res;
      });
  },

  async _find (params) {
    debug(`Calling _find(${JSON.stringify(params)}})`);
    return this.local._find(params)
      .then(this._strip)
      .then(this._select(params))
      .then(res => {
        debug(`  result _find: ${JSON.stringify(res)}, options = ${JSON.stringify(this.local.options)}`);
        return res;
      });
  },

  async crudHandler (fn, baseFn, id, newData, oldData, params) {
    debug(`  Calling _crudHandler('${fn}', '${baseFn}', ${id}, ${JSON.stringify(newData)}, ${JSON.stringify(oldData)}, ${JSON.stringify(params)})`);
    const self = this;
    let err, res;

    // We apply optimistic mutation
    this.disallowInternalProcessing(fn);
    const queueId = await this._addQueuedEvent(baseFn, newData, clone(newData), params);

    // Start actual mutation on remote service
    let args = [];
    let dataIx = 0;
    if (baseFn === 'remove') {
      args = [ id, clone(params) ];
      [err, res] = await to(this.local[fn](...args));
    }
    else if (baseFn === 'create' ) {
      args = [ newData, clone(params) ];
      [err, res] = await to(this.local[fn](...args));
    }
    else { // Patch and Update
      args = [ id, newData, clone(params) ];
      dataIx = 1;
      [err, res] = await to(this.local[fn](...args));
    }

    if (res) {
      args[dataIx] = baseFn === 'remove' ? id : res;
      this.remote[fn].call(this, ...args)
        .then(async rres => {
          await to(self._removeQueuedEvent(fn + '0', queueId, newData, newData.updatedAt));
          if (baseFn !== 'remove') 
            await self._patchIfNotRemoved(rres[self.id], rres);

          // Ok, we have connection - empty queue if we have any items queued
          self.allowInternalProcessing(fn + '0');
          await to(self._processQueuedEvents());
        })
        .catch(async rerr => {
          if (rerr.name !== 'Timeout') {
            // Let's silently ignore missing connection to server -
            // we'll catch-up next time we get a connection
            // In all other cases do the following:
            await to(self._removeQueuedEvent(fn + '1', queueId, rerr.message/*newData*/, newData.updatedAt));
            
            if (baseFn === 'remove')
              await to(self.local['create'](oldData, null));
            else if (baseFn === 'create')
              await to(self.local['remove'](res[self.id], null));
            else
              await to(self.local['patch'](id, oldData, null))
          }

          self.allowInternalProcessing(fn + '1');
        });
    }
    else {
      await to(this._removeQueuedEvent(fn + '2', queueId, newData, newData.updatedAt));
      this.allowInternalProcessing(fn + '2');
      debug(`    Throwing ${err.name}: '${err.message}'`);
      throw err;
    }

    return Promise.resolve(res)
      .then(this._select(params))
      .then(res => {
        debugResult(`  result ${fn}: ${JSON.stringify(res.data?res.data:res)} (Note: before stripping!)`);
        debugDetail(`  result ${fn}: ${JSON.stringify(res.data?res.data:res)}, options = ${JSON.stringify(this.local.options)} (Note: before stripping!)`);
debug(`  storage: ${JSON.stringify(this.find())}, options = ${JSON.stringify(this.local.options)} (Note: before stripping!)`);
        return res;
      })
      .then(this._strip);
  },


  async _createPrepare (fn, data, params, ts = 0) {
      debug(`Calling _createPrepare('${fn}', ${JSON.stringify(data)}, ${JSON.stringify(params)}, ${ts})`);

      ts = ts || new Date();

      const newData = clone(data);

      // As we do not know if the server is connected we have to make sure the important
      // values are set with reasonable values
      if (!('uuid' in newData)) {
        newData.uuid = genUuid(this.options.useShortUuid);
      }

      if (!('updatedAt' in newData)) {
        newData.updatedAt = ts;
      }

      // We do not allow the client to set the onServerAt attribute to other than default '0'
      newData.onServerAt = BOT;

      // Is uuid unique?
      const [err, res] = await to(this.local['find']({ query: { 'uuid': newData.uuid } }));
      if (res && res.length) {
        throw new BadRequest(`Optimistic ${fn} requires unique uuid. (${this.type}) res=${JSON.stringify(res)}`);
      }

      return newData;
  },

  async _create(data, params, ts = 0) {
    debug(`Calling _create(${JSON.stringify(data)}, ${JSON.stringify(params)}, ${ts})`);
    const self = this;

    if (Array.isArray(data)) {
      if (!this.allowsMulti('create')) {
        return Promise.reject(new MethodNotAllowed(`'_create' multiple without option \'multi\' set`));
      }

      const timestamp = new Date();
      // In future version we will use Promise.allSettled() instead...
      return Promise.all(data.map(current => self._create(current, params, timestamp)));
    }

    const newData = await this._createPrepare('_create', data, params, ts);

    return await this.crudHandler('_create', 'create', null, newData, null, params);
  },


  async create (data, params, ts = 0) {
    debug(`Calling create(${JSON.stringify(data)}, ${JSON.stringify(params)}, ${ts})`);
    const self = this;

    if (Array.isArray(data)) {
      if (!this.allowsMulti('create')) {
        return Promise.reject(new MethodNotAllowed(`'_create' multiple without option \'multi\' set`));
      }

      const timestamp = new Date();
      // In future version we will use Promise.allSettled() instead...
      return Promise.all(data.map(current => self.create(current, params, timestamp)));
    }

    const newData = await this._createPrepare('create', data, params, ts);

    return await this.remoteService['create'](newData, params);
    // return await this.crudHandler('create', 'create', null, newData, null, params);
  },

  async _updatePrepare (fn, id, data, params) {
    debug(`Calling _updatePrepare('${fn}', ${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}})`);

    if (id === null || Array.isArray(data)) {
      return Promise.reject(new BadRequest(
        `You can not replace multiple instances. Did you mean 'patch'?`
      ));
    }

    const [err, res] = await to(this.local._get(id));
    if (!(res && res !== {})) {
      throw new NotFound(`Trying to update non-existing ${this.id}=${id}. (${this.type}) err=${JSON.stringify(err.name)}`);
    }

    // We don't want our uuid to change type if it can be coerced
    const beforeRecord = clone(res);
    const beforeUuid = beforeRecord.uuid;

    const newData = clone(data);
    newData.uuid = beforeUuid; // eslint-disable-line
    newData.updatedAt = new Date();
    newData.onServerAt = BOT;

    return { beforeRecord, newData };
  },

  async _update (id, data, params) {
    debug(`Calling _update(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)})`);

    const { beforeRecord, newData} = await this._updatePrepare('_update', id, data, params);

    return await this.crudHandler('_update', 'update', id, newData, beforeRecord, params);
  },

  async update (id, data, params) {
    debug(`Calling update(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)})`);

    const { beforeRecord, newData} = await this._updatePrepare('update', id, data, params);

    return await this.crudHandler('update', 'update', id, newData, beforeRecord, params);
  },



  async _patchPrepare (fn, id, data, params = {}, ts = 0) {
    debug(`Calling _patchPrepare('${fn}', ${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}})`);

    ts = ts || new Date();

    const [err, res] = await to(this.local._get(id));
    if (!(res && res !== {})) {
      throw err;

    }

    // Optimistic mutation
    const beforeRecord = clone(res);
    const newData = Object.assign({}, beforeRecord, data);
    newData.onServerAt = BOT;
    newData.updatedAt = ts;

    return { beforeRecord, newData };
  },


  async _patch (id, data, params, ts = 0) {
    debug(`Calling _patch(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}, ${ts})`);
    const self = this;

    if (id === null) {
      if (!this.allowsMulti('patch')) {
        throw new MethodNotAllowed('Patching multiple without option \'multi\' set');
      }

      return this.find(params).then(page => {
        const res = page.data ? page.data : page;
        if (!Array.isArray(res)) {
          res = [res];
        }

        const timestamp = new Date().toISOString();
        return Promise.all(res.map(
          current => self._patch(current[this.id], data, params, timestamp))
        );
      });
    }

    const { beforeRecord, newData } = await this._patchPrepare('_patch', id, data, params, ts);

    return await this.crudHandler('_patch', 'patch', id, newData, beforeRecord, params);
  },

  async patch (id, data, params, ts = 0) {
    debug(`Calling patch(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}, ${ts})`);
    const self = this;

    if (id === null) {
      if (!this.allowsMulti('patch')) {
        throw new MethodNotAllowed('Patching multiple without option \'multi\' set');
      }

      return this.find(params).then(page => {
        const res = page.data ? page.data : page;
        if (!Array.isArray(res)) {
          res = [res];
        }

        const timestamp = new Date().toISOString();
        return Promise.all(res.map(
          current => self.patch(current[this.id], data, params, timestamp))
        );
      });
    }

    const { beforeRecord, newData } = await this._patchPrepare('patch', id, data, params, ts);

    return await this.crudHandler('patch', 'patch', id, newData, beforeRecord, params);
  },


  /**
   * An internal method to patch a localService record if and only if
   * we have not been overtaken by a remove request.
   *
   * @param {any} id
   * @param {any} data
   */
  async _patchIfNotRemoved (id, data) {
    return this.local.patch(id, data)
      .catch(_ => Promise.resolve(true));
  },


  async _removePrepare (fn, id, params = {}) {
    debug(`Calling _removePrepare('${fn}', ${id}, ${JSON.stringify(params)}})`);

    const [err, res] = await to(this.local._get(id));
    if (!(res && res !== {})) {
      throw new BadRequest(`Trying to remove non-existing ${this.id}=${id}. (${this.type}) err=${JSON.stringify(err)}, res=${JSON.stringify(res)}`);
    }

    // Optimistic mutation
    const beforeRecord = clone(res);
    this.disallowInternalProcessing('_remove');
    const queueId = await this._addQueuedEvent('remove', beforeRecord, id, params);

    return beforeRecord;
  },

  async _remove (id, params) {
    debug(`Calling _remove(${JSON.stringify(id)}, ${JSON.stringify(params)})`);
    const self = this;

    if (id === null) {
      if (!this.allowsMulti('remove')) {
        throw new MethodNotAllowed('._remove multiple without option \'multi\' set');
      }
      return this.find(params).then(page => {
        const res = page.data ? page.data : page;
        if (!Array.isArray(res)) {
          res = [res];
        }

        return Promise.all(res.map(
          current => self._remove(current[this.id], params))
        );
      });
    }

    const beforeRecord = await this._removePrepare('_remove', id, params);

    return await this.crudHandler('_remove', 'remove', id, beforeRecord, beforeRecord, params);
  },

  async remove (id, params) {
    debug(`Calling remove(${JSON.stringify(id)}, ${JSON.stringify(params)})`);
    const self = this;

    if (id === null) {
      if (!this.allowsMulti('remove')) {
        throw new MethodNotAllowed('.remove multiple without option \'multi\' set');
      }
      return this.find(params).then(page => {
        const res = page.data ? page.data : page;
        if (!Array.isArray(res)) {
          res = [res];
        }

        return Promise.all(res.map(
          current => self.remove(current[this.id], params))
        );
      });
    }

    const beforeRecord = await this._removePrepare('remove', id, params);

    return await this.crudHandler('remove', 'remove', id, beforeRecord, beforeRecord, params);
  }

}

module.exports = { mixins,
  must: [ 'crudHandler', '_createPrepare', '_updatePrepare', '_patchPrepare', '_removePrepare', '_patchIfNotRemoved' ],
  cond: [ '_create' , 'create', '_update', 'update', '_patch', 'patch', '_remove', 'remove', '_get', 'get', '_find', 'find' ]
};

