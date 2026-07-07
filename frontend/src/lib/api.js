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
