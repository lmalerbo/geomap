import { buscarCatalogo, baixarMapa } from "./api.js";
import { salvarMapaBaixado, listarMapasBaixados } from "./db.js";

// Sincroniza os mapas permitidos em segundo plano: baixa os que ainda não
// existem localmente ou cuja versão mudou. Silencioso — nenhum botão,
// nenhuma tela de espera. Se estiver offline, simplesmente não faz nada
// e quem chamou continua usando o que já tem no IndexedDB.
export async function sincronizarMapas(token) {
  const locais = await listarMapasBaixados();
  const porId = new Map(locais.map((m) => [m.id, m]));

  let catalogo;
  try {
    catalogo = await buscarCatalogo(token);
  } catch {
    return { online: false, mapas: locais };
  }

  // allSettled: um mapa falhando (ex: perdeu permissão nesse meio-tempo)
  // não pode derrubar a sincronização dos outros.
  await Promise.allSettled(
    catalogo.map(async (mapa) => {
      const local = porId.get(mapa.id);
      if (local && local.versao === mapa.versao) return;
      const blob = await baixarMapa(token, mapa.id);
      await salvarMapaBaixado(mapa.id, mapa.nome, mapa.versao, blob);
    })
  );

  const atualizados = await listarMapasBaixados();
  return { online: true, mapas: atualizados, sincronizadoEm: new Date() };
}
