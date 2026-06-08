/* ============================================================
   pdf_extract.js — MODULE ISOLÉ d'extraction de texte PDF
   ------------------------------------------------------------
   But : lire le texte des PDF GÉNÉRÉS PAR ORDINATEUR (factures,
   bons de commande tapés). Ne gère PAS les PDF scannés (images) :
   dans ce cas il renvoie une chaîne vide → l'appelant bascule
   sur un simple aperçu visuel.

   100% hors-ligne, sans dépendance externe. Décompression des
   flux Flate via l'API native DecompressionStream (Safari iOS 16.4+).

   ISOLATION : tout est sous le namespace window.PDFTextExtractor.
   Pour SUPPRIMER la fonctionnalité dans une version future :
     1) retirer le fichier pdf_extract.js,
     2) retirer son chemin du service-worker (ASSETS),
     3) retirer l'appel à PDFTextExtractor dans app.js (aiAttachFile).
   Aucune autre partie de l'app n'en dépend.
   ============================================================ */
(function(){
  'use strict';

  // Décompresse un flux zlib/deflate via l'API native (asynchrone).
  async function inflateOnce(bytes, fmt){
    const ds=new DecompressionStream(fmt);
    const stream=new Blob([bytes]).stream().pipeThrough(ds);
    const buf=await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function inflate(bytes){
    if(typeof DecompressionStream==='undefined') return null;
    for(const fmt of ['deflate','deflate-raw']){
      try{ return await inflateOnce(bytes, fmt); }
      catch(e){
        // retente en rognant d'éventuels octets de fin parasites (1 à 2)
        for(const cut of [1,2]){
          try{ return await inflateOnce(bytes.subarray(0, bytes.length-cut), fmt); }catch(_){}
        }
      }
    }
    return null;
  }

  // Décode l'ASCII85 (filtre /ASCII85Decode). Renvoie Uint8Array.
  function ascii85Decode(bytes){
    let txt=bytesToLatin1(bytes).replace(/\s+/g,'');
    const endIdx=txt.indexOf('~>'); if(endIdx>=0) txt=txt.slice(0,endIdx);
    if(txt.startsWith('<~')) txt=txt.slice(2);
    const out=[]; let i=0;
    while(i<txt.length){
      if(txt[i]==='z'){ out.push(0,0,0,0); i++; continue; }
      let count=0; const group=[];
      while(count<5 && i<txt.length){
        const c=txt.charCodeAt(i)-33;
        if(c<0||c>84){ i++; continue; }
        group.push(c); count++; i++;
      }
      if(count===0) break;
      const pad=5-count;
      for(let k=count;k<5;k++) group.push(84);
      let val=0; for(let k=0;k<5;k++) val=val*85+group[k];
      const b=[(val>>>24)&255,(val>>>16)&255,(val>>>8)&255,val&255];
      for(let k=0;k<4-pad;k++) out.push(b[k]);
    }
    return new Uint8Array(out);
  }

  // Applique la chaîne de filtres déclarée dans le dict (dans l'ordre).
  // Gère ASCII85Decode, ASCIIHexDecode et FlateDecode. Renvoie une string latin-1 ou null.
  async function applyFilters(dict, bytes){
    const filters=[];
    const fm=dict.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/);
    if(fm){ const re=/\/([A-Za-z0-9]+)/g; let mm; while((mm=re.exec(fm[1]))) filters.push(mm[1]); }
    let data=bytes;
    for(const f of filters){
      if(f==='ASCII85Decode'){ data=ascii85Decode(data); }
      else if(f==='ASCIIHexDecode'){
        let hex=bytesToLatin1(data).replace(/[^0-9A-Fa-f]/g,''); if(hex.length%2) hex+='0';
        const arr=new Uint8Array(hex.length/2); for(let k=0;k<arr.length;k++) arr[k]=parseInt(hex.substr(k*2,2),16); data=arr;
      }
      else if(f==='FlateDecode'){ const inf=await inflate(data); if(!inf) return null; data=inf; }
      else { return null; } // filtre non géré (image, LZW…)
    }
    return bytesToLatin1(data);
  }

  // Latin-1 → string (les PDF non-unicode sont en grande partie latin-1).
  function bytesToLatin1(bytes){
    let s=''; const CH=8192;
    for(let i=0;i<bytes.length;i+=CH){
      s+=String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i+CH, bytes.length)));
    }
    return s;
  }

  // Trouve tous les flux « stream … endstream » et renvoie leurs octets bruts
  // avec le dictionnaire qui précède (pour savoir s'ils sont FlateDecode).
  function findStreams(raw){
    const out=[]; let idx=0;
    while(true){
      const sPos=raw.indexOf('stream', idx);
      if(sPos<0) break;
      // dictionnaire = ce qui précède le mot-clé stream (borné)
      const dictStart=raw.lastIndexOf('<<', sPos);
      const dict = dictStart>=0 ? raw.slice(dictStart, sPos) : '';
      // saute le CRLF/LF après 'stream'
      let p=sPos+6;
      if(raw[p]==='\r') p++;
      if(raw[p]==='\n') p++;
      const ePos=raw.indexOf('endstream', p);
      if(ePos<0){ idx=sPos+6; continue; }
      // PDF : un EOL précède 'endstream' et ne fait pas partie des données → on le retire
      let dataEnd=ePos;
      if(raw[dataEnd-1]==='\n') dataEnd--;
      if(raw[dataEnd-1]==='\r') dataEnd--;
      out.push({dict, start:p, end:dataEnd});
      idx=ePos+9;
    }
    return out;
  }

  // Extrait le texte des opérateurs PDF d'un contenu décompressé (latin-1 string).
  // Gère Tj, TJ, ' et " et les chaînes ( ) avec échappements + \ddd octal.
  function textFromContent(content){
    let out='';
    // 1) chaînes entre parenthèses suivies d'un opérateur de texte
    //    On parcourt et on capture les ( … ) ; on ajoute un espace aux sauts de ligne TJ/Tj.
    const re=/\((?:\\.|[^\\()])*\)|\[(?:[^\][]|\\.)*\]|T[*]|Tj|TJ|'|"/g;
    let m;
    const decodeStr=s=>{
      // s sans les parenthèses externes
      let r=''; 
      for(let i=0;i<s.length;i++){
        const c=s[i];
        if(c==='\\'){
          const n=s[i+1];
          if(n>='0'&&n<='7'){ // octal \ddd
            let oct=n; let k=i+2;
            for(let j=0;j<2 && s[k]>='0'&&s[k]<='7';j++,k++) oct+=s[k];
            r+=String.fromCharCode(parseInt(oct,8)); i=k-1;
          } else {
            const map={'n':'\n','r':'\r','t':'\t','b':'\b','f':'\f','(':'(',')':')','\\':'\\'};
            r+= (n in map)?map[n]:n; i++;
          }
        } else r+=c;
      }
      return r;
    };
    while((m=re.exec(content))){
      const tok=m[0];
      if(tok==='Tj'||tok==="'"||tok==='"'){ /* la chaîne a déjà été captée juste avant */ }
      else if(tok==='T*'){ out+='\n'; }
      else if(tok[0]==='('){ out+=decodeStr(tok.slice(1,-1)); }
      else if(tok[0]==='['){
        // tableau TJ : extraire chaque ( … ) interne
        const inner=tok.slice(1,-1);
        const sre=/\((?:\\.|[^\\()])*\)/g; let sm;
        while((sm=sre.exec(inner))){ out+=decodeStr(sm[0].slice(1,-1)); }
        out+=' ';
      }
    }
    return out;
  }

  // API publique : reçoit un File/Blob PDF, renvoie une Promise<string> (texte) — '' si rien d'exploitable.
  async function extractText(file){
    try{
      const buf=new Uint8Array(await file.arrayBuffer());
      const raw=bytesToLatin1(buf);
      if(raw.indexOf('%PDF')!==0 && raw.indexOf('%PDF')<0) return ''; // pas un PDF
      const streams=findStreams(raw);
      let text='';
      for(const st of streams){
        const slice=buf.subarray(st.start, st.end);
        let contentStr=null;
        if(/\/Filter/.test(st.dict)){
          contentStr=await applyFilters(st.dict, slice);
        } else {
          // flux non compressé : on tente tel quel
          contentStr=bytesToLatin1(slice);
        }
        if(contentStr && /\b(Tj|TJ)\b/.test(contentStr)){
          text += textFromContent(contentStr) + '\n';
        }
      }
      // nettoyage léger : compresse les espaces/sauts de ligne multiples
      text = text.replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
      return text;
    }catch(e){
      return '';
    }
  }

  window.PDFTextExtractor = { extractText };
})();
