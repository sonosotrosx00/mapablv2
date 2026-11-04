# Mapa do código — site novo (exemplo)

Site estático (sem build). `index.html` = mapa; `dashboard.html` = painel gerencial.
Ao mudar um .js ou o .css, trocar o número `?v=` nos dois .html (força o navegador a baixar a versão nova).

## Arquivos novos / alterados (04/11/2026)

| Arquivo | O que faz |
|---|---|
| `js/config.js` | `CFG.recursos` liga/desliga cada ferramenta nova (busca, régua, trajeto, camadas, planejamento, sincronizarQgis, formulario). `CFG.formulario` = link do Google Forms. `CFG.rotas` = servidores de rota (OpenStreetMap). |
| `js/importar_geo.js` | `ImportarGeo`: lê shapefile (.zip), KML, KMZ e GeoJSON no navegador. Converte SIRGAS 2000 / UTM (EPSG:31982 e outras zonas, pelo .prj ou pelo `crs` do GeoJSON) para latitude/longitude. |
| `js/ferramentas_mapa.js` | Street View + **Planejar / Desenhar Rotas**: linhas, áreas/setores e pontos (pontos críticos e outros), edição de vértices, exportar KML/KMZ/DXF/GeoJSON/Excel, trazer arquivo para editar. Bloco **Acompanhar no QGIS**: liga o planejamento a um arquivo `.geojson` (grava a cada mudança e lê o que o QGIS salvar, a cada 2,5 s). O GeoJSON sai em **EPSG:31982**. |
| `js/ferramentas_extra.js` | Busca (rua da base, CEP via ViaCEP, endereço via OpenStreetMap, coordenada em graus, graus/min/seg ou UTM 22S), **Régua** (distância ou extensão da rua clicada), **Trajeto** (carro e a pé, GPS, link Google Maps), **Camadas** (subir arquivos, ligar/desligar, cor, nomes, mapa do zero). Camadas ficam no IndexedDB do navegador. |
| `js/localizador.js` | Novas funções: `pertoDe`, `ruaConectada`, `sugerirRuas`, `segsDaChave`, `nomesTodos`. |
| `js/mapa.js` | Linhas lançadas têm uma faixa invisível de 16 px por cima para o clique (tracejadas incluídas). |
| `js/exportar.js` | KML/KMZ/DXF de "Exportar dados atuais" incluem planejamento e camadas enviadas ligadas; com as camadas da capina escondidas, só exporta o resto. DXF em SIRGAS 2000 / UTM 22S. |
| `js/dashboard.js` | Gráficos com dica ao passar o mouse (`data-tip`) e clique (semana → filtra período; serviço/supervisor → filtra; pontos/área → abre no mapa). Aba Planilha e Formulário: planilha de teste, Google Forms embutido e "Lançar pelo site". |
| `js/editor_planilha.js` | `adicionarLancamento(obj)` usado pelo formulário do site. |
| `data/planilha_local.js` | Corrigidos 3 lançamentos de exemplo com supervisores que não existem na aba Areas (agora Denis, Renan e João). |

## Alterações de 04/11/2026 (tarde) — versão `?v=1104e`
| Arquivo | O que mudou |
|---|---|
| `js/config.js` | `fonteInicial: "google"` (o site abre lendo a planilha Google). `envioForms` = endereço e códigos das perguntas do Forms para o "Lançar pelo site". `formularioPontos` / `formularioPontosCampoPonto` (Forms de pontos, opcional) e `planilhaAbaPontos`. `abas.pontos` agora soma todas as abas que existirem (inclui "Respostas Pontos" e "Respostas ao formulário 2"). |
| `js/dados.js` | Pontos lidos de todas as abas de pontos; vale o registro com a data mais recente. |
| `js/dashboard.js` | "Lançar pelo site" envia para o Google Forms (antes só gravava no navegador) e confere se a linha apareceu na planilha. A aba abre no Formulário Google. |
| `js/app.js`, `js/dashboard.js`, `js/editor_planilha.js` | Fonte guardada em `capina_fonte_site` (a chave antiga `capina_fonte_novo` deixava quem já abriu o site preso na planilha de exemplo). |
| `index.html`, `js/painel.js`, `js/app.js` | Cartões "Fora do planejado", "Trecho aproximado" e "Rua não encontrada". Botão "Registrar coleta" no ponto crítico. Título sem "(Protótipo Simplificado)". |
| `css/estilo.css` | Resultados da busca por cima da caixa Visão do Mapa (`.leaflet-control.busca-mapa { z-index: 1000 }`). |

### Versão `?v=1104h`
| Arquivo | O que mudou |
|---|---|
| `js/calculos.js` (+ `QGIS_Acompanhamento/calculo.py`) | Fora do planejado também quando o trecho no mapa não toca a área informada e fica na área de outro supervisor (`areaDivergente`). Ruas de divisa não contam. |
| `js/painel.js` | Lançamento aberto avisa área informada diferente da rua e metros muito diferentes do trecho no mapa. |
| `js/dados.js` | Cada lançamento guarda `aba`, `linha` (linha na planilha) e `carimbo`. |
| `js/app.js` | `index.html#lanc=<aba>|<linha>` abre o lançamento no mapa. |
| `js/dashboard.js`, `dashboard.html` | Aba Planilha e Formulário: **Conferir lançamentos** (todos, com filtros Fora do planejado / Trecho aproximado / Rua não encontrada / Conferir, botões Ver no mapa e Editar na linha da planilha) e **Planilha Google** embutida. |
| `js/config.js` | `abasGid` = código de cada aba da planilha (usado no Editar). |
| `js/ferramentas_extra.js` | Busca procura também no OpenStreetMap quando o nome digitado não é exatamente uma rua da base, e desenha a rua achada. |

### Versão `?v=1104i`
- `js/app.js` e `js/dashboard.js`: com a fonte Google Sheets, mapa e dashboard leem a planilha de novo a cada 2 minutos (com a aba aberta) e logo depois de um "Lançar pelo site" feito em outra aba (chave `capina_ultimo_envio`).
- "Lançar pelo site" mostra a linha da planilha e o link "Ver no mapa" do lançamento enviado.

### Versão `?v=1104j`
- `js/painel.js`: "Lançamentos na área" também lista o que foi pintado na área mas conta em outra (área informada diferente), com "conta na Área N".

Se uma pergunta do Forms for apagada e criada de novo, o código dela muda: atualizar `envioForms.campos` (o código aparece no link "Obter link pré-preenchido" do Forms, `entry.NNNN`).

## Linha contínua × tracejada (localizador)
- Contínua: Rua + "Perímetro - de" + "Perímetro - até", e o mapa acha os dois cruzamentos.
- Tracejada "aproximado": só um cruzamento achado; desenha a extensão informada a partir dele.
- Tracejada "rua": nenhum cruzamento achado; mostra a rua inteira naquela área.
