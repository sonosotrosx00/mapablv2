/* Cálculos (sem tela): ciclos, % por área, lançamentos, ruas, semanas, produtividade */
const Calc = (() => {
  const GEO = DADOS_GEO;
  const AREAS_POLY = {}; GEO.areas.forEach(a => AREAS_POLY[a.area] = a.polys);
  let ruasProntas = false;
  const prepararRuas = () => { if (!ruasProntas) { LOC.iniciar(DADOS_RUAS); ruasProntas = true; } };

  /* ---------- índice: área de cada segmento e extensão de cada rua por área ---------- */
  let SEG_AREA = null; const RUAS_AREA = {};
  function indexar() {
    if (SEG_AREA) return; prepararRuas();
    const caixas = {};
    Object.entries(AREAS_POLY).forEach(([n, polys]) => { let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
      polys.forEach(p => p[0].forEach(([y, x]) => { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); })); caixas[n] = [y0, y1, x0, x1]; RUAS_AREA[n] = {}; });
    const N = LOC.totalSegs(); SEG_AREA = new Int8Array(N);
    for (let si = 0; si < N; si++) {
      const m = LOC.meioSeg(si);
      for (const [n, c] of Object.entries(caixas)) {
        if (m[0] < c[0] || m[0] > c[1] || m[1] < c[2] || m[1] > c[3] || !LOC.pontoNoPoligono(m, AREAS_POLY[n])) continue;
        SEG_AREA[si] = +n; const k = LOC.chaveDoSeg(si);
        const r = RUAS_AREA[n][k] || (RUAS_AREA[n][k] = { nome: LOC.nomeDe(si), total: 0 }); r.total += LOC.comprSeg(si); break;
      }
    }
  }

  /* ---------- pontos críticos ---------- */
  function statusPonto(r) {
    if (!r) return "pendente";
    if (/^nao|nao colet|^n$/.test(r.status)) return "nao";
    if (/colet|feito|realiz|^ok|^sim|^s$/.test(r.status)) return "coletado";
    return "pendente";
  }
  function ultimoPorPonto(regs, noPeriodo) {
    const out = {};
    // Pontos sem data preenchida na planilha continuam válidos mesmo com filtro de período ativo
    regs.filter(r => !r.data || noPeriodo(r.data)).forEach(r => {
      const a = out[r.cod], t = r.data ? r.data.getTime() : 0, ta = a ? (a.data ? a.data.getTime() : 0) : -1;
      if (!a || t > ta || (t === ta && r.linha > a.linha)) out[r.cod] = r;
    });
    return out;
  }

  /* ---------- lançamentos ---------- */
  const cacheLoc = new Map();
  function areaDoSupervisor(areas, sup) { const n = U.primeiroNome(sup); const a = n && areas.find(x => U.primeiroNome(x.supervisor) === n); return a ? a.area : null; }
  function localizar(r, areaSup) {
    if (r._t) { // exemplo já localizado
      if (!r._loc) { prepararRuas(); r._loc = r._t === "nao" ? { ok: false, motivo: "rua não encontrada na base" } : { ok: true, tipo: r._t, ids: r._s, linhas: LOC.linhasDe(r._s), metros: r._m, ruaBase: LOC.nomeDe(r._s[0]) }; }
      return r._loc;
    }
    const k = [r.rua, r.de, r.ate, r.area, Math.round(r.m || 0), areaSup].join("|");
    if (!cacheLoc.has(k)) { prepararRuas(); cacheLoc.set(k, LOC.localizar({ rua: r.rua, de: r.de, ate: r.ate, area: r.area, areaSup, m: r.m }, AREAS_POLY)); }
    return cacheLoc.get(k);
  }
  function metrosConsiderados(r, loc) {
    const mapa = loc.ok && loc.tipo === "trecho" ? loc.metros : 0;
    return CFG.fonteMetros === "mapa" ? (mapa || r.m || 0) : (r.m || mapa || 0);
  }
  function cicloDaData(ciclos, area, d) {
    if (!d || !area) return null;
    return ciclos.filter(c => c.area === area && c.inicio <= d && (!c.fim || d <= c.fim)).sort((a, b) => b.inicio - a.inicio)[0] || null;
  }

  /* ---------- cálculo principal ---------- */
  function calcular(base, f) {
    indexar();
    const noPeriodo = d => (!f.ini && !f.fim) || (d && (!f.ini || d >= f.ini) && (!f.fim || d <= f.fim));
    const areas = base.areas;
    const ref = f.ref;

    const todos = base.lancamentos.map((r, i) => {
      const areaSup = areaDoSupervisor(areas, r.supervisor);
      const loc = localizar(r, areaSup);
      const areaMapa = r._areaMapa !== undefined ? r._areaMapa : (loc.ok ? LOC.areaDoTrecho(loc.linhas, AREAS_POLY) : null);
      const areaRef = r.area || areaMapa;
      // área informada que o trecho no mapa nem toca (ex.: informou Área 1 numa rua da Área 7); ruas de divisa não contam
      const divergente = !!(r.area && areaMapa && r.area !== areaMapa && AREAS_POLY[r.area] && !loc.linhas.some(l => l.some(pt => LOC.pontoNoPoligono(pt, AREAS_POLY[r.area]))));
      const capina = !r.servico || CFG.servicoCapina.test(r.servico);
      const cic = cicloDaData(base.ciclos, areaRef, r.data);
      return { ...r, idx: i, loc, areaSup, areaMapa, areaRef, fora: !!(areaSup && ((areaRef && areaSup !== areaRef) || (divergente && areaMapa !== areaSup))), areaDivergente: divergente, capina,
               metros: metrosConsiderados(r, loc), cicloCalc: cic ? cic.ciclo : (r.ciclo || "") };
    });
    const naSelecao = e => f.ciclo ? e.cicloCalc === f.ciclo : noPeriodo(e.data);
    const visiveis = todos.filter(e => naSelecao(e) && (!f.servico || U.norm(e.servico) === f.servico) && (!f.supervisor || U.primeiroNome(e.supervisor) === f.supervisor));

    // por área
    const porArea = {};
    const somaJanela = (area, jan) => {
      const lanc = todos.filter(e => e.capina && e.areaRef === area && jan(e.data));
      const tab = base.capina.filter(r => r.area === area && jan(r.data));
      return { feito: lanc.reduce((s, e) => s + e.metros, 0) + tab.reduce((s, r) => s + r.km * 1000, 0), n: lanc.length, tab };
    };
    const janelaCiclo = c => d => d && d >= c.inicio && d <= (c.fim || ref);
    areas.forEach(a => {
      const plano = (a.km || 0) * 1000, pctDe = m => plano ? Math.min(m, plano) / plano * 100 : 0;
      const doArea = base.ciclos.filter(c => c.area === a.area).sort((x, y) => x.inicio - y.inicio);
      const ciclos = doArea.map(c => { const r = somaJanela(a.area, janelaCiclo(c)); return { ...c, feito: r.feito, n: r.n, pct: pctDe(r.feito), dias: U.dias(c.inicio, c.fim || ref) + 1 }; });
      const ciclo = f.ciclo ? doArea.filter(c => c.ciclo === f.ciclo).pop() || null : doArea.filter(c => c.inicio <= ref).pop() || null;
      const ini = ciclo ? ciclo.inicio : f.ini, fim = ciclo ? (ciclo.fim || ref) : f.fim;
      const jan = ciclo ? janelaCiclo(ciclo) : (f.ciclo ? () => false : noPeriodo);
      const r = somaJanela(a.area, jan);
      porArea[a.area] = { ...a, ciclo, ciclos, semCiclo: !!f.ciclo && !ciclo, janela: { ini, fim }, feito: r.feito, nCiclo: r.n, plano, pct: pctDe(r.feito),
        diasCiclo: ciclo ? U.dias(ciclo.inicio, ciclo.fim || ref) + 1 : null, exec: visiveis.filter(e => e.areaRef === a.area), regsCapina: r.tab, ruas: {} };
    });

    // % por lançamento
    visiveis.forEach(e => {
      const A = porArea[e.areaRef];
      e.pctArea = A && A.plano ? e.metros / A.plano * 100 : null;
      e.pctRua = null; e.ruaTotal = null; e.ruaArea = null; e.ruaChave = null;
      if (!e.loc.ok || e.loc.tipo === "rua" || !e.loc.ids) return;
      const k = LOC.chaveDoSeg(e.loc.ids[0]), n = SEG_AREA[e.loc.ids[0]] || e.areaRef, tot = (RUAS_AREA[n] || {})[k];
      if (tot && tot.total) { e.ruaTotal = tot.total; e.pctRua = Math.min(e.loc.metros, tot.total) / tot.total * 100; e.ruaArea = n; e.ruaChave = k; }
    });

    // ruas trabalhadas por área: olha o histórico de capina até a data de referência (para bater com Situação das Ruas)
    todos.filter(e => e.capina && (!e.data || e.data <= ref) && (!f.supervisor || U.primeiroNome(e.supervisor) === f.supervisor)).forEach(e => {
      if (!e.loc.ok || e.loc.tipo === "rua" || !e.loc.ids) return;
      e.loc.ids.forEach(si => {
        const n = SEG_AREA[si]; if (!n || !porArea[n]) return;
        const k = LOC.chaveDoSeg(si);
        const ra = porArea[n].ruas[k] || (porArea[n].ruas[k] = { nome: (RUAS_AREA[n][k] || {}).nome || LOC.nomeDe(si), total: (RUAS_AREA[n][k] || {}).total || 0, segs: new Set(), feito: 0, ult: null });
        if (!ra.segs.has(si)) { ra.segs.add(si); ra.feito += LOC.comprSeg(si); }
        if (e.data && (!ra.ult || e.data > ra.ult)) ra.ult = e.data;
      });
    });

    const pontos = ultimoPorPonto(base.pontos, noPeriodo);
    const totPlano = areas.reduce((s, a) => s + (a.km || 0) * 1000, 0);
    const totFeito = Object.values(porArea).reduce((s, a) => s + Math.min(a.feito, a.plano), 0);
    return { todos, visiveis, porArea, pontos, totPlano, totFeito, ref, filtroSup: f.supervisor || "", ciclo: f.ciclo || "", codigosCiclo: [...new Set(base.ciclos.map(c => c.ciclo))].sort() };
  }

  /* ---------- situação das ruas (tempo desde a última capina até a data de referência) ---------- */
  function situacao(dias, rec) { if (dias == null) return "nunca"; if (!rec) return "semrec"; if (dias <= rec / 2) return "emdia"; if (dias <= rec) return "vencendo"; return "vencido"; }
  function situacaoRuas(res) {
    indexar();
    const ult = new Map();
    // Olha todos os lançamentos de capina até res.ref (não zera quando o usuário filtra "Esta semana" ou outro serviço)
    res.todos.forEach(e => {
      if (!e.capina || !e.loc.ok || e.loc.tipo === "rua" || !e.loc.ids) return;
      if (e.data && e.data > res.ref) return;
      if (res.filtroSup && U.primeiroNome(e.supervisor) !== res.filtroSup) return;
      e.loc.ids.forEach(si => { const a = ult.get(si); if (!a || (e.data && (!a.d || e.data > a.d))) ult.set(si, { d: e.data, e }); });
    });
    const segs = [], resumo = {};
    Object.keys(res.porArea).forEach(n => resumo[n] = { emdia: 0, vencendo: 0, vencido: 0, semrec: 0, nunca: 0 });
    const N = LOC.totalSegs();
    for (let si = 0; si < N; si++) {
      const n = SEG_AREA[si]; if (!n || !resumo[n]) continue;
      const u = ult.get(si), rec = res.porArea[n].recorrencia;
      const d = u && u.d ? U.dias(u.d, res.ref) : (u ? Infinity : null);
      const s = situacao(d, rec); resumo[n][s] += LOC.comprSeg(si);
      segs.push({ si, area: n, s, dias: d, u });
    }
    return { segs, resumo };
  }

  /* ---------- semanas ---------- */
  function semanas(res) {
    const linhas = new Map();
    const add = (d, area, m) => { const k = d ? U.ymd(U.inicioSemana(d)) : "sem-data"; if (!linhas.has(k)) linhas.set(k, { k, n: 0, m: 0, area: {} }); const l = linhas.get(k); l.n++; l.m += m; if (area) l.area[area] = (l.area[area] || 0) + m; };
    res.visiveis.filter(e => e.capina).forEach(e => add(e.data, e.areaRef, e.metros));
    return [...linhas.values()].sort((a, b) => a.k.localeCompare(b.k));
  }

  /* ---------- produtividade por equipe e por supervisor ---------- */
  function produtividade(res) {
    const eq = new Map();
    res.visiveis.filter(e => e.equipe && e.data && e.metros > 0).forEach(e => {
      const k = U.norm(e.equipe).replace(/\s+/g, " ");
      if (!eq.has(k)) eq.set(k, { equipe: e.equipe, supervisor: e.supervisor, area: e.areaRef, dias: new Map() });
      const g = eq.get(k), dk = U.ymd(e.data);
      if (!g.dias.has(dk)) g.dias.set(dk, { m: 0, homens: 0 });
      const d = g.dias.get(dk); d.m += e.metros; if (e.homens) d.homens = Math.max(d.homens, e.homens);
    });
    return [...eq.values()].map(g => {
      const ds = [...g.dias.values()], m = ds.reduce((s, d) => s + d.m, 0), comH = ds.filter(d => d.homens);
      return { equipe: g.equipe, supervisor: g.supervisor, area: g.area, dias: ds.length, m, mDia: ds.length ? m / ds.length : 0,
        mHomemDia: comH.length ? comH.reduce((s, d) => s + d.m / d.homens, 0) / comH.length : null };
    }).sort((a, b) => b.mDia - a.mDia);
  }

  function produtividadeSupervisores(res) {
    const supMap = new Map();
    res.visiveis.filter(e => e.supervisor && e.data && e.metros > 0).forEach(e => {
      const k = U.primeiroNome(e.supervisor);
      if (!supMap.has(k)) supMap.set(k, { supervisor: e.supervisor, area: e.areaSup || e.areaRef, lancs: 0, m: 0, eqDias: new Map() });
      const g = supMap.get(k);
      g.lancs++;
      g.m += e.metros;
      const ek = (U.norm(e.equipe) || "eq") + "|" + U.ymd(e.data);
      if (!g.eqDias.has(ek)) g.eqDias.set(ek, { m: 0, homens: 0 });
      const d = g.eqDias.get(ek); d.m += e.metros; if (e.homens) d.homens = Math.max(d.homens, e.homens);
    });
    return [...supMap.values()].map(g => {
      const ds = [...g.eqDias.values()], comH = ds.filter(d => d.homens);
      return {
        supervisor: g.supervisor,
        area: g.area,
        lancs: g.lancs,
        m: g.m,
        mEqDia: ds.length ? g.m / ds.length : 0,
        mHomemDia: comH.length ? comH.reduce((s, d) => s + d.m / d.homens, 0) / comH.length : null
      };
    }).sort((a, b) => b.m - a.m);
  }

  return { calcular, situacaoRuas, semanas, produtividade, produtividadeSupervisores, statusPonto, areaDoSupervisor, indexar,
           AREAS_POLY, get SEG_AREA() { return SEG_AREA; }, RUAS_AREA };
})();

