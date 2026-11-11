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

### Versão `?v=1111c` (11/11/2026) — Consulta por rua (reclamação)
| Arquivo | O que faz |
|---|---|
| `js/consulta_rua.js` (novo) | `ConsultaRua.render(chave, area)`: para a rua da base, por área, mostra última capina, dias, recorrência, "próxima capina até" (última capina + recorrência do trecho mais antigo), situação por trecho (barra), ciclo da área e se a rua já foi lançada nele, e os lançamentos da rua. Desenha a rua no mapa (pane `consultaRua`) com a cor de cada trecho. Botões Copiar link, Street View, Centralizar. |
| `js/app.js` | `App.abrirRua(chave, area)`; link `index.html#rua=<nome da rua>&area_rua=<n>`; botão "Consultar rua (reclamação)" leva à busca. |
| `js/ferramentas_extra.js` | Escolher uma rua da base na busca abre a consulta da rua. |
| `js/painel.js` | Tabela "Ruas" da área: clicar na linha abre a consulta. Lançamento aberto: botão "Consultar esta rua". |
| `css/estilo.css` | Estilos `.cr-*`; `#mapa { position: relative }` (controles do mapa ficavam por cima do painel quando a janela abria estreita e depois alargava). |

A situação vem de `Calc.situacaoRuas` (todos os lançamentos de capina até a data de referência, não depende do período escolhido).

### Versão `?v=1111d` — Reclamações
| Arquivo | O que faz |
|---|---|
| `js/reclamacoes.js` (novo) | Lê a aba **Reclamações** (Forms + colunas Status, Resposta, Data da resposta preenchidas pelo CCO). Status: vazio = Aberta; "andamento/programada/encaminhada" = Em andamento; "atendida/resolvida/concluída" = Atendida; "improcedente". Localiza a rua (com o ponto de referência como cruzamento), marca no mapa (círculo "!" só para abertas/em andamento), lista no painel com filtros e mostra a análise: última capina antes da reclamação (dias e se estava na recorrência) e primeira capina depois. |
| `js/dados.js` | `base.reclamacoes` (só usa a aba se tiver Rua e Origem ou Descrição). |
| `js/config.js` | `abas.reclamacoes`, `formularioReclamacoes`, `formularioReclamacoesCampoRua`. |
| `js/app.js`, `index.html` | Cartão "Reclamações abertas", caixa "Reclamações abertas" no mapa, tela `reclamacoes`. |
| `js/consulta_rua.js` | Bloco "Reclamações nesta rua" e botão "Registrar reclamação nesta rua" (quando o Forms estiver configurado). |

Forms "Reclamação de Capina" ligado em `?v=1111e`: https://docs.google.com/forms/d/1ueoW1_3jxtNcVmOvX6PNyQRi9ko08-X8OOCoJYyOlSc/viewform (pergunta Rua = `entry.1851154379`). Respostas na aba **Reclamações** da planilha, com Status / Resposta / Data da resposta à direita.

`?v=1111f`: o botão "Consultar rua (reclamação)" abre `ConsultaRua.telaBusca()` (campo de busca no painel + ruas com reclamação aberta). Antes ele só colocava o cursor na busca do mapa, sem efeito visível.

### Versão `?v=1111g` — celular mais leve
- `js/mapa.js`: em tela ≤ 800 px ou de toque (`L_.leve`), áreas, ruas lançadas e destaque são desenhados em **canvas** (`preferCanvas`), sem animação dos marcadores, mapa de fundo só carrega depois do gesto de zoom (`updateWhenZooming: false`, `keepBuffer: 1`) e polígonos com `smoothFactor 1.5`. No computador continua SVG, como antes.
- `js/mapa.js`: os 180 marcadores só trocam de ícone quando algo muda (situação, seleção, modo ou passar do zoom 14); antes eram recriados a cada zoom.
- `js/app.js`: a releitura automática da planilha (a cada 2 min) não refaz o mapa se a planilha veio igual.
- `css/estilo.css`: no celular, marcadores sem sombra `drop-shadow` (filtro pesado no zoom) e rótulos das áreas com sombra mais leve.

O dashboard não carrega `reclamacoes.js` (Dados ignora a aba quando o módulo não existe).

Se uma pergunta do Forms for apagada e criada de novo, o código dela muda: atualizar `envioForms.campos` (o código aparece no link "Obter link pré-preenchido" do Forms, `entry.NNNN`).

## Linha contínua × tracejada (localizador)
- Contínua: Rua + "Perímetro - de" + "Perímetro - até", e o mapa acha os dois cruzamentos.
- Tracejada "aproximado": só um cruzamento achado; desenha a extensão informada a partir dele.
- Tracejada "rua": nenhum cruzamento achado; mostra a rua inteira naquela área.
