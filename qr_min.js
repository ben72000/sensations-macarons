/* ============================================================
   qr.min.js — générateur de QR code autonome (offline)
   Mode octet (UTF-8), niveau de correction M.
   API : QR.render(canvas, text)  ->  dessine le QR sur le canvas
   Fondé sur l'algorithme QR Model 2 (ISO/IEC 18004).
   ============================================================ */
(function (global) {
  'use strict';

  // ---- Galois field (GF 256) pour Reed-Solomon ----
  const EXP = new Array(256), LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    EXP[255] = EXP[0];
  })();
  const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[(LOG[a] + LOG[b]) % 255];

  function rsGenPoly(n) {
    let poly = [1];
    for (let i = 0; i < n; i++) {
      const np = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        np[j] ^= poly[j];
        np[j + 1] ^= gmul(poly[j], EXP[i]);
      }
      poly = np;
    }
    return poly;
  }
  function rsEncode(data, ecLen) {
    const gen = rsGenPoly(ecLen);            // longueur ecLen+1, terme de tête = 1
    const res = data.concat(new Array(ecLen).fill(0));
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], coef);
    }
    return res.slice(data.length);           // remainder = ecLen octets
  }

  // ---- Tables de capacité (version -> [ecPerBlock, group1Blocks, dataPerBlockG1, group2Blocks, dataPerBlockG2]) niveau M ----
  // On supporte les versions 1 à 10 (largement suffisant pour une URL courte).
  const CAP_M = {
    1:[10,1,16,0,0], 2:[16,1,28,0,0], 3:[26,1,44,0,0], 4:[18,2,32,0,0],
    5:[24,2,43,0,0], 6:[16,4,27,0,0], 7:[18,4,31,0,0], 8:[22,2,38,2,39],
    9:[22,3,36,2,37], 10:[26,4,43,1,44]
  };
  const ALIGN = {
    1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],
    7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]
  };

  function utf8Bytes(str) {
    const out = [];
    for (const ch of unescape(encodeURIComponent(str))) out.push(ch.charCodeAt(0));
    return out;
  }

  function chooseVersion(len) {
    for (let v = 1; v <= 10; v++) {
      const [ec, g1, d1, g2, d2] = CAP_M[v];
      const totalData = g1 * d1 + g2 * d2;
      // header : mode (4 bits) + count (8 ou 16 bits) + terminator
      const countBits = v < 10 ? 8 : 16;
      const need = Math.ceil((4 + countBits + len * 8) / 8);
      if (need <= totalData) return v;
    }
    throw new Error('Texte trop long pour QR v1-10');
  }

  function buildBitstream(bytes, version) {
    const [ec, g1, d1, g2, d2] = CAP_M[version];
    const totalData = g1 * d1 + g2 * d2;
    const countBits = version < 10 ? 8 : 16;
    let bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(0b0100, 4);            // mode octet
    push(bytes.length, countBits);
    for (const b of bytes) push(b, 8);
    // terminator
    const cap = totalData * 8;
    for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    // padding
    const pads = [0xEC, 0x11]; let pi = 0;
    while (bits.length < cap) { push(pads[pi % 2], 8); pi++; }
    // octets
    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      dataCodewords.push(b);
    }
    // découpage en blocs
    const blocks = [];
    let idx = 0;
    for (let i = 0; i < g1; i++) { blocks.push(dataCodewords.slice(idx, idx + d1)); idx += d1; }
    for (let i = 0; i < g2; i++) { blocks.push(dataCodewords.slice(idx, idx + d2)); idx += d2; }
    const ecBlocks = blocks.map(b => rsEncode(b, ec));
    // entrelacement données
    const maxD = Math.max(d1, d2 || 0);
    const finalData = [];
    for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.length) finalData.push(b[i]);
    for (let i = 0; i < ec; i++) for (const b of ecBlocks) finalData.push(b[i]);
    return finalData;
  }

  // ---- Matrice ----
  function buildMatrix(version, codewords) {
    const size = version * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(null));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

    function placeFinder(r, c) {
      for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
        const rr = r + i, cc = c + j;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
                   (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
                   (i >= 2 && i <= 4 && j >= 2 && j <= 4);
        m[rr][cc] = on ? 1 : 0; reserved[rr][cc] = true;
      }
    }
    placeFinder(0, 0); placeFinder(0, size - 7); placeFinder(size - 7, 0);

    // séparateurs déjà gérés par le -1..7 ci-dessus (mis à 0)
    // timing
    for (let i = 8; i < size - 8; i++) {
      const v = i % 2 === 0 ? 1 : 0;
      if (m[6][i] === null) { m[6][i] = v; reserved[6][i] = true; }
      if (m[i][6] === null) { m[i][6] = v; reserved[i][6] = true; }
    }
    // alignment
    const ap = ALIGN[version];
    for (const r of ap) for (const c of ap) {
      if ((r <= 7 && c <= 7) || (r <= 7 && c >= size - 8) || (r >= size - 8 && c <= 7)) continue;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const on = Math.max(Math.abs(i), Math.abs(j)) !== 1;
        m[r + i][c + j] = on ? 1 : 0; reserved[r + i][c + j] = true;
      }
    }
    // dark module
    m[size - 8][8] = 1; reserved[size - 8][8] = true;
    // réserver zones format
    for (let i = 0; i < 9; i++) { if (i !== 6) { reserved[8][i] = true; reserved[i][8] = true; } }
    for (let i = 0; i < 8; i++) { reserved[8][size - 1 - i] = true; reserved[size - 1 - i][8] = true; }

    // placement données en zig-zag
    let bitIdx = 0;
    const bitAt = () => {
      const byte = codewords[bitIdx >> 3];
      const bit = (byte >> (7 - (bitIdx & 7))) & 1;
      bitIdx++; return bit;
    };
    let upward = true;
    for (let right = size - 1; right > 0; right -= 2) {
      let col = right;
      if (col <= 6) col--; // la colonne 6 est la timing column : tout décaler
      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;
        for (let c = 0; c < 2; c++) {
          const cc = col - c;
          if (reserved[row][cc]) continue;
          let v = (bitIdx < codewords.length * 8) ? bitAt() : 0;
          m[row][cc] = v;
        }
      }
      upward = !upward;
    }
    return { m, reserved, size };
  }

  function applyMask(m, reserved, size, maskId) {
    const out = m.map(r => r.slice());
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      let mask = false;
      switch (maskId) {
        case 0: mask = (r + c) % 2 === 0; break;
        case 1: mask = r % 2 === 0; break;
        case 2: mask = c % 3 === 0; break;
        case 3: mask = (r + c) % 3 === 0; break;
        case 4: mask = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
        case 5: mask = ((r * c) % 2) + ((r * c) % 3) === 0; break;
        case 6: mask = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
        case 7: mask = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
      }
      if (mask) out[r][c] ^= 1;
    }
    return out;
  }

  // format info (niveau M = 0b00) + masque, BCH(15,5) + masque XOR
  function formatBits(maskId) {
    const data = (0b00 << 3) | maskId; // EC level M = 00, 5 bits
    let rem = data << 10;
    const g = 0b10100110111;
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= g << (i - 10);
    const bits = ((data << 10) | rem) ^ 0b101010000010010;
    return bits & 0x7fff;
  }
  function placeFormat(m, size, maskId) {
    const fmt = formatBits(maskId);
    const get = i => (fmt >> i) & 1; // i=0 = LSB
    // Copie 1 : autour du finder haut-gauche
    // bits 0..5 -> colonne 8, lignes 0..5
    for (let i = 0; i <= 5; i++) m[i][8] = get(i);
    m[7][8] = get(6);
    m[8][8] = get(7);
    m[8][7] = get(8);
    // bits 9..14 -> ligne 8, colonnes 5..0
    for (let i = 9; i <= 14; i++) m[8][14 - i] = get(i);
    // Copie 2 : sous le finder haut-droite + à droite du finder bas-gauche
    // bits 0..7 -> ligne 8, colonnes (size-1) .. (size-8)
    for (let i = 0; i <= 7; i++) m[8][size - 1 - i] = get(i);
    // bits 8..14 -> colonne 8, lignes (size-7) .. (size-1)
    for (let i = 8; i <= 14; i++) m[size - 15 + i][8] = get(i);
    m[size - 8][8] = 1; // dark module garanti
  }

  function penalty(m, size) {
    let p = 0;
    // règle 1 : runs >=5
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
        else run = 1;
      }
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
        else run = 1;
      }
    }
    return p;
  }

  function generate(text) {
    const bytes = utf8Bytes(text);
    const version = chooseVersion(bytes.length);
    const codewords = buildBitstream(bytes, version);
    const { m, reserved, size } = buildMatrix(version, codewords);
    // choix du masque (minimise la pénalité, version simplifiée)
    let best = null, bestP = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const masked = applyMask(m, reserved, size, mask);
      placeFormat(masked, size, mask);
      const p = penalty(masked, size);
      if (p < bestP) { bestP = p; best = masked; }
    }
    return { matrix: best, size };
  }

  const QR = {
    generate,
    render(canvas, text, opt) {
      opt = opt || {};
      const { matrix, size } = generate(text);
      const quiet = 4;
      const total = size + quiet * 2;
      const scale = opt.scale || 4;
      canvas.width = total * scale;
      canvas.height = total * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = opt.light || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = opt.dark || '#52252F';
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        if (matrix[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
  };

  global.QR = QR;
})(typeof self !== 'undefined' ? self : this);
