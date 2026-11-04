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

## Linha contínua × tracejada (localizador)
- Contínua: Rua + "Perímetro - de" + "Perímetro - até", e o mapa acha os dois cruzamentos.
- Tracejada "aproximado": só um cruzamento achado; desenha a extensão informada a partir dele.
- Tracejada "rua": nenhum cruzamento achado; mostra a rua inteira naquela área.
