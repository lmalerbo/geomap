// Cores fixas das ferramentas do mapa (nunca configuráveis pelo admin,
// diferente da cor de camada em paleta.js) — centralizadas aqui em vez de
// espalhadas em literais hex dentro de Mapa.jsx, pra mudar a identidade
// visual de uma ferramenta num lugar só.
export const CORES_FERRAMENTAS = {
  medicao: "#eda100",
  // Usadas só no instante da captura do mapa pro relatório em PDF (ver
  // useMedicao.js) — trocam temporariamente o laranja/tracejado da edição
  // ao vivo por um visual "acabado" (como o KML exportado ficaria). Verde
  // (combinando com a identidade do relatório) foi tentado primeiro, mas
  // sumia contra fundo de vegetação/satélite — amarelo + contorno laranja
  // forte é o par de maior contraste contra qualquer fundo de mapa real.
  medicaoRelatorioPreenchimento: "#fde047",
  medicaoRelatorioContorno: "#c2410c",
  track: "#dc2626",
  temporaria: "#c026d3",
  // Camada "Talhões — Voos" (réplica pra apontamento, ver
  // docs/INTEGRACAO_DRONEMANAGEMENT.md): laranja de atenção pro talhão
  // pendente (distinto do laranja de medição, mais próximo de vermelho —
  // "precisa de ação"), azul de alto contraste pro que o piloto já
  // selecionou no modo de apontamento (nunca se confunde com o laranja
  // de pendente nem com o amarelo de destaqueGrupo).
  vooPendente: "#f97316",
  vooSelecionado: "#2563eb",
  destaqueGrupo: "#ffd400",
  marcadorSelecao: "#6b3fa0",
  fundoMapaPadrao: "#e8eef1",
};
