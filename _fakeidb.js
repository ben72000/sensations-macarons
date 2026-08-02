'use strict';
// Fausse IndexedDB minimale, en mémoire, pour rejouer la course de _activeTx sans navigateur.
// Couvre exactement ce que dexie_min.js utilise : open/onupgradeneeded, transaction(stores,mode),
// tx.objectStore (lève les DEUX erreurs réelles observées en prod si mal utilisé), get/put/add/
// delete/clear/getAll/count, tx.oncomplete/onerror/onabort + addEventListener, tx.abort().

class FakeRequest {
  constructor(){ this.onsuccess=null; this.onerror=null; this.result=undefined; this.error=undefined; }
  _succeed(result){ this.result=result; queueMicrotask(()=>{ if(this.onsuccess) this.onsuccess({target:this}); }); }
  _fail(err){ this.error=err; queueMicrotask(()=>{ if(this.onerror) this.onerror({target:this}); }); }
}

class FakeObjectStore {
  constructor(tx, table){ this._tx=tx; this._table=table; }
  _op(fn){
    if(this._tx._finished) throw new DOMException("Failed to execute 'objectStore' on 'IDBTransaction': The transaction finished.", 'InvalidStateError');
    const req=new FakeRequest();
    this._tx._touch();
    try{ const r=fn(); req._succeed(r); }catch(e){ req._fail(e); }
    return req;
  }
  get(id){ return this._op(()=> this._table.rows.get(id)); }
  getAll(){ return this._op(()=> Array.from(this._table.rows.values())); }
  count(){ return this._op(()=> this._table.rows.size); }
  put(obj){ return this._op(()=>{ const k = obj[this._table.key] ?? (++this._table._seq); obj[this._table.key]=k; this._table.rows.set(k, obj); return k; }); }
  add(obj){ return this.put(obj); }
  delete(id){ return this._op(()=>{ this._table.rows.delete(id); }); }
  clear(){ return this._op(()=> this._table.rows.clear()); }
  createIndex(){}
}

class FakeTransaction {
  constructor(idb, storeNames, mode){
    this._idb=idb; this.mode=mode; this._finished=false; this._pending=0;
    this.objectStoreNames = { contains: n => storeNames.includes(n) };
    this._listeners = { complete:[], abort:[], error:[] };
    this.oncomplete=null; this.onabort=null; this.onerror=null;
    this._storeNames = storeNames;
    this._scheduleAutoCommit();
  }
  addEventListener(evt, cb){ if(this._listeners[evt]) this._listeners[evt].push(cb); }
  _emit(evt){ (this._listeners[evt]||[]).forEach(cb=>{ try{cb();}catch(e){} }); const prop=this['on'+evt]; if(prop) try{prop();}catch(e){} }
  _touch(){ this._pending++; queueMicrotask(()=>{ this._pending--; }); this._scheduleAutoCommit(); }
  _scheduleAutoCommit(){
    // Auto-commit façon vraie IDB : quand plus rien n'est en vol après un tour de tâche.
    clearTimeout(this._t);
    this._t = setTimeout(()=>{ if(!this._pending && !this._finished) this._complete(); }, 0);
  }
  _complete(){ if(this._finished) return; this._finished=true; this._emit('complete'); }
  abort(){ if(this._finished) return; this._finished=true; clearTimeout(this._t); this._emit('abort'); }
  objectStore(name){
    if(this._finished) throw new DOMException("Failed to execute 'objectStore' on 'IDBTransaction': The transaction finished.", 'InvalidStateError');
    if(!this._storeNames.includes(name)) throw new DOMException("Failed to execute 'objectStore' on 'IDBTransaction': The specified object store was not found.", 'NotFoundError');
    return new FakeObjectStore(this, this._idb._tables.get(name));
  }
}

class FakeIDB {
  constructor(){ this._tables = new Map(); }
  transaction(storeNames, mode){ return new FakeTransaction(this, Array.isArray(storeNames)?storeNames:[storeNames], mode); }
  createObjectStore(name, opts){
    this._tables.set(name, { key: opts.keyPath, rows: new Map(), _seq:0 });
    const idx = new Set();
    return { indexNames: { contains: n => idx.has(n) }, createIndex(n){ idx.add(n); } };
  }
  get objectStoreNames(){ return { contains: n=>this._tables.has(n) }; }
}

function makeFakeIndexedDB(){
  return {
    open(name, version){
      const req = new FakeRequest();
      const idb = new FakeIDB();
      queueMicrotask(()=>{
        if(req.onupgradeneeded) req.onupgradeneeded({ target: { result: idb }, oldVersion:0, newVersion:version });
        req._succeed(idb);
      });
      return req;
    }
  };
}

module.exports = { makeFakeIndexedDB };
