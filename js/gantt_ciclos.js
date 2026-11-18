/* Cronograma dos ciclos (Gantt) no Painel Gerencial (dashboard.html)
   ------------------------------------------------------------------
   Uma linha por área, uma barra por ciclo da aba "Ciclos" da planilha:
     - a parte escura da barra = quanto da meta da área já foi feito no ciclo;
     - traço vertical na barra  = fim previsto (início + recorrência da área);
     - barra laranja             = ciclo passou da recorrência; vermelha = em execução e atrasado;
     - linha vertical vermelha   = hoje (ou a data de referência do filtro).
   Só lê os dados (não altera a planilha). Clique numa barra para abrir a área no mapa.

   Para tirar: apague este arquivo e a linha <script src="js/gantt_ciclos.js"> do dashboard.html.
   A aba é criada por este arquivo; o dashboard.js só chama GanttCiclos.render(res) quando recalcula. */
const GanttCiclos = (() => {
  const $ = id => document.getElementById(id);
  const DIA = 86400000;
  let janela = U.ler("gantt_janela", "90");   // "60" | "90" | "180" | "tudo"
  let ultimoRes = null;

  /* ---------- monta a aba e o estilo uma vez ---------- */
  function montar() {
    if ($("sec-ciclos")) return true;
    const abas = $("dashAbas"), antes = $("sec-equipes");
    if (!abas || !antes) return false;
    const bt = document.createElement("button");
    bt.type = "button"; bt.className = "dash-aba"; bt.dataset.aba = "ciclos"; bt.textContent = "Cronograma dos Ciclos";
    abas.insertBefore(bt, abas.querySelector('[data-aba="equipes"]'));
    const sec = document.createElement("section");
    sec.id = "sec-ciclos"; sec.className = "dash-sec"; sec.hidden = true;
    sec.innerHTML = `<div class="dash-painel">
      <div class="dash-painel-cab"><div>
        <div class="dash-painel-tit">Cronograma dos Ciclos de Capina por Área</div>
        <div class="dash-painel-sub">Barra = ciclo (aba Ciclos) · parte escura = % da meta da área feita no ciclo · traço = fim previsto pela recorrência · linha vermelha = hoje. Clique numa barra para abrir a área no mapa.</div>
      </div>
      <div class="gc-janela" role="group" aria-label="Período mostrado">
        ${[["60", "60 dias"], ["90", "90 dias"], ["180", "6 meses"], ["tudo", "Tudo"]].map(([v, t]) => `<button type="button" data-gj="${v}">${t}</button>`).join("")}
      </div></div>
      <div id="gcAlertas"></div>
      <div class="gc" id="gcGrade"></div>
      <div class="gc-leg">
        <span><i class="gc-c-enc"></i>Encerrado no prazo</span><span><i class="gc-c-exe"></i>Em execução</span>
        <span><i class="gc-c-pas"></i>Passou da recorrência</span><span><i class="gc-c-atr"></i>Em execução e atrasado</span>
        <span><i class="gc-c-feito"></i>Parte feita da meta</span><span><i class="gc-c-prev"></i>Fim previsto</span>
      </div></div>`;
    antes.parentNode.insertBefore(sec, antes);
    // a troca de abas do dashboard esconde as seções conhecidas; esta aqui é tratada pelo clique abaixo
    abas.addEventListener("click", ev => {
      const b = ev.target.closest(".dash-aba"); if (!b) return;
      const meu = b.dataset.aba === "ciclos";
      sec.hidden = !meu;
      if (meu) {
        abas.querySelectorAll(".dash-aba").forEach(x => x.classList.toggle("on", x === b));
        document.querySelectorAll(".dash-sec").forEach(s => { if (s !== sec) s.hidden = true; });
        if (ultimoRes) render(ultimoRes);
      }
    });
    sec.querySelectorAll("[data-gj]").forEach(b => b.onclick = () => { janela = b.dataset.gj; U.guardar("gantt_janela", janela); if (ultimoRes) render(ultimoRes); });
    const css = document.createElement("style");
    css.textContent = `
      .gc-janela{display:flex;gap:4px;flex-wrap:wrap}
      .gc-janela button{border:1px solid var(--borda);background:#fff;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;color:var(--txt)}
      .gc-janela button.on{background:var(--verde-claro);border-color:var(--verde);color:var(--verde-esc);font-weight:700}
      .gc{display:grid;grid-template-columns:170px 1fr;font-size:12px;margin-top:6px;overflow-x:auto}
      .gc-nome{padding:7px 8px 7px 0;border-top:1px solid #eef1ee;line-height:1.25}
      .gc-nome b{color:var(--verde-esc)} .gc-nome small{color:var(--cinza);display:block}
      .gc-trilho{position:relative;border-top:1px solid #eef1ee;min-height:40px;min-width:520px}
      .gc-topo{position:relative;height:22px;min-width:520px;border-bottom:1px solid var(--borda)}
      .gc-mes{position:absolute;top:0;height:100%;border-left:1px solid var(--borda);padding-left:4px;color:var(--cinza);font-size:11px;white-space:nowrap}
      .gc-grade{position:absolute;top:0;bottom:0;border-left:1px dashed #edf0ed}
      .gc-hoje{position:absolute;top:0;bottom:0;border-left:2px solid #d63c2f;z-index:3}
      .gc-hoje-rot{position:absolute;top:2px;transform:translateX(-50%);background:#d63c2f;color:#fff;border-radius:4px;padding:0 4px;font-size:10px;z-index:4;white-space:nowrap}
      .gc-barra{position:absolute;top:8px;height:24px;border-radius:5px;overflow:hidden;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);z-index:2}
      .gc-barra .f{position:absolute;left:0;top:0;bottom:0;background:rgba(0,0,0,.22)}
      .gc-barra .t{position:relative;padding:0 6px;line-height:24px;color:#fff;font-weight:700;white-space:nowrap;text-shadow:0 1px 1px rgba(0,0,0,.35)}
      .gc-prev{position:absolute;top:4px;height:32px;border-left:2px dashed #1f2a24;z-index:3;pointer-events:none}
      .gc-enc{background:#5f9e6e}.gc-exe{background:#1e7b34}.gc-pas{background:#e8590c}.gc-atr{background:#c0392b}
      .gc-vazio{padding:16px;color:var(--cinza)}
      .gc-leg{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:11.5px;color:var(--cinza)}
      .gc-leg i{display:inline-block;width:14px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
      .gc-c-enc{background:#5f9e6e}.gc-c-exe{background:#1e7b34}.gc-c-pas{background:#e8590c}.gc-c-atr{background:#c0392b}
      .gc-c-feito{background:rgba(0,0,0,.35)}.gc-c-prev{border-left:2px dashed #1f2a24;width:0!important;height:12px!important;border-radius:0!important}
      .gc-alerta{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 11px;margin:8px 0;font-size:12.5px;color:#7c2d12}
      .gc-alerta.ok{background:var(--verde-claro);border-color:var(--verde-borda,#cfe3d4);color:var(--verde-esc)}`;
    document.head.appendChild(css);
    return true;
  }

  /* ---------- desenho ---------- */
  const fmt = d => d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
  const somaDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  function classe(c, rec, aberto) {
    if (!rec) return aberto ? "gc-exe" : "gc-enc";
    const passou = c.dias > rec;
    return aberto ? (passou ? "gc-atr" : "gc-exe") : (passou ? "gc-pas" : "gc-enc");
  }

  function render(res) {
    ultimoRes = res;
    if (!montar()) return;
    const sec = $("sec-ciclos"); if (sec.hidden) return;   // só desenha com a aba aberta
    sec.querySelectorAll("[data-gj]").forEach(b => b.classList.toggle("on", b.dataset.gj === janela));
    const ref = res.ref, A = Object.values(res.porArea).sort((a, b) => a.area - b.area);
    const todos = A.flatMap(a => a.ciclos || []);
    if (!todos.length) {
      $("gcGrade").innerHTML = `<div class="gc-vazio" style="grid-column:1/-1">Nenhum ciclo na aba <b>Ciclos</b> da planilha (colunas Área, Ciclo, Início, Fim).</div>`;
      $("gcAlertas").innerHTML = ""; return;
    }
    // período mostrado
    const fimDe = (c, a) => { const prev = a.recorrencia ? somaDias(c.inicio, a.recorrencia - 1) : null; return new Date(Math.max(c.fim || ref, prev || 0)); };
    let ini = new Date(Math.min(...todos.map(c => c.inicio)));
    let fim = new Date(Math.max(ref, ...A.flatMap(a => (a.ciclos || []).map(c => fimDe(c, a)))));
    if (janela !== "tudo") { const j = +janela; ini = new Date(Math.max(ini, somaDias(ref, -Math.round(j * .75)))); fim = new Date(Math.max(fim, somaDias(ref, Math.round(j * .25)))); if ((fim - ini) / DIA > j) fim = somaDias(ini, j); }
    ini = somaDias(ini, -2); fim = somaDias(fim, 3);
    const total = (fim - ini) / DIA, X = d => Math.max(0, Math.min(100, (d - ini) / DIA / total * 100));

    // cabeçalho com meses e linhas de semana
    let topo = "", grade = "";
    for (let d = new Date(ini.getFullYear(), ini.getMonth(), 1); d <= fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      if (d >= ini) topo += `<div class="gc-mes" style="left:${X(d)}%">${d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(". de ", "/").replace(" de ", "/")}</div>`;
    }
    for (let d = U.inicioSemana(ini); d <= fim; d = somaDias(d, 7)) if (d >= ini) grade += `<div class="gc-grade" style="left:${X(d)}%"></div>`;
    const hoje = ref >= ini && ref <= fim ? `<div class="gc-hoje" style="left:${X(ref)}%"></div>` : "";

    const alertas = [];
    let html = `<div></div><div class="gc-topo">${topo}${ref >= ini && ref <= fim ? `<div class="gc-hoje-rot" style="left:${X(ref)}%">${fmt(ref)}</div>` : ""}</div>`;
    A.forEach(a => {
      const cs = (a.ciclos || []).slice().sort((x, y) => x.inicio - y.inicio);
      const aberto = cs.filter(c => !c.fim || c.fim >= ref).pop();
      html += `<div class="gc-nome"><b>Área ${a.area}</b> · ${U.esc(a.supervisor || "")}<small>${a.recorrencia ? `recorrência ${a.recorrencia} dias` : "sem recorrência"}${aberto ? ` · ${U.esc(aberto.ciclo)} em ${U.fmtPct(aberto.pct)}%` : ""}</small></div><div class="gc-trilho">${grade}${hoje}`;
      cs.forEach(c => {
        const fc = c.fim || ref, emAberto = !c.fim || c.fim >= ref;
        if (fc < ini || c.inicio > fim) return;
        const l = X(c.inicio), w = Math.max(.6, X(somaDias(fc, 1)) - l), cls = classe(c, a.recorrencia, emAberto);
        const prev = a.recorrencia ? somaDias(c.inicio, a.recorrencia - 1) : null;
        const atraso = a.recorrencia && c.dias > a.recorrencia ? c.dias - a.recorrencia : 0;
        const tip = `<b>Área ${a.area} · ${U.esc(c.ciclo)}</b> (${U.esc(c.status || (c.fim ? "encerrado" : "em execução"))})<br>`
          + `${fmt(c.inicio)} a ${c.fim ? fmt(c.fim) : "hoje"} · ${c.dias} dia(s)<br>`
          + `Feito: <b>${U.km(c.feito)}</b> de ${U.km(a.plano)} = <b>${U.fmtPct(c.pct)}%</b> · ${c.n} lançamento(s)<br>`
          + (prev ? `Fim previsto: ${fmt(prev)} (recorrência ${a.recorrencia} dias)${atraso ? `<br><b style="color:#c0392b">${atraso} dia(s) além da recorrência</b>` : ""}` : "Área sem recorrência na aba Areas")
          + `<br><small>Clique para abrir a área no mapa</small>`;
        html += `<div class="gc-barra ${cls}" style="left:${l}%;width:${w}%" data-tip="${U.esc(tip)}" data-area="${a.area}"><div class="f" style="width:${Math.min(100, c.pct)}%"></div><div class="t">${U.esc(c.ciclo)} · ${U.fmtPct(c.pct)}%</div></div>`;
        if (prev && prev >= ini && prev <= fim) html += `<div class="gc-prev" style="left:${X(somaDias(prev, 1))}%"></div>`;
        if (emAberto && atraso) alertas.push(`Área ${a.area} (${U.esc(a.supervisor || "")}): ${U.esc(c.ciclo)} aberto há ${c.dias} dias, ${atraso} além da recorrência de ${a.recorrencia}, com ${U.fmtPct(c.pct)}% da meta.`);
      });
      html += `</div>`;
    });
    $("gcGrade").innerHTML = html;
    $("gcAlertas").innerHTML = alertas.length
      ? `<div class="gc-alerta"><b>${alertas.length} ciclo(s) em execução passaram da recorrência:</b><br>${alertas.join("<br>")}</div>`
      : `<div class="gc-alerta ok">Nenhum ciclo em execução passou da recorrência da área.</div>`;
    $("gcGrade").querySelectorAll(".gc-barra[data-area]").forEach(b => b.onclick = () => window.open("index.html#area=" + b.dataset.area, "_blank"));
  }

  return { render };
})();
