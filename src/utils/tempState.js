'use strict';

const store = new Map();

function set(key, value, ttlMs = 300_000) {
  if (store.has(key)) clearTimeout(store.get(key)._timer);
  const timer = setTimeout(() => store.delete(key), ttlMs);
  store.set(key, { value, _timer: timer });
}

function get(key) {
  return store.has(key) ? store.get(key).value : undefined;
}

function del(key) {
  if (store.has(key)) {
    clearTimeout(store.get(key)._timer);
    store.delete(key);
  }
}

module.exports = { set, get, del };
