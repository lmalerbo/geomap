"""
Implementação do algoritmo "pole of inaccessibility" (polylabel, da
Mapbox): acha o ponto DENTRO do polígono mais distante de qualquer
borda (inclusive bordas de buracos). Ao contrário do centroide (média
de vértices ou média ponderada por área), esse ponto sempre cai dentro
do polígono e tende a ficar visualmente "no meio", mesmo em formas
côncavas/alongadas (ex: talhão em formato de foice/gancho).
"""
import heapq
from shapely.geometry import Point

SQRT2 = 1.4142135623730951


def _distancia_com_sinal(polygon, x, y):
    p = Point(x, y)
    d = polygon.boundary.distance(p)
    return d if polygon.contains(p) else -d


def polylabel(polygon, precisao=1.0):
    minx, miny, maxx, maxy = polygon.bounds
    largura = maxx - minx
    altura = maxy - miny
    if largura == 0 or altura == 0:
        return polygon.representative_point()

    tamanho_celula = min(largura, altura)
    h = tamanho_celula / 2

    fila = []
    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            cx, cy = x + h, y + h
            d = _distancia_com_sinal(polygon, cx, cy)
            heapq.heappush(fila, (-(d + h * SQRT2), cx, cy, h, d))
            y += tamanho_celula
        x += tamanho_celula

    centro = polygon.centroid
    melhor_d = _distancia_com_sinal(polygon, centro.x, centro.y)
    melhor = (centro.x, centro.y, melhor_d)

    # bounding-box cell como fallback garantido (sempre entra na fila)
    bx, by = minx + largura / 2, miny + altura / 2
    bd = _distancia_com_sinal(polygon, bx, by)
    if bd > melhor[2]:
        melhor = (bx, by, bd)

    while fila:
        neg_max_d, cx, cy, h, d = heapq.heappop(fila)
        max_d = -neg_max_d
        if d > melhor[2]:
            melhor = (cx, cy, d)
        if max_d - melhor[2] <= precisao:
            continue
        h2 = h / 2
        for dx, dy in ((-h2, -h2), (h2, -h2), (-h2, h2), (h2, h2)):
            nx, ny = cx + dx, cy + dy
            nd = _distancia_com_sinal(polygon, nx, ny)
            heapq.heappush(fila, (-(nd + h2 * SQRT2), nx, ny, h2, nd))

    return Point(melhor[0], melhor[1])
