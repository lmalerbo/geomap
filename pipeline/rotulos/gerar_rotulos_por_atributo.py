"""
Igual a gerar_rotulos.py, mas agrupando por um campo de atributo
(ex: DESC_SECAO em Limites) em vez de por feição — o mesmo nome de
fazenda pode aparecer em VÁRIOS registros/seções diferentes.
"""

import json
import os
import sys
from collections import defaultdict
import shapefile
from pyproj import Transformer
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from polylabel import polylabel

ENTRADA = sys.argv[1]
CAMPO_AGRUPAMENTO = sys.argv[2]
SAIDA_ROTULOS = sys.argv[3]

transformer = Transformer.from_crs("EPSG:31983", "EPSG:4326", always_xy=True)


def reprojetar(ponto_utm):
    lon, lat = transformer.transform(ponto_utm[0], ponto_utm[1])
    return [round(lon, 7), round(lat, 7)]


def partes(geom):
    if geom.geom_type == "Polygon":
        return [geom]
    return list(geom.geoms)


def main():
    sf = shapefile.Reader(ENTRADA, encoding="latin1")
    campos = [f[0] for f in sf.fields[1:]]
    idx_campo = campos.index(CAMPO_AGRUPAMENTO)

    partes_por_grupo = defaultdict(list)
    for sr in sf.shapeRecords():
        chave = sr.record[idx_campo]
        if not chave:
            continue
        geom = shape(sr.shape.__geo_interface__)
        if geom.is_empty:
            continue
        partes_por_grupo[chave].extend(partes(geom))

    rotulos = []
    grupos_multi = 0

    for chave, lista_partes in partes_por_grupo.items():
        maior = max(lista_partes, key=lambda g: g.area)
        if len(lista_partes) > 1:
            grupos_multi += 1

        ponto = polylabel(maior, precisao=1.0)
        ponto_wgs = reprojetar((ponto.x, ponto.y))

        rotulos.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": ponto_wgs},
                "properties": {"rotulo": str(chave)},
            }
        )

    with open(SAIDA_ROTULOS, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": rotulos}, f)

    print(f"Rótulos gerados: {len(rotulos)}")
    print(f"Grupos com mais de 1 parte/registro: {grupos_multi}")


if __name__ == "__main__":
    main()
