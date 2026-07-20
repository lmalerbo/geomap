// Cliente HTTP fino pra API do GeoMap -- usa fetch/FormData/Blob nativos
// do Node 18+, sem nenhuma dependencia (node-fetch/form-data/axios).
import fs from "fs/promises";

export class ErroApi extends Error {
  constructor(mensagem, status = null) {
    super(mensagem);
    this.name = "ErroApi";
    this.status = status;
  }
}

// `email`/`senha` sao os da conta de servico dedicada (ver README) --
// nunca a conta pessoal de um admin humano. O token JWT expira em 12h
// (backend/src/routes/auth.js) -- `chamar` reloga sozinho uma vez se
// receber 401, entao a automacao sobrevive rodando dias sem intervencao.
export function criarClienteApi({ baseUrl, email, senha }) {
  let token = null;

  async function login() {
    const resp = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    if (!resp.ok) {
      throw new ErroApi(`login falhou (HTTP ${resp.status})`, resp.status);
    }
    const dados = await resp.json();
    token = dados.token;
    return token;
  }

  async function chamar(caminho, opcoes = {}, jaRelogou = false) {
    if (!token) await login();
    const resp = await fetch(`${baseUrl}${caminho}`, {
      ...opcoes,
      headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401 && !jaRelogou) {
      await login();
      return chamar(caminho, opcoes, true);
    }
    return resp;
  }

  async function listarMapas() {
    const resp = await chamar("/admin/mapas");
    if (!resp.ok) throw new ErroApi(`GET /admin/mapas falhou (HTTP ${resp.status})`, resp.status);
    return resp.json();
  }

  async function listarCamadas() {
    const resp = await chamar("/admin/camadas");
    if (!resp.ok) throw new ErroApi(`GET /admin/camadas falhou (HTTP ${resp.status})`, resp.status);
    return resp.json();
  }

  // `caminhosArquivos`: array de caminhos absolutos no disco (.shp/.shx/
  // .dbf/.prj/.cpg) -- lidos e anexados no multipart, campo "arquivos"
  // (mesmo nome de campo que a tela de admin usa pra upload solto de
  // shapefile, ver backend/src/routes/admin.js).
  async function enviarArquivoCamada(camadaId, caminhosArquivos, versao) {
    const form = new FormData();
    form.set("versao", versao);
    for (const caminho of caminhosArquivos) {
      const buffer = await fs.readFile(caminho);
      const nomeArquivo = caminho.split(/[\\/]/).pop();
      form.append("arquivos", new Blob([buffer]), nomeArquivo);
    }
    const resp = await chamar(`/admin/camadas/${camadaId}/arquivo`, { method: "PUT", body: form });
    if (resp.status !== 202) {
      const corpo = await resp.text().catch(() => "");
      throw new ErroApi(`PUT .../camadas/${camadaId}/arquivo falhou (HTTP ${resp.status}): ${corpo}`, resp.status);
    }
    const { jobId } = await resp.json();
    return jobId;
  }

  async function consultarJob(jobId) {
    const resp = await chamar(`/admin/jobs/${jobId}`);
    const corpo = await resp.text();
    if (!resp.ok) throw new ErroApi(`GET /admin/jobs/${jobId} falhou (HTTP ${resp.status}): ${corpo.slice(0, 200)}`, resp.status);
    try {
      return JSON.parse(corpo);
    } catch {
      // HTTP 200 mas corpo não é JSON -- acontece quando um proxy/gateway
      // na frente do backend (Render, ou o firewall da rede) devolve uma
      // página de erro HTML própria em vez de deixar passar a resposta
      // real da API (ex: durante um restart do serviço). Sinaliza como
      // erro transitório -- aguardarJobConcluir tolera isso e tenta de
      // novo, em vez de desistir na primeira.
      throw new ErroApi(`resposta de GET /admin/jobs/${jobId} não é JSON (HTTP ${resp.status}): ${corpo.slice(0, 200)}`, resp.status);
    }
  }

  return { login, listarMapas, listarCamadas, enviarArquivoCamada, consultarJob };
}

// Poll ate o job sair de "processando" -- Talhoes grande já levou 8-12min
// em producao real (ver CLAUDE.md), por isso o timeout generoso.
//
// Uma consulta isolada pode falhar por motivo passageiro (rede
// instável, ou o proxy/gateway na frente do backend devolvendo uma
// página de erro HTML durante um restart do serviço, visto em produção
// real -- ver ErroApi em consultarJob) -- nada disso significa que a
// conversão em si falhou, então não desiste na primeira: só passa a
// erro de verdade depois de várias falhas SEGUIDAS (o job continua
// rodando no servidor independente de a consulta de status funcionar).
export async function aguardarJobConcluir(
  cliente,
  jobId,
  { intervaloMs = 15_000, timeoutMs = 20 * 60_000, maxFalhasSeguidas = 5, aoFalharTemporariamente } = {}
) {
  const inicio = Date.now();
  let falhasSeguidas = 0;
  for (;;) {
    let job;
    try {
      job = await cliente.consultarJob(jobId);
      falhasSeguidas = 0;
    } catch (erro) {
      falhasSeguidas++;
      if (falhasSeguidas >= maxFalhasSeguidas) {
        throw new ErroApi(
          `job ${jobId}: ${falhasSeguidas} consultas seguidas falharam, desistindo (última: ${erro.message})`,
          null
        );
      }
      aoFalharTemporariamente?.(erro, falhasSeguidas);
      await new Promise((resolver) => setTimeout(resolver, intervaloMs));
      continue;
    }
    if (job.status === "concluido") return job;
    if (job.status === "erro") throw new ErroApi(`job ${jobId} terminou com erro: ${job.erro}`, null);
    if (Date.now() - inicio > timeoutMs) {
      throw new ErroApi(`job ${jobId} não concluiu em ${Math.round(timeoutMs / 60_000)}min`, null);
    }
    await new Promise((resolver) => setTimeout(resolver, intervaloMs));
  }
}
