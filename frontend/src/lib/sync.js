import { buscarCatalogo, baixarCamada } from "./api.js";
import {
  salvarMapaBaixado,
  listarMapasBaixados,
  removerMapaBaixado,
  atualizarMetadadosMapa,
  salvarMapasDisponiveis,
} from "./db.js";

// Sincroniza TODOS os mapas (projetos) permitidos em segundo plano — não
// só o que o usuário tem aberto no momento — baixando as camadas que ainda
// não existem localmente ou cuja versão mudou, e removendo as que saíram
// do catálogo (perda de permissão, camada despublicada etc) — nunca deixa
// lixo órfão no IndexedDB. Silencioso — nenhum botão, nenhuma tela de
// espera. Se estiver offline, simplesmente não faz nada e quem chamou
// continua usando o que já tem localmente.
export async function sincronizarMapas(token) {
  const locais = await listarMapasBaixados();
  const porId = new Map(locais.map((c) => [c.id, c]));

  let catalogo;
  try {
    catalogo = await buscarCatalogo(token);
  } catch {
    return { online: false, mapas: locais };
  }

  await salvarMapasDisponiveis(catalogo);

  const camadas = catalogo.flatMap((mapa) =>
    mapa.camadas.map((camada) => ({ ...camada, mapaId: mapa.id }))
  );
  const idsNoCatalogo = new Set(camadas.map((c) => c.id));
  const removidas = locais.filter((c) => !idsNoCatalogo.has(c.id));

  // allSettled: uma camada falhando (ex: perdeu permissão nesse meio-tempo)
  // não pode derrubar a sincronização das outras.
  await Promise.allSettled([
    ...camadas.map(async (camada) => {
      const local = porId.get(camada.id);
      if (local && local.versao === camada.versao) {
        // Geometria/tiles não mudaram, mas nome, atributos ou estilo podem
        // ter mudado (ex: admin reordenou campos ou trocou a cor) — atualiza
        // sem rebaixar.
        await atualizarMetadadosMapa(
          camada.id,
          camada.mapaId,
          camada.nome,
          camada.atributos_config,
          camada.estilo_config
        );
        return;
      }
      const blob = await baixarCamada(token, camada.id);
      await salvarMapaBaixado(
        camada.id,
        camada.mapaId,
        camada.nome,
        camada.versao,
        blob,
        camada.atributos_config,
        camada.estilo_config
      );
    }),
    ...removidas.map((c) => removerMapaBaixado(c.id)),
  ]);

  const atualizadas = await listarMapasBaixados();
  return { online: true, mapas: atualizadas, sincronizadoEm: new Date() };
}
