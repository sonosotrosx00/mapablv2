/* Mapa: camadas, cores, filtros de pontos/equipes e legenda clicável interativa. */
const Mapa = (() => {
  const GEO = DADOS_GEO, C = CFG.cores;
  let mapa, cb = {};
  const L_ = {};   // camadas
  const poligonos = {}, rotulos = {}, marcadores = {}, linhasRota = {};
  let ultimo = null;   // último resultado desenhado (para dicas)

  const svgPin = (cor, txt, tam = 1, selo = null) => {
    const w = Math.round(26 * tam), h = Math.round(36 * tam), claro = (() => { const n = parseInt(cor.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 170; })();
    const s = !selo ? "" : selo === "coletado"
      ? `<circle cx="20.5" cy="6" r="5.6" fill="${C.status.coletado}" stroke="#fff" stroke-width="1.4"/><path d="M17.8 6.1l1.8 1.8 3.4-3.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<circle cx="20.5" cy="6" r="5.6" fill="${C.status.nao}" stroke="#fff" stroke-width="1.4"/><path d="M18.4 3.9l4.2 4.2M22.6 3.9l-4.2 4.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`;
    return `<svg width="${w}" height="${h}" viewBox="0 0 26 36"><path d="M13 1C6.4 1 1 6.3 1 12.9c0 8.6 10.4 20.6 11.2 21.5.4.5 1.2.5 1.6 0C14.6 33.5 25 21.5 25 12.9 25 6.3 19.6 1 13 1z" fill="${cor}" stroke="#fff" stroke-width="1.6"/><text x="13" y="16.6" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="${String(txt).length > 2 ? 9.5 : 11}" font-weight="700" fill="${claro ? "#1f2a24" : "#fff"}">${txt}</text>${s}</svg>`;
  };
  const corFaixa = p => C.faixas.find(f => p >= f.min).cor;
  function centro(rings) {
    const a2 = r => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[1] * q[0] - q[1] * p[0]; }, 0));
    const anel = rings.reduce((a, b) => a2(b) > a2(a) ? b : a); let A = 0, cx = 0, cy = 0;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) { const [y0, x0] = anel[j], [y1, x1] = anel[i], f = x0 * y1 - x1 * y0; A += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f; }
    A *= .5; return [cy / (6 * A), cx / (6 * A)];
  }

  function init(callbacks) {
    cb = callbacks;
    mapa = L.map("mapa", { zoomControl: true });
    const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/";
    const ruas = L.tileLayer(esri + "World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Mapa base &copy; Esri" }).addTo(mapa);
    const sat = L.tileLayer(esri + "World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagem &copy; Esri" });
    L.control.layers({ "Ruas": ruas, "Satélite": sat }, null, { position: "topleft" }).addTo(mapa);
    [["faltam", 440, true], ["linhas", 450, false], ["destaque", 460, true]].forEach(([n, z, semClique]) => { mapa.createPane(n).style.zIndex = z; if (semClique) mapa.getPane(n).style.pointerEvents = "none"; });
    L_.rendFaltam = L.canvas({ pane: "faltam", padding: .3 });
    L_.rendLinhas = L.svg({ pane: "linhas", padding: .3 });
    L_.rendDestaque = L.svg({ pane: "destaque" });
    ["areas", "rotulos", "faltam", "exec", "tempo", "pontos", "destaque"].forEach(k => L_[k] = L.layerGroup().addTo(mapa));
    L_.rotas = L.layerGroup();

    GEO.areas.forEach(a => {
      const pol = L.polygon(a.polys, { color: "#3d4a42", weight: 1.5, fillOpacity: .6 }).addTo(L_.areas);
      pol.bindTooltip(() => dicaArea(a.area), { sticky: true, className: "dica", direction: "top", offset: [0, -8] });
      pol.on("click", () => cb.area(a.area));
      poligonos[a.area] = pol;
      rotulos[a.area] = L.tooltip({ permanent: true, direction: "center", className: "rotulo-area", interactive: false }).setLatLng(centro(a.rings)).setContent("").addTo(L_.rotulos);
    });
    GEO.rotas.forEach(r => { linhasRota[r.area] = L.polyline(r.coords, { renderer: L_.rendLinhas, color: C.rotaMyMaps[r.area] || "#374151", weight: 3, opacity: .85 })
      .bindTooltip(`<b>${r.nome.replace("_", " ")}</b><br>${U.fmt(r.km, 1)} km`, { sticky: true, className: "dica" }).addTo(L_.rotas); });

    // Deslocamento automático para pontos com a mesma coordenada (ex.: A10_P18 e A10_P19)
    const coordCount = {};
    GEO.pontos.forEach(p => {
      const ck = p.ll[0].toFixed(5) + "," + p.ll[1].toFixed(5);
      const n = coordCount[ck] || 0; coordCount[ck] = n + 1;
      const ll = n > 0 ? [p.ll[0] + (n * 0.00012), p.ll[1] + (n * 0.00018)] : p.ll;
      const m = L.marker(ll, { riseOnHover: true });
      m.bindTooltip(() => dicaPonto(p), { className: "dica", direction: "top" });
      m.on("click", () => cb.ponto(p.cod));
      m.addTo(L_.pontos);
      marcadores[p.cod] = { m, p, ll };
    });

    GEO.logistica.forEach(l => { const sig = l.nome === "ATERRO" ? "A" : "G";
      L.marker(l.ll, { icon: L.divIcon({ className: "pin", iconSize: [30, 30], iconAnchor: [15, 15], html: `<svg width="30" height="30" viewBox="0 0 30 30"><rect x="2" y="2" width="26" height="26" rx="6" fill="#374151" stroke="#fff" stroke-width="2"/><text x="15" y="20" text-anchor="middle" font-family="Segoe UI,Arial" font-size="13" font-weight="700" fill="#fff">${sig}</text></svg>` }) })
        .bindTooltip(`<b>${sig === "A" ? "Aterro (destino)" : "Garagem (origem)"}</b>`, { className: "dica", direction: "top", offset: [0, -12] }).addTo(L_.pontos); });

    L_.limites = L.featureGroup(Object.values(poligonos)).getBounds();
    mapa.fitBounds(L_.limites, { padding: [10, 10] });
    mapa.on("zoomend", () => { if (ultimo) desenharPins(ultimo.res, ultimo.ui); });

    const aviso = L.control({ position: "topleft" });
    aviso.onAdd = () => { const d = L.DomUtil.create("div", "aviso-foco"); d.hidden = true; L.DomEvent.disableClickPropagation(d); return d; };
    aviso.addTo(mapa); L_.aviso = aviso.getContainer();

    const caixa = L.control({ position: "topright" });
    caixa.onAdd = () => { const d = L.DomUtil.create("div", "caixa"); d.appendChild(document.getElementById("tplCaixa").content.cloneNode(true));
      L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d; };
    caixa.addTo(mapa); L_.caixa = caixa.getContainer();
    return mapa;
  }

  /* ---------- dicas ---------- */
  function dicaArea(n) {
    const A = ultimo && ultimo.res.porArea[n]; if (!A) return `<b>Área ${n}</b>`;
    return `<b>Área ${n}</b> · ${U.esc(A.supervisor)}${A.ciclo ? ` · ${U.esc(A.ciclo.ciclo)}` : ""}<br>${U.fmtPct(A.pct)}% · ${U.fmtKm(Math.min(A.feito, A.plano))} de ${U.fmtKm(A.plano)}`;
  }
  function dicaPonto(p) {
    const r = ultimo && ultimo.res.pontos[p.cod], s = Calc.statusPonto(r), A = ultimo && ultimo.res.porArea[p.area];
    return `<b>${U.esc(p.cod)}</b> <span class="chip ${s}">${TXT_STATUS[s]}</span><br>${U.esc(p.id)}${p.bairro ? " · " + U.esc(p.bairro) : ""}<br>Área ${p.area}${A ? " · " + U.esc(A.supervisor) : ""} · ordem ${p.ordem}${r && r.obs ? `<br><i style="color:#66716b">${U.esc(r.obs)}</i>` : ""}`;
  }
  const TXT_STATUS = { coletado: "Coletado", nao: "Não coletado", pendente: "Pendente" };
  const TXT_SITU = { emdia: "Em dia", vencendo: "Perto de vencer", vencido: "Vencido", semrec: "Sem recorrência definida", nunca: "Sem registro" };
  function dicaExec(e) {
    return `<b>${U.esc(e.rua)}</b>${e.de || e.ate ? `<br>${U.esc(e.de)}${e.ate ? " / " + U.esc(e.ate) : ""}` : ""}<br>${U.fmtData(e.data)} · ${U.esc(e.equipe) || "—"} · ${U.esc(e.supervisor) || "—"}
      <br>${e.metros ? U.fmtKm(e.metros) : "—"}${e.pctArea != null && e.capina ? ` = <b>${U.fmt(e.pctArea, 2)}%</b> da área ${e.areaRef}` : ""}${e.pctRua != null ? ` · <b>${U.fmtPct(e.pctRua)}%</b> da rua` : ""}${e.servico && !e.capina ? `<br>${U.esc(e.servico)}` : ""}${e.loc.tipo === "aprox" ? `<br><i>Trecho aproximado: só uma rua do perímetro foi encontrada</i>` : e.loc.tipo === "rua" ? `<br><i>Trecho aproximado: perímetro não encontrado, mostrando a rua</i>` : ""}<br><small>Clique para abrir</small>`;
  }
  function dicaTrecho(x, res) {
    const A = res.porArea[x.area], k = LOC.chaveDoSeg(x.si), r = A && A.ruas[k], total = r ? r.total : ((Calc.RUAS_AREA[x.area] || {})[k] || {}).total, feito = r ? Math.min(r.feito, r.total || r.feito) : 0;
    const cor = C.situ[x.s];
    return `<b>${U.esc(LOC.nomeDe(x.si))}</b> · Área ${x.area}<br>Última capina: ${x.u && x.u.d ? U.fmtData(x.u.d) + ` (há ${x.dias} dia${x.dias === 1 ? "" : "s"})` : "—"}
      <br><span class="chip" style="background:${cor};${x.s === "vencendo" ? "color:#1f2a24" : ""}">${TXT_SITU[x.s]}</span>${A && A.recorrencia ? ` · recorrência ${A.recorrencia} dias` : ""}
      ${total ? `<br>Rua: <b>${U.fmtKm(feito)}</b> de ${U.fmtKm(total)} = <b>${U.fmtPct(feito / total * 100)}%</b>` : ""}${A && A.plano && feito ? `<br>${U.fmt(feito / A.plano * 100, 2)}% da área` : ""}<br>Trecho: ${U.fmtKm(LOC.comprSeg(x.si))}`;
  }

  /* ---------- desenho ---------- */
  function icone(p, s, sel, modo, filtroSt) {
    const mm = modo !== "andamento" && !filtroSt, cor = mm ? (C.pontoMyMaps[p.area] || "#757575") : C.status[s], selo = mm && s !== "pendente" ? s : null;
    if (!sel && !filtroSt && mapa.getZoom() < 14) return L.divIcon({ className: "pin", html: svgPin(cor, "", .62, selo), iconSize: [16, 22], iconAnchor: [8, 21], tooltipAnchor: [0, -18] });
    return L.divIcon({ className: "pin" + (sel ? " sel" : ""), html: svgPin(cor, p.ordem || "", 1, selo), iconSize: [26, 36], iconAnchor: [13, 35], tooltipAnchor: [0, -30] });
  }
  function desenharPins(res, ui) {
    Object.values(marcadores).forEach(({ m, p }) => {
      const st = Calc.statusPonto(res.pontos[p.cod]);
      const ver = ui.mostrar.pontos && (!ui.foco || p.area === ui.foco) && (!ui.filtroPonto || st === ui.filtroPonto);
      if (!ver) { L_.pontos.removeLayer(m); return; }
      if (!L_.pontos.hasLayer(m)) L_.pontos.addLayer(m);
      const sel = ui.sel && ui.sel.tipo === "ponto" && ui.sel.id === p.cod;
      m.setIcon(icone(p, st, sel, ui.modo, ui.filtroPonto)); m.setZIndexOffset(sel ? 1000 : (st === "nao" ? 400 : 0));
    });
    if (ui.mostrar.pontos) L_.pontos.addTo(mapa); else L_.pontos.remove();
  }
  function estiloArea(n, res, ui) {
    const A = res.porArea[n], sel = ui.sel && ui.sel.tipo === "area" && ui.sel.id === n;
    if (ui.foco && ui.foco !== n) return { fillColor: "#9aa39e", fillOpacity: .07, color: "#9aa39e", opacity: .4, weight: 1 };
    const borda = { color: sel ? "#0b3d1c" : (ui.modo === "andamento" ? "#3d4a42" : C.areaMyMaps[n]), weight: sel ? 3.5 : (ui.modo === "andamento" ? 1.5 : 2), opacity: 1 };
    if (ui.modo === "andamento") return { ...borda, fillColor: corFaixa(A ? A.pct : 0), fillOpacity: A && A.pct > 0 ? .72 : .5 };
    if (ui.modo === "tempo") return { ...borda, fillColor: C.areaMyMaps[n], fillOpacity: .22 };
    return { ...borda, fillColor: C.areaMyMaps[n], fillOpacity: C.opacMyMaps[n] };
  }

  function render(res, ui, situ) {
    ultimo = { res, ui };
    if (ui.mapaLimpo) {
      ["areas", "rotulos", "faltam", "exec", "tempo", "pontos", "rotas"].forEach(k => L_[k] && L_[k].remove());
      L_.aviso.hidden = false;
      L_.aviso.innerHTML = `Camadas da capina escondidas <a href="#" data-acao="desativar-limpo">mostrar</a>`;
      L_.aviso.querySelectorAll("a").forEach(a => a.onclick = ev => { ev.preventDefault(); cb.mapaLimpo && cb.mapaLimpo(false); });
      legenda(ui);
      return;
    }
    ["areas", "rotulos", "faltam", "exec", "tempo"].forEach(k => { if (!mapa.hasLayer(L_[k])) L_[k].addTo(mapa); });
    Object.entries(poligonos).forEach(([n, pol]) => {
      pol.setStyle(estiloArea(+n, res, ui));
      const A = res.porArea[n], el = rotulos[n].getElement();
      rotulos[n].setContent(`Área ${n}<br>${A ? U.fmtPct(A.pct) + "%" : ""}`);
      if (el) el.style.opacity = ui.foco && ui.foco !== +n ? .35 : 1;
    });
    // rotas
    Object.entries(linhasRota).forEach(([n, l]) => { const ver = !ui.foco || +n === ui.foco; if (ver && !L_.rotas.hasLayer(l)) L_.rotas.addLayer(l); if (!ver) L_.rotas.removeLayer(l); });
    if (ui.mostrar.rotas) L_.rotas.addTo(mapa); else L_.rotas.remove();
    desenharPins(res, ui);

    // linhas lançadas / tempo desde a capina / ruas sem registro
    L_.exec.clearLayers(); L_.tempo.clearLayers(); L_.faltam.clearLayers();
    const vis = res.visiveis.filter(e =>
      e.loc.ok &&
      (!ui.foco || e.areaRef === ui.foco || e.areaMapa === ui.foco) &&
      (!ui.filtroEquipe || U.norm(e.equipe).replace(/\s+/g, " ") === ui.filtroEquipe) &&
      (!ui.filtroLoc || (ui.filtroLoc === "aprox" ? e.loc.tipo !== "trecho" : ui.filtroLoc === "fora" ? e.fora : !e.fora))
    );
    const esconder = ui.soLanc;
    if (ui.mostrar.exec && !esconder && ui.modo !== "tempo") {
      vis.forEach(e => L.polyline(e.loc.linhas, { renderer: L_.rendLinhas, color: "#fff", weight: e.loc.tipo !== "trecho" ? 6 : 8.5, opacity: .95, lineCap: "round", interactive: false }).addTo(L_.exec));
      vis.forEach(e => { const inc = e.loc.tipo !== "trecho";
        const pl = L.polyline(e.loc.linhas, { renderer: L_.rendLinhas, color: e.fora ? C.exec.fora : C.exec.dentro, weight: inc ? 3.5 : 5, opacity: 1, dashArray: inc ? "6 5" : null, lineCap: "round" });
        pl.addTo(L_.exec);
        // faixa invisível mais larga por cima: a linha tracejada (e a fina) fica fácil de clicar, inclusive nos espaços do tracejado
        const alvo = L.polyline(e.loc.linhas, { renderer: L_.rendLinhas, color: "#000", weight: 16, opacity: 0, lineCap: "round" });
        alvo.bindTooltip(() => dicaExec(e), { sticky: true, className: "dica" }); alvo.on("click", () => cb.exec(e.idx)); alvo.addTo(L_.exec); });
    }
    if (situ && !esconder && (ui.modo === "tempo" || ui.mostrar.faltam || ui.situAtivas.size < 5)) {
      const areaSitu = ui.foco || (ui.areaAberta && ui.situAtivas.size < 5 ? ui.areaAberta : null);
      const filtro = x => (!areaSitu || x.area === areaSitu) && ui.situAtivas.has(x.s);
      if (ui.mostrar.faltam || (ui.modo === "tempo" && ui.situAtivas.size < 5 && ui.situAtivas.has("nunca"))) {
        const cinza = situ.segs.filter(x => x.s === "nunca" && filtro(x)).map(x => LOC.linhasDe([x.si])[0]);
        if (cinza.length) L.polyline(cinza, { renderer: L_.rendFaltam, color: C.situ.nunca, weight: 2.2, opacity: .85, interactive: false }).addTo(L_.faltam);
      }
      if (ui.modo === "tempo" && ui.mostrar.exec) {
        ["vencido", "vencendo", "semrec", "emdia"].forEach(s => situ.segs.filter(x => x.s === s && filtro(x)).forEach(x => {
          const pl = L.polyline(LOC.linhasDe([x.si]), { renderer: L_.rendLinhas, color: C.situ[s], weight: 5, opacity: 1, lineCap: "round" });
          pl.bindTooltip(() => dicaTrecho(x, res), { sticky: true, className: "dica" }); pl.on("click", () => cb.exec(x.u.e.idx)); pl.addTo(L_.tempo);
        }));
      }
    }
    // Avisos de filtro ativo no topo esquerdo do mapa
    const avisos = [];
    if (ui.foco) avisos.push(`Mostrando só a <b>Área ${ui.foco}</b> <a href="#" data-acao="limpar-foco">ver todas</a>`);
    if (ui.filtroPonto) avisos.push(`Pontos: <b>${TXT_STATUS[ui.filtroPonto]}</b> <a href="#" data-acao="limpar-ponto">mostrar todos</a>`);
    if (ui.filtroEquipe) avisos.push(`Equipe filtrada no mapa <a href="#" data-acao="limpar-equipe">mostrar todas</a>`);
    if (ui.filtroLoc === "aprox") avisos.push(`Mostrando só <b>Trechos Aproximados (tracejados)</b> <a href="#" data-acao="limpar-loc">mostrar todos</a>`);
    L_.aviso.hidden = !avisos.length;
    L_.aviso.innerHTML = avisos.join(" · ");
    L_.aviso.querySelectorAll("a").forEach(a => a.onclick = ev => {
      ev.preventDefault();
      if (a.dataset.acao === "limpar-foco") cb.fechar();
      else if (a.dataset.acao === "limpar-ponto") cb.filtrarPonto("");
      else if (a.dataset.acao === "limpar-equipe") cb.filtrarEquipe("");
      else if (a.dataset.acao === "limpar-loc") cb.filtrarLoc && cb.filtrarLoc("");
    });
    legenda(ui);
  }

  /* ---------- Legenda Interativa Clicável na Caixa do Mapa ---------- */
  function legenda(ui) {
    const el = L_.caixa.querySelector("#legenda"); if (!el) return;
    const q = c => `<i style="background:${c}"></i>`, l = c => `<i class="l" style="background:${c}"></i>`;
    const pinMini = (c, selo) => `<svg width="13" height="18" viewBox="0 0 26 36"><path d="M13 1C6.4 1 1 6.3 1 12.9c0 8.6 10.4 20.6 11.2 21.5.4.5 1.2.5 1.6 0C14.6 33.5 25 21.5 25 12.9 25 6.3 19.6 1 13 1z" fill="${c}" stroke="#fff" stroke-width="2"/>${selo ? `<circle cx="20" cy="7" r="6.5" fill="${selo}" stroke="#fff" stroke-width="1.5"/>` : ""}</svg>`;
    let h = "";
    if (ui.modo === "andamento") {
      h += `<div class="t">Andamento do ciclo</div>` + C.faixas.map(f => `<div>${q(f.cor)}${f.txt}</div>`).join("");
    } else {
      h += `<div class="t">Áreas (clique para abrir)</div><div class="g2">` + Object.keys(C.areaMyMaps).map(n => `<button type="button" class="leg-btn${ui.areaAberta === +n ? " on" : ""}" data-leg-area="${n}">${q(C.areaMyMaps[n])}Área ${n}</button>`).join("") + `</div>`;
    }

    if (ui.mostrar.exec && ui.modo === "tempo") {
      h += `<div class="t">Situação (clique para filtrar)</div>` +
        ["emdia", "vencendo", "vencido"].map(s => `<button type="button" class="leg-btn${ui.situAtivas.has(s) ? "" : " off"}" data-leg-sit="${s}">${l(C.situ[s])}${TXT_SITU[s]}</button>`).join("");
    } else if (ui.mostrar.exec) {
      h += `<div class="t">Ruas lançadas (clique para ver)</div>` +
        `<button type="button" class="leg-btn" data-leg-lista="lancamentos">${l(C.exec.dentro)}Dentro do planejado</button>` +
        `<button type="button" class="leg-btn" data-leg-lista="fora">${l(C.exec.fora)}Fora do planejado</button>` +
        `<button type="button" class="leg-btn${ui.filtroLoc === "aprox" ? " on" : ""}" data-leg-lista="aprox" title="Clique para ver e destacar no mapa só os trechos aproximados (tracejados)"><i class="tr"></i>Trecho aproximado</button>`;
    }

    if (ui.mostrar.faltam) h += `<button type="button" class="leg-btn" data-leg-sit="nunca">${l(C.situ.nunca)}Sem registro</button>`;

    if (ui.mostrar.pontos) {
      const fp = ui.filtroPonto || "";
      h += `<div class="t">Pontos críticos (clique para filtrar)</div>` +
        [["coletado", "Coletado", ui.modo === "andamento" ? C.status.coletado : "#9aa39e", ui.modo === "andamento" ? null : C.status.coletado],
         ["nao", "Não coletado", ui.modo === "andamento" ? C.status.nao : "#9aa39e", ui.modo === "andamento" ? null : C.status.nao],
         ["pendente", "Pendente", ui.modo === "andamento" ? C.status.pendente : "#9aa39e", null]
        ].map(([st, txt, cPin, cSelo]) => `<button type="button" class="leg-btn${fp === st ? " on" : (fp && fp !== st ? " off" : "")}" data-leg-ponto="${st}">${pinMini(cPin, cSelo)}${txt}</button>`).join("") +
        (fp ? `<button type="button" class="leg-reset" data-leg-ponto="">Mostrar todos os pontos</button>` : "");
    }
    el.innerHTML = h;

    // Eventos de clique na legenda
    el.querySelectorAll("[data-leg-area]").forEach(b => b.onclick = () => cb.area(+b.dataset.legArea, true));
    el.querySelectorAll("[data-leg-sit]").forEach(b => b.onclick = () => cb.situacao && cb.situacao(b.dataset.legSit));
    el.querySelectorAll("[data-leg-lista]").forEach(b => b.onclick = () => cb.lista && cb.lista(b.dataset.legLista));
    el.querySelectorAll("[data-leg-ponto]").forEach(b => b.onclick = () => {
      const st = b.dataset.legPonto;
      cb.filtrarPonto && cb.filtrarPonto(ui.filtroPonto === st ? "" : st, true);
    });
  }

  /* ---------- destaque, zoom ---------- */
  function destacar(e) {
    L_.destaque.clearLayers(); if (!e || !e.loc.ok) return;
    [["#1f2a24", 17, .9], ["#ffd400", 13, 1], [e.fora ? C.exec.fora : C.exec.dentro, 5, 1]].forEach(([c, w, o]) =>
      L.polyline(e.loc.linhas, { renderer: L_.rendDestaque, color: c, weight: w, opacity: o, lineCap: "round", interactive: false }).addTo(L_.destaque));
    centrar(e);
  }
  function centrar(e) { if (!e || !e.loc.ok) return; const b = L.polyline(e.loc.linhas).getBounds(); mapa.setView(b.getCenter(), Math.max(13, Math.min(17, mapa.getBoundsZoom(b, false, L.point(160, 160))))); }
  const limparDestaque = () => L_.destaque.clearLayers();
  const zoomArea = n => poligonos[n] && mapa.fitBounds(poligonos[n].getBounds(), { padding: [30, 30] });
  const zoomPonto = cod => marcadores[cod] && mapa.setView(marcadores[cod].ll, Math.max(mapa.getZoom(), 16));
  const tudo = () => mapa.fitBounds(L_.limites, { padding: [10, 10] });

  return { init, render, destacar, centrar, limparDestaque, zoomArea, zoomPonto, tudo, centro, corFaixa, TXT_STATUS, TXT_SITU, get mapa() { return mapa; }, get caixa() { return L_.caixa; } };
})();
