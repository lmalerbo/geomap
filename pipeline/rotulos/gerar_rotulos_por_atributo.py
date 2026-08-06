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
from pyproj import CRS, Transformer
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from polylabel import polylabel

ENTRADA = sys.argv[1]
CAMPO_AGRUPAMENTO = sys.argv[2]
SAIDA_ROTULOS = sys.argv[3]

# CRS de origem lido do .prj ao lado do .shp — ver o mesmo comentário em
# gerar_rotulos.py (nem todo export vem em EPSG:31983/UTM).
_caminho_prj = os.path.splitext(ENTRADA)[0] + ".prj"
if os.path.exists(_caminho_prj):
    with open(_caminho_prj, encoding="utf-8") as f:
        crs_origem = CRS.from_wkt(f.read())
else:
    crs_origem = CRS.from_epsg(31983)
transformer = Transformer.from_crs(crs_origem, "EPSG:4326", always_xy=True)

# Encoding do texto do .dbf lido do .cpg ao lado do .shp — sem isso,
# shapefile.Reader(..., encoding="latin1") fixo corrompe em mojibake
# qualquer DBF que não seja latin1 de verdade (ex: UTF-8, comum em exports
# mais recentes: "Ribeirão" virava "RibeirÃ£o"). Mesmo raciocínio já
# aplicado ao CRS/.prj acima, agora pro texto. Sem .cpg, mantém latin1
# (comportamento antigo preservado).
_caminho_cpg = os.path.splitext(ENTRADA)[0] + ".cpg"
_MAPA_CPG = {"UTF-8": "utf-8", "UTF8": "utf-8", "65001": "utf-8", "1252": "cp1252", "ANSI 1252": "cp1252"}
if os.path.exists(_caminho_cpg):
    with open(_caminho_cpg, encoding="ascii", errors="ignore") as f:
        encoding_dbf = _MAPA_CPG.get(f.read().strip().upper(), "latin1")
else:
    encoding_dbf = "latin1"

def reprojetar(ponto_utm):
    lon, lat = transformer.transform(ponto_utm[0], ponto_utm[1])
    return [round(lon, 7), round(lat, 7)]


def partes(geom):
    if geom.geom_type == "Polygon":
        return [geom]
    return list(geom.geoms)


def main():
    sf = shapefile.Reader(ENTRADA, encoding=encoding_dbf)
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
