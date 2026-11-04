/* Funções utilitárias sem dependência de tela */
const U = (() => {
  const fmt = (n, d = 2) => (+n || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtPct = p => (p > 0 && p < 10) ? fmt(p, 1) : fmt(p, 0);
  const fmtKm = m => m >= 1000 ? fmt(m / 1000, 2) + " km" : fmt(m, 0) + " m";
  const fmtData = d => d ? d.toLocaleDateString("pt-BR") : "—";

  // Aliases práticos usados pelo Dashboard e relatórios
  const pct = p => fmtPct(p) + "%";
  const km = m => fmt((+m || 0) / 1000, 2) + " km";
  const m = v => fmt(+v || 0, 0) + " m";
  const int = v => fmt(+v || 0, 0);
  const dec = (v, d = 1) => fmt(+v || 0, d);
  const dmy = d => fmtData(d);

  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const chaveCol = s => norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const primeiroNome = s => norm(s).split(/\s+/)[0] || "";
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const hoje = () => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), h.getDate()); };
  const dias = (a, b) => Math.round((b - a) / 86400000);
  const inicioSemana = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };

  function data(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), dMonth(v), v.getDate());
    if (typeof v === "number") { const u = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); }
    const s = String(v).trim(); let m;
    if ((m = s.match(/^Date\((\d+),(\d+),(\d+)/))) return new Date(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return new Date(+m[3], +m[2] - 1, +m[1]);
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }
  function dMonth(v) { return v.getMonth(); }
  function num(v) {
    if (typeof v === "number") return v;
    let s = String(v ?? "").trim().replace(/\s/g, "");
    if (!s) return 0;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s); return isNaN(n) ? 0 : n;
  }
  const inteiro = v => { const m = String(v ?? "").match(/\d+/); return m ? +m[0] : null; };

  // tabela {cols, rows:[[{v,f}]]} -> objetos com chave normalizada
  function objetos(t) {
    if (!t) return [];
    const cols = t.cols.map(chaveCol);
    return t.rows.map((r, i) => {
      const o = { _linha: i, _v: {}, _f: {} };
      cols.forEach((c, k) => { if (!c) return; const cel = r[k]; o._v[c] = cel ? cel.v : null; o._f[c] = cel ? String(cel.f ?? cel.v ?? "") : ""; });
      return o;
    });
  }
  // primeiro campo cujo nome começa por um dos prefixos
  function campo(o, ...prefixos) {
    for (const p of prefixos) { const k = Object.keys(o._v).find(k => k.startsWith(p)); if (k && o._v[k] != null && o._v[k] !== "") return { v: o._v[k], f: o._f[k] }; }
    return { v: null, f: "" };
  }
  const temColuna = (t, prefixo) => !!t && t.cols.some(c => chaveCol(c).startsWith(prefixo));

  function baixar(nome, conteudo, tipo) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const guardar = (k, v) => { try { localStorage.setItem("capina_" + k, JSON.stringify(v)); } catch (e) {} };
  const salvar = guardar;
  const ler = (k, padrao) => { try { const v = localStorage.getItem("capina_" + k); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; } };

  // IndexedDB para compartilhar o arquivo Excel entre index.html e dashboard.html
  function idb(op, chave = "excel", valor = null) {
    return new Promise(ok => {
      try {
        const req = indexedDB.open("capina_novo", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("kv");
        req.onsuccess = () => {
          const st = req.result.transaction("kv", op === "get" ? "readonly" : "readwrite").objectStore("kv");
          const r = op === "get" ? st.get(chave) : st.put(valor, chave);
          r.onsuccess = () => ok(r.result);
          r.onerror = () => ok(null);
        };
        req.onerror = () => ok(null);
      } catch (e) { ok(null); }
    });
  }
  const lerArq = (chave = "excel") => idb("get", chave);
  const salvarArq = (chave = "excel", arq = null) => idb("put", chave, arq);

  function lev(a, b) {
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } }
    return d[b.length];
  }
  // Nome de serviço padronizado (corrige erros de digitação)
  function servico(s) {
    const k = norm(s).replace(/\s+/g, " ");
    if (!k) return "Capinação e raspagem";
    if (/^cap[ai]n/.test(k)) return "Capinação e raspagem";
    let melhor = null, dist = 99;
    (window.CFG && CFG.servicos || []).forEach(n => { const x = lev(k, norm(n)); if (x < dist) { dist = x; melhor = n; } });
    if (melhor && dist <= Math.max(2, Math.floor(k.length / 6))) return melhor;
    const t = String(s).trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  // Supervisor válido: ignora vazio, "0" e números
  const supervisor = s => { const t = String(s ?? "").trim(); return /^[\d\s.,-]*$/.test(t) ? "" : t; };
  return {
    servico, supervisor, fmt, fmtPct, fmtKm, fmtData,
    pct, km, m, int, dec, dmy,
    norm, chaveCol, esc, primeiroNome, ymd, hoje, dias, inicioSemana,
    data, num, inteiro, objetos, campo, temColuna,
    baixar, guardar, salvar, ler, lerArq, salvarArq
  };
})();
