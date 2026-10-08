// Depois de publicar uma versão nova, uma aba aberta antes ainda aponta
// pros arquivos antigos (o nome leva um hash do conteúdo) e o service
// worker já trocou o cache por inteiro. Abrir outra tela nessa aba falha
// com "Failed to fetch dynamically imported module". Recarregar pega a
// versão nova. Só uma vez por minuto: se falhar de novo logo em seguida, é
// outro problema (ex: sem rede e sem cache) e o erro aparece normalmente.
const CHAVE = "geomap_recarga_versao_nova";
const INTERVALO_MS = 60_000;

export function recarregarPraVersaoNova() {
  let ultima = 0;
  try {
    ultima = Number(sessionStorage.getItem(CHAVE)) || 0;
  } catch {
    // sessionStorage indisponível: recarrega mesmo assim (no pior caso,
    // uma recarga a mais).
  }
  if (Date.now() - ultima < INTERVALO_MS) return false;
  try {
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    // idem
  }
  window.location.reload();
  return true;
}

// Envolve um import() dinâmico (ex: lazy(() => import(...))): se falhar,
// recarrega pra versão nova em vez de mostrar a tela de erro.
export function importarComRecarga(importar) {
  return () =>
    importar().catch((erro) => {
      if (recarregarPraVersaoNova()) return new Promise(() => {}); // a página vai recarregar
      throw erro;
    });
}
