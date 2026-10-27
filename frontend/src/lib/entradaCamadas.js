// Entrada das camadas no mapa, uma por vez (docs/movimento-esperas.md):
// cada camada nova começa transparente e sobe até a opacidade que já estava
// configurada, com um passo entre uma e outra. Roda depois que aplicar()
// (Mapa.jsx) adicionou as camadas, sem mexer nele: lê a opacidade que o
// próprio layer tem e devolve exatamente ela.
export const PASSO_ENTRADA = 220; // atraso entre uma camada e a próxima
export const DURACAO_ENTRADA = 550; // fade de cada camada
const TRANSICAO_PADRAO = { duration: 300, delay: 0 }; // a de adicionarCamada

// Propriedades de opacidade por tipo de layer do MapLibre.
const OPACIDADES = {
  fill: ["fill-opacity"],
  line: ["line-opacity"],
  circle: ["circle-opacity", "circle-stroke-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
};

function layersDaCamada(map, info) {
  const ids = [info.fillLayerId, info.lineLayerId, info.circleLayerId, info.rotuloLayerId];
  return ids.filter((id) => id && map.getLayer(id)).map((id) => map.getLayer(id));
}

// `infos`: [{id, info}] na ordem de entrada. `estaVisivel(id)`: a camada
// pode ter sido desligada no painel durante a entrada — aí não volta.
// Devolve uma função que cancela o que ainda não entrou (e devolve a
// opacidade original na hora).
export function entrarEmSequencia(map, infos, estaVisivel) {
  const pendentes = [];
  infos.forEach(({ id, info }, i) => {
    const alvos = [];
    for (const layer of layersDaCamada(map, info)) {
      for (const prop of OPACIDADES[layer.type] ?? []) {
        const valor = map.getPaintProperty(layer.id, prop);
        if (valor === undefined) continue;
        alvos.push({ layerId: layer.id, prop, valor });
        map.setPaintProperty(layer.id, `${prop}-transition`, { duration: 0, delay: 0 });
        map.setPaintProperty(layer.id, prop, 0);
      }
    }

    function mostrar(duracao) {
      for (const { layerId, prop, valor } of alvos) {
        if (!map.getLayer(layerId)) continue;
        map.setPaintProperty(layerId, `${prop}-transition`, { duration: duracao, delay: 0 });
        if (estaVisivel(id)) map.setPaintProperty(layerId, prop, valor);
      }
    }

    const entrada = setTimeout(() => {
      mostrar(DURACAO_ENTRADA);
      pendente.volta = setTimeout(() => restaurarTransicao(map, alvos), DURACAO_ENTRADA);
    }, i * PASSO_ENTRADA);
    const pendente = { entrada, volta: null, mostrar, alvos };
    pendentes.push(pendente);
  });

  return () => {
    for (const p of pendentes) {
      clearTimeout(p.entrada);
      clearTimeout(p.volta);
      try {
        p.mostrar(0);
        restaurarTransicao(map, p.alvos);
      } catch {
        // O mapa já foi desmontado (saída da tela): nada a devolver.
      }
    }
  };
}

function restaurarTransicao(map, alvos) {
  for (const { layerId, prop } of alvos) {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, `${prop}-transition`, TRANSICAO_PADRAO);
  }
}
