'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeFakeIndexedDB } = require('./_fakeidb');

// Charge le VRAI fichier dexie_min.js (celui livré) dans un bac à sable Node qui imite le
// global 'self' du navigateur, avec indexedDB/DOMException/WeakMap/WeakSet fournis.
function loadDexie(filePath){
  const src = fs.readFileSync(filePath, 'utf8');
  const idb = makeFakeIndexedDB();
  const sandboxSelf = { indexedDB: idb, DOMException, WeakMap, WeakSet, console, setTimeout, clearTimeout, queueMicrotask };
  const sandbox = { self: sandboxSelf, indexedDB: idb, WeakMap, WeakSet, DOMException, console, setTimeout, clearTimeout, queueMicrotask };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: filePath });
  return sandboxSelf.Dexie;
}

module.exports = { loadDexie };
