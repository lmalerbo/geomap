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

export async function baixarMapa(token, mapaId) {
  const resp = await fetch(`${API_URL}/mapas/${mapaId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await tratarResposta(resp);
  return resp.blob();
}

// --- Painel de administração ---

export async function listarMapasAdmin(token) {
  const resp = await fetch(`${API_URL}/admin/mapas`, {
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

export async function enviarMapaAdmin(token, { nome, versao, categoria, grupoIds, arquivo }) {
  const dados = new FormData();
  dados.append("nome", nome);
  dados.append("versao", versao);
  dados.append("categoria", categoria);
  dados.append("grupoIds", JSON.stringify(grupoIds));
  dados.append("arquivo", arquivo);

  const resp = await fetch(`${API_URL}/admin/mapas`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: dados,
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

export async function baixarMapaAdmin(token, mapaId) {
  const resp = await fetch(`${API_URL}/admin/mapas/${mapaId}/arquivo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await tratarResposta(resp);
  return resp.blob();
}

export async function buscarConfigAtributos(token, mapaId) {
  const resp = await fetch(`${API_URL}/admin/mapas/${mapaId}/atributos`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  const { atributos } = await resp.json();
  return atributos;
}

export async function salvarConfigAtributos(token, mapaId, atributos) {
  const resp = await fetch(`${API_URL}/admin/mapas/${mapaId}/atributos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ atributos }),
  });
  await tratarResposta(resp);
  const { atributos: salvos } = await resp.json();
  return salvos;
}

export async function renomearMapaAdmin(token, mapaId, nome) {
  const resp = await fetch(`${API_URL}/admin/mapas/${mapaId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome }),
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function buscarConfigEstilo(token, mapaId) {
  const resp = await fetch(`${API_URL}/admin/mapas/${mapaId}/estilo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  const { estilo } = await resp.json();
  return estilo;
}

export async function salvarConfigEstilo(token, mapaId, estilo) {
  const resp = await fetch(`${API_URL}/admin/mapas/${mapaId}/estilo`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ estilo }),
  });
  await tratarResposta(resp);
  const { estilo: salvo } = await resp.json();
  return salvo;
}
