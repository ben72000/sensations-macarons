'use strict';
/* Persistance simple sur fichier JSON. Suffit pour un petit volume et un seul
   processus. Remplaçable par une vraie base (Redis, SQLite…) sans toucher au
   cœur ni au serveur : seules ces deux fonctions changent.
   Le chemin est configurable par ETAT_PATH (utile en hébergement). */
const fs = require('fs');
const path = require('path');

const CHEMIN = process.env.ETAT_PATH || path.join(__dirname, '..', 'etat.json');

function chargerEtat() {
  try {
    if (!fs.existsSync(CHEMIN)) return null;
    return JSON.parse(fs.readFileSync(CHEMIN, 'utf8'));
  } catch (e) {
    console.error('[sas] lecture état échec', e.message);
    return null;
  }
}

function sauverEtat(etat) {
  // Écriture atomique : fichier temporaire puis renommage, pour ne jamais
  // laisser un etat.json à moitié écrit si le process meurt en plein vol.
  const tmp = CHEMIN + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(etat), 'utf8');
  fs.renameSync(tmp, CHEMIN);
}

module.exports = { chargerEtat, sauverEtat, CHEMIN };
