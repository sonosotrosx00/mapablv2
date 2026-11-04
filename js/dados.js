/* Leitura da planilha (Google Sheets ou Excel) e conversão para listas simples */
const Dados = (() => {
  /* ---------- Google Sheets (gviz por JSONP: funciona também abrindo o arquivo local) ---------- */
  function idPlanilha(link) {
    const m = String(link || "").match(/\/d\/([a-zA-Z0-9-_]{20,})/);
    return m ? m[1] : (/^[a-zA-Z0-9-_]{20,}$/.test(String(link || "").trim()) ? String(link).trim() : "");
  }
  function abaGoogle(id, aba) {
    return new Promise((ok, falha) => {
      const cb = "cb_" + Math.random().toString(36).slice(2), s = document.createElement("script");
      const fim = () => { delete window[cb]; s.remove(); clearTimeout(t); };
      const t = setTimeout(() => { fim(); falha(new Error("tempo esgotado")); }, 20000);
      window[cb] = d => { fim(); ok(d && d.status !== "error" && d.table ? { cols: d.table.cols.map(c => c.label), rows: d.table.rows.map(r => (r.c || []).map(c => c ? { v: c.v, f: c.f ?? c.v } : null)) } : null); };
      s.onerror = () => { fim(); falha(new Error("sem acesso à planilha")); };
      s.src = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json;responseHandler:${cb}&sheet=${encodeURIComponent(aba)}&headers=1&_=${Date.now()}`;
      document.head.appendChild(s);
    });
  }
  async function lerGoogle(link) {
    const id = idPlanilha(link);
    if (!id) throw new Error("informe o link da planilha");
    const nomes = [...new Set(Object.values(CFG.abas).flat())];
    const res = await Promise.all(nomes.map(n => abaGoogle(id, n).catch(e => ({ erro: e }))));
    if (res.every(r => r && r.erro)) throw res[0].erro;
    const porNome = {}; nomes.forEach((n, i) => porNome[n] = res[i] && !res[i].erro ? res[i] : null);
    return porNome;
  }

  /* ---------- Excel ---------- */
  function abaExcel(ws) {
    if (!ws) return null;
    const bruto = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    const texto = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false });
    if (!bruto.length) return null;
    return { cols: bruto[0].map(x => x == null ? "" : String(x)), rows: bruto.slice(1).map((r, i) => r.map((v, k) => v == null ? null : { v, f: (texto[i + 1] || [])[k] ?? v })) };
  }
  async function lerExcel(arquivo) {
    if (!arquivo) throw new Error("escolha o arquivo Excel");
    let file = arquivo;
    if (arquivo.getFile) {
      if ((await arquivo.queryPermission({ mode: "read" })) !== "granted" && (await arquivo.requestPermission({ mode: "read" })) !== "granted") throw new Error("permissão de leitura negada");
      file = await arquivo.getFile();
    }
    let buf; try { buf = await file.arrayBuffer(); } catch (e) { throw new Error("o arquivo mudou; escolha-o de novo"); }
    const wb = XLSX.read(buf, { type: "array" }), porNome = {};
    [...new Set(Object.values(CFG.abas).flat())].forEach(n => { const s = wb.SheetNames.find(x => U.norm(x) === U.norm(n)); porNome[n] = s ? abaExcel(wb.Sheets[s]) : null; });
    return porNome;
  }

  /* ---------- Escolha das abas (o Google devolve a 1ª aba quando o nome não existe: confere as colunas) ---------- */
  function escolher(porNome) {
    const uma = (nomes, ...cols) => { for (const n of nomes) { const t = porNome[n]; if (t && cols.every(c => U.temColuna(t, c))) return t; } return null; };
    return {
      areas: uma(CFG.abas.areas, "area", "supervisor"),
      capina: uma(CFG.abas.capina, "data", "area", "km"),
      pontos: uma(CFG.abas.pontos, "ponto", "status"),
      ciclos: uma(CFG.abas.ciclos, "area", "ciclo", "inicio"),
      lancamentos: CFG.abas.lancamentos.map(n => porNome[n]).filter(t => t && (U.temColuna(t, "rua") || U.temColuna(t, "ponto")))
    };
  }

  /* ---------- Conversão ---------- */
  const PONTO = {}; DADOS_GEO.pontos.forEach(p => { PONTO[U.norm(p.cod)] = p.cod; const n = p.id.match(/\d+$/); if (n) PONTO["pc" + n[0]] = p.cod; });
  function codPonto(v) {
    const s = U.norm(v); let m = s.match(/\ba(\d+)\s*[_-]?\s*p(\d+)\b/);
    if (m && PONTO[`a${+m[1]}_p${+m[2]}`]) return PONTO[`a${+m[1]}_p${+m[2]}`];
    m = s.replace(/\s+/g, "").match(/(\d+)$/); return m && PONTO["pc" + (+m[1])] ? PONTO["pc" + (+m[1])] : null;
  }

  function areas(t) {
    const lista = CFG.areasPadrao.map(a => ({ ...a }));
    U.objetos(t).forEach(o => {
      const n = U.inteiro(U.campo(o, "area").v); const a = lista.find(x => x.area === n); if (!a) return;
      const sup = U.campo(o, "supervisor").f, sds = U.campo(o, "sds").f, km = U.num(U.campo(o, "extensao").v), eq = U.inteiro(U.campo(o, "equipes").v), rec = U.inteiro(U.campo(o, "recorrencia").v);
      if (sup) a.supervisor = sup; if (sds) a.sds = sds; if (km) a.km = km; if (eq) a.equipes = eq; if (rec) a.recorrencia = rec;
    });
    return lista;
  }
  const capina = t => U.objetos(t).map(o => ({ data: U.data(U.campo(o, "data").v), area: U.inteiro(U.campo(o, "area").v), km: U.num(U.campo(o, "km").v), obs: U.campo(o, "obs").f, linha: o._linha })).filter(r => r.area && r.km && r.data);
  const ciclos = t => U.objetos(t).map(o => ({ area: U.inteiro(U.campo(o, "area").v), ciclo: U.campo(o, "ciclo").f.trim().toUpperCase(), inicio: U.data(U.campo(o, "inicio", "data_inicial").v), fim: U.data(U.campo(o, "fim", "data_final", "termino").v), status: U.campo(o, "status").f.trim(), obs: U.campo(o, "obs").f })).filter(c => c.area && c.inicio);

  function lancamentos(t) {
    return U.objetos(t).map(o => {
      let de = U.campo(o, "perimetro_de", "rua_inicial").f, ate = U.campo(o, "perimetro_ate", "rua_final").f;
      const per = U.campo(o, "perimetro").f;
      if (!de && !ate && per) { const p = per.split(/\s*\/\s*/); de = p[0] || ""; ate = p[1] || ""; }
      return {
        data: U.data(U.campo(o, "data_do_servico", "data_servico", "data").v) || U.data(U.campo(o, "carimbo").v),
        lancado: U.campo(o, "lancado", "quem_lancou").f, supervisor: U.supervisor(U.campo(o, "supervisor").f), equipe: U.campo(o, "equipe").f.trim(),
        area: U.inteiro(U.campo(o, "area").v), bairro: U.campo(o, "bairro").f, rua: U.campo(o, "rua").f.trim(), de: de.trim(), ate: ate.trim(),
        m: U.num(U.campo(o, "extensao", "metros", "medicao").v), ciclo: U.campo(o, "ciclo").f.trim().toUpperCase(),
        servico: U.servico(U.campo(o, "servico").f), homens: U.inteiro(U.campo(o, "n_de_homens", "no_de_homens", "n_homens", "homens", "numero_de_homens").v),
        obs: (Object.keys(o._f).filter(k => k.startsWith("obs") && !k.includes("ponto")).map(k => o._f[k]).find(Boolean)) || ""
      };
    }).filter(r => r.rua);
  }
  function pontos(tPontos, tabsLanc) {
    const out = U.objetos(tPontos).map(o => ({ data: U.data(U.campo(o, "data").v), cod: codPonto(U.campo(o, "ponto").f), status: U.norm(U.campo(o, "status", "situacao").f), obs: U.campo(o, "obs").f, linha: o._linha }));
    tabsLanc.forEach((t, k) => U.objetos(t).forEach(o => {
      const cod = codPonto(U.campo(o, "ponto").f); if (!cod) return;
      out.push({ data: U.data(U.campo(o, "data_do_servico", "data").v) || U.data(U.campo(o, "carimbo").v), cod, status: U.norm(U.campo(o, "situacao", "status").f), obs: U.campo(o, "observacao_do_ponto", "obs").f, linha: 100000 * (k + 1) + o._linha });
    }));
    return out.filter(r => r.cod && r.status);
  }

  let ultimaBruta = null;

  function converter(porNome) {
    ultimaBruta = porNome;
    const t = escolher(porNome);
    if (!t.capina && !t.lancamentos.length) throw new Error('abas "Capina" e "Executado" não encontradas');
    return {
      areas: areas(t.areas), capina: capina(t.capina), ciclos: ciclos(t.ciclos),
      lancamentos: [].concat(...t.lancamentos.map(lancamentos)), pontos: pontos(t.pontos, t.lancamentos),
      abas: { areas: !!t.areas, capina: !!t.capina, pontos: !!t.pontos, ciclos: !!t.ciclos, lancamentos: t.lancamentos.length }
    };
  }

  function planilhaAtivaLocal() {
    const editada = U.ler("planilha_editada_teste", null);
    if (editada && editada.Executado && editada.Areas) return editada;
    return window.PLANILHA_LOCAL ? JSON.parse(JSON.stringify(window.PLANILHA_LOCAL)) : null;
  }

  return { lerGoogle, lerExcel, converter, idPlanilha, codPonto, planilhaAtivaLocal, get ultimaBruta() { return ultimaBruta; } };
})();
