#!/usr/bin/env bash
# .shp -> .pmtiles usando ogr2ogr (conversão pra GeoJSON) + tippecanoe.
# Requer: ogr2ogr (GDAL) e tippecanoe no PATH. Rodar em Linux/WSL (ou via
# o workflow do GitHub Actions em .github/workflows/pipeline.yml) — não
# roda nativamente em Windows.
#
# Uso: pipeline/shp_para_pmtiles.sh <caminho/para/arquivo.shp> [pasta_saida]

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <caminho/para/arquivo.shp> [pasta_saida]" >&2
  exit 1
fi

IN_SHP="$1"
OUT_DIR="${2:-pipeline/output}"
NOME="$(basename "${IN_SHP%.shp}")"

mkdir -p "$OUT_DIR"

echo "==> Convertendo $IN_SHP para GeoJSON..."
ogr2ogr -f GeoJSON -t_srs EPSG:4326 "$OUT_DIR/$NOME.geojson" "$IN_SHP"

echo "==> Gerando .pmtiles com tippecanoe..."
tippecanoe \
  --output="$OUT_DIR/$NOME.pmtiles" \
  --layer=talhoes \
  --maximum-zoom=g \
  --drop-densest-as-needed \
  --force \
  "$OUT_DIR/$NOME.geojson"

echo "==> Gerado: $OUT_DIR/$NOME.pmtiles"
