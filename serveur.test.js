'use strict';
/* Tests des fonctions PURES du sas côté Shopify (mapping + signature), SANS
   express. Le routage Express se validera en intégration à la mise en place ;
   ici on couvre le vrai risque de sécurité (signature) et de correction
   (mapping des ventes). Lance : node tests/serveur.test.js */
const crypto = require('crypto');
const { extraireVente, verifieSignatureShopify } = require('../src/shopify');

let nOk = 0, nKo = 0;
function ok(cond, label) {
  if (cond) { nOk++; console.log('  \u2713 ' + label); }
  else { nKo++; console.log('  \u2717 ' + label); }
}
console.log('\n=== TESTS \u2014 sas : shopify (mapping + signature) ===\n');

// \u2500\u2500 extraireVente \u2500\u2500
{
  const order = {
    id: 123456, created_at: '2026-07-22T10:00:00Z',
    line_items: [
      { title: 'Coffret 6', quantity: 1, properties: [{ name: 'parfum', value: 'Vanille' }] },
      { title: 'Coffret 6', quantity: 2, properties: [{ name: 'parfum', value: 'Chocolat' }] },
    ],
  };
  const v = extraireVente(order);
  ok(v && v.id === 123456, 'E1 \u00b7 id de commande extrait');
  ok(v.ligne.Vanille === 1 && v.ligne.Chocolat === 2, 'E2 \u00b7 lignes parfum extraites via propri\u00e9t\u00e9 \u00ab parfum \u00bb');

  const order2 = { id: 9, line_items: [{ title: 'Pistache', quantity: 3 }] };
  ok(extraireVente(order2).ligne.Pistache === 3, 'E3 \u00b7 repli sur le titre si pas de propri\u00e9t\u00e9 parfum');

  ok(extraireVente({ id: 1, line_items: [] }) === null, 'E4 \u00b7 commande sans ligne \u2192 null');
  ok(extraireVente({ line_items: [{ title: 'X', quantity: 1 }] }) === null, 'E5 \u00b7 commande sans id \u2192 null');
  // deux lignes du m\u00eame parfum \u2192 cumul\u00e9es
  const order3 = { id: 7, line_items: [
    { title: 'X', quantity: 2, properties: [{ name: 'parfum', value: 'Citron' }] },
    { title: 'Y', quantity: 3, properties: [{ name: 'parfum', value: 'Citron' }] },
  ] };
  ok(extraireVente(order3).ligne.Citron === 5, 'E6 \u00b7 deux lignes m\u00eame parfum \u2192 cumul\u00e9es');
}

// \u2500\u2500 verifieSignatureShopify \u2500\u2500
{
  const secret = 'test-secret';
  const body = JSON.stringify({ id: 1, line_items: [] });
  const bon = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');

  ok(verifieSignatureShopify(secret, bon, body) === true, 'S1 \u00b7 bonne signature \u2192 accept\u00e9e');
  ok(verifieSignatureShopify(secret, 'bidon', body) === false, 'S2 \u00b7 signature bidon \u2192 rejet\u00e9e');
  ok(verifieSignatureShopify(secret, '', body) === false, 'S3 \u00b7 signature absente \u2192 rejet\u00e9e');
  ok(verifieSignatureShopify('', bon, body) === false, 'S4 \u00b7 pas de secret configur\u00e9 \u2192 rejet\u00e9e');
  // corps falsifi\u00e9 apr\u00e8s signature \u2192 rejet
  ok(verifieSignatureShopify(secret, bon, body + 'x') === false, 'S5 \u00b7 corps modifi\u00e9 apr\u00e8s coup \u2192 rejet\u00e9e');
}

console.log(`\n=== sas shopify : ${nOk} OK, ${nKo} KO ===\n`);
if (nKo > 0) process.exit(1);
