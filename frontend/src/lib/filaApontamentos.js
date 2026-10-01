// Fila offline de apontamentos de voo (redesenho, fase 4 — ver
// docs/REDESENHO_FRONTEND.md). Sem sinal, o lote confirmado pelo piloto é
// guardado no aparelho e enviado sozinho quando a conexão volta. Motor puro
// (dependências injetadas) pra ser testável sem rede nem IndexedDB — a
// instância real fica em filaApontamentosApp.js, mesmo padrão de syncPins.
//
// Lote: { id, mapaId, dataVoo, criadoEm, estado: "pendente" | "recusado",
//         registros: [{ id, secao, talhao, projeto, areaHa }],
//         falhas: [{ ...registro, erro }] }
//
// Regras (decididas com o Leo):
// - vale a data do voo escolhida na hora de apontar, nunca a do envio;
// - falha de REDE para a fila e tenta de novo depois (nada se perde);
// - recusa do servidor (registro que não está mais pendente, sem vínculo de
//   piloto, sem permissão…) nunca some em silêncio: o lote vira "recusado"
//   com o motivo de cada talhão, até o piloto tentar de novo ou descartar.
export function criarFilaApontamentos({ api, store, aoMudar = () => {}, gerarId = () => crypto.randomUUID() }) {
  async function enfileirar({ mapaId, dataVoo, registros }) {
    const lote = {
      id: gerarId(),
      mapaId,
      dataVoo,
      criadoEm: new Date().toISOString(),
      estado: "pendente",
      registros,
      falhas: [],
    };
    await store.salvar(lote);
    aoMudar({ tipo: "enfileirado", lote });
    return lote;
  }

  // Devolve { enviados, restantes, recusados } — `restantes` = ainda há lote
  // pendente (parou por falta de rede).
  async function enviarPendentes(token) {
    const lotes = (await store.listar()).filter((l) => l.estado === "pendente");
    let enviados = 0;
    let recusados = 0;
    let restantes = false;
    for (const lote of lotes) {
      let resposta;
      try {
        resposta = await api.apontar(token, {
          mapaId: lote.mapaId,
          dataVoo: lote.dataVoo,
          registros: lote.registros.map(({ id, secao, talhao }) => ({ id, secao, talhao })),
        });
      } catch (erro) {
        if (!erro.status) {
          // Rede: para aqui, os próximos lotes também falhariam.
          restantes = true;
          break;
        }
        // O servidor recusou o lote inteiro (ex: usuário sem vínculo de piloto).
        recusados += lote.registros.length;
        await store.salvar({
          ...lote,
          estado: "recusado",
          falhas: lote.registros.map((r) => ({ ...r, erro: erro.message })),
          registros: [],
        });
        continue;
      }
      const falhas = (resposta.falha || []).map((f) => ({
        ...(lote.registros.find((r) => r.id === f.id) || { id: f.id }),
        erro: f.erro,
      }));
      enviados += (resposta.sucesso || []).length;
      recusados += falhas.length;
      if (falhas.length > 0) {
        await store.salvar({ ...lote, estado: "recusado", falhas, registros: [] });
      } else {
        await store.remover(lote.id);
      }
    }
    if (enviados || recusados) aoMudar({ tipo: "enviado", enviados, recusados });
    return { enviados, restantes, recusados };
  }

  // Piloto pediu pra tentar de novo os talhões recusados de um lote (ex: a
  // falha era passageira do DroneManagement): voltam a ser pendentes.
  async function retentar(loteId) {
    const lote = (await store.listar()).find((l) => l.id === loteId);
    if (!lote || lote.estado !== "recusado") return;
    await store.salvar({
      ...lote,
      estado: "pendente",
      registros: lote.falhas.map(({ erro: _erro, ...r }) => r),
      falhas: [],
    });
    aoMudar({ tipo: "retentado", loteId });
  }

  async function descartar(loteId) {
    await store.remover(loteId);
    aoMudar({ tipo: "descartado", loteId });
  }

  return { enfileirar, enviarPendentes, retentar, descartar };
}
