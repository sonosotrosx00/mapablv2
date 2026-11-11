/* Consulta por rua (reclamação de munícipe ou da prefeitura):
   para uma rua da base, mostra por área a última capina, a situação frente à recorrência, quando vence,
   o ciclo em andamento e os lançamentos da rua. Desenha a rua no mapa com a cor de cada trecho. */
const ConsultaRua = (() => {
  let camada = null;
  const $ = id => document.getElementById(id);
  const C = CFG.cores;
  const ORD = ["vencido", "vencendo", "emdia", "semrec", "nunca"];
  const TXT = { emdia: "Em dia", vencendo: "Perto de vencer", vencido: "Vencido", semrec: "Sem recorrência definida", nunca: "Sem registro de capina" };
  const corS = s => C.situ[s] || "#9aa0a6";
  const fmtD = d => d ? U.fmtData(d) : "—";
  const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  function limpar() { if (camada) camada.clearLayers(); }

  // junta os dados da rua (chave da base) a partir do cálculo atual
  function dados(k, res) {
    Calc.indexar();
    const situ = Calc.situacaoRuas(res);
    const doSeg = new Map(); situ.segs.forEach(x => doSeg.set(x.si, x));
    const segs = LOC.segsDaChave(k);
    const porArea = {};
    segs.forEach(si => {
      const n = Calc.SEG_AREA[si] || 0, x = doSeg.get(si);
      const A = porArea[n] || (porArea[n] = { area: n, segs: [], total: 0, m: { emdia: 0, vencendo: 0, vencido: 0, semrec: 0, nunca: 0 }, ult: null, vence: null, vencida: null });
      const L = LOC.comprSeg(si), s = x ? x.s : "nunca", d = x && x.u ? x.u.d : null;
      A.segs.push({ si, s, d }); A.total += L; A.m[s] += L;
      if (d && (!A.ult || d > A.ult)) A.ult = d;
    });
    Object.values(porArea).forEach(A => {
      const pa = res.porArea[A.area] || {}, rec = pa.recorrencia;
      A.supervisor = pa.supervisor || ""; A.recorrencia = rec || null; A.ciclo = pa.ciclo || null; A.pctArea = pa.pct;
      A.feito = A.total - A.m.nunca;
      if (rec) A.segs.filter(x => x.d).forEach(x => { const v = somaDias(x.d, rec); if (!A.vence || v < A.vence) A.vence = v; });
      A.diasUlt = A.ult ? U.dias(A.ult, res.ref) : null;
      A.noCiclo = !!(A.ciclo && A.segs.some(x => x.d && x.d >= A.ciclo.inicio));
      A.pior = ORD.find(s => s !== "nunca" && A.m[s] > 0) || "nunca";
    });
    const lancs = res.todos.filter(e => (e.loc.ok && e.loc.ids && e.loc.ids.some(si => LOC.chaveDoSeg(si) === k)) || LOC.chave(e.rua) === k)
      .sort((a, b) => (b.data || 0) - (a.data || 0));
    const nome = segs.length ? LOC.nomeDe(segs[0]) : k;
    return { k, nome, areas: Object.values(porArea).filter(A => A.area).sort((a, b) => b.total - a.total), fora: porArea[0], lancs, ref: res.ref };
  }

  // frase principal para a área (pensada para responder à reclamação)
  function resposta(A, ref) {
    const ciclo = A.ciclo ? `${A.ciclo.ciclo}${A.ciclo.status ? " (" + A.ciclo.status + ")" : ""}, iniciado em ${fmtD(A.ciclo.inicio)}` : "";
    if (!A.ult) return `Não há registro de capina nesta rua na Área ${A.area}.` + (ciclo ? ` A área está no ciclo ${ciclo}; a rua ainda não foi lançada neste ciclo.` : "");
    let t = `Última capina em ${fmtD(A.ult)} (há ${A.diasUlt} ${A.diasUlt === 1 ? "dia" : "dias"}).`;
    if (A.recorrencia) {
      if (A.vence && A.vence >= ref) t += ` Dentro da recorrência de ${A.recorrencia} dias: a próxima capina deve ocorrer até ${fmtD(A.vence)}.`;
      else if (A.vence) t += ` Passou da recorrência de ${A.recorrencia} dias desde ${fmtD(A.vence)}.`;
    }
    if (A.m.nunca > 1) t += ` ${U.fmtKm(A.m.nunca)} da rua nesta área ainda sem registro de capina.`;
    if (ciclo) t += A.noCiclo ? ` Já capinada no ciclo ${A.ciclo.ciclo}.` : ` A área está no ciclo ${ciclo}; esta rua ainda não foi lançada neste ciclo.`;
    return t;
  }

  function barra(A) {
    return `<div class="cr-barra">${ORD.filter(s => A.m[s] > 0.5).map(s => `<i style="width:${A.m[s] / A.total * 100}%;background:${corS(s)}" title="${TXT[s]}: ${U.fmtKm(A.m[s])}"></i>`).join("")}</div>
      <div class="cr-leg">${ORD.filter(s => A.m[s] > 0.5).map(s => `<span><i style="background:${corS(s)}"></i>${TXT[s]} <b>${U.fmtKm(A.m[s])}</b></span>`).join("")}</div>`;
  }

  function desenhar(D, areaSel) {
    const mapa = Mapa.mapa;
    if (!camada) { if (!mapa.getPane("consultaRua")) { mapa.createPane("consultaRua").style.zIndex = 590; mapa.getPane("consultaRua").style.pointerEvents = "none"; } camada = L.layerGroup().addTo(mapa); }
    camada.clearLayers();
    const todos = D.areas.flatMap(A => A.segs.map(x => ({ ...x, area: A.area })));
    if (!todos.length) return;
    const linhas = todos.map(x => LOC.linhasDe([x.si])[0]);
    L.polyline(linhas, { pane: "consultaRua", color: "#fff", weight: 13, opacity: .95, interactive: false }).addTo(camada);
    todos.forEach((x, i) => L.polyline(linhas[i], { pane: "consultaRua", color: corS(x.s), weight: 7, opacity: 1, interactive: false }).addTo(camada));
    const foco = areaSel ? todos.map((x, i) => x.area === areaSel ? linhas[i] : null).filter(Boolean) : linhas;
    const b = L.polyline(foco.length ? foco : linhas).getBounds();
    mapa.fitBounds(b, { padding: [50, 50], maxZoom: 17 });
  }

  function render(k, areaSel) {
    if (typeof App === "undefined" || !App.res) return;
    const D = dados(k, App.res);
    const link = location.href.split("#")[0] + "#rua=" + encodeURIComponent(D.nome) + (areaSel ? "&area_rua=" + areaSel : "");
    const As = areaSel ? D.areas.filter(A => A.area === areaSel) : D.areas;
    Painel.mostrarPersonalizado(`
      <div class="det-cab" style="padding-bottom:12px">
        <div class="tipo">Consulta por rua</div>
        <h3>${U.esc(D.nome)}</h3>
        <div class="sub">Situação em ${fmtD(D.ref)}${D.areas.length > 1 ? ` · rua em ${D.areas.length} áreas` : ""}</div>
        ${D.areas.length > 1 ? `<div class="seg" style="margin-top:8px;flex-wrap:wrap"><button type="button" data-cr-area="" class="${!areaSel ? "on" : ""}">Todas</button>${D.areas.map(A => `<button type="button" data-cr-area="${A.area}" class="${areaSel === A.area ? "on" : ""}">Área ${A.area}</button>`).join("")}</div>` : ""}
      </div>
      ${typeof Reclamacoes !== "undefined" ? Reclamacoes.blocoRua(k, areaSel, App.res, D.nome).html : ""}
      ${!D.areas.length ? `<div class="bloco"><p class="nota">Esta rua não está dentro das áreas de capina.</p></div>` : ""}
      ${As.map(A => `
      <div class="bloco cr-area">
        <div class="cr-tit"><span class="chip" style="background:${corS(A.ult ? A.pior : "nunca")}">${A.ult ? TXT[A.pior] : TXT.nunca}</span> <b>Área ${A.area}</b> · ${U.esc(A.supervisor || "—")}</div>
        <p class="cr-resp">${resposta(A, D.ref)}</p>
        <div class="grade">
          <div><small>Última capina</small><span>${fmtD(A.ult)}</span></div>
          <div><small>Dias desde a capina</small><span>${A.diasUlt != null ? A.diasUlt : "—"}</span></div>
          <div><small>Recorrência da área</small><span>${A.recorrencia ? A.recorrencia + " dias" : "Sem recorrência definida"}</span></div>
          <div><small>Próxima capina até</small><span>${A.vence ? fmtD(A.vence) : "—"}</span></div>
          <div><small>Ciclo da área</small><span>${A.ciclo ? `${U.esc(A.ciclo.ciclo)} desde ${fmtD(A.ciclo.inicio)}` : "Sem ciclo aberto"}</span></div>
          <div><small>Status do ciclo</small><span>${A.ciclo ? U.esc(A.ciclo.status || "—") : "—"}</span></div>
          <div><small>Extensão da rua na área</small><span>${U.fmtKm(A.total)}</span></div>
          <div><small>Com registro de capina</small><span>${U.fmtKm(A.feito)} (${U.fmtPct(A.total ? A.feito / A.total * 100 : 0)}%)</span></div>
        </div>
        ${barra(A)}
      </div>`).join("")}
      <div class="bloco">
        <h2>Lançamentos nesta rua (${D.lancs.length})</h2>
        <div class="hist">${D.lancs.slice(0, 40).map(e => `<div><a href="#" class="link" data-exec="${e.idx}">${U.fmtData(e.data)} · ${U.esc(e.servico || "—")}<br><small style="color:var(--cinza);font-weight:400">${U.esc(e.de || "—")} / ${U.esc(e.ate || "—")} · ${U.esc(e.supervisor || "—")}${e.equipe ? " · " + U.esc(e.equipe) : ""}</small></a><span style="text-align:right"><b>${e.metros ? U.fmtKm(e.metros) : "—"}</b><br><small style="color:var(--cinza)">Área ${e.areaRef || "—"}</small></span></div>`).join("") || `<p class="nota">Nenhum lançamento nesta rua.</p>`}</div>
      </div>
      <div class="bloco">
        <div class="linha botoes">
          <button type="button" id="btCrLink">Copiar link desta consulta</button>
          <button type="button" class="sec" id="btCrSv">Ver no Street View</button>
          <button type="button" class="sec" id="btCrMapa">Centralizar no mapa</button>
        </div>
        <p class="nota" id="crMsg" style="margin-top:6px"></p>
      </div>`);
    document.querySelectorAll("[data-cr-area]").forEach(b => b.onclick = () => App.abrirRua(k, b.dataset.crArea ? +b.dataset.crArea : null));
    $("btCrLink").onclick = async () => {
      try { await navigator.clipboard.writeText(link); $("crMsg").textContent = "Link copiado. Quem abrir verá esta mesma consulta, com os dados do dia."; }
      catch (e) { $("crMsg").innerHTML = `Copie o link: <input type="text" readonly value="${U.esc(link)}" style="width:100%" onclick="this.select()">`; }
    };
    const meio = () => { const A = As[0] || D.areas[0]; if (!A) return null; const l = LOC.linhasDe([A.segs[Math.floor(A.segs.length / 2)].si])[0]; return l[Math.floor(l.length / 2)]; };
    $("btCrSv").onclick = () => { const p = meio(); if (p && window.FerramentasMapa) FerramentasMapa.abrirStreetView(p[0], p[1], D.nome); };
    $("btCrMapa").onclick = () => desenhar(D, areaSel);
    desenhar(D, areaSel);
  }

  // acha a chave da base pelo nome digitado (link #rua=…)
  function chaveDoNome(nome) {
    const s = LOC.sugerirRuas(nome, 5); if (!s.length) return null;
    return (s.find(x => U.norm(x.nome) === U.norm(nome)) || s.find(x => x.exata) || s[0]).chave;
  }
  // tela inicial do botão "Consultar rua (reclamação)": campo de busca + ruas com reclamação aberta
  function telaBusca() {
    const recl = typeof Reclamacoes !== "undefined" ? Reclamacoes.lista.filter(r => r.loc.ok && (r.st === "aberta" || r.st === "andamento")) : [];
    Painel.mostrarPersonalizado(`
      <div class="det-cab" style="padding-bottom:12px">
        <div class="tipo">Consulta por rua</div>
        <h3>Consultar rua</h3>
        <div class="sub">Digite o nome da rua para ver a última capina, a recorrência, o ciclo da área e as reclamações.</div>
        <input type="search" id="inCrBusca" class="cr-busca" placeholder="Ex.: Rua 13 de Maio" autocomplete="off" aria-label="Nome da rua">
        <div id="crSug" class="cr-sug"></div>
      </div>
      ${recl.length ? `<div class="bloco"><h2>Ruas com reclamação aberta (${recl.length})</h2><div class="hist">${recl.map(r => `<div><a href="#" class="link" data-cr-k="${U.esc(r.loc.chave)}" data-cr-a="${r.loc.area || ""}">${U.esc(r.rua)}<br><small style="color:var(--cinza);font-weight:400">${U.fmtData(r.data)}${r.origem ? " · " + U.esc(r.origem) : ""}${r.bairro ? " · " + U.esc(r.bairro) : ""}</small></a><span>${r.loc.area ? "Área " + r.loc.area : ""}</span></div>`).join("")}</div></div>` : ""}`);
    const inp = $("inCrBusca"), sug = $("crSug");
    const ligar = () => document.querySelectorAll("[data-cr-k]").forEach(el => el.onclick = ev => { ev.preventDefault(); App.abrirRua(el.dataset.crK, +el.dataset.crA || null); });
    const mostrar = () => {
      const t = inp.value.trim(); if (t.length < 3) { sug.innerHTML = ""; return; }
      const l = LOC.sugerirRuas(t, 8);
      sug.innerHTML = l.length ? l.map(s => `<a href="#" data-cr-k="${U.esc(s.chave)}">${U.esc(s.nome)}</a>`).join("") : `<p class="nota">Nenhuma rua com esse nome na base do mapa.</p>`;
      ligar();
    };
    inp.addEventListener("input", mostrar);
    inp.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); const a = sug.querySelector("[data-cr-k]"); if (a) a.click(); } });
    ligar(); setTimeout(() => inp.focus(), 50);
  }
  return { render, limpar, chaveDoNome, telaBusca };
})();
