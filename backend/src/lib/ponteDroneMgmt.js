import crypto from "node:crypto";

// Ponte do DroneManagement pelo servidor geo — ver docs/PONTE_DRONEMGMT.md.
// O backend (Render) não alcança mais a plataforma pela internet; o servidor
// geo (dentro da rede) busca os pedidos aqui por long-poll, executa e devolve.
// Fila em memória: o Render roda uma instância só.

// Erro da ponte em si (servidor geo desligado ou sem resposta): a mensagem
// já diz o que fazer, então as rotas mostram ela como está.
export class ErroPonte extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroPonte";
  }
}

export function criarPonte({
  tempoRespostaMs = 120_000, // um pedido sem resposta nesse tempo falha
  tempoConectadaMs = 45_000, // ponte sem consultar nesse tempo = desligada
  agora = () => Date.now(),
} = {}) {
  const fila = []; // tarefas ainda não entregues
  const aguardando = new Map(); // id -> { resolver, rejeitar, timer }
  let esperaPonte = null; // long-poll do servidor geo esperando tarefa
  let ultimaConsulta = null;

  function conectada() {
    return ultimaConsulta != null && agora() - ultimaConsulta < tempoConectadaMs;
  }

  function entregarSeEsperando() {
    if (!esperaPonte || fila.length === 0) return;
    const { resolver, timer } = esperaPonte;
    esperaPonte = null;
    clearTimeout(timer);
    resolver(fila.splice(0));
  }

  // Do lado do backend: manda um pedido pela ponte e espera o resultado.
  function chamar(pedido) {
    if (!conectada()) {
      return Promise.reject(
        new ErroPonte(
          "A ponte com o DroneManagement (servidor geo) está desligada. Confira se o servidor geo está ligado e com internet."
        )
      );
    }
    const id = crypto.randomUUID();
    return new Promise((resolver, rejeitar) => {
      const timer = setTimeout(() => {
        aguardando.delete(id);
        const i = fila.findIndex((t) => t.id === id);
        if (i >= 0) fila.splice(i, 1);
        rejeitar(new ErroPonte("O DroneManagement não respondeu a tempo pela ponte do servidor geo."));
      }, tempoRespostaMs);
      aguardando.set(id, { resolver, rejeitar, timer });
      fila.push({ id, ...pedido });
      entregarSeEsperando();
    });
  }

  // Do lado do servidor geo: pega o que estiver na fila ou espera até
  // `esperaMs` por algo novo. Só um long-poll por vez (o mais novo assume).
  function pegarTarefas(esperaMs = 25_000) {
    ultimaConsulta = agora();
    if (fila.length > 0) return Promise.resolve(fila.splice(0));
    if (esperaPonte) {
      clearTimeout(esperaPonte.timer);
      esperaPonte.resolver([]);
    }
    return new Promise((resolver) => {
      const timer = setTimeout(() => {
        if (esperaPonte?.resolver === resolver) esperaPonte = null;
        ultimaConsulta = agora();
        resolver([]);
      }, esperaMs);
      esperaPonte = { resolver, timer };
    });
  }

  function responder(id, resultado) {
    ultimaConsulta = agora();
    const pendente = aguardando.get(id);
    if (!pendente) return false; // já expirou (ou nunca existiu)
    aguardando.delete(id);
    clearTimeout(pendente.timer);
    pendente.resolver(resultado);
    return true;
  }

  function estado() {
    return {
      conectada: conectada(),
      ultimaConsulta: ultimaConsulta ? new Date(ultimaConsulta).toISOString() : null,
      pedidosEmAndamento: aguardando.size,
    };
  }

  return { chamar, pegarTarefas, responder, estado };
}

// Instância única do processo (usada por dronemgmt.js e pelas rotas).
export const ponte = criarPonte();

// Status que, por definição do HTTP, não têm corpo — o construtor Response
// lança "Invalid response status code" se receber qualquer corpo (até "")
// com eles. O DroneManagement responde 204 ao PUT do apontamento.
const STATUS_SEM_CORPO = new Set([101, 204, 205, 304]);

// Resultado da ponte -> Response, pra quem chama chamarApi() não perceber a
// diferença entre chamada direta e pela ponte.
export function resultadoParaResponse({ status, contentType, corpo }) {
  return new Response(STATUS_SEM_CORPO.has(status) ? null : (corpo ?? ""), {
    status,
    headers: contentType ? { "content-type": contentType } : {},
  });
}
