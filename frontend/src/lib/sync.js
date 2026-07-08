import { buscarCatalogo, baixarMapa } from "./api.js";
import {
  salvarMapaBaixado,
  listarMapasBaixados,
  removerMapaBaixado,
  atualizarMetadadosMapa,
} from "./db.js";

// Sincroniza os mapas permitidos em segundo plano: baixa os que ainda não
// existem localmente ou cuja versão mudou, e remove os que saíram do
// catálogo (perda de permissão, mapa despublicado etc) — nunca deixa lixo
// órfão no IndexedDB. Silencioso — nenhum botão, nenhuma tela de espera.
// Se estiver offline, simplesmente não faz nada e quem chamou continua
// usando o que já tem localmente.
export async function sincronizarMapas(token) {
  const locais = await listarMapasBaixados();
  const porId = new Map(locais.map((m) => [m.id, m]));

  let catalogo;
  try {
    catalogo = await buscarCatalogo(token);
  } catch {
    return { online: false, mapas: locais };
  }

  const idsNoCatalogo = new Set(catalogo.map((m) => m.id));
  const removidos = locais.filter((m) => !idsNoCatalogo.has(m.id));

  // allSettled: um mapa falhando (ex: perdeu permissão nesse meio-tempo)
  // não pode derrubar a sincronização dos outros.
  await Promise.allSettled([
    ...catalogo.map(async (mapa) => {
      const local = porId.get(mapa.id);
      if (local && local.versao === mapa.versao) {
        // Geometria/tiles não mudaram, mas nome, atributos ou estilo podem
        // ter mudado (ex: admin reordenou campos ou trocou a cor) — atualiza
        // sem rebaixar.
        await atualizarMetadadosMapa(mapa.id, mapa.nome, mapa.atributos_config, mapa.estilo_config);
        return;
      }
      const blob = await baixarMapa(token, mapa.id);
      await salvarMapaBaixado(
        mapa.id,
        mapa.nome,
        mapa.versao,
        blob,
        mapa.atributos_config,
        mapa.estilo_config
      );
    }),
    ...removidos.map((m) => removerMapaBaixado(m.id)),
  ]);

  const atualizados = await listarMapasBaixados();
  return { online: true, mapas: atualizados, sincronizadoEm: new Date() };
}
