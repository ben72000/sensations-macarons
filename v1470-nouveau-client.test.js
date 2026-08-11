'use strict';
// v1470 — IMPOSSIBLE D'AJOUTER UN NOUVEAU CLIENT. Ben : « Impossible de rajouter un nouveau client
// via la fiche client. C'est un bug que je n'avais pas avant. »
//
// 🚨 RÉGRESSION : le bouton « + Nouveau client » de l'écran Clients appelait `clientFiche()` — la
// vue « fiche client intelligente » — SANS identifiant. Or celle-ci fait `+id` → `+undefined` →
// NaN, ne trouve aucun client, affiche « Client introuvable » et s'arrête. Le bouton ne pouvait
// donc RIEN ouvrir.
//
// Introduite quand la fiche intelligente a remplacé l'ancien écran client : le bouton d'AJOUT a
// suivi la nouvelle fonction, alors qu'il devait continuer de pointer vers le FORMULAIRE DE
// CRÉATION (`clientForm`), seule fonction capable de fonctionner sans client existant.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. Le bouton pointe vers la création, pas vers la consultation ----
{
  const i = APP.indexOf('+ Nouveau client</button></div></div>');
  const zone = APP.slice(Math.max(0, i-300), i+60);
  check('A. le bouton « + Nouveau client » appelle clientForm()', /onclick="clientForm\(\)"/.test(zone));
  check('A. il n\'appelle plus clientFiche() sans identifiant', !/onclick="clientFiche\(\)"/.test(zone));
  // Garde globale : plus aucun GESTIONNAIRE DE CLIC n'appelle clientFiche sans argument.
  // ⚠️ Volontairement restreinte aux onclick : une recherche sur tout le fichier se déclenchait
  // sur le texte du journal de version, qui CITE l'appel fautif pour l'expliquer. Citer un bug
  // n'est pas le rétablir — même principe que la garde de motif de la v1428.
  check('A. aucun gestionnaire de clic n\'appelle clientFiche() sans argument',
    !/onclick="[^"]*clientFiche\(\)/.test(APP));
}

// ---- B. clientForm sait fonctionner SANS client (c'est ce qui le distingue) ----
{
  const src = extractFunction('clientForm');
  check('B. sans identifiant, clientForm part d\'un objet vide', /id \? await db\.clients\.get\(id\) : \{\}/.test(src));
  check('B. le titre s\'adapte (« Nouveau » vs « Fiche »)', /\$\{id\?'Fiche':'Nouveau'\}/.test(src));
  check('B. le bouton Supprimer n\'apparaît pas sur une création', /\$\{id\?`<button class="btn danger"/.test(src));
  const srcSave = extractFunction('saveClient');
  check('B. l\'enregistrement distingue création et mise à jour',
    /if\(id\) await db\.clients\.update\(id,o\); else await db\.clients\.add\(/.test(srcSave));
  check('B. le nom reste obligatoire', /if\(!o\.nom\)/.test(srcSave));
}

// ---- C. Garde-fou : clientFiche appelée sans identifiant redirige vers la création ----
async function testGardeFou(){
  const src = extractFunction('clientFiche');
  check('C. clientFiche teste l\'absence d\'identifiant AVANT d\'interroger la base',
    src.indexOf('Number.isFinite') < src.indexOf('db.clients.get'));
  check('C. …et redirige vers le formulaire de création', /return clientForm\(\)/.test(src));

  // Comportement : on n'atteint jamais « Client introuvable » sans identifiant.
  const cas = [undefined, null, '', 0, NaN, -1];
  for(const v of cas){
    let versCreation = false, toastAffiche = null, lu = false;
    const fn = new Function('db','toast','clientForm', `
      ${src}
      return clientFiche;
    `)(
      { clients: { get: async () => { lu = true; return null; } }, orders:{toArray:async()=>[]}, recipes:{toArray:async()=>[]} },
      m => { toastAffiche = m; },
      () => { versCreation = true; }
    );
    await fn(v);
    check(`C. clientFiche(${JSON.stringify(v)}) ouvre la création`, versCreation === true);
    check(`C. clientFiche(${JSON.stringify(v)}) n'affiche pas « Client introuvable »`, toastAffiche === null);
    check(`C. clientFiche(${JSON.stringify(v)}) n'interroge même pas la base`, lu === false);
  }

  // Non-régression : avec un identifiant valide, la consultation fonctionne toujours.
  {
    let versCreation = false, lu = false;
    const fn = new Function('db','toast','clientForm', `${src}\nreturn clientFiche;`)(
      { clients: { get: async () => { lu = true; return null; } }, orders:{toArray:async()=>[]}, recipes:{toArray:async()=>[]} },
      ()=>{}, () => { versCreation = true; }
    );
    await fn(42);
    check('C. avec un identifiant valide, on consulte (pas de redirection vers la création)',
      versCreation === false && lu === true);
  }
}

testGardeFou().then(()=>{
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e=>{ console.error('ERREUR SUITE', e); process.exitCode = 1; });
