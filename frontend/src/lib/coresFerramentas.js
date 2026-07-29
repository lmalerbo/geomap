// Cores fixas das ferramentas do mapa (nunca configuráveis pelo admin,
// diferente da cor de camada em paleta.js) — centralizadas aqui em vez de
// espalhadas em literais hex dentro de Mapa.jsx, pra mudar a identidade
// visual de uma ferramenta num lugar só.
export const CORES_FERRAMENTAS = {
  medicao: "#eda100",
  // Usada só no instante da captura do mapa pro relatório em PDF (ver
  // useMedicao.js) — troca temporariamente o laranja/tracejado da edição
  // ao vivo por um visual "acabado" (como o KML exportado ficaria),
  // verde pra combinar com o resto da identidade do relatório (mesmo tom
  // do --accent do app).
  medicaoRelatorio: "#2c6b47",
  track: "#dc2626",
  temporaria: "#c026d3",
  destaqueGrupo: "#ffd400",
  marcadorSelecao: "#6b3fa0",
  fundoMapaPadrao: "#e8eef1",
};
