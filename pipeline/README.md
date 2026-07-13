# Pipeline — .shp → .pmtiles

Converte um shapefile (geometria + atributos de talhão) num único `.pmtiles`
que o frontend consegue baixar e renderizar 100% offline.

## Por que não roda direto no Windows

`tippecanoe` não compila nativamente no Windows (depende de headers POSIX).
Pra dado **sintético** (fixture de teste), este pipeline roda no
[GitHub Actions](../.github/workflows/pipeline.yml), num runner Ubuntu, a
cada push em `pipeline/**` — o `.pmtiles` gerado fica disponível como
artefato da run (aba Actions do repositório). Pra dado **real**, nunca via
GitHub (repositório é público) — localmente, via `tippecanoe`/`ogr2ogr`
compilados com Cygwin (ver `CLAUDE.md`, seção Stack), o que também é o que
o painel de admin usa por trás do upload de `.zip` (seção abaixo).

## Como funciona

1. `fixtures/gerar_shp_sintetico.py` — gera um shapefile **fictício** (3
   talhões inventados, com `nome`, `area_ha`, `variedade`) só pra validar o
   pipeline. Nenhum dado real de fazenda entra no repositório (ver
   `.gitignore` — `*.shp`, `*.pmtiles`, `*.geojson` nunca são versionados).
2. `shp_para_pmtiles.sh <arquivo.shp> [pasta_saida]` — roda `ogr2ogr` (shp →
   GeoJSON) e depois `tippecanoe` (GeoJSON → `.pmtiles`).

## Uso em produção

Duas formas de publicar uma camada (2026-07-10):

1. **Upload de `.zip` direto no painel** (Gerenciar camadas → "+ Nova
   camada"): o admin zipa o `.shp` + `.dbf` + `.shx` (+ `.prj`) exportado
   do ArcGIS Pro e sobe pelo navegador — o backend roda exatamente estes
   dois comandos (`ogr2ogr` + `tippecanoe`, ver `routes/admin.js`,
   `converterShapefileParaPmtiles`) e publica sozinho. **Cobre só
   geometria** — sem rótulo/número no mapa (ver `pipeline/rotulos/README.md`,
   isso continua manual).
2. **Rodar `shp_para_pmtiles.sh` manualmente** e subir o `.pmtiles`
   resultante — ainda funciona igual, útil quando já se tem o rótulo
   gerado (join via `tile-join`, ver `pipeline/rotulos/README.md`) ou
   pra rodar fora desta máquina (o binário `tippecanoe` do painel só
   funciona nesta máquina Windows via Cygwin, ver `backend/.env.example`
   — `OGR2OGR_PATH`/`TIPPECANOE_PATH`/`CYGWIN_BIN_DIR`).
