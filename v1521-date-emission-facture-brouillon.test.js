'use strict';
// v1521 — DATE D'ÉMISSION D'UNE FACTURE BROUILLON QUI « REVIENT » À LA DATE INITIALE.
// Ben : « quand je génère une facture depuis les commandes puis que je l'ouvre dans devis/facture, j'aimerais pouvoir éditer la date d'émission.
// Ça semble fonctionner mais quand j'ouvre la facture la date d'émission n'est pas mise à jour et reste à la date initiale ».
//
// CAUSES (lues dans le code, reproduites ici sur le vrai code) :
//  ① `docSetFactDate` ne changeait que le champ `date` du document, jamais la date inscrite dans son HTML mémorisé (`<span id="factDate">`) — que
//    l'envoi par mail relit.
//  ② surtout : « Aperçu complet » d'un brouillon le RÉGÉNÈRE depuis ses commandes (`genererFactureMultiple`), qui réécrivait la date avec `today()`,
//    dans le HTML ET dans l'enregistrement : la date choisie était écrasée dès l'ouverture de l'aperçu.
// CORRECTIFS : la régénération reprend la date du brouillon existant ; changer la date réécrit aussi le HTML ; une facture validée ne change jamais ;
// une date future reste refusée.
const { APP } = require('./_extract');
let pass = 0, fail = 0; const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }
function fn(marker){ const i = APP.indexOf(marker); if(i < 0) return ''; const j = APP.indexOf('\n}\n', i); return APP.slice(i, j < 0 ? i + 4000 : j + 3); }
const AUJ = '2026-11-08';
const fmtDate = iso => iso.split('-').reverse().join('/');
const esc = x => String(x);

// ---------- base factice de documents ----------
function baseDocs(docs){
  const T = { docs: docs.map(d => ({ ...d })) };
  const db = { documents: {
    get: async id => T.docs.find(d => d.id === id),
    update: async (id, patch) => { Object.assign(T.docs.find(d => d.id === id), patch); },
    where: () => ({ equals: () => ({ toArray: async () => T.docs.filter(d => d.type === 'facture') }) })
  } };
  return { T, db };
}
const HTML = d => `<div>Date d'émission : <span id="factDate">${fmtDate(d)}</span><br>Facture (brouillon)</div>`;

(async () => {
  const srcSet = fn('async function docSetFactDate(id, v){') + '\n' + fn('function docHtmlAvecDate(html, iso){');
  check('A. docSetFactDate et docHtmlAvecDate retrouvées', srcSet.length > 400);
  function monde(docs, { definitif = false } = {}){
    const { T, db } = baseDocs(docs); const toasts = []; const input = { value: '' };
    const doc = { getElementById: () => input };
    const api = new Function('db','today','toast','document','esc','fmtDate','docEstDefinitif','markUnsaved', srcSet + '\nreturn { docSetFactDate, docHtmlAvecDate };')
      (db, () => AUJ, t => toasts.push(t), doc, esc, fmtDate, d => definitif || d.statut !== 'brouillon', () => {});
    return { T, db, api, toasts, input };
  }

  // ---------- A. changer la date met à jour le champ ET le HTML mémorisé ----------
  {
    const w = monde([{ id: 1, type: 'facture', statut: 'brouillon', date: '2026-11-08', html: HTML('2026-11-08') }]);
    await w.api.docSetFactDate(1, '2026-11-02');
    const d = w.T.docs[0];
    check('A. le champ date du brouillon passe au 2026-11-02', d.date === '2026-11-02');
    check('A. le HTML mémorisé porte AUSSI 02/11/2026 (et plus la date initiale)', /<span id="factDate">02\/11\/2026<\/span>/.test(d.html) && !/08\/11\/2026/.test(d.html));
    check('A. le reste du HTML est intact', /Facture \(brouillon\)/.test(d.html));
  }
  {
    const w = monde([{ id: 1, type: 'facture', statut: 'brouillon', date: '2026-11-02', html: HTML('2026-11-02') }]);
    await w.api.docSetFactDate(1, '2026-12-25');
    const d = w.T.docs[0];
    check('A. date FUTURE : refusée, ramenée à aujourd\'hui, champ ET HTML cohérents', d.date === AUJ && /08\/11\/2026/.test(d.html) && w.toasts.some(t => /futur/.test(t)));
  }
  {
    const w = monde([{ id: 1, type: 'facture', statut: 'emise', numero: '2026-F-001', date: '2026-11-02', html: HTML('2026-11-02') }]);
    await w.api.docSetFactDate(1, '2026-11-05');
    check('A. facture VALIDÉE : date et HTML ne bougent JAMAIS', w.T.docs[0].date === '2026-11-02' && /02\/11\/2026/.test(w.T.docs[0].html));
  }
  {
    const w = monde([{ id: 1, type: 'facture', statut: 'brouillon', date: '2026-11-02', html: '' }]);
    await w.api.docSetFactDate(1, '2026-11-04');
    check('A. brouillon sans HTML mémorisé : la date se met à jour sans plantage', w.T.docs[0].date === '2026-11-04');
  }
  {
    const w = monde([{ id: 1, type: 'facture', statut: 'brouillon', date: '2026-11-02', html: HTML('2026-11-02') }]);
    await w.api.docSetFactDate(1, '');
    check('A. champ vidé : refusé, la date existante est conservée', w.T.docs[0].date === '2026-11-02');
  }

  // ---------- B. la RÉGÉNÉRATION reprend la date du brouillon (le vrai bloc d'app.js) ----------
  const iB = APP.indexOf("// [v1521] La date d'émission d'un BROUILLON déjà existant");
  const jB = APP.indexOf('const _livDates', iB);
  const blocB = APP.slice(iB, jB);
  check('B. bloc de reprise de date retrouvé', blocB.length > 300 && /_emissionISO/.test(blocB));
  async function dateRetenue(docs, ids, regen){
    const { db } = baseDocs(docs);
    return await new Function('db','today','ids','_factRegenCtx', 'return (async()=>{' + blocB + '\nreturn _emissionISO; })();')(db, () => AUJ, ids, regen || null);
  }
  const brouillon = (date, oids) => ({ id: 7, type: 'facture', statut: 'brouillon', orderIds: oids, date, html: HTML(date) });
  check('B. brouillon existant au 02/11 : la régénération (Aperçu complet) GARDE le 2026-11-02', await dateRetenue([brouillon('2026-11-02', [10, 11])], [11, 10]) === '2026-11-02');
  check('B. aucun brouillon pour ces commandes : date du jour', await dateRetenue([brouillon('2026-11-02', [10, 11])], [12]) === AUJ);
  check('B. brouillon d\'un AUTRE lot de commandes : ignoré', await dateRetenue([brouillon('2026-11-02', [10])], [10, 11]) === AUJ);
  check('B. facture VALIDÉE sur les mêmes commandes : sa date n\'est pas reprise (nouveau brouillon = aujourd\'hui)', await dateRetenue([{ id: 8, type: 'facture', statut: 'emise', orderIds: [10], date: '2026-10-01' }], [10]) === AUJ);
  check('B. date de brouillon dans le futur (donnée corrompue) : ignorée', await dateRetenue([brouillon('2027-01-01', [10])], [10]) === AUJ);
  check('B. régénération d\'une facture figée : sa date figée prime', await dateRetenue([], [10], { date: '2026-09-15', numero: 'F1' }) === '2026-09-15');

  // ---------- C. le HTML et l'enregistrement utilisent cette date, plus today() ----------
  check('C. le HTML de la facture affiche _emissionISO', /<span id="factDate">\$\{fmtDate\(_emissionISO\)\}<\/span>/.test(APP));
  check('C. l\'enregistrement du brouillon écrit _emissionISO (plus today())', /clientId:\(client&&client\.id\)\|\|orders\[0\]\.clientId\|\|0,\s*\n\s*date:_emissionISO,/.test(APP));
  check('C. aucune écriture « date:today() » ne subsiste dans la génération de facture groupée', !/date:today\(\),\s*\n\s*montant:money2\(grandTotal\)/.test(APP));
  check('C. la validation continue de réécrire la date dans le HTML', /html=html\.replace\(\/<span id="factDate">/.test(APP));

  console.log(`v1521 — ${pass} assertions OK, ${fail} en échec`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
})().catch(e => { console.log('ERREUR', e && e.stack || e); process.exit(1); });
