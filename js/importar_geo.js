/* Leitura de arquivos geográficos no navegador (sem servidor):
   Shapefile (.zip com .shp/.dbf/.prj/.cpg), KML, KMZ e GeoJSON.
   Saída padronizada: lista de feições
     { tipo: "ponto",    ll: [lat, lng],                 props, estilo }
     { tipo: "linha",    partes: [[[lat,lng], ...], ...], props, estilo }
     { tipo: "poligono", polys: [[anelExterno, buraco...], ...], props, estilo }
   Coordenadas em SIRGAS 2000 / UTM (ex.: EPSG:31982, zona 22S) são convertidas para latitude/longitude. */
const ImportarGeo = (() => {

  /* ---------- ZIP (leitura) ---------- */
  async function inflar(bytes) {
    if (typeof DecompressionStream === "undefined") throw new Error("este navegador não abre arquivos compactados; use o Chrome ou o Edge atualizados");
    const ds = new DecompressionStream("deflate-raw");
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function lerZip(arrayBuffer) {
    const b = new Uint8Array(arrayBuffer), dv = new DataView(arrayBuffer);
    let fim = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    if (fim < 0) throw new Error("arquivo .zip inválido");
    const n = dv.getUint16(fim + 10, true); let p = dv.getUint32(fim + 16, true);
    const arqs = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true), tamC = dv.getUint32(p + 20, true), lnome = dv.getUint16(p + 28, true), lextra = dv.getUint16(p + 30, true), lcom = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const flags = dv.getUint16(p + 8, true);
      const nomeBytes = b.subarray(p + 46, p + 46 + lnome);
      const nome = new TextDecoder(flags & 0x800 ? "utf-8" : "utf-8").decode(nomeBytes);
      const ln = dv.getUint16(off + 26, true), le = dv.getUint16(off + 28, true), ini = off + 30 + ln + le;
      const dados = b.subarray(ini, ini + tamC);
      arqs[nome] = { metodo, dados };
      p += 46 + lnome + lextra + lcom;
    }
    const saida = {};
    for (const [nome, a] of Object.entries(arqs)) {
      if (nome.endsWith("/")) continue;
      saida[nome] = a.metodo === 0 ? a.dados : a.metodo === 8 ? await inflar(a.dados) : null;
    }
    return saida;
  }

  /* ---------- Projeção ---------- */
  // UTM (hemisfério sul ou norte) -> [lat, lon], elipsoide GRS80 (SIRGAS 2000) / WGS84 (diferença desprezível)
  function utmParaLatLon(x, y, lon0Graus, falsoNorte, k0 = 0.9996, falsoLeste = 500000) {
    const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), ep2 = e2 / (1 - e2), lon0 = lon0Graus * Math.PI / 180;
    const x1 = x - falsoLeste, y1 = y - falsoNorte, M = y1 / k0;
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
    const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
    const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2), T1 = Math.tan(phi1) ** 2, C1 = ep2 * Math.cos(phi1) ** 2;
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) ** 2, 1.5), D = x1 / (N1 * k0);
    const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
    const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(phi1);
    return [lat * 180 / Math.PI, lon * 180 / Math.PI];
  }
  // devolve função (x,y) -> [lat,lng]
  function projecaoDoPrj(prj) {
    const t = String(prj || "");
    if (/PROJCS/i.test(t)) {
      const par = nome => { const m = t.match(new RegExp('PARAMETER\\["' + nome + '"\\s*,\\s*(-?[\\d.]+)', "i")); return m ? +m[1] : null; };
      let lon0 = par("central_meridian"), fn = par("false_northing"), fe = par("false_easting"), k = par("scale_factor");
      const z = t.match(/UTM[_ ]?zone[_ ]?(\d+)\s*([NS])?/i);
      if (lon0 == null && z) lon0 = -183 + 6 * +z[1];
      if (fn == null) fn = z && /S/i.test(z[2] || "") ? 10000000 : 0;
      if (lon0 == null) throw new Error("projeção do arquivo não reconhecida; no QGIS, exporte em SIRGAS 2000 (EPSG:4674) ou WGS 84 (EPSG:4326)");
      return (x, y) => utmParaLatLon(x, y, lon0, fn, k || 0.9996, fe == null ? 500000 : fe);
    }
    return (x, y) => [y, x];
  }
  function projecaoEpsg(cod) {
    const n = +cod;
    if (n >= 31965 && n <= 31985) { const zona = n <= 31976 ? n - 31965 + 11 : n - 31977 + 17; const sul = n >= 31977; return (x, y) => utmParaLatLon(x, y, -183 + 6 * zona, sul ? 10000000 : 0); }
    if (n >= 32701 && n <= 32760) return (x, y) => utmParaLatLon(x, y, -183 + 6 * (n - 32700), 10000000);
    if (n >= 32601 && n <= 32660) return (x, y) => utmParaLatLon(x, y, -183 + 6 * (n - 32600), 0);
    return (x, y) => [y, x];
  }
  // sem .prj: se os números parecem metros, assume SIRGAS 2000 / UTM 22S (Belém)
  const pareceMetros = (x, y) => Math.abs(x) > 400 || Math.abs(y) > 400;
  const utm22s = (x, y) => utmParaLatLon(x, y, -51, 10000000);

  /* ---------- Shapefile ---------- */
  // área com sinal (positiva = anti-horário) para pontos [x, y]
  function areaAssinada(anel) { let s = 0; for (let i = 0; i < anel.length; i++) { const [x1, y1] = anel[i], [x2, y2] = anel[(i + 1) % anel.length]; s += x1 * y2 - x2 * y1; } return s / 2; }
  function lerShp(buf, proj) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), out = [];
    let p = 100;
    while (p + 8 <= buf.byteLength) {
      const tamConteudo = dv.getInt32(p + 4, false) * 2, ini = p + 8; p = ini + tamConteudo;
      if (tamConteudo < 4) { out.push(null); continue; }
      const tipo = dv.getInt32(ini, true);
      if (tipo === 0) { out.push(null); continue; }
      if (tipo === 1 || tipo === 11 || tipo === 21) { out.push({ tipo: "ponto", ll: proj(dv.getFloat64(ini + 4, true), dv.getFloat64(ini + 12, true)) }); continue; }
      if (tipo === 8 || tipo === 18 || tipo === 28) { // multiponto -> vários pontos
        const n = dv.getInt32(ini + 36, true), pts = [];
        for (let i = 0; i < n; i++) pts.push(proj(dv.getFloat64(ini + 40 + i * 16, true), dv.getFloat64(ini + 48 + i * 16, true)));
        out.push({ tipo: "multiponto", pts }); continue;
      }
      const nPartes = dv.getInt32(ini + 36, true), nPts = dv.getInt32(ini + 40, true), partes = [];
      for (let i = 0; i < nPartes; i++) partes.push(dv.getInt32(ini + 44 + i * 4, true));
      const base = ini + 44 + nPartes * 4, pts = [];
      for (let i = 0; i < nPts; i++) pts.push(proj(dv.getFloat64(base + i * 16, true), dv.getFloat64(base + 8 + i * 16, true)));
      const aneis = partes.map((s, i) => pts.slice(s, i + 1 < partes.length ? partes[i + 1] : nPts));
      if (tipo === 3 || tipo === 13 || tipo === 23) { out.push({ tipo: "linha", partes: aneis }); continue; }
      if (tipo === 5 || tipo === 15 || tipo === 25) {
        // no shapefile, anel externo é horário e buraco é anti-horário (em x/y; aqui estamos em lat/lng invertidos)
        const polys = [];
        aneis.forEach(a => { const horario = areaAssinada(a.map(q => [q[1], q[0]])) < 0;
          if (horario || !polys.length) polys.push([a]); else polys[polys.length - 1].push(a); });
        out.push({ tipo: "poligono", polys }); continue;
      }
      out.push(null);
    }
    return out;
  }
  function lerDbf(buf, codificacao) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const nReg = dv.getUint32(4, true), tamCab = dv.getUint16(8, true), tamReg = dv.getUint16(10, true);
    let dec; try { dec = new TextDecoder(codificacao || "windows-1252"); } catch (e) { dec = new TextDecoder("utf-8"); }
    const campos = [];
    for (let p = 32; p < tamCab - 1 && buf[p] !== 0x0D; p += 32) {
      let nome = ""; for (let i = 0; i < 11 && buf[p + i]; i++) nome += String.fromCharCode(buf[p + i]);
      campos.push({ nome: dec.decode(buf.subarray(p, p + 11)).replace(/\0.*$/, "").trim() || nome, tipo: String.fromCharCode(buf[p + 11]), tam: buf[p + 16] });
    }
    const regs = [];
    for (let r = 0; r < nReg; r++) {
      let p = tamCab + r * tamReg; if (p + tamReg > buf.length) break;
      const apagado = buf[p] === 0x2A; p += 1; const o = {};
      campos.forEach(c => { let v = dec.decode(buf.subarray(p, p + c.tam)).trim(); p += c.tam;
        if ((c.tipo === "N" || c.tipo === "F") && v !== "") { const n = parseFloat(v); v = isNaN(n) ? v : n; }
        else if (c.tipo === "D" && /^\d{8}$/.test(v)) v = v.slice(6, 8) + "/" + v.slice(4, 6) + "/" + v.slice(0, 4);
        else if (c.tipo === "L") v = /[YyTt]/.test(v) ? "Sim" : /[NnFf]/.test(v) ? "Não" : "";
        o[c.nome] = v; });
      regs.push(apagado ? null : o);
    }
    return regs;
  }
  async function lerShapefileZip(arrayBuffer) {
    const arqs = await lerZip(arrayBuffer);
    const nomes = Object.keys(arqs);
    const shps = nomes.filter(n => /\.shp$/i.test(n));
    if (!shps.length) throw new Error("o .zip não tem nenhum arquivo .shp (KML/KMZ/GeoJSON também podem ser enviados direto)");
    const camadas = [];
    for (const shp of shps) {
      const raiz = shp.replace(/\.shp$/i, ""), acha = ext => nomes.find(n => n.toLowerCase() === (raiz + ext).toLowerCase());
      const prjB = acha(".prj") && arqs[acha(".prj")], cpgB = acha(".cpg") && arqs[acha(".cpg")], dbfB = acha(".dbf") && arqs[acha(".dbf")];
      const prj = prjB ? new TextDecoder().decode(prjB) : "";
      const cpg = cpgB ? new TextDecoder().decode(cpgB).trim() : "";
      let proj = prj ? projecaoDoPrj(prj) : null;
      const shpBuf = arqs[shp];
      if (!proj) { const dv = new DataView(shpBuf.buffer, shpBuf.byteOffset, shpBuf.byteLength); proj = pareceMetros(dv.getFloat64(36, true), dv.getFloat64(44, true)) ? utm22s : (x, y) => [y, x]; }
      const geoms = lerShp(shpBuf, proj);
      const atrib = dbfB ? lerDbf(dbfB, /utf-?8/i.test(cpg) ? "utf-8" : (cpg && /^\d+$/.test(cpg) ? "windows-" + cpg : cpg || "windows-1252")) : [];
      const feicoes = [];
      geoms.forEach((g, i) => { if (!g) return; const props = atrib[i] || {};
        if (g.tipo === "multiponto") g.pts.forEach(ll => feicoes.push({ tipo: "ponto", ll, props }));
        else feicoes.push({ ...g, props }); });
      camadas.push({ nome: raiz.split("/").pop(), feicoes, origem: "Shapefile" });
    }
    return camadas;
  }

  /* ---------- KML / KMZ ---------- */
  const corKml = c => { const s = String(c || "").trim(); if (!/^[0-9a-f]{8}$/i.test(s)) return null; return { cor: "#" + s.slice(6, 8) + s.slice(4, 6) + s.slice(2, 4), opac: parseInt(s.slice(0, 2), 16) / 255 }; };
  function lerKml(texto, nomeArq) {
    const doc = new DOMParser().parseFromString(texto, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("o arquivo KML não pôde ser lido");
    const filho = (el, tag) => [...el.children].find(c => c.localName === tag);
    const txtDe = (el, tag) => { const c = el && filho(el, tag); return c ? c.textContent.trim() : ""; };
    // estilos
    const estilos = {};
    doc.querySelectorAll("Style[id]").forEach(s => {
      const ls = s.querySelector("LineStyle color"), ps = s.querySelector("PolyStyle color"), ic = s.querySelector("IconStyle color"), w = s.querySelector("LineStyle width");
      estilos[s.getAttribute("id")] = { linha: corKml(ls && ls.textContent), preench: corKml(ps && ps.textContent), icone: corKml(ic && ic.textContent), espessura: w ? +w.textContent : null };
    });
    doc.querySelectorAll("StyleMap[id]").forEach(sm => {
      const par = [...sm.querySelectorAll("Pair")].find(p => txtDe(p, "key") === "normal");
      const url = par ? txtDe(par, "styleUrl").replace(/^#/, "") : "";
      if (estilos[url]) estilos[sm.getAttribute("id")] = estilos[url];
    });
    const coords = s => s.trim().split(/\s+/).map(t => { const [lon, lat] = t.split(",").map(Number); return [lat, lon]; }).filter(c => isFinite(c[0]) && isFinite(c[1]));
    const pastas = new Map();
    doc.querySelectorAll("Placemark").forEach(pm => {
      let pasta = ""; for (let e = pm.parentElement; e; e = e.parentElement) if (e.localName === "Folder") { pasta = txtDe(e, "name"); break; }
      const props = {}; const nm = txtDe(pm, "name"); if (nm) props.Nome = nm;
      const ds = txtDe(pm, "description"); if (ds) props["Descrição"] = ds.replace(/<br\s*\/?>/gi, " · ").replace(/<[^>]+>/g, "").trim();
      pm.querySelectorAll("ExtendedData Data").forEach(d => { const v = d.querySelector("value"); props[d.getAttribute("name")] = v ? v.textContent.trim() : ""; });
      pm.querySelectorAll("ExtendedData SimpleData").forEach(d => { props[d.getAttribute("name")] = d.textContent.trim(); });
      const st = estilos[txtDe(pm, "styleUrl").replace(/^#/, "")] || {};
      const estilo = { cor: (st.linha || st.icone || st.preench || {}).cor, preench: (st.preench || {}).cor, opac: st.preench ? st.preench.opac : null, espessura: st.espessura };
      const feicoes = [];
      pm.querySelectorAll("Point coordinates").forEach(c => { const cc = coords(c.textContent); if (cc[0]) feicoes.push({ tipo: "ponto", ll: cc[0], props, estilo }); });
      const linhas = [...pm.querySelectorAll("LineString coordinates")].map(c => coords(c.textContent)).filter(l => l.length >= 2);
      if (linhas.length) feicoes.push({ tipo: "linha", partes: linhas, props, estilo });
      const polys = [...pm.querySelectorAll("Polygon")].map(pg => {
        const ext = pg.querySelector("outerBoundaryIs coordinates"), ints = [...pg.querySelectorAll("innerBoundaryIs coordinates")];
        return [ext ? coords(ext.textContent) : [], ...ints.map(i => coords(i.textContent))].filter(a => a.length >= 3);
      }).filter(p => p.length);
      if (polys.length) feicoes.push({ tipo: "poligono", polys, props, estilo });
      if (!pastas.has(pasta)) pastas.set(pasta, []);
      pastas.get(pasta).push(...feicoes);
    });
    const nomeDoc = txtDe(doc.querySelector("Document") || doc.documentElement, "name") || nomeArq.replace(/\.\w+$/, "");
    const lista = [...pastas.entries()].filter(([, f]) => f.length);
    if (lista.length <= 1) return [{ nome: nomeDoc, feicoes: lista.length ? lista[0][1] : [], origem: "KML" }];
    return lista.map(([p, f]) => ({ nome: (p || "Sem pasta") + " · " + nomeDoc, feicoes: f, origem: "KML" }));
  }
  async function lerKmz(arrayBuffer, nomeArq) {
    const arqs = await lerZip(arrayBuffer);
    const k = Object.keys(arqs).find(n => /(^|\/)doc\.kml$/i.test(n)) || Object.keys(arqs).find(n => /\.kml$/i.test(n));
    if (!k) throw new Error("o KMZ não tem um arquivo .kml dentro");
    return lerKml(new TextDecoder("utf-8").decode(arqs[k]), nomeArq);
  }

  /* ---------- GeoJSON ---------- */
  function lerGeojson(texto, nomeArq) {
    const gj = JSON.parse(texto);
    let proj = (x, y) => [y, x];
    const crs = gj.crs && gj.crs.properties && gj.crs.properties.name;
    const m = crs && String(crs).match(/EPSG:*(\d+)/i);
    if (m) proj = projecaoEpsg(m[1]);
    const feats = gj.type === "FeatureCollection" ? gj.features : gj.type === "Feature" ? [gj] : [{ type: "Feature", properties: {}, geometry: gj }];
    const out = [];
    const umPar = c => proj(c[0], c[1]);
    const add = (g, props) => {
      if (!g) return;
      const t = g.type, c = g.coordinates;
      if (t === "Point") out.push({ tipo: "ponto", ll: umPar(c), props });
      else if (t === "MultiPoint") c.forEach(p => out.push({ tipo: "ponto", ll: umPar(p), props }));
      else if (t === "LineString") out.push({ tipo: "linha", partes: [c.map(umPar)], props });
      else if (t === "MultiLineString") out.push({ tipo: "linha", partes: c.map(l => l.map(umPar)), props });
      else if (t === "Polygon") out.push({ tipo: "poligono", polys: [c.map(a => a.map(umPar))], props });
      else if (t === "MultiPolygon") out.push({ tipo: "poligono", polys: c.map(pg => pg.map(a => a.map(umPar))), props });
      else if (t === "GeometryCollection") g.geometries.forEach(x => add(x, props));
    };
    feats.forEach(f => add(f.geometry, f.properties || {}));
    return [{ nome: gj.name || nomeArq.replace(/\.\w+$/, ""), feicoes: out, origem: "GeoJSON" }];
  }

  /* ---------- entrada única ---------- */
  async function lerArquivo(arquivo) {
    const nome = arquivo.name || "arquivo", ext = (nome.match(/\.(\w+)$/) || [])[1];
    const e = (ext || "").toLowerCase();
    if (e === "zip") return lerShapefileZip(await arquivo.arrayBuffer());
    if (e === "kmz") return lerKmz(await arquivo.arrayBuffer(), nome);
    if (e === "kml") return lerKml(await arquivo.text(), nome);
    if (e === "geojson" || e === "json") return lerGeojson(await arquivo.text(), nome);
    if (e === "shp") throw new Error("envie o shapefile compactado em .zip (junto com .dbf, .prj e .shx), ou exporte do QGIS como KML/GeoJSON");
    throw new Error("formato não reconhecido (use .zip do shapefile, .kml, .kmz ou .geojson)");
  }

  return { lerArquivo, lerZip, lerKml, lerKmz, lerGeojson, lerShapefileZip, utmParaLatLon, projecaoDoPrj };
})();
if (typeof window !== "undefined") window.ImportarGeo = ImportarGeo;
