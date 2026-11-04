/* Exportação: KML / KMZ / DXF (UTM 22S SIRGAS 2000), GeoJSON (QGIS), Planejamento (Linhas, Polígonos/Áreas, Pontos) e planilhas Excel */
const Exportar = (() => {
  const GEO = DADOS_GEO, C = CFG.cores;
  const TXT_STATUS_PADRAO = { coletado: "Coletado", nao: "Não coletado", pendente: "Pendente" };
  const TXT_SITU_PADRAO   = { emdia: "Em dia", vencendo: "Perto de vencer", vencido: "Vencido", semrec: "Sem recorrência", nunca: "Sem registro" };
  const TXT_LOC_PADRAO    = { trecho: "Trecho entre as ruas do perímetro", aprox: "Trecho aproximado (só uma rua do perímetro encontrada)", rua: "Rua encontrada; trecho do perímetro não identificado" };

  const txtStatus = s => (window.Mapa && Mapa.TXT_STATUS && Mapa.TXT_STATUS[s]) || TXT_STATUS_PADRAO[s] || s;
  const txtSitu   = s => (window.Mapa && Mapa.TXT_SITU && Mapa.TXT_SITU[s]) || TXT_SITU_PADRAO[s] || s;
  const txtLoc    = s => (window.Painel && Painel.TXT_LOC && Painel.TXT_LOC[s]) || TXT_LOC_PADRAO[s] || s;

  const xml = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const kmlCor = (hex, a = 1) => { const h = String(hex || "#1e7b34").replace("#", "").padEnd(6, "0"); return Math.round(a * 255).toString(16).padStart(2, "0") + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); };
  const coord = pts => pts.map(p => `${p[1].toFixed(6)},${p[0].toFixed(6)},0`).join(" ");
  const coordAnel = pts => {
    if (!pts || !pts.length) return "";
    const fech = (pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) ? pts : [...pts, pts[0]];
    return coord(fech);
  };
  const nome = ext => "acompanhamento_capina_" + U.ymd(new Date()) + "." + ext;
  // camadas enviadas pelo usuário (botão Camadas) que estão ligadas no mapa
  const camadasEnviadas = () => (window.FerramentasExtra && FerramentasExtra.camadasParaExportar && FerramentasExtra.camadasParaExportar()) || [];
  const capinaVisivel = () => !(typeof App !== "undefined" && App.ui && App.ui.mapaLimpo);
  const semAcento = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const nomeCamadaDxf = s => ("ENVIADO_" + semAcento(s).toUpperCase().replace(/[^A-Z0-9_-]+/g, "_")).slice(0, 31);
  function kmlCamadas() {
    const est = [], pastas = [];
    camadasEnviadas().forEach((c, ci) => {
      const sid = "cam" + ci;
      est.push(`<Style id="${sid}"><LineStyle><color>${kmlCor(c.cor)}</color><width>2.5</width></LineStyle><PolyStyle><color>${kmlCor(c.cor, c.opac == null ? .25 : c.opac)}</color></PolyStyle><IconStyle><color>${kmlCor(c.cor)}</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`);
      const pms = c.feicoes.map((f, i) => {
        const props = f.props || {}, nm = props.Nome || props.nome || props.name || Object.values(props)[0] || (c.nome + " " + (i + 1));
        const ext = `<ExtendedData>${Object.entries(props).map(([k, v]) => dado(k, v)).join("")}</ExtendedData>`;
        let g;
        if (f.tipo === "ponto") g = `<Point><coordinates>${f.ll[1].toFixed(7)},${f.ll[0].toFixed(7)},0</coordinates></Point>`;
        else if (f.tipo === "linha") g = `<MultiGeometry>${f.partes.map(l => `<LineString><tessellate>1</tessellate><coordinates>${coord(l)}</coordinates></LineString>`).join("")}</MultiGeometry>`;
        else g = `<MultiGeometry>${f.polys.map(pg => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordAnel(pg[0])}</coordinates></LinearRing></outerBoundaryIs>${pg.slice(1).map(h => `<innerBoundaryIs><LinearRing><coordinates>${coordAnel(h)}</coordinates></LinearRing></innerBoundaryIs>`).join("")}</Polygon>`).join("")}</MultiGeometry>`;
        return `<Placemark><name>${xml(nm)}</name><styleUrl>#${sid}</styleUrl>${ext}${g}</Placemark>`;
      });
      pastas.push(`<Folder><name>${xml(c.nome)}</name>${pms.join("\n")}</Folder>`);
    });
    return { est, pasta: pastas.length ? `<Folder><name>Camadas enviadas</name>${pastas.join("\n")}</Folder>` : "" };
  }
  const dado = (k, v) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`;

  // Conversão de cor Hex (#RRGGBB) para AutoCAD Color Index (ACI) mais próximo
  function hexParaAci(hex) {
    const h = String(hex || "#1e7b34").replace("#", "");
    const r = parseInt(h.slice(0, 2), 16) || 0, g = parseInt(h.slice(2, 4), 16) || 0, b = parseInt(h.slice(4, 6), 16) || 0;
    const pal = [
      [1, 255, 0, 0],     // Vermelho (#ff5252)
      [2, 255, 255, 0],   // Amarelo
      [3, 0, 255, 0],     // Verde claro
      [4, 0, 255, 255],   // Ciano
      [5, 0, 120, 255],   // Azul (#0288d1)
      [6, 255, 0, 255],   // Magenta / Roxo
      [30, 232, 89, 12],  // Laranja
      [94, 30, 123, 52],  // Verde Belém Limpa
      [7, 255, 255, 255]  // Branco
    ];
    let best = 94, bd = 1e9;
    pal.forEach(([aci, pr, pg, pb]) => {
      const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (d < bd) { bd = d; best = aci; }
    });
    return best;
  }

  function kml(res) {
    const est = [], pm = { areas: [], exec: [], pontos: [], rotas: [], planejadas: [] };
    GEO.areas.forEach(a => {
      const A = res.porArea[a.area] || {};
      est.push(`<Style id="a${a.area}"><LineStyle><color>${kmlCor(C.areaMyMaps[a.area])}</color><width>2</width></LineStyle><PolyStyle><color>${kmlCor(C.areaMyMaps[a.area], .5)}</color></PolyStyle></Style>`);
      const g = a.polys.map(p => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coord(p[0])}</coordinates></LinearRing></outerBoundaryIs>${p.slice(1).map(h => `<innerBoundaryIs><LinearRing><coordinates>${coord(h)}</coordinates></LinearRing></innerBoundaryIs>`).join("")}</Polygon>`).join("");
      pm.areas.push(`<Placemark><name>Área ${a.area} – ${xml(A.supervisor)} (${U.fmt(A.pct || 0, 1)}%)</name><styleUrl>#a${a.area}</styleUrl><ExtendedData>${dado("Área", a.area)}${dado("Supervisor", A.supervisor)}${dado("Ciclo", A.ciclo ? A.ciclo.ciclo : "")}${dado("Planejado (km)", U.fmt((A.plano || 0) / 1000))}${dado("Executado (km)", U.fmt(Math.min(A.feito || 0, A.plano || 0) / 1000))}${dado("Concluído (%)", U.fmt(A.pct || 0, 1))}</ExtendedData><MultiGeometry>${g}</MultiGeometry></Placemark>`);
    });
    ["coletado", "nao", "pendente"].forEach(s => est.push(`<Style id="p_${s}"><IconStyle><color>${kmlCor(C.status[s])}</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`));
    GEO.pontos.forEach(p => { const r = res.pontos[p.cod], s = Calc.statusPonto(r);
      pm.pontos.push(`<Placemark><name>${xml(p.cod)}</name><styleUrl>#p_${s}</styleUrl><ExtendedData>${dado("Identificação", p.id)}${dado("Área", p.area)}${dado("Ordem", p.ordem)}${dado("Bairro", p.bairro)}${dado("Patrulha", p.patrulha)}${dado("Material", p.material)}${dado("Situação", txtStatus(s))}${dado("Data", r && r.data ? U.fmtData(r.data) : "")}</ExtendedData><Point><coordinates>${p.ll[1]},${p.ll[0]},0</coordinates></Point></Placemark>`); });
    GEO.rotas.forEach(r => { est.push(`<Style id="r${r.area}"><LineStyle><color>${kmlCor(C.rotaMyMaps[r.area] || "#374151")}</color><width>3</width></LineStyle></Style>`);
      pm.rotas.push(`<Placemark><name>${xml(r.nome)}</name><styleUrl>#r${r.area}</styleUrl><LineString><coordinates>${coord(r.coords)}</coordinates></LineString></Placemark>`); });
    est.push(`<Style id="e_dentro"><LineStyle><color>${kmlCor(C.exec.dentro)}</color><width>5</width></LineStyle></Style><Style id="e_fora"><LineStyle><color>${kmlCor(C.exec.fora)}</color><width>5</width></LineStyle></Style>`);
    res.visiveis.filter(e => e.loc.ok).forEach(e => pm.exec.push(`<Placemark><name>${xml(e.rua)}</name><styleUrl>#e_${e.fora ? "fora" : "dentro"}</styleUrl><ExtendedData>${dado("Data", U.fmtData(e.data))}${dado("Serviço", e.servico)}${dado("Perímetro", (e.de || "") + (e.ate ? " / " + e.ate : ""))}${dado("Equipe", e.equipe)}${dado("Supervisor", e.supervisor)}${dado("Área", e.areaRef ?? "")}${dado("Bairro", e.bairro)}${dado("Metros", Math.round(e.metros))}${dado("Ciclo", e.cicloCalc)}${dado("Fora do planejado", e.fora ? "Sim" : "Não")}</ExtendedData><MultiGeometry>${e.loc.linhas.map(l => `<LineString><coordinates>${coord(l)}</coordinates></LineString>`).join("")}</MultiGeometry></Placemark>`));

    // Incluir itens desenhados/planejados no Estúdio (Linhas, Polígonos/Áreas, Pontos)
    const desen = (window.FerramentasMapa && FerramentasMapa.desenhos) || U.ler("desenhos_mymaps", []);
    desen.forEach((d, idx) => {
      const sid = "pl_" + idx;
      const tp = d.tipo || "linha";
      if (tp === "ponto" && d.coords && d.coords[0]) {
        est.push(`<Style id="${sid}"><IconStyle><color>${kmlCor(d.cor || "#e11d48")}</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`);
        pm.planejadas.push(`<Placemark><name>${xml(d.nome || "Ponto " + (idx + 1))}</name><styleUrl>#${sid}</styleUrl><ExtendedData>${dado("Tipo", "Ponto Planejado")}${dado("Área", d.area || "")}${dado("Patrulha", d.patrulha || "")}${dado("Material", d.material || "")}${dado("Observação", d.obs || "")}</ExtendedData><Point><coordinates>${d.coords[0][1].toFixed(6)},${d.coords[0][0].toFixed(6)},0</coordinates></Point></Placemark>`);
      } else if (tp === "poligono" && d.coords && d.coords.length >= 3) {
        est.push(`<Style id="${sid}"><LineStyle><color>${kmlCor(d.cor || "#1e7b34")}</color><width>${d.espessura || 3}</width></LineStyle><PolyStyle><color>${kmlCor(d.cor || "#1e7b34", 0.38)}</color></PolyStyle></Style>`);
        pm.planejadas.push(`<Placemark><name>${xml(d.nome || "Área " + (idx + 1))}</name><styleUrl>#${sid}</styleUrl><ExtendedData>${dado("Tipo", "Área / Setor")}${dado("Área", d.area || "")}${dado("Supervisor", d.supervisor || "")}${dado("Área (ha)", d.areaHa ? U.fmt(d.areaHa, 2) : "")}${dado("Observação", d.obs || "")}</ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>${coordAnel(d.coords)}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`);
      } else if (d.coords && d.coords.length >= 2) {
        est.push(`<Style id="${sid}"><LineStyle><color>${kmlCor(d.cor || "#1e7b34")}</color><width>${d.espessura || 4}</width></LineStyle></Style>`);
        pm.planejadas.push(`<Placemark><name>${xml(d.nome || "Linha " + (idx + 1))}</name><styleUrl>#${sid}</styleUrl><ExtendedData>${dado("Tipo", "Rota / OS")}${dado("Área", d.area || "")}${dado("Extensão (m)", Math.round(d.metros || 0))}${dado("Observação", d.obs || "")}</ExtendedData><LineString><tessellate>1</tessellate><coordinates>${coord(d.coords)}</coordinates></LineString></Placemark>`);
      }
    });

    const pasta = (k, n) => `<Folder><name>${n}</name>${pm[k].join("\n")}</Folder>`;
    const cams = kmlCamadas(); est.push(...cams.est);
    const capina = capinaVisivel() ? `${pasta("areas", "Áreas")}\n${pasta("exec", "Lançamentos")}\n${pasta("pontos", "Pontos críticos")}\n${pasta("rotas", "Rotas de coleta")}` : "";
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Acompanhamento de Capina – ${new Date().toLocaleDateString("pt-BR")}</name>\n${est.join("\n")}\n${capina}\n${pm.planejadas.length ? pasta("planejadas", "Planejamento (rotas, áreas e pontos)") : ""}\n${cams.pasta}\n</Document></kml>`;
  }

  /* ---------- Exportação exclusiva do Planejamento (Linhas/OS, Polígonos/Setores e Pontos) ---------- */
  function kmlDesenhos(itens) {
    const lista = itens || [];
    const est = [], pmsLinhas = [], pmsPolys = [], pmsPts = [];
    lista.forEach((d, i) => {
      const sid = "estilo_pl_" + (i + 1);
      const tp = d.tipo || "linha";
      if (tp === "ponto" && d.coords && d.coords[0]) {
        est.push(`<Style id="${sid}"><IconStyle><color>${kmlCor(d.cor || "#e11d48")}</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`);
        pmsPts.push(`<Placemark>
        <name>${xml(d.nome || "PC " + (i + 1))}</name>
        <description>${xml((d.patrulha || "Manual") + " · " + (d.material || "Entulho") + (d.obs ? " — " + d.obs : ""))}</description>
        <styleUrl>#${sid}</styleUrl>
        <ExtendedData>
          ${dado("Código / Nome", d.nome || "")}
          ${dado("Área / Setor", d.area || "")}
          ${dado("Patrulha", d.patrulha || "Manual")}
          ${dado("Material", d.material || "Entulho")}
          ${dado("Status", d.status || "Pendente")}
          ${dado("Observação", d.obs || "")}
        </ExtendedData>
        <Point><coordinates>${d.coords[0][1].toFixed(6)},${d.coords[0][0].toFixed(6)},0</coordinates></Point>
      </Placemark>`);
      } else if (tp === "poligono" && d.coords && d.coords.length >= 3) {
        est.push(`<Style id="${sid}"><LineStyle><color>${kmlCor(d.cor || "#1e7b34")}</color><width>${d.espessura || 3}</width></LineStyle><PolyStyle><color>${kmlCor(d.cor || "#1e7b34", 0.4)}</color></PolyStyle></Style>`);
        pmsPolys.push(`<Placemark>
        <name>${xml(d.nome || "Área Planejada " + (i + 1))}</name>
        <description>${xml((d.supervisor ? "Sup: " + d.supervisor + " · " : "") + (d.areaHa ? U.fmt(d.areaHa, 2) + " ha · " : "") + U.fmtKm(d.metros || 0) + " de perímetro")}</description>
        <styleUrl>#${sid}</styleUrl>
        <ExtendedData>
          ${dado("Nome / Setor", d.nome || "")}
          ${dado("Área", d.area || "")}
          ${dado("Supervisor / Responsável", d.supervisor || "")}
          ${dado("Frequência / Recorrência", d.frequencia || "")}
          ${dado("Área (ha)", d.areaHa ? +d.areaHa.toFixed(2) : "")}
          ${dado("Perímetro (m)", Math.round(d.metros || 0))}
          ${dado("Observação", d.obs || "")}
        </ExtendedData>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>${coordAnel(d.coords)}</coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>`);
      } else if (d.coords && d.coords.length >= 2) {
        est.push(`<Style id="${sid}"><LineStyle><color>${kmlCor(d.cor || "#1e7b34")}</color><width>${d.espessura || 5}</width></LineStyle></Style>`);
        pmsLinhas.push(`<Placemark>
        <name>${xml(d.nome || "Rota Planejada " + (i + 1))}</name>
        <description>${xml((d.area ? "Área " + d.area + " · " : "") + U.fmtKm(d.metros || 0) + (d.obs ? " — " + d.obs : ""))}</description>
        <styleUrl>#${sid}</styleUrl>
        <ExtendedData>
          ${dado("Nome", d.nome || "")}
          ${dado("Área", d.area || "")}
          ${dado("Cor", d.cor || "#1e7b34")}
          ${dado("Extensão (m)", Math.round(d.metros || 0))}
          ${dado("Extensão (km)", +((d.metros || 0) / 1000).toFixed(3))}
          ${dado("Observação", d.obs || "")}
        </ExtendedData>
        <LineString><tessellate>1</tessellate><coordinates>${coord(d.coords)}</coordinates></LineString>
      </Placemark>`);
      }
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n  <name>Planejamento Operacional – Belém/PA (${new Date().toLocaleDateString("pt-BR")})</name>\n  ${est.join("\n  ")}\n  ${pmsPolys.length ? `<Folder>\n    <name>Áreas e Setores Planejados</name>\n    ${pmsPolys.join("\n    ")}\n  </Folder>` : ""}\n  ${pmsLinhas.length ? `<Folder>\n    <name>Rotas, Ruas e Ordens de Serviço</name>\n    ${pmsLinhas.join("\n    ")}\n  </Folder>` : ""}\n  ${pmsPts.length ? `<Folder>\n    <name>Pontos Críticos e Operacionais</name>\n    ${pmsPts.join("\n    ")}\n  </Folder>` : ""}\n</Document>\n</kml>`;
  }

  function geojsonDesenhos(itens) {
    const lista = itens || [];
    const features = [];
    lista.forEach((d, i) => {
      const tp = d.tipo || "linha";
      if (tp === "ponto" && d.coords && d.coords[0]) {
        features.push({
          type: "Feature",
          properties: {
            id: d.id || (i + 1),
            tipo: "ponto",
            nome: d.nome || "PC " + (i + 1),
            area: d.area || "",
            cor: d.cor || "#e11d48",
            patrulha: d.patrulha || "Manual",
            material: d.material || "Entulho",
            status: d.status || "Pendente",
            observacao: d.obs || ""
          },
          geometry: { type: "Point", coordinates: [d.coords[0][1], d.coords[0][0]] }
        });
      } else if (tp === "poligono" && d.coords && d.coords.length >= 3) {
        const anel = d.coords.map(p => [p[1], p[0]]);
        if (anel[0][0] !== anel[anel.length - 1][0] || anel[0][1] !== anel[anel.length - 1][1]) anel.push(anel[0]);
        features.push({
          type: "Feature",
          properties: {
            id: d.id || (i + 1),
            tipo: "poligono",
            nome: d.nome || "Área " + (i + 1),
            area: d.area || "",
            supervisor: d.supervisor || "",
            frequencia: d.frequencia || "",
            cor: d.cor || "#1e7b34",
            area_ha: d.areaHa ? +d.areaHa.toFixed(2) : 0,
            perimetro_m: Math.round(d.metros || 0),
            observacao: d.obs || ""
          },
          geometry: { type: "Polygon", coordinates: [anel] }
        });
      } else if (d.coords && d.coords.length >= 2) {
        features.push({
          type: "Feature",
          properties: {
            id: d.id || (i + 1),
            tipo: "linha",
            nome: d.nome || "Rota " + (i + 1),
            area: d.area || "",
            cor: d.cor || "#1e7b34",
            espessura: d.espessura || 4,
            tracejada: !!d.tracejada,
            extensao_m: Math.round(d.metros || 0),
            extensao_km: +((d.metros || 0) / 1000).toFixed(3),
            observacao: d.obs || ""
          },
          geometry: { type: "LineString", coordinates: d.coords.map(p => [p[1], p[0]]) }
        });
      }
    });
    return JSON.stringify({ type: "FeatureCollection", name: "Planejamento_Operacional_Belem", features }, null, 2);
  }

  function dxfDesenhos(itens) {
    const lista = itens || [];
    const L = [], t = (...a) => L.push(...a.map(String));
    const cam = [
      ["OS_VIAS_PRINCIPAIS", 5],
      ["OS_PASSAGENS_INTERNAS", 1],
      ["ROTAS_PLANEJADAS", 94],
      ["AREAS_SETORES_PLANEJADOS", 3],
      ["PONTOS_CRITICOS_PLANEJADOS", 30],
      ["ROTULOS_PLANEJAMENTO", 7]
    ];
    t(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009", 9, "$INSUNITS", 70, 6, 0, "ENDSEC");
    t(0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LTYPE", 70, 1, 0, "LTYPE", 2, "CONTINUOUS", 70, 0, 3, "Solid line", 72, 65, 73, 0, 40, 0, 0, "ENDTAB");
    t(0, "TABLE", 2, "LAYER", 70, cam.length);
    cam.forEach(([n, c]) => t(0, "LAYER", 2, n, 70, 0, 62, c, 6, "CONTINUOUS"));
    t(0, "ENDTAB", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");

    const pl = (c, pts, fech, aci) => {
      t(0, "POLYLINE", 8, c, 62, aci || 7, 66, 1, 70, fech ? 1 : 0);
      pts.forEach(p => {
        const [x, y] = utm22s(p[0], p[1]);
        t(0, "VERTEX", 8, c, 10, x.toFixed(3), 20, y.toFixed(3), 30, 0);
      });
      t(0, "SEQEND", 8, c);
    };
    const txt = (c, p, h, s) => {
      const [x, y] = utm22s(p[0], p[1]);
      t(0, "TEXT", 8, c, 10, x.toFixed(3), 20, y.toFixed(3), 30, 0, 40, h, 1, String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, ""));
    };

    lista.forEach(d => {
      const tp = d.tipo || "linha";
      const aci = hexParaAci(d.cor);
      if (tp === "ponto" && d.coords && d.coords[0]) {
        const [x, y] = utm22s(d.coords[0][0], d.coords[0][1]);
        t(0, "CIRCLE", 8, "PONTOS_CRITICOS_PLANEJADOS", 62, aci, 10, x.toFixed(3), 20, y.toFixed(3), 30, 0, 40, 8);
        txt("ROTULOS_PLANEJAMENTO", [d.coords[0][0] + 0.0001, d.coords[0][1] + 0.0001], 10, d.nome || "PC");
      } else if (tp === "poligono" && d.coords && d.coords.length >= 3) {
        pl("AREAS_SETORES_PLANEJADOS", d.coords, true, aci);
        const c = centroAnel([d.coords]);
        txt("ROTULOS_PLANEJAMENTO", c, 18, `${d.nome || "SETOR"}${d.areaHa ? " (" + d.areaHa.toFixed(1) + " ha)" : ""}`);
      } else if (d.coords && d.coords.length >= 2) {
        const layer = aci === 5 ? "OS_VIAS_PRINCIPAIS" : aci === 1 ? "OS_PASSAGENS_INTERNAS" : "ROTAS_PLANEJADAS";
        pl(layer, d.coords, false, aci);
        const meio = d.coords[Math.floor(d.coords.length / 2)];
        txt("ROTULOS_PLANEJAMENTO", meio, 9, `${d.nome || "ROTA"} (${Math.round(d.metros || 0)}m)`);
      }
    });
    t(0, "ENDSEC", 0, "EOF");
    return L.join("\r\n");
  }

  function excelDesenhos(itens) {
    const lista = itens || [];
    const meta = CFG.metaEquipeMDia || 1950;
    const wb = XLSX.utils.book_new();
    const linhas = lista.filter(d => (d.tipo || "linha") === "linha" && d.coords && d.coords.length >= 2);
    const polys  = lista.filter(d => d.tipo === "poligono" && d.coords && d.coords.length >= 3);
    const pontos = lista.filter(d => d.tipo === "ponto" && d.coords && d.coords[0]);

    const s1 = linhas.map((d, i) => ({
      "Ordem": i + 1,
      "Nome da Linha / Via / OS": d.nome || "Rota " + (i + 1),
      "Área Vinculada": d.area ? "A" + d.area : "Geral",
      "Extensão (m)": Math.round(d.metros || 0),
      "Extensão (km)": +((d.metros || 0) / 1000).toFixed(2),
      "Equipes-Dia Estimadas (Capina)": +((d.metros || 0) / meta).toFixed(2),
      "Qtd. de Vértices": d.coords.length,
      "Cor (Hex)": d.cor || "#1e7b34",
      "Estilo": d.tracejada ? "Tracejada" : "Contínua",
      "Início (Lat, Lng)": `${d.coords[0][0].toFixed(6)}, ${d.coords[0][1].toFixed(6)}`,
      "Fim (Lat, Lng)": `${d.coords[d.coords.length - 1][0].toFixed(6)}, ${d.coords[d.coords.length - 1][1].toFixed(6)}`,
      "Observação": d.obs || ""
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s1.length ? s1 : [{ "Nome da Linha / Via / OS": "Nenhuma linha desenhada" }]), "Rotas e Linhas");

    if (polys.length) {
      const s2 = polys.map((d, i) => ({
        "Ordem": i + 1,
        "Nome da Área / Setor": d.nome || "Setor " + (i + 1),
        "Nº Área / Setor": d.area || "",
        "Supervisor / Responsável": d.supervisor || "",
        "Frequência / Turno": d.frequencia || "",
        "Área (ha)": d.areaHa ? +d.areaHa.toFixed(2) : 0,
        "Perímetro (m)": Math.round(d.metros || 0),
        "Extensão de Ruas Internas (km)": d.kmRuasInternas ? +d.kmRuasInternas.toFixed(2) : "",
        "Cor (Hex)": d.cor || "#1e7b34",
        "Observação": d.obs || ""
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s2), "Áreas e Setores");
    }

    if (pontos.length) {
      const s3 = pontos.map((d, i) => ({
        "Ordem": i + 1,
        "Código / Identificação": d.nome || "PC_" + (i + 1),
        "Área / Setor": d.area || "",
        "Patrulha": d.patrulha || "Manual",
        "Material": d.material || "Entulho",
        "Status": d.status || "Pendente",
        "Latitude": +d.coords[0][0].toFixed(6),
        "Longitude": +d.coords[0][1].toFixed(6),
        "Observação": d.obs || ""
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s3), "Pontos Planejados");
    }

    XLSX.writeFile(wb, "planejamento_operacional_" + U.ymd(new Date()) + ".xlsx");
  }

  function exportarDesenhos(formato, itens) {
    const d = U.ymd(new Date());
    if (formato === "kml") U.baixar(`planejamento_mymaps_${d}.kml`, kmlDesenhos(itens), "application/vnd.google-earth.kml+xml");
    else if (formato === "kmz") U.baixar(`planejamento_mymaps_${d}.kmz`, zip([{ nome: "doc.kml", dados: new TextEncoder().encode(kmlDesenhos(itens)) }]));
    else if (formato === "geojson") U.baixar(`planejamento_qgis_${d}.geojson`, window.FerramentasMapa && FerramentasMapa.paraGeojson ? JSON.stringify(FerramentasMapa.paraGeojson(itens), null, 1) : geojsonDesenhos(itens), "application/geo+json");
    else if (formato === "dxf") U.baixar(`planejamento_cad_utm22s_${d}.dxf`, dxfDesenhos(itens), "application/dxf");
    else if (formato === "xlsx") excelDesenhos(itens);
  }

  function zip(arquivos) {
    const tab = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = tab[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    const partes = [], central = []; let off = 0;
    for (const a of arquivos) {
      const nm = new TextEncoder().encode(a.nome), c = crc(a.dados), n = a.dados.length;
      const loc = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(c), ...u32(n), ...u32(n), ...u16(nm.length), ...u16(0), ...nm]);
      partes.push(loc, a.dados);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(c), ...u32(n), ...u32(n), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...nm]));
      off += loc.length + n;
    }
    const tc = central.reduce((s, x) => s + x.length, 0);
    return new Blob([...partes, ...central, new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(arquivos.length), ...u16(arquivos.length), ...u32(tc), ...u32(off), ...u16(0)])], { type: "application/vnd.google-earth.kmz" });
  }

  function utm22s(lat, lon) {
    const a = 6378137, f = 1 / 298.257222101, k0 = .9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), lon0 = -51 * Math.PI / 180, phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, Cc = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lon0);
    const M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
    return [k0 * N * (A + (1 - T + Cc) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * Cc - 58 * ep2) * A ** 5 / 120) + 500000,
            k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * Cc + 4 * Cc * Cc) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * Cc - 330 * ep2) * A ** 6 / 720)) + 10000000];
  }

  // Conversão reversa SIRGAS 2000 / UTM Zona 22S (EPSG:31982) -> [lat, lon] WGS84
  function utm22sParaLatLon(x, y) {
    const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), lon0 = -51 * Math.PI / 180;
    const x1 = x - 500000, y1 = y - 10000000;
    const M = y1 / k0;
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
    const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
    const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
    const T1 = Math.tan(phi1) ** 2;
    const C1 = ep2 * Math.cos(phi1) ** 2;
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) ** 2, 1.5);
    const D = x1 / (N1 * k0);
    const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
    const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(phi1);
    return [lat * 180 / Math.PI, lon * 180 / Math.PI];
  }

  function centroAnel(rings) {
    let sx = 0, sy = 0, n = 0;
    (rings || []).forEach(r => r.forEach(p => { sx += p[0]; sy += p[1]; n++; }));
    return n ? [sx / n, sy / n] : [-1.45, -48.48];
  }

  function dxf(res) {
    const L = [], t = (...a) => L.push(...a.map(String));
    const cam = [["AREAS", 8], ["AREAS_ROTULOS", 7], ["LANCAMENTOS", 94], ["LANCAMENTOS_FORA", 30], ["LANCAMENTOS_APROX", 92], ["PONTOS_COLETADOS", 3], ["PONTOS_NAO_COLETADOS", 1], ["PONTOS_PENDENTES", 8], ["PONTOS_ROTULOS", 7], ["ROTAS", 250], ["PLANEJAMENTO_ROTAS", 5], ["PLANEJAMENTO_AREAS", 3], ["PLANEJAMENTO_PONTOS", 1], ["PLANEJAMENTO_ROTULOS", 7]];
    const enviadas = camadasEnviadas(), capina = capinaVisivel();
    enviadas.forEach(c => { const n = nomeCamadaDxf(c.nome); if (!cam.some(x => x[0] === n)) cam.push([n, hexParaAci(c.cor)]); });
    t(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009", 9, "$INSUNITS", 70, 6, 0, "ENDSEC");
    t(0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LTYPE", 70, 1, 0, "LTYPE", 2, "CONTINUOUS", 70, 0, 3, "Solid line", 72, 65, 73, 0, 40, 0, 0, "ENDTAB");
    t(0, "TABLE", 2, "LAYER", 70, cam.length); cam.forEach(([n, c]) => t(0, "LAYER", 2, n, 70, 0, 62, c, 6, "CONTINUOUS")); t(0, "ENDTAB", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");
    const pl = (c, pts, fech) => { t(0, "POLYLINE", 8, c, 66, 1, 70, fech ? 1 : 0); pts.forEach(p => { const [x, y] = utm22s(p[0], p[1]); t(0, "VERTEX", 8, c, 10, x.toFixed(3), 20, y.toFixed(3), 30, 0); }); t(0, "SEQEND", 8, c); };
    const txt = (c, p, h, s) => { const [x, y] = utm22s(p[0], p[1]); t(0, "TEXT", 8, c, 10, x.toFixed(3), 20, y.toFixed(3), 30, 0, 40, h, 1, String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")); };
    if (capina) {
    GEO.areas.forEach(a => { a.polys.forEach(p => p.forEach(r => pl("AREAS", r, true))); const A = res.porArea[a.area] || {}; const c = (window.Mapa && Mapa.centro) ? Mapa.centro(a.rings) : centroAnel(a.rings); txt("AREAS_ROTULOS", c, 120, `AREA ${a.area} - ${A.supervisor || ""} - ${U.fmtPct(A.pct || 0)}%`); });
    GEO.rotas.forEach(r => pl("ROTAS", r.coords, false));
    res.visiveis.filter(e => e.loc.ok).forEach(e => e.loc.linhas.forEach(l => pl(e.fora ? "LANCAMENTOS_FORA" : (e.loc.tipo === "trecho" ? "LANCAMENTOS" : "LANCAMENTOS_APROX"), l, false)));
    GEO.pontos.forEach(p => { const s = Calc.statusPonto(res.pontos[p.cod]), c = { coletado: "PONTOS_COLETADOS", nao: "PONTOS_NAO_COLETADOS", pendente: "PONTOS_PENDENTES" }[s], [x, y] = utm22s(p.ll[0], p.ll[1]);
      t(0, "CIRCLE", 8, c, 10, x.toFixed(3), 20, y.toFixed(3), 30, 0, 40, 12); txt("PONTOS_ROTULOS", [p.ll[0] + .00018, p.ll[1] + .00018], 14, p.cod); });
    }
    const desen = (window.FerramentasMapa && FerramentasMapa.desenhos) || U.ler("desenhos_mymaps", []);
    desen.forEach(d => {
      const tp = d.tipo || "linha";
      if (tp === "ponto" && d.coords && d.coords[0]) {
        const [x, y] = utm22s(d.coords[0][0], d.coords[0][1]);
        t(0, "CIRCLE", 8, "PLANEJAMENTO_PONTOS", 10, x.toFixed(3), 20, y.toFixed(3), 30, 0, 40, 12);
        txt("PLANEJAMENTO_ROTULOS", [d.coords[0][0] + .00018, d.coords[0][1] + .00018], 14, d.nome || "PC");
      } else if (tp === "poligono" && d.coords && d.coords.length >= 3) {
        pl("PLANEJAMENTO_AREAS", d.coords, true);
        txt("PLANEJAMENTO_ROTULOS", centroAnel([d.coords]), 20, d.nome || "AREA");
      } else if (d.coords && d.coords.length >= 2) {
        pl("PLANEJAMENTO_ROTAS", d.coords, false);
        txt("PLANEJAMENTO_ROTULOS", d.coords[Math.floor(d.coords.length / 2)], 10, `${d.nome || "ROTA"} (${Math.round(d.metros || 0)} m)`);
      }
    });
    enviadas.forEach(c => { const n = nomeCamadaDxf(c.nome);
      c.feicoes.forEach(f => {
        if (f.tipo === "ponto") { const [x, y] = utm22s(f.ll[0], f.ll[1]); t(0, "CIRCLE", 8, n, 10, x.toFixed(3), 20, y.toFixed(3), 30, 0, 40, 8); }
        else if (f.tipo === "linha") f.partes.forEach(l => pl(n, l, false));
        else f.polys.forEach(pg => pg.forEach(r => pl(n, r, true)));
      }); });
    t(0, "ENDSEC", 0, "EOF"); return L.join("\r\n");
  }

  function arquivo(tipo, res) {
    if (tipo === "kml") U.baixar(nome("kml"), kml(res), "application/vnd.google-earth.kml+xml");
    if (tipo === "kmz") U.baixar(nome("kmz"), zip([{ nome: "doc.kml", dados: new TextEncoder().encode(kml(res)) }]));
    if (tipo === "dxf") U.baixar(nome("dxf"), dxf(res), "application/dxf");
  }

  function mapearLancamentos(lista) {
    return lista.map(e => ({
      "Data": e.data ? e.data.toLocaleDateString("pt-BR") : "",
      "Serviço": e.servico,
      "Supervisor": e.supervisor,
      "Equipe": e.equipe,
      "Área": e.areaRef || "",
      "Ciclo": e.cicloCalc,
      "Bairro": e.bairro,
      "Rua": e.rua,
      "Perímetro – de": e.de,
      "Perímetro – até": e.ate,
      "Metros informados": e.m || "",
      "Medida no mapa (m)": e.loc.ok && e.loc.tipo === "trecho" ? Math.round(e.loc.metros) : "",
      "Considerado (m)": Math.round(e.metros),
      "Nº de homens": e.homens || "",
      "Fora do planejado": e.fora ? "Sim" : "Não",
      "Localização": e.loc.ok ? e.loc.tipo : "Não localizada",
      "Observação": e.obs || ""
    }));
  }

  function semanal(res, sem, rot) {
    const listaSem = sem || Calc.semanas(res);
    const fnRot = rot || (k => {
      if (k === "sem-data") return "Sem data";
      const a = new Date(k + "T00:00:00"), b = new Date(a);
      b.setDate(b.getDate() + 6);
      return a.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " a " + b.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    });
    const A = Object.values(res.porArea).sort((a, b) => a.area - b.area), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(listaSem.map(s => ({ "Semana": fnRot(s.k), "Lançamentos": s.n, "Executado (m)": Math.round(s.m), "% do planejado": +(res.totPlano ? s.m / res.totPlano * 100 : 0).toFixed(2) }))), "Resumo semanal");
    const r2 = []; listaSem.forEach(s => A.forEach(a => { const m = s.area[a.area] || 0; r2.push({ "Semana": fnRot(s.k), "Área": a.area, "Supervisor": a.supervisor, "Planejado (m)": a.plano, "Executado (m)": Math.round(m), "% da área": a.plano ? +(m / a.plano * 100).toFixed(2) : 0 }); }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r2.length ? r2 : [{ Semana: "" }]), "Por área e semana");
    const r3 = mapearLancamentos(res.visiveis);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r3.length ? r3 : [{ Data: "" }]), "Lançamentos");
    XLSX.writeFile(wb, "resumo_semanal_capina_" + U.ymd(new Date()) + ".xlsx");
  }

  function produtividade(res) {
    const p = Calc.produtividade(res), sups = Calc.produtividadeSupervisores(res), meta = CFG.metaEquipeMDia, wb = XLSX.utils.book_new();
    const s1 = sups.map((s, i) => ({
      "Ranking": i + 1,
      "Supervisor": s.supervisor,
      "Área": s.area || "",
      "Lançamentos": s.lancs,
      "Total Executado (m)": Math.round(s.m),
      "Total Executado (km)": +(s.m / 1000).toFixed(2),
      "Média por Equipe/Dia (m)": Math.round(s.mEqDia),
      "% da Meta (1.950 m/dia)": +(s.mEqDia / meta * 100).toFixed(1),
      "Produtividade (m/homem/dia)": s.mHomemDia != null ? +s.mHomemDia.toFixed(1) : ""
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s1.length ? s1 : [{ Supervisor: "" }]), "Ranking Supervisores");

    const s2 = p.map((x, i) => ({
      "Ranking": i + 1,
      "Equipe": x.equipe,
      "Supervisor": x.supervisor,
      "Área": x.area || "",
      "Dias Trabalhados": x.dias,
      "Total Executado (m)": Math.round(x.m),
      "Total Executado (km)": +(x.m / 1000).toFixed(2),
      "Média Diária (m/dia)": Math.round(x.mDia),
      "Meta Planejada (m/dia)": meta,
      "% da Meta": +(x.mDia / meta * 100).toFixed(1),
      "Produtividade (m/homem/dia)": x.mHomemDia != null ? +x.mHomemDia.toFixed(1) : ""
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s2.length ? s2 : [{ Equipe: "" }]), "Produtividade Equipes");

    const s3 = mapearLancamentos(res.visiveis);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s3.length ? s3 : [{ Data: "" }]), "Lançamentos do Período");
    XLSX.writeFile(wb, "produtividade_capina_" + U.ymd(new Date()) + ".xlsx");
  }

  function lancamentos(res, lista, sufixo = "periodo") {
    const wb = XLSX.utils.book_new();
    const s1 = mapearLancamentos(lista || res.visiveis);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s1.length ? s1 : [{ Data: "" }]), "Lançamentos");
    XLSX.writeFile(wb, `lancamentos_${sufixo}_${U.ymd(new Date())}.xlsx`);
  }

  /* ---------- Excel para Power BI: tabelas simples, uma linha por registro ---------- */
  function powerbi(base, ref) {
    const dataReferencia = ref || U.hoje();
    const res = Calc.calcular(base, { ref: dataReferencia }), situ = Calc.situacaoRuas(res), A = res.porArea, wb = XLSX.utils.book_new();
    const r2 = v => v == null || v === "" ? null : Math.round(v * 100) / 100, km = m => r2(m / 1000), ds = d => d || null;
    const serial = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 864e5;
    const aba = (linhas, nomeAba) => {
      const datas = new Set();
      const ls = linhas.map(l => { const o = {}; Object.entries(l).forEach(([k, v]) => { if (v instanceof Date) { datas.add(k); o[k] = serial(v); } else o[k] = v; }); return o; });
      const ws = XLSX.utils.json_to_sheet(ls.length ? ls : [{}]), cab = Object.keys(ls[0] || {});
      cab.forEach((k, c) => { if (!datas.has(k)) return; for (let r = 1; r <= ls.length; r++) { const cel = ws[XLSX.utils.encode_cell({ r, c })]; if (cel && cel.t === "n") cel.z = "dd/mm/yyyy"; } });
      XLSX.utils.book_append_sheet(wb, ws, nomeAba);
    };
    aba(res.todos.map(e => ({ "Data": ds(e.data), "Semana (início)": e.data ? U.inicioSemana(e.data) : null, "Serviço": e.servico, "Capina": e.capina ? "Sim" : "Não",
      "Supervisor": e.supervisor, "Equipe": e.equipe, "Lançado por": e.lancado, "Área": e.areaRef, "Área informada": e.area, "Área no mapa": e.areaMapa, "Área do supervisor": e.areaSup,
      "Fora do planejado": e.fora ? "Sim" : "Não", "Ciclo": e.cicloCalc, "Bairro": e.bairro, "Rua": e.rua, "Rua na base": e.loc.ruaBase || "", "Perímetro – de": e.de, "Perímetro – até": e.ate,
      "Metros informados": r2(e.m), "Medida no mapa (m)": e.loc.ok && e.loc.tipo === "trecho" ? Math.round(e.loc.metros) : null, "Metros considerados": Math.round(e.metros),
      "Localização": e.loc.ok ? txtLoc(e.loc.tipo) : "Rua não encontrada", "Nº de homens": e.homens, "Observação": e.obs })), "Lancamentos");
    aba(Object.values(A).sort((a, b) => a.area - b.area).map(a => { const s = situ.resumo[a.area] || {}, c = a.ciclo, pts = DADOS_GEO.pontos.filter(p => p.area === a.area), st = pts.map(p => Calc.statusPonto(res.pontos[p.cod]));
      return { "Área": a.area, "Supervisor": a.supervisor, "Sds": a.sds, "Equipes": a.equipes, "Extensão planejada (km)": a.km, "Recorrência (dias)": a.recorrencia,
        "Ciclo atual": c ? c.ciclo : "", "Status do ciclo": c ? c.status : "", "Início do ciclo": c ? c.inicio : null, "Fim do ciclo": c ? ds(c.fim) : null, "Dias no ciclo": a.diasCiclo,
        "Executado no ciclo (km)": km(Math.min(a.feito, a.plano)), "Falta (km)": km(Math.max(a.plano - a.feito, 0)), "% do ciclo": r2(a.pct),
        "Em dia (km)": km(s.emdia || 0), "Perto de vencer (km)": km(s.vencendo || 0), "Vencido (km)": km(s.vencido || 0), "Sem recorrência (km)": km(s.semrec || 0), "Sem registro (km)": km(s.nunca || 0),
        "Pontos": pts.length, "Pontos coletados": st.filter(x => x === "coletado").length, "Pontos não coletados": st.filter(x => x === "nao").length }; }), "Areas");
    const cic = []; Object.values(A).sort((a, b) => a.area - b.area).forEach(a => a.ciclos.forEach(c => cic.push({ "Área": a.area, "Supervisor": a.supervisor, "Ciclo": c.ciclo,
      "Início": c.inicio, "Fim": ds(c.fim), "Status": c.status, "Dias": c.dias, "Recorrência (dias)": a.recorrencia, "Lançamentos de capina": c.n,
      "Executado (km)": km(Math.min(c.feito, a.plano)), "Planejado (km)": a.km, "% do ciclo": r2(c.pct) })));
    aba(cic, "Ciclos");
    const ruas = new Map();
    situ.segs.forEach(g => { const k = g.area + "|" + LOC.chaveDoSeg(g.si); if (!ruas.has(k)) ruas.set(k, { area: g.area, nome: LOC.nomeDe(g.si), total: 0, feito: 0, ult: null });
      const r = ruas.get(k), m = LOC.comprSeg(g.si); r.total += m; if (g.u) { r.feito += m; if (g.u.d && (!r.ult || g.u.d > r.ult)) r.ult = g.u.d; } });
    aba([...ruas.values()].sort((a, b) => a.area - b.area || a.nome.localeCompare(b.nome)).map(r => { const d = r.ult ? U.dias(r.ult, dataReferencia) : null, rec = (A[r.area] || {}).recorrencia;
      const s = !r.feito ? "nunca" : d == null ? "semrec" : !rec ? "semrec" : d <= rec / 2 ? "emdia" : d <= rec ? "vencendo" : "vencido";
      return { "Área": r.area, "Rua": r.nome, "Extensão na área (m)": Math.round(r.total), "Capinado (m)": Math.round(r.feito), "% capinado": r2(r.total ? r.feito / r.total * 100 : 0),
        "Última capina": r.ult, "Dias desde a capina": d, "Situação": txtSitu(s) }; }), "Ruas");
    aba(DADOS_GEO.pontos.map(p => { const r = res.pontos[p.cod]; return { "Ponto": p.cod, "Identificação": p.id, "Área": p.area, "Ordem": p.ordem, "Bairro": p.bairro, "Patrulha": p.patrulha,
      "Material": p.material, "Status": txtStatus(Calc.statusPonto(r)), "Data": r ? ds(r.data) : null, "Observação": r ? r.obs : "", "Latitude": p.ll[0], "Longitude": p.ll[1] }; }), "Pontos");
    XLSX.writeFile(wb, "acompanhamento_capina_powerbi_" + U.ymd(dataReferencia) + ".xlsx");
  }

  return { arquivo, semanal, produtividade, lancamentos, powerbi, powerBI: powerbi, exportarDesenhos, kmlDesenhos, geojsonDesenhos, dxfDesenhos, excelDesenhos, kml, dxf, utm22s, utm22sParaLatLon };
})();
if (typeof window !== "undefined") window.Exportar = Exportar;
