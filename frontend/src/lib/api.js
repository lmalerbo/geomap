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
  const resp = await fetch(`${API_URL}/mapas`, {
    headers: { Authorization: `Bearer ${token}` },
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
