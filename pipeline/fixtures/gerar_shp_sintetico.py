"""
Gera um shapefile sintético (3 talhões fictícios) só pra validar o pipeline
.shp -> tippecanoe -> .pmtiles. NÃO é dado real de fazenda.

Uso: python pipeline/fixtures/gerar_shp_sintetico.py
Saída: pipeline/fixtures/output/talhoes_teste.{shp,shx,dbf,prj}
"""

import os
import shapefile  # pyshp

SAIDA_DIR = os.path.join(os.path.dirname(__file__), "output")
SAIDA_BASE = os.path.join(SAIDA_DIR, "talhoes_teste")

WGS84_WKT = (
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
    'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
)

TALHOES = [
    {
        "nome": "Talhao 01 (dado fake)",
        "area_ha": 12.5,
        "variedade": "RB867515",
        "anel": [
            (-47.990, -21.990),
            (-47.985, -21.990),
            (-47.985, -21.985),
            (-47.990, -21.985),
            (-47.990, -21.990),
        ],
    },
    {
        "nome": "Talhao 02 (dado fake)",
        "area_ha": 9.8,
        "variedade": "SP80-3280",
        "anel": [
            (-47.985, -21.990),
            (-47.980, -21.990),
            (-47.980, -21.985),
            (-47.985, -21.985),
            (-47.985, -21.990),
        ],
    },
    {
        "nome": "Talhao 03 (dado fake)",
        "area_ha": 15.2,
        "variedade": "CTC4",
        "anel": [
            (-47.990, -21.985),
            (-47.985, -21.985),
            (-47.985, -21.980),
            (-47.990, -21.980),
            (-47.990, -21.985),
        ],
    },
]


def main():
    os.makedirs(SAIDA_DIR, exist_ok=True)

    with shapefile.Writer(SAIDA_BASE, shapeType=shapefile.POLYGON) as w:
        w.field("nome", "C", size=50)
        w.field("area_ha", "N", decimal=2)
        w.field("variedade", "C", size=20)

        for talhao in TALHOES:
            w.poly([talhao["anel"]])
            w.record(talhao["nome"], talhao["area_ha"], talhao["variedade"])

    with open(SAIDA_BASE + ".prj", "w") as prj:
        prj.write(WGS84_WKT)

    print(f"Shapefile sintético gerado em: {SAIDA_BASE}.shp ({len(TALHOES)} talhões fictícios)")


if __name__ == "__main__":
    main()
