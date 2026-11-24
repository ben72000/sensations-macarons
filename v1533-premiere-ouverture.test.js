'use strict';
// v1533 — « L'APPLICATION CONTINUE À RAMER TERRIBLEMENT À LA PREMIÈRE OUVERTURE DE LA JOURNÉE. »
// Ben : « Il faut investiguer ce problème en profondeur de manière à l'éradiquer durablement. Et je veux qu'on avance en toute sécurité
// de façon à ne rien casser de l'existant. »
//
// CE QUI NE TOURNE QU'UNE FOIS PAR JOUR, AU PREMIER DÉMARRAGE : la sauvegarde automatique. Elle relit les 46 tables, sérialise TOUTE la base
// deux fois (JSON + somme de contrôle), l'écrit… puis, pour purger l'historique, RECHARGEAIT LES 21 SAUVEGARDES en mémoire
// (`backups.orderBy('date').reverse().toArray()`) — chacune contenant la base entière — juste pour connaître leurs numéros. Le moteur de base
// maison n'utilise aucun index : toute requête relit la table complète. Le tout pendant que Ben fait ses premiers gestes.
// S'y ajoutent : le service worker attendait le réseau SANS LIMITE pour app.js (~6,8 Mo) avant de retomber sur le cache ; et son installation
// échouait en bloc si un seul fichier listé manquait (`qr.min.js` listé, la page charge `qr_min.js`).
//
// CORRECTIFS : ① purge par les CLÉS seules (index `date`, getAllKeys), résultat identique ; ② contrôle de cohérence + sauvegarde du jour
// lancés APRÈS l'affichage, quand l'app est au repos (plafond : jamais repoussée indéfiniment) ; ③ code servi du cache si le réseau ne répond
// pas en 3 s (le cache est quand même mis à jour) ; ④ installation tolérante (seuls les 4 fichiers essentiels sont bloquants) ;
// ⑤ MESURE de chaque démarrage, visible dans « Santé de l'app », pour juger sur l'iPhone de Ben et non sur une supposition.
// RIEN N'EST RETIRÉ : mêmes étapes de préparation, dans le même ordre ; même contrôle ; même sauvegarde ; même règle « une par jour ».
//
// PREUVE PAR MUTATION : env SM_V1532=<dossier V1532> rejoue les sections contre l'ancienne version — elles doivent y échouer.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeFakeIndexedDB } = require('./_fakeidb');
const { APP, extractFunction, stripComments } = require('./_extract');

const RACINE = process.env.SM_V1532 || path.join(__dirname, '..');
const DEXIE_PATH = path.join(RACINE, 'dexie.min.js');
const SW_PATH = path.join(RACINE, 'service-worker.js');
const APP_TXT = process.env.SM_V1532 ? fs.readFileSync(path.join(RACINE, 'app.js'), 'utf8') : APP;
let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
const attendre = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ms || 3000))]);
// Extraction depuis le texte visé (app actuelle ou ancienne pour la mutation).
function fn(nom){
  const re = new RegExp('(?:async\\s+)?function\\s+' + nom + '\\s*\\(');
  const m = re.exec(APP_TXT); if(!m) throw new Error('introuvable : ' + nom);
  if(!process.env.SM_V1532) return extractFunction(nom);
  const apres = APP_TXT.slice(m.index); const fin = apres.slice(1).search(/\n(?:async )?function \w+/);
  return apres.slice(0, fin < 0 ? 4000 : fin + 1);
}

// ---------- Faux IndexedDB persistant, avec INDEX (getAllKeys, count) et compteur de lectures complètes ----------
function chargerDexie(avecIndex){
  const base = makeFakeIndexedDB(); const etat = { getAll: {}, getAllKeys: 0 };
  const indexedDB = { open(name, ver){
    const req = base.open(name, ver);
    req._succeed = idb => {
      const txOrig = idb.transaction.bind(idb);
      idb.transaction = (s, m) => {
        const tx = txOrig(s, m); const osOrig = tx.objectStore.bind(tx);
        tx.objectStore = nom => {
          const st = osOrig(nom); const gaOrig = st.getAll.bind(st);
          st.getAll = (...a) => { etat.getAll[nom] = (etat.getAll[nom] || 0) + 1; return gaOrig(...a); };
          if(avecIndex){
            const lignes = () => [...idb._tables.get(nom).rows.values()];
            st.indexNames = { contains: n => n === 'date' };
            st.index = n => ({
              count(){ const r = {}; queueMicrotask(() => { r.result = lignes().filter(o => o[n] != null).length; r.onsuccess && r.onsuccess({ target: r }); }); return r; },
              getAllKeys(){ etat.getAllKeys++; const r = {}; queueMicrotask(() => {
                const v = lignes().filter(o => o[n] != null).sort((a, b) => a[n] < b[n] ? -1 : a[n] > b[n] ? 1 : (a.id - b.id));
                r.result = v.map(o => o.id); r.onsuccess && r.onsuccess({ target: r }); }); return r; }
            });
          }
          return st;
        };
        return tx;
      };
      req.result = idb; queueMicrotask(() => { if(req.onsuccess) req.onsuccess({ target: req }); });
    };
    return req;
  } };
  const src = fs.readFileSync(DEXIE_PATH, 'utf8');
  const sbSelf = { indexedDB, DOMException, WeakMap, WeakSet, console, setTimeout, clearTimeout, queueMicrotask };
  const sb = { self: sbSelf, indexedDB, WeakMap, WeakSet, DOMException, console, setTimeout, clearTimeout, queueMicrotask };
  vm.createContext(sb); vm.runInContext(src, sb, { filename: DEXIE_PATH });
  return { Dexie: sbSelf.Dexie, etat };
}
async function baseSauvegardes(avecIndex, n, sansDate){
  const w = chargerDexie(avecIndex);
  const db = new w.Dexie('sm_t'); db.version(1).stores({ backups: '++id, date, type' });
  for(let i = 0; i < n; i++){
    const j = (i * 7) % n;   // dates NON triées comme les clés : l'ordre doit venir de la date, pas de l'id
    await db.backups.add({ date: sansDate === i ? undefined : '2026-11-' + String(1 + j).padStart(2, '0') + 'T08:00:00.000Z', type: 'auto-quotidienne', payload: 'x'.repeat(10) });
  }
  w.etat.getAll = {}; w.etat.getAllKeys = 0;
  return Object.assign(w, { db });
}

(async () => {
  // ---------- A. Moteur : les clés selon l'index, sans relire les enregistrements ----------
  {
    const w = await baseSauvegardes(true, 25);
    const ancien = await w.db.backups.orderBy('date').primaryKeys(); w.etat.getAll = {};
    let cles = null; try{ cles = await attendre(w.db.backups.clesSelonIndex('date')); }catch(_){ }
    check('A. clesSelonIndex : même ordre que l\'ancien tri (date croissante)', Array.isArray(cles) && JSON.stringify(cles) === JSON.stringify(ancien));
    check('A. … SANS relire une seule sauvegarde (aucun getAll sur backups ; getAllKeys utilisé)', !w.etat.getAll.backups && w.etat.getAllKeys === 1);
  }
  {
    const w = await baseSauvegardes(false, 12);
    const ancien = await w.db.backups.orderBy('date').primaryKeys();
    let cles = null; try{ cles = await attendre(w.db.backups.clesSelonIndex('date')); }catch(_){ }
    check('A. sans index (vieille base, navigateur ancien) : repli sur l\'ancien chemin, même résultat', Array.isArray(cles) && JSON.stringify(cles) === JSON.stringify(ancien));
  }
  {
    const w = await baseSauvegardes(true, 10, 4);   // l'enregistrement n°5 n'a pas de date : absent de l'index
    const ancien = await w.db.backups.orderBy('date').primaryKeys();
    let cles = null; try{ cles = await attendre(w.db.backups.clesSelonIndex('date')); }catch(_){ }
    check('A. un enregistrement sans date (absent de l\'index) : repli, l\'ancien ordre est conservé à l\'identique', Array.isArray(cles) && JSON.stringify(cles) === JSON.stringify(ancien) && cles[0] === 5);
  }

  // ---------- B. snapshotBackup : la purge ne recharge plus l'historique, et garde EXACTEMENT les mêmes ----------
  {
    const w = await baseSauvegardes(true, 22);
    const toutes = await w.db.backups.toArray();
    const attendu = toutes.slice().sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 20).map(b => b.id).concat([23]).sort((a, b) => a - b);
    w.etat.getAll = {}; w.etat.getAllKeys = 0;
    let ok = true;
    try{
      const src = fn('snapshotBackup') + '\n' + fn('bulkDeleteSafe') + '\nreturn snapshotBackup;';
      const snap = new Function('db', 'buildDump', 'dumpRecordCount', 'MAX_BACKUPS', 'swallow', '_bootNoteSauvegarde', src)(
        w.db, async () => ({ _checksum: 'abc', clients: [] }), () => 0, 20, () => {}, () => {});
      await attendre(snap('auto-quotidienne'));
    }catch(e){ ok = false; }
    const lusPendantPurge = w.etat.getAll.backups || 0, clesLues = w.etat.getAllKeys;
    const restantes = (await w.db.backups.toArray()).map(b => b.id).sort((a, b) => a - b);
    check('B. après une sauvegarde : 20 conservées, les plus récentes (même ensemble que l\'ancien calcul)', ok && JSON.stringify(restantes) === JSON.stringify(attendu.filter(id => restantes.includes(id))) && restantes.length === 20 && restantes.includes(23));
    check('B. la purge n\'a relu AUCUNE sauvegarde (avant : les 21, chacune contenant toute la base)', lusPendantPurge === 0 && clesLues >= 1);
  }

  // ---------- C. Tâches lourdes : après l'affichage, au repos, jamais repoussées indéfiniment ----------
  {
    let api = null;
    try{ api = new Function(APP_TXT.match(/const BOOT_TACHES_MAX_MS = \d+;/)[0] + '\n' + fn('bootQuandAuRepos') + '\nreturn bootQuandAuRepos;')(); }catch(_){ }
    const env = () => {
      const t = { horloge: 0, minuteurs: [], ecoute: {}, hidden: false };
      t.env = {
        doc: { get hidden(){ return t.hidden; }, addEventListener(k, f){ (t.ecoute[k] = t.ecoute[k] || []).push(f); }, removeEventListener(k){ t.ecoute[k] = []; } },
        win: { addEventListener(k, f){ (t.ecoute[k] = t.ecoute[k] || []).push(f); }, removeEventListener(k){ t.ecoute[k] = []; } },
        setTimeout(f, ms){ const m = { f, a: t.horloge + ms, vivant: true }; t.minuteurs.push(m); return m; },
        clearTimeout(m){ if(m) m.vivant = false; },
        now: () => t.horloge
      };
      t.avancer = ms => { t.horloge += ms; t.minuteurs.filter(m => m.vivant && m.a <= t.horloge).forEach(m => { m.vivant = false; m.f(); }); };
      t.geste = k => (t.ecoute[k] || []).slice().forEach(f => f());
      return t;
    };
    if(api){
      { const t = env(); let n = 0; api(() => n++, 15000, t.env, 120000);
        t.avancer(14000); const avant = n; t.avancer(1000);
        check('C. rien avant 15 s de repos ; lancé à 15 s', avant === 0 && n === 1); t.avancer(60000);
        check('C. lancé UNE seule fois', n === 1); }
      { const t = env(); let n = 0; api(() => n++, 15000, t.env, 120000);
        t.avancer(10000); t.geste('pointerdown'); t.avancer(10000);
        check('C. un geste de Ben relance l\'attente (pas de sauvegarde pendant qu\'il travaille)', n === 0); t.avancer(5000);
        check('C. … puis lancé après 15 s sans geste', n === 1); }
      { const t = env(); let n = 0; t.hidden = true; api(() => n++, 15000, t.env, 120000); t.avancer(60000);
        check('C. app en arrière-plan : rien ne se lance', n === 0);
        t.hidden = false; t.geste('visibilitychange'); t.avancer(15000);
        check('C. revenue au premier plan : lancé après le repos', n === 1); }
      { const t = env(); let n = 0; api(() => n++, 15000, t.env, 120000);
        for(let i = 0; i < 11; i++){ t.avancer(10000); t.geste('touchstart'); }   // 110 s d'usage, un geste toutes les 10 s
        t.avancer(10000); const avant = n;                                          // 120 s : toujours rien (repos de 15 s jamais atteint)
        t.geste('touchstart'); t.avancer(2000);                                     // passé le plafond : 2 s de repos suffisent
        check('C. plafond : après 2 min d\'usage continu, 2 s de repos suffisent (la sauvegarde du jour n\'est jamais repoussée indéfiniment)', avant === 0 && n === 1); }
    } else { check('C. bootQuandAuRepos extractible', false); }
  }

  // ---------- D. Démarrage : même préparation, même ordre ; cohérence et sauvegarde déplacées APRÈS l'affichage ----------
  {
    const iBoot = APP_TXT.indexOf('(async()=>{\n  // Le rendu ne doit JAMAIS');
    const BOOT = stripComments(APP_TXT.slice(iBoot));
    const appels = [...BOOT.matchAll(/await ([A-Za-z_]\w*)\(/g)].map(m => m[1]);
    const PREP = ['kvBoot','seedIfEmpty','seedProducts','seedCoffret10','alignerCatalogueSurGrille','migrerDateUnique','migrerDevisTarifRef','migrerCommandesIssuesDevis','seedPMS','seedAllergenes','seedEmballages','migrateDlcCongelateur','migrateCoqueColors','migrateCoquesRoseV1506','migrateMereHistoV1421','rdSeedSiVide','materializeRecurringCharges','prodSessHydrate','fixSplitComponentInheritance','migrateAddUuids','refreshMatsCache'];
    const vus = appels.filter(n => PREP.includes(n));
    check('D. les 21 étapes de préparation sont toutes là, dans le MÊME ordre qu\'en v1532', JSON.stringify([...new Set(vus)]) === JSON.stringify(PREP));
    const iAff = BOOT.indexOf("bootJalon('affiche')"), iRepos = BOOT.indexOf('bootQuandAuRepos(');
    const iCoh = BOOT.indexOf('runConsistencyCheck(false)'), iSauv = BOOT.indexOf('autoDailyBackup()');
    check('D. contrôle de cohérence et sauvegarde du jour : toujours appelés, mais DANS la tâche au repos, après l\'affichage',
      iAff > 0 && iRepos > iAff && iCoh > iRepos && iSauv > iCoh && (BOOT.match(/autoDailyBackup\(\)/g) || []).length === 1 && (BOOT.match(/runConsistencyCheck\(false\)/g) || []).length === 1);
    check('D. le délai de repos vaut 15 s', /const BOOT_TACHES_REPOS_MS = 15000;/.test(APP_TXT) && /\}, BOOT_TACHES_REPOS_MS\);/.test(BOOT));
    check('D. chaque étape est chronométrée (≥ 30 marques) et les jalons posés', (BOOT.match(/bootEtape\('/g) || []).length >= 30 && ['debutPrep','prepFinie','affiche','fond'].every(j => BOOT.includes("bootJalon('" + j + "')")));
    let regle = false;
    try{ regle = /if\(localStorage\.getItem\('sm_autoBackupDate'\)===today\(\)\) return;/.test(fn('autoDailyBackup')); }catch(_){ }
    check('D. la règle « une sauvegarde par jour » est intacte', regle);
  }

  // ---------- E. Mesure : profils bornés, rendu honnête ----------
  {
    let f = null, h = null;
    try{ f = new Function('BOOT_PROFILS_MAX', fn('bootProfilsFusion') + '\nreturn bootProfilsFusion;')(10); }catch(_){ }
    try{ h = new Function('esc', fn('bootProfilsHtml') + '\nreturn bootProfilsHtml;')(x => String(x).replace(/</g, '&lt;').replace(/>/g, '&gt;')); }catch(_){ }
    if(f && h){
      let l = []; for(let i = 1; i <= 14; i++) l = f(l, { quand: i }, 10);
      check('E. 10 démarrages gardés, le plus récent en tête', l.length === 10 && l[0].quand === 14 && l[9].quand === 5);
      l = f(l, { quand: 14, maj: 1 }, 10);
      check('E. un même démarrage mis à jour (tâches de fond) remplace sa ligne, sans doublon', l.length === 10 && l[0].maj === 1 && l.filter(p => p.quand === 14).length === 1);
      const html = h([{ quand: Date.UTC(2026, 10, 16, 6, 5), v: 'v1533', premiereDuJour: true, debutJsMs: 2400,
        jalons: { debutPrep: 2500, prepFinie: 4100, affiche: 4300 },
        etapes: [{ nom: 'kvBoot', ms: 30 }, { nom: 'migrateDlcCongelateur', ms: 900 }, { nom: 'seedPMS', ms: 400 }, { nom: 'x<b>', ms: 1200 }],
        reseau: { appJsMs: 3100, appJsOctets: 1600000, controleParSW: true },
        differe: { coherenceMs: 700, sauvegardeDue: true, sauvegardeMs: 5200, nbSauvegardes: 20 }, sauvegarde: { taille: 4200000 }, caches: ['sm-iphone-v563'] }]);
      check('E. le rendu dit : 1re du jour, prêt à 4,3 s, code lancé à 2,4 s, préparation 1,6 s', /1re du jour/.test(html) && /Prêt à l'écran : 4,3 s/.test(html) && /code lancé à 2,4 s/.test(html) && /préparation 1,6 s/.test(html));
      check('E. … les 3 étapes les plus lentes (échappées), la sauvegarde (durée, taille, historique) et le cache actif',
        /x&lt;b&gt; 1,2 s · migrateDlcCongelateur 900 ms · seedPMS 400 ms/.test(html) && /sauvegarde du jour 5,2 s, 4,0 Mo, 20 en historique/.test(html) && /sm-iphone-v563/.test(html) && /téléchargé, 1,5 Mo/.test(html));
      check('E. aucune mesure : on le dit, on n\'invente rien', /Aucun démarrage mesuré/.test(h([])) && /—/.test(h([{ quand: 1 }])));
    } else { check('E. bootProfilsFusion / bootProfilsHtml extractibles', false); }
    check('E. la section « Démarrages récents » est dans Santé de l\'app', /⏱ Démarrages récents/.test(APP_TXT) && /bootProfilsHtml\(JSON\.parse\(localStorage\.getItem\('sm_bootProfils'\)/.test(APP_TXT));
    check('E. la taille de chaque sauvegarde est relevée au moment où elle est écrite', /_bootNoteSauvegarde\(payload\.length\)/.test(APP_TXT));
  }

  // ---------- F. Service worker : délai maximal pour le code, installation tolérante ----------
  {
    const src = fs.readFileSync(SW_PATH, 'utf8');
    const charger = (reseau, cacheInit, delaiInstantane) => {
      const ecoute = {}, stock = new Map(Object.entries(cacheInit || {}));
      const cache = {
        match: async r => stock.get(typeof r === 'string' ? r : r.url) || null,
        put: async (r, v) => { stock.set(typeof r === 'string' ? r : r.url, v); },
        add: async u => { const res = await reseau(u); if(!res || res.status !== 200) throw new Error('404 ' + u); stock.set(u, res); },
        addAll: async us => { for(const u of us){ const res = await reseau(u); if(!res || res.status !== 200) throw new Error('404 ' + u); } for(const u of us) stock.set(u, 'ok'); }
      };
      const sb = { self: { addEventListener(k, f){ ecoute[k] = f; }, location: { origin: 'https://ben.test' }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
        caches: { open: async () => cache, keys: async () => [], delete: async () => true },
        fetch: r => reseau(r), URL, Promise, console, setTimeout: delaiInstantane ? (f => setTimeout(f, 5)) : setTimeout, clearTimeout };
      vm.createContext(sb); vm.runInContext(src, sb);
      return { ecoute, stock };
    };
    const req = u => ({ method: 'GET', url: 'https://ben.test/sensations-macarons/' + u, mode: 'no-cors' });
    const servir = async (w, u) => { let p = null, wu = null; w.ecoute.fetch({ request: req(u), respondWith(x){ p = x; }, waitUntil(x){ wu = x; } }); return { rep: await p, wu }; };
    const neuf = { status: 200, type: 'basic', clone(){ return 'copie-neuve'; }, id: 'reseau' };
    {
      const w = charger(async () => neuf, { 'https://ben.test/sensations-macarons/app.js': { id: 'cache' } }, true);
      const { rep } = await attendre(servir(w, 'app.js'));
      check('F. réseau rapide : le code vient du réseau (fraîcheur garantie, comme avant)', rep && rep.id === 'reseau');
    }
    {
      let resoudre; const lent = new Promise(r => { resoudre = r; });
      const w = charger(() => lent, { 'https://ben.test/sensations-macarons/app.js': { id: 'cache' } }, true);
      const t0 = Date.now(); const { rep, wu } = await attendre(servir(w, 'app.js'), 2000).catch(() => ({}));
      check('F. réseau muet : la copie du téléphone est servie sans attendre le réseau indéfiniment', rep && rep.id === 'cache' && Date.now() - t0 < 1500);
      resoudre(neuf); await new Promise(r => setTimeout(r, 20));
      check('F. … et la réponse réseau tardive met quand même le cache à jour (waitUntil)', !!wu && w.stock.get('https://ben.test/sensations-macarons/app.js') === 'copie-neuve');
    }
    {
      const w = charger(async () => neuf, {}, true);
      const { rep } = await attendre(servir(w, 'app.js'));
      check('F. aucune copie en cache (première installation) : on attend le réseau, comme avant', rep && rep.id === 'reseau');
    }
    check('F. délai maximal : 3 s', /const CODE_DELAI_MS = 3000;/.test(src));
    {
      const absent = new Set(['./qr.min.js', './rd_pack_tfp.json']);
      const w = charger(async u => absent.has(u) ? { status: 404 } : { status: 200 }, {});
      let ok = false; try{ let p; w.ecoute.install({ waitUntil(x){ p = x; } }); await attendre(p); ok = true; }catch(_){ ok = false; }
      check('F. installation : un fichier secondaire absent du site ne la fait plus échouer', ok && w.stock.has('./app.js') && w.stock.has('./qr_min.js') && !w.stock.has('./qr.min.js'));
    }
    {
      const w = charger(async u => u === './app.js' ? { status: 404 } : { status: 200 }, {});
      let ok = false; try{ let p; w.ecoute.install({ waitUntil(x){ p = x; } }); await attendre(p); ok = true; }catch(_){ ok = false; }
      check('F. installation : un fichier ESSENTIEL absent la fait toujours échouer (pas d\'app à moitié installée)', ok === false);
    }
    check('F. les scripts réellement chargés par la page sont mis en cache (qr_min.js, html5-qrcode.min.js)', /'\.\/qr_min\.js'/.test(src) && /'\.\/html5-qrcode\.min\.js'/.test(src));
    check('F. cache du service worker incrémenté', (m => !!m && +m[1] >= 563)(src.match(/const CACHE = 'sm-iphone-v(\d+)'/)));
  }
  check('G. APP_VERSION v1533 ou ultérieure', (m => !!m && +m[1] >= 1533)(APP_TXT.match(/const APP_VERSION = 'v(\d+)';/)));

  console.log(`v1533 — ${pass} assertions OK, ${fail} en échec`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(e => { console.log('ERREUR', e && e.stack || e); process.exit(1); });
