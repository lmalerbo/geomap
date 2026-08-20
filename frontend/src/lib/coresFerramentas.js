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
  // docs/INTEGRACAO_DRONEMANAGEMENT.md) — cor por tipo de voo em si é
  // fixa por nome (ORDEM_E_COR_TIPO_VOO em useApontamentoVoo.js, pedido
  // exato do Leo 2026-08-20: verde/amarelo/branco/vermelho/amarelo
  // florescente/rosa/roxo/marrom claro/azul). Só as 3 cores de "estado",
  // não de tipo, vivem aqui — precisam ser diferentes de TODAS as 9 cores
  // de tipo (aparecem juntas na mesma tela): ciano de alto contraste pro
  // que o piloto já selecionou no modo de apontamento; cinza-escuro quase
  // preto pro talhão com 2+ tipos pendentes ao mesmo tempo (nunca uma cor
  // "de tipo" de verdade, senão pareceria só mais um tipo em vez de um
  // aviso de "múltiplo, escolha qual"); laranja de confirmação rápida
  // (~4s) depois de apontar com sucesso.
  vooSelecionado: "#06b6d4",
  vooMultiplo: "#1f2937",
  vooConfirmado: "#f97316",
  destaqueGrupo: "#ffd400",
  marcadorSelecao: "#6b3fa0",
  fundoMapaPadrao: "#e8eef1",
};
