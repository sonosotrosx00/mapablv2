/* Reclamações (munícipe ou prefeitura) por rua.
   Lidas da aba "Reclamações" da planilha (respostas de um Google Forms + colunas Status / Resposta preenchidas pelo CCO).
   Cada reclamação é localizada na base de ruas, aparece no mapa (marcador laranja), na lista do painel e na consulta da rua,
   junto com a última capina antes da reclamação e a primeira depois dela. */
const Reclamacoes = (() => {
  const $ = id => document.getElementById(id);
  let camada = null, lista = [], filtro = "abertas";
  const ST = {
    aberta: { txt: "Aberta", cor: "#d63c2f" },
    andamento: { txt: "Em andamento", cor: "#e8590c" },
    atendida: { txt: "Atendida", cor: "#1e7b34" },
    improcedente: { txt: "Improcedente", cor: "#7b8794" }
  };
  const statusDe = s => { const n = U.norm(s); if (!n) return "aberta"; if (/improced|nao proced/.test(n)) return "improcedente"; if (/atendid|resolvid|conclu|feit|finaliz|fechad/.test(n)) return "atendida"; if (/anal|andamento|program|encaminh|agend/.test(n)) return "andamento"; return "aberta"; };
  const aberta = r => r.st === "aberta" || r.st === "andamento";

  /* ---------- leitura (chamado por Dados.converter) ---------- */
  function converter(t) {
    return U.objetos(t).map(o => {
      const r = {
        linha: o._linha + 2,
        carimbo: U.campo(o, "carimbo").f,
        data: U.data(U.campo(o, "data_da_reclamacao", "data_do_registro", "data").v) || U.data(U.campo(o, "carimbo").v),
        origem: U.campo(o, "origem").f.trim(), protocolo: U.campo(o, "protocolo", "n_do_protocolo", "numero_do_protocolo").f.trim(),
        rua: U.campo(o, "rua").f.trim(), bairro: U.campo(o, "bairro").f.trim(),
        ref: U.campo(o, "ponto_de_referencia", "referencia", "perimetro", "proximo").f.trim(),
        area: U.inteiro(U.campo(o, "area").v),
        descricao: U.campo(o, "descricao", "reclamacao", "o_que", "detalhe").f.trim(),
        statusTxt: U.campo(o, "status", "situacao").f.trim(),
        resposta: U.campo(o, "resposta", "providencia", "retorno").f.trim(),
        dataResp: U.data(U.campo(o, "data_da_resposta", "data_do_atendimento", "data_do_retorno").v)
      };
      r.st = statusDe(r.statusTxt);
      return r;
    }).filter(r => r.rua);
  }

  /* ---------- localização na base de ruas ---------- */
  const cacheLoc = new Map();
  function localizar(r) {
    const k = [r.rua, r.ref, r.area].join("|");
    if (!cacheLoc.has(k)) {
      Calc.indexar();
      const loc = LOC.localizar({ rua: r.rua, de: r.ref, ate: "", area: r.area, areaSup: null, m: 0 }, Calc.AREAS_POLY);
      let out = { ok: false };
      if (loc.ok && loc.ids && loc.ids.length) {
        const lin = loc.linhas, l0 = lin[0], pt = loc.tipo !== "rua" && r.ref ? l0[0] : l0[Math.floor(l0.length / 2)];
        out = { ok: true, chave: LOC.chaveDoSeg(loc.ids[0]), area: Calc.SEG_AREA[loc.ids[0]] || LOC.areaDoTrecho(lin, Calc.AREAS_POLY) || r.area || null, ll: pt, perto: loc.tipo !== "rua" && !!r.ref };
      } else if (loc.ok && loc.linhas) {
        const l0 = loc.linhas[0]; out = { ok: true, chave: LOC.chave(r.rua), area: r.area || null, ll: l0[Math.floor(l0.length / 2)] };
      }
      cacheLoc.set(k, out);
    }
    return cacheLoc.get(k);
  }

  // capina na rua antes e depois da data da reclamação (lançamentos de capina que passam pela rua)
  function capinaDaRua(r, res) {
    if (!r.loc.ok) return { antes: null, depois: null };
    const lancs = res.todos.filter(e => e.capina && e.data && e.loc.ok && e.loc.ids && e.loc.ids.some(si => LOC.chaveDoSeg(si) === r.loc.chave && (!r.loc.area || (Calc.SEG_AREA[si] || 0) === r.loc.area)));
    const d0 = r.data || new Date(8640000000000000);
    const antes = lancs.filter(e => e.data <= d0).sort((a, b) => b.data - a.data)[0] || null;
    const depois = lancs.filter(e => e.data > d0).sort((a, b) => a.data - b.data)[0] || null;
    return { antes, depois };
  }

  function preparar(base, res) {
    lista = (base && base.reclamacoes || []).map((r, i) => { const x = { ...r, i }; x.loc = localizar(x); x.cap = capinaDaRua(x, res); return x; })
      .sort((a, b) => (b.data || 0) - (a.data || 0) || b.linha - a.linha);
    return lista;
  }

  /* ---------- texto de análise de cada reclamação ---------- */
  function analise(r, res) {
    const pa = r.loc.area && res.porArea[r.loc.area], rec = pa && pa.recorrencia, a = r.cap.antes, d = r.cap.depois, dd = (x, y) => U.dias(x, y);
    const p = [];
    if (!r.loc.ok) return "Rua não encontrada na base do mapa; confira o nome na planilha.";
    if (a) {
      const dias = r.data ? dd(a.data, r.data) : null;
      p.push(`Última capina antes da reclamação: ${U.fmtData(a.data)}${dias != null ? ` (${dias} ${dias === 1 ? "dia" : "dias"} antes)` : ""}.`);
      if (rec && dias != null) p.push(dias <= rec ? `Estava dentro da recorrência de ${rec} dias.` : `Já tinha passado da recorrência de ${rec} dias.`);
    } else p.push("Sem registro de capina nesta rua antes da reclamação.");
    if (d) p.push(`Capina registrada depois: ${U.fmtData(d.data)}.`);
    else if (pa && pa.ciclo) p.push(`Ainda sem capina depois da reclamação. A área está no ciclo ${pa.ciclo.ciclo} desde ${U.fmtData(pa.ciclo.inicio)}.`);
    else p.push("Ainda sem capina depois da reclamação.");
    return p.join(" ");
  }
  const chip = r => `<span class="chip" style="background:${ST[r.st].cor}">${U.esc(r.statusTxt || ST[r.st].txt)}</span>`;
  function cartao(r, res, comRua) {
    return `<div class="rc-item">
      <div class="rc-cab">${chip(r)} <b>${U.fmtData(r.data)}</b>${r.origem ? ` · ${U.esc(r.origem)}` : ""}${r.protocolo ? ` · Protocolo ${U.esc(r.protocolo)}` : ""}</div>
      ${comRua ? `<a href="#" class="link" data-recl="${r.i}"><b>${U.esc(r.rua)}</b></a>${r.bairro ? ` · ${U.esc(r.bairro)}` : ""}${r.loc.area ? ` · Área ${r.loc.area}` : ""}<br>` : ""}
      ${r.ref ? `<small>Referência: ${U.esc(r.ref)}</small><br>` : ""}
      ${r.descricao ? `<div class="rc-desc">${U.esc(r.descricao)}</div>` : ""}
      <div class="rc-anal">${U.esc(analise(r, res))}</div>
      ${r.resposta ? `<div class="rc-resp"><b>Resposta${r.dataResp ? " em " + U.fmtData(r.dataResp) : ""}:</b> ${U.esc(r.resposta)}</div>` : ""}
    </div>`;
  }

  /* ---------- mapa ---------- */
  function desenhar(ui) {
    if (typeof Mapa === "undefined" || !Mapa.mapa) return;
    const mapa = Mapa.mapa;
    if (!camada) camada = L.layerGroup();
    camada.clearLayers();
    const ver = ui.mostrar.recl !== false && !ui.mapaLimpo;
    lista.filter(r => r.loc.ok && aberta(r) && (!ui.foco || r.loc.area === ui.foco)).forEach(r => {
      const m = L.marker(r.loc.ll, { icon: L.divIcon({ className: "rc-pin", html: `<span style="background:${ST[r.st].cor}">!</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 800 });
      m.bindTooltip(`<b>Reclamação · ${U.esc(r.rua)}</b><br>${U.fmtData(r.data)}${r.origem ? " · " + U.esc(r.origem) : ""}<br>${U.esc(r.statusTxt || ST[r.st].txt)}${r.descricao ? `<br><small>${U.esc(r.descricao.slice(0, 90))}${r.descricao.length > 90 ? "…" : ""}</small>` : ""}`, { className: "dica", direction: "top" });
      m.on("click", () => { if (!window.FERRAMENTA_ATIVA) App.abrirRua(r.loc.chave, r.loc.area); });
      camada.addLayer(m);
    });
    if (ver) camada.addTo(mapa); else camada.remove();
  }

  /* ---------- painel ---------- */
  function resumo() {
    const ab = lista.filter(aberta).length;
    if ($("exRecl")) $("exRecl").textContent = ab;
    if ($("exReclSub")) $("exReclSub").textContent = lista.length ? `${lista.length} no total · ${lista.filter(r => r.st === "atendida").length} atendidas` : "Nenhuma registrada";
  }
  function painel(res) {
    const F = { abertas: aberta, atendidas: r => r.st === "atendida", improcedentes: r => r.st === "improcedente", todas: () => true };
    const lst = lista.filter(F[filtro] || F.todas);
    Painel.mostrarPersonalizado(`
      <div class="det-cab" style="padding-bottom:12px">
        <div class="tipo">Munícipe e prefeitura</div>
        <h3>Reclamações</h3>
        <div class="sub">${lista.filter(aberta).length} abertas ou em andamento · ${lista.length} no total</div>
        <div class="seg" style="margin-top:10px;flex-wrap:wrap">
          ${[["abertas", "Abertas"], ["atendidas", "Atendidas"], ["improcedentes", "Improcedentes"], ["todas", "Todas"]].map(([k, t]) => `<button type="button" data-rc-f="${k}" class="${filtro === k ? "on" : ""}">${t} (${lista.filter(F[k]).length})</button>`).join("")}
        </div>
        ${CFG.formularioReclamacoes ? `<div style="margin-top:10px"><a class="bt-link" href="${CFG.formularioReclamacoes}" target="_blank" rel="noopener" style="text-decoration:none">Registrar reclamação &#8599;</a></div>` : ""}
      </div>
      <div class="bloco">${lst.map(r => cartao(r, res, true)).join("") || `<p class="nota">Nenhuma reclamação nesta situação.</p>`}</div>`);
    document.querySelectorAll("[data-rc-f]").forEach(b => b.onclick = () => { filtro = b.dataset.rcF; painel(res); });
    ligarLinks();
  }
  function ligarLinks() {
    document.querySelectorAll("[data-recl]").forEach(el => el.onclick = ev => { ev.preventDefault(); const r = lista[+el.dataset.recl] && lista.find(x => x.i === +el.dataset.recl); if (r && r.loc.ok) App.abrirRua(r.loc.chave, r.loc.area); });
  }
  // bloco para a consulta da rua
  function blocoRua(chave, area, res, nomeRua) {
    const lst = lista.filter(r => r.loc.ok && r.loc.chave === chave && (!area || !r.loc.area || r.loc.area === area));
    const link = CFG.formularioReclamacoes ? (CFG.formularioReclamacoesCampoRua ? `${CFG.formularioReclamacoes.replace(/\/edit.*$|\/viewform.*$/, "/viewform")}?usp=pp_url&entry.${CFG.formularioReclamacoesCampoRua}=${encodeURIComponent(nomeRua || "")}` : CFG.formularioReclamacoes) : "";
    return { html: lst.length || link ? `<div class="bloco"><h2>Reclamações nesta rua (${lst.length})</h2>${lst.map(r => cartao(r, res, false)).join("")}${link ? `<div style="margin-top:8px"><a class="sec" data-rc-novo href="${link}" target="_blank" rel="noopener" style="text-decoration:none;padding:6px 11px;border-radius:6px;display:inline-block">Registrar reclamação nesta rua &#8599;</a></div>` : ""}</div>` : "", temCampo: !!CFG.formularioReclamacoesCampoRua };
  }
  return { converter, preparar, desenhar, resumo, painel, blocoRua, get lista() { return lista; } };
})();
