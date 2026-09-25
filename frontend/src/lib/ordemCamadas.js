// Garante que as camadas `ids` fiquem no topo da pilha do MapLibre, na ordem
// dada (a última fica por cima de todas). Usado pelas anotações (pins), que
// precisam ficar acima de qualquer camada — inclusive as adicionadas depois
// delas (rótulos, destaque, satélite, ferramentas). Não mexe em nada quando
// já estão no topo: moveLayer dispara "styledata", e quem chama isso a cada
// "styledata" entraria em loop sem essa checagem.
export function manterNoTopo(map, ids) {
  const existentes = ids.filter((id) => map.getLayer(id));
  if (existentes.length === 0) return;
  const ordem = map.getLayersOrder ? map.getLayersOrder() : map.getStyle().layers.map((l) => l.id);
  const topo = ordem.slice(ordem.length - existentes.length);
  if (topo.every((id, i) => id === existentes[i])) return;
  for (const id of existentes) map.moveLayer(id);
}
