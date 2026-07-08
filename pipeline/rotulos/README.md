# Geração de rótulos (1 ponto por talhão/fazenda)

Camada auxiliar de pontos usada só pra posicionar o número do talhão
(ou o nome da fazenda, em Limites) no mapa — MapLibre/tippecanoe
colocam 1 rótulo por *polígono*, não por feição lógica, e:

- ~35% dos talhões têm geometria multi-parte (mesmo talhão cortado em
  vários polígonos desconexos, ex: por estrada/rio) → gerava números
  duplicados.
- em Limites, o mesmo nome de fazenda (`DESC_SECAO`) se repete em
  várias seções/registros diferentes.

Estes scripts calculam **1 ponto por grupo lógico**, na maior parte
(por área), usando o algoritmo *pole of inaccessibility* (`polylabel.py`
— mesma técnica da Mapbox): o ponto mais distante de qualquer borda do
polígono. Ao contrário de um centroide (média de vértices ou média
ponderada por área), esse ponto **sempre cai dentro do polígono** e
fica visualmente centralizado mesmo em formas côncavas/alongadas (ex:
talhão em formato de foice). O centroide simples usado antes colocava
~8% dos rótulos fora do próprio polígono (até 174 m de distância).

## Uso

```
python gerar_rotulos.py <talhoes.shp> <saida_rotulos.geojson>
python gerar_rotulos_por_atributo.py <limites.shp> DESC_SECAO <saida_rotulos.geojson>
```

Depois, gera o `.pmtiles` da camada `rotulos` **separado** da camada
de polígonos, com `-r1` (desliga o drop-rate padrão do tippecanoe —
por padrão ele "enxuga" pontos densos em zooms baixos achando que são
POIs redundantes tipo bares/farmácias; aqui cada rótulo é único e
obrigatório, então isso apagava a maioria dos números em zooms
intermediários):

```
tippecanoe -o rotulos.pmtiles -l rotulos -z17 -r1 -f rotulos.geojson
```

E junta com a camada de polígonos via `tile-join`:

```
tile-join -f -o final.pmtiles poligonos.pmtiles rotulos.pmtiles
```
