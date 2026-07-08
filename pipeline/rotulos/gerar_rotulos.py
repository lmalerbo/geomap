"""
Gera 1 ponto de rótulo por talhão (mesmo quando a feição tem várias
partes/polígonos desconexos): pega a maior parte (por área) e calcula
o "pole of inaccessibility" (polylabel) dela, em vez de um centroide
simples — fica visualmente centralizado mesmo em polígonos côncavos.
"""

import json
import os
import sys
import shapefile
from pyproj import Transformer
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from polylabel import polylabel

ENTRADA = sys.argv[1]
SAIDA_ROTULOS = sys.argv[2]

transformer = Transformer.from_crs("EPSG:31983", "EPSG:4326", always_xy=True)


def reprojetar(ponto_utm):
    lon, lat = transformer.transform(ponto_utm[0], ponto_utm[1])
    return [round(lon, 7), round(lat, 7)]


def maior_parte(geom):
    if geom.geom_type == "Polygon":
        return geom
    return max(geom.geoms, key=lambda g: g.area)


def main():
    sf = shapefile.Reader(ENTRADA, encoding="latin1")
    campos = [f[0] for f in sf.fields[1:]]
    idx_secao = campos.index("SECAO")
    idx_talhao = campos.index("TALHAO")

    rotulos = []
    total_multiparte = 0

    for i, sr in enumerate(sf.shapeRecords()):
        secao = sr.record[idx_secao]
        talhao = sr.record[idx_talhao]
        geom = shape(sr.shape.__geo_interface__)
        if geom.is_empty:
            continue
        if geom.geom_type == "MultiPolygon" and len(geom.geoms) > 1:
            total_multiparte += 1

        parte = maior_parte(geom)
        ponto = polylabel(parte, precisao=1.0)
        ponto_wgs = reprojetar((ponto.x, ponto.y))

        rotulos.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": ponto_wgs},
                "properties": {"rotulo": str(talhao), "secao": secao, "talhao": talhao},
            }
        )
        if (i + 1) % 500 == 0:
            print(f"  processados: {i + 1}", file=sys.stderr)

    with open(SAIDA_ROTULOS, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": rotulos}, f)

    print(f"Rótulos gerados: {len(rotulos)}")
    print(f"Talhões multi-parte: {total_multiparte}")


if __name__ == "__main__":
    main()
