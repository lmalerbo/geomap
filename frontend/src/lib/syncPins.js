// Motor de sincronização das anotações (pins) — ver
// docs/superpowers/specs/2026-09-24-mapa-preparo-anotacoes-design.md.
// Toda escrita já foi aplicada no IndexedDB com `pendente` marcado (outbox);
// aqui só enviamos em ordem e recebemos o incremental. Dependências
// injetadas (api/store) para testar sem rede nem IndexedDB.

export function corpoParaApi(pin) {
  return {
    icone: pin.icone,
    cor: pin.cor,
    titulo: pin.titulo,
    nota: pin.nota,
    lng: pin.lng,
    lat: pin.lat,
    criadoEm: pin.criadoEm,
    atualizadoEm: pin.atualizadoEm,
  };
}

// Todo 4xx é definitivo (reenviar não vai mudar a resposta) — exceto
// 401 (sessão expirada: novo login resolve), 408 (timeout) e 429 (rate
// limit), que ficam pendentes pra próxima tentativa. 5xx/rede também.
const STATUS_4XX_TRANSITORIOS = new Set([401, 408, 429]);
function ehDescarteDefinitivo(status) {
  return Number.isInteger(status) && status >= 400 && status < 500 && !STATUS_4XX_TRANSITORIOS.has(status);
}

export function criarSyncPins({ api, store, aoDescartar }) {
  let execucao = null;
  let pedirDeNovo = false;

  async function enviarUmaRodada(token) {
    const pendentes = (await store.listarPendentes()).sort((a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm));
    let enviados = 0;
    for (const pin of pendentes) {
      let resposta;
      try {
        resposta =
          pin.pendente === "remover"
            ? await api.removerPin(token, pin.mapaId, pin.id, pin.removidoEm)
            : await api.salvarPin(token, pin.mapaId, pin.id, corpoParaApi(pin));
      } catch (erro) {
        if (ehDescarteDefinitivo(erro?.status)) {
          await store.remover(pin.id);
          // Zera o cursor do mapa: se o pin descartado já existia no
          // servidor (ex: 409 por conflito), o próximo receberPins
          // precisa buscar tudo de novo pra trazer a versão do servidor
          // de volta — com o cursor antigo, um GET incremental nunca
          // devolveria esse pin (recebido_em já passou dele).
          await store.salvarCursor(pin.mapaId, null);
          aoDescartar?.(pin, erro);
          continue;
        }
        // Rede/5xx/401/408/429: mantém tudo e tenta na próxima oportunidade, sem
        // pular a ordem da fila.
        return { enviados, restantes: true };
      }
      // O usuário pode ter editado o mesmo pin enquanto a requisição
      // estava em voo — nesse caso o registro local é mais novo e continua
      // pendente para a próxima rodada.
      const atual = await store.buscar(pin.id);
      if (atual && (atual.atualizadoEm !== pin.atualizadoEm || atual.pendente !== pin.pendente)) continue;
      const doServidor = resposta?.pin;
      if (!doServidor || doServidor.removidoEm) {
        await store.remover(pin.id);
      } else {
        await store.salvar({ ...doServidor, pendente: null });
      }
      enviados++;
    }
    return { enviados, restantes: false };
  }

  // Uma execução por vez; pedidos durante a execução disparam mais uma
  // rodada no fim (para não perder pendências criadas no meio).
  function enviarPendentes(token) {
    if (execucao) {
      pedirDeNovo = true;
      return execucao;
    }
    execucao = (async () => {
      let total = 0;
      let resultado;
      do {
        pedirDeNovo = false;
        resultado = await enviarUmaRodada(token);
        total += resultado.enviados;
      } while (pedirDeNovo && !resultado.restantes);
      return { enviados: total, restantes: resultado.restantes };
    })().finally(() => {
      execucao = null;
    });
    return execucao;
  }

  async function receberPins(token, mapaId) {
    const desde = await store.obterCursor(mapaId);
    const { pins, agora } = await api.listarPins(token, mapaId, desde);
    for (const remoto of pins) {
      const local = await store.buscar(remoto.id);
      if (local?.pendente) continue;
      if (remoto.removidoEm) {
        await store.remover(remoto.id);
      } else {
        await store.salvar({ ...remoto, pendente: null });
      }
    }
    await store.salvarCursor(mapaId, agora);
    return pins.length;
  }

  async function limparMapasSemPermissao(idsPermitidos) {
    const permitidos = new Set(idsPermitidos);
    for (const p of await store.listarTodos()) {
      if (!permitidos.has(p.mapaId)) await store.remover(p.id);
    }
  }

  return { enviarPendentes, receberPins, limparMapasSemPermissao };
}
