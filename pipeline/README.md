# Pipeline — .shp → .pmtiles

Converte um shapefile (geometria + atributos de talhão) num único `.pmtiles`
que o frontend consegue baixar e renderizar 100% offline.

## Por que não roda direto no Windows

`tippecanoe` não compila nativamente no Windows (depende de headers POSIX).
Este pipeline roda no [GitHub Actions](../.github/workflows/pipeline.yml),
num runner Ubuntu, a cada push em `pipeline/**`. O `.pmtiles` gerado fica
disponível como artefato da run (aba Actions do repositório).

Se quiser rodar localmente, precisa de WSL2 ou Docker com Linux — não é
requisito pra este MVP.

## Como funciona

1. `fixtures/gerar_shp_sintetico.py` — gera um shapefile **fictício** (3
   talhões inventados, com `nome`, `area_ha`, `variedade`) só pra validar o
   pipeline. Nenhum dado real de fazenda entra no repositório (ver
   `.gitignore` — `*.shp`, `*.pmtiles`, `*.geojson` nunca são versionados).
2. `shp_para_pmtiles.sh <arquivo.shp> [pasta_saida]` — roda `ogr2ogr` (shp →
   GeoJSON) e depois `tippecanoe` (GeoJSON → `.pmtiles`).

## Uso em produção

Quando o analista GIS exportar um `.shp` real do ArcGIS Pro, o mesmo
`shp_para_pmtiles.sh` roda sobre esse arquivo (fora do CI, num servidor ou
localmente em Linux/WSL) e o `.pmtiles` resultante é enviado pro backend
(upload manual na v1 — painel de upload fica pra Fase 3, ver
`docs/ROADMAP.md`).
