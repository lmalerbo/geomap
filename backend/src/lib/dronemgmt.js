import { chromium } from "playwright";

// Integração com a API interna do DroneManagement (Torre de Controle,
// prd-dronemgmt.pedraagroindustrial.com.br) — ver docs/INTEGRACAO_DRONEMANAGEMENT.md
// pro contrato completo (engenharia reversa dos endpoints, headers, schema).
//
// Auth é SSO corporativo, sem POST de login simples — login_dronemgmt() é
// uma porta pra Node do mesmo fluxo já validado em produção por
// project-preparo/sistema_preenchimento/engine/atualizar_voos.py (Python +
// Playwright, rodando de hora em hora via GitHub Actions há tempo).

const BASE_URL = (process.env.DRONEMGMT_BASE_URL || "").replace(/\/+$/, "");
const FORM_ID = process.env.DRONEMGMT_FORM_ID || "";
const UNIT_ID = process.env.DRONEMGMT_UNIT_ID || "";
const USUARIO = process.env.DRONEMGMT_USUARIO || "";
const SENHA = process.env.DRONEMGMT_SENHA || "";

const TIMEOUT_LOGIN_MS = 30_000;

// Estado em memória do processo — Render free tier roda 1 instância só,
// sem necessidade de compartilhar isso entre processos. Login é "lazy" (só
// acontece quando alguém pede a sessão, nunca por cron fixo) — evita logar
// de novo toda hora enquanto o backend está ocioso ou dormindo.
let sessaoCache = null; // { cookie, xsrfToken, obtidaEm }

function validarConfig() {
  const faltando = ["DRONEMGMT_BASE_URL", "DRONEMGMT_FORM_ID", "DRONEMGMT_UNIT_ID", "DRONEMGMT_USUARIO", "DRONEMGMT_SENHA"].filter(
    (nome) => !process.env[nome]
  );
  if (faltando.length) {
    throw new Error(`Variáveis de ambiente faltando: ${faltando.join(", ")}`);
  }
}

// Abre um Chromium headless, loga pela tela normal (SSO redireciona por
// conta própria até o cookie ser gravado) e extrai os cookies de sessão —
// mesma técnica de login_dronemgmt() em atualizar_voos.py.
async function logar() {
  validarConfig();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/portal/flight-consult`, {
      waitUntil: "networkidle",
      timeout: TIMEOUT_LOGIN_MS,
    });
    await page.getByPlaceholder("Digite seu e-mail").fill(USUARIO);
    await page.getByPlaceholder("Digite sua senha").fill(SENHA);
    await page.getByRole("button", { name: "Entrar" }).click();
    // Login passa por vários redirects (SSO -> callback -> app) antes do
    // cookie existir de fato — espera o app autenticado renderizar, não só
    // a URL mudar.
    await page.getByText("Consulta Geral").waitFor({ timeout: TIMEOUT_LOGIN_MS });
    await page.waitForLoadState("networkidle");

    const cookies = await context.cookies();
    const cookiesDm = cookies.filter((c) => c.name.startsWith("DRONEMANAGEMENT-PORTAL"));
    const cookie = cookiesDm.map((c) => `${c.name}=${c.value}`).join("; ");
    const xsrfToken = cookiesDm.find((c) => c.name === "DRONEMANAGEMENT-PORTAL-XSRF-TOKEN")?.value;
    if (!cookie || !xsrfToken) {
      throw new Error("login não retornou cookie/xsrf válidos (usuário/senha incorretos?)");
    }
    return { cookie, xsrfToken };
  } finally {
    await browser.close();
  }
}

async function obterSessao() {
  if (sessaoCache) return sessaoCache;
  const { cookie, xsrfToken } = await logar();
  sessaoCache = { cookie, xsrfToken, obtidaEm: Date.now() };
  return sessaoCache;
}

function invalidarSessao() {
  sessaoCache = null;
}

// Chamada autenticada genérica contra a API do DroneManagement — usada
// tanto pra leitura (GET .../formdata/query) quanto escrita (POST/PUT/
// DELETE .../formdata). Reloga automaticamente 1x se a sessão em cache
// tiver expirado (401/403) — nunca em loop.
export async function chamarApi(caminho, { method = "GET", params, body } = {}) {
  const executar = async (sessao) => {
    const url = new URL(`${BASE_URL}${caminho}`);
    if (params) {
      for (const [chave, valor] of Object.entries(params)) {
        if (valor !== undefined) url.searchParams.set(chave, valor);
      }
    }
    return fetch(url, {
      method,
      headers: {
        "x-requested-with": "XmlHttpRequest",
        locale: "pt-BR",
        unitid: UNIT_ID,
        formid: FORM_ID,
        "x-xsrf-token": sessao.xsrfToken,
        Cookie: sessao.cookie,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let sessao = await obterSessao();
  let resposta = await executar(sessao);
  if (resposta.status === 401 || resposta.status === 403) {
    invalidarSessao();
    sessao = await obterSessao();
    resposta = await executar(sessao);
  }
  return resposta;
}

// Só pra diagnóstico (ver rota temporária GET /admin/dronemgmt/teste-login,
// spike de validação documentado em docs/INTEGRACAO_DRONEMANAGEMENT.md) —
// mede quanto tempo o login sozinho leva, sem nenhuma chamada de API além
// dele. Remover o uso desta função (e a rota) depois de validado.
export async function testarLogin() {
  invalidarSessao(); // sempre mede um login de verdade, não um cache de uma tentativa anterior
  const inicio = Date.now();
  await obterSessao();
  return { duracaoMs: Date.now() - inicio };
}
