/* Dashboard Operacional e Gerencial (Acompanhamento de Capina, Equipes, Pontos Críticos e Editor Visual de Planilha) */
(() => {
  const $ = id => document.getElementById(id);
  const PLANILHA_LOCAL = window.PLANILHA_LOCAL || null;
  const C = CFG.cores;

  let base = null, res = null, situ = null, arqExcel = null;
  let fonte = U.ler("fonte_novo", PLANILHA_LOCAL ? "local" : "google");
  let modoTesteAtivo = U.ler("modo_teste_planilha", true);

  /* ---------- Gerador de Gráfico de Rosca (SVG Donut Chart) ---------- */
  function svgDonut(fatias, txtCentroGrande, txtCentroSub) {
    const soma = fatias.reduce((s, f) => s + (f.valor || 0), 0) || 1;
    const r = 60, c = 2 * Math.PI * r;
    let acum = 0;
    const arcos = fatias.filter(f => f.valor > 0).map(f => {
      const frac = f.valor / soma;
      const len = frac * c;
      const off = -acum * c;
      acum += frac;
      const tip = f.tip ? ` data-tip="${U.esc(f.tip)}"` : "", href = f.href ? ` data-href="${U.esc(f.href)}" style="cursor:pointer"` : "";
      return `<circle class="fatia" cx="85" cy="85" r="${r}" fill="transparent" stroke="${f.cor}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 85 85)"${tip}${href}/>`;
    }).join("");

    return `
      <div class="donut-box">
        <svg width="170" height="170" viewBox="0 0 170 170">
          <circle cx="85" cy="85" r="${r}" fill="transparent" stroke="#eef2ee" stroke-width="22"/>
          ${arcos}
        </svg>
        <div class="donut-centro">
          <b>${txtCentroGrande}</b>
          <small>${txtCentroSub}</small>
        </div>
      </div>
    `;
  }

  /* ---------- Utilitários de dias úteis (padrão Relatório de Capinação rev02) ---------- */
  function diasUteis(d1, d2) {
    if (!d1 || !d2 || d2 < d1) return { segSex: 0, segMeioSab: 0 };
    let segSex = 0, segMeioSab = 0;
    const c = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const fim = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
    while (c <= fim) {
      const w = c.getDay();
      if (w >= 1 && w <= 5) { segSex += 1; segMeioSab += 1; }
      else if (w === 6) { segMeioSab += 0.5; }
      c.setDate(c.getDate() + 1);
    }
    return { segSex, segMeioSab };
  }

  /* ---------- Datas e Filtros ---------- */
  const lerData = id => { const v = $(id) && $(id).value; return v ? new Date(v + "T00:00:00") : null; };
  function dataRef() {
    const f = lerData("dFim"); if (f) return f;
    if ((fonte === "local" || fonte === "excel") && base && base.lancamentos.length) {
      let m = null; base.lancamentos.forEach(r => { if (r.data && (!m || r.data > m)) m = r.data; });
      if (m) return m;
    }
    return U.hoje();
  }
  const filtros = () => ({
    ini: lerData("dIni"),
    fim: lerData("dFim"),
    servico: $("dServico").value,
    supervisor: $("dSup").value,
    ref: dataRef(),
    ciclo: $("dCiclo").value
  });

  function periodo(tipo) {
    const h = dataRef(), ini = $("dIni"), fim = $("dFim");
    if (tipo === "semana" || tipo === "passada") {
      const a = U.inicioSemana(h);
      if (tipo === "passada") a.setDate(a.getDate() - 7);
      const b = new Date(a); b.setDate(b.getDate() + 6);
      ini.value = U.ymd(a); fim.value = U.ymd(b);
    } else if (tipo === "mes") {
      ini.value = U.ymd(new Date(h.getFullYear(), h.getMonth(), 1));
      fim.value = U.ymd(new Date(h.getFullYear(), h.getMonth() + 1, 0));
    } else {
      ini.value = ""; fim.value = "";
    }
    marcarPeriodo(tipo);
    recalcular();
  }
  function marcarPeriodo(tipo) {
    document.querySelectorAll("#dashSegPer button").forEach(b => b.classList.toggle("on", b.dataset.per === tipo));
  }

  function popularFiltros() {
    const servs = new Map(), sups = new Map();
    base.lancamentos.forEach(r => {
      if (r.servico) servs.set(U.norm(r.servico), r.servico);
      if (r.supervisor) sups.set(U.primeiroNome(r.supervisor), r.supervisor);
    });
    base.areas.forEach(a => { if (a.supervisor) sups.set(U.primeiroNome(a.supervisor), a.supervisor); });

    const selS = $("dServico"), vS = selS.value;
    selS.innerHTML = `<option value="">Todos os serviços</option>` + [...servs.entries()].map(([k, v]) => `<option value="${U.esc(k)}">${U.esc(v)}</option>`).join("");
    selS.value = vS;

    const selP = $("dSup"), vP = selP.value;
    selP.innerHTML = `<option value="">Todos os supervisores</option>` + [...sups.entries()].map(([k, v]) => `<option value="${U.esc(k)}">${U.esc(v)}</option>`).join("");
    selP.value = vP;

    const cics = [...new Set(base.ciclos.map(c => c.ciclo))].sort();
    const selC = $("dCiclo"), vC = selC.value;
    selC.innerHTML = `<option value="">Ciclo atual de cada área</option>` + cics.map(c => `<option value="${U.esc(c)}">Somente ${U.esc(c)}</option>`).join("");
    selC.value = cics.includes(vC) ? vC : "";
  }

  /* ---------- Carregamento de dados ---------- */
  async function carregar() {
    $("dashStatus").textContent = "Carregando base operacional…";
    try {
      if (fonte === "local" && PLANILHA_LOCAL) {
        const ativa = Dados.planilhaAtivaLocal ? Dados.planilhaAtivaLocal() : PLANILHA_LOCAL;
        base = Dados.converter(ativa);
        const temEd = !!U.ler("planilha_editada_teste", null);
        $("dashStatus").textContent = temEd
          ? "Fonte ativa: Planilha Editada no Site (Modo Teste) · Belém/PA"
          : "Fonte ativa: Planilha de Exemplo Completa · Dados operacionais auditados de Belém/PA";
      } else if (fonte === "excel") {
        if (!arqExcel) arqExcel = await U.lerArq("excel");
        if (!arqExcel) throw new Error("escolha um arquivo Excel (.xlsx)");
        base = Dados.converter(await Dados.lerExcel(arqExcel));
        $("dashStatus").textContent = "Fonte ativa: Arquivo Excel (" + (arqExcel.name || "planilha") + ")";
      } else {
        const link = ($("inDashLink") && $("inDashLink").value.trim()) || U.ler("planilha", "") || CFG.planilha;
        base = Dados.converter(await Dados.lerGoogle(link));
        $("dashStatus").textContent = "Fonte ativa: Google Sheets sincronizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      }
      popularFiltros();
    } catch (e) {
      $("dashStatus").textContent = "Aviso: " + e.message + " (exibindo Planilha de Exemplo)";
      if (!base && PLANILHA_LOCAL) {
        base = Dados.converter(Dados.planilhaAtivaLocal ? Dados.planilhaAtivaLocal() : PLANILHA_LOCAL);
        popularFiltros();
      }
    }
    recalcular();
    if (window.EditorPlanilha && $("containerEditorPlanilha")) {
      EditorPlanilha.renderizar($("containerEditorPlanilha"), novaPlan => {
        fonte = "local";
        base = Dados.converter(novaPlan);
        popularFiltros();
        recalcular();
      });
    }
  }

  function recalcular() {
    if (!base) return;
    res = Calc.calcular(base, filtros());
    situ = Calc.situacaoRuas(res);
    renderizarAbaCapina();
    renderizarAbaEquipes();
    renderizarAbaPontos();
  }

  /* ============================================================================
     ABA 1: VISÃO GERAL, CICLOS & CAPINAÇÃO
     ============================================================================ */
  function renderizarAbaCapina() {
    const pctGeral = res.totPlano ? Math.min(100, res.totFeito / res.totPlano * 100) : 0;
    const faltaGeral = Math.max(0, res.totPlano - res.totFeito);

    // Soma situação das ruas
    const totSitu = { emdia: 0, vencendo: 0, vencido: 0, semrec: 0, nunca: 0 };
    Object.values(situ.resumo).forEach(r => Object.keys(totSitu).forEach(k => totSitu[k] += r[k] || 0));
    const malhaTotal = Object.values(totSitu).reduce((s, v) => s + v, 0) || 1;
    const malhaCapinada = totSitu.emdia + totSitu.vencendo + totSitu.vencido;
    const pctEmDiaCapinadas = malhaCapinada ? (totSitu.emdia / malhaCapinada) * 100 : 0;

    // Ciclos em alerta
    let areasNoPrazo = 0, areasCriticas = 0;
    Object.values(res.porArea).forEach(a => {
      if (a.ciclo && a.recorrencia) {
        if (a.diasCiclo > a.recorrencia) areasCriticas++;
        else areasNoPrazo++;
      }
    });

    const lancCapina = res.visiveis.filter(e => e.capina);
    const lancFora = res.visiveis.filter(e => e.fora);

    $("kpisCapina").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-rotulo">Avanço Geral no Ciclo</div>
        <div class="kpi-valor">${U.pct(pctGeral)}</div>
        <div class="kpi-det"><b>${U.km(res.totFeito)}</b> executados de ${U.km(res.totPlano)} · Faltam ${U.km(faltaGeral)}</div>
      </div>
      <div class="kpi-card info">
        <div class="kpi-rotulo">Ruas Capinadas em Dia</div>
        <div class="kpi-valor">${U.pct(pctEmDiaCapinadas)}</div>
        <div class="kpi-det"><b>${U.km(totSitu.emdia)}</b> em dia de ${U.km(malhaCapinada)} monitorados no mapa</div>
      </div>
      <div class="kpi-card ${(totSitu.vencendo + totSitu.vencido) > 0 ? 'alerta' : ''}">
        <div class="kpi-rotulo">Perto de Vencer + Vencido</div>
        <div class="kpi-valor">${U.km(totSitu.vencendo + totSitu.vencido)}</div>
        <div class="kpi-det">Perto de vencer: <b>${U.km(totSitu.vencendo)}</b> · Vencido: <b>${U.km(totSitu.vencido)}</b></div>
      </div>
      <div class="kpi-card ${areasCriticas > 0 ? 'critico' : ''}">
        <div class="kpi-rotulo">Aderência ao Prazo de Ciclo</div>
        <div class="kpi-valor">${areasNoPrazo} / 10 áreas</div>
        <div class="kpi-det">${areasCriticas ? `<b>${areasCriticas} área(s)</b> acima da recorrência planejada` : `Todas as áreas dentro da janela`}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-rotulo">Lançamentos &amp; Auditoria</div>
        <div class="kpi-valor">${U.int(res.visiveis.length)}</div>
        <div class="kpi-det">${lancCapina.length} de capina · ${lancFora.length ? `<b style="color:#b45309">${lancFora.length} fora da área</b>` : `100% na área correta`}</div>
      </div>
    `;

    // Tabela de Eficiência dos Ciclos por Área
    let totKmPlano = 0, totKmFeito = 0, totLancCiclo = 0;
    const linhasCiclo = Object.values(res.porArea).sort((a, b) => a.area - b.area).map(a => {
      const corArea = C.areaMyMaps[a.area] || "#1e7b34";
      const c = a.ciclo;
      const dCorridos = a.diasCiclo || 0;
      const du = c ? diasUteis(c.inicio, c.fim || res.ref) : { segSex: 0, segMeioSab: 0 };
      const rec = a.recorrencia || 0;
      const saldo = rec && dCorridos ? (rec - dCorridos) : null;

      let pillStatus = `<span class="st-pill st-neutral">SEM CICLO</span>`;
      if (c) {
        if (c.fim || a.pct >= 100) pillStatus = `<span class="st-pill st-ok">CONCLUÍDO</span>`;
        else if (rec && dCorridos > rec) pillStatus = `<span class="st-pill st-err">CRÍTICO (+${dCorridos - rec} dias)</span>`;
        else if (rec && dCorridos >= rec - 2) pillStatus = `<span class="st-pill st-warn">EXECUÇÃO LONGA</span>`;
        else pillStatus = `<span class="st-pill st-info">EM EXECUÇÃO</span>`;
      }

      let txtSaldo = "—";
      if (saldo !== null) {
        if (saldo > 0) txtSaldo = `<span style="color:#15803d;font-weight:700">${saldo} dias disponíveis</span>`;
        else if (saldo === 0) txtSaldo = `<span style="color:#b45309;font-weight:700">No limite</span>`;
        else txtSaldo = `<span style="color:#b91c1c;font-weight:700">${Math.abs(saldo)} dias além do prazo</span>`;
      }

      totKmPlano += a.plano;
      totKmFeito += a.feito;
      totLancCiclo += (a.nCiclo ?? a.exec.length);

      return `<tr>
        <td><a href="index.html#area=${a.area}" class="area-badge" style="background:${corArea}" title="Abrir a Área ${a.area} no mapa">Área ${a.area} &#8599;</a></td>
        <td><b>${U.esc(a.supervisor || "—")}</b><div class="sub">SDs ${U.esc(a.sds || "")}</div></td>
        <td><b>${c ? U.esc(c.ciclo) : "—"}</b></td>
        <td>${c ? U.dmy(c.inicio) : "—"}</td>
        <td>${c ? (c.fim ? U.dmy(c.fim) : `<span class="sub">Em aberto (${U.dmy(res.ref)})</span>`) : "—"}</td>
        <td><b>${dCorridos || "—"}</b></td>
        <td>${du.segSex || "—"}</td>
        <td>${du.segMeioSab ? U.dec(du.segMeioSab, 1) : "—"}</td>
        <td>${rec ? rec + " dias" : "Sem meta"}</td>
        <td>${txtSaldo}</td>
        <td><b>${U.km(a.feito)}</b> <span class="sub">/ ${U.km(a.plano)}</span></td>
        <td style="min-width:120px">
          <div style="display:flex;align-items:center;gap:6px">
            <div class="barra" style="flex:1;margin:0"><i style="width:${Math.min(100, a.pct)}%"></i></div>
            <b style="font-size:11.5px;min-width:38px;text-align:right">${U.pct(a.pct)}</b>
          </div>
        </td>
        <td>${pillStatus}</td>
      </tr>`;
    }).join("");

    const pctTot = totKmPlano ? Math.min(100, totKmFeito / totKmPlano * 100) : 0;
    $("tabCiclosArea").innerHTML = `
      <table class="tab-exec">
        <thead>
          <tr>
            <th>Área</th><th>Supervisor / SDs</th><th>Ciclo</th><th>Início</th><th>Término / referência</th>
            <th>Dias corridos</th><th>Dias úteis (segunda a sexta)</th><th>Dias úteis (com meio sábado)</th><th>Recorrência</th><th>Saldo do prazo</th>
            <th>Executado / Meta</th><th>% Ciclo</th><th>Status Operacional</th>
          </tr>
        </thead>
        <tbody>
          ${linhasCiclo}
          <tr class="total-row">
            <td colspan="10">TOTAL CONSOLIDADO (10 ÁREAS OPERACIONAIS)</td>
            <td>${U.km(totKmFeito)} / ${U.km(totKmPlano)}</td>
            <td>${U.pct(pctTot)}</td>
            <td>${totLancCiclo} lançamentos no ciclo</td>
          </tr>
        </tbody>
      </table>
    `;

    // NOVO GRÁFICO (Rosca SVG + Cards + Matriz Clara por Área - substitui o antigo gráfico empilhado)
    const donutSitu = svgDonut([
      { valor: totSitu.emdia, cor: "#16a34a", tip: `<b>Em dia</b><br>${U.km(totSitu.emdia)} (${U.pct(malhaCapinada ? totSitu.emdia / malhaCapinada * 100 : 0)} das ruas capinadas)` },
      { valor: totSitu.vencendo, cor: "#eab308", tip: `<b>Perto de vencer</b><br>${U.km(totSitu.vencendo)} (${U.pct(malhaCapinada ? totSitu.vencendo / malhaCapinada * 100 : 0)})` },
      { valor: totSitu.vencido, cor: "#dc2626", tip: `<b>Vencido</b><br>${U.km(totSitu.vencido)} (${U.pct(malhaCapinada ? totSitu.vencido / malhaCapinada * 100 : 0)})` }
    ], U.km(malhaCapinada), "Ruas Capinadas");

    const linhasMatrizSitu = Object.values(res.porArea).sort((a, b) => a.area - b.area).map(a => {
      const s = situ.resumo[a.area] || { emdia: 0, vencendo: 0, vencido: 0, semrec: 0, nunca: 0 };
      const corArea = C.areaMyMaps[a.area] || "#e2e8f0";
      return `<tr>
        <td><a href="index.html#area=${a.area}" class="area-badge" style="background:${corArea}">Área ${a.area}</a> <b>${U.esc(a.supervisor)}</b></td>
        <td><span class="st-pill st-ok">${U.km(s.emdia)}</span></td>
        <td>${s.vencendo > 0 ? `<span class="st-pill st-warn">${U.km(s.vencendo)}</span>` : `<span class="sub">0,00 km</span>`}</td>
        <td>${s.vencido > 0 ? `<span class="st-pill st-err">${U.km(s.vencido)}</span>` : `<span class="sub">0,00 km</span>`}</td>
        <td><span class="sub">${U.km(s.nunca + s.semrec)}</span></td>
      </tr>`;
    }).join("");

    $("chartSituacaoAreas").innerHTML = `
      <div class="donut-layout">
        ${donutSitu}
        <div class="donut-cards">
          <div class="d-card" style="border-left-color:#16a34a">
            <small>Em dia (&le; ½ recorrência)</small>
            <b>${U.km(totSitu.emdia)}</b><span>(${U.pct(malhaCapinada ? totSitu.emdia / malhaCapinada * 100 : 0)})</span>
          </div>
          <div class="d-card" style="border-left-color:#eab308">
            <small>Perto de vencer</small>
            <b>${U.km(totSitu.vencendo)}</b><span>(${U.pct(malhaCapinada ? totSitu.vencendo / malhaCapinada * 100 : 0)})</span>
          </div>
          <div class="d-card" style="border-left-color:#dc2626">
            <small>Prazo vencido</small>
            <b>${U.km(totSitu.vencido)}</b><span>(${U.pct(malhaCapinada ? totSitu.vencido / malhaCapinada * 100 : 0)})</span>
          </div>
          <div class="d-card" style="border-left-color:#94a3b8">
            <small>Aguardando 1º registro</small>
            <b>${U.km(totSitu.nunca + totSitu.semrec)}</b><span>na base viária</span>
          </div>
        </div>
      </div>
      <div class="tab-wrap">
        <table class="tab-exec">
          <thead>
            <tr><th>Área / Supervisor</th><th>Em Dia</th><th>Perto de Vencer</th><th>Vencido</th><th>Sem Registro</th></tr>
          </thead>
          <tbody>${linhasMatrizSitu}</tbody>
        </table>
      </div>
    `;

    // Evolução Semanal em Gráfico de Colunas Verticais + Modalidade de Serviço
    const sems = Calc.semanas(res);
    const maxSem = Math.max(...sems.map(s => s.m), 1);
    const htmlColSems = sems.map(s => {
      const hPct = Math.max(6, Math.round((s.m / maxSem) * 100));
      const dt = U.data(s.k);
      const lbl = dt ? dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : s.k;
      return `
        <div class="col-item clicavel" data-tip="<b>Semana de ${U.dmy(dt)}</b><br>${U.km(s.m)} executados<br>${s.n} lançamentos<br><small>Clique para ver só esta semana</small>" data-semana="${s.k}">
          <div class="col-val">${U.fmt(s.m / 1000, 1)} km</div>
          <div class="col-bar-wrap">
            <div class="col-bar" style="height:${hPct}%;background:var(--verde)"></div>
          </div>
          <div class="col-lbl">${lbl}</div>
        </div>
      `;
    }).join("");

    const porServ = new Map();
    res.visiveis.forEach(e => {
      const sv = e.servico || "Capinação e raspagem";
      if (!porServ.has(sv)) porServ.set(sv, { n: 0, m: 0 });
      const g = porServ.get(sv); g.n++; g.m += e.metros;
    });
    const maxSv = Math.max(...[...porServ.values()].map(x => x.m), 1);
    const htmlServ = [...porServ.entries()].sort((a, b) => b[1].m - a[1].m).map(([nome, g]) => `
      <div class="bar-row clicavel" data-tip="<b>${U.esc(nome)}</b><br>${U.km(g.m)} em ${g.n} lançamentos<br><small>Clique para filtrar este serviço</small>" data-servico="${U.esc(U.norm(nome))}">
        <div class="bar-lbl">${U.esc(nome)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(g.m / maxSv) * 100}%;background:#0284c7"></div></div>
        <div class="bar-val">${U.km(g.m)} (${g.n})</div>
      </div>
    `).join("");

    $("chartEvolucaoSemanal").innerHTML = `
      <div style="font-size:11.5px;font-weight:700;color:var(--cinza);margin-bottom:4px;text-transform:uppercase">Produção Semanal de Capina (km por semana)</div>
      ${sems.length ? `<div class="col-chart" style="margin-bottom:18px">${htmlColSems}</div>` : `<div class="nota" style="margin-bottom:18px">Sem dados semanais no filtro atual.</div>`}
      <div style="font-size:11.5px;font-weight:700;color:var(--cinza);margin-bottom:8px;text-transform:uppercase">Volume Executado por Tipo de Serviço</div>
      <div class="bar-chart">${htmlServ || `<div class="nota">Sem serviços no filtro atual.</div>`}</div>
    `;
  }

  /* ============================================================================
     ABA 2: SUPERVISORES & PRODUTIVIDADE DAS EQUIPES
     ============================================================================ */
  function renderizarAbaEquipes() {
    const eqs = Calc.produtividade(res);
    const sups = Calc.produtividadeSupervisores(res);
    const meta = CFG.metaEquipeMDia || 1950;

    const mediaEqDia = eqs.length ? eqs.reduce((s, r) => s + r.mDia, 0) / eqs.length : 0;
    const comH = eqs.filter(r => r.mHomemDia);
    const mediaHomemDia = comH.length ? comH.reduce((s, r) => s + r.mHomemDia, 0) / comH.length : 0;
    const eqAcimaMeta = eqs.filter(r => r.mDia >= meta).length;
    const totPlanejadas = Object.values(res.porArea).reduce((s, a) => s + (a.equipes || 0), 0);

    $("kpisEquipes").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-rotulo">Produtividade Média / Equipe</div>
        <div class="kpi-valor">${U.m(mediaEqDia)}/dia</div>
        <div class="kpi-det">Meta operacional: <b>${U.m(meta)}/dia</b> (${U.pct(meta ? mediaEqDia / meta * 100 : 0)} da meta)</div>
      </div>
      <div class="kpi-card info">
        <div class="kpi-rotulo">Produtividade Média / Homem</div>
        <div class="kpi-valor">${mediaHomemDia ? U.m(mediaHomemDia) + "/dia" : "—"}</div>
        <div class="kpi-det">Rendimento individual médio nas frentes de capina</div>
      </div>
      <div class="kpi-card ${eqAcimaMeta >= eqs.length / 2 ? '' : 'alerta'}">
        <div class="kpi-rotulo">Equipes Acima da Meta</div>
        <div class="kpi-valor">${eqAcimaMeta} de ${eqs.length}</div>
        <div class="kpi-det">${U.pct(eqs.length ? eqAcimaMeta / eqs.length * 100 : 0)} das equipes atingiram &ge; ${U.m(meta)}/dia</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-rotulo">Efetivo de Equipes Ativas</div>
        <div class="kpi-valor">${eqs.length} ativas</div>
        <div class="kpi-det">Dimensionamento previsto nas 10 áreas: <b>${totPlanejadas} equipes</b></div>
      </div>
    `;

    // Ranking Supervisores por Km (usando A1, A2... A10 sem acento)
    const maxSupM = Math.max(...sups.map(s => s.m), 1);
    $("chartRankSupKm").innerHTML = `<div class="bar-chart">` + sups.map((s, idx) => {
      return `<div class="bar-row clicavel" data-tip="<b>${U.esc(s.supervisor)}</b> · Área ${s.area || "—"}<br>${U.km(s.m)} em ${s.lancs} lançamentos<br>Média ${U.m(s.mEqDia)} por equipe/dia<br><small>Clique para filtrar este supervisor</small>" data-sup="${U.esc(U.primeiroNome(s.supervisor))}">
        <div class="bar-lbl">${idx + 1}º · <a href="index.html#area=${s.area || 1}" class="link">${U.esc(s.supervisor)}</a> <span class="sub">(Área ${s.area || "—"})</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(s.m / maxSupM) * 100}%;background:var(--verde)"></div></div>
        <div class="bar-val">${U.km(s.m)} (${s.lancs} lançamentos)</div>
      </div>`;
    }).join("") + `</div>`;

    // Bullet Chart de Produtividade com Marcador de Meta (1.950 m/dia)
    const supsPorProd = [...sups].sort((a, b) => b.mEqDia - a.mEqDia);
    const escalaMax = Math.max(meta * 1.2, ...supsPorProd.map(s => s.mEqDia), 1);
    const posMetaPct = (meta / escalaMax) * 100;

    $("chartRankSupProd").innerHTML = `<div class="bar-chart" style="padding-top:10px">` + supsPorProd.map((s, idx) => {
      const pctMeta = meta ? Math.round((s.mEqDia / meta) * 100) : 0;
      const cor = s.mEqDia >= meta ? "#16a34a" : "#d97706";
      return `<div class="bar-row clicavel" data-tip="<b>${U.esc(s.supervisor)}</b><br>Média ${U.m(s.mEqDia)} por equipe/dia = ${pctMeta}% da meta (${U.m(meta)})<br>Por homem/dia: ${s.mHomemDia ? U.m(s.mHomemDia) : "—"}<br><small>Clique para filtrar este supervisor</small>" data-sup="${U.esc(U.primeiroNome(s.supervisor))}">
        <div class="bar-lbl">${idx + 1}º · ${U.esc(s.supervisor)} <span class="sub">(Área ${s.area || "—"})</span></div>
        <div class="bar-track" title="Média: ${U.m(s.mEqDia)} por equipe/dia (${pctMeta}% da meta de 1.950 m) · por homem/dia: ${s.mHomemDia ? U.m(s.mHomemDia) : '—'}">
          <div class="bar-fill" style="width:${(s.mEqDia / escalaMax) * 100}%;background:${cor}"></div>
          <div class="bar-meta-line" style="left:${posMetaPct}%"></div>
        </div>
        <div class="bar-val">${U.m(s.mEqDia)} por dia · <b>${pctMeta}%</b></div>
      </div>`;
    }).join("") + `</div>`;

    // Mapa de Supervisores e suas Equipes
    $("gridSupervisoresEquipes").innerHTML = Object.values(res.porArea).sort((a, b) => a.area - b.area).map(a => {
      const corArea = C.areaMyMaps[a.area] || "#1e7b34";
      const eqsArea = eqs.filter(r => r.area === a.area || U.primeiroNome(r.supervisor) === U.primeiroNome(a.supervisor));
      const sInfo = sups.find(s => U.primeiroNome(s.supervisor) === U.primeiroNome(a.supervisor));
      return `<div class="sup-box" style="border-top: 4px solid ${corArea}">
        <div class="sup-box-top">
          <span class="sup-box-nome">${U.esc(a.supervisor || "Área " + a.area)}</span>
          <a href="index.html#area=${a.area}" class="area-badge" style="background:${corArea}">Área ${a.area} &#8599;</a>
        </div>
        <div class="sup-box-meta">
          SDs: <b>${U.esc(a.sds || "—")}</b> · Equipes ativas: <b>${eqsArea.length}/${a.equipes || "—"}</b><br/>
          Acumulado: <b>${sInfo ? U.km(sInfo.m) : "0 km"}</b> · Média: <b>${sInfo ? U.m(sInfo.mEqDia) + " por equipe/dia" : "—"}</b>
        </div>
        <div class="eq-tags">
          ${eqsArea.length ? eqsArea.map(e => `
            <a href="index.html#equipe=${encodeURIComponent(e.equipe)}" class="eq-tag" title="Ver ruas da equipe ${U.esc(e.equipe)} no Mapa">${U.esc(e.equipe)} · <b>${U.m(e.mDia)} por dia</b> (${U.pct(e.mDia / meta * 100)})</a>
          `).join("") : `<span class="sub">Nenhuma equipe com lançamento no filtro</span>`}
        </div>
      </div>`;
    }).join("");

    // Tabela Geral de Produtividade por Equipe
    $("tabProdEquipes").innerHTML = `
      <table class="tab-exec">
        <thead>
          <tr>
            <th>Posição</th><th>Equipe</th><th>Supervisor Responsável</th><th>Área</th><th>Dias Trabalhados</th>
            <th>Total Executado</th><th>Média Equipe / Dia</th><th>% da Meta (1.950m)</th><th>Média Homem / Dia</th><th>Status Meta</th>
          </tr>
        </thead>
        <tbody>
          ${eqs.map((r, i) => {
            const pMeta = meta ? (r.mDia / meta) * 100 : 0;
            const st = pMeta >= 100
              ? `<span class="st-pill st-ok">ACIMA DA META</span>`
              : pMeta >= 88
              ? `<span class="st-pill st-warn">PRÓXIMO À META</span>`
              : `<span class="st-pill st-err">ABAIXO DA META</span>`;
            const corA = C.areaMyMaps[r.area] || "#e2e8f0";
            return `<tr>
              <td><b>${i + 1}º</b></td>
              <td><a href="index.html#equipe=${encodeURIComponent(r.equipe)}" class="link"><b>${U.esc(r.equipe)}</b> &#8599;</a></td>
              <td>${U.esc(r.supervisor || "—")}</td>
              <td>${r.area ? `<a href="index.html#area=${r.area}" class="area-badge" style="background:${corA}">Área ${r.area}</a>` : "—"}</td>
              <td>${r.dias} dia(s)</td>
              <td><b>${U.km(r.m)}</b> <span class="sub">(${U.m(r.m)})</span></td>
              <td><b>${U.m(r.mDia)}</b></td>
              <td><b>${U.pct(pMeta)}</b></td>
              <td>${r.mHomemDia ? U.dec(r.mHomemDia, 1) + " m" : "—"}</td>
              <td>${st}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  /* ============================================================================
     ABA 3: PONTOS CRÍTICOS & DIMENSIONAMENTO DE FROTA CB
     ============================================================================ */
  function renderizarAbaPontos() {
    const est = CFG.estudoOperacional || {};
    const cenario = {
      totalViagens: 8123,
      tonTotal: 25143.6,
      mediaTonPorViagem: 3.10,
      tonDiaTotal: 279.4,
      tonDiaPontosCriticos: 195.6
    };

    const pts = DADOS_GEO.pontos.map(p => {
      const reg = res.pontos[p.cod];
      const st = Calc.statusPonto(reg);
      return { ...p, reg, st };
    });

    const nCol = pts.filter(p => p.st === "coletado").length;
    const nNao = pts.filter(p => p.st === "nao").length;
    const nPend = pts.filter(p => p.st === "pendente").length;

    const areasEstudo = Object.entries(est);
    const totFrota = areasEstudo.reduce((s, [, v]) => s + (v.cb || 0), 0);
    const totViagens = areasEstudo.reduce((s, [, v]) => s + (v.viagens || 0), 0);

    $("kpisPontos").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-rotulo">Pontos Críticos Mapeados</div>
        <div class="kpi-valor">${pts.length} pontos</div>
        <div class="kpi-det"><b>134</b> coleta manual · <b>46</b> patrulha mecanizada (Áreas 2 a 10)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-rotulo">Pontos Coletados no Período</div>
        <div class="kpi-valor" style="color:#15803d">${nCol}</div>
        <div class="kpi-det"><b>${U.pct(pts.length ? nCol / pts.length * 100 : 0)}</b> do total mapeado já atendido</div>
      </div>
      <div class="kpi-card critico">
        <div class="kpi-rotulo">Pontos Não Coletados (Alerta)</div>
        <div class="kpi-valor" style="color:#b91c1c">${nNao}</div>
        <div class="kpi-det"><a href="index.html#filtroPonto=nao" class="link" style="color:#b91c1c">Ver no mapa &#8599;</a> · <b>${nPend}</b> aguardando coleta</div>
      </div>
      <div class="kpi-card info">
        <div class="kpi-rotulo">Caminhões basculantes dimensionados</div>
        <div class="kpi-valor">${totFrota} caminhões</div>
        <div class="kpi-det"><b>${totViagens} viagens/dia</b> · Capacidade: ${U.dec(cenario.mediaTonPorViagem, 2)} t/viagem</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-rotulo">Massa Diária em Pontos Críticos</div>
        <div class="kpi-valor">${U.dec(cenario.tonDiaPontosCriticos, 1)} t/dia</div>
        <div class="kpi-det">70% de ${U.dec(cenario.tonDiaTotal, 1)} t/dia (${U.int(cenario.totalViagens)} viagens no histórico)</div>
      </div>
    `;

    // Tabela do Estudo de Dimensionamento Logístico e Frota CB
    let sPts = 0, sMan = 0, sMec = 0, sGar = 0, sRot = 0, sAt = 0, sTotKm = 0, sPeso = 0, sViag = 0, sCB = 0, sJorn = 0;
    const linhasFrota = areasEstudo.map(([areaNum, d]) => {
      const a = res.porArea[areaNum] || { area: areaNum, supervisor: "Área " + areaNum };
      const corArea = C.areaMyMaps[areaNum] || "#e2e8f0";
      sPts += d.pontos; sMan += d.manual; sMec += d.mecanizada;
      sGar += d.kmGaragem; sRot += d.kmRoteiro; sAt += d.kmAterro; sTotKm += d.kmTotal;
      sPeso += d.pesoDia; sViag += d.viagens; sCB += d.cb; sJorn += d.horasTotal;

      return `<tr>
        <td><a href="index.html#area=${areaNum}" class="area-badge" style="background:${corArea}">Área ${areaNum} &#8599;</a></td>
        <td><b>${U.esc(a.supervisor || "—")}</b></td>
        <td><b>${d.pontos}</b> <span class="sub">(${d.manual} manual / ${d.mecanizada} mecanizada)</span></td>
        <td>${U.dec(d.kmGaragem, 1)} km</td>
        <td><b>${U.dec(d.kmRoteiro, 1)} km</b></td>
        <td>${U.dec(d.kmAterro, 1)} km</td>
        <td><b>${U.dec(d.kmTotal, 1)} km</b></td>
        <td><span class="st-pill ${d.pctLogistico > 65 ? 'st-warn' : 'st-info'}">${U.dec(d.pctLogistico, 1)}%</span></td>
        <td><b>${U.dec(d.pesoDia, 1)} t/dia</b></td>
        <td><b>${d.viagens}</b> viagens/dia</td>
        <td><span class="st-pill st-ok" style="font-size:12px">${d.cb} caminhões</span></td>
        <td>${U.dec(d.horasTotal, 1)} h <span class="sub">(${Math.round(d.minRota)} min de rota + ${d.minColeta} min de coleta + ${d.minDescarga} min de descarga)</span></td>
      </tr>`;
    }).join("");

    const pctLogMedio = sTotKm ? ((sGar + sAt) / sTotKm) * 100 : 0;
    $("tabEstudoFrota").innerHTML = `
      <table class="tab-exec">
        <thead>
          <tr>
            <th>Área</th><th>Supervisor</th><th>Pontos (manual / mecanizada)</th><th>Garagem</th><th>Roteiro Produtivo</th>
            <th>Aterro</th><th>Distância Total</th><th>% Logístico</th><th>Peso Estimado</th><th>Viagens Necessárias</th>
            <th>Caminhões basculantes</th><th>Jornada Operacional Total</th>
          </tr>
        </thead>
        <tbody>
          ${linhasFrota}
          <tr class="total-row">
            <td colspan="2">TOTAL DIMENSIONADO (ÁREAS 2 A 10)</td>
            <td>${sPts} (${sMan} manual / ${sMec} mecanizada)</td>
            <td>${U.dec(sGar, 1)} km</td>
            <td>${U.dec(sRot, 1)} km</td>
            <td>${U.dec(sAt, 1)} km</td>
            <td>${U.dec(sTotKm, 1)} km</td>
            <td>${U.dec(pctLogMedio, 1)}%</td>
            <td>${U.dec(sPeso, 1)} t/dia</td>
            <td>${sViag} viagens/dia</td>
            <td>${sCB} caminhões</td>
            <td>${U.dec(sJorn, 1)} h</td>
          </tr>
        </tbody>
      </table>
    `;

    // NOVO GRÁFICO DE PONTOS CRÍTICOS: Donut SVG + Gráfico de Colunas Verticais Agrupadas por Área (substitui o gráfico empilhado)
    const areasComPontos = Object.values(res.porArea).sort((a, b) => a.area - b.area).filter(a => pts.some(p => p.area === a.area));
    const maxPtsArea = Math.max(...areasComPontos.map(a => pts.filter(p => p.area === a.area).length), 1);

    const donutPts = svgDonut([
      { valor: nCol, cor: "#16a34a", tip: `<b>Coletados</b><br>${nCol} pontos<br><small>Clique para ver no mapa</small>`, href: "index.html#filtroPonto=coletado" },
      { valor: nNao, cor: "#dc2626", tip: `<b>Não coletados</b><br>${nNao} pontos<br><small>Clique para ver no mapa</small>`, href: "index.html#filtroPonto=nao" },
      { valor: nPend, cor: "#f59e0b", tip: `<b>Pendentes</b><br>${nPend} pontos<br><small>Clique para ver no mapa</small>`, href: "index.html#filtroPonto=pendente" }
    ], `${nCol}/${pts.length}`, "Coletados");

    const colsPtsHtml = areasComPontos.map(a => {
      const pa = pts.filter(p => p.area === a.area);
      const c = pa.filter(p => p.st === "coletado").length;
      const n = pa.filter(p => p.st === "nao").length;
      const p = pa.filter(p => p.st === "pendente").length;
      const hc = Math.max(4, Math.round((c / maxPtsArea) * 100));
      const hn = n > 0 ? Math.max(8, Math.round((n / maxPtsArea) * 100)) : 0;
      const hp = Math.max(4, Math.round((p / maxPtsArea) * 100));
      return `
        <div class="col-item clicavel" data-tip="<b>Área ${a.area}</b> · ${U.esc(a.supervisor)}<br>${c} coletados<br>${n} não coletados<br>${p} pendentes<br><small>Clique para abrir a área no mapa</small>" data-href="index.html#area=${a.area}">
          <div class="col-val">${c}/${pa.length}</div>
          <div class="col-bar-wrap">
            <div class="col-bar fino" style="height:${hc}%;background:#16a34a"></div>
            ${n > 0 ? `<div class="col-bar fino" style="height:${hn}%;background:#dc2626"></div>` : ""}
            <div class="col-bar fino" style="height:${hp}%;background:#f59e0b"></div>
          </div>
          <div class="col-lbl"><a href="index.html#area=${a.area}" class="link">Área ${a.area}</a></div>
        </div>
      `;
    }).join("");

    $("chartPontosArea").innerHTML = `
      <div class="donut-layout">
        ${donutPts}
        <div class="donut-cards">
          <div class="d-card" style="border-left-color:#16a34a">
            <small>Coletados</small>
            <b>${nCol} pontos</b><span>(${U.pct(pts.length ? nCol / pts.length * 100 : 0)})</span>
          </div>
          <div class="d-card" style="border-left-color:#dc2626">
            <small>Não Coletados (Alerta)</small>
            <b>${nNao} pontos</b><span>(${U.pct(pts.length ? nNao / pts.length * 100 : 0)})</span>
          </div>
          <div class="d-card" style="border-left-color:#f59e0b">
            <small>Pendentes na Rota</small>
            <b>${nPend} pontos</b><span>(${U.pct(pts.length ? nPend / pts.length * 100 : 0)})</span>
          </div>
        </div>
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--cinza);text-transform:uppercase;margin-bottom:4px">
        Comparativo por Área (Colunas: <span style="color:#16a34a">&#9632; Coletados</span> · <span style="color:#dc2626">&#9632; Não Coletados</span> · <span style="color:#d97706">&#9632; Pendentes</span>)
      </div>
      <div class="col-chart">${colsPtsHtml}</div>
    `;

    // Perfil dos Pontos Críticos (Material e Patrulha)
    const porMat = new Map(), porPat = new Map();
    pts.forEach(p => {
      const m = p.material || "Não informado";
      const pt = p.patrulha || "Manual";
      porMat.set(m, (porMat.get(m) || 0) + 1);
      porPat.set(pt, (porPat.get(pt) || 0) + 1);
    });
    $("chartPerfilPontos").innerHTML = `
      <div style="font-size:11.5px;font-weight:700;color:var(--cinza);margin-bottom:8px;text-transform:uppercase">Modalidade de Coleta (Patrulha)</div>
      <div class="bar-chart" style="margin-bottom:18px">
        ${[...porPat.entries()].map(([k, v]) => `
          <div class="bar-row" data-tip="<b>${U.esc(k)}</b><br>${v} pontos (${U.pct(v / pts.length * 100)} do total)">
            <div class="bar-lbl">${U.esc(k)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(v / pts.length) * 100}%;background:var(--verde)"></div></div>
            <div class="bar-val">${v} pontos (${U.pct(v / pts.length * 100)})</div>
          </div>
        `).join("")}
      </div>
      <div style="font-size:11.5px;font-weight:700;color:var(--cinza);margin-bottom:8px;text-transform:uppercase">Classificação por Tipo de Resíduo</div>
      <div class="bar-chart">
        ${[...porMat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `
          <div class="bar-row" data-tip="<b>${U.esc(k)}</b><br>${v} pontos (${U.pct(v / pts.length * 100)} do total)">
            <div class="bar-lbl">${U.esc(k)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(v / pts.length) * 100}%;background:#0284c7"></div></div>
            <div class="bar-val">${v} pontos (${U.pct(v / pts.length * 100)})</div>
          </div>
        `).join("")}
      </div>
    `;

    // Tabela de Alerta: Pontos Não Coletados
    const listaNao = pts.filter(p => p.st === "nao");
    $("tabPontosNaoColetados").innerHTML = listaNao.length ? `
      <table class="tab-exec">
        <thead>
          <tr>
            <th>Código</th><th>Área / Supervisor</th><th>Identificação / Localização</th><th>Bairro</th>
            <th>Patrulha</th><th>Material</th><th>Data do Registro</th><th>Motivo / Observação de Campo</th>
          </tr>
        </thead>
        <tbody>
          ${listaNao.map(p => {
            const a = res.porArea[p.area] || {};
            const corArea = C.areaMyMaps[p.area] || "#e2e8f0";
            return `<tr>
              <td><a href="index.html#ponto=${encodeURIComponent(p.cod)}" class="link"><b style="color:#b91c1c">${U.esc(p.cod)} &#8599;</b></a></td>
              <td><a href="index.html#area=${p.area}" class="area-badge" style="background:${corArea}">Área ${p.area}</a> ${U.esc(a.supervisor || "")}</td>
              <td><b>${U.esc(p.id || "—")}</b></td>
              <td>${U.esc(p.bairro || "—")}</td>
              <td>${U.esc(p.patrulha || "—")}</td>
              <td>${U.esc(p.material || "—")}</td>
              <td>${p.reg && p.reg.data ? U.dmy(p.reg.data) : "Sem data"}</td>
              <td><span class="st-pill st-err">${U.esc((p.reg && p.reg.obs) || "Impedimento em campo")}</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    ` : `<div class="nota">Nenhum ponto crítico marcado como Não Coletado no período selecionado.</div>`;
  }

  /* ---------- Eventos de UI ---------- */
  function selecionarAba(aba) {
    document.querySelectorAll("#dashAbas .dash-aba").forEach(b => b.classList.toggle("on", b.dataset.aba === aba));
    $("sec-capina").hidden   = aba !== "capina";
    $("sec-equipes").hidden  = aba !== "equipes";
    $("sec-pontos").hidden   = aba !== "pontos";
    $("sec-planilha").hidden = aba !== "planilha";
  }

  function atualizarModoTesteUI() {
    const btToggle = $("btToggleModoTeste");
    const txt = $("txtEstadoTeste");
    const btAba = $("btAbaPlanilha");
    if (btToggle) btToggle.classList.toggle("on", modoTesteAtivo);
    if (txt) txt.textContent = modoTesteAtivo ? "Ativo" : "Desativado";
    if (btAba) btAba.hidden = !modoTesteAtivo;
    if (!modoTesteAtivo && !$("sec-planilha").hidden) {
      selecionarAba("capina");
    }
  }

  function iniciarEventos() {
    atualizarModoTesteUI();

    const btTeste = $("btToggleModoTeste");
    if (btTeste) {
      btTeste.onclick = () => {
        modoTesteAtivo = !modoTesteAtivo;
        U.guardar("modo_teste_planilha", modoTesteAtivo);
        atualizarModoTesteUI();
        if (modoTesteAtivo) selecionarAba("planilha");
      };
    }

    // Alternar abas
    document.querySelectorAll("#dashAbas .dash-aba").forEach(bt => {
      bt.onclick = () => selecionarAba(bt.dataset.aba);
    });

    // Se a URL tiver #planilha, abre direto a aba da planilha
    if (window.location.hash === "#planilha") {
      modoTesteAtivo = true;
      U.guardar("modo_teste_planilha", true);
      atualizarModoTesteUI();
      selecionarAba("planilha");
    }

    // Alternar fonte de dados
    const atualizarBotoesFonte = () => {
      document.querySelectorAll("#dashSegFonte button").forEach(b => b.classList.toggle("on", b.dataset.fonte === fonte));
      $("btDashEscolherExcel").hidden = fonte !== "excel";
      $("dashPainelGoogle").hidden = fonte !== "google";
    };
    atualizarBotoesFonte();

    document.querySelectorAll("#dashSegFonte button").forEach(b => {
      b.onclick = () => {
        fonte = b.dataset.fonte;
        U.guardar("fonte_novo", fonte);
        atualizarBotoesFonte();
        if (fonte === "excel" && !arqExcel) {
          $("inDashExcel").click();
        } else {
          carregar();
        }
      };
    });

    $("btDashEscolherExcel").onclick = () => $("inDashExcel").click();
    $("inDashExcel").onchange = async e => {
      if (e.target.files[0]) {
        arqExcel = e.target.files[0];
        fonte = "excel";
        U.guardar("fonte_novo", fonte);
        await U.salvarArq("excel", arqExcel);
        atualizarBotoesFonte();
        carregar();
      }
    };

    if ($("inDashLink")) $("inDashLink").value = U.ler("planilha", "") || CFG.planilha;
    if ($("btDashUsarLink")) $("btDashUsarLink").onclick = () => {
      U.guardar("planilha", $("inDashLink").value.trim());
      carregar();
    };
    if ($("btDashAtualizar")) $("btDashAtualizar").onclick = carregar;

    // Botões de período rápido
    document.querySelectorAll("#dashSegPer button").forEach(b => {
      b.onclick = () => periodo(b.dataset.per);
    });

    // Filtros
    ["dIni", "dFim"].forEach(id => {
      $(id).onchange = () => { marcarPeriodo(""); recalcular(); };
    });
    ["dCiclo", "dSup", "dServico"].forEach(id => {
      $(id).onchange = recalcular;
    });
    $("btLimparFiltros").onclick = () => {
      $("dCiclo").value = "";
      $("dIni").value = "";
      $("dFim").value = "";
      $("dSup").value = "";
      $("dServico").value = "";
      marcarPeriodo("tudo");
      recalcular();
    };

    // Exportações Excel
    $("btExpProd").onclick = () => res && Exportar.produtividade(res);
    $("btExpSemanal").onclick = () => res && Exportar.semanal(res);
    $("btExpLanc").onclick = () => res && Exportar.lancamentos(res, res.visiveis, "dashboard");
    $("btExpPBI").onclick = () => base && Exportar.powerbi(base, dataRef());
    ligarGraficos();
    ligarFormulario();
  }

  /* ---------- Gráficos: dica ao passar o mouse e clique para filtrar / abrir no mapa ---------- */
  function ligarGraficos() {
    const dica = document.createElement("div"); dica.className = "dash-dica"; dica.hidden = true; document.body.appendChild(dica);
    document.addEventListener("mouseover", ev => { const el = ev.target.closest && ev.target.closest("[data-tip]"); if (!el) { dica.hidden = true; return; } dica.innerHTML = el.dataset.tip; dica.hidden = false; });
    document.addEventListener("mousemove", ev => { if (dica.hidden) return; const w = dica.offsetWidth, h = dica.offsetHeight; let x = ev.clientX + 14, y = ev.clientY + 14; if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (y + h > innerHeight - 8) y = ev.clientY - h - 14; dica.style.left = x + "px"; dica.style.top = y + "px"; });
    document.addEventListener("scroll", () => { dica.hidden = true; }, true);
    document.addEventListener("click", ev => {
      if (ev.target.closest("a")) return;
      const el = ev.target.closest("[data-semana],[data-servico],[data-sup],[data-href]"); if (!el) return;
      if (el.dataset.semana && el.dataset.semana !== "sem-data") { const a = U.data(el.dataset.semana), b = new Date(a); b.setDate(b.getDate() + 6); $("dIni").value = U.ymd(a); $("dFim").value = U.ymd(b); $("dCiclo").value = ""; marcarPeriodo(""); recalcular(); }
      else if (el.dataset.servico) { $("dServico").value = $("dServico").value === el.dataset.servico ? "" : el.dataset.servico; recalcular(); }
      else if (el.dataset.sup) { $("dSup").value = $("dSup").value === el.dataset.sup ? "" : el.dataset.sup; recalcular(); }
      else if (el.dataset.href) window.open(el.dataset.href, "_blank");
      dica.hidden = true;
    });
  }

  /* ---------- Aba Planilha e Formulário ---------- */
  function ligarFormulario() {
    const sub = document.querySelectorAll("#segPlanForm button");
    const mostrar = q => {
      sub.forEach(b => b.classList.toggle("on", b.dataset.sub === q));
      $("containerEditorPlanilha").hidden = q !== "planilha"; $("containerForms").hidden = q !== "forms"; $("containerFormLocal").hidden = q !== "local";
      if (q === "forms" && !$("ifrForms").src) $("ifrForms").src = (CFG.formulario || "").replace(/\/edit.*$|\/viewform.*$/, "/viewform") + "?embedded=true";
      if (q === "local") montarFormLocal();
    };
    sub.forEach(b => b.onclick = () => mostrar(b.dataset.sub));
    if ($("lnkFormsNova")) $("lnkFormsNova").href = (CFG.formulario || "#");
    if ((CFG.recursos || {}).formulario === false) document.querySelectorAll('#segPlanForm [data-sub="forms"]').forEach(b => b.hidden = true);
    if (/forms/.test(location.hash)) { selecionarAba("planilha"); mostrar("forms"); }
  }
  function montarFormLocal() {
    const box = $("containerFormLocal"); if (box.dataset.ok) return; box.dataset.ok = "1";
    const areas = (base && base.areas.length ? base.areas : CFG.areasPadrao).slice().sort((a, b) => a.area - b.area);
    const nomesRuas = (typeof LOC !== "undefined" && LOC.nomesTodos) ? [...new Set(LOC.nomesTodos())].sort() : [];
    const opc = l => l.map(x => `<option>${U.esc(x)}</option>`).join("");
    box.innerHTML = `
      <div class="dash-painel-cab"><div><div class="dash-painel-tit">Lançamento de Capina – Executado</div><div class="dash-painel-sub">Mesmas perguntas do formulário. O lançamento entra na aba Executado da planilha de teste e aparece no mapa e no dashboard.</div></div></div>
      <form id="formLocal" class="form-local">
        <label>Data do serviço *<input type="date" name="data" required value="${U.ymd(new Date())}"></label>
        <label>Lançado por<select name="lancado">${opc(["Supervisor", "CCO", "Planejamento", "Zeladoria"])}</select></label>
        <label>Área<select name="area"><option value=""></option>${areas.map(a => `<option value="${a.area}">Área ${a.area} · ${U.esc(a.supervisor)}</option>`).join("")}</select></label>
        <label>Supervisor<select name="supervisor"><option value=""></option>${opc([...new Set(areas.map(a => a.supervisor))])}</select></label>
        <label>Equipe<input type="text" name="equipe" placeholder="Ex.: CR 07-A"></label>
        <label>Bairro<input type="text" name="bairro"></label>
        <label class="largo">Rua *<input type="text" name="rua" list="dlRuas" required placeholder="Comece a digitar o nome da rua"></label>
        <label>Perímetro - de<input type="text" name="de" list="dlRuas"></label>
        <label>Perímetro - até<input type="text" name="ate" list="dlRuas"></label>
        <label>Extensão (m)<input type="number" name="metros" min="0" step="1"></label>
        <label>Ciclo<input type="text" name="ciclo" placeholder="Ex.: C04"></label>
        <label>Serviço *<select name="servico" required>${opc(CFG.servicos || ["Capinação e raspagem"])}</select></label>
        <label>Nº de homens<input type="number" name="homens" min="0" step="1"></label>
        <label class="largo">Observação<input type="text" name="obs"></label>
        <datalist id="dlRuas">${opc(nomesRuas)}</datalist>
        <div class="largo" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="submit">Enviar lançamento</button><span id="formLocalMsg" class="sub"></span></div>
      </form>`;
    const f = $("formLocal");
    f.area.onchange = () => { const a = areas.find(x => String(x.area) === f.area.value); if (a) f.supervisor.value = a.supervisor; };
    f.supervisor.onchange = () => { const a = areas.find(x => x.supervisor === f.supervisor.value); if (a && !f.area.value) f.area.value = a.area; };
    f.onsubmit = ev => {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(f).entries()), agora = new Date();
      EditorPlanilha.adicionarLancamento({
        "Carimbo de data/hora": U.ymd(agora) + " " + agora.toTimeString().slice(0, 8), "Data do serviço": v.data, "Lançado por": v.lancado, "Supervisor": v.supervisor, "Equipe": v.equipe,
        "Área": v.area ? +v.area : "", "Bairro": v.bairro, "Rua": v.rua, "Perímetro - de": v.de, "Perímetro - até": v.ate, "Extensão (m)": v.metros ? +v.metros : "",
        "Ciclo": v.ciclo, "Serviço": v.servico, "Nº de homens": v.homens ? +v.homens : "", "Observação": v.obs
      });
      $("formLocalMsg").textContent = "Lançamento enviado às " + agora.toLocaleTimeString("pt-BR") + ".";
      ["rua", "de", "ate", "metros", "obs"].forEach(k => f[k].value = "");
    };
  }

  iniciarEventos();
  carregar();
})();
