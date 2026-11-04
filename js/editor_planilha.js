/* Editor Visual da Planilha no Site (Modo Teste Ativável/Desativável)
   Permite visualizar e editar diretamente no site as 5 abas da planilha (Executado, Aba Pontos, Ciclos, Areas, Capina),
   refletindo imediatamente no Mapa e no Dashboard, além de permitir baixar o .xlsx atualizado.
*/
const EditorPlanilha = (() => {
  const ABAS = [
    { chave: "Executado",  rotulo: "Executado (Lançamentos)", colsPadrao: ["Carimbo de data/hora", "Data do serviço", "Lançado por", "Supervisor", "Equipe", "Área", "Bairro", "Rua", "Perímetro - de", "Perímetro - até", "Extensão (m)", "Ciclo", "Serviço", "Nº de homens", "Observação"] },
    { chave: "Aba Pontos", rotulo: "Aba Pontos (Pontos Críticos)", colsPadrao: ["Data", "Ponto", "Status", "Observação"] },
    { chave: "Ciclos",     rotulo: "Ciclos (Prazos por Área)", colsPadrao: ["Área", "Ciclo", "Início", "Fim", "Status", "Observação"] },
    { chave: "Areas",      rotulo: "Areas (Supervisores e Metas)", colsPadrao: ["Supervisor", "Área", "Sds", "Extensão", "Capina", "Equipes", "Recorrência (dias)"] },
    { chave: "Capina",     rotulo: "Capina (Resumo km)", colsPadrao: ["Data", "Área", "Km", "Observação"] }
  ];

  let abaAtiva = "Executado";
  let busca = "";
  let limiteLinhas = 80;
  let wbEditavel = null;
  let onSalvarCallback = null;

  function obterPlanilhaEditavel() {
    if (wbEditavel) return wbEditavel;
    const salva = U.ler("planilha_editada_teste", null);
    if (salva && salva.Executado) {
      wbEditavel = JSON.parse(JSON.stringify(salva));
    } else if (window.Dados && Dados.ultimaBruta && Dados.ultimaBruta.Executado) {
      wbEditavel = JSON.parse(JSON.stringify(Dados.ultimaBruta));
    } else if (window.PLANILHA_LOCAL) {
      wbEditavel = JSON.parse(JSON.stringify(window.PLANILHA_LOCAL));
    } else {
      wbEditavel = {};
    }
    ABAS.forEach(a => {
      if (!wbEditavel[a.chave]) wbEditavel[a.chave] = { cols: a.colsPadrao.slice(), rows: [] };
    });
    return wbEditavel;
  }

  function sincronizarDaFonteAtual() {
    const salva = U.ler("planilha_editada_teste", null);
    if (!salva && window.Dados && Dados.ultimaBruta && Dados.ultimaBruta.Executado) {
      wbEditavel = JSON.parse(JSON.stringify(Dados.ultimaBruta));
      ABAS.forEach(a => {
        if (!wbEditavel[a.chave]) wbEditavel[a.chave] = { cols: a.colsPadrao.slice(), rows: [] };
      });
    }
  }

  function salvarEAplicar(container) {
    if (!wbEditavel) return;
    U.guardar("planilha_editada_teste", wbEditavel);
    U.guardar("fonte_novo", "local");
    if (onSalvarCallback) onSalvarCallback(wbEditavel);
    const av = container && container.querySelector("#avisoSalvoPlanilha");
    if (av) {
      av.textContent = "✓ Alterações aplicadas no Mapa e no Dashboard às " + new Date().toLocaleTimeString("pt-BR");
      av.hidden = false;
    }
  }

  function restaurarOriginal(container) {
    try { localStorage.removeItem("capina_planilha_editada_teste"); } catch (e) {}
    wbEditavel = window.PLANILHA_LOCAL ? JSON.parse(JSON.stringify(window.PLANILHA_LOCAL)) : null;
    if (onSalvarCallback) onSalvarCallback(wbEditavel);
    renderizar(container, onSalvarCallback);
  }

  function baixarExcelEditado() {
    const p = obterPlanilhaEditavel();
    const wb = XLSX.utils.book_new();
    ABAS.forEach(a => {
      const tab = p[a.chave] || { cols: a.colsPadrao, rows: [] };
      const aoa = [tab.cols, ...tab.rows.map(r => r.map(c => c ? c.v : ""))];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), a.chave);
    });
    XLSX.writeFile(wb, "Planilha_Capina_Editada_" + U.ymd(new Date()) + ".xlsx");
  }

  function novaLinhaPadrao(aba) {
    const hj = U.ymd(new Date());
    const cel = v => ({ v, f: String(v ?? "") });
    if (aba === "Executado") {
      return [cel(hj + " 08:30:00"), cel(hj), cel("Site (Teste)"), cel("Denis"), cel("CR 07-A"), cel(7), cel("Nazaré"), cel("AV. NAZARÉ"), cel("AV. PRESIDENTE VARGAS"), cel("TV. 14 DE MARÇO"), cel(1950), cel("C04"), cel("Capinação e raspagem"), cel(11), cel("Lançado pelo editor do site")];
    }
    if (aba === "Aba Pontos") {
      return [cel(hj), cel("A7_P01"), cel("Coletado"), cel("Atualizado direto no site")];
    }
    if (aba === "Ciclos") {
      return [cel(1), cel("C03"), cel(hj), cel(""), cel("EM EXECUÇÃO"), cel("Novo ciclo")];
    }
    if (aba === "Areas") {
      return [cel("Supervisor"), cel(1), cel("8"), cel(132.62), cel(132.62), cel(2), cel(28)];
    }
    return [cel(hj), cel(1), cel(1.95), cel("Resumo manual")];
  }

  function renderizarCelulaInput(aba, colIdx, nomeCol, valor) {
    const n = U.norm(nomeCol);
    const valEsc = U.esc(valor);
    // Seletores rápidos para colunas padronizadas
    if (aba === "Aba Pontos" && (n.includes("status") || n.includes("situacao"))) {
      const opcoes = ["Coletado", "Não coletado", "Pendente"];
      return `<select class="cel-in" data-col="${colIdx}">
        ${opcoes.map(op => `<option value="${op}" ${U.norm(valor) === U.norm(op) ? "selected" : ""}>${op}</option>`).join("")}
      </select>`;
    }
    if (aba === "Ciclos" && n.includes("status")) {
      const opcoes = ["EM EXECUÇÃO", "ENCERRADO", "EXECUÇÃO LONGA", "CRÍTICO"];
      return `<select class="cel-in" data-col="${colIdx}">
        ${opcoes.map(op => `<option value="${op}" ${U.norm(valor) === U.norm(op) ? "selected" : ""}>${op}</option>`).join("")}
      </select>`;
    }
    if (aba === "Executado" && n === "servico") {
      const opcoes = (window.CFG && CFG.servicos) || ["Capinação e raspagem", "Roçagem", "Pintura", "Mutirão"];
      return `<select class="cel-in" data-col="${colIdx}">
        ${opcoes.map(op => `<option value="${U.esc(op)}" ${U.norm(valor) === U.norm(op) ? "selected" : ""}>${U.esc(op)}</option>`).join("")}
      </select>`;
    }
    const largo = n.includes("rua") || n.includes("perimetro") || n.includes("obs") || n.includes("bairro");
    const curto = n === "area" || n === "ciclo" || n === "sds" || n === "equipes" || n.includes("homens");
    return `<input type="text" class="cel-in ${largo ? 'largo' : curto ? 'curto' : ''}" data-col="${colIdx}" value="${valEsc}" />`;
  }

  function renderizar(container, cbSalvar) {
    if (!container) return;
    ultimoContainer = container;
    if (cbSalvar) onSalvarCallback = cbSalvar;
    sincronizarDaFonteAtual();
    const p = obterPlanilhaEditavel();
    const tab = p[abaAtiva] || { cols: [], rows: [] };
    const temEdicao = !!U.ler("planilha_editada_teste", null);

    // Filtra linhas mantendo o índice original da linha (rowIdx)
    const termo = U.norm(busca);
    const linhasComIndice = tab.rows.map((r, rowIdx) => ({ r, rowIdx })).filter(({ r }) => {
      if (!termo) return true;
      return r.some(c => c && U.norm(c.f ?? c.v).includes(termo));
    });

    const visiveis = linhasComIndice.slice(0, limiteLinhas);

    container.innerHTML = `
      <div class="ed-plan-cab">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <b style="font-size:15px">Planilha de teste</b>
            ${temEdicao ? `<span class="st-pill st-ok">Com edições ativas no site</span>` : `<span class="st-pill st-neutral">Dados originais</span>`}
          </div>
          <div style="font-size:12px;color:var(--cinza);margin-top:3px">
            Edite qualquer célula abaixo, adicione novas ruas lançadas ou mude o status de pontos críticos. Ao clicar em <b>"Aplicar alterações"</b>, o Mapa e o Dashboard atualizam na hora.
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button type="button" id="btEdAplicar">Aplicar no mapa e no dashboard</button>
          <button type="button" class="sec" id="btEdBaixarXlsx">Baixar Excel (.xlsx)</button>
          ${temEdicao ? `<button type="button" class="sec" id="btEdRestaurar" style="color:var(--vermelho)">Voltar à planilha original</button>` : ""}
        </div>
      </div>

      <div id="avisoSalvoPlanilha" class="ed-aviso-ok" hidden></div>

      <div class="ed-plan-barra">
        <div class="seg" id="edSegAbas" style="margin:0;flex-wrap:wrap">
          ${ABAS.map(a => {
            const qtd = (p[a.chave] && p[a.chave].rows ? p[a.chave].rows.length : 0);
            return `<button type="button" data-ed-aba="${a.chave}" class="${abaAtiva === a.chave ? 'on' : ''}">${a.rotulo} (${qtd})</button>`;
          }).join("")}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="search" id="inEdBusca" class="ed-busca" placeholder="Filtrar linhas nesta aba (ex.: A5_P, Denis, CR 07)…" value="${U.esc(busca)}" />
          <button type="button" class="sec" id="btEdNovaLinha">&#10010; Adicionar linha em "${abaAtiva}"</button>
        </div>
      </div>

      <div class="ed-grid-wrap">
        <table class="ed-grid-tab">
          <thead>
            <tr>
              <th style="width:42px">#</th>
              ${tab.cols.map(c => `<th>${U.esc(c)}</th>`).join("")}
              <th style="width:50px">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${visiveis.map(({ r, rowIdx }) => `
              <tr data-row="${rowIdx}">
                <td class="ed-num">${rowIdx + 1}</td>
                ${tab.cols.map((colName, colIdx) => {
                  const cel = r[colIdx];
                  const val = cel ? (cel.f ?? cel.v ?? "") : "";
                  return `<td>${renderizarCelulaInput(abaAtiva, colIdx, colName, val)}</td>`;
                }).join("")}
                <td style="text-align:center">
                  <button type="button" class="ed-bt-del" data-del-row="${rowIdx}" title="Excluir esta linha">&times;</button>
                </td>
              </tr>
            `).join("") || `<tr><td colspan="${tab.cols.length + 2}" style="padding:18px;text-align:center;color:var(--cinza)">Nenhuma linha encontrada nesta aba.</td></tr>`}
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:12px;color:var(--cinza)">
        <span>Exibindo <b>${visiveis.length}</b> de <b>${linhasComIndice.length}</b> linha(s) da aba <b>${abaAtiva}</b>.</span>
        ${linhasComIndice.length > limiteLinhas ? `<button type="button" class="sec" id="btEdMostrarMais">Mostrar todas as ${linhasComIndice.length} linhas</button>` : ""}
      </div>
    `;

    // Eventos de abas
    container.querySelectorAll("[data-ed-aba]").forEach(bt => {
      bt.onclick = () => {
        abaAtiva = bt.dataset.edAba;
        limiteLinhas = 80;
        renderizar(container, onSalvarCallback);
      };
    });

    // Busca
    const inBusca = container.querySelector("#inEdBusca");
    if (inBusca) {
      inBusca.oninput = ev => {
        busca = ev.target.value;
        renderizar(container, onSalvarCallback);
        const novoIn = container.querySelector("#inEdBusca");
        if (novoIn) { novoIn.focus(); novoIn.setSelectionRange(busca.length, busca.length); }
      };
    }

    // Edição de célula (atualiza wbEditavel imediatamente)
    container.querySelectorAll(".cel-in").forEach(inp => {
      const atualizar = () => {
        const tr = inp.closest("tr");
        if (!tr) return;
        const rIdx = +tr.dataset.row;
        const cIdx = +inp.dataset.col;
        const raw = inp.value;
        const numVal = (/^-?\d+(\.\d+)?$/.test(raw.trim()) && !/^0\d/.test(raw.trim())) ? +raw.trim() : raw;
        if (!tab.rows[rIdx]) return;
        tab.rows[rIdx][cIdx] = { v: numVal, f: String(raw) };
      };
      inp.oninput = atualizar;
      inp.onchange = () => { atualizar(); salvarEAplicar(container); };
    });

    // Nova linha no topo
    const btNova = container.querySelector("#btEdNovaLinha");
    if (btNova) {
      btNova.onclick = () => {
        tab.rows.unshift(novaLinhaPadrao(abaAtiva));
        salvarEAplicar(container);
        renderizar(container, onSalvarCallback);
      };
    }

    // Excluir linha
    container.querySelectorAll("[data-del-row]").forEach(bt => {
      bt.onclick = () => {
        const rIdx = +bt.dataset.delRow;
        tab.rows.splice(rIdx, 1);
        salvarEAplicar(container);
        renderizar(container, onSalvarCallback);
      };
    });

    // Mostrar mais
    const btMais = container.querySelector("#btEdMostrarMais");
    if (btMais) {
      btMais.onclick = () => {
        limiteLinhas = 9999;
        renderizar(container, onSalvarCallback);
      };
    }

    // Aplicar, Baixar, Restaurar
    const btAp = container.querySelector("#btEdAplicar");
    if (btAp) btAp.onclick = () => salvarEAplicar(container);

    const btBx = container.querySelector("#btEdBaixarXlsx");
    if (btBx) btBx.onclick = () => baixarExcelEditado();

    const btRs = container.querySelector("#btEdRestaurar");
    if (btRs) btRs.onclick = () => restaurarOriginal(container);
  }

  // lançamento vindo do formulário do site: entra no topo da aba Executado
  let ultimoContainer = null;
  function adicionarLancamento(obj) {
    const p = obterPlanilhaEditavel(), tab = p.Executado;
    const n = s => U.norm(s);
    tab.rows.unshift(tab.cols.map(c => { const k = Object.keys(obj).find(x => n(x) === n(c)); const v = k ? obj[k] : ""; return { v, f: String(v ?? "") }; }));
    salvarEAplicar(ultimoContainer);
    if (ultimoContainer) renderizar(ultimoContainer, onSalvarCallback);
  }
  return { renderizar, baixarExcelEditado, restaurarOriginal, obterPlanilhaEditavel, adicionarLancamento };
})();
if (typeof window !== "undefined") window.EditorPlanilha = EditorPlanilha;
