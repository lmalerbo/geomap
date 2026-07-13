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
# maximum-zoom FIXO (não "g"/guess): o "guess" do tippecanoe escolhe o
# maxzoom com base no espaçamento entre features pra deixá-las
# visualmente distinguíveis — pra um dado pouco denso (poucos pontos bem
# espaçados, ex: sedes de unidade), ele escolhe um maxzoom absurdamente
# baixo (chegou a 0 num teste real), o que quantiza as coordenadas num
# grid gigante (~9km no zoom 0) e faz a feição "pular" pra longe da
# posição real — não é um bug de exibição, o dado gravado no .pmtiles já
# fica errado. 16 preserva precisão de poucos metros pra qualquer
# densidade de feição (ponto/linha/polígono).
tippecanoe \
  --output="$OUT_DIR/$NOME.pmtiles" \
  --layer=talhoes \
  --maximum-zoom=16 \
  --drop-densest-as-needed \
  --force \
  "$OUT_DIR/$NOME.geojson"

echo "==> Gerado: $OUT_DIR/$NOME.pmtiles"
