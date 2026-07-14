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
from pyproj import CRS, Transformer
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from polylabel import polylabel

ENTRADA = sys.argv[1]
SAIDA_ROTULOS = sys.argv[2]

# CRS de origem lido do .prj ao lado do .shp, em vez de fixo em
# EPSG:31983 (SIRGAS 2000 / UTM 23S) — os shapefiles anteriores usados
# neste pipeline sempre vieram nessa projeção UTM, mas um export não
# garante isso (já apareceu um em WGS84/EPSG:4326 puro, lon/lat em graus
# em vez de metros UTM). Sem isso, reprojetar trataria valores em graus
# como se fossem metros UTM, jogando os rótulos pra um lugar
# completamente errado no mapa. Sem .prj, cai no EPSG:31983 de sempre
# (comportamento antigo preservado).
_caminho_prj = os.path.splitext(ENTRADA)[0] + ".prj"
if os.path.exists(_caminho_prj):
    with open(_caminho_prj, encoding="utf-8") as f:
        crs_origem = CRS.from_wkt(f.read())
else:
    crs_origem = CRS.from_epsg(31983)
transformer = Transformer.from_crs(crs_origem, "EPSG:4326", always_xy=True)


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

    total_com_erro = 0
    for i, sr in enumerate(sf.shapeRecords()):
        secao = sr.record[idx_secao]
        talhao = sr.record[idx_talhao]
        # Uma feição com geometria malformada (ex: anel de furo sem par de
        # anel externo válido) não pode derrubar o lote inteiro — pula só
        # essa e segue, com um aviso, igual ao padrão já usado no resto do
        # projeto (uma camada/feição ruim nunca derruba as demais).
        try:
            geom = shape(sr.shape.__geo_interface__)
        except Exception as err:
            total_com_erro += 1
            print(f"  aviso: feição {i} (SECAO={secao}, TALHAO={talhao}) com geometria inválida, pulando: {err}", file=sys.stderr)
            continue
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
    print(f"Feições com geometria inválida (puladas): {total_com_erro}")


if __name__ == "__main__":
    main()
