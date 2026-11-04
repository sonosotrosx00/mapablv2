/* Orquestração: estado, leitura, recálculo e eventos */
const App = (() => {
  const $ = id => document.getElementById(id);
  const PLANILHA_LOCAL = window.PLANILHA_LOCAL || null;
  const TODAS = ["emdia", "vencendo", "vencido", "semrec", "nunca"];

  let base = null, res = null, situ = null, arqExcel = null;
  let fonte = U.ler("fonte_novo", PLANILHA_LOCAL ? "local" : "google");
  const ui = {
    modo: U.ler("modo", "areas"),
    mostrar: U.ler("mostrar", { pontos: true, exec: true, faltam: false, rotas: false }),
    focoLigado: U.ler("foco", false), foco: null, areaAberta: null,
    sel: null, situAtivas: new Set(TODAS), soLanc: false, aberto: null,
    ciclo: "",
    filtroPonto: "",  // "" | "coletado" | "nao" | "pendente"
    filtroEquipe: "", // nome normalizado da equipe quando filtrada
    filtroLoc: "",    // "" | "aprox"
    mapaLimpo: U.ler("mapa_limpo", false)  // mapa do zero (oculta camadas da capina para testar novos serviços/shapes)
  };

  /* ---------- datas e filtros ---------- */
  const lerData = id => { const v = $(id).value; return v ? new Date(v + "T00:00:00") : null; };
  function dataRef() {
    const f = lerData("dtFim"); if (f) return f;
    if ((fonte === "local" || fonte === "excel") && base && base.lancamentos.length) {
      let m = null; base.lancamentos.forEach(r => { if (r.data && (!m || r.data > m)) m = r.data; });
      if (m) return m;
    }
    return U.hoje();
  }
  const filtros = () => ({ ini: lerData("dtIni"), fim: lerData("dtFim"), servico: $("fServico").value, supervisor: $("fSup").value, ref: dataRef(), ciclo: ui.ciclo });

  function periodo(tipo) {
    const h = dataRef(), ini = $("dtIni"), fim = $("dtFim");
    if (tipo === "semana" || tipo === "passada") { const a = U.inicioSemana(h); if (tipo === "passada") a.setDate(a.getDate() - 7); const b = new Date(a); b.setDate(b.getDate() + 6); ini.value = U.ymd(a); fim.value = U.ymd(b); }
    else if (tipo === "mes") { ini.value = U.ymd(new Date(h.getFullYear(), h.getMonth(), 1)); fim.value = U.ymd(new Date(h.getFullYear(), h.getMonth() + 1, 0)); }
    else { ini.value = ""; fim.value = ""; }
    marcarPeriodo(tipo); recalcular();
  }
  const marcarPeriodo = tipo => document.querySelectorAll("#segPer button").forEach(b => b.classList.toggle("on", b.dataset.per === tipo));

  /* ---------- leitura ---------- */
  function status(txt, erro) { const s = $("status"); s.textContent = txt; s.className = "status" + (erro ? " erro" : ""); }
  async function carregar() {
    const bt = $("btAtualizar"); bt.disabled = true; status("Atualizando…");
    try {
      if (fonte === "local" && PLANILHA_LOCAL) {
        const ativa = Dados.planilhaAtivaLocal();
        base = Dados.converter(ativa);
        const temEdicao = !!U.ler("planilha_editada_teste", null);
        status(temEdicao ? "Planilha Editada no Site (Modo Teste)" : "Demonstração · Planilha de Exemplo Completa");
      } else if (fonte === "excel") {
        base = Dados.converter(await Dados.lerExcel(arqExcel));
        status("Excel carregado: " + (arqExcel ? arqExcel.name : "arquivo"));
      } else {
        base = Dados.converter(await Dados.lerGoogle(U.ler("planilha", "") || CFG.planilha));
        status("Google Sheets atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      }
      Painel.filtros(base);
    } catch (e) {
      status(/^escolha|^informe/.test(e.message) ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : "Não foi possível ler os dados: " + e.message + ".", !/^escolha|^informe/.test(e.message));
      if (!base) base = { areas: CFG.areasPadrao.map(a => ({ ...a })), capina: [], ciclos: [], lancamentos: [], pontos: [], abas: {} };
    }
    bt.disabled = false;
    recalcular();
  }

  /* ---------- recálculo e desenho ---------- */
  function recalcular() {
    if (!base) return;
    res = Calc.calcular(base, filtros());
    if (ui.ciclo && !res.codigosCiclo.includes(ui.ciclo)) { ui.ciclo = ""; res = Calc.calcular(base, filtros()); }
    situ = Calc.situacaoRuas(res);
    sincronizarCiclo();
    ui.foco = ui.focoLigado ? ui.areaAberta : null;
    Mapa.render(res, ui, situ);
    Painel.resumo(res, situ, ui);
    reabrir();
  }
  function reabrir() {
    const a = ui.aberto; if (!a) return;
    if (a.tipo === "area") Painel.area(a.id, res, situ, ui, true);
    else if (a.tipo === "ponto") Painel.ponto(a.id, res, true);
    else if (a.tipo === "listaPontos") Painel.listaPontos(res, ui, true);
    else if (a.tipo === "exec") { const e = res.visiveis.find(x => x.idx === a.id); if (e) Painel.exec(e, res, ui); else fechar(); }
    else if (a.tipo === "semanal") Painel.semanal(res);
    else if (a.tipo === "prod") Painel.produtividade(res);
    else if (a.tipo === "equipe") Painel.detalheEquipe(a.id, res);
    else if (a.tipo === "lancamentos") Painel.todosLanc(res);
    else if (a.tipo === "fora") Painel.fora(res);
    else if (a.tipo === "naoloc") Painel.naoLoc(res);
    else if (a.tipo === "aprox") Painel.aprox(res);
    else if (a.tipo === "estudio" && window.FerramentasMapa) FerramentasMapa.abrirEstudioPainel();
    else if ((a.tipo === "camadas" || a.tipo === "trajeto") && window.FerramentasExtra) FerramentasExtra.reabrir(a.tipo);
  }
  function redesenharMapa() { ui.foco = ui.focoLigado ? ui.areaAberta : null; Mapa.render(res, ui, situ); }

  /* ---------- painel: abrir / fechar ---------- */
  function abrir(tipo, id) {
    if (tipo !== "exec") { ui.soLanc = false; Mapa.limparDestaque(); }
    if (tipo !== "equipe") ui.filtroEquipe = "";
    if (tipo !== "aprox") ui.filtroLoc = "";
    ui.aberto = { tipo, id };
    ui.areaAberta = tipo === "area" ? id : null;
    ui.sel = tipo === "area" ? { tipo, id } : tipo === "ponto" ? { tipo, id } : null;
    gaveta("meio", true);
  }
  function abrirPersonalizado(tipo, fnRender) {
    abrir(tipo, null);
    redesenharMapa();
    if (fnRender) fnRender();
  }
  function abrirArea(n, zoom) { abrir("area", n); if (zoom) Mapa.zoomArea(n); redesenharMapa(); Painel.area(n, res, situ, ui); }
  function abrirPonto(cod, zoom) { abrir("ponto", cod); if (zoom) Mapa.zoomPonto(cod); redesenharMapa(); Painel.ponto(cod, res); }
  function abrirExec(idx) {
    const e = res.visiveis.find(x => x.idx === idx) || res.todos.find(x => x.idx === idx); if (!e) return;
    abrir("exec", idx); redesenharMapa(); Mapa.destacar(e); Painel.exec(e, res, ui);
  }
  function abrirEquipe(nomeEq) {
    ui.filtroEquipe = nomeEq ? U.norm(nomeEq).replace(/\s+/g, " ") : "";
    abrir("equipe", nomeEq);
    redesenharMapa();
    Painel.detalheEquipe(nomeEq, res);
  }
  function filtrarEquipe(nomeEq) {
    ui.filtroEquipe = nomeEq ? U.norm(nomeEq).replace(/\s+/g, " ") : "";
    redesenharMapa();
  }
  function filtrarLoc(tipo) {
    ui.filtroLoc = tipo || "";
    redesenharMapa();
  }
  function alternarMapaLimpo(v) {
    ui.mapaLimpo = v != null ? !!v : !ui.mapaLimpo;
    U.guardar("mapa_limpo", ui.mapaLimpo);
    redesenharMapa();
    if (ui.aberto && ui.aberto.tipo === "camadas") reabrir();
  }
  function filtrarPonto(st, abrirPainel) {
    ui.filtroPonto = st || "";
    ui.mostrar.pontos = true;
    sincronizarCaixa();
    if (abrirPainel) abrir("listaPontos", null);
    redesenharMapa();
    reabrir();
  }
  function abrirLista(tipo) {
    if (tipo === "aprox") ui.filtroLoc = "aprox";
    abrir(tipo, null);
    redesenharMapa();
    reabrir();
  }
  function fechar() {
    ui.aberto = null; ui.areaAberta = null; ui.sel = null; ui.soLanc = false; ui.filtroEquipe = ""; ui.filtroLoc = "";
    Mapa.limparDestaque(); Painel.fechar(); redesenharMapa(); Painel.resumo(res, situ, ui);
  }
  function soEste(v) { ui.soLanc = v; redesenharMapa(); }
  function alternarRota() { ui.mostrar.rotas = !ui.mostrar.rotas; U.guardar("mostrar", ui.mostrar); sincronizarCaixa(); redesenharMapa(); }

  /* ---------- situação das ruas ---------- */
  function clicarSituacao(k) {
    const s = ui.situAtivas, todas = s.size === TODAS.length;
    if (todas) ui.situAtivas = new Set([k]);
    else if (s.has(k)) { s.delete(k); if (!s.size) ui.situAtivas = new Set(TODAS); }
    else s.add(k);
    if (ui.modo !== "tempo" && [...ui.situAtivas].some(x => x !== "nunca")) definirModo("tempo", false);
    if (ui.situAtivas.has("nunca") && ui.situAtivas.size < TODAS.length) { ui.mostrar.faltam = true; sincronizarCaixa(); }
    redesenharMapa(); Painel.resumo(res, situ, ui); reabrir();
  }
  function todasSituacoes() { ui.situAtivas = new Set(TODAS); redesenharMapa(); Painel.resumo(res, situ, ui); reabrir(); }

  /* ---------- caixa do mapa e seletor de ciclo ---------- */
  function definirModo(m, desenhar = true) {
    ui.modo = m; U.guardar("modo", m);
    Mapa.caixa.querySelectorAll("#segModo button").forEach(b => b.classList.toggle("on", b.dataset.modo === m));
    if (desenhar) { redesenharMapa(); Painel.resumo(res, situ, ui); }
  }
  function definirCiclo(c) { ui.ciclo = c || ""; recalcular(); }
  function sincronizarCiclo() {
    const sel = $("selCiclo"); if (!sel) return;
    sel.innerHTML = `<option value="">Ciclo atual de cada área</option>` + res.codigosCiclo.map(c => `<option value="${U.esc(c)}">Filtrar pelo ciclo ${U.esc(c)}</option>`).join("");
    sel.value = ui.ciclo; sel.classList.toggle("ativo", !!ui.ciclo);
    document.querySelectorAll("#segPer button, #dtIni, #dtFim").forEach(el => el.disabled = !!ui.ciclo);
    const av = $("avisoCiclo"); if (av) av.hidden = !ui.ciclo;
  }
  function sincronizarCaixa() {
    const cx = Mapa.caixa;
    cx.querySelector("#ckPontos").checked = ui.mostrar.pontos; cx.querySelector("#ckExec").checked = ui.mostrar.exec;
    cx.querySelector("#ckFaltam").checked = ui.mostrar.faltam; cx.querySelector("#ckRotas").checked = ui.mostrar.rotas;
    cx.querySelector("#ckFoco").checked = ui.focoLigado;
    cx.querySelectorAll("#segModo button").forEach(b => b.classList.toggle("on", b.dataset.modo === ui.modo));
  }
  function ligarCaixa() {
    const cx = Mapa.caixa;
    cx.querySelectorAll("#segModo button").forEach(b => b.onclick = () => definirModo(b.dataset.modo));
    [["ckPontos", "pontos"], ["ckExec", "exec"], ["ckFaltam", "faltam"], ["ckRotas", "rotas"]].forEach(([id, k]) =>
      cx.querySelector("#" + id).onchange = ev => { ui.mostrar[k] = ev.target.checked; U.guardar("mostrar", ui.mostrar); redesenharMapa(); });
    cx.querySelector("#ckFoco").onchange = ev => { ui.focoLigado = ev.target.checked; U.guardar("foco", ui.focoLigado); redesenharMapa(); };
    const min = cx.querySelector(".cx-min");
    min.onclick = () => { cx.classList.toggle("min"); min.innerHTML = cx.classList.contains("min") ? "+" : "&minus;"; };
    if (window.matchMedia("(max-width: 800px)").matches) { cx.classList.add("min"); min.innerHTML = "+"; }
    sincronizarCaixa();
  }

  /* ---------- gaveta (celular) ---------- */
  const ALTURAS = ["baixo", "meio", "alto"];
  function gaveta(alt, soSeBaixo) {
    const p = $("painel"); if (soSeBaixo && p.dataset.altura !== "baixo") return;
    p.dataset.altura = alt; setTimeout(() => Mapa.mapa.invalidateSize(), 220);
  }
  function ligarGaveta() {
    const p = $("painel"), alca = $("alca"); let y0 = null, h0 = 0, moveu = false;
    alca.onclick = () => { if (moveu) { moveu = false; return; } gaveta(ALTURAS[(ALTURAS.indexOf(p.dataset.altura) + 1) % 3]); };
    alca.addEventListener("pointerdown", e => { y0 = e.clientY; h0 = p.getBoundingClientRect().height; moveu = false; alca.setPointerCapture(e.pointerId); });
    alca.addEventListener("pointermove", e => { if (y0 == null) return; const dy = y0 - e.clientY; if (Math.abs(dy) > 6) { moveu = true; p.style.transition = "none"; p.style.height = Math.max(120, h0 + dy) + "px"; } });
    alca.addEventListener("pointerup", () => {
      if (y0 == null) return; y0 = null; p.style.transition = ""; if (!moveu) return;
      const h = p.getBoundingClientRect().height / window.innerHeight; p.style.height = "";
      gaveta(h < .32 ? "baixo" : h < .72 ? "meio" : "alto");
    });
  }

  /* ---------- fonte dos dados ---------- */
  function idb(op, valor) {
    return new Promise(ok => { try { const req = indexedDB.open("capina_novo", 1); req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => { const st = req.result.transaction("kv", op === "get" ? "readonly" : "readwrite").objectStore("kv"); const r = op === "get" ? st.get("excel") : st.put(valor, "excel"); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); };
      req.onerror = () => ok(null); } catch (e) { ok(null); } });
  }
  function aplicarFonte() {
    document.querySelectorAll("input[name=fonte]").forEach(r => r.checked = r.value === fonte);
    $("painelExcel").hidden = fonte !== "excel"; $("painelGoogle").hidden = fonte !== "google";
    $("nomeExcel").textContent = arqExcel ? arqExcel.name : "";
  }
  async function escolherExcel() {
    fonte = "excel"; U.guardar("fonte_novo", fonte); aplicarFonte();
    if (window.showOpenFilePicker) {
      try { const [h] = await showOpenFilePicker({ types: [{ description: "Planilha Excel", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", ".xlsm"] } }] }); arqExcel = h; await idb("put", h); aplicarFonte(); carregar(); } catch (e) {}
    } else $("inExcel").click();
  }

  function aplicarHashUrl() {
    const h = (window.location.hash || "").replace(/^#/, "");
    if (!h || !res) return;
    const params = new URLSearchParams(h);
    if (params.has("area")) abrirArea(+params.get("area"), true);
    else if (params.has("ponto")) abrirPonto(params.get("ponto"), true);
    else if (params.has("equipe")) abrirEquipe(params.get("equipe"));
    else if (params.has("filtroPonto")) filtrarPonto(params.get("filtroPonto"), true);
    else if (params.has("estudio") && window.FerramentasMapa) FerramentasMapa.abrirEstudioPainel();
  }

  /* ---------- início ---------- */
  async function iniciar() {
    Mapa.init({
      // com régua, desenho, Street View ou escolha de ponto ligados, o clique é da ferramenta (não abre a área/ponto)
      area: (n, z) => { if (!window.FERRAMENTA_ATIVA || z) abrirArea(n, !!z); },
      ponto: c => { if (!window.FERRAMENTA_ATIVA) abrirPonto(c, false); },
      exec: idx => { if (!window.FERRAMENTA_ATIVA) abrirExec(idx); },
      fechar,
      situacao: clicarSituacao,
      lista: abrirLista,
      filtrarPonto,
      filtrarEquipe,
      filtrarLoc,
      mapaLimpo: alternarMapaLimpo
    });
    if (window.FerramentasMapa) FerramentasMapa.init(Mapa.mapa);
    if (window.FerramentasExtra) FerramentasExtra.init(Mapa.mapa);
    ligarCaixa(); ligarGaveta();
    $("btAtualizar").onclick = carregar;
    $("btSubirExcelTopo").onclick = escolherExcel;
    $("selCiclo").onchange = ev => definirCiclo(ev.target.value);
    document.querySelectorAll("#segPer button").forEach(b => b.onclick = () => periodo(b.dataset.per));
    ["dtIni", "dtFim"].forEach(id => $(id).addEventListener("change", () => { marcarPeriodo(""); recalcular(); }));
    ["fServico", "fSup"].forEach(id => $(id).onchange = recalcular);
    $("btLimparFiltros").onclick = () => { $("dtIni").value = ""; $("dtFim").value = ""; $("fServico").value = ""; $("fSup").value = ""; ui.ciclo = ""; ui.filtroPonto = ""; ui.filtroEquipe = ""; marcarPeriodo("tudo"); recalcular(); };
    $("btSemanal").onclick = () => abrirLista("semanal");
    $("btProd").onclick = () => abrirLista("prod");
    if ($("btEstudioPainel")) $("btEstudioPainel").onclick = () => window.FerramentasMapa && FerramentasMapa.abrirEstudioPainel();
    $("btEquipesTopo").onclick = () => abrirLista("prod");
    $("btAreasTopo").onclick = () => { fechar(); $("listaAreas").scrollIntoView({ behavior: "smooth" }); };
    $("cardCapina").onclick = () => { definirModo("andamento"); $("listaAreas").scrollIntoView({ behavior: "smooth" }); };
    $("btPontosTopo").onclick = () => filtrarPonto("", true);
    $("btPontosNao").onclick = ev => { ev.stopPropagation(); filtrarPonto("nao", true); };
    $("btPontosPend").onclick = ev => { ev.stopPropagation(); filtrarPonto("pendente", true); };
    $("cardLanc").onclick = () => abrirLista("lancamentos");
    $("cardFora").onclick = () => abrirLista("fora");
    $("cardNaoLoc").onclick = () => abrirLista("naoloc");
    document.querySelectorAll("[data-exp]").forEach(b => b.onclick = () => res && Exportar.arquivo(b.dataset.exp, res));
    if ($("btProdExcel")) $("btProdExcel").onclick = () => res && Exportar.produtividade(res);
    $("btPowerBI").hidden = !CFG.botaoPowerBI;
    $("btPowerBI").onclick = () => base && Exportar.powerbi(base, dataRef());
    document.querySelectorAll("input[name=fonte]").forEach(r => r.onchange = () => { fonte = r.value; U.guardar("fonte_novo", fonte); aplicarFonte(); carregar(); });
    $("btExcel").onclick = escolherExcel;
    $("inExcel").onchange = e => { arqExcel = e.target.files[0] || null; fonte = "excel"; U.guardar("fonte_novo", fonte); aplicarFonte(); carregar(); };
    $("inLink").value = U.ler("planilha", "") || CFG.planilha;
    $("btLink").onclick = () => { U.guardar("planilha", $("inLink").value.trim()); carregar(); };
    marcarPeriodo("tudo");
    const h = await idb("get"); if (h) arqExcel = h;
    aplicarFonte();
    if (fonte === "excel" && arqExcel && arqExcel.queryPermission && (await arqExcel.queryPermission({ mode: "read" })) !== "granted") {
      fonte = "local"; aplicarFonte();
    }
    await carregar();
    aplicarHashUrl();
    window.addEventListener("hashchange", aplicarHashUrl);
    window.addEventListener("storage", ev => {
      if (ev.key === "capina_planilha_editada_teste" || ev.key === "capina_fonte_novo") carregar();
    });
  }

  function usarPlanilhaEditada() {
    fonte = "local";
    U.guardar("fonte_novo", "local");
    aplicarFonte();
    carregar();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", iniciar) : iniciar();

  return { abrirArea, abrirPonto, abrirExec, abrirEquipe, abrirLista, abrirPersonalizado, filtrarPonto, filtrarEquipe, filtrarLoc, alternarMapaLimpo, fechar, soEste, alternarRota, clicarSituacao, todasSituacoes, recalcular, carregar, usarPlanilhaEditada, definirCiclo, get res() { return res; }, get ui() { return ui; }, get base() { return base; } };
})();
