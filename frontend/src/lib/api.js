const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function tratarResposta(resp) {
  if (!resp.ok) {
    const corpo = await resp.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro HTTP ${resp.status}`);
  }
  return resp;
}

export async function login(email, senha) {
  const resp = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  await tratarResposta(resp);
  return resp.json();
}

// Retorna os mapas (projetos) permitidos, cada um já com o array de
// camadas aninhado — ver GET /mapas no backend.
export async function buscarCatalogo(token) {
  // no-store: o catálogo (nome/atributos/estilo) pode mudar a qualquer
  // sync via painel de admin, mesmo sem bumpar a versão do .pmtiles — não
  // pode arriscar servir uma resposta antiga do cache HTTP do navegador.
  const resp = await fetch(`${API_URL}/mapas`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function baixarCamada(token, camadaId) {
  const resp = await fetch(`${API_URL}/camadas/${camadaId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await tratarResposta(resp);
  return resp.blob();
}

// --- Painel de administração: mapas (projetos) ---

export async function listarMapasAdmin(token) {
  const resp = await fetch(`${API_URL}/admin/mapas`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function criarMapaAdmin(token, { nome, descricao, grupoIds }) {
  const resp = await fetch(`${API_URL}/admin/mapas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome, descricao, grupoIds }),
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function atualizarMapaAdmin(token, mapaId, { nome, descricao, grupoIds }) {
  const resp = await fetch(`${API_URL}/admin/mapas/${mapaId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome, descricao, grupoIds }),
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function removerMapaAdmin(token, mapaId) {
  const resp = await fetch(`${API_URL}/admin/mapas/${mapaId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await tratarResposta(resp);
  return resp.json();
}

// Cria uma cópia completa do mapa (mesmos grupos com acesso, cada camada
// duplicada com arquivo incluso via cópia server-side no R2) — pode
// demorar alguns segundos a mais que as outras ações se o mapa tiver
// várias camadas.
export async function duplicarMapaAdmin(token, mapaId) {
  const resp = await fetch(`${API_URL}/admin/mapas/${mapaId}/duplicar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  await tratarResposta(resp);
  return resp.json();
}

// --- Painel de administração: grupos ---

export async function criarGrupoAdmin(token, nome) {
  const resp = await fetch(`${API_URL}/admin/grupos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome }),
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function renomearGrupoAdmin(token, grupoId, nome) {
  const resp = await fetch(`${API_URL}/admin/grupos/${grupoId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome }),
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function removerGrupoAdmin(token, grupoId) {
  const resp = await fetch(`${API_URL}/admin/grupos/${grupoId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await tratarResposta(resp);
  return resp.json();
}

// --- Painel de administração: usuários ---

export async function listarUsuariosAdmin(token) {
  const resp = await fetch(`${API_URL}/admin/usuarios`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function criarUsuarioAdmin(token, { nome, email, senha, departamento, papel, grupoIds }) {
  const resp = await fetch(`${API_URL}/admin/usuarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome, email, senha, departamento, papel, grupoIds }),
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function atualizarUsuarioAdmin(token, usuarioId, { nome, departamento, papel, status, grupoIds }) {
  const resp = await fetch(`${API_URL}/admin/usuarios/${usuarioId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome, departamento, papel, status, grupoIds }),
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function redefinirSenhaUsuarioAdmin(token, usuarioId, senha) {
  const resp = await fetch(`${API_URL}/admin/usuarios/${usuarioId}/senha`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ senha }),
  });
  await tratarResposta(resp);
  return resp.json();
}

// --- Painel de administração: camadas (arquivos .pmtiles dentro de um mapa) ---

export async function listarCamadasAdmin(token) {
  const resp = await fetch(`${API_URL}/admin/camadas`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function listarGruposAdmin(token) {
  const resp = await fetch(`${API_URL}/admin/grupos`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  return resp.json();
}

// Decide o campo multipart certo pra um ou mais arquivos selecionados: um
// único .pmtiles vai no campo "arquivo" (como sempre foi); qualquer outra
// seleção (1+ arquivos soltos do shapefile: .shp/.dbf/.shx/.prj/.cpg/.qmd,
// sem precisar zipar) vai no campo "arquivos" (plural) — ver
// backend/src/routes/admin.js.
function anexarArquivos(dados, arquivos) {
  if (arquivos.length === 1 && arquivos[0].name.toLowerCase().endsWith(".pmtiles")) {
    dados.append("arquivo", arquivos[0]);
  } else {
    for (const arquivo of arquivos) dados.append("arquivos", arquivo);
  }
}

export async function enviarCamadaAdmin(token, { nome, versao, categoria, mapaId, arquivos }) {
  const dados = new FormData();
  dados.append("nome", nome);
  dados.append("versao", versao);
  dados.append("categoria", categoria);
  dados.append("mapaId", mapaId);
  anexarArquivos(dados, arquivos);

  const resp = await fetch(`${API_URL}/admin/camadas`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: dados,
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function atualizarArquivoCamadaAdmin(token, camadaId, { versao, arquivos }) {
  const dados = new FormData();
  dados.append("versao", versao);
  anexarArquivos(dados, arquivos);

  const resp = await fetch(`${API_URL}/admin/camadas/${camadaId}/arquivo`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: dados,
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function removerCamadaAdmin(token, camadaId) {
  const resp = await fetch(`${API_URL}/admin/camadas/${camadaId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function baixarCamadaAdmin(token, camadaId) {
  const resp = await fetch(`${API_URL}/admin/camadas/${camadaId}/arquivo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await tratarResposta(resp);
  return resp.blob();
}

export async function buscarConfigAtributos(token, camadaId) {
  const resp = await fetch(`${API_URL}/admin/camadas/${camadaId}/atributos`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  const { atributos } = await resp.json();
  return atributos;
}

export async function salvarConfigAtributos(token, camadaId, atributos) {
  const resp = await fetch(`${API_URL}/admin/camadas/${camadaId}/atributos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ atributos }),
  });
  await tratarResposta(resp);
  const { atributos: salvos } = await resp.json();
  return salvos;
}

export async function renomearCamadaAdmin(token, camadaId, nome) {
  const resp = await fetch(`${API_URL}/admin/camadas/${camadaId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome }),
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function buscarEstatisticasAdmin(token) {
  const resp = await fetch(`${API_URL}/admin/estatisticas`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function buscarConfigEstilo(token, camadaId) {
  const resp = await fetch(`${API_URL}/admin/camadas/${camadaId}/estilo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  const { estilo } = await resp.json();
  return estilo;
}

export async function salvarConfigEstilo(token, camadaId, estilo) {
  const resp = await fetch(`${API_URL}/admin/camadas/${camadaId}/estilo`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ estilo }),
  });
  await tratarResposta(resp);
  const { estilo: salvo } = await resp.json();
  return salvo;
}
