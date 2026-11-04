/* ================= Localizador de trechos de rua =================
   Usa a base de ruas (RUAS) para achar a rua do lançamento e o trecho
   entre as duas ruas do perímetro ("de" / "até").                      */
const LOC = (()=>{
  const tira = s => String(s??"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase();
  const PREF = /^(RUA|R|AVENIDA|AV|TRAVESSA|TV|TRAV|TR|PASSAGEM|PSG|PAS|PASS|PS|ALAMEDA|AL|VILA|VL|ESTRADA|EST|RODOVIA|ROD|PRACA|PC|PCA|VIELA|BECO|CONJUNTO|CONJ|CJ|LARGO|LG|AREA|LOTEAMENTO)\b\.?\s*/;
  const SUBS = [
    [/\b(DE|DA|DO|DAS|DOS|E)\b/g," "],[/\b(DOUTOR|DR)\b/g,"DR"],[/\b(PROFESSORA?|PROF)\b/g,"PROF"],[/\b(SENADOR|SEN)\b/g,"SEN"],
    [/\b(GENERAL|GAL|GEN)\b/g,"GEN"],[/\b(PADRE|PE)\b/g,"PE"],[/\b(SANTO|STO)\b/g,"STO"],[/\b(SANTA|STA)\b/g,"STA"],[/\b(SAO|S)\b/g,"SAO"],
    [/\b(NOSSA SENHORA|N SRA|NSRA|N S)\b/g,"NSRA"],[/\b(PRESIDENTE|PRES)\b/g,"PRES"],[/\b(MARECHAL|MAL)\b/g,"MAL"],[/\b(CORONEL|CEL)\b/g,"CEL"],
    [/\b(CAPITAO|CAP)\b/g,"CAP"],[/\b(ALMIRANTE|ALM)\b/g,"ALM"],[/\b(GOVERNADOR|GOV)\b/g,"GOV"],[/\b(DEPUTADO|DEP)\b/g,"DEP"],
    [/\b(ENGENHEIRO|ENG)\b/g,"ENG"],[/\b(DESEMBARGADOR|DES)\b/g,"DES"],[/\b(BRIGADEIRO|BRIG)\b/g,"BRIG"],[/\b(MONSENHOR|MONS)\b/g,"MONS"],[/\b(MARQUES|MARQ)\b/g,"MARQ"]
  ];
  const ROM = {"1":"I","2":"II","3":"III","4":"IV","5":"V","6":"VI","7":"VII","8":"VIII","9":"IX","10":"X"};
  function limpa(s){
    s = tira(s).replace(/\(.*?\)/g," ").replace(/\s-\s.*$/," ").replace(/-(CANTEIRO|CANAL|ORLA).*$/," ").replace(/CANTEIRO CENTRAL/g," ");
    s = s.replace(/[.,\-()"']/g," ").replace(/\s+/g," ").trim();
    for(let i=0;i<2;i++) s = s.replace(PREF,"").trim();
    for(const [r,t] of SUBS) s = s.replace(r,t);
    return s.replace(/\s+/g," ").trim();
  }
  function chave(s){
    s = limpa(s).split(" ").map(t=>ROM[t]||t).join(" ");
    s = s.replace(/PH/g,"F").replace(/Y/g,"I").replace(/W/g,"V").replace(/Z/g,"S").replace(/CH/g,"X").replace(/(.)\1+/g,"$1").replace(/\bH/g,"");
    return s.trim();
  }
  function lev(a,b){
    if(a===b) return 0; const m=a.length,n=b.length; if(!m) return n; if(!n) return m;
    let p=Array.from({length:n+1},(_,j)=>j), c=new Array(n+1);
    for(let i=1;i<=m;i++){ c[0]=i; for(let j=1;j<=n;j++){ c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1)); } [p,c]=[c,p]; }
    return p[n];
  }
  const ordena = s => s.split(" ").sort().join(" ");

  // ---- decodifica a base
  let NOMES=[], SEGS=[], PORCHAVE=new Map(), CHAVES=[];
  function iniciar(R){
    NOMES = R.n;
    SEGS = R.s.map(a=>{ const i=a[0]; let y=a[1],x=a[2]; const pts=[[y/1e5,x/1e5]];
      for(let k=3;k<a.length;k+=2){ y+=a[k]; x+=a[k+1]; pts.push([y/1e5,x/1e5]); } return {nome:i,pts}; });
    const porNome = new Map();
    SEGS.forEach((s,idx)=>{ if(!porNome.has(s.nome)) porNome.set(s.nome,[]); porNome.get(s.nome).push(idx); });
    porNome.forEach((lista,i)=>{ const k=chave(NOMES[i]); if(!PORCHAVE.has(k)) PORCHAVE.set(k,[]); PORCHAVE.get(k).push(...lista); });
    CHAVES = [...PORCHAVE.keys()].map(k=>({k, o:ordena(k), t:new Set(k.split(" "))}));
    NOMECHAVE = NOMES.map(n=>chave(n));
    // grade espacial (≈ 220 m)
    SEGS.forEach((s,idx)=>{ const vis=new Set(); s.pts.forEach(p=>{ const c=cel(p); if(!vis.has(c)){ vis.add(c); if(!GRADE.has(c)) GRADE.set(c,[]); GRADE.get(c).push(idx);} }); });
  }
  let NOMECHAVE=[]; const GRADE=new Map();
  const cel = p => Math.floor(p[0]/0.002)+":"+Math.floor(p[1]/0.002);
  function vizinhos(pontos){ const out=new Set(); pontos.forEach(p=>{ const a=Math.floor(p[0]/0.002), b=Math.floor(p[1]/0.002);
    for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++){ const l=GRADE.get((a+i)+":"+(b+j)); if(l) l.forEach(x=>out.add(x)); } }); return out; }
  function similar(q, k){ // 0..1
    if(q===k) return 1;
    const tq=q.split(" ").filter(Boolean), tk=k.split(" ");
    const igual=(a,b)=> a===b || (a.length>=5 && b.length>=5 && lev(a,b)<=1);
    const comuns=tq.filter(x=>tk.some(y=>igual(x,y))).length;
    const cont = comuns/tq.length;                    // quanto do nome digitado aparece na base
    const lv = 1 - lev(ordena(q),ordena(k))/Math.max(q.length,k.length);
    return Math.max(lv, cont*0.95);
  }
  const cache = new Map();
  function acharRua(nome){
    const k = chave(nome); if(!k) return null;
    if(cache.has(k)) return cache.get(k);
    let r = PORCHAVE.has(k) ? {segs:PORCHAVE.get(k), k, conf:"exata"} : null;
    if(!r){
      const o = ordena(k); let best=null, bd=1e9;
      for(const c of CHAVES){ if(Math.abs(c.o.length-o.length)>4) continue; const d=lev(o,c.o); if(d<bd){bd=d;best=c;} }
      if(best && bd/Math.max(o.length,best.o.length) <= 0.12) r={segs:PORCHAVE.get(best.k), k:best.k, conf:"aproximada"};
    }
    if(!r){ // todas as palavras digitadas aparecem no nome da base (ex.: JOAQUIM TAVORA -> MAJOR JOAQUIM TAVORA)
      const tq=k.split(" "); if(tq.length>=2 || k.length>=7){
        const cands=CHAVES.filter(c=>tq.every(x=>c.t.has(x)));
        if(cands.length){ const segs=[].concat(...cands.map(c=>PORCHAVE.get(c.k))); r={segs, k:cands[0].k, conf:"aproximada"}; }
      }
    }
    cache.set(k,r); return r;
  }

  // ---- geometria (metros aproximados)
  const KY=110574, KX=111320*Math.cos(-1.4*Math.PI/180);
  const dist = (a,b)=>Math.hypot((a[0]-b[0])*KY,(a[1]-b[1])*KX);
  function distPtSeg(p,a,b){
    const ax=a[1]*KX, ay=a[0]*KY, bx=b[1]*KX, by=b[0]*KY, px=p[1]*KX, py=p[0]*KY;
    const dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy; let t=L?((px-ax)*dx+(py-ay)*dy)/L:0; t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-ax-t*dx, py-ay-t*dy);
  }
  const compr = pts => pts.reduce((s,p,i)=>i?s+dist(pts[i-1],p):0,0);
  const kn = p => Math.round(p[0]*1e5)+","+Math.round(p[1]*1e5);

  function pontoNoPoligono(pt, polys){ // polys: [[anel,...],...] em [lat,lng]
    const [y,x]=pt; let dentro=false;
    for(const poly of polys){ let d=false;
      poly.forEach((anel,ai)=>{ for(let i=0,j=anel.length-1;i<anel.length;j=i++){ const [yi,xi]=anel[i],[yj,xj]=anel[j];
        if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) d=!d; } });
      if(d) dentro=true; }
    return dentro;
  }

  // ponto onde a rua transversal encontra a rua principal -> nó do grafo mais próximo
  function cruzamento(nos, segsCruz, segsMain){
    let y0=1e9,y1=-1e9,x0=1e9,x1=-1e9;
    segsCruz.forEach(si=>SEGS[si].pts.forEach(p=>{ y0=Math.min(y0,p[0]);y1=Math.max(y1,p[0]);x0=Math.min(x0,p[1]);x1=Math.max(x1,p[1]); }));
    const m=0.0006; y0-=m;y1+=m;x0-=m;x1+=m;
    const dentro = p => p[0]>=y0&&p[0]<=y1&&p[1]>=x0&&p[1]<=x1;
    let bd=1e9, bp=null;
    for(const sm of segsMain){ const pm=SEGS[sm].pts; if(!pm.some(dentro)) continue;
      for(const sc of segsCruz){ const pc=SEGS[sc].pts;
        for(const p of pm){ if(!dentro(p)) continue; for(let i=1;i<pc.length;i++){ const d=distPtSeg(p,pc[i-1],pc[i]); if(d<bd){bd=d;bp=p;} } }
        for(const p of pc){ for(let i=1;i<pm.length;i++){ const d=distPtSeg(p,pm[i-1],pm[i]); if(d<bd){bd=d;bp=p;} } }
      } }
    if(!bp || bd>45) return null;
    let bn=null, bnd=1e9; for(const [k,p] of nos){ const d=dist(p,bp); if(d<bnd){bnd=d;bn=k;} }
    return {no:bn, d:bd};
  }

  function localizar(reg, areaPolys){
    // 1ª tentativa: só a parte da rua dentro da área informada; se o perímetro não fechar, tenta a rua inteira
    const r1 = localizar1(reg, areaPolys);
    if(r1.tipo==="trecho" || !reg.area || !r1.ok) return r1.ok||!reg.area ? r1 : localizar1({...reg, area:null}, areaPolys);
    const r2 = localizar1({...reg, area:null}, areaPolys);
    return (r2.ok && r2.tipo==="trecho") ? r2 : r1;
  }
  function localizar1(reg, areaPolys){
    // reg: {rua, de, ate, area}
    const out = {ok:false, motivo:"", linhas:[], conf:""};
    const R = acharRua(reg.rua);
    if(!R){ out.motivo="rua não encontrada na base"; return out; }
    out.conf = R.conf; out.ruaBase = NOMES[SEGS[R.segs[0]].nome];
    let segs = R.segs;
    // se a área foi informada, prioriza os segmentos dentro/perto dela
    if(reg.area && areaPolys && areaPolys[reg.area]){
      const dentro = segs.filter(si=>{ const p=SEGS[si].pts; return pontoNoPoligono(p[Math.floor(p.length/2)], areaPolys[reg.area]); });
      if(dentro.length) segs = dentro;
    }
    // grafo
    const nos=new Map(), adj=new Map();
    const add=(k,v)=>{ if(!adj.has(k)) adj.set(k,[]); adj.get(k).push(v); };
    segs.forEach(si=>{ const p=SEGS[si].pts; const a=kn(p[0]), b=kn(p[p.length-1]); nos.set(a,p[0]); nos.set(b,p[p.length-1]);
      const L=compr(p); add(a,{to:b,si,L}); add(b,{to:a,si,L}); });
    const pertoDaRua = vizinhos([].concat(...segs.map(si=>SEGS[si].pts)));
    const proprios = new Set(segs);
    function transversal(nome){
      if(!nome) return null;
      const q = chave(nome); if(!q) return null;
      // ruas próximas cujo nome se parece com o digitado
      const porNome = new Map();
      pertoDaRua.forEach(si=>{ if(proprios.has(si)) return; const n=SEGS[si].nome; if(!porNome.has(n)) porNome.set(n,[]); porNome.get(n).push(si); });
      const cands=[];
      porNome.forEach((lst,n)=>{ const s=similar(q, NOMECHAVE[n]); if(s>=0.6) cands.push([s,lst]); });
      cands.sort((a,b)=>b[0]-a[0]);
      for(const [s,lst] of cands.slice(0,4)){ const c=cruzamento(nos,lst,segs); if(c) return c; }
      const X = acharRua(nome); return X ? cruzamento(nos, X.segs.filter(si=>pertoDaRua.has(si)), segs) : null;
    }
    const ca = transversal(reg.de), cb = transversal(reg.ate);
    if(ca && cb && ca.no!==cb.no){
      // Dijkstra
      const D=new Map([[ca.no,0]]), prev=new Map(), feito=new Set(); const fila=[[0,ca.no]];
      while(fila.length){ fila.sort((x,y)=>x[0]-y[0]); const [d,u]=fila.shift(); if(feito.has(u)) continue; feito.add(u); if(u===cb.no) break;
        for(const e of adj.get(u)||[]){ const nd=d+e.L; if(nd<(D.get(e.to)??1e18)){ D.set(e.to,nd); prev.set(e.to,{u,si:e.si}); fila.push([nd,e.to]); } } }
      if(D.has(cb.no) && D.get(cb.no) < 15000){
        let v=cb.no; const lst=[]; while(v!==ca.no){ const p=prev.get(v); lst.push(p.si); v=p.u; }
        out.ids=lst; out.linhas = lst.map(si=>SEGS[si].pts); out.ok=true; out.tipo="trecho"; out.metros=D.get(cb.no); return out;
      }
    }
    // só um cruzamento encontrado e extensão informada: pega a extensão a partir dele
    const c1 = ca||cb;
    if(c1 && reg.m>0){
      const lim = reg.m, D=new Map([[c1.no,0]]), feito=new Set(), fila=[[0,c1.no]], usados=new Set();
      while(fila.length){ fila.sort((x,y)=>x[0]-y[0]); const [d,u]=fila.shift(); if(feito.has(u)) continue; feito.add(u);
        for(const e of adj.get(u)||[]){ if(d>=lim) continue; usados.add(e.si); const nd=d+e.L; if(nd<(D.get(e.to)??1e18)){ D.set(e.to,nd); fila.push([nd,e.to]); } } }
      if(usados.size){ out.ids=[...usados]; out.linhas=out.ids.map(si=>SEGS[si].pts); out.ok=true; out.tipo="aprox"; out.metros=out.linhas.reduce((s,p)=>s+compr(p),0);
        out.motivo="só uma das ruas do perímetro foi encontrada; trecho aproximado pela extensão"; return out; }
    }
    // sem perímetro identificável: usa a rua dentro da área (ou a parte conectada mais próxima de um cruzamento)
    let usar = segs;
    if(c1){ // componente conectado que contém o cruzamento encontrado
      const vis=new Set([c1.no]), pilha=[c1.no], ss=new Set();
      while(pilha.length){ const u=pilha.pop(); for(const e of adj.get(u)||[]){ ss.add(e.si); if(!vis.has(e.to)){ vis.add(e.to); pilha.push(e.to);} } }
      usar=[...ss];
    } else {
      // ruas com o mesmo nome em lugares diferentes da cidade: escolhe um só trecho contínuo
      // (o que está na área informada ou na área do supervisor; senão, o maior)
      const grupos = agruparTrechos(usar, adj);
      if(grupos.length>1){
        const pref = [reg.area, reg.areaSup].filter(Boolean);
        const dentro = (g,a) => areaPolys && areaPolys[a] ? g.segs.reduce((s,si)=>{ const p=SEGS[si].pts; return s + (pontoNoPoligono(p[Math.floor(p.length/2)], areaPolys[a]) ? compr(p) : 0); },0) : 0;
        let esc=null;
        for(const a of pref){ const best=grupos.map(g=>[dentro(g,a),g]).sort((x,y)=>y[0]-x[0])[0]; if(best && best[0]>0){ esc=best[1]; break; } }
        if(!esc) esc = grupos.sort((x,y)=>y.L-x.L)[0];
        usar = esc.segs;
      }
    }
    out.ids=usar; out.linhas = usar.map(si=>SEGS[si].pts); out.ok=true; out.tipo="rua"; out.metros=out.linhas.reduce((s,p)=>s+compr(p),0);
    out.motivo = (reg.de||reg.ate) ? "perímetro não identificado; mostrando a rua inteira" : "sem perímetro; mostrando a rua inteira";
    return out;
  }

  // separa os segmentos em grupos contínuos (junta pedaços a menos de 60 m um do outro)
  function agruparTrechos(segs, adj){
    const comp=[], visto=new Set();
    segs.forEach(si=>{ if(visto.has(si)) return; const p=SEGS[si].pts; const pilha=[kn(p[0])], vis=new Set(pilha), ss=new Set();
      while(pilha.length){ const u=pilha.pop(); for(const e of adj.get(u)||[]){ ss.add(e.si); if(!vis.has(e.to)){ vis.add(e.to); pilha.push(e.to);} } }
      ss.forEach(x=>visto.add(x)); comp.push({segs:[...ss]}); });
    comp.forEach(c=>{ c.pts=[].concat(...c.segs.map(si=>{ const p=SEGS[si].pts; return [p[0],p[p.length-1]]; })); c.L=c.segs.reduce((s,si)=>s+compr(SEGS[si].pts),0); });
    // une grupos próximos
    const pai=comp.map((_,i)=>i); const raiz=i=>pai[i]===i?i:(pai[i]=raiz(pai[i]));
    for(let i=0;i<comp.length;i++) for(let j=i+1;j<comp.length;j++){
      if(raiz(i)===raiz(j)) continue;
      let perto=false; for(const a of comp[i].pts){ for(const b of comp[j].pts){ if(dist(a,b)<60){ perto=true; break; } } if(perto) break; }
      if(perto) pai[raiz(j)]=raiz(i);
    }
    const g=new Map(); comp.forEach((c,i)=>{ const r=raiz(i); if(!g.has(r)) g.set(r,{segs:[],L:0}); const x=g.get(r); x.segs.push(...c.segs); x.L+=c.L; });
    return [...g.values()];
  }

  function areaDoTrecho(linhas, AREAS_POLY){
    // área onde está a maior parte do trecho
    const cont={};
    for(const p of linhas){ const m=p[Math.floor(p.length/2)]; for(const [n,polys] of Object.entries(AREAS_POLY)){ if(pontoNoPoligono(m,polys)){ cont[n]=(cont[n]||0)+compr(p); break; } } }
    const e=Object.entries(cont).sort((a,b)=>b[1]-a[1])[0]; return e? +e[0] : null;
  }
  const linhasDe = ids => ids.map(si=>SEGS[si].pts);
  const nomeDe = si => NOMES[SEGS[si].nome];
  const chaveDoSeg = si => NOMECHAVE[SEGS[si].nome];
  const comprSeg = si => compr(SEGS[si].pts);
  const totalSegs = () => SEGS.length;
  const meioSeg = si => { const p=SEGS[si].pts; return p[Math.floor(p.length/2)]; };

  // trecho de rua mais próximo de um ponto [lat,lng] (até "raio" metros): {si, d, p} com p = ponto projetado no eixo
  function pertoDe(pt, raio=40){
    let best=null;
    vizinhos([pt]).forEach(si=>{ const ps=SEGS[si].pts;
      for(let i=1;i<ps.length;i++){ const a=ps[i-1], b=ps[i];
        const ax=a[1]*KX, ay=a[0]*KY, bx=b[1]*KX, by=b[0]*KY, px=pt[1]*KX, py=pt[0]*KY;
        const dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy; let t=L?((px-ax)*dx+(py-ay)*dy)/L:0; t=Math.max(0,Math.min(1,t));
        const d=Math.hypot(px-ax-t*dx, py-ay-t*dy);
        if(d<raio && (!best||d<best.d)) best={si, d, p:[a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])]};
      } });
    return best;
  }
  // todos os trechos com o mesmo nome ligados ao trecho "si" (a rua contínua daquele lugar)
  function ruaConectada(si){
    const k=NOMECHAVE[SEGS[si].nome], todos=PORCHAVE.get(k)||[si];
    const adj=new Map(); const add=(a,v)=>{ if(!adj.has(a)) adj.set(a,[]); adj.get(a).push(v); };
    todos.forEach(s=>{ const p=SEGS[s].pts; const a=kn(p[0]), b=kn(p[p.length-1]); add(a,{to:b,si:s}); add(b,{to:a,si:s}); });
    const g=agruparTrechos(todos, adj).find(x=>x.segs.includes(si));
    return g ? g.segs : [si];
  }
  // nomes de rua parecidos com o texto (para a busca)
  function sugerirRuas(txt, max=8){
    const q=chave(txt); if(!q) return [];
    const out=[], vistos=new Set();
    for(const c of CHAVES){ if(c.k.includes(q) || q.split(" ").every(t=>c.t.has(t))){ const si=PORCHAVE.get(c.k)[0], nm=NOMES[SEGS[si].nome];
      if(!vistos.has(c.k)){ vistos.add(c.k); out.push({nome:nm, chave:c.k, segs:PORCHAVE.get(c.k), exata:c.k===q}); } }
      if(out.length>=max*3) break; }
    return out.sort((a,b)=>(b.exata-a.exata)||(a.nome.length-b.nome.length)).slice(0,max);
  }
  const segsDaChave = k => PORCHAVE.get(k) || [];
  const nomesTodos = () => NOMES.slice();
  return {iniciar, localizar, areaDoTrecho, acharRua, chave, limpa, compr, linhasDe, nomeDe, chaveDoSeg, comprSeg, totalSegs, meioSeg, pontoNoPoligono, pertoDe, ruaConectada, sugerirRuas, segsDaChave, nomesTodos};
})();
if(typeof module!=="undefined") module.exports = LOC;
