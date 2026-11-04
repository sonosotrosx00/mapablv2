/* Ferramentas do mapa:
   1. Street View (boneco amarelo): arrastar para uma rua ou clicar no botão e depois na rua.
   2. Planejar / Desenhar Rotas: linhas (rotas, ruas), áreas/setores (polígonos) e pontos (pontos críticos e outros),
      com edição de vértices, cores, campos, importação/exportação (KML, KMZ, DXF, GeoJSON, Excel)
      e ligação com um arquivo .geojson aberto no QGIS (o site grava e lê o mesmo arquivo). */
const FerramentasMapa = (() => {
  const $ = id => document.getElementById(id);
  const R = (window.CFG && CFG.recursos) || {};
  const CORES = ["#1e7b34", "#0288d1", "#d32f2f", "#f57c00", "#7b1fa2", "#fbc02d", "#00796b", "#c2185b", "#303f9f", "#455a64"];
  const TIPOS = { linha: "Linha / rota", poligono: "Área / setor", ponto: "Ponto" };
  const CATEGORIAS = ["Ponto crítico", "Ponto de apoio", "Ecoponto", "Lixeira / contêiner", "Ponto de descarte irregular", "Garagem", "Outro"];
  const PATRULHAS = ["Manual", "Mecanizada"];
  const MATERIAIS = ["Misto", "RCC", "Domiciliar", "Entulho", "Volumoso", "Poda / verde", "Outro"];
  const STATUS = ["Pendente", "Coletado", "Não coletado", "Planejado"];

  let mapa = null, camadaDesenhos = null, camadaEdicao = null, camadaTemp = null;

  /* Street View */
  let modoPegman = false, marcadorPegman = null, svCoord = null, svAngulo = 0, svExpandido = false, arrastandoPegman = false, fantasmaPegman = null;

  /* Planejamento */
  let desenhos = [], selId = null, desenhando = false, tipoDesenho = "linha", mostrarDesenhos = true, snapRua = true;
  let pontosTemp = [], cursorTemp = null, filtroLista = "";

  const SVG_PEGMAN = `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="12" cy="29.5" rx="6.5" ry="2" fill="rgba(0,0,0,0.28)"/>
    <circle cx="12" cy="6.2" r="4.5" fill="#fbbc04" stroke="#b06000" stroke-width="1.4"/>
    <path d="M7 13.2c0-1.5 1.3-2.5 5-2.5s5 1 5 2.5v6.3c0 .9-.7 1.5-1.5 1.5h-.8l-.6 7c-.1.8-.7 1.3-1.5 1.3h-1.2c-.8 0-1.4-.5-1.5-1.3l-.6-7h-.8c-.8 0-1.5-.6-1.5-1.5v-6.3z" fill="#fbbc04" stroke="#b06000" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="10.6" cy="5.7" r=".8" fill="#5f370e"/><circle cx="13.4" cy="5.7" r=".8" fill="#5f370e"/></svg>`;
  const ICO = {
    lapis: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
    regua: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/></svg>`,
    rota: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/></svg>`,
    camadas: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>`
  };

  /* ---------- medidas ---------- */
  function distMetros(a, b) {
    const Rt = 6371000, r = x => x * Math.PI / 180, dLat = r(b[0] - a[0]), dLon = r(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * Rt * Math.asin(Math.sqrt(h));
  }
  const comprLinha = c => { let m = 0; for (let i = 1; i < (c || []).length; i++) m += distMetros(c[i - 1], c[i]); return m; };
  const perimetro = c => c && c.length >= 3 ? comprLinha([...c, c[0]]) : 0;
  function areaM2(c) {
    if (!c || c.length < 3) return 0;
    const lat0 = c[0][0] * Math.PI / 180, kx = 111320 * Math.cos(lat0), ky = 110574;
    let s = 0; for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; s += (p[1] * kx) * (q[0] * ky) - (q[1] * kx) * (p[0] * ky); }
    return Math.abs(s / 2);
  }
  function medir(d) {
    if (d.tipo === "poligono") { d.metros = perimetro(d.coords); d.areaHa = areaM2(d.coords) / 10000; }
    else if (d.tipo === "ponto") { d.metros = 0; }
    else d.metros = comprLinha(d.coords);
  }

  /* ---------- ímã de rua (usa a base de ruas do mapa) ---------- */
  function ajustarPontoNaRua(latlng) {
    const pt = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
    if (!snapRua || typeof LOC === "undefined" || !LOC.pertoDe) return pt;
    const r = LOC.pertoDe(pt, 18);
    return r ? r.p : pt;
  }
  function ruaMaisProxima(lat, lng) {
    if (typeof LOC === "undefined" || !LOC.pertoDe) return null;
    const r = LOC.pertoDe([lat, lng], 120);
    return r ? LOC.nomeDe(r.si) : null;
  }

  /* ============================================================================ INÍCIO */
  function init(instanciaMapa) {
    mapa = instanciaMapa;
    desenhos = U.ler("desenhos_mymaps", []);
    desenhos.forEach((d, i) => { if (!d.id) d.id = "item_" + Date.now() + "_" + i; if (!d.tipo) d.tipo = "linha"; if (d.visivel === undefined) d.visivel = true; medir(d); });
    mapa.createPane("desenhosPane").style.zIndex = 465;
    camadaDesenhos = L.layerGroup().addTo(mapa);
    camadaEdicao = L.layerGroup().addTo(mapa);
    camadaTemp = L.layerGroup().addTo(mapa);
    criarControleMapa();
    criarJanelaStreetView();
    criarBarraFlutuante();
    ligarEventosMapa();
    renderizarDesenhosNoMapa();
    Qgis.iniciar();
  }

  function criarControleMapa() {
    const ctrl = L.control({ position: "topleft" });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create("div", "ctrl-ferramentas-mapa");
      div.innerHTML = `
        <button type="button" id="btPegmanMapa" class="bt-pegman" title="Arraste o boneco até uma rua, ou clique aqui e depois na rua">
          <span class="pegman-ico">${SVG_PEGMAN}</span><span class="ferr-txt">Street View</span></button>
        ${R.planejamento !== false ? `<button type="button" id="btDesenharMapa" class="bt-mymaps" title="Planejar / Desenhar Rotas"><span class="mymaps-ico">${ICO.lapis}</span><span class="ferr-txt">Planejar / Desenhar Rotas</span></button>` : ""}
        ${R.regua !== false ? `<button type="button" id="btReguaMapa" class="bt-mymaps" title="Medir distância ou a extensão de uma rua"><span class="mymaps-ico">${ICO.regua}</span><span class="ferr-txt">Régua</span></button>` : ""}
        ${R.trajeto !== false ? `<button type="button" id="btTrajetoMapa" class="bt-mymaps" title="Trajeto de um ponto a outro, com tempo e GPS"><span class="mymaps-ico">${ICO.rota}</span><span class="ferr-txt">Trajeto</span></button>` : ""}
        ${R.camadas !== false ? `<button type="button" id="btCamadasMapa" class="bt-mymaps" title="Subir shapefile, KML, KMZ ou GeoJSON e ligar ou desligar camadas"><span class="mymaps-ico">${ICO.camadas}</span><span class="ferr-txt">Camadas</span></button>` : ""}`;
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    ctrl.addTo(mapa);
    setTimeout(() => {
      const btPeg = $("btPegmanMapa");
      if (btPeg) { btPeg.onclick = () => alternarModoPegman(); iniciarArrastoPegman(btPeg); }
      if ($("btDesenharMapa")) $("btDesenharMapa").onclick = () => abrirEstudioPainel();
      if ($("btReguaMapa")) $("btReguaMapa").onclick = () => window.FerramentasExtra && FerramentasExtra.alternarRegua();
      if ($("btTrajetoMapa")) $("btTrajetoMapa").onclick = () => window.FerramentasExtra && FerramentasExtra.abrirTrajeto();
      if ($("btCamadasMapa")) $("btCamadasMapa").onclick = () => window.FerramentasExtra && FerramentasExtra.abrirCamadas();
    }, 0);
  }

  // para todas as ferramentas que usam clique no mapa (só uma por vez)
  function pararTudo(exceto) {
    if (exceto !== "pegman" && modoPegman) alternarModoPegman(false);
    if (exceto !== "desenho" && desenhando) pararDesenho(false);
    if (exceto !== "extra" && window.FerramentasExtra) FerramentasExtra.pararModos();
  }
  const atualizarFlag = () => { window.FERRAMENTA_ATIVA = modoPegman || desenhando || !!(window.FerramentasExtra && FerramentasExtra.modoAtivo()); };

  /* ============================================================================ 1. STREET VIEW */
  function iniciarArrastoPegman(botao) {
    let x0 = 0, y0 = 0;
    const onMove = ev => {
      const cx = ev.clientX, cy = ev.clientY; if (cx == null) return;
      if (!arrastandoPegman && Math.hypot(cx - x0, cy - y0) > 6) {
        arrastandoPegman = true;
        if (!fantasmaPegman) { fantasmaPegman = document.createElement("div"); fantasmaPegman.className = "pegman-fantasma"; fantasmaPegman.innerHTML = SVG_PEGMAN; document.body.appendChild(fantasmaPegman); }
        fantasmaPegman.hidden = false;
      }
      if (arrastandoPegman && fantasmaPegman) { fantasmaPegman.style.left = (cx - 12) + "px"; fantasmaPegman.style.top = (cy - 28) + "px"; }
    };
    const onUp = ev => {
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
      if (fantasmaPegman) fantasmaPegman.hidden = true;
      if (arrastandoPegman) {
        arrastandoPegman = false;
        const rect = mapa.getContainer().getBoundingClientRect();
        if (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
          const ll = mapa.containerPointToLatLng(L.point(ev.clientX - rect.left, ev.clientY - rect.top));
          abrirStreetView(ll.lat, ll.lng);
        }
      }
    };
    botao.addEventListener("pointerdown", ev => { x0 = ev.clientX; y0 = ev.clientY; window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); });
  }
  function alternarModoPegman(forcar) {
    modoPegman = forcar !== undefined ? forcar : !modoPegman;
    if (modoPegman) pararTudo("pegman");
    const bt = $("btPegmanMapa"); if (bt) bt.classList.toggle("on", modoPegman);
    mapa.getContainer().classList.toggle("cursor-pegman", modoPegman);
    atualizarFlag(); atualizarBarraFlutuante();
  }
  function criarJanelaStreetView() {
    const div = document.createElement("div");
    div.id = "janelaStreetView"; div.className = "sv-janela"; div.hidden = true;
    div.innerHTML = `
      <div class="sv-topo">
        <div class="sv-tit"><span class="sv-icone">${SVG_PEGMAN}</span><div><b id="svRuaNome">Street View</b><small id="svCoordTxt">—</small></div></div>
        <div class="sv-controles">
          <div class="sv-bussola" title="Girar a câmera">
            <button type="button" data-ang="0" title="Norte">N</button><button type="button" data-ang="90" title="Leste">L</button>
            <button type="button" data-ang="180" title="Sul">S</button><button type="button" data-ang="270" title="Oeste">O</button>
          </div>
          <a id="svLinkExterno" href="#" target="_blank" rel="noopener" class="sv-bt-ext">Google Maps &#8599;</a>
          <button type="button" id="btSvExpandir" class="sv-bt" title="Aumentar ou diminuir a janela">&#9634;</button>
          <button type="button" id="btSvFechar" class="sv-bt sv-fechar" title="Fechar">&times;</button>
        </div>
      </div>
      <div class="sv-corpo"><iframe id="svIframe" title="Google Street View" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
      <div class="sv-rodape"><span>Arraste o boneco amarelo no mapa para ir para outra rua.</span></div>`;
    document.body.appendChild(div);
    div.querySelectorAll("[data-ang]").forEach(b => b.onclick = () => { svAngulo = +b.dataset.ang; div.querySelectorAll("[data-ang]").forEach(x => x.classList.toggle("on", x === b)); if (svCoord) atualizarIframeStreetView(svCoord[0], svCoord[1], svAngulo); });
    $("btSvExpandir").onclick = () => { svExpandido = !svExpandido; div.classList.toggle("expandido", svExpandido); };
    $("btSvFechar").onclick = () => fecharStreetView();
  }
  function atualizarIframeStreetView(lat, lng, ang = 0) {
    const emb = `https://maps.google.com/maps?q=&layer=c&cbll=${lat.toFixed(6)},${lng.toFixed(6)}&cbp=11,${ang},0,0,0&output=svembed`;
    const ext = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lng.toFixed(6)}&heading=${ang}`;
    const ifr = $("svIframe"); if (ifr && ifr.src !== emb) ifr.src = emb;
    const lnk = $("svLinkExterno"); if (lnk) lnk.href = ext;
  }
  function abrirStreetView(lat, lng, rotulo) {
    svCoord = [lat, lng];
    $("svRuaNome").textContent = rotulo || ruaMaisProxima(lat, lng) || "Rua selecionada";
    $("svCoordTxt").textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    if (!marcadorPegman) {
      marcadorPegman = L.marker([lat, lng], { draggable: true, zIndexOffset: 2000, icon: L.divIcon({ className: "pin-pegman", iconSize: [30, 38], iconAnchor: [15, 34], html: `<div class="pegman-mapa-marker">${SVG_PEGMAN}</div>` }) }).addTo(mapa);
      marcadorPegman.bindTooltip("Arraste para outra rua", { direction: "top", offset: [0, -30], className: "dica" });
      marcadorPegman.on("dragend", ev => { const p = ev.target.getLatLng(); abrirStreetView(p.lat, p.lng); });
    } else { marcadorPegman.setLatLng([lat, lng]); if (!mapa.hasLayer(marcadorPegman)) marcadorPegman.addTo(mapa); }
    $("janelaStreetView").hidden = false;
    atualizarIframeStreetView(lat, lng, svAngulo);
    if (modoPegman) alternarModoPegman(false);
  }
  function fecharStreetView() {
    $("janelaStreetView").hidden = true; $("svIframe").src = "about:blank";
    if (marcadorPegman) mapa.removeLayer(marcadorPegman);
    svCoord = null; alternarModoPegman(false);
  }

  /* ============================================================================ 2. PLANEJAR / DESENHAR ROTAS */
  function criarBarraFlutuante() {
    const barra = document.createElement("div");
    barra.id = "barraEstudioMapa"; barra.className = "barra-estudio-mapa"; barra.hidden = true;
    document.body.appendChild(barra);
  }
  function atualizarBarraFlutuante() {
    const b = $("barraEstudioMapa"); if (!b) return;
    if (modoPegman) {
      b.hidden = false;
      b.innerHTML = `<span class="st-badge peg">${SVG_PEGMAN} <b>Street View:</b> clique numa rua do mapa</span><button type="button" class="sec" id="btCancelarPeg">Sair (Esc)</button>`;
      $("btCancelarPeg").onclick = () => alternarModoPegman(false);
      return;
    }
    if (desenhando) {
      const pts = cursorTemp ? [...pontosTemp, cursorTemp] : pontosTemp;
      const med = tipoDesenho === "poligono" ? `${U.fmtKm(perimetro(pts))} de perímetro · ${U.fmt(areaM2(pts) / 10000, 2)} ha` : U.fmtKm(comprLinha(pts));
      const min = tipoDesenho === "poligono" ? 3 : 2;
      b.hidden = false;
      b.innerHTML = tipoDesenho === "ponto"
        ? `<span class="st-badge des">${ICO.lapis} <b>Novo ponto:</b> clique no mapa onde fica o ponto</span><button type="button" class="sec" id="btCancelarDesenho">Cancelar (Esc)</button>`
        : `<span class="st-badge des">${ICO.lapis} <b>${tipoDesenho === "poligono" ? "Desenhando área" : "Desenhando linha"}:</b> ${pontosTemp.length} ponto${pontosTemp.length === 1 ? "" : "s"} · <b>${med}</b></span>
          <label class="ck-snap"><input type="checkbox" id="ckSnapBarra" ${snapRua ? "checked" : ""}> Ímã de rua</label>
          <button type="button" class="sec" id="btDesfazerPt" ${pontosTemp.length ? "" : "disabled"}>Desfazer ponto</button>
          <button type="button" id="btConcluirDesenho" ${pontosTemp.length >= min ? "" : "disabled"}>Concluir (Enter)</button>
          <button type="button" class="sec" id="btCancelarDesenho">Cancelar (Esc)</button>`;
      if ($("ckSnapBarra")) $("ckSnapBarra").onchange = ev => { snapRua = ev.target.checked; };
      if ($("btDesfazerPt")) $("btDesfazerPt").onclick = () => desfazerUltimoPonto();
      if ($("btConcluirDesenho")) $("btConcluirDesenho").onclick = () => pararDesenho(true);
      $("btCancelarDesenho").onclick = () => pararDesenho(false);
      return;
    }
    b.hidden = true;
  }

  function iniciarDesenho(tipo) {
    pararTudo("desenho");
    tipoDesenho = tipo || "linha";
    desenhando = true; pontosTemp = []; cursorTemp = null; camadaTemp.clearLayers();
    mapa.doubleClickZoom.disable();
    mapa.getContainer().classList.add("cursor-desenho");
    const bt = $("btDesenharMapa"); if (bt) bt.classList.add("on");
    atualizarFlag(); atualizarBarraFlutuante();
    if (App.ui.aberto && App.ui.aberto.tipo === "estudio") renderizarPainelEstudio(true);
  }
  function desfazerUltimoPonto() { if (!pontosTemp.length) return; pontosTemp.pop(); desenharPreviewTemp(); atualizarBarraFlutuante(); }
  function novoItem(tipo, coords, extra) {
    const n = desenhos.filter(d => d.tipo === tipo).length + 1;
    const d = {
      id: "item_" + Date.now() + "_" + Math.floor(Math.random() * 1000), tipo,
      nome: tipo === "ponto" ? "Ponto " + n : tipo === "poligono" ? "Área planejada " + n : "Rota planejada " + n,
      area: App.ui.areaAberta || "", cor: tipo === "ponto" ? "#d32f2f" : CORES[(desenhos.length) % CORES.length],
      espessura: tipo === "poligono" ? 3 : 5, tracejada: false, visivel: true, obs: "", coords,
      ...(tipo === "ponto" ? { categoria: "Ponto crítico", patrulha: "Manual", material: "Misto", status: "Planejado" } : {}),
      ...(tipo === "poligono" ? { supervisor: "", frequencia: "" } : {}),
      ...(extra || {})
    };
    medir(d); return d;
  }
  function pararDesenho(salvar) {
    if (!desenhando) return;
    desenhando = false; camadaTemp.clearLayers();
    mapa.getContainer().classList.remove("cursor-desenho");
    setTimeout(() => mapa.doubleClickZoom.enable(), 250);
    const bt = $("btDesenharMapa"); if (bt) bt.classList.remove("on");
    const min = tipoDesenho === "poligono" ? 3 : 2;
    if (salvar && pontosTemp.length >= min && tipoDesenho !== "ponto") {
      const d = novoItem(tipoDesenho, pontosTemp.slice());
      desenhos.push(d); selId = d.id; salvarDesenhos(); abrirEstudioPainel();
    }
    pontosTemp = []; cursorTemp = null;
    atualizarFlag(); atualizarBarraFlutuante(); renderizarDesenhosNoMapa();
    if (App.ui.aberto && App.ui.aberto.tipo === "estudio") renderizarPainelEstudio(true);
  }
  function desenharPreviewTemp() {
    camadaTemp.clearLayers(); if (!pontosTemp.length) return;
    const pts = cursorTemp ? [...pontosTemp, cursorTemp] : pontosTemp;
    if (tipoDesenho === "poligono" && pts.length >= 3) L.polygon(pts, { pane: "desenhosPane", color: "#1e7b34", weight: 3, dashArray: "7 5", fillOpacity: .15, interactive: false }).addTo(camadaTemp);
    else L.polyline(pts, { pane: "desenhosPane", color: "#1e7b34", weight: 4, dashArray: "7 5", opacity: .9, interactive: false }).addTo(camadaTemp);
    pontosTemp.forEach((p, i) => L.circleMarker(p, { pane: "desenhosPane", radius: i === 0 ? 6 : 4.5, color: "#14532d", weight: 2, fillColor: i === 0 ? "#22c55e" : "#fff", fillOpacity: 1, interactive: false }).addTo(camadaTemp));
  }
  function salvarDesenhos(semSincronizar) {
    desenhos.forEach(medir);
    U.guardar("desenhos_mymaps", desenhos);
    if (!semSincronizar) Qgis.agendarGravacao();
  }
  function aoMudar(painel) {
    salvarDesenhos(); renderizarDesenhosNoMapa();
    if (painel && App.ui.aberto && App.ui.aberto.tipo === "estudio") renderizarPainelEstudio(true);
  }

  /* ---------- desenho no mapa ---------- */
  const iconePonto = (d, sel) => L.divIcon({ className: "pin", iconSize: [24, 32], iconAnchor: [12, 31], tooltipAnchor: [0, -26],
    html: `<svg width="24" height="32" viewBox="0 0 26 36"><path d="M13 1C6.4 1 1 6.3 1 12.9c0 8.6 10.4 20.6 11.2 21.5.4.5 1.2.5 1.6 0C14.6 33.5 25 21.5 25 12.9 25 6.3 19.6 1 13 1z" fill="${d.cor || "#d32f2f"}" stroke="${sel ? "#ffd400" : "#fff"}" stroke-width="${sel ? 3 : 1.6}"/><circle cx="13" cy="13" r="4.2" fill="#fff"/></svg>` });
  function dicaItem(d) {
    const linhas = [`<b>${U.esc(d.nome)}</b> · ${TIPOS[d.tipo]}${d.area ? ` · Área ${U.esc(d.area)}` : ""}`];
    if (d.tipo === "ponto") linhas.push(`${U.esc(d.categoria || "")}${d.patrulha ? " · " + U.esc(d.patrulha) : ""}${d.material ? " · " + U.esc(d.material) : ""}${d.status ? " · " + U.esc(d.status) : ""}`);
    else if (d.tipo === "poligono") linhas.push(`${U.fmt(d.areaHa || 0, 2)} ha · perímetro ${U.fmtKm(d.metros || 0)}${d.supervisor ? " · " + U.esc(d.supervisor) : ""}`);
    else linhas.push(`Extensão: <b>${U.fmtKm(d.metros || 0)}</b>`);
    if (d.obs) linhas.push(`<i>${U.esc(d.obs)}</i>`);
    linhas.push(`<small>Clique para editar</small>`);
    return linhas.join("<br>");
  }
  function selecionar(d) {
    if (desenhando || window.FERRAMENTA_ATIVA) return;
    selId = d.id; abrirEstudioPainel(); renderizarDesenhosNoMapa();
  }
  function renderizarDesenhosNoMapa() {
    camadaDesenhos.clearLayers(); camadaEdicao.clearLayers();
    if (!mostrarDesenhos) return;
    desenhos.filter(d => d.visivel !== false && d.coords && d.coords.length).forEach(d => {
      const sel = d.id === selId;
      if (d.tipo === "ponto") {
        const mk = L.marker(d.coords[0], { icon: iconePonto(d, sel), draggable: sel && !desenhando, zIndexOffset: sel ? 1800 : 600 });
        mk.bindTooltip(() => dicaItem(d), { className: "dica", direction: "top" });
        mk.on("click", () => selecionar(d));
        mk.on("dragend", ev => { const p = ev.target.getLatLng(); d.coords = [[p.lat, p.lng]]; aoMudar(true); });
        mk.addTo(camadaDesenhos);
        return;
      }
      const poli = d.tipo === "poligono";
      if (d.coords.length < (poli ? 3 : 2)) return;
      const Forma = poli ? L.polygon : L.polyline;
      if (!poli) Forma(d.coords, { pane: "desenhosPane", color: sel ? "#ffd400" : "#fff", weight: (d.espessura || 5) + (sel ? 5 : 3), opacity: .92, lineCap: "round", interactive: false }).addTo(camadaDesenhos);
      const f = Forma(d.coords, { pane: "desenhosPane", color: poli && sel ? "#b8860b" : (d.cor || "#1e7b34"), weight: d.espessura || (poli ? 3 : 5), opacity: 1, dashArray: d.tracejada ? "8 6" : null, lineCap: "round",
        fillColor: d.cor || "#1e7b34", fillOpacity: poli ? (sel ? .32 : .22) : 0 });
      f.bindTooltip(() => dicaItem(d), { sticky: true, className: "dica" });
      f.on("click", ev => { if (desenhando || window.FERRAMENTA_ATIVA) return; L.DomEvent.stopPropagation(ev); selecionar(d); });
      f.addTo(camadaDesenhos);
      if (sel && !desenhando) desenharVertices(d, poli);
    });
  }
  function desenharVertices(d, fechado) {
    const n = d.coords.length;
    d.coords.forEach((pt, idx) => {
      const mk = L.marker(pt, { draggable: true, zIndexOffset: 1500, icon: L.divIcon({ className: "vertice-mymaps", iconSize: [14, 14], iconAnchor: [7, 7],
        html: `<div class="v-bola ${!fechado && idx === 0 ? "ini" : !fechado && idx === n - 1 ? "fim" : ""}" title="Arraste para mover · botão direito apaga"></div>` }) });
      mk.on("drag", ev => { const p = ev.target.getLatLng(); d.coords[idx] = [p.lat, p.lng]; });
      mk.on("dragend", ev => { d.coords[idx] = ajustarPontoNaRua(ev.target.getLatLng()); aoMudar(true); });
      mk.on("contextmenu", ev => { L.DomEvent.stopPropagation(ev); if (n <= (fechado ? 3 : 2)) return; d.coords.splice(idx, 1); aoMudar(true); });
      mk.addTo(camadaEdicao);
      if (idx < n - 1 || fechado) {
        const q = d.coords[(idx + 1) % n], meio = [(pt[0] + q[0]) / 2, (pt[1] + q[1]) / 2];
        const mm = L.marker(meio, { draggable: true, zIndexOffset: 1400, icon: L.divIcon({ className: "vertice-meio-mymaps", iconSize: [12, 12], iconAnchor: [6, 6], html: `<div class="v-meio" title="Arraste ou clique para criar uma curva">+</div>` }) });
        const inserir = ll => { d.coords.splice(idx + 1, 0, ajustarPontoNaRua(ll)); aoMudar(true); };
        mm.on("click", ev => { L.DomEvent.stopPropagation(ev); inserir(ev.target.getLatLng()); });
        mm.on("dragend", ev => inserir(ev.target.getLatLng()));
        mm.addTo(camadaEdicao);
      }
    });
  }

  /* ---------- eventos do mapa ---------- */
  function ligarEventosMapa() {
    mapa.on("click", ev => {
      if (modoPegman) { abrirStreetView(ev.latlng.lat, ev.latlng.lng); return; }
      if (!desenhando) return;
      if (tipoDesenho === "ponto") {
        const d = novoItem("ponto", [[ev.latlng.lat, ev.latlng.lng]]);
        desenhos.push(d); selId = d.id; desenhando = false; pontosTemp = [];
        mapa.getContainer().classList.remove("cursor-desenho");
        const bt = $("btDesenharMapa"); if (bt) bt.classList.remove("on");
        atualizarFlag(); atualizarBarraFlutuante(); salvarDesenhos(); renderizarDesenhosNoMapa(); abrirEstudioPainel();
        return;
      }
      pontosTemp.push(ajustarPontoNaRua(ev.latlng));
      desenharPreviewTemp(); atualizarBarraFlutuante();
    });
    mapa.on("mousemove", ev => { if (!desenhando || !pontosTemp.length || tipoDesenho === "ponto") return; cursorTemp = ajustarPontoNaRua(ev.latlng); desenharPreviewTemp(); atualizarBarraFlutuante(); });
    mapa.on("dblclick", ev => { if (desenhando) { L.DomEvent.stopPropagation(ev); pararDesenho(true); } });
    window.addEventListener("keydown", ev => {
      const t = ev.target && ev.target.tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (ev.key === "Escape") { if (desenhando) pararDesenho(false); if (modoPegman) alternarModoPegman(false); }
      else if (ev.key === "Enter" && desenhando) pararDesenho(true);
      else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z" && desenhando) { ev.preventDefault(); desfazerUltimoPonto(); }
    });
  }

  /* ============================================================================ PAINEL */
  function abrirEstudioPainel() { App.abrirPersonalizado("estudio", renderizarPainelEstudio); }

  const opcoes = (lista, atual) => lista.map(o => `<option ${String(atual) === o ? "selected" : ""}>${U.esc(o)}</option>`).join("");
  const selArea = atual => `<select id="edArea" class="ed-sel"><option value="">Sem área</option>${CFG.areasPadrao.map(a => `<option value="${a.area}" ${String(atual) === String(a.area) ? "selected" : ""}>Área ${a.area} · ${U.esc(a.supervisor)}</option>`).join("")}${atual && !CFG.areasPadrao.some(a => String(a.area) === String(atual)) ? `<option selected value="${U.esc(atual)}">${U.esc(atual)}</option>` : ""}</select>`;

  function htmlEditor(d) {
    const cab = `<div class="linha" style="justify-content:space-between;margin-bottom:8px">
        <h2 style="margin:0;color:var(--verde-esc)">${TIPOS[d.tipo]}: ${U.esc(d.nome)}</h2>
        <span class="chip coletado">${d.tipo === "ponto" ? U.esc(d.categoria || "Ponto") : d.tipo === "poligono" ? U.fmt(d.areaHa || 0, 2) + " ha" : U.fmtKm(d.metros || 0)}</span></div>`;
    const nome = `<label class="campo" style="margin-top:0">${d.tipo === "ponto" ? "Código / nome do ponto" : d.tipo === "poligono" ? "Nome da área / setor" : "Nome da rota"}
        <input type="text" id="edNome" value="${U.esc(d.nome)}"></label>`;
    let campos = "";
    if (d.tipo === "ponto") {
      campos = `<div class="datas"><label>Tipo<select id="edCategoria" class="ed-sel">${opcoes(CATEGORIAS.includes(d.categoria) ? CATEGORIAS : [...CATEGORIAS, d.categoria], d.categoria)}</select></label><label>Área${selArea(d.area)}</label></div>
        <div class="datas"><label>Patrulha<select id="edPatrulha" class="ed-sel">${opcoes(PATRULHAS, d.patrulha)}</select></label><label>Material<select id="edMaterial" class="ed-sel">${opcoes(MATERIAIS.includes(d.material) ? MATERIAIS : [...MATERIAIS, d.material], d.material)}</select></label></div>
        <div class="datas"><label>Situação<select id="edStatus" class="ed-sel">${opcoes(STATUS.includes(d.status) ? STATUS : [...STATUS, d.status], d.status)}</select></label><label>Coordenadas<input type="text" readonly value="${d.coords[0][0].toFixed(6)}, ${d.coords[0][1].toFixed(6)}"></label></div>`;
    } else if (d.tipo === "poligono") {
      campos = `<div class="datas"><label>Nº da área${selArea(d.area)}</label><label>Supervisor / responsável<input type="text" id="edSup" value="${U.esc(d.supervisor || "")}"></label></div>
        <div class="datas"><label>Recorrência / frequência<input type="text" id="edFreq" value="${U.esc(d.frequencia || "")}" placeholder="Ex.: 28 dias"></label><label>Contorno<select id="edEsp" class="ed-sel">${[2, 3, 5].map(w => `<option value="${w}" ${(d.espessura || 3) === w ? "selected" : ""}>${w === 2 ? "Fino" : w === 3 ? "Médio" : "Grosso"}</option>`).join("")}</select></label></div>
        <p class="nota">Área: <b>${U.fmt(d.areaHa || 0, 2)} ha</b> (${U.fmt((d.areaHa || 0) / 100, 3)} km²) · perímetro <b>${U.fmtKm(d.metros || 0)}</b></p>`;
    } else {
      campos = `<div class="datas"><label>Área${selArea(d.area)}</label><label>Espessura e estilo<div style="display:flex;gap:6px">
          <select id="edEsp" class="ed-sel" style="flex:1">${[3, 5, 7, 9].map(w => `<option value="${w}" ${(d.espessura || 5) === w ? "selected" : ""}>${w === 3 ? "Fina" : w === 5 ? "Média" : w === 7 ? "Grossa" : "Muito grossa"}</option>`).join("")}</select>
          <select id="edTrac" class="ed-sel" style="flex:1"><option value="0" ${!d.tracejada ? "selected" : ""}>Contínua</option><option value="1" ${d.tracejada ? "selected" : ""}>Tracejada</option></select></div></label></div>`;
    }
    const cor = `<div class="rotulo">Cor</div><div class="paleta-mymaps" id="paletaCores">${CORES.map(c => `<button type="button" class="cor-amostra ${d.cor === c ? "on" : ""}" data-cor="${c}" style="background:${c}" title="${c}"></button>`).join("")}<input type="color" id="edCorLivre" value="${U.esc(d.cor || "#1e7b34")}" title="Outra cor"></div>`;
    const obs = `<label class="campo">Observação<input type="text" id="edObs" value="${U.esc(d.obs || "")}"></label>`;
    const dica = d.tipo === "ponto" ? `Arraste o ponto no mapa para mudar o lugar.` : `No mapa: arraste as bolinhas para ajustar, clique no <b>+</b> para criar uma curva e use o botão direito numa bolinha para apagá-la.`;
    const botoes = `<div class="linha botoes" style="margin-top:10px">
        <button type="button" class="sec" id="btZoomItem">Centralizar</button>
        ${d.tipo === "linha" ? `<button type="button" class="sec" id="btContinuarLinha">Continuar a linha</button><button type="button" class="sec" id="btInverterLinha">Inverter</button>` : ""}
        ${d.tipo === "ponto" ? `<button type="button" class="sec" id="btSvItem">Street View</button>` : ""}
        <button type="button" class="sec" id="btDuplicarItem">Duplicar</button>
        <button type="button" class="sec" id="btExcluirItem" style="color:var(--vermelho);border-color:#f5c2c7">Excluir</button></div>`;
    return `<div class="bloco estudio-editor">${cab}<p class="nota" style="margin:0 0 8px">${dica}</p>${nome}${campos}${cor}${obs}${botoes}</div>`;
  }

  function renderizarPainelEstudio(manterScroll) {
    const atual = desenhos.find(d => d.id === selId) || null;
    const ativos = desenhos.filter(d => d.visivel !== false);
    const tot = t => desenhos.filter(d => d.tipo === t).length;
    const kmLinhas = ativos.filter(d => d.tipo === "linha").reduce((s, d) => s + (d.metros || 0), 0);
    const haAreas = ativos.filter(d => d.tipo === "poligono").reduce((s, d) => s + (d.areaHa || 0), 0);
    const meta = CFG.metaEquipeMDia || 1950;
    const lista = desenhos.filter(d => !filtroLista || d.tipo === filtroLista);
    const temItens = desenhos.length > 0;
    const html = `
      <div class="det-cab" style="padding-bottom:12px">
        <div class="tipo">Planejamento</div>
        <h3>Planejar / Desenhar Rotas</h3>
        <div class="sub">Escolha o que desenhar e clique no mapa.</div>
        ${desenhando ? `<div class="linha botoes" style="margin-top:10px">
            ${tipoDesenho !== "ponto" ? `<button type="button" id="btPainelConcluir" ${pontosTemp.length >= (tipoDesenho === "poligono" ? 3 : 2) ? "" : "disabled"}>Concluir (${pontosTemp.length} ponto${pontosTemp.length === 1 ? "" : "s"})</button>` : ""}
            <button type="button" class="sec" id="btPainelCancelar">Cancelar</button></div>`
          : `<div class="abas-estudio">
            <button type="button" data-novo="linha">${ICO.rota}<span>Nova linha / rota</span></button>
            <button type="button" data-novo="poligono">${ICO.camadas}<span>Nova área / setor</span></button>
            <button type="button" data-novo="ponto"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s7-7.4 7-12.5A7 7 0 0 0 5 9.5C5 14.6 12 22 12 22z"/><circle cx="12" cy="9.5" r="2.5"/></svg><span>Novo ponto</span></button></div>`}
        <div style="margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px">
          <label class="ckline"><input type="checkbox" id="ckSnapEstudio" ${snapRua ? "checked" : ""}> Ímã de rua (puxa para o eixo da rua)</label>
          <label class="ckline"><input type="checkbox" id="ckVerDesenhos" ${mostrarDesenhos ? "checked" : ""}> Mostrar o planejamento no mapa</label>
        </div>
      </div>
      <div class="bloco"><div class="grade">
        <div><small>Linhas / rotas</small><span><b>${tot("linha")}</b> · ${U.fmtKm(kmLinhas)}</span></div>
        <div><small>Áreas / setores</small><span><b>${tot("poligono")}</b> · ${U.fmt(haAreas, 1)} ha</span></div>
        <div><small>Pontos</small><span><b>${tot("ponto")}</b></span></div>
        <div><small>Capina das linhas</small><span>${U.fmt(kmLinhas / meta, 1)} equipes por dia</span></div>
      </div></div>
      ${atual ? htmlEditor(atual) : ""}
      <div class="bloco">
        <div class="linha" style="justify-content:space-between;margin-bottom:6px">
          <h2 style="margin:0">Itens do planejamento (${desenhos.length})</h2>
          ${temItens ? `<button type="button" class="link-rodape" id="btLimparTudo" style="color:var(--vermelho)">Apagar tudo</button>` : ""}
        </div>
        ${temItens ? `<div class="seg" style="margin-bottom:6px">
            <button type="button" data-filtro-tipo="" class="${!filtroLista ? "on" : ""}">Todos</button>
            <button type="button" data-filtro-tipo="linha" class="${filtroLista === "linha" ? "on" : ""}">Linhas</button>
            <button type="button" data-filtro-tipo="poligono" class="${filtroLista === "poligono" ? "on" : ""}">Áreas</button>
            <button type="button" data-filtro-tipo="ponto" class="${filtroLista === "ponto" ? "on" : ""}">Pontos</button></div>
          <div class="lista">${lista.map(d => `
            <div class="item-rota-mymaps ${d.id === selId ? "sel" : ""}">
              <button type="button" class="bt-vis-rota" data-vis-id="${U.esc(d.id)}" title="${d.visivel === false ? "Mostrar no mapa" : "Esconder no mapa"}">${d.visivel === false ? "Oculto" : "Visível"}</button>
              <span class="cor-barra-rota" style="background:${d.cor || "#1e7b34"}"></span>
              <div class="nm" style="cursor:pointer" data-sel-id="${U.esc(d.id)}"><b>${U.esc(d.nome)}</b>${d.area ? ` · <small>Área ${U.esc(d.area)}</small>` : ""}
                <br><small style="color:var(--cinza)">${TIPOS[d.tipo]}${d.tipo === "ponto" ? " · " + U.esc(d.categoria || "") : ""}${d.obs ? " · " + U.esc(d.obs) : ""}</small></div>
              <b style="font-size:12px;color:var(--verde-esc);cursor:pointer;white-space:nowrap" data-sel-id="${U.esc(d.id)}">${d.tipo === "ponto" ? "" : d.tipo === "poligono" ? U.fmt(d.areaHa || 0, 1) + " ha" : U.fmtKm(d.metros || 0)}</b>
            </div>`).join("") || `<p class="nota">Nada deste tipo.</p>`}</div>`
          : `<p class="nota">Nenhum item ainda. Escolha acima "Nova linha", "Nova área" ou "Novo ponto" e clique no mapa.</p>`}
      </div>
      <div class="bloco">
        <h2>Exportar o planejamento</h2>
        <div class="linha botoes" style="margin-top:4px">
          ${["kml", "kmz", "dxf", "geojson", "xlsx"].map(f => `<button type="button" class="sec" data-exp-des="${f}" ${temItens ? "" : "disabled"}>${{ kml: "KML", kmz: "KMZ", dxf: "DXF (CAD)", geojson: "GeoJSON (QGIS)", xlsx: "Excel" }[f]}</button>`).join("")}
        </div>
        <p class="nota">Para exportar junto com as áreas, ruas lançadas e pontos críticos, use "Exportar dados atuais" no painel principal.</p>
        <div class="linha" style="margin-top:10px">
          <button type="button" class="sec" id="btImportarDesenho" style="width:100%">Trazer arquivo para editar aqui (KML, KMZ, GeoJSON, shapefile .zip)</button>
          <input type="file" id="inImportarDesenho" accept=".kml,.kmz,.geojson,.json,.zip" hidden>
        </div>
      </div>
      ${R.sincronizarQgis !== false ? Qgis.htmlBloco() : ""}`;
    Painel.mostrarPersonalizado(html, manterScroll);
    ligarEventosPainel(atual);
  }

  function ligarEventosPainel(atual) {
    document.querySelectorAll("[data-novo]").forEach(b => b.onclick = () => iniciarDesenho(b.dataset.novo));
    if ($("btPainelConcluir")) $("btPainelConcluir").onclick = () => pararDesenho(true);
    if ($("btPainelCancelar")) $("btPainelCancelar").onclick = () => pararDesenho(false);
    if ($("ckSnapEstudio")) $("ckSnapEstudio").onchange = ev => { snapRua = ev.target.checked; atualizarBarraFlutuante(); };
    if ($("ckVerDesenhos")) $("ckVerDesenhos").onchange = ev => { mostrarDesenhos = ev.target.checked; renderizarDesenhosNoMapa(); };
    document.querySelectorAll("[data-filtro-tipo]").forEach(b => b.onclick = () => { filtroLista = b.dataset.filtroTipo; renderizarPainelEstudio(true); });

    if (atual) {
      const campoTexto = (id, k) => { const el = $(id); if (el) el.oninput = ev => { atual[k] = ev.target.value; salvarDesenhos(); renderizarDesenhosNoMapa(); }; };
      const campoSel = (id, k, conv) => { const el = $(id); if (el) el.onchange = ev => { atual[k] = conv ? conv(ev.target.value) : ev.target.value; aoMudar(true); }; };
      campoTexto("edNome", "nome"); campoTexto("edObs", "obs"); campoTexto("edSup", "supervisor"); campoTexto("edFreq", "frequencia");
      campoSel("edArea", "area", v => v ? (isNaN(+v) ? v : +v) : "");
      campoSel("edEsp", "espessura", v => +v); campoSel("edTrac", "tracejada", v => v === "1");
      campoSel("edCategoria", "categoria"); campoSel("edPatrulha", "patrulha"); campoSel("edMaterial", "material"); campoSel("edStatus", "status");
      document.querySelectorAll("#paletaCores .cor-amostra").forEach(bt => bt.onclick = () => { atual.cor = bt.dataset.cor; aoMudar(true); });
      if ($("edCorLivre")) $("edCorLivre").oninput = ev => { atual.cor = ev.target.value; salvarDesenhos(); renderizarDesenhosNoMapa(); };
      $("btZoomItem").onclick = () => centralizar(atual);
      if ($("btSvItem")) $("btSvItem").onclick = () => abrirStreetView(atual.coords[0][0], atual.coords[0][1], atual.nome);
      if ($("btContinuarLinha")) $("btContinuarLinha").onclick = () => {
        iniciarDesenho("linha"); pontosTemp = atual.coords.slice();
        desenhos = desenhos.filter(d => d.id !== atual.id); selId = null;
        renderizarDesenhosNoMapa(); desenharPreviewTemp(); atualizarBarraFlutuante(); renderizarPainelEstudio(true);
      };
      if ($("btInverterLinha")) $("btInverterLinha").onclick = () => { atual.coords.reverse(); aoMudar(true); };
      $("btDuplicarItem").onclick = () => { const c = { ...atual, id: "item_" + Date.now(), nome: atual.nome + " (cópia)", coords: atual.coords.map(p => [p[0] + .0002, p[1] + .0002]) }; desenhos.push(c); selId = c.id; aoMudar(true); };
      $("btExcluirItem").onclick = () => { if (!confirm(`Excluir "${atual.nome}"?`)) return; desenhos = desenhos.filter(d => d.id !== atual.id); selId = null; aoMudar(true); };
    }
    document.querySelectorAll("[data-sel-id]").forEach(el => el.onclick = () => { selId = el.dataset.selId; const d = desenhos.find(x => x.id === selId); if (d) centralizar(d); renderizarDesenhosNoMapa(); renderizarPainelEstudio(true); });
    document.querySelectorAll("[data-vis-id]").forEach(bt => bt.onclick = ev => { ev.stopPropagation(); const d = desenhos.find(x => x.id === bt.dataset.visId); if (d) { d.visivel = d.visivel === false; aoMudar(true); } });
    if ($("btLimparTudo")) $("btLimparTudo").onclick = () => { if (!confirm("Apagar todos os itens do planejamento? Esta ação não pode ser desfeita.")) return; desenhos = []; selId = null; aoMudar(true); };
    document.querySelectorAll("[data-exp-des]").forEach(bt => bt.onclick = () => Exportar.exportarDesenhos(bt.dataset.expDes, desenhos));
    const btImp = $("btImportarDesenho"), inImp = $("inImportarDesenho");
    if (btImp && inImp) { btImp.onclick = () => inImp.click(); inImp.onchange = async ev => { const f = ev.target.files[0]; if (!f) return; await importarArquivo(f); inImp.value = ""; }; }
    Qgis.ligarBloco();
  }
  function centralizar(d) {
    if (!d.coords || !d.coords.length) return;
    if (d.tipo === "ponto") mapa.setView(d.coords[0], Math.max(mapa.getZoom(), 17));
    else mapa.fitBounds(L.polyline(d.coords).getBounds(), { padding: [60, 60] });
  }

  /* ---------- trazer arquivo para dentro do planejamento (fica editável) ---------- */
  function feicoesParaItens(feicoes, nomeArq) {
    const itens = [];
    const pega = (p, ...ks) => { for (const k of ks) { const kk = Object.keys(p || {}).find(x => U.norm(x) === U.norm(k)); if (kk && p[kk] !== "" && p[kk] != null) return p[kk]; } return ""; };
    feicoes.forEach((f, i) => {
      const p = f.props || {}, est = f.estilo || {};
      const base = {
        nome: String(pega(p, "nome", "name", "Nome", "codigo", "id") || (nomeArq + " " + (i + 1))),
        area: pega(p, "area", "Areas_Nova", "area_num"), obs: String(pega(p, "observacao", "obs", "Descrição", "description") || ""),
        cor: pega(p, "cor") || est.cor, espessura: +pega(p, "espessura") || undefined, tracejada: /^(1|true|sim)$/i.test(String(pega(p, "tracejada"))),
        categoria: pega(p, "categoria", "tipo_ponto") || undefined, patrulha: pega(p, "patrulha") || undefined, material: pega(p, "material") || undefined,
        status: pega(p, "status", "situacao") || undefined, supervisor: pega(p, "supervisor") || undefined, frequencia: pega(p, "frequencia", "recorrencia") || undefined
      };
      Object.keys(base).forEach(k => base[k] === undefined && delete base[k]);
      if (f.tipo === "ponto") itens.push(novoItem("ponto", [f.ll], base));
      else if (f.tipo === "linha") f.partes.forEach(pt => pt.length >= 2 && itens.push(novoItem("linha", pt, base)));
      else if (f.tipo === "poligono") f.polys.forEach(pg => pg[0] && pg[0].length >= 3 && itens.push(novoItem("poligono", tirarFechamento(pg[0]), base)));
    });
    return itens;
  }
  const tirarFechamento = a => (a.length > 3 && a[0][0] === a[a.length - 1][0] && a[0][1] === a[a.length - 1][1]) ? a.slice(0, -1) : a.slice();
  async function importarArquivo(arquivo) {
    try {
      const camadas = await ImportarGeo.lerArquivo(arquivo);
      const itens = [].concat(...camadas.map(c => feicoesParaItens(c.feicoes, c.nome)));
      if (!itens.length) { alert("Nenhuma linha, área ou ponto encontrado no arquivo."); return; }
      adicionarItens(itens);
    } catch (e) { alert("Não foi possível abrir o arquivo: " + e.message); }
  }
  function adicionarItens(itens) {
    desenhos.push(...itens); selId = itens[itens.length - 1].id; salvarDesenhos(); renderizarDesenhosNoMapa();
    const grupo = L.featureGroup(itens.map(d => d.tipo === "ponto" ? L.marker(d.coords[0]) : L.polyline(d.coords)));
    if (grupo.getLayers().length) mapa.fitBounds(grupo.getBounds(), { padding: [40, 40] });
    abrirEstudioPainel();
  }

  /* ---------- GeoJSON do planejamento (usado na exportação e na ligação com o QGIS) ---------- */
  const CAMPOS = ["id", "tipo", "nome", "area", "cor", "espessura", "tracejada", "obs", "categoria", "patrulha", "material", "status", "supervisor", "frequencia"];
  function paraGeojson(lista) {
    // o arquivo sai em SIRGAS 2000 / UTM 22S (EPSG:31982), o mesmo sistema do projeto do QGIS
    return { type: "FeatureCollection", name: "planejamento_site", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::31982" } }, features: (lista || desenhos).map(d => {
      const props = {}; CAMPOS.forEach(k => props[k] = d[k] === undefined ? null : d[k]);
      props.extensao_m = d.tipo === "linha" ? Math.round(d.metros || 0) : null;
      props.area_ha = d.tipo === "poligono" ? +((d.areaHa || 0).toFixed(3)) : null;
      props.perimetro_m = d.tipo === "poligono" ? Math.round(d.metros || 0) : null;
      const xy = p => Exportar.utm22s(p[0], p[1]).map(v => +v.toFixed(3));
      const geometry = d.tipo === "ponto" ? { type: "Point", coordinates: xy(d.coords[0]) }
        : d.tipo === "poligono" ? { type: "Polygon", coordinates: [[...d.coords, d.coords[0]].map(xy)] }
        : { type: "LineString", coordinates: d.coords.map(xy) };
      return { type: "Feature", properties: props, geometry };
    }) };
  }
  function deGeojson(gj) {
    const out = [];
    // aceita o arquivo em SIRGAS 2000 / UTM 22S (EPSG:31982) ou em graus (EPSG:4326 / 4674)
    const crs = String((gj.crs && gj.crs.properties && gj.crs.properties.name) || "");
    const m = crs.match(/EPSG:*(\d+)/i), epsg = m ? +m[1] : null;
    const prim = (gj.features || []).find(f => f.geometry && f.geometry.coordinates);
    let amostra = prim && prim.geometry.coordinates; while (Array.isArray(amostra) && Array.isArray(amostra[0])) amostra = amostra[0];
    const emMetros = epsg ? (epsg >= 31965 && epsg <= 31985) || (epsg > 32600 && epsg < 32800) : !!(amostra && Math.abs(amostra[0]) > 400);
    const zona = epsg && epsg >= 31977 && epsg <= 31985 ? epsg - 31977 + 17 : epsg > 32700 ? epsg - 32700 : 22;
    const ll = emMetros ? c => ImportarGeo.utmParaLatLon(c[0], c[1], -183 + 6 * zona, 10000000) : c => [c[1], c[0]];
    (gj.features || []).forEach((f, i) => {
      const g = f.geometry, p = f.properties || {}; if (!g) return;
      const base = {}; CAMPOS.forEach(k => { if (p[k] != null && p[k] !== "") base[k] = p[k]; });
      if (base.tracejada != null) base.tracejada = base.tracejada === true || /^(1|true|sim)$/i.test(String(base.tracejada));
      if (base.espessura != null) base.espessura = +base.espessura || 5;
      const add = (tipo, coords) => { const d = novoItem(tipo, coords, base); if (base.id && !out.some(x => x.id === base.id)) d.id = base.id; else if (!base.id) d.id = "qgis_" + i + "_" + out.length; out.push(d); };
      if (g.type === "Point") add("ponto", [ll(g.coordinates)]);
      else if (g.type === "MultiPoint") g.coordinates.forEach(c => add("ponto", [ll(c)]));
      else if (g.type === "LineString") add("linha", g.coordinates.map(ll));
      else if (g.type === "MultiLineString") g.coordinates.forEach(l => add("linha", l.map(ll)));
      else if (g.type === "Polygon") add("poligono", tirarFechamento(g.coordinates[0].map(ll)));
      else if (g.type === "MultiPolygon") g.coordinates.forEach(pg => add("poligono", tirarFechamento(pg[0].map(ll))));
    });
    return out;
  }

  /* ============================================================================ LIGAÇÃO COM O QGIS (arquivo .geojson compartilhado) */
  const Qgis = (() => {
    let handle = null, permitido = false, ultimaGravacao = 0, ultimoLido = 0, timerGrava = null, timerLe = null, estado = "";
    const suportado = () => typeof window.showSaveFilePicker === "function";
    async function iniciar() {
      if (R.sincronizarQgis === false || !suportado()) return;
      handle = await U.lerArq("qgis_geojson");
      if (handle && handle.queryPermission) { permitido = (await handle.queryPermission({ mode: "readwrite" })) === "granted"; if (permitido) comecarLeitura(); }
    }
    async function escolher(novo) {
      try {
        if (novo) handle = await showSaveFilePicker({ suggestedName: "planejamento_site.geojson", types: [{ description: "GeoJSON", accept: { "application/geo+json": [".geojson"] } }] });
        else [handle] = await showOpenFilePicker({ types: [{ description: "GeoJSON", accept: { "application/geo+json": [".geojson", ".json"] } }] });
        await U.salvarArq("qgis_geojson", handle);
        permitido = (await handle.requestPermission({ mode: "readwrite" })) === "granted";
        if (!permitido) return;
        if (novo) await gravar(); else await ler(true);
        comecarLeitura(); estado = "Ligado"; renderizarSeAberto();
      } catch (e) { if (e.name !== "AbortError") alert("Não foi possível usar o arquivo: " + e.message); }
    }
    async function reconectar() { if (!handle) return; permitido = (await handle.requestPermission({ mode: "readwrite" })) === "granted"; if (permitido) { await ler(true); comecarLeitura(); } renderizarSeAberto(); }
    function desligar() { clearInterval(timerLe); timerLe = null; handle = null; permitido = false; U.salvarArq("qgis_geojson", null); renderizarSeAberto(); }
    function agendarGravacao() { if (!handle || !permitido) return; clearTimeout(timerGrava); timerGrava = setTimeout(gravar, 700); }
    async function gravar() {
      if (!handle || !permitido) return;
      try { const w = await handle.createWritable(); await w.write(JSON.stringify(paraGeojson(), null, 1)); await w.close();
        const f = await handle.getFile(); ultimaGravacao = f.lastModified; ultimoLido = f.lastModified; estado = "Gravado às " + new Date().toLocaleTimeString("pt-BR"); atualizarEstado();
      } catch (e) { estado = "Não gravou: " + e.message; atualizarEstado(); }
    }
    async function ler(forcar) {
      if (!handle || !permitido) return;
      try {
        const f = await handle.getFile();
        if (!forcar && f.lastModified <= ultimoLido) return;
        ultimoLido = f.lastModified;
        const txt = await f.text(); if (!txt.trim()) return;
        const novos = deGeojson(JSON.parse(txt));
        desenhos = novos; if (!desenhos.some(d => d.id === selId)) selId = null;
        salvarDesenhos(true); renderizarDesenhosNoMapa();
        estado = "Atualizado do QGIS às " + new Date().toLocaleTimeString("pt-BR");
        if (App.ui.aberto && App.ui.aberto.tipo === "estudio") renderizarPainelEstudio(true);
      } catch (e) { /* arquivo sendo gravado pelo QGIS: tenta de novo na próxima leitura */ }
    }
    function comecarLeitura() { clearInterval(timerLe); timerLe = setInterval(() => ler(false), 2500); }
    function renderizarSeAberto() { if (App.ui.aberto && App.ui.aberto.tipo === "estudio") renderizarPainelEstudio(true); }
    function atualizarEstado() { const el = $("qgisEstado"); if (el) el.textContent = estado; }
    function htmlBloco() {
      if (!suportado()) return `<div class="bloco"><h2>Acompanhar no QGIS</h2><p class="nota">Abra o site no Chrome ou no Edge do computador para ligar o planejamento a um arquivo do QGIS. Enquanto isso, use o botão "GeoJSON (QGIS)" acima.</p></div>`;
      const nome = handle ? handle.name : "";
      return `<div class="bloco"><h2>Acompanhar no QGIS</h2>
        ${handle && permitido ? `<p class="nota" style="margin-top:0">Ligado ao arquivo <b>${U.esc(nome)}</b>. Tudo que mudar aqui vai para o arquivo, e o que for editado e salvo no QGIS aparece aqui em poucos segundos.</p>
            <p class="nota"><span id="qgisEstado">${U.esc(estado)}</span></p>
            <div class="linha botoes"><button type="button" class="sec" id="btQgisGravar">Gravar agora</button><button type="button" class="sec" id="btQgisLer">Ler agora</button><button type="button" class="sec" id="btQgisDesligar">Desligar</button></div>`
        : handle ? `<p class="nota" style="margin-top:0">Arquivo <b>${U.esc(nome)}</b> já escolhido. O navegador pede para confirmar o acesso de novo.</p><div class="linha botoes"><button type="button" id="btQgisReconectar">Reconectar</button><button type="button" class="sec" id="btQgisDesligar">Esquecer arquivo</button></div>`
        : `<p class="nota" style="margin-top:0">Crie um arquivo .geojson e abra o mesmo arquivo no QGIS (Camada &gt; Adicionar camada vetorial). O site grava nele a cada mudança e lê o que for salvo no QGIS.</p>
            <div class="linha botoes"><button type="button" id="btQgisNovo">Criar arquivo e ligar</button><button type="button" class="sec" id="btQgisAbrir">Usar um arquivo que já existe</button></div>`}
      </div>`;
    }
    function ligarBloco() {
      const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
      on("btQgisNovo", () => escolher(true)); on("btQgisAbrir", () => escolher(false)); on("btQgisReconectar", reconectar);
      on("btQgisDesligar", desligar); on("btQgisGravar", gravar); on("btQgisLer", () => ler(true));
    }
    return { iniciar, agendarGravacao, htmlBloco, ligarBloco };
  })();

  return {
    init, abrirStreetView, fecharStreetView, alternarModoPegman, abrirEstudioPainel, iniciarDesenho,
    iniciarDesenhoNovaLinha: () => iniciarDesenho("linha"), renderizarDesenhosNoMapa, pararTudo, atualizarFlag,
    adicionarItens, feicoesParaItens, novoItem, paraGeojson, deGeojson, comprLinha, areaM2, distMetros,
    get desenhos() { return desenhos; }
  };
})();
if (typeof window !== "undefined") window.FerramentasMapa = FerramentasMapa;
