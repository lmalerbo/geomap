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
    // navigator.onLine é o único jeito disponível de diferenciar "aparelho
    // sem internet" de "conseguiu falar com a rede, mas o servidor não
    // respondeu" (queda do backend, bloqueio de borda — ex: incidente do
    // Render em 2026-08-20) — mensagens diferentes evitam o usuário achar
    // que o problema é do celular dele quando na verdade é do servidor.
    return { online: false, mapas: locais, motivo: navigator.onLine ? "servidor" : "dispositivo" };
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
      // local.blob só é ArrayBuffer se foi baixado depois da correção do bug
      // de Blob-via-IndexedDB no Safari/iOS (ver db.js/pmtilesBlobSource.js)
      // — um registro salvo antes disso ainda tem um Blob quebrado gravado,
      // sem chance de se corrigir sozinho (o dado em si é inutilizável, não
      // dá pra "reler" certo). Ignora o match de versão nesse caso e força
      // rebaixar, mesmo que a versão continue a mesma — autocorrige no
      // próximo sync online, sem exigir nenhuma ação do usuário.
      if (local && local.versao === camada.versao && local.blob instanceof ArrayBuffer) {
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
