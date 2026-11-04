/* Ferramentas extras do mapa:
   1. Busca: rua (base do mapa), CEP (ViaCEP), endereço (OpenStreetMap) e coordenadas (graus ou UTM 22S)
   2. Régua: medir distância clicando no mapa, ou a extensão de uma rua clicando nela
   3. Trajeto: rota de carro e a pé entre dois lugares, com tempo, GPS e link para o Google Maps
   4. Camadas: subir shapefile (.zip), KML, KMZ e GeoJSON; ligar/desligar cada camada; esconder as camadas da capina */
const FerramentasExtra = (() => {
  const $ = id => document.getElementById(id);
  const R = (window.CFG && CFG.recursos) || {};
  const BELEM = { viewbox: "-48.70,-1.00,-48.20,-1.56" };
  let mapa = null;
  const dist = (a, b) => FerramentasMapa.distMetros(a, b);

  /* ============================================================================ GEOCODIFICAÇÃO */
  function lerCoordenada(txt) {
    const s = String(txt || "").trim().replace(/[()]/g, "");
    let m = s.match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
    if (m) { let a = +m[1].replace(",", "."), b = +m[2].replace(",", "."); if (Math.abs(a) > 20 && Math.abs(b) < 20) [a, b] = [b, a]; if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [a, b]; }
    // graus, minutos e segundos: 1°27'15"S 48°29'30"W
    const dms = [...s.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})?\s*['’]?\s*(\d{1,2}(?:[.,]\d+)?)?\s*["”]?\s*([NSLOEW])/gi)];
    if (dms.length === 2) {
      const v = x => { const g = +x[1] + (+x[2] || 0) / 60 + (+(x[3] || "0").replace(",", ".")) / 3600; return /[SOW]/i.test(x[4]) ? -g : g; };
      const a = dms.find(x => /[NS]/i.test(x[4])), b = dms.find(x => /[LOEW]/i.test(x[4]));
      if (a && b) return [v(a), v(b)];
    }
    // UTM SIRGAS 2000 zona 22S (metros): 780123 9838456
    m = s.match(/^(\d{6}(?:[.,]\d+)?)\s*[,; ]\s*(\d{7}(?:[.,]\d+)?)$/);
    if (m) return ImportarGeo.utmParaLatLon(+m[1].replace(",", "."), +m[2].replace(",", "."), -51, 10000000);
    return null;
  }
  const ehCep = t => /^\d{5}-?\d{3}$/.test(String(t || "").trim());
  async function nominatim(q, extra = "") {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&accept-language=pt-BR&viewbox=${BELEM.viewbox}&bounded=1${q ? "&q=" + encodeURIComponent(q) : "&country=Brasil"}${extra}`;
    const r = await fetch(url); if (!r.ok) throw new Error("serviço de endereços indisponível"); return r.json();
  }
  async function viaCep(cep) {
    const r = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g, "")}/json/`); if (!r.ok) throw new Error("CEP não consultado");
    const j = await r.json(); if (j.erro) throw new Error("CEP não encontrado"); return j;
  }
  // devolve lista de resultados {rotulo, ll, linhas?, zoom}
  async function geocodificar(txt) {
    const c = lerCoordenada(txt);
    if (c) return [{ rotulo: `Coordenada ${c[0].toFixed(6)}, ${c[1].toFixed(6)}`, ll: c, zoom: 18 }];
    if (ehCep(txt)) {
      const j = await viaCep(txt), out = [];
      const rua = j.logradouro || "", sug = rua ? LOC.sugerirRuas(rua, 1) : [];
      let ll = null;
      try { const n = await nominatim(`${rua}, ${j.bairro || ""}, ${j.localidade}, ${j.uf}`); if (n[0]) ll = [+n[0].lat, +n[0].lon]; } catch (e) {}
      if (!ll) try { const n = await nominatim("", `&postalcode=${j.cep}`); if (n[0]) ll = [+n[0].lat, +n[0].lon]; } catch (e) {}
      const linhas = sug[0] ? LOC.linhasDe(sug[0].segs) : null;
      if (!ll && linhas) ll = linhas[0][Math.floor(linhas[0].length / 2)];
      if (ll) out.push({ rotulo: `CEP ${j.cep}: ${rua || "(sem rua)"}${j.bairro ? ", " + j.bairro : ""} · ${j.localidade}/${j.uf}`, ll, linhas: linhas && perto(linhas, ll), zoom: 17 });
      if (!out.length) throw new Error(`CEP ${j.cep} (${rua}, ${j.bairro}) não localizado no mapa`);
      return out;
    }
    const locais = LOC.sugerirRuas(txt, 6).map(s => { const lin = LOC.linhasDe(s.segs); return { rotulo: s.nome, ll: lin[0][Math.floor(lin[0].length / 2)], linhas: lin, rua: true, exata: s.exata }; });
    let ext = [];
    if (/\d/.test(txt) || !locais.some(l => U.norm(l.rotulo) === U.norm(txt))) {
      const linhasOsm = g => !g ? null : g.type === "LineString" ? [g.coordinates.map(([x, y]) => [y, x])] : g.type === "MultiLineString" ? g.coordinates.map(l => l.map(([x, y]) => [y, x])) : null;
      try { ext = (await nominatim(txt + ", Belém, Pará", "&polygon_geojson=1")).map(n => ({ rotulo: n.display_name.split(",").slice(0, 4).join(",") + " (OpenStreetMap)", ll: [+n.lat, +n.lon], linhas: linhasOsm(n.geojson), zoom: 17 })); } catch (e) {}
    }
    return [...ext, ...locais];
  }
  // dos trechos de uma rua, fica só a parte mais perto do ponto (ruas com o mesmo nome em vários bairros)
  function perto(linhas, ll) { return linhas.filter(l => l.some(p => dist(p, ll) < 1500)); }

  /* ============================================================================ 1. BUSCA */
  let camadaBusca = null, timerSug = null;
  function criarBusca() {
    const ctrl = L.control({ position: "topright" });
    ctrl.onAdd = () => {
      const d = L.DomUtil.create("div", "busca-mapa");
      d.innerHTML = `<div class="busca-caixa"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="inBusca" placeholder="Rua, CEP ou coordenada" autocomplete="off" aria-label="Buscar rua, CEP ou coordenada">
          <button type="button" id="btBuscaLimpar" title="Limpar busca" hidden>&times;</button></div>
        <div class="busca-res" id="buscaRes" hidden></div>`;
      L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
      return d;
    };
    ctrl.addTo(mapa);
    const canto = ctrl.getContainer().parentNode; canto.insertBefore(ctrl.getContainer(), canto.firstChild);
    camadaBusca = L.layerGroup().addTo(mapa);
    const inp = $("inBusca"), res = $("buscaRes"), lim = $("btBuscaLimpar");
    inp.addEventListener("input", () => { lim.hidden = !inp.value; clearTimeout(timerSug); timerSug = setTimeout(() => sugerir(inp.value), 180); });
    inp.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); buscar(inp.value); } if (ev.key === "Escape") { res.hidden = true; } });
    inp.addEventListener("focus", () => { if (res.innerHTML) res.hidden = false; });
    lim.onclick = () => { inp.value = ""; lim.hidden = true; res.hidden = true; res.innerHTML = ""; camadaBusca.clearLayers(); };
    document.addEventListener("click", ev => { if (!ev.target.closest || !ev.target.closest(".busca-mapa")) res.hidden = true; });
  }
  function mostrarResultados(lista, carregando) {
    const res = $("buscaRes");
    if (carregando) { res.innerHTML = `<div class="busca-item nota">Procurando…</div>`; res.hidden = false; return; }
    if (!lista.length) { res.innerHTML = `<div class="busca-item nota">Nada encontrado. Tente o nome da rua, o CEP ou "-1.45, -48.48".</div>`; res.hidden = false; return; }
    res.innerHTML = lista.map((r, i) => r.osm ? `<button type="button" class="busca-item" data-i="${i}">Procurar "${U.esc(r.osm)}" no mapa da cidade <small>Enter</small></button>`
      : `<button type="button" class="busca-item" data-i="${i}">${U.esc(r.rotulo)}${r.rua ? ` <small>rua do mapa</small>` : ""}</button>`).join("");
    res.hidden = false;
    res.querySelectorAll("[data-i]").forEach(b => b.onclick = () => { const r = lista[+b.dataset.i]; if (r.osm) { buscar(r.osm); return; } irPara(r); res.hidden = true; });
  }
  function sugerir(txt) {
    const t = txt.trim(); if (t.length < 3 || lerCoordenada(t) || ehCep(t)) { if (!t) $("buscaRes").hidden = true; return; }
    const lista = LOC.sugerirRuas(t, 6).map(s => { const lin = LOC.linhasDe(s.segs); return { rotulo: s.nome, ll: lin[0][Math.floor(lin[0].length / 2)], linhas: lin, rua: true }; });
    lista.push({ osm: t });
    mostrarResultados(lista);
  }
  async function buscar(txt) {
    if (!txt.trim()) return;
    mostrarResultados([], true);
    try { const r = await geocodificar(txt); if (r.length === 1) { irPara(r[0]); $("buscaRes").hidden = true; } else mostrarResultados(r.map(x => x.rua || x.osm ? x : { ...x, rotulo: x.rotulo })); }
    catch (e) { $("buscaRes").innerHTML = `<div class="busca-item nota">${U.esc(e.message)}</div>`; }
  }
  function irPara(r) {
    camadaBusca.clearLayers();
    if (r.linhas && r.linhas.length) {
      const pl = L.polyline(r.linhas, { color: "#ffd400", weight: 11, opacity: .85, interactive: false }).addTo(camadaBusca);
      L.polyline(r.linhas, { color: "#14532d", weight: 4, interactive: false }).addTo(camadaBusca);
      const tot = r.linhas.reduce((s, l) => s + FerramentasMapa.comprLinha(l), 0);
      if (r.rua) { mapa.fitBounds(pl.getBounds(), { padding: [60, 60], maxZoom: 17 }); L.marker(r.ll).bindTooltip(`<b>${U.esc(r.rotulo)}</b><br>${U.fmtKm(tot)} na base do mapa`, { className: "dica", permanent: false }).addTo(camadaBusca); return; }
    }
    const mk = L.marker(r.ll).addTo(camadaBusca);
    mk.bindTooltip(`<b>${U.esc(r.rotulo)}</b><br><small>${r.ll[0].toFixed(6)}, ${r.ll[1].toFixed(6)}</small>`, { className: "dica", direction: "top" }).openTooltip();
    mapa.setView(r.ll, r.zoom || 17);
  }

  /* ============================================================================ 2. RÉGUA */
  let regua = { ativa: false, modoRua: false, pts: [], cursor: null, camada: null, fixa: false };
  function alternarRegua(forcar) {
    const ligar = forcar !== undefined ? forcar : !regua.ativa;
    if (ligar) { FerramentasMapa.pararTudo("extra"); pararTrajetoPick(); }
    regua.ativa = ligar; regua.pts = []; regua.cursor = null; regua.fixa = false;
    if (!regua.camada) regua.camada = L.layerGroup().addTo(mapa);
    regua.camada.clearLayers();
    mapa.getContainer().classList.toggle("cursor-desenho", ligar);
    if (ligar) mapa.doubleClickZoom.disable(); else setTimeout(() => mapa.doubleClickZoom.enable(), 250);
    const bt = $("btReguaMapa"); if (bt) bt.classList.toggle("on", ligar);
    FerramentasMapa.atualizarFlag(); barraRegua();
  }
  function barraRegua(info) {
    let b = $("barraRegua");
    if (!b) { b = document.createElement("div"); b.id = "barraRegua"; b.className = "barra-estudio-mapa"; document.body.appendChild(b); }
    if (!regua.ativa) { b.hidden = true; return; }
    const pts = regua.cursor && !regua.fixa ? [...regua.pts, regua.cursor] : regua.pts;
    const tot = FerramentasMapa.comprLinha(pts);
    b.hidden = false;
    b.innerHTML = `<div class="seg" style="margin:0"><button type="button" data-rmodo="0" class="${!regua.modoRua ? "on" : ""}">Medir distância</button><button type="button" data-rmodo="1" class="${regua.modoRua ? "on" : ""}">Extensão da rua</button></div>
      <span class="st-badge">${regua.modoRua ? (info || "Clique numa rua do mapa") : `${regua.pts.length ? `Total: <b>${U.fmtKm(tot)}</b>${regua.fixa ? "" : " · duplo clique termina"}` : "Clique no mapa para começar"}`}</span>
      ${!regua.modoRua && regua.pts.length ? `<button type="button" class="sec" id="btReguaDesfazer">Desfazer</button><button type="button" class="sec" id="btReguaNova">Nova medida</button>` : ""}
      ${!regua.modoRua && regua.pts.length >= 2 && R.planejamento !== false ? `<button type="button" class="sec" id="btReguaSalvar">Salvar como linha</button>` : ""}
      <button type="button" class="sec" id="btReguaFechar">Fechar (Esc)</button>`;
    b.querySelectorAll("[data-rmodo]").forEach(x => x.onclick = () => { regua.modoRua = x.dataset.rmodo === "1"; regua.pts = []; regua.fixa = false; regua.camada.clearLayers(); barraRegua(); });
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on("btReguaDesfazer", () => { regua.pts.pop(); regua.fixa = false; desenharRegua(); });
    on("btReguaNova", () => { regua.pts = []; regua.fixa = false; desenharRegua(); });
    on("btReguaSalvar", () => { const d = FerramentasMapa.novoItem("linha", regua.pts.slice(), { nome: "Medida " + U.fmtKm(FerramentasMapa.comprLinha(regua.pts)) }); alternarRegua(false); FerramentasMapa.adicionarItens([d]); });
    on("btReguaFechar", () => alternarRegua(false));
  }
  function desenharRegua() {
    regua.camada.clearLayers();
    const pts = regua.cursor && !regua.fixa ? [...regua.pts, regua.cursor] : regua.pts;
    if (pts.length >= 2) {
      L.polyline(pts, { color: "#fff", weight: 7, opacity: .9, interactive: false }).addTo(regua.camada);
      L.polyline(pts, { color: "#14532d", weight: 3.5, dashArray: "8 6", interactive: false }).addTo(regua.camada);
      let acum = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = dist(pts[i - 1], pts[i]); acum += d;
        const meio = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2];
        if (pts.length > 2) L.tooltip({ permanent: true, direction: "center", className: "regua-label", interactive: false }).setLatLng(meio).setContent(U.fmtKm(d)).addTo(regua.camada);
      }
      L.tooltip({ permanent: true, direction: "right", offset: [10, 0], className: "regua-label total", interactive: false }).setLatLng(pts[pts.length - 1]).setContent("Total " + U.fmtKm(acum)).addTo(regua.camada);
    }
    regua.pts.forEach((p, i) => L.circleMarker(p, { radius: i === 0 ? 5.5 : 4, color: "#14532d", weight: 2, fillColor: i === 0 ? "#22c55e" : "#fff", fillOpacity: 1, interactive: false }).addTo(regua.camada));
    barraRegua();
  }
  function medirRua(ll) {
    regua.camada.clearLayers();
    const r = LOC.pertoDe([ll.lat, ll.lng], 35);
    if (!r) { barraRegua("Nenhuma rua da base aqui. Clique mais perto do eixo da rua."); return; }
    const segs = LOC.ruaConectada(r.si), linhas = LOC.linhasDe(segs), nome = LOC.nomeDe(r.si);
    const tot = linhas.reduce((s, l) => s + LOC.compr(l), 0), quarteirao = LOC.comprSeg(r.si);
    L.polyline(linhas, { color: "#ffd400", weight: 10, opacity: .8, interactive: false }).addTo(regua.camada);
    L.polyline(linhas, { color: "#14532d", weight: 4, interactive: false }).addTo(regua.camada);
    L.polyline(LOC.linhasDe([r.si]), { color: "#d32f2f", weight: 5, interactive: false }).addTo(regua.camada);
    // extensão dentro da área onde foi clicado
    let txtArea = "";
    const area = (DADOS_GEO.areas.find(a => LOC.pontoNoPoligono(r.p, a.polys)) || {}).area;
    if (area && typeof Calc !== "undefined" && Calc.RUAS_AREA && Calc.RUAS_AREA[area]) { const x = Calc.RUAS_AREA[area][LOC.chaveDoSeg(r.si)]; if (x && x.total) txtArea = ` · na Área ${area}: <b>${U.fmtKm(x.total)}</b>`; }
    L.tooltip({ permanent: true, direction: "top", offset: [0, -8], className: "regua-label total", interactive: false }).setLatLng(r.p).setContent(`${U.esc(nome)}: ${U.fmtKm(tot)}`).addTo(regua.camada);
    barraRegua(`<b>${U.esc(nome)}</b>: rua contínua <b>${U.fmtKm(tot)}</b>${txtArea} · trecho em vermelho (entre esquinas) <b>${U.fmtKm(quarteirao)}</b>`);
  }

  /* ============================================================================ 3. TRAJETO */
  let traj = { a: null, b: null, pick: null, camada: null, res: null, gps: null, gpsMarker: null, textoA: "", textoB: "" };
  function pararTrajetoPick() { if (traj.pick) { traj.pick = null; mapa.getContainer().classList.remove("cursor-desenho"); FerramentasMapa.atualizarFlag(); } }
  function abrirTrajeto() { FerramentasMapa.pararTudo("extra"); App.abrirPersonalizado("trajeto", renderTrajeto); }
  const fmtTempo = s => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };
  function textoPasso(st) {
    const via = st.name ? ` pela ${st.name}` : "", m = st.maneuver || {}, d = U.fmtKm(st.distance);
    const lado = { left: "à esquerda", right: "à direita", "slight left": "levemente à esquerda", "slight right": "levemente à direita", "sharp left": "à esquerda", "sharp right": "à direita", straight: "em frente", uturn: "fazendo o retorno" }[m.modifier] || "";
    if (m.type === "depart") return `Saia${via} (${d})`;
    if (m.type === "arrive") return `Chegada ao destino`;
    if (m.type === "roundabout" || m.type === "rotary") return `Na rotatória, pegue a ${m.exit || ""}ª saída${via} (${d})`;
    if (m.type === "turn" || m.type === "end of road" || m.type === "fork" || m.type === "on ramp" || m.type === "off ramp") return `Vire ${lado}${via} (${d})`;
    return `Siga ${lado || "em frente"}${via} (${d})`;
  }
  function renderTrajeto(manter) {
    const r = traj.res, ga = traj.a && traj.b ? `https://www.google.com/maps/dir/?api=1&origin=${traj.a[0]},${traj.a[1]}&destination=${traj.b[0]},${traj.b[1]}&travelmode=driving` : "";
    Painel.mostrarPersonalizado(`
      <div class="det-cab" style="padding-bottom:12px"><div class="tipo">Mapa</div><h3>Trajeto</h3><div class="sub">Digite a rua, o endereço, o CEP ou a coordenada, ou escolha no mapa.</div></div>
      <div class="bloco">
        <label class="campo" style="margin-top:0">Saída (A)<div class="linha" style="flex-wrap:nowrap"><input type="text" id="inTrajA" value="${U.esc(traj.textoA)}" placeholder="Ex.: Av. Nazaré, 66035-170 ou -1.45, -48.48" style="flex:1">
          <button type="button" class="sec" id="btPickA" title="Clicar no mapa">Mapa</button><button type="button" class="sec" id="btGpsA" title="Usar minha localização">Eu</button></div></label>
        <label class="campo">Chegada (B)<div class="linha" style="flex-wrap:nowrap"><input type="text" id="inTrajB" value="${U.esc(traj.textoB)}" placeholder="Ex.: Garagem, Rua dos Mundurucus" style="flex:1">
          <button type="button" class="sec" id="btPickB" title="Clicar no mapa">Mapa</button></div></label>
        <div class="linha botoes"><button type="button" id="btCalcTraj">Calcular trajeto</button><button type="button" class="sec" id="btInverteTraj">Inverter A e B</button><button type="button" class="sec" id="btLimpaTraj">Limpar</button></div>
        <p class="nota" id="trajMsg">${traj.pick ? `Clique no mapa para marcar o ponto ${traj.pick.toUpperCase()}.` : ""}</p>
      </div>
      ${r ? `<div class="bloco"><div class="grade">
          <div><small>Distância de carro</small><span><b>${U.fmtKm(r.carro.distance)}</b></span></div>
          <div><small>Tempo de carro</small><span><b>${fmtTempo(r.carro.duration)}</b></span></div>
          <div><small>A pé</small><span>${r.pe ? `${U.fmtKm(r.pe.distance)} · ${fmtTempo(r.pe.duration)}` : "—"}</span></div>
          <div><small>Linha reta</small><span>${U.fmtKm(dist(traj.a, traj.b))}</span></div>
        </div>
        <p class="nota">Tempo estimado sem trânsito pelo mapa do OpenStreetMap. Para caminhão, considere tempo maior.</p>
        <div class="linha botoes">
          <a class="sec" href="${ga}" target="_blank" rel="noopener" style="text-decoration:none">Abrir no Google Maps (GPS) &#8599;</a>
          <button type="button" class="sec" id="btGpsSeguir">${traj.gps ? "Parar de seguir minha posição" : "Seguir minha posição"}</button>
          ${R.planejamento !== false ? `<button type="button" class="sec" id="btTrajSalvar">Salvar no planejamento</button>` : ""}
        </div></div>
        <div class="bloco"><h2>Caminho</h2><div class="hist">${r.carro.legs[0].steps.map(st => `<div><span>${U.esc(textoPasso(st))}</span></div>`).join("")}</div></div>` : ""}`, manter);
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    $("inTrajA").oninput = ev => traj.textoA = ev.target.value; $("inTrajB").oninput = ev => traj.textoB = ev.target.value;
    [["inTrajA"], ["inTrajB"]].forEach(([id]) => $(id).onkeydown = ev => { if (ev.key === "Enter") calcularTrajeto(); });
    on("btPickA", () => escolherNoMapa("a")); on("btPickB", () => escolherNoMapa("b"));
    on("btGpsA", () => minhaPosicao(ll => { traj.a = ll; traj.textoA = `${ll[0].toFixed(6)}, ${ll[1].toFixed(6)}`; marcarAB(); renderTrajeto(true); }));
    on("btCalcTraj", calcularTrajeto);
    on("btInverteTraj", () => { [traj.a, traj.b] = [traj.b, traj.a]; [traj.textoA, traj.textoB] = [traj.textoB, traj.textoA]; traj.res = null; marcarAB(); renderTrajeto(true); if (traj.a && traj.b) calcularTrajeto(); });
    on("btLimpaTraj", () => { traj = { ...traj, a: null, b: null, res: null, textoA: "", textoB: "" }; if (traj.camada) traj.camada.clearLayers(); renderTrajeto(true); });
    on("btGpsSeguir", alternarGps);
    on("btTrajSalvar", () => { const c = traj.res.carro.geometry.coordinates.map(p => [p[1], p[0]]); FerramentasMapa.adicionarItens([FerramentasMapa.novoItem("linha", c, { nome: "Trajeto " + (traj.textoA || "A") + " → " + (traj.textoB || "B"), obs: fmtTempo(traj.res.carro.duration) + " de carro" })]); });
  }
  function escolherNoMapa(qual) { FerramentasMapa.pararTudo("extra"); alternarRegua(false); traj.pick = qual; mapa.getContainer().classList.add("cursor-desenho"); FerramentasMapa.atualizarFlag(); const m = $("trajMsg"); if (m) m.textContent = `Clique no mapa para marcar o ponto ${qual.toUpperCase()}.`; }
  function minhaPosicao(fn) {
    if (!navigator.geolocation) { alert("Este aparelho não informa a localização."); return; }
    navigator.geolocation.getCurrentPosition(p => fn([p.coords.latitude, p.coords.longitude]), e => alert("Não foi possível pegar a localização: " + e.message), { enableHighAccuracy: true, timeout: 15000 });
  }
  function marcarAB() {
    if (!traj.camada) traj.camada = L.layerGroup().addTo(mapa);
    traj.camada.clearLayers();
    const pin = (ll, t, cor) => L.marker(ll, { icon: L.divIcon({ className: "pin", iconSize: [26, 36], iconAnchor: [13, 35], html: `<svg width="26" height="36" viewBox="0 0 26 36"><path d="M13 1C6.4 1 1 6.3 1 12.9c0 8.6 10.4 20.6 11.2 21.5.4.5 1.2.5 1.6 0C14.6 33.5 25 21.5 25 12.9 25 6.3 19.6 1 13 1z" fill="${cor}" stroke="#fff" stroke-width="1.6"/><text x="13" y="17" text-anchor="middle" font-family="Segoe UI,Arial" font-size="12" font-weight="700" fill="#fff">${t}</text></svg>` }) }).addTo(traj.camada);
    if (traj.res) {
      const c = traj.res.carro.geometry.coordinates.map(p => [p[1], p[0]]);
      L.polyline(c, { color: "#fff", weight: 9, opacity: .95, interactive: false }).addTo(traj.camada);
      L.polyline(c, { color: "#0b6bcb", weight: 5.5, opacity: 1, interactive: false }).addTo(traj.camada);
    }
    if (traj.a) pin(traj.a, "A", "#1e7b34");
    if (traj.b) pin(traj.b, "B", "#c0392b");
  }
  async function resolver(txt) { const r = await geocodificar(txt); if (!r.length) throw new Error(`"${txt}" não encontrado`); return r[0].ll; }
  async function calcularTrajeto() {
    const msg = t => { const m = $("trajMsg"); if (m) m.textContent = t; };
    try {
      msg("Calculando…");
      if (traj.textoA && (!traj.a || traj.textoA !== traj.aTxt)) { traj.a = await resolver(traj.textoA); traj.aTxt = traj.textoA; }
      if (traj.textoB && (!traj.b || traj.textoB !== traj.bTxt)) { traj.b = await resolver(traj.textoB); traj.bTxt = traj.textoB; }
      if (!traj.a || !traj.b) { msg("Informe a saída e a chegada."); return; }
      const par = `${traj.a[1]},${traj.a[0]};${traj.b[1]},${traj.b[0]}?overview=full&geometries=geojson&steps=true`;
      const [car, pe] = await Promise.all([fetch(CFG.rotas.carro + par).then(r => r.json()), fetch(CFG.rotas.pe + par).then(r => r.json()).catch(() => null)]);
      if (!car || car.code !== "Ok" || !car.routes || !car.routes[0]) throw new Error("não foi possível traçar a rota agora");
      traj.res = { carro: car.routes[0], pe: pe && pe.code === "Ok" && pe.routes[0] ? pe.routes[0] : null };
      marcarAB();
      mapa.fitBounds(L.polyline(traj.res.carro.geometry.coordinates.map(p => [p[1], p[0]])).getBounds(), { padding: [50, 50] });
      renderTrajeto(true);
    } catch (e) { msg("Não foi possível calcular: " + e.message); }
  }
  function alternarGps() {
    if (traj.gps != null) { navigator.geolocation.clearWatch(traj.gps); traj.gps = null; if (traj.gpsMarker) { mapa.removeLayer(traj.gpsMarker); traj.gpsMarker = null; } renderTrajeto(true); return; }
    if (!navigator.geolocation) { alert("Este aparelho não informa a localização."); return; }
    let primeira = true;
    traj.gps = navigator.geolocation.watchPosition(p => {
      const ll = [p.coords.latitude, p.coords.longitude];
      if (!traj.gpsMarker) traj.gpsMarker = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#0b6bcb", fillOpacity: 1 }).bindTooltip("Você está aqui", { className: "dica" }).addTo(mapa);
      else traj.gpsMarker.setLatLng(ll);
      if (primeira) { mapa.setView(ll, Math.max(mapa.getZoom(), 17)); primeira = false; } else if (!mapa.getBounds().pad(-.2).contains(ll)) mapa.panTo(ll);
    }, e => alert("Não foi possível seguir a localização: " + e.message), { enableHighAccuracy: true });
    renderTrajeto(true);
  }

  /* ============================================================================ 4. CAMADAS IMPORTADAS */
  let camadas = [], grupos = {}, rotulos = {};
  const CORES_CAM = ["#7b1fa2", "#0288d1", "#e65100", "#00796b", "#c2185b", "#303f9f", "#827717", "#5d4037"];
  async function carregarCamadas() { camadas = (await U.lerArq("camadas_importadas")) || []; camadas.forEach(desenharCamada); }
  const guardarCamadas = () => U.salvarArq("camadas_importadas", camadas);
  function primeiroTexto(p) { const k = Object.keys(p || {}).find(k => /nome|name|area|setor|cod/i.test(k)) || Object.keys(p || {})[0]; return k ? p[k] : ""; }
  function tabelaAtributos(c, f) {
    const linhas = Object.entries(f.props || {}).filter(([, v]) => v !== "" && v != null).slice(0, 25).map(([k, v]) => `<tr><td>${U.esc(k)}</td><td>${U.esc(v)}</td></tr>`).join("");
    let med = "";
    if (f.tipo === "poligono") { const ha = f.polys.reduce((s, pg) => s + FerramentasMapa.areaM2(pg[0]) / 10000, 0); med = `${U.fmt(ha, 2)} ha`; }
    else if (f.tipo === "linha") med = U.fmtKm(f.partes.reduce((s, l) => s + FerramentasMapa.comprLinha(l), 0));
    return `<b>${U.esc(c.nome)}</b>${med ? " · " + med : ""}${linhas ? `<table class="tab-atrib">${linhas}</table>` : ""}`;
  }
  function desenharCamada(c) {
    if (grupos[c.id]) { mapa.removeLayer(grupos[c.id]); delete grupos[c.id]; }
    if (!mapa.getPane("importadasPane")) { mapa.createPane("importadasPane").style.zIndex = 430; }
    const g = L.layerGroup(), cor = c.cor, op = c.opac == null ? .25 : c.opac;
    c.feicoes.forEach(f => {
      const fc = c.usarCoresArquivo && f.estilo && f.estilo.cor ? f.estilo.cor : cor;
      let lay;
      if (f.tipo === "ponto") lay = L.circleMarker(f.ll, { pane: "importadasPane", radius: 6, color: "#fff", weight: 2, fillColor: fc, fillOpacity: 1 });
      else if (f.tipo === "linha") lay = L.polyline(f.partes, { pane: "importadasPane", color: fc, weight: 3.5, opacity: .95 });
      else lay = L.polygon(f.polys, { pane: "importadasPane", color: fc, weight: 2, opacity: 1, fillColor: (c.usarCoresArquivo && f.estilo && f.estilo.preench) || fc, fillOpacity: op });
      lay.on("click", ev => { if (window.FERRAMENTA_ATIVA) return; L.DomEvent.stopPropagation(ev); L.popup({ maxWidth: 320 }).setLatLng(ev.latlng).setContent(tabelaAtributos(c, f)).openOn(mapa); });
      if (c.rotulos) { const t = primeiroTexto(f.props); if (t !== "" && t != null) lay.bindTooltip(U.esc(t), { permanent: true, direction: "center", className: "rotulo-area", interactive: false }); }
      else lay.bindTooltip(() => `<b>${U.esc(primeiroTexto(f.props) || c.nome)}</b><br><small>${U.esc(c.nome)} · clique para ver os dados</small>`, { sticky: true, className: "dica" });
      lay.addTo(g);
    });
    grupos[c.id] = g;
    if (c.visivel !== false) g.addTo(mapa);
  }
  async function importar(arquivos) {
    const msg = $("camMsg");
    for (const arq of arquivos) {
      try {
        if (msg) msg.textContent = "Lendo " + arq.name + "…";
        const lidas = await ImportarGeo.lerArquivo(arq);
        lidas.forEach(l => {
          if (!l.feicoes.length) return;
          const c = { id: "cam_" + Date.now() + "_" + Math.floor(Math.random() * 1e4), nome: l.nome, origem: l.origem, arquivo: arq.name, cor: CORES_CAM[camadas.length % CORES_CAM.length], opac: .25, visivel: true, rotulos: false, usarCoresArquivo: l.origem === "KML", feicoes: l.feicoes };
          camadas.push(c); desenharCamada(c);
          const b = grupos[c.id] && L.featureGroup(grupos[c.id].getLayers()).getBounds(); if (b && b.isValid()) mapa.fitBounds(b, { padding: [30, 30] });
        });
        if (msg) msg.textContent = "";
      } catch (e) { if (msg) msg.textContent = arq.name + ": " + e.message; else alert(e.message); }
    }
    await guardarCamadas(); renderCamadas(true);
  }
  function abrirCamadas() { FerramentasMapa.pararTudo("extra"); App.abrirPersonalizado("camadas", renderCamadas); }
  function contagem(c) { const n = { ponto: 0, linha: 0, poligono: 0 }; c.feicoes.forEach(f => n[f.tipo]++); return [n.poligono ? n.poligono + (n.poligono === 1 ? " área" : " áreas") : "", n.linha ? n.linha + (n.linha === 1 ? " linha" : " linhas") : "", n.ponto ? n.ponto + (n.ponto === 1 ? " ponto" : " pontos") : ""].filter(Boolean).join(" · "); }
  function renderCamadas(manter) {
    const capinaVisivel = !App.ui.mapaLimpo;
    Painel.mostrarPersonalizado(`
      <div class="det-cab" style="padding-bottom:12px"><div class="tipo">Mapa</div><h3>Camadas</h3><div class="sub">Suba arquivos do QGIS, do Google My Maps ou do Google Earth e ligue ou desligue cada um.</div></div>
      <div class="bloco">
        <label class="ckline" style="margin-top:0"><input type="checkbox" id="ckCapinaBase" ${capinaVisivel ? "checked" : ""}> <b>Camadas da capina</b> (10 áreas, ruas lançadas, pontos críticos e rotas)</label>
        <p class="nota">Desmarque para começar um mapa do zero só com o que você subir ou desenhar. Os dados da capina continuam guardados e voltam quando marcar de novo.</p>
      </div>
      <div class="bloco">
        <h2>Subir arquivo</h2>
        <button type="button" id="btCamImportar" style="width:100%">Escolher arquivo (shapefile .zip, KML, KMZ, GeoJSON)</button>
        <input type="file" id="inCamImportar" accept=".zip,.kml,.kmz,.geojson,.json" multiple hidden>
        <div class="soltar" id="camSoltar">ou arraste o arquivo para cá</div>
        <p class="nota" id="camMsg"></p>
        <p class="nota">Shapefile: compacte em .zip o .shp com o .dbf, .shx e .prj. Do Google My Maps: menu &#8942; &gt; Baixar KML/KMZ.</p>
      </div>
      <div class="bloco">
        <h2>Camadas enviadas (${camadas.length})</h2>
        ${camadas.length ? camadas.map(c => `
          <div class="cam-item" data-cam="${c.id}">
            <div class="cam-l1">
              <label class="ckline" style="margin:0;flex:1;min-width:0"><input type="checkbox" data-cam-vis="${c.id}" ${c.visivel !== false ? "checked" : ""}>
                <input type="text" class="cam-nome" data-cam-nome="${c.id}" value="${U.esc(c.nome)}" title="Nome da camada"></label>
              <input type="color" data-cam-cor="${c.id}" value="${c.cor}" title="Cor">
            </div>
            <div class="cam-l2">${contagem(c)} · ${U.esc(c.origem)}${c.arquivo ? " (" + U.esc(c.arquivo) + ")" : ""}</div>
            <div class="cam-l3">
              <label class="ckline" style="margin:0"><input type="checkbox" data-cam-rot="${c.id}" ${c.rotulos ? "checked" : ""}> Nomes no mapa</label>
              ${c.origem === "KML" ? `<label class="ckline" style="margin:0"><input type="checkbox" data-cam-corarq="${c.id}" ${c.usarCoresArquivo ? "checked" : ""}> Cores do arquivo</label>` : ""}
              <label class="ckline" style="margin:0">Preenchimento <input type="range" min="0" max="0.8" step="0.05" value="${c.opac == null ? .25 : c.opac}" data-cam-op="${c.id}" style="width:80px"></label>
            </div>
            <div class="linha botoes" style="margin-top:6px">
              <button type="button" class="sec" data-cam-zoom="${c.id}">Aproximar</button>
              ${R.planejamento !== false ? `<button type="button" class="sec" data-cam-plan="${c.id}" title="Copiar para o planejamento para poder editar e exportar">Editar no planejamento</button>` : ""}
              <button type="button" class="sec" data-cam-del="${c.id}" style="color:var(--vermelho);border-color:#f5c2c7">Remover</button>
            </div>
          </div>`).join("") : `<p class="nota">Nenhuma camada enviada ainda.</p>`}
        ${camadas.length ? `<p class="nota">As camadas ligadas entram nos arquivos de "Exportar dados atuais" (KMZ, KML e DXF).</p>` : ""}
      </div>`, manter);
    const acha = id => camadas.find(c => c.id === id);
    $("ckCapinaBase").onchange = ev => App.alternarMapaLimpo(!ev.target.checked);
    $("btCamImportar").onclick = () => $("inCamImportar").click();
    $("inCamImportar").onchange = ev => { const fs = [...ev.target.files]; ev.target.value = ""; if (fs.length) importar(fs); };
    const zona = $("camSoltar");
    zona.ondragover = ev => { ev.preventDefault(); zona.classList.add("on"); };
    zona.ondragleave = () => zona.classList.remove("on");
    zona.ondrop = ev => { ev.preventDefault(); zona.classList.remove("on"); const fs = [...ev.dataTransfer.files]; if (fs.length) importar(fs); };
    document.querySelectorAll("[data-cam-vis]").forEach(el => el.onchange = () => { const c = acha(el.dataset.camVis); c.visivel = el.checked; if (el.checked) grupos[c.id].addTo(mapa); else mapa.removeLayer(grupos[c.id]); guardarCamadas(); });
    document.querySelectorAll("[data-cam-nome]").forEach(el => el.onchange = () => { acha(el.dataset.camNome).nome = el.value; guardarCamadas(); });
    document.querySelectorAll("[data-cam-cor]").forEach(el => el.oninput = () => { const c = acha(el.dataset.camCor); c.cor = el.value; c.usarCoresArquivo = false; desenharCamada(c); guardarCamadas(); });
    document.querySelectorAll("[data-cam-op]").forEach(el => el.oninput = () => { const c = acha(el.dataset.camOp); c.opac = +el.value; desenharCamada(c); guardarCamadas(); });
    document.querySelectorAll("[data-cam-rot]").forEach(el => el.onchange = () => { const c = acha(el.dataset.camRot); c.rotulos = el.checked; desenharCamada(c); guardarCamadas(); });
    document.querySelectorAll("[data-cam-corarq]").forEach(el => el.onchange = () => { const c = acha(el.dataset.camCorarq); c.usarCoresArquivo = el.checked; desenharCamada(c); guardarCamadas(); renderCamadas(true); });
    document.querySelectorAll("[data-cam-zoom]").forEach(el => el.onclick = () => { const g = grupos[el.dataset.camZoom]; if (!g) return; const c = acha(el.dataset.camZoom); if (c.visivel === false) { c.visivel = true; g.addTo(mapa); guardarCamadas(); renderCamadas(true); } const b = L.featureGroup(g.getLayers()).getBounds(); if (b.isValid()) mapa.fitBounds(b, { padding: [30, 30] }); });
    document.querySelectorAll("[data-cam-plan]").forEach(el => el.onclick = () => { const c = acha(el.dataset.camPlan); const itens = FerramentasMapa.feicoesParaItens(c.feicoes, c.nome); itens.forEach(d => { if (!c.usarCoresArquivo) d.cor = c.cor; }); c.visivel = false; mapa.removeLayer(grupos[c.id]); guardarCamadas(); FerramentasMapa.adicionarItens(itens); });
    document.querySelectorAll("[data-cam-del]").forEach(el => el.onclick = () => { const c = acha(el.dataset.camDel); if (!confirm(`Remover a camada "${c.nome}" do mapa?`)) return; mapa.removeLayer(grupos[c.id]); delete grupos[c.id]; camadas = camadas.filter(x => x !== c); guardarCamadas(); renderCamadas(true); });
  }
  const camadasParaExportar = () => camadas.filter(c => c.visivel !== false);

  /* ============================================================================ INÍCIO E EVENTOS */
  function modoAtivo() { return regua.ativa || !!traj.pick; }
  function pararModos() { if (regua.ativa) alternarRegua(false); pararTrajetoPick(); }
  function init(m) {
    mapa = m;
    if (R.busca !== false) criarBusca();
    if (R.camadas !== false) carregarCamadas();
    mapa.on("click", ev => {
      if (regua.ativa) {
        if (regua.modoRua) { medirRua(ev.latlng); return; }
        if (regua.fixa) { regua.pts = []; regua.fixa = false; }
        regua.pts.push([ev.latlng.lat, ev.latlng.lng]); desenharRegua(); return;
      }
      if (traj.pick) {
        const ll = [ev.latlng.lat, ev.latlng.lng], q = traj.pick;
        traj[q] = ll; traj[q === "a" ? "textoA" : "textoB"] = `${ll[0].toFixed(6)}, ${ll[1].toFixed(6)}`; traj[q + "Txt"] = traj[q === "a" ? "textoA" : "textoB"];
        traj.res = null; pararTrajetoPick(); marcarAB();
        if (App.ui.aberto && App.ui.aberto.tipo === "trajeto") renderTrajeto(true);
        if (traj.a && traj.b) calcularTrajeto();
      }
    });
    mapa.on("mousemove", ev => { if (regua.ativa && !regua.modoRua && regua.pts.length && !regua.fixa) { regua.cursor = [ev.latlng.lat, ev.latlng.lng]; desenharRegua(); } });
    mapa.on("dblclick", ev => { if (regua.ativa && !regua.modoRua) { L.DomEvent.stopPropagation(ev); if (regua.pts.length > 1 && dist(regua.pts[regua.pts.length - 1], regua.pts[regua.pts.length - 2]) < 1) regua.pts.pop(); regua.fixa = true; regua.cursor = null; desenharRegua(); } });
    window.addEventListener("keydown", ev => {
      const t = ev.target && ev.target.tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (ev.key === "Escape") { if (regua.ativa) alternarRegua(false); pararTrajetoPick(); }
      if (ev.key === "Enter" && regua.ativa && !regua.modoRua) { regua.fixa = true; regua.cursor = null; desenharRegua(); }
    });
  }
  function reabrir(tipo) { if (tipo === "camadas") renderCamadas(true); else if (tipo === "trajeto") renderTrajeto(true); }

  return { init, alternarRegua, abrirTrajeto, abrirCamadas, reabrir, modoAtivo, pararModos, camadasParaExportar, geocodificar, lerCoordenada, get camadas() { return camadas; } };
})();
if (typeof window !== "undefined") window.FerramentasExtra = FerramentasExtra;
