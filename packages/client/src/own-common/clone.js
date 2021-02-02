/**
 * Make a "full" clone of any given object
 * @param {object} obj
 * @returns {object} The copy object
 */
function clone(obj) {
  return (typeof obj === 'undefined') ? undefined : JSON.parse(JSON.stringify(obj));
}

module.exports = clone;