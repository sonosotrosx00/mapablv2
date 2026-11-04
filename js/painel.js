/* Painel lateral (computador) / gaveta (celular): resumo interativo, abas por área, pontos filtrados, equipes/supervisores */
const Painel = (() => {
  const $ = id => document.getElementById(id);
  const C = CFG.cores, GEO = DADOS_GEO;
  const SITU_ORD = ["emdia", "vencendo", "vencido", "semrec", "nunca"];
  const chipSitu = s => `<span class="chip" style="background:${C.situ[s]};${s === "vencendo" ? "color:#1f2a24;" : ""}">${Mapa.TXT_SITU[s]}</span>`;
  let abaAreaAtiva = "resumo"; // "resumo" | "ruas" | "pontos"

  /* ---------- resumo (tela principal simplificada e 100% clicável) ---------- */
  function resumo(res, situ, ui) {
    const A = Object.values(res.porArea).sort((a, b) => a.area - b.area);
    $("totKm").textContent = U.fmt(res.totPlano / 1000) + " km";
    $("totEq").textContent = A.reduce((s, a) => s + (+a.equipes || 0), 0);
    $("totAreas").textContent = A.length;
    const pk = res.totPlano ? res.totFeito / res.totPlano * 100 : 0;
    const temCiclo = A.some(a => a.ciclo), nomeCiclo = res.ciclo ? "ciclo " + res.ciclo : "ciclo atual";
    $("rotCiclo").textContent = res.ciclo ? "Capina no " + nomeCiclo : temCiclo ? "Capina no ciclo atual" : "Capina no período";
    $("kmPct").textContent = U.fmt(pk, 1) + "%";
    $("kmTxt").textContent = `${U.fmt(res.totFeito / 1000)} de ${U.fmt(res.totPlano / 1000)} km`;
    $("kmBarra").style.width = Math.min(pk, 100) + "%";
    $("kmFalta").textContent = U.fmt(Math.max(res.totPlano - res.totFeito, 0) / 1000, 1) + " km";
    $("areasOk").textContent = `${A.filter(a => a.plano && a.feito >= a.plano).length}/${A.length} áreas concluídas`;

    const st = GEO.pontos.map(p => Calc.statusPonto(res.pontos[p.cod])), col = st.filter(s => s === "coletado").length, nao = st.filter(s => s === "nao").length, np = st.length;
    $("ptPct").textContent = U.fmt(np ? col / np * 100 : 0, 1) + "%";
    $("ptTxt").textContent = `${col} de ${np} coletados`; $("ptBarra").style.width = (np ? col / np * 100 : 0) + "%";
    $("ptNao").textContent = nao; $("ptPend").textContent = `${np - col - nao}`;

    const v = res.visiveis;
    $("exN").textContent = v.length;
    $("exKm").textContent = U.fmtKm(v.reduce((s, e) => s + e.metros, 0));
    $("exFora").textContent = v.filter(e => e.fora).length;
    $("exNao").textContent = v.filter(e => !e.loc.ok).length;
    $("mini").innerHTML = `<span>${res.ciclo ? "Ciclo " + U.esc(res.ciclo) : temCiclo ? "Ciclo atual" : "Executado"} <b>${U.fmt(pk, 1)}%</b></span><span>Falta <b>${U.fmt(Math.max(res.totPlano - res.totFeito, 0) / 1000, 0)} km</b></span><span>Pontos <b>${col}/${np}</b></span>`;

    const fAtivos = [$("dtIni").value || $("dtFim").value ? "Datas" : "", $("fServico").value ? "Serviço" : "", $("fSup").value ? "Supervisor" : ""].filter(Boolean);
    const badgeFiltro = $("badgeFiltros");
    if (badgeFiltro) { badgeFiltro.textContent = fAtivos.length ? fAtivos.join(" + ") : ""; badgeFiltro.hidden = !fAtivos.length; }

    $("situGeral").innerHTML = situ ? situacaoHtml(Object.values(situ.resumo).reduce((t, r) => { SITU_ORD.forEach(k => t[k] = (t[k] || 0) + r[k]); return t; }, {}), ui, "g") : "";

    $("listaAreas").innerHTML = A.map(a => {
      const nPts = GEO.pontos.filter(x => x.area === a.area).length, cPts = GEO.pontos.filter(x => x.area === a.area && Calc.statusPonto(res.pontos[x.cod]) === "coletado").length;
      const cor = ui.modo === "andamento" ? Mapa.corFaixa(a.pct) : C.areaMyMaps[a.area];
      const prazoTxt = a.ciclo && a.recorrencia && a.diasCiclo
        ? (a.diasCiclo > a.recorrencia ? `<span class="tag-prazo alerta">Dia ${a.diasCiclo}/${a.recorrencia}</span>` : `<span class="tag-prazo ok">Dia ${a.diasCiclo}/${a.recorrencia}</span>`)
        : (a.recorrencia ? ` · recorrência de ${a.recorrencia} dias` : "");
      return `<div class="area${ui.sel && ui.sel.tipo === "area" && ui.sel.id === a.area ? " sel" : ""}" data-area="${a.area}" role="button" tabindex="0">
        <div class="cor" style="background:${cor}"></div>
        <div class="info"><div class="l1"><span><b>Área ${a.area}</b> · ${U.esc(a.supervisor)}</span><b>${a.semCiclo ? `sem ${U.esc(res.ciclo)}` : `${a.ciclo ? U.esc(a.ciclo.ciclo) + " · " : ""}${U.fmtPct(a.pct)}%`}</b></div>
        <div class="barra"><i style="width:${Math.min(a.pct, 100)}%"></i></div>
        <div class="l2"><span>${U.fmtKm(Math.min(a.feito, a.plano))} de ${U.fmtKm(a.plano)} ${prazoTxt}</span><span>${nPts ? `${cPts}/${nPts} pontos` : ""}</span></div></div></div>`;
    }).join("");
    ligar($("situGeral"));
    $("listaAreas").querySelectorAll(".area").forEach(el => { const n = +el.dataset.area; el.onclick = () => App.abrirArea(n, true); el.onkeydown = ev => { if (ev.key === "Enter") App.abrirArea(n, true); }; });
  }

  function situacaoHtml(tot, ui, escopo) {
    const soma = SITU_ORD.reduce((s, k) => s + (tot[k] || 0), 0) || 1, todas = ui.situAtivas.size === SITU_ORD.length;
    return SITU_ORD.filter(k => k !== "semrec" || tot[k] > 0).map(k => `<button type="button" class="sit${ui.situAtivas.has(k) ? "" : " off"}" data-sit="${k}"><i style="background:${C.situ[k]}"></i><span>${Mapa.TXT_SITU[k]}</span><b>${U.fmtKm(tot[k] || 0)}</b><em>${U.fmtPct((tot[k] || 0) / soma * 100)}%</em></button>`).join("")
      + (todas ? "" : `<button type="button" class="todas" data-sit-todas="${escopo}">Mostrar todas as situações</button>`);
  }

  /* ---------- detalhes ---------- */
  function mostrar(html, manter) {
    const rol = $("rolagem"), pos = rol.scrollTop;
    $("detalhe").innerHTML = `<div class="det-topo"><button class="sec" type="button" id="btVoltar">&larr; Voltar ao painel</button></div>` + html;
    $("detalhe").hidden = false; $("principal").hidden = true;
    rol.scrollTop = manter ? pos : 0;
    $("btVoltar").onclick = App.fechar;
    ligar($("detalhe"));
  }
  function fechar() { $("detalhe").hidden = true; $("detalhe").innerHTML = ""; $("principal").hidden = false; }
  function ligar(raiz) {
    raiz.querySelectorAll("[data-ponto]").forEach(el => el.onclick = ev => { ev.preventDefault(); App.abrirPonto(el.dataset.ponto, true); });
    raiz.querySelectorAll("[data-area-link]").forEach(el => el.onclick = ev => { ev.preventDefault(); App.abrirArea(+el.dataset.areaLink, true); });
    raiz.querySelectorAll("[data-exec]").forEach(el => el.onclick = ev => { ev.preventDefault(); App.abrirExec(+el.dataset.exec); });
    raiz.querySelectorAll("[data-sit]").forEach(el => el.onclick = () => App.clicarSituacao(el.dataset.sit));
    raiz.querySelectorAll("[data-sit-todas]").forEach(el => el.onclick = () => App.todasSituacoes());
    raiz.querySelectorAll("[data-ciclo]").forEach(el => el.onclick = ev => { ev.preventDefault(); App.definirCiclo(el.dataset.ciclo === App.ui.ciclo ? "" : el.dataset.ciclo); });
    raiz.querySelectorAll("[data-equipe-link]").forEach(el => el.onclick = ev => { ev.preventDefault(); App.abrirEquipe(el.dataset.equipeLink); });
    raiz.querySelectorAll("[data-filtro-ponto]").forEach(el => el.onclick = ev => { ev.preventDefault(); App.filtrarPonto(el.dataset.filtroPonto, true); });
  }

  function area(n, res, situ, ui, manter) {
    const a = res.porArea[n]; if (!a) return;
    const rota = GEO.rotas.find(r => r.area === n), est = GEO.estudoAreas[n], op = CFG.estudoOperacional && CFG.estudoOperacional[n];
    const pts = GEO.pontos.filter(x => x.area === n).sort((x, y) => x.ordem - y.ordem), st = pts.map(x => Calc.statusPonto(res.pontos[x.cod]));
    const nCol = st.filter(s => s === "coletado").length, nNao = st.filter(s => s === "nao").length;
    const c = a.ciclo, dc = a.diasCiclo;
    const ref = res.ref;
    const trab = Object.entries(a.ruas).map(([k, r]) => { const d = r.ult ? U.dias(r.ult, ref) : null; return { ...r, k, dias: d, s: d == null ? "nunca" : (!a.recorrencia ? "semrec" : (d <= a.recorrencia / 2 ? "emdia" : d <= a.recorrencia ? "vencendo" : "vencido")) }; });
    const feitas = new Set(trab.map(r => r.k)), todas = ui.situAtivas.size === SITU_ORD.length;
    const nunca = Object.entries(Calc.RUAS_AREA[n] || {}).filter(([k]) => !feitas.has(k)).map(([, r]) => ({ nome: r.nome, total: r.total, feito: 0, s: "nunca", dias: null, ult: null }));
    const ruas = trab.filter(r => ui.situAtivas.has(r.s)).sort((x, y) => (y.ult || 0) - (x.ult || 0)).concat(!todas && ui.situAtivas.has("nunca") ? nunca.sort((x, y) => y.total - x.total) : []);
    const exec = a.exec.slice().sort((x, y) => (y.data || 0) - (x.data || 0));

    // Equipes que atuaram nesta área
    const eqsArea = [...new Set(a.exec.map(e => e.equipe).filter(Boolean))].sort();

    let eficHtml = "—";
    if (c && dc != null && a.recorrencia) {
      const diff = a.recorrencia - dc;
      if (c.fim) {
        eficHtml = diff > 0 ? `<span class="chip coletado">${diff} dias antes da recorrência</span>` : diff === 0 ? `<span class="chip coletado">Na recorrência (${dc} dias)</span>` : `<span class="chip nao">${Math.abs(diff)} dias acima da recorrência</span>`;
      } else {
        eficHtml = diff >= 0 ? `<span class="chip coletado">Dia ${dc} de ${a.recorrencia} (restam ${diff} dias)</span>` : `<span class="chip nao">Dia ${dc} (${Math.abs(diff)} dias além da recorrência)</span>`;
      }
    }

    mostrar(`
      <div class="det-cab">
        <div class="tipo">Área operacional · SDs ${U.esc(a.sds) || "—"}</div>
        <h3>Área ${n} · ${U.esc(a.supervisor) || "—"}</h3>
        <div class="det-pct"><span class="n">${U.fmt(a.pct, 1)}%</span><span class="t">${a.semCiclo ? `sem o ciclo ${U.esc(res.ciclo)}` : c ? `concluído no ciclo ${U.esc(c.ciclo)}` : "no período"}</span></div>
        <div class="barra" style="height:8px"><i style="width:${Math.min(a.pct, 100)}%"></i></div>
        <div class="abas-area" id="abasArea">
          <button type="button" data-aba="resumo" class="${abaAreaAtiva === "resumo" ? "on" : ""}">Resumo & Ciclos</button>
          <button type="button" data-aba="ruas" class="${abaAreaAtiva === "ruas" ? "on" : ""}">Ruas (${trab.length})</button>
          <button type="button" data-aba="pontos" class="${abaAreaAtiva === "pontos" ? "on" : ""}">Pontos (${nCol}/${pts.length})</button>
        </div>
      </div>

      <!-- ABA 1: RESUMO & CICLOS -->
      <div class="aba-conteudo" data-painel-aba="resumo" ${abaAreaAtiva !== "resumo" ? "hidden" : ""}>
        <div class="bloco"><div class="grade">
          <div><small>Planejado</small><span>${U.fmtKm(a.plano)}</span></div><div><small>Executado</small><span>${U.fmtKm(Math.min(a.feito, a.plano))}</span></div>
          <div><small>Falta para 100%</small><span>${U.fmtKm(Math.max(a.plano - a.feito, 0))}</span></div><div><small>Equipes / Recorrência</small><span>${a.equipes ? a.equipes + " equipes" : "—"} · ${a.recorrencia ? a.recorrencia + " dias" : "—"}</span></div>
          <div><small>Ciclo ativo</small><span>${c ? U.esc(c.ciclo) + (c.status ? " · " + U.esc(c.status) : "") : "—"}</span></div>
          <div><small>Período do ciclo</small><span>${c ? `${U.fmtData(c.inicio).slice(0,5)} a ${c.fim ? U.fmtData(c.fim).slice(0,5) : "hoje"}` : "—"}</span></div>
          <div class="full"><small>Prazo / Eficiência do ciclo</small><span>${eficHtml}</span></div>
          ${eqsArea.length ? `<div class="full"><small>Equipes em campo nesta área (clique para ver)</small><span class="leve">${eqsArea.map(eq => `<a href="#" class="link" data-equipe-link="${U.esc(eq)}" style="margin-right:8px">${U.esc(eq)}</a>`).join("")}</span></div>` : ""}
          ${a.feito > a.plano ? `<div class="full"><small>Acima do planejado</small><span class="leve">${U.fmtKm(a.feito - a.plano)} lançados além da extensão da área</span></div>` : ""}
        </div></div>
        ${a.ciclos.length ? `<div class="bloco rolar-x"><h2>Histórico de Ciclos da Área (clique para filtrar)</h2><table class="tabela ciclos"><thead><tr><th>Ciclo</th><th>Período · Dias</th><th>Executado</th><th>%</th></tr></thead><tbody>
          ${a.ciclos.map(x => `<tr class="clic${c && x.ciclo === c.ciclo && x.inicio - c.inicio === 0 ? " sel" : ""}" data-ciclo="${U.esc(x.ciclo)}"><td><b>${U.esc(x.ciclo)}</b></td><td class="quebra">${U.fmtData(x.inicio).slice(0, 5)} a ${x.fim ? U.fmtData(x.fim).slice(0, 5) : "hoje"} (${x.dias} dias)<br><small>${U.esc(x.status) || ""}</small></td><td>${U.fmtKm(Math.min(x.feito, a.plano))}</td><td><b>${U.fmtPct(x.pct)}%</b></td></tr>`).join("")}
          </tbody></table>${res.ciclo ? `<p class="nota"><a href="#" class="link" data-ciclo="">Voltar ao ciclo atual de cada área</a></p>` : ""}</div>` : ""}
        ${situ ? `<div class="bloco"><h2>Situação das ruas na Área ${n}</h2><div class="situ">${situacaoHtml(situ.resumo[n] || {}, ui, "a")}</div></div>` : ""}
      </div>

      <!-- ABA 2: RUAS & LANÇAMENTOS -->
      <div class="aba-conteudo" data-painel-aba="ruas" ${abaAreaAtiva !== "ruas" ? "hidden" : ""}>
        ${situ ? `<div class="bloco"><h2>Filtrar ruas por situação</h2><div class="situ">${situacaoHtml(situ.resumo[n] || {}, ui, "a")}</div></div>` : ""}
        <div class="bloco rolar-x"><h2>${todas ? `Ruas capinadas (${trab.length})` : `Ruas filtradas (${ruas.length})`}</h2>
          ${ruas.length ? `<table class="tabela"><thead><tr><th>Rua</th><th>Feito</th><th>Total</th><th>%</th><th>Última</th></tr></thead><tbody>
          ${ruas.slice(0, 80).map(r => `<tr><td class="quebra">${U.esc(r.nome)}<br>${chipSitu(r.s)}</td><td>${U.fmtKm(Math.min(r.feito, r.total || r.feito))}</td><td>${r.total ? U.fmtKm(r.total) : "—"}</td><td><b>${r.total ? U.fmtPct(Math.min(r.feito, r.total) / r.total * 100) + "%" : "—"}</b></td><td>${r.ult ? U.fmtData(r.ult).slice(0,5) + `<br>há ${r.dias} dias` : "—"}</td></tr>`).join("")}
          </tbody></table>${ruas.length > 80 ? `<p class="nota">Mostrando 80 de ${ruas.length} ruas.</p>` : ""}` : `<p class="nota">Nenhuma rua nesta situação.</p>`}
        </div>
        ${exec.length ? `<div class="bloco"><h2>Lançamentos na área (${exec.length})</h2><div class="hist">${exec.slice(0, 30).map(e => `<div><a href="#" class="link" data-exec="${e.idx}" style="${e.fora ? "color:var(--laranja)" : ""}">${U.esc(e.rua)}</a><span>${U.fmtData(e.data).slice(0,5)} · ${e.metros ? U.fmtKm(e.metros) : "—"}</span></div>`).join("")}</div></div>` : ""}
      </div>

      <!-- ABA 3: PONTOS CRÍTICOS & ROTA -->
      <div class="aba-conteudo" data-painel-aba="pontos" ${abaAreaAtiva !== "pontos" ? "hidden" : ""}>
        ${pts.length ? `
          <div class="bloco">
            <div class="linha" style="justify-content:space-between;margin-bottom:8px">
              <h2 style="margin:0">Dimensionamento Operacional (Estudo)</h2>
              ${rota ? `<button type="button" class="sec" id="btToggleRotaArea" style="padding:4px 9px;font-size:11.5px">${ui.mostrar.rotas ? "Ocultar rota no mapa" : "Mostrar rota no mapa"}</button>` : ""}
            </div>
            <div class="grade">
              <div><small>Status atual</small><span>${nCol} coletados · <a href="#" class="link" data-filtro-ponto="nao" style="color:var(--vermelho)">${nNao} não coletados</a> · ${pts.length - nCol - nNao} pendentes</span></div>
              <div><small>Patrulha manual / mecanizada</small><span>${est ? `${est.manual} manual / ${est.mecanizada} mecanizada` : "—"}</span></div>
              ${op ? `
                <div><small>Frota necessária</small><span><b>${op.cb} caminhões basculantes</b></span></div>
                <div><small>Viagens / peso estimado</small><span>${op.viagens} viagens · ${U.fmt(op.pesoDia, 1)} t/dia</span></div>
                <div><small>Roteiro produtivo</small><span>${U.fmt(op.kmRoteiro, 1)} km</span></div>
                <div><small>Deslocamento garagem + aterro</small><span>${U.fmt(op.kmGaragem + op.kmAterro, 1)} km (${U.fmt(op.pctLogistico, 0)}%)</span></div>
                <div class="full"><small>Jornada estimada da rota</small><span class="leve"><b>${U.fmt(op.horasTotal, 1)} h totais</b> (${Math.round(op.minRota)} min rota + ${op.minColeta} min coleta + ${op.minDescarga} min descarga)</span></div>
              ` : ""}
            </div>
          </div>
          <div class="bloco">
            <div class="linha" style="justify-content:space-between;margin-bottom:6px">
              <h2 style="margin:0">Pontos da Área ${n} (${ ui.filtroPonto ? pts.filter((_, i) => st[i] === ui.filtroPonto).length + " filtrados" : pts.length })</h2>
              ${ui.filtroPonto ? `<a href="#" class="link" data-filtro-ponto="" style="font-size:11.5px">Mostrar todos</a>` : ""}
            </div>
            <div class="lista">${pts.map((x, i) => ({ x, s: st[i], r: res.pontos[x.cod] })).filter(it => !ui.filtroPonto || it.s === ui.filtroPonto).map(({ x, s, r }) => `<a href="#" data-ponto="${U.esc(x.cod)}"><span class="ord" style="background:${C.status[s]}">${x.ordem}</span><span class="nm"><b>${U.esc(x.cod)}</b> · ${U.esc(x.bairro || x.id)}<br><small style="color:var(--cinza)">${U.esc(x.patrulha)} · ${U.esc(x.material)}${r && r.obs ? " · <b style='color:var(--vermelho)'>" + U.esc(r.obs) + "</b>" : ""}</small></span><span class="chip ${s}">${Mapa.TXT_STATUS[s]}</span></a>`).join("")}</div>
          </div>
        ` : `<div class="bloco"><p class="nota">A Área ${n} (Mosqueiro) não possui pontos críticos cadastrados no estudo preliminar.</p></div>`}
      </div>
    `, manter);

    document.querySelectorAll("#abasArea button").forEach(bt => {
      bt.onclick = () => {
        abaAreaAtiva = bt.dataset.aba;
        document.querySelectorAll("#abasArea button").forEach(b => b.classList.toggle("on", b.dataset.aba === abaAreaAtiva));
        document.querySelectorAll(".aba-conteudo").forEach(p => p.hidden = p.dataset.painelAba !== abaAreaAtiva);
      };
    });
    const btRota = $("btToggleRotaArea");
    if (btRota) {
      btRota.onclick = () => {
        App.alternarRota();
        btRota.textContent = App.ui.mostrar.rotas ? "Ocultar rota no mapa" : "Mostrar rota no mapa";
      };
    }
  }

  /* ---------- NOVA TELA: Lista e Filtro de Pontos Críticos (ex.: ver só Não Coletados) ---------- */
  function listaPontos(res, ui, manter) {
    const fp = ui.filtroPonto || "";
    const todos = GEO.pontos.map(p => ({ p, r: res.pontos[p.cod], s: Calc.statusPonto(res.pontos[p.cod]), sup: (res.porArea[p.area] || {}).supervisor || "" }));
    const nCol = todos.filter(x => x.s === "coletado").length, nNao = todos.filter(x => x.s === "nao").length, nPend = todos.length - nCol - nNao;
    const filtrados = todos.filter(x => !fp || x.s === fp);

    mostrar(`
      <div class="det-cab" style="padding-bottom:12px">
        <div class="tipo">Monitoramento de Coleta (Áreas 2 a 10)</div>
        <h3>Pontos Críticos ${fp ? "· " + Mapa.TXT_STATUS[fp] : ""}</h3>
        <div class="sub">${filtrados.length} de ${todos.length} pontos exibidos no mapa e na lista</div>
        <div class="seg" style="margin-top:10px">
          <button type="button" class="${!fp ? "on" : ""}" data-filtro-ponto="">Todos (${todos.length})</button>
          <button type="button" class="${fp === "nao" ? "on" : ""}" data-filtro-ponto="nao">Não coletados (${nNao})</button>
          <button type="button" class="${fp === "coletado" ? "on" : ""}" data-filtro-ponto="coletado">Coletados (${nCol})</button>
          <button type="button" class="${fp === "pendente" ? "on" : ""}" data-filtro-ponto="pendente">Pendentes (${nPend})</button>
        </div>
      </div>
      <div class="bloco">
        <div class="lista">
          ${filtrados.map(({ p, r, s, sup }) => `
            <a href="#" data-ponto="${U.esc(p.cod)}">
              <span class="ord" style="background:${C.status[s]}">${p.ordem}</span>
              <span class="nm">
                <b>${U.esc(p.cod)}</b> · Área ${p.area} (${U.esc(sup)}) · ${U.esc(p.bairro || p.id)}<br>
                <small style="color:var(--cinza)">${U.esc(p.patrulha)} · ${U.esc(p.material)}${r && r.data ? " · " + U.fmtData(r.data) : ""}</small>
                ${r && r.obs ? `<br><small style="color:${s === "nao" ? "var(--vermelho)" : "var(--verde-esc)"};font-weight:600">Obs: ${U.esc(r.obs)}</small>` : ""}
              </span>
              <span class="chip ${s}">${Mapa.TXT_STATUS[s]}</span>
            </a>
          `).join("") || `<p class="nota">Nenhum ponto nesta situação.</p>`}
        </div>
      </div>
    `, manter);
  }

  function ponto(cod, res, manter) {
    const p = GEO.pontos.find(x => x.cod === cod); if (!p) return;
    const r = res.pontos[cod], s = Calc.statusPonto(r), a = res.porArea[p.area] || {}, [lat, lng] = p.ll;
    mostrar(`
      <div class="det-cab" style="padding-bottom:12px"><div class="tipo">Ponto crítico</div><h3>${U.esc(p.cod)}</h3><div class="sub">${U.esc(p.id)}</div><div style="margin-top:10px"><span class="chip ${s}">${Mapa.TXT_STATUS[s]}</span></div></div>
      <div class="bloco"><div class="grade">
        <div><small>Área</small><span><a href="#" class="link" data-area-link="${p.area}">Área ${p.area}</a></span></div><div><small>Supervisor</small><span>${U.esc(a.supervisor) || "—"}</span></div>
        <div><small>Ordem na rota</small><span>${p.ordem}º ponto</span></div><div><small>Bairro</small><span>${U.esc(p.bairro) || "—"}</span></div>
        <div><small>Patrulha</small><span>${U.esc(p.patrulha) || "—"}</span></div><div><small>Material</small><span>${U.esc(p.material) || "—"}</span></div>
        <div><small>Data da atualização</small><span>${r && r.data ? U.fmtData(r.data) : "—"}</span></div><div><small>Coordenadas</small><span class="leve">${lat.toFixed(6)}, ${lng.toFixed(6)}</span></div>
        ${r && r.obs ? `<div class="full"><small>Observação</small><span class="leve">${U.esc(r.obs)}</span></div>` : ""}
      </div>
      <div class="linha botoes">
        <button type="button" id="btSvPonto">&#129485; Ver no Street View</button>
        <a class="sec" href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener" style="text-decoration:none">Abrir no Google Maps &rarr;</a>
        <button class="sec" type="button" data-filtro-ponto="nao">Ver todos Não Coletados</button>
      </div></div>`, manter);
    const btSv = $("btSvPonto");
    if (btSv && window.FerramentasMapa) btSv.onclick = () => FerramentasMapa.abrirStreetView(lat, lng, p.cod + " · " + p.id);
  }

  const TXT_LOC = { trecho: "Trecho entre as ruas do perímetro", aprox: "Trecho aproximado (só uma rua do perímetro encontrada)", rua: "Rua encontrada; trecho do perímetro não identificado" };
  function exec(e, res, ui) {
    const mesma = res.visiveis.filter(x => x.idx !== e.idx && LOC.chave(x.rua) === LOC.chave(e.rua)).slice(0, 12);
    const ra = e.ruaArea && res.porArea[e.ruaArea] && res.porArea[e.ruaArea].ruas[e.ruaChave];
    mostrar(`
      <div class="det-cab" style="padding-bottom:12px"><div class="tipo">${U.esc(e.servico) || "Serviço executado"}</div><h3>${U.esc(e.rua)}</h3>
        <div class="sub">${e.de || e.ate ? `${U.esc(e.de) || "—"} / ${U.esc(e.ate) || "—"}` : "Sem perímetro"}</div>
        <div style="margin-top:10px">${e.fora ? `<span class="chip" style="background:${C.exec.fora}">Fora da área do supervisor</span>` : `<span class="chip coletado">Dentro do planejado</span>`}</div></div>
      ${e.loc.ok ? `<div class="bloco"><label class="ckline"><input type="checkbox" id="ckSoLanc" ${ui.soLanc ? "checked" : ""}> Mostrar só este lançamento no mapa</label>
        <div class="linha botoes" style="margin-top:8px">
          <button class="sec" type="button" id="btCentrar">Centralizar no trecho</button>
          <button type="button" id="btSvExec">&#129485; Ver rua no Street View</button>
        </div></div>` : ""}
      <div class="bloco"><div class="grade">
        <div><small>Data</small><span>${U.fmtData(e.data)}</span></div><div><small>Ciclo</small><span>${U.esc(e.cicloCalc) || "—"}</span></div>
        <div><small>Equipe (clique para ver)</small><span>${e.equipe ? `<a href="#" class="link" data-equipe-link="${U.esc(e.equipe)}">${U.esc(e.equipe)}</a>` : "—"}</span></div>
        <div><small>Supervisor</small><span>${U.esc(e.supervisor) || "—"}</span></div>
        <div><small>Área considerada</small><span><a href="#" class="link" data-area-link="${e.areaRef}">Área ${e.areaRef || "—"}</a></span></div><div><small>Bairro</small><span>${U.esc(e.bairro) || "—"}</span></div>
        <div><small>Metros informados</small><span>${e.m ? U.fmtKm(e.m) : "—"}</span></div><div><small>Medida no mapa (1 eixo)</small><span>${e.loc.ok && e.loc.tipo === "trecho" ? U.fmtKm(e.loc.metros) : "—"}</span></div>
        <div><small>Metros considerados</small><span>${e.metros ? U.fmtKm(e.metros) : "—"}</span></div><div><small>Representa na área</small><span>${e.pctArea != null && e.capina ? U.fmt(e.pctArea, 2) + "%" : "—"}</span></div>
        ${ra && ra.total ? `<div class="full"><small>Rua na área (acumulado)</small><span class="leve">${U.fmtKm(Math.min(ra.feito, ra.total))} de ${U.fmtKm(ra.total)} · <b>${U.fmtPct(Math.min(ra.feito, ra.total) / ra.total * 100)}%</b></span></div>` : ""}
        ${e.homens ? `<div><small>Nº de homens</small><span>${e.homens}</span></div>` : ""}
        <div><small>Lançado por</small><span class="leve">${U.esc(e.lancado) || "—"}</span></div>
        <div class="full"><small>Localização geográfica</small><span class="leve">${e.loc.ok ? TXT_LOC[e.loc.tipo] + (e.loc.ruaBase ? " · " + U.esc(e.loc.ruaBase) : "") : "Rua não encontrada na base viária"}</span></div>
        ${e.obs ? `<div class="full"><small>Observação</small><span class="leve">${U.esc(e.obs)}</span></div>` : ""}
      </div></div>
      ${mesma.length ? `<div class="bloco"><h2>Outros lançamentos nesta rua</h2><div class="hist">${mesma.map(x => `<div><a href="#" class="link" data-exec="${x.idx}">${U.fmtData(x.data)} · ${U.esc(x.equipe) || "—"}</a><b>${x.metros ? U.fmtKm(x.metros) : "—"}</b></div>`).join("")}</div></div>` : ""}`);
    const ck = $("ckSoLanc"); if (ck) ck.onchange = () => App.soEste(ck.checked);
    const bc = $("btCentrar"); if (bc) bc.onclick = () => Mapa.centrar(e);
    const bs = $("btSvExec");
    if (bs && window.FerramentasMapa && e.loc.linhas && e.loc.linhas[0] && e.loc.linhas[0][0]) {
      const pts = e.loc.linhas[0], meio = pts[Math.floor(pts.length / 2)];
      bs.onclick = () => FerramentasMapa.abrirStreetView(meio[0], meio[1], e.rua);
    }
  }

  /* ---------- Listas de Lançamentos (Todos, Fora do Planejado, Não Localizados) ---------- */
  function listaLanc(titulo, lst, txt, res, sufixoXls) {
    const totM = lst.reduce((s, e) => s + (e.metros || 0), 0);
    mostrar(`<div class="det-cab" style="padding-bottom:12px">
        <div class="tipo">Lançamentos no período</div>
        <h3>${titulo}</h3>
        <div class="sub">${lst.length} lançamento(s) · Total: <b>${U.fmtKm(totM)}</b></div>
        <button class="sec" type="button" id="btXlsLanc" style="margin-top:10px">Baixar planilha (.xlsx)</button>
      </div>
      <div class="bloco"><div class="hist">${lst.slice(0, 400).map(e => `<div><a href="#" class="link" data-exec="${e.idx}">${U.esc(e.rua)}<br><small style="color:var(--cinza);font-weight:400">${U.esc(e.servico)} · ${U.esc(e.equipe || "—")} (${U.esc(e.supervisor || "—")})</small></a><span style="text-align:right">${txt(e)}</span></div>`).join("") || "—"}</div></div>`);
    const bt = $("btXlsLanc");
    if (bt) bt.onclick = () => Exportar.lancamentos(res, lst, sufixoXls);
  }
  const todosLanc = res => listaLanc("Todos os lançamentos", res.visiveis.slice().sort((a, b) => (b.data || 0) - (a.data || 0)), e => `<b>${U.fmtKm(e.metros)}</b><br><small style="color:var(--cinza)">${U.fmtData(e.data).slice(0,5)} · Área ${e.areaRef || "—"}</small>`, res, "todos");
  const fora = res => listaLanc("Fora do planejado", res.visiveis.filter(e => e.fora), e => `${U.esc(e.supervisor)} (Área ${e.areaSup})<br><small>lançou na Área ${e.areaRef}</small>`, res, "fora_planejado");
  const naoLoc = res => listaLanc("Locais especiais / Rua não encontrada", res.visiveis.filter(e => !e.loc.ok), e => `${U.fmtData(e.data)}<br><small>Área ${e.areaRef || "—"}</small>`, res, "nao_localizados");
  function aprox(res) {
    const lst = res.visiveis.filter(e => e.loc.ok && e.loc.tipo !== "trecho").sort((a, b) => (b.data || 0) - (a.data || 0));
    const totM = lst.reduce((s, e) => s + (e.metros || 0), 0);
    mostrar(`
      <div class="det-cab" style="padding-bottom:12px">
        <div class="tipo">Localização Geográfica · Linhas Tracejadas</div>
        <h3>Trechos Aproximados</h3>
        <div class="sub">${lst.length} lançamento(s) com traçado aproximado · Total: <b>${U.fmtKm(totM)}</b></div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="sec" type="button" id="btXlsAprox">Baixar planilha (.xlsx)</button>
          <button class="sec" type="button" id="btLimparFiltroAprox">Mostrar todas as ruas no mapa</button>
        </div>
      </div>
      <div class="bloco">
        <div class="box-explicacao">
          <b>Como funciona a Linha Sólida vs. Tracejada no mapa?</b><br>
          &#8226; <b>Linha Contínua (Trecho exato):</b> quando você informa a <b>Rua Principal</b> + as <b>2 ruas do perímetro</b> (<i>De</i> e <i>Até</i>) e o mapa encontra os dois cruzamentos.<br>
          &#8226; <b>Linha Tracejada (Trecho aproximado):</b> quando apenas <b>1 rua transversal</b> foi preenchida ou encontrada (ex.: só o <i>"De"</i>). O sistema parte dessa única esquina encontrada e desenha a metragem informada ao longo da rua principal em <b>linha tracejada</b>.<br>
          &#8226; <b>Rua sem perímetro:</b> se nenhuma transversal for informada, destaca a rua na área também tracejada.
        </div>
        <div class="hist">
          ${lst.map(e => `<div><a href="#" class="link" data-exec="${e.idx}">${U.esc(e.rua)}<br><small style="color:var(--cinza);font-weight:400">Perímetro: <b>${U.esc(e.de || "—")}</b> / <b>${U.esc(e.ate || "não informado")}</b><br>${e.loc.tipo === "aprox" ? "1 transversal encontrada + extensão informada" : "Sem transversal identificada (rua na área)"}</small></a><span style="text-align:right"><b>${U.fmtKm(e.metros)}</b><br><small style="color:var(--cinza)">${U.fmtData(e.data).slice(0,5)} · Área ${e.areaRef || "—"}</small></span></div>`).join("") || `<p class="nota">Nenhum lançamento com trecho aproximado no filtro atual.</p>`}
        </div>
      </div>
    `);
    const bx = $("btXlsAprox"); if (bx) bx.onclick = () => Exportar.lancamentos(res, lst, "trechos_aproximados");
    const bl = $("btLimparFiltroAprox"); if (bl) bl.onclick = () => App.filtrarLoc("");
  }

  function semanal(res) {
    const sem = Calc.semanas(res), A = Object.values(res.porArea).sort((a, b) => a.area - b.area);
    const rot = k => { if (k === "sem-data") return "Sem data"; const a = new Date(k + "T00:00:00"), b = new Date(a); b.setDate(b.getDate() + 6); return a.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " a " + b.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); };
    const ult = sem.filter(s => s.k !== "sem-data").slice(-1)[0];
    mostrar(`<div class="det-cab" style="padding-bottom:12px"><div class="tipo">Capinação e raspagem</div><h3>Resumo semanal</h3><button class="sec" type="button" id="btXlsSem" style="margin-top:10px">Baixar planilha (.xlsx)</button></div>
      <div class="bloco rolar-x"><table class="tabela"><thead><tr><th>Semana</th><th>Lançamentos</th><th>Executado</th><th>% do total</th></tr></thead><tbody>
      ${sem.map(s => `<tr><td>${rot(s.k)}</td><td>${s.n}</td><td>${U.fmtKm(s.m)}</td><td>${U.fmt(res.totPlano ? s.m / res.totPlano * 100 : 0, 1)}%</td></tr>`).join("") || `<tr><td colspan="4">—</td></tr>`}</tbody></table></div>
      ${ult ? `<div class="bloco rolar-x"><h2>Por área · ${rot(ult.k)}</h2><table class="tabela"><thead><tr><th>Área</th><th>Supervisor</th><th>Executado</th><th>% da área</th></tr></thead><tbody>
      ${A.map(a => { const m = ult.area[a.area] || 0; return `<tr><td><a href="#" class="link" data-area-link="${a.area}">Área ${a.area}</a></td><td>${U.esc(a.supervisor)}</td><td>${U.fmtKm(m)}</td><td>${a.plano ? U.fmt(m / a.plano * 100, 1) : 0}%</td></tr>`; }).join("")}</tbody></table></div>` : ""}`);
    $("btXlsSem").onclick = () => Exportar.semanal(res, sem, rot);
  }

  /* ---------- Produtividade + Supervisores e suas Equipes + Excel Download ---------- */
  function produtividade(res) {
    const p = Calc.produtividade(res), sups = Calc.produtividadeSupervisores(res), meta = CFG.metaEquipeMDia;
    const A = Object.values(res.porArea).sort((a, b) => a.area - b.area);

    // Agrupar equipes por supervisor/área
    const eqPorSup = {};
    p.forEach(x => {
      const k = U.primeiroNome(x.supervisor) || "outros";
      (eqPorSup[k] = eqPorSup[k] || []).push(x);
    });

    mostrar(`<div class="det-cab" style="padding-bottom:12px">
        <div class="tipo">Supervisores, Equipes e Produtividade</div>
        <h3>Produtividade & Equipes</h3>
        <div class="sub">Meta planejada: <b>${U.fmt(meta, 0)} m/equipe/dia</b> · Clique numa equipe para ver as ruas dela no mapa</div>
        <button class="sec" type="button" id="btXlsProd" style="margin-top:10px">Excel Produtividade</button>
      </div>

      <div class="bloco">
        <h2>Supervisores e suas Equipes (por Área)</h2>
        <div class="sup-lista">
          ${A.map(a => {
            const k = U.primeiroNome(a.supervisor);
            const eqs = eqPorSup[k] || [];
            const supStat = sups.find(s => U.primeiroNome(s.supervisor) === k);
            return `<div class="sup-card">
              <div class="sup-cab">
                <div>
                  <a href="#" class="link" data-area-link="${a.area}"><b>Área ${a.area} · ${U.esc(a.supervisor)}</b></a>
                  <span class="nota"> · SDs ${U.esc(a.sds)} · ${a.equipes} equipes previstas</span>
                </div>
                <b>${supStat ? U.fmtKm(supStat.m) : "0 m"}</b>
              </div>
              <div class="sup-eqs">
                ${eqs.length ? eqs.map(x => `<button type="button" class="eq-pill" data-equipe-link="${U.esc(x.equipe)}"><b>${U.esc(x.equipe)}</b> · ${U.fmtKm(x.m)} (${U.fmt(x.mDia / meta * 100, 0)}% da meta)</button>`).join("") : `<span class="nota">Nenhuma equipe com lançamento no período</span>`}
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>

      <div class="bloco rolar-x"><h2>Ranking por Supervisor</h2>
        <table class="tabela"><thead><tr><th>Supervisor</th><th>Lançamentos</th><th>Total executado</th><th>Metros por equipe/dia</th><th>Metros por homem/dia</th></tr></thead><tbody>
        ${sups.map(s => `<tr><td class="quebra">${s.area ? `<a href="#" class="link" data-area-link="${s.area}"><b>${U.esc(s.supervisor)}</b> (Área ${s.area})</a>` : `<b>${U.esc(s.supervisor)}</b>`}</td><td>${s.lancs}</td><td><b>${U.fmtKm(s.m)}</b></td><td>${U.fmt(s.mEqDia, 0)}</td><td>${s.mHomemDia != null ? U.fmt(s.mHomemDia, 1) : "—"}</td></tr>`).join("") || `<tr><td colspan="5">—</td></tr>`}
        </tbody></table>
      </div>

      <div class="bloco rolar-x"><h2>Produtividade por Equipe (clique para abrir)</h2>
        <table class="tabela"><thead><tr><th>Equipe</th><th>Dias</th><th>Executado</th><th>Metros/dia</th><th>% da meta</th><th>Metros por homem/dia</th></tr></thead><tbody>
        ${p.map(x => `<tr class="clic" data-equipe-link="${U.esc(x.equipe)}"><td class="quebra"><b style="color:var(--verde)">${U.esc(x.equipe)}</b><br><span class="nota">${U.esc(x.supervisor)}${x.area ? " · Área " + x.area : ""}</span></td><td>${x.dias}</td><td>${U.fmtKm(x.m)}</td><td>${U.fmt(x.mDia, 0)}</td><td><b>${U.fmt(x.mDia / meta * 100, 0)}%</b></td><td>${x.mHomemDia != null ? U.fmt(x.mHomemDia, 1) : "—"}</td></tr>`).join("") || `<tr><td colspan="6">—</td></tr>`}
        </tbody></table>
      </div>`);
    const bt = $("btXlsProd");
    if (bt) bt.onclick = () => Exportar.produtividade(res);
  }

  /* ---------- Detalhe de uma Equipe específica (mostra de quem ela pertence e destaca suas ruas no mapa) ---------- */
  function detalheEquipe(nomeEq, res) {
    const k = U.norm(nomeEq).replace(/\s+/g, " ");
    const p = Calc.produtividade(res).find(x => U.norm(x.equipe).replace(/\s+/g, " ") === k);
    const lancs = res.visiveis.filter(e => U.norm(e.equipe).replace(/\s+/g, " ") === k).sort((a, b) => (b.data || 0) - (a.data || 0));
    const sup = (p && p.supervisor) || (lancs[0] && lancs[0].supervisor) || "—";
    const area = (p && p.area) || (lancs[0] && lancs[0].areaRef) || null;
    const meta = CFG.metaEquipeMDia;

    mostrar(`
      <div class="det-cab" style="padding-bottom:12px">
        <div class="tipo">Equipe Operacional</div>
        <h3>Equipe ${U.esc(nomeEq)}</h3>
        <div class="sub">Pertence ao Supervisor: <b>${U.esc(sup)}</b>${area ? ` · <a href="#" class="link" data-area-link="${area}">Área ${area}</a>` : ""}</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="sec" type="button" id="btVoltarEquipes">&larr; Ver todas as equipes</button>
          <button class="sec" type="button" id="btXlsEq">Baixar lançamentos da equipe (.xlsx)</button>
        </div>
      </div>
      ${p ? `<div class="bloco"><div class="grade">
        <div><small>Total executado</small><span><b>${U.fmtKm(p.m)}</b></span></div>
        <div><small>Dias trabalhados</small><span>${p.dias} dia(s)</span></div>
        <div><small>Média por dia</small><span>${U.fmt(p.mDia, 0)} m/dia (${U.fmt(p.mDia / meta * 100, 0)}% da meta)</span></div>
        <div><small>Produtividade / homem</small><span>${p.mHomemDia != null ? U.fmt(p.mHomemDia, 1) + " m/homem/dia" : "—"}</span></div>
      </div></div>` : ""}
      <div class="bloco">
        <h2>Ruas executadas pela equipe ${U.esc(nomeEq)} (${lancs.length})</h2>
        <div class="hist">
          ${lancs.map(e => `<div><a href="#" class="link" data-exec="${e.idx}">${U.esc(e.rua)}<br><small style="color:var(--cinza)">${U.esc(e.de || "—")} / ${U.esc(e.ate || "—")} · ${U.esc(e.servico)}</small></a><span style="text-align:right"><b>${U.fmtKm(e.metros)}</b><br><small style="color:var(--cinza)">${U.fmtData(e.data)}</small></span></div>`).join("") || "—"}
        </div>
      </div>
    `);
    const b1 = $("btVoltarEquipes"); if (b1) b1.onclick = () => App.abrirLista("prod");
    const b2 = $("btXlsEq"); if (b2) b2.onclick = () => Exportar.lancamentos(res, lancs, "equipe_" + k.replace(/\W+/g, "_"));
  }

  function filtros(base) {
    const sv = $("fServico"), ss = $("fSup"), v1 = sv.value, v2 = ss.value;
    const servs = [...new Map(base.lancamentos.map(r => [U.norm(r.servico), r.servico])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const sups = [...new Map(base.lancamentos.filter(r => r.supervisor).map(r => [U.primeiroNome(r.supervisor), r.supervisor])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    sv.innerHTML = `<option value="">Todos os serviços</option>` + servs.map(([k, n]) => `<option value="${U.esc(k)}"${k === v1 ? " selected" : ""}>${U.esc(n)}</option>`).join("");
    ss.innerHTML = `<option value="">Todos os supervisores</option>` + sups.map(([k, n]) => `<option value="${U.esc(k)}"${k === v2 ? " selected" : ""}>${U.esc(n)}</option>`).join("");
  }

  return { resumo, area, listaPontos, ponto, exec, todosLanc, fora, naoLoc, aprox, semanal, produtividade, detalheEquipe, filtros, fechar, ligar, mostrarPersonalizado: mostrar, TXT_LOC, SITU_ORD };
})();
