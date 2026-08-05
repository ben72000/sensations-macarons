'use strict';
// v1456 — RÉIMPRIMER L'ÉTIQUETTE APRÈS UNE FUSION. Ben : « en cas de fusion de boîte je dois
// pouvoir réimprimer une étiquette mise à jour ».
//
// POURQUOI LA FUSION EST LE CAS PARTICULIER : sur un prélèvement, Ben corrige la quantité au
// stylo (décision « étiquette recyclée », v1454). Après une fusion il n'y a rien à corriger à la
// main — la boîte gardée contient d'autres pièces qu'annoncé, sa DLC a pu raccourcir, et
// l'étiquette de la boîte absorbée n'a plus d'objet. D'où une proposition AU MOMENT où elle
// devient nécessaire.
//
// CE QUI NE CHANGE PAS : le NUMÉRO DE LOT. Le QR encode `traceUrl(lotProduction)` ; le faire
// varier rendrait mortes toutes les étiquettes déjà imprimées (décision v1454). On réimprime le
// même numéro avec la bonne quantité — ce n'est pas une nouvelle identité.
const { extractFunction, extractConstLine, APP } = require('./_extract');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond){ if(cond){ pass++; } else { fail++; failures.push(label); } }

// ---- A. La proposition s'affiche avec les bons chiffres ----
async function testProposition(){
  const src = extractFunction('proposerReimpressionEtiquette');
  const build = (prod) => {
    let html = null, vueRouverte = null;
    const db = { productions: { get: async id => (prod && +prod.id===+id) ? Object.assign({},prod) : null } };
    const fn = new Function('db','round3','qty','esc','fmtDate','prodDlcEffective','openModal','vueBoitesDuLot', `
      ${src}
      return proposerReimpressionEtiquette;
    `)(db, n=>Math.round(n*1000)/1000, n=>String(n), s=>s, d=>'['+d+']',
       p=>p.dlcProduit, h=>{ html=h; }, id=>{ vueRouverte=id; });
    return { fn, html:()=>html, vue:()=>vueRouverte };
  };

  {
    const boite = { id:42, lotProduction:'160626-FRA-AS-B1', qteRestante:47, dlcProduit:'2026-08-09' };
    const { fn, html } = build(boite);
    await fn(42, 7, 'fusion');
    const h = html();
    check('A. la proposition s\'ouvre', !!h);
    check('A. elle nomme la boîte concernée', /160626-FRA-AS-B1/.test(h));
    check('A. elle annonce la quantité RÉELLE après fusion (47)', /47/.test(h));
    check('A. elle annonce la DLC à imprimer', /2026-08-09/.test(h));
    check('A. le texte de fusion explique pourquoi (contenu des deux)', /contenu des deux/.test(h));
    check('A. elle dit explicitement que le numéro de lot ne change PAS',
      /numéro de lot et son QR ne changent pas/.test(h));
    check('A. le bouton Réimprimer passe par le chemin d\'impression existant', /shareLabelImage\(42\)/.test(h));
    check('A. « Plus tard » ramène à la vue des boîtes (on ne perd pas son écran)', /vueBoitesDuLot\(7\)/.test(h));
  }

  // Sans retour fourni (fusion lancée d'ailleurs) : pas de vueBoitesDuLot() vide dans l'onclick.
  {
    const { fn, html } = build({ id:9, lotProduction:'L-B1', qteRestante:10 });
    await fn(9, null, 'fusion');
    check('A. sans écran de retour : « Plus tard » ferme simplement, sans appel bancal',
      !/vueBoitesDuLot\(\)/.test(html()) && !/vueBoitesDuLot\(null\)/.test(html()));
  }

  // DLC absente : pas de ligne DLC vide.
  {
    const { fn, html } = build({ id:11, lotProduction:'L-B2', qteRestante:5, dlcProduit:null });
    await fn(11, null, 'fusion');
    check('A. pas de ligne DLC quand il n\'y en a pas', !/DLC à imprimer/.test(html()));
  }

  // Boîte introuvable : on ne bloque pas Ben sur un écran mort, on le ramène à sa vue.
  {
    const { fn, html, vue } = build(null);
    await fn(999, 7, 'fusion');
    check('A. boîte introuvable : aucune proposition affichée', html() === null);
    check('A. boîte introuvable : retour à la vue des boîtes malgré tout', vue() === 7);
  }
}

// ---- B. Câblage : la fusion propose, et le bouton permanent existe ----
{
  const srcFus = extractFunction('fusionnerBoites');
  check('B. fusionnerBoites propose la réimpression de la boîte GARDÉE',
    /proposerReimpressionEtiquette\(idA, retourId, 'fusion'\)/.test(srcFus));
  check('B. la proposition remplace le retour direct (un seul écran à la fois)',
    !/if\(retourId!=null && typeof vueBoitesDuLot === 'function'\) vueBoitesDuLot\(\+retourId\);/.test(srcFus));
  check('B. la fusion reste attendue avant de rendre la main', /await proposerReimpressionEtiquette/.test(srcFus));

  const i = APP.indexOf('const peutFusionner');
  const srcVue = APP.slice(i, i+2100);
  check('B. bouton 🖨 Étiquette permanent sur chaque boîte (réimpression accessible à tout moment)',
    /shareLabelImage\(\$\{x\.id\}\)/.test(srcVue));
}

// ---- C. Non-régression : le numéro de lot n'est PAS régénéré (décision v1454) ----
{
  const src = extractFunction('proposerReimpressionEtiquette');
  check('C. la proposition n\'écrit RIEN en base (elle propose, elle ne modifie pas)',
    !/db\.productions\.update/.test(src) && !/db\.productions\.add/.test(src));
  check('C. aucun nouveau numéro de lot généré', !/genLotCode/.test(src) && !/lotAvecEmplacement/.test(src));
  // Le QR reste bâti sur le numéro de lot : c'est ce qui rend l'étiquette réimprimable à l'identique.
  const iQR = APP.indexOf("QR.render(tmp, traceUrl(p.lotProduction");
  check('C. le QR reste bâti sur le numéro de lot (étiquette recyclable)', iQR > 0);
}

testProposition().then(()=>{
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}).catch(e => { console.error('ERREUR SUITE', e); process.exitCode = 1; });
