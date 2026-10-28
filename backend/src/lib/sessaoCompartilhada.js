// Sessão do DroneManagement compartilhada pelo processo inteiro.
//
// Cada login abre um Chromium inteiro (ver logar em dronemgmt.js). Sem
// controle, toda consulta que chegasse enquanto não havia sessão (logo
// depois de um deploy, ou quando a sessão expira) abria o SEU navegador —
// mapa de voos de cada piloto, indicadores e rotas do agente ao mesmo
// tempo. No Render free (0,1 CPU, 512 MB) vários Chromiums juntos estouram o
// tempo de login e TODAS falham com "DroneManagement não respondeu a tempo"
// (incidente real, 2026-10-08: ninguém conseguia apontar voo). Aqui um login
// por vez: quem chega durante um login espera o mesmo resultado.
export function criarSessaoCompartilhada(logar) {
  let atual = null; // { ...sessão, obtidaEm }
  let emAndamento = null;

  async function obter() {
    if (atual) return atual;
    if (!emAndamento) {
      emAndamento = logar()
        .then((sessao) => {
          atual = { ...sessao, obtidaEm: Date.now() };
          return atual;
        })
        .finally(() => {
          emAndamento = null;
        });
    }
    return emAndamento;
  }

  // Descarta a sessão só se ainda for a que falhou: várias consultas que
  // levam 401 juntas não derrubam a sessão nova que a primeira já refez.
  // Sem argumento, descarta qualquer uma (diagnóstico de login).
  function invalidar(sessaoQueFalhou) {
    if (!sessaoQueFalhou || atual === sessaoQueFalhou) atual = null;
  }

  return { obter, invalidar };
}
