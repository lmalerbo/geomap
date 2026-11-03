// Esta rota não passa pela ponte: sem rede, qualquer 5xx (deploy, Render
// acordando, banco) e sessão vencida (401) ficam para a próxima tentativa.
// Só 400/403/404 recusam.
export function ehErroTransitorioExcedente(erro) {
  return !erro.status || erro.status >= 500 || erro.status === 401;
}

// Fila offline dos apontamentos do Plantio Excedente — mesmo espírito de
// filaApontamentos.js (motor puro, dependências injetadas; instância real em
// filaExcedenteApp.js). Um item por apontamento; o envio junta os pendentes
// de cada mapa num POST só. O servidor decide por item: aplicado ou
// substituído saem da fila, recusado fica com o motivo até o usuário tentar
// de novo ou descartar.
export function criarFilaExcedente({ api, store, aoMudar = () => {}, gerarId = () => crypto.randomUUID() }) {
  // statusAnterior = o que o aparelho mostrava: o servidor valida a transição
  // a partir dele (vale o mais recente entre dois aparelhos).
  async function enfileirar({ mapaId, casoId, status, statusAnterior = null, campos }) {
    const item = {
      id: gerarId(),
      mapaId,
      casoId,
      status,
      statusAnterior,
      campos: campos || {},
      feitoEm: new Date().toISOString(),
      estado: "pendente",
      erro: null,
    };
    await store.salvar(item);
    aoMudar({ tipo: "enfileirado", item });
    return item;
  }

  async function enviarPendentes(token) {
    const pendentes = (await store.listar()).filter((i) => i.estado === "pendente");
    const porMapa = new Map();
    for (const i of pendentes) {
      if (!porMapa.has(i.mapaId)) porMapa.set(i.mapaId, []);
      porMapa.get(i.mapaId).push(i);
    }
    let enviados = 0;
    let recusados = 0;
    let restantes = false;
    for (const [mapaId, itens] of porMapa) {
      const ordenados = [...itens].sort((a, b) => a.feitoEm.localeCompare(b.feitoEm));
      let resposta;
      try {
        resposta = await api.apontar(
          token,
          mapaId,
          ordenados.map(({ id, casoId, status, statusAnterior, campos, feitoEm }) => ({
            id, casoId, status, statusAnterior: statusAnterior ?? undefined, campos, feitoEm,
          }))
        );
      } catch (erro) {
        if (ehErroTransitorioExcedente(erro)) {
          restantes = true;
          break;
        }
        for (const i of ordenados) await store.salvar({ ...i, estado: "recusado", erro: erro.message });
        recusados += ordenados.length;
        continue;
      }
      const porId = new Map((resposta.resultados || []).map((r) => [r.id, r]));
      for (const i of ordenados) {
        const r = porId.get(i.id);
        if (r?.resultado === "recusado") {
          recusados++;
          await store.salvar({ ...i, estado: "recusado", erro: r.erro || "recusado pelo servidor" });
        } else if (r) {
          enviados++;
          await store.remover(i.id);
        }
      }
    }
    if (enviados || recusados) aoMudar({ tipo: "enviado", enviados, recusados });
    return { enviados, recusados, restantes };
  }

  async function retentar(itemId) {
    const item = (await store.listar()).find((i) => i.id === itemId);
    if (!item || item.estado !== "recusado") return;
    await store.salvar({ ...item, estado: "pendente", erro: null });
    aoMudar({ tipo: "retentado", itemId });
  }

  async function descartar(itemId) {
    await store.remover(itemId);
    aoMudar({ tipo: "descartado", itemId });
  }

  return { enfileirar, enviarPendentes, retentar, descartar };
}