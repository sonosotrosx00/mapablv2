/* Configuração do sistema. Alterar aqui não exige mexer no resto do código. */
window.CFG = {
  planilha: "https://docs.google.com/spreadsheets/d/11Nv8BAe6Nrzqt4yr305NSoYya0MTwjTDdBtknYHRLpE/edit",

  // nomes das abas (Google Sheets ou Excel); a primeira que existir é usada
  abas: {
    areas:   ["Areas"],
    capina:  ["Capina"],
    pontos:  ["Pontos", "Aba Pontos"],
    ciclos:  ["Ciclos"],
    lancamentos: ["Executado", "Respostas ao formulário 1"]   // todas as que existirem são somadas
  },

  // metros considerados em cada lançamento:
  // "informado" = usa os metros do lançamento; se vazio, a medida do trecho no mapa
  // "mapa"      = usa a medida do trecho no mapa; se não localizado, os metros informados
  fonteMetros: "informado",

  // produtividade planejada por equipe (Relatório de Capinação, aba Indicadores)
  metaEquipeMDia: 1950,

  // serviço que entra no % de capina das áreas
  servicoCapina: /capin/i,
  botaoPowerBI: true,

  // Liga (true) ou desliga (false) cada recurso novo sem mexer no resto do código
  recursos: {
    busca: true,            // caixa "Buscar rua, CEP ou coordenada" no mapa
    regua: true,            // botão Régua (medir distância e extensão da rua)
    trajeto: true,          // botão Trajeto (rota de um ponto a outro, com tempo e GPS)
    camadas: true,          // botão Camadas (subir shapefile, KML, KMZ, GeoJSON do QGIS / My Maps)
    planejamento: true,     // botão Planejar / Desenhar Rotas (linhas, áreas e pontos)
    sincronizarQgis: true,  // ligar o planejamento a um arquivo .geojson aberto no QGIS
    formulario: true        // aba Formulário no Dashboard
  },
  formulario: "https://docs.google.com/forms/d/18gb_m-eWLNxLP9u4wFP80hbQaqXewOnSMP0EqsBEiTw/viewform",
  // servidores públicos de rota (OpenStreetMap). Carro e a pé.
  rotas: { carro: "https://routing.openstreetmap.de/routed-car/route/v1/driving/", pe: "https://routing.openstreetmap.de/routed-foot/route/v1/foot/" },
  servicos: ["Capinação e raspagem", "Roçagem", "Pintura", "Mutirão", "Varrição", "Limpeza geral", "Caiação", "Retirada de produção", "Limpeza da praia", "Programação SIPAT", "Outro"],

  // tabela padrão das áreas (já com recorrência padrão preenchida para funcionamento offline/exemplo)
  areasPadrao: [
    { area: 1,  supervisor: "Paulo",     sds: "8",     km: 132.62, equipes: 2, recorrencia: 28 },
    { area: 2,  supervisor: "Nailson",   sds: "13+14", km: 63.01,  equipes: 3, recorrencia: 21 },
    { area: 3,  supervisor: "Giancarlo", sds: "10",    km: 236.38, equipes: 4, recorrencia: 35 },
    { area: 4,  supervisor: "Bianca",    sds: "9",     km: 139.77, equipes: 3, recorrencia: 42 },
    { area: 5,  supervisor: "Plycian",   sds: "6",     km: 209.52, equipes: 3, recorrencia: 28 },
    { area: 6,  supervisor: "Juliana",   sds: "11",    km: 219.79, equipes: 4, recorrencia: 35 },
    { area: 7,  supervisor: "Denis",     sds: "4+7",   km: 275.97, equipes: 7, recorrencia: 21 },
    { area: 8,  supervisor: "Renan",     sds: "1+5",   km: 172.65, equipes: 4, recorrencia: 28 },
    { area: 9,  supervisor: "João",      sds: "3+12",  km: 170.59, equipes: 2, recorrencia: 42 },
    { area: 10, supervisor: "Rafael",    sds: "2",     km: 161.43, equipes: 4, recorrencia: 35 }
  ],

  // dados operacionais completos do ESTUDO_PONTOS_CRITICOS_CENARIO.xlsx (aba CENARIO OPERACIONAL)
  estudoOperacional: {
    2:  { pontos: 11, manual: 9,  mecanizada: 2,  kmGaragem: 20.99, kmRoteiro: 12.24, kmAterro: 24.33, kmTotal: 57.56, pctLogistico: 78.7, pesoDia: 11.25, viagens: 4,  cb: 2, minRota: 80.0,  minColeta: 210, minDescarga: 80,  horasTotal: 6.17 },
    3:  { pontos: 19, manual: 10, mecanizada: 9,  kmGaragem: 15.86, kmRoteiro: 21.25, kmAterro: 18.11, kmTotal: 55.22, pctLogistico: 61.5, pesoDia: 24.23, viagens: 8,  cb: 4, minRota: 83.7,  minColeta: 335, minDescarga: 160, horasTotal: 9.65 },
    4:  { pontos: 5,  manual: 1,  mecanizada: 4,  kmGaragem: 14.91, kmRoteiro: 6.24,  kmAterro: 17.12, kmTotal: 38.27, pctLogistico: 83.7, pesoDia: 7.79,  viagens: 3,  cb: 2, minRota: 53.4,  minColeta: 80,  minDescarga: 60,  horasTotal: 3.22 },
    5:  { pontos: 12, manual: 6,  mecanizada: 6,  kmGaragem: 8.67,  kmRoteiro: 18.45, kmAterro: 10.03, kmTotal: 37.16, pctLogistico: 50.3, pesoDia: 15.58, viagens: 6,  cb: 3, minRota: 52.1,  minColeta: 210, minDescarga: 120, horasTotal: 6.37 },
    6:  { pontos: 18, manual: 14, mecanizada: 4,  kmGaragem: 7.11,  kmRoteiro: 23.74, kmAterro: 9.26,  kmTotal: 40.11, pctLogistico: 40.8, pesoDia: 19.04, viagens: 7,  cb: 4, minRota: 66.8,  minColeta: 340, minDescarga: 140, horasTotal: 9.11 },
    7:  { pontos: 39, manual: 34, mecanizada: 5,  kmGaragem: 10.44, kmRoteiro: 36.13, kmAterro: 15.35, kmTotal: 61.92, pctLogistico: 41.7, pesoDia: 38.07, viagens: 13, cb: 7, minRota: 112.7, minColeta: 755, minDescarga: 260, horasTotal: 18.80 },
    8:  { pontos: 32, manual: 21, mecanizada: 11, kmGaragem: 14.07, kmRoteiro: 22.47, kmAterro: 17.71, kmTotal: 54.24, pctLogistico: 58.6, pesoDia: 37.21, viagens: 13, cb: 7, minRota: 94.9,  minColeta: 585, minDescarga: 260, horasTotal: 15.67 },
    9:  { pontos: 13, manual: 9,  mecanizada: 4,  kmGaragem: 9.69,  kmRoteiro: 15.89, kmAterro: 13.41, kmTotal: 38.99, pctLogistico: 59.2, pesoDia: 14.71, viagens: 5,  cb: 3, minRota: 63.6,  minColeta: 240, minDescarga: 100, horasTotal: 6.73 },
    10: { pontos: 31, manual: 30, mecanizada: 1,  kmGaragem: 11.05, kmRoteiro: 20.71, kmAterro: 15.98, kmTotal: 47.75, pctLogistico: 56.6, pesoDia: 27.69, viagens: 9,  cb: 5, minRota: 83.3,  minColeta: 615, minDescarga: 180, horasTotal: 14.64 }
  },

  cores: {
    areaMyMaps:  {1:"#B2EBF2",2:"#FFEA00",3:"#CE93D8",4:"#87CEAC",5:"#FBC02D",6:"#9FA8DA",7:"#AFB42B",8:"#0288D1",9:"#FFD600",10:"#EDA29B"},
    opacMyMaps:  {1:.56,2:.57,3:.61,4:.64,5:.81,6:.63,7:.72,8:.62,9:.56,10:.54},
    pontoMyMaps: {2:"#9C27B0",3:"#C2185B",4:"#0F9D58",5:"#FFEA00",6:"#FF5252",7:"#3949AB",8:"#0288D1",9:"#757575",10:"#817717"},
    rotaMyMaps:  {2:"#01579B",3:"#9C27B0",4:"#097138",5:"#F9A825",6:"#880E4F",7:"#4E342E",8:"#9C27B0",9:"#0288D1",10:"#E65100"},
    faixas: [ // % do ciclo
      { min: 100,  cor: "#1b5e20", txt: "100%" },
      { min: 75,   cor: "#43a047", txt: "75 a 99%" },
      { min: 50,   cor: "#81c784", txt: "50 a 74%" },
      { min: 25,   cor: "#c5e1a5", txt: "25 a 49%" },
      { min: 0.01, cor: "#eef5d6", txt: "1 a 24%" },
      { min: 0,    cor: "#ffffff", txt: "0%" }
    ],
    status: { coletado: "#1e7b34", nao: "#c0392b", pendente: "#7b8794" },
    exec:   { dentro: "#0b5d26", fora: "#e8590c" },
    situ:   { emdia: "#1b7f3b", vencendo: "#f2b705", vencido: "#d63c2f", semrec: "#6d5bd0", nunca: "#9aa0a6" }
  }
};

