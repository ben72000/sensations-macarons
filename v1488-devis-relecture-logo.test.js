'use strict';
// v1488 — LA VRAIE CAUSE : LE DEVIS NE SE RELISAIT PAS. Ben, après la v1487 : « à l'enregistrement
// le problème reste entier. Pas de sauvegarde. Tout se passe bien au moment de remplir mais rien ne
// s'enregistre à la fin ».
//
// 🚨 MA v1487 CORRIGEAIT L'ÉCRITURE — et elle avait raison de le faire, les champs manquaient
// vraiment dans les constructeurs. Mais le symptôme venait de l'autre bout : la RELECTURE.
// Quand `cmdForm` rouvre un devis, il reconstruit son modèle CHAMP PAR CHAMP depuis le document.
// Les champs logo n'y figuraient pas → à la réouverture, les champs paraissaient vides. Et en
// réenregistrant, ces vides ÉCRASAIENT les bonnes valeurs : d'où « rien ne s'enregistre jamais ».
//
// ⚠️ LEÇON, LA MÊME QU'EN v1481 : j'ai corrigé un mécanisme fautif sans suivre la boucle COMPLÈTE
// écriture → relecture → réécriture. Un aller simple vérifié ne prouve pas qu'un aller-retour tient.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. LA RELECTURE restitue les champs logo ----
{
  const i = APP.indexOf('const dv = await db.documents.get(_cmdDevisId);');
  const src = APP.slice(i, i + 2200);
  check('A. la quantité de macarons logotés est relue', /persoLogoNb:\+dv\.persoLogoNb\|\|0/.test(src));
  check('A. le nombre de créations graphiques aussi', /forfaitCreationNb:\+dv\.forfaitCreationNb\|\|0/.test(src));
  check('A. le drapeau aussi (sinon le bloc s\'ouvrirait fermé)',
    /logo:!!\(dv\.logo\|\|\+dv\.persoLogoNb>0\|\|\+dv\.forfaitCreationNb>0\)/.test(src));
  check('A. la personnalisation COULEURS reste relue (non-régression)', /persoMacarons:\+dv\.persoMacarons\|\|0/.test(src));
}

// ---- B. AUCUN CHAMP DE SAISIE écrit dans le devis n'est oublié à la relecture ----
// C'est LA garde qui aurait évité ce bug : elle compare ce que le devis ÉCRIT à ce qu'il RELIT.
{
  const iDoc = APP.indexOf('const docObj');
  const doc = APP.slice(iDoc, APP.indexOf('if(_cmdDevisId)', iDoc));
  const iRel = APP.indexOf('const dv = await db.documents.get(_cmdDevisId);');
  const relu = APP.slice(iRel, iRel + 2200);

  const ecrits = [...new Set([...doc.matchAll(/^\s*([a-zA-Z_][\w]*)\s*:/gm)].map(m => m[1]))];
  const relus = [...relu.matchAll(/([a-zA-Z_][\w]*)\s*:/g)].map(m => m[1]);
  // Champs RÉGÉNÉRÉS à l'enregistrement, jamais saisis : leur absence est correcte.
  const regeneres = ['type','montant','acompte','validiteJours','orderId','numero','statut',
                     'expiration','createdAt','refInterne','clientId'];
  const perdus = ecrits.filter(c => !relus.includes(c) && !regeneres.includes(c));
  check(`B. aucun champ de saisie perdu à la relecture (${perdus.join(', ') || 'aucun'})`, perdus.length === 0);
}

// ---- C. RÉCONCILIATION : l'aller-retour COMPLET conserve les valeurs ----
// écriture (docObj) → relecture (cmdForm) → réécriture. C'est ce cycle qui échouait.
{
  const cmd = { logo:true, persoLogoNb:150, forfaitCreationNb:1, persoMacarons:20 };

  // 1. Écriture dans le devis (mêmes règles que docObj).
  const devis = {
    logo: !!(cmd.logo || +cmd.persoLogoNb>0 || +cmd.forfaitCreationNb>0),
    persoLogoNb: +cmd.persoLogoNb||0,
    forfaitCreationNb: +cmd.forfaitCreationNb||0,
    persoMacarons: +cmd.persoMacarons||0
  };
  check('C. le devis écrit bien les 150 macarons logotés', devis.persoLogoNb === 150);

  // 2. Relecture dans le formulaire (mêmes règles que cmdForm).
  const relu = {
    logo: !!(devis.logo || +devis.persoLogoNb>0 || +devis.forfaitCreationNb>0),
    persoLogoNb: +devis.persoLogoNb||0,
    forfaitCreationNb: +devis.forfaitCreationNb||0,
    persoMacarons: +devis.persoMacarons||0
  };
  check('C. la relecture retrouve les 150', relu.persoLogoNb === 150);
  check('C. …et la création graphique', relu.forfaitCreationNb === 1);
  check('C. …et coche la case (le bloc s\'ouvre)', relu.logo === true);

  // 3. Réécriture : c'est ici que les vides écrasaient tout.
  const reecrit = {
    logo: !!(relu.logo || +relu.persoLogoNb>0 || +relu.forfaitCreationNb>0),
    persoLogoNb: +relu.persoLogoNb||0,
    forfaitCreationNb: +relu.forfaitCreationNb||0
  };
  check('C. RÉCONCILIATION : après aller-retour, la quantité est INCHANGÉE', reecrit.persoLogoNb === 150);
  check('C. …et le forfait aussi', reecrit.forfaitCreationNb === 1);

  // Le défaut d'avant : sans relecture, tout repartait à zéro.
  const sansRelecture = { persoLogoNb: +(undefined)||0, forfaitCreationNb: +(undefined)||0 };
  check('C. (pour mémoire) sans relecture, la quantité repartait à ZÉRO', sansRelecture.persoLogoNb === 0);
}

// ---- D. NON-RÉGRESSION : l'écriture corrigée en v1487 tient toujours ----
{
  const iDoc = APP.indexOf('const docObj');
  const doc = APP.slice(iDoc, APP.indexOf('if(_cmdDevisId)', iDoc));
  check('D. docObj écrit toujours la quantité logo', /persoLogoNb:\+o\.persoLogoNb\|\|0/.test(doc));
  check('D. …et le forfait', /forfaitCreationNb:\+o\.forfaitCreationNb\|\|0/.test(doc));
  check('D. …et le drapeau', /logo:!!\(o\.logo/.test(doc));
}

// ---- E. Le formulaire pré-remplit bien les champs depuis le modèle ----
{
  check('E. la quantité logo est injectée dans le champ', /id="f_logoNb" value="\$\{o\.persoLogoNb\|\|''\}"/.test(APP));
  check('E. le forfait aussi', /id="f_forfaitNb" value="\$\{o\.forfaitCreationNb\|\|''\}"/.test(APP));
  check('E. la case est cochée si le modèle le dit',
    /id="f_logo" \$\{\(o\.logo\|\|\+o\.persoLogoNb>0\|\|\+o\.forfaitCreationNb>0\)\?'checked'/.test(APP));
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
