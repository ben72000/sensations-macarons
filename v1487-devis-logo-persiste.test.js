'use strict';
// v1487 — LE DEVIS PERDAIT LA PERSONNALISATION LOGO. Ben : « quand j'enregistre le devis la
// personnalisation logo ne se sauvegarde pas ».
//
// 🚨 CAUSE : les champs logo n'ont JAMAIS été copiés dans le document. Ajoutés en v1463, ils ont été
// oubliés dans les constructeurs de documents — le commentaire voisin dit d'ailleurs
// « Personnalisation des COULEURS », la ligne n'a jamais été étendue au logo. Le devis figeait donc
// un supplément à zéro alors que la commande le portait.
//
// 🚨 ET LE CHEMIN RETOUR ÉTAIT TOUCHÉ AUSSI — trouvé en vérifiant l'aller-retour complet, pas
// signalé par Ben : un devis accepté redevenant commande perdait le supplément. Le client aurait
// signé un devis à 120 € de logo, et la commande serait repartie à zéro.
const { extractFunction, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// Extrait un constructeur d'objet littéral autour d'une ancre, pour vérifier ses champs.
function blocAutour(ancre, avant, apres){
  const i = APP.indexOf(ancre);
  if(i < 0) return '';
  const lignes = APP.slice(0, i).split('\n').length;
  return APP.split('\n').slice(lignes - (avant||6), lignes + (apres||14)).join('\n');
}

// ---- A. COMMANDE → DEVIS : les champs logo sont figés dans le document ----
{
  const b = blocAutour("perso:!!(o.perso||+o.persoMacarons>0), persoMacarons:+o.persoMacarons||0, persoCouleurs:Array.isArray(o.persoCouleurs)?o.persoCouleurs:[], persoRemise", 4, 12);
  check('A. la quantité de macarons logotés est copiée', /persoLogoNb:\+o\.persoLogoNb\|\|0/.test(b));
  check('A. le nombre de créations graphiques aussi', /forfaitCreationNb:\+o\.forfaitCreationNb\|\|0/.test(b));
  check('A. le drapeau d\'activation aussi', /logo:!!\(o\.logo\|\|\+o\.persoLogoNb>0\|\|\+o\.forfaitCreationNb>0\)/.test(b));
  check('A. la personnalisation COULEURS reste copiée (non-régression)', /persoMacarons:\+o\.persoMacarons\|\|0/.test(b));
}

// ---- B. COMMANDE REPASSÉE EN DEVIS : même correction ----
{
  const b = blocAutour("perso:!!(o.perso||+o.persoMacarons>0), persoMacarons:+o.persoMacarons||0, persoCouleurs:Array.isArray(o.persoCouleurs)?o.persoCouleurs:[], persoR", 4, 12);
  check('B. quantité logo copiée', /persoLogoNb:\+o\.persoLogoNb\|\|0/.test(b));
  check('B. créations graphiques copiées', /forfaitCreationNb:\+o\.forfaitCreationNb\|\|0/.test(b));
}

// ---- C. LE CHEMIN RETOUR : devis accepté → commande ----
{
  const b = blocAutour("perso:!!(d.perso||+d.persoMacarons>0), persoMacarons:+d.persoMacarons||0", 4, 12);
  check('C. la quantité logo est restituée à la commande', /persoLogoNb:\+d\.persoLogoNb\|\|0/.test(b));
  check('C. les créations graphiques aussi', /forfaitCreationNb:\+d\.forfaitCreationNb\|\|0/.test(b));
  check('C. le drapeau aussi (sinon le bloc serait replié à la réouverture)',
    /logo:!!\(d\.logo\|\|\+d\.persoLogoNb>0\|\|\+d\.forfaitCreationNb>0\)/.test(b));
}

// ---- D. RÉCONCILIATION : l'aller-retour complet conserve le montant ----
{
  const grille = { logoPaliers:[{jusqua:99,prix:1.00},{jusqua:300,prix:0.80},{jusqua:Infinity,prix:0.70}], forfaitCreation:40 };
  const M = new Function('_grilleOption','money2', `
    ${extractFunction('logoPrixUnitPour')}
    ${extractFunction('logoMontantPour')}
    ${extractFunction('forfaitCreationPour')}
    return { logoMontantPour, forfaitCreationPour };
  `)(()=>grille, n=>Math.round(n*100)/100);

  // Commande d'origine.
  const cmd = { logo:true, persoLogoNb:150, forfaitCreationNb:1 };
  const attendu = M.logoMontantPour(cmd.persoLogoNb) + M.forfaitCreationPour(cmd.forfaitCreationNb);
  check('D. la commande vaut 120 € de logo + 40 € de création = 160 €', attendu === 160);

  // Ce que le devis fige désormais (les mêmes règles de copie que le code).
  const devis = {
    logo: !!(cmd.logo || +cmd.persoLogoNb>0 || +cmd.forfaitCreationNb>0),
    persoLogoNb: +cmd.persoLogoNb||0,
    forfaitCreationNb: +cmd.forfaitCreationNb||0
  };
  const surDevis = M.logoMontantPour(devis.persoLogoNb) + M.forfaitCreationPour(devis.forfaitCreationNb);
  check('D. le devis porte le MÊME montant que la commande', surDevis === attendu);

  // Puis retour en commande.
  const retour = {
    logo: !!(devis.logo || +devis.persoLogoNb>0 || +devis.forfaitCreationNb>0),
    persoLogoNb: +devis.persoLogoNb||0,
    forfaitCreationNb: +devis.forfaitCreationNb||0
  };
  const apresRetour = M.logoMontantPour(retour.persoLogoNb) + M.forfaitCreationPour(retour.forfaitCreationNb);
  check('D. RÉCONCILIATION : après aller-retour, le montant est INCHANGÉ', apresRetour === attendu);
  check('D. le drapeau survit à l\'aller-retour (le bloc reste ouvert)', retour.logo === true);

  // Une commande sans logo ne fabrique pas de supplément fantôme.
  const vide = { persoLogoNb:0, forfaitCreationNb:0 };
  const dVide = { logo: !!(vide.logo || +vide.persoLogoNb>0 || +vide.forfaitCreationNb>0) };
  check('D. sans logo, le devis n\'active pas l\'option', dVide.logo === false);
  check('D. …et le montant reste nul', M.logoMontantPour(0) + M.forfaitCreationPour(0) === 0);
}

// ---- E. La facture multi-commandes : rien à corriger, et c'est vérifié ----
// Elle mémorise son HTML complet (`html:factureHtml`), donc la ligne logo y est déjà figée dans le
// rendu. L'ajouter en champ n'aurait servi à rien — vérifié plutôt que supposé.
{
  const i = APP.indexOf('const docFact = {');
  const debut = APP.lastIndexOf('async function', i);
  check('E. la facture multi-commandes rend bien la ligne logo', /factLogoLignes/.test(APP.slice(debut, i)));
  check('E. …et mémorise son HTML complet', /html:factureHtml/.test(APP.slice(i, i + 600)));
}

// ---- F. GARDE DE MOTIF : tout constructeur copiant les couleurs doit copier le logo ----
// ⚠️ Repérage SUR LE FICHIER RÉEL, sans retirer les commentaires : les retirer décale les numéros
//    de ligne et produit des faux positifs (constaté — la garde pointait un `await` sans rapport).
//    C'est cette garde qui a trouvé LE constructeur du geste de Ben, que mon inspection avait raté.
{
  const lignes = APP.split('\n');
  const manques = [];
  [...APP.matchAll(/persoMacarons:\+[od]\.persoMacarons\|\|0/g)].forEach(m => {
    const ln = APP.slice(0, m.index).split('\n').length;
    const fenetre = lignes.slice(ln - 1, ln + 12).join('\n');
    if(!/persoLogoNb:/.test(fenetre)) manques.push(ln);
  });
  check(`F. aucun constructeur ne copie les couleurs sans le logo (${manques.join(', ') || 'aucun'})`,
    manques.length === 0);
  check('F. les 3 constructeurs concernés sont bien trouvés',
    [...APP.matchAll(/persoMacarons:\+[od]\.persoMacarons\|\|0/g)].length === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
