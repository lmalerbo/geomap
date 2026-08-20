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
  // Apontamento de voo pelo mapa (ver
  // docs/INTEGRACAO_DRONEMANAGEMENT.md) — cor por tipo de voo em si vem
  // de paleta.js (corPorProjeto em useApontamentoVoo.js, estável por
  // nome). Só as 3 cores de "estado", não de tipo, vivem aqui: azul de
  // alto contraste pro que o piloto já selecionou no modo de apontamento
  // (nunca se confunde com nenhuma cor de tipo nem com o amarelo de
  // destaqueGrupo); cinza-escuro quase preto pro talhão com 2+ tipos
  // pendentes ao mesmo tempo (nunca uma cor "de tipo" de verdade, senão
  // pareceria só mais um tipo em vez de um aviso de "múltiplo, escolha
  // qual"); verde de confirmação rápida (~4s) depois de apontar com
  // sucesso — mais claro que o verde escuro da paleta categórica
  // (paleta.js), pra não parecer só mais uma cor de tipo.
  vooSelecionado: "#2563eb",
  vooMultiplo: "#1f2937",
  vooConfirmado: "#22c55e",
  destaqueGrupo: "#ffd400",
  marcadorSelecao: "#6b3fa0",
  fundoMapaPadrao: "#e8eef1",
};
