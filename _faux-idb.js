/* ============================================================
   _faux-idb.js — harnais : le VRAI dexie.min.js sous node
   ------------------------------------------------------------
   LA LEÇON v1381 : pendant un mois, les hooks/bulkPut/primaryKeys
   d'app.js ont tourné contre un moteur qui ne les fournissait pas —
   et mes tests le prouvaient « vert » parce qu'ils utilisaient des
   objets factices AVEC un hook() que j'avais écrit moi-même. Un test
   qui fournit lui-même l'API qu'il prétend vérifier ne vérifie rien.

   Ce harnais charge donc LE fichier dexie.min.js livré (jamais une
   copie) dans un contexte vm, au-dessus d'un IndexedDB minimal en
   mémoire. Ce qui est testé, c'est le CONTRAT dexie.min.js ↔ app.js —
   exactement ce qui a cassé. L'IndexedDB factice, lui, ne fait que
   stocker des Map : il ne fournit AUCUNE des API dont l'absence a
   causé la panne (hook, bulkPut, tables, ignoreTransaction…) — si le
   shim ne les implémente pas, les tests sont rouges.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── IndexedDB minimal en mémoire ───────────────────────────────────────────────
// Requêtes → microtâches ; auto-commit → macrotâche (toutes les chaînes d'await
// d'une transaction se terminent avant que « complete » ne parte).
function fabriqueIndexedDB(){
  const bases = {};   // nom -> { stores: { nom: {data:Map, keyPath, auto, seq} }, version }

  function faitReq(){ return { onsuccess:null, onerror:null, result:undefined, error:null }; }
  function resoud(req, val){ queueMicrotask(() => { req.result = val; if(req.onsuccess) req.onsuccess({ target:req }); }); }

  class FauxTx {
    constructor(base, noms, mode){
      this._base = base; this._noms = noms; this._mode = mode;
      this._pending = 0; this._settled = false; this._aborted = false;
      this._listeners = { complete:[], abort:[], error:[] };
      this.oncomplete = null; this.onabort = null; this.onerror = null; this.error = null;
      // Instantané pour le rollback d'abort (readwrite seulement).
      this._avant = {};
      if(mode === 'readwrite'){
        noms.forEach(n => { const st = base.stores[n]; if(st) this._avant[n] = new Map(st.data); });
      }
      this._planifieCommit();
    }
    addEventListener(evt, cb){ if(this._listeners[evt]) this._listeners[evt].push(cb); }
    _fire(evt){
      if(this._settled) return; this._settled = true;
      const h = this['on' + evt];
      queueMicrotask(() => {
        if(h) try{ h({ target:this }); }catch(_){}
        (this._listeners[evt] || []).forEach(cb => { try{ cb({ target:this }); }catch(_){} });
      });
    }
    abort(){
      if(this._settled || this._aborted) return;
      this._aborted = true;
      Object.keys(this._avant).forEach(n => { this._base.stores[n].data = new Map(this._avant[n]); });
      this._fire('abort');
    }
    _planifieCommit(){
      setTimeout(() => { if(!this._pending && !this._settled && !this._aborted) this._fire('complete'); }, 0);
    }
    _op(fn){
      const req = faitReq();
      this._pending++;
      queueMicrotask(() => {
        try{
          if(this._aborted){ this._pending--; return; }   // transaction avortée : la requête meurt
          const val = fn();
          this._pending--;
          resoud(req, val);
        }catch(e){
          this._pending--; req.error = e;
          queueMicrotask(() => { if(req.onerror) req.onerror({ target:req }); });
        }
        if(!this._pending) this._planifieCommit();
      });
      return req;
    }
    objectStore(nom){
      const st = this._base.stores[nom];
      const tx = this;
      const cle = o => o[st.keyPath];
      return {
        indexNames: { contains: () => true },
        createIndex(){},
        add(o){ return tx._op(() => {
          let k = cle(o);
          if(k == null && st.auto){ k = ++st.seq; o = Object.assign({}, o); o[st.keyPath] = k; }
          if(st.data.has(k)) throw new Error('ConstraintError: clé déjà présente');
          st.data.set(k, JSON.parse(JSON.stringify(o)));
          return k;
        }); },
        put(o){ return tx._op(() => {
          let k = cle(o);
          if(k == null && st.auto){ k = ++st.seq; o = Object.assign({}, o); o[st.keyPath] = k; }
          st.data.set(k, JSON.parse(JSON.stringify(o)));
          return k;
        }); },
        get(k){ return tx._op(() => { const v = st.data.get(k); return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }); },
        getAll(){ return tx._op(() => [...st.data.values()].map(v => JSON.parse(JSON.stringify(v)))); },
        delete(k){ return tx._op(() => { st.data.delete(k); return undefined; }); },
        clear(){ return tx._op(() => { st.data.clear(); return undefined; }); },
        count(){ return tx._op(() => st.data.size); }
      };
    }
  }

  return {
    _bases: bases,
    open(nom, version){
      const req = faitReq();
      queueMicrotask(() => {
        const neuve = !bases[nom];
        const base = bases[nom] = bases[nom] || { stores:{}, version:0 };
        const idb = {
          objectStoreNames: { contains: n => !!base.stores[n] },
          createObjectStore(n, opts){
            base.stores[n] = { data:new Map(), keyPath:(opts && opts.keyPath) || 'id', auto:!!(opts && opts.autoIncrement), seq:0 };
            return { indexNames:{ contains:() => true }, createIndex(){} };
          },
          transaction: (noms, mode) => new FauxTx(base, [].concat(noms), mode || 'readonly'),
          close(){}
        };
        if(neuve || version > base.version){
          base.version = version;
          req.transaction = { objectStore: n => ({ indexNames:{ contains:() => true }, createIndex(){} }) };
          if(req.onupgradeneeded) req.onupgradeneeded({ target:{ result:idb } });
        }
        req.result = idb;
        if(req.onsuccess) req.onsuccess({ target:req });
      });
      return req;
    }
  };
}

// ── Chargement du VRAI dexie.min.js dans un contexte vm ────────────────────────
function chargeVraiShim(){
  const src = fs.readFileSync(path.join(__dirname, '..', 'dexie.min.js'), 'utf8');
  const indexedDB = fabriqueIndexedDB();
  const ctx = {
    indexedDB,
    setTimeout, clearTimeout, queueMicrotask,
    console
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename:'dexie.min.js' });
  if(typeof ctx.Dexie !== 'function') throw new Error('dexie.min.js n\'a pas exposé Dexie');
  return { Dexie: ctx.Dexie, _idb: indexedDB };
}

// Attendre que les macrotâches de commit se vident (les rappels « complete » partent en setTimeout).
const attendCommits = () => new Promise(res => setTimeout(res, 5));

module.exports = { fabriqueIndexedDB, chargeVraiShim, attendCommits };
