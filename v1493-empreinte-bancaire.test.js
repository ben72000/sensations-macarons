'use strict';
// v1493 — « CHÈQUE DE CAUTION » DEVIENT « EMPREINTE BANCAIRE ». Ben : « le chèque de caution doit se
// transformer en empreinte bancaire. Peux-tu changer la mention partout où apparaît chèque de
// caution ? »
//
// ⚠️ CE N'EST PAS UN SIMPLE RENOMMAGE. Le texte associé décrivait des gestes propres à un CHÈQUE :
// il est « remis », « n'est pas encaissé », il est « restitué ». Une empreinte bancaire se PREND,
// se DÉBITE et s'ANNULE. Renommer sans adapter les verbes aurait laissé des clauses incohérentes
// dans les CGV — un document juridique que Ben transmet à ses clients.
//
// LES IDENTIFIANTS DE CODE (CAUTION_CHEQUE, cautionRowHtml, cautionMention) sont CONSERVÉS : les
// renommer toucherait des dizaines de références et des données déjà enregistrées, pour zéro gain
// visible. Seul le TEXTE VU PAR LE CLIENT change.
const { extractFunction, APP } = require('./_extract');
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. PLUS AUCUNE occurrence visible de l'ancien terme ----
{
  check('A. « chèque de caution » a disparu de app.js', !/chèque de caution/i.test(APP));
  check('A. …et de index.html', !/chèque de caution/i.test(HTML));
  check('A. le nouveau terme est présent', (APP.match(/empreinte bancaire/gi)||[]).length >= 8);
}

// ---- B. LA LIGNE DU DEVIS/FACTURE : terme ET gestes adaptés ----
{
  const R = new Function('cmdALocation','euro','CAUTION_CHEQUE', `
    ${extractFunction('cautionRowHtml')}
    return cautionRowHtml;
  `)(lignes => (lignes||[]).some(l => l && l.equip > 0), n => n.toFixed(2) + ' €', 80);

  const html = R([{ equip:1 }], { cautionMention:true });
  check('B. le libellé est « Empreinte bancaire »', /Empreinte bancaire/.test(html));
  check('B. l\'empreinte est PRISE, pas remise', /empreinte prise le jour de la livraison/.test(html));
  check('B. elle n\'est pas DÉBITÉE (et non « non encaissée »)', /non débitée/.test(html));
  check('B. elle est ANNULÉE, pas restituée', /annulée après retour du matériel/.test(html));
  check('B. aucun vocabulaire de chèque ne subsiste', !/remettre|encaissé|restitué/.test(html));
  check('B. le montant reste affiché', /80\.00/.test(html));
}

// ---- C. LES CGV : les trois clauses adaptées, pas seulement renommées ----
{
  check('C. 7.1 est intitulée « empreinte bancaire »', /7\.1 Client professionnel \(B2B\) — empreinte bancaire/.test(APP));
  check('C. 7.1 : l\'empreinte est PRISE à la mise à disposition', /une empreinte bancaire[^<]*est prise au moment de la mise à disposition/.test(APP));
  check('C. 7.1 : elle n\'est pas DÉBITÉE et est ANNULÉE',
    /Cette empreinte n’est pas débitée et est annulée après retour du matériel/.test(APP));
  check('C. 7.2 mentionne l\'absence d\'empreinte pour un particulier',
    /aucune empreinte bancaire, dépôt de garantie ou somme d’argent n’est exigé/.test(APP));
  check('C. 7.4 : l\'empreinte est DÉBITÉE (et non encaissée)',
    /l’empreinte bancaire pourra être débitée à ce titre/.test(APP));
  // La logique juridique doit être intacte : montants dus, complément, surplus.
  check('C. 7.4 conserve « tout complément reste exigible, tout surplus est restitué »',
    /tout complément reste exigible, tout surplus est restitué/.test(APP));
  check('C. 7.2 conserve l\'engagement sur l\'honneur du particulier', /s’engage sur l’honneur/.test(APP));
}

// ---- D. NON-RÉGRESSION : le mécanisme de la v1492 est intact ----
{
  const R = new Function('cmdALocation','euro','CAUTION_CHEQUE', `
    ${extractFunction('cautionRowHtml')}
    return cautionRowHtml;
  `)(lignes => (lignes||[]).some(l => l && l.equip > 0), n => n.toFixed(2) + ' €', 80);

  check('D. case décochée → mention masquée', R([{equip:1}], {cautionMention:false}) === '');
  check('D. champ absent → mention affichée (documents existants)', /Empreinte bancaire/.test(R([{equip:1}], {})));
  check('D. contexte absent → mention affichée', /Empreinte bancaire/.test(R([{equip:1}])));
  check('D. sans location → aucune mention', R([{type:'coffret'}], {cautionMention:true}) === '');
  check('D. la case existe toujours', /id="f_cautionMention"/.test(APP));
  check('D. …et son libellé emploie le nouveau terme', /Afficher la mention « empreinte bancaire »/.test(APP));
}

// ---- E. LES IDENTIFIANTS DE CODE sont conservés (choix assumé) ----
// Les renommer toucherait des données déjà enregistrées (`cautionMention` est persisté).
{
  check('E. la constante de montant est inchangée', /const CAUTION_CHEQUE = 80;/.test(APP));
  check('E. la fonction de rendu garde son nom', /function cautionRowHtml\(lignes, ctx\)/.test(APP));
  check('E. le drapeau persisté garde son nom', /cautionMention/.test(APP));
  check('E. le choix est expliqué dans le code', /Le NOM des\n\/\/ identifiants[\s\S]{0,120}est CONSERVE/.test(APP));
  // GARDE : le drapeau suit toujours l'acompte partout (acquis v1492).
  const lignes = APP.split('\n');
  const manques = [];
  lignes.forEach((x, i) => {
    if(/acompteMention\s*:/.test(x) && !/cautionMention/.test(x) && !/f_acompteMention/.test(x)) manques.push(i+1);
  });
  check(`E. le drapeau suit l'acompte partout (${manques.join(', ') || 'aucun manque'})`, manques.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
