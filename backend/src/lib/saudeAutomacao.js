// Saúde da automação diária de Talhões/Limites (redesenho, fase 5 — Visão
// geral do admin). A automação roda no "servidor geo" (rede interna, ver
// automacao/vigiar-talhoes-limites) e o backend não enxerga o log dela;
// tudo aqui é deduzido do que o banco já registra: os logins da conta de
// serviço e os jobs de conversão que ela cria.
//
// Detalhe que muda a leitura: a automação só faz login quando tem arquivo
// novo pra enviar. "Nenhum login no dia" pode ser falta de internet no
// servidor geo OU nenhum export novo — não dá pra separar os dois. O sinal
// confiável é a camada atrasada: uma camada que a automação mantém e que
// não recebeu atualização no prazo.

// Brasil sem horário de verão desde 2019: UTC-3 fixo.
const FUSO_MS = -3 * 60 * 60 * 1000;
// A tarefa roda 08:05 e leva ~70 min; a partir das 11h a atualização do
// dia já devia ter chegado.
const HORA_LIMITE_DO_DIA = 11;
// Um job de conversão leva no máximo ~15 min; "processando" há mais que
// isso é um job órfão (o servidor reiniciou no meio), não trabalho real.
export const JOB_VIVO_MS = 40 * 60 * 1000;
// Jobs antigos não guardavam quem enviou: os criados até 3h depois de um
// login da automação são atribuídos a ela.
const JANELA_APOS_LOGIN_MS = 3 * 60 * 60 * 1000;
export const DIAS_HISTORICO = 7;

export function diaLocal(data) {
  return new Date(new Date(data).getTime() + FUSO_MS).toISOString().slice(0, 10);
}

function horaLocal(data) {
  return new Date(new Date(data).getTime() + FUSO_MS).getUTCHours();
}

function diasEntre(diaA, diaB) {
  return Math.round((Date.parse(diaB) - Date.parse(diaA)) / 86400000);
}

function ehDaAutomacao(job, automacaoId, logins) {
  if (job.usuarioId != null) return job.usuarioId === automacaoId;
  if (job.tipo !== "atualizar_arquivo") return false;
  const t = new Date(job.criadoEm).getTime();
  return logins.some((l) => {
    const tl = new Date(l).getTime();
    return t >= tl && t - tl <= JANELA_APOS_LOGIN_MS;
  });
}

// logins: datas de login da conta de serviço; jobs: {camadaId, tipo,
// status, erro, criadoEm, atualizadoEm, usuarioId}; camadas: {id, nome,
// mapaNome, versao, publicadoEm}.
export function resumirAutomacao({ agora, automacaoId, logins, jobs, camadas }) {
  const hoje = diaLocal(agora);
  const tAgora = new Date(agora).getTime();
  const jobsAutomacao = automacaoId == null ? [] : jobs.filter((j) => ehDaAutomacao(j, automacaoId, logins));
  const idsAutomacao = new Set(jobsAutomacao.map((j) => j.camadaId).filter((id) => id != null));

  const dias = [];
  for (let i = DIAS_HISTORICO - 1; i >= 0; i--) {
    const dia = diaLocal(tAgora - i * 86400000);
    const doDia = jobsAutomacao.filter((j) => diaLocal(j.criadoEm) === dia);
    const loginsDia = logins.filter((l) => diaLocal(l) === dia).length;
    const concluidos = doDia.filter((j) => j.status === "concluido").length;
    const comErro = doDia.filter((j) => j.status === "erro").length;
    const vivos = doDia.filter((j) => j.status === "processando" && tAgora - new Date(j.criadoEm).getTime() < JOB_VIVO_MS).length;
    let situacao;
    if (vivos > 0) situacao = "andamento";
    else if (doDia.length > 0 && comErro === 0 && concluidos === doDia.length) situacao = "ok";
    else if (doDia.length > 0) situacao = "erro";
    else if (dia === hoje && horaLocal(agora) < HORA_LIMITE_DO_DIA) situacao = "aguardando";
    else situacao = "sem_envio";
    dias.push({ dia, situacao, enviados: doDia.length, concluidos, comErro, logins: loginsDia });
  }

  const camadasResumo = camadas.map((c) => {
    const daCamada = jobs.filter((j) => j.camadaId === c.id);
    const ultimaOk = daCamada
      .filter((j) => j.status === "concluido")
      .map((j) => j.atualizadoEm)
      .sort((a, b) => new Date(b) - new Date(a))[0];
    const ultimaAtualizacao = ultimaOk || c.publicadoEm || null;
    const processando = daCamada.some(
      (j) => j.status === "processando" && tAgora - new Date(j.criadoEm).getTime() < JOB_VIVO_MS
    );
    const ultimoJob = daCamada.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))[0];
    const automacao = idsAutomacao.has(c.id);
    let situacao = automacao ? "em_dia" : "manual";
    let diasAtraso = 0;
    if (processando) situacao = "atualizando";
    else if (automacao) {
      diasAtraso = ultimaAtualizacao ? diasEntre(diaLocal(ultimaAtualizacao), hoje) : DIAS_HISTORICO;
      const atrasada = diasAtraso >= 2 || (diasAtraso === 1 && horaLocal(agora) >= HORA_LIMITE_DO_DIA);
      // Última tentativa falhou depois do último sucesso: erro de conversão,
      // não só atraso (a mensagem do job diz o porquê).
      if (ultimoJob?.status === "erro" && (!ultimaOk || new Date(ultimoJob.criadoEm) > new Date(ultimaOk))) {
        situacao = "erro";
      } else if (atrasada) situacao = "atrasada";
    }
    return {
      id: c.id,
      nome: c.nome,
      mapaNome: c.mapaNome,
      versao: c.versao,
      automacao,
      situacao,
      diasAtraso,
      ultimaAtualizacao,
      ultimoErro: situacao === "erro" ? ultimoJob.erro : null,
    };
  });

  const daAutomacao = camadasResumo.filter((c) => c.automacao);
  const atrasadas = daAutomacao.filter((c) => c.situacao === "atrasada" || c.situacao === "erro");
  const ultimoDiaCompleto = [...dias].reverse().find((d) => d.situacao === "ok") || null;
  const ultimoLogin = logins.map((l) => new Date(l)).sort((a, b) => b - a)[0] || null;

  return {
    configurada: automacaoId != null,
    dias,
    camadas: camadasResumo,
    qtdCamadasAutomacao: daAutomacao.length,
    atrasadas: atrasadas.length,
    maiorAtraso: atrasadas.reduce((m, c) => Math.max(m, c.diasAtraso), 0),
    ultimoDiaCompleto: ultimoDiaCompleto?.dia || null,
    ultimoLogin,
    processandoAgora: camadasResumo.filter((c) => c.situacao === "atualizando").map((c) => ({ nome: c.nome, mapaNome: c.mapaNome })),
  };
}
