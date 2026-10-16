// Login único (2026-10): o Supabase do Hub Geotech é o dono das contas. Aqui
// só se confere um token de login do Hub — o GeoMap não vê senha nenhuma.
const url = () => (process.env.HUB_SUPABASE_URL || "").replace(/\/$/, "");
const chave = () => process.env.HUB_SUPABASE_ANON_KEY || "";

// { id, email, precisaTrocarSenha } ou null se o token não vale.
export async function lerContaHub(accessToken) {
  if (!url() || !chave() || typeof accessToken !== "string" || !accessToken) return null;
  const h = { apikey: chave(), Authorization: `Bearer ${accessToken}` };
  const r = await fetch(`${url()}/auth/v1/user`, { headers: h });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u?.id || !u?.email) return null;
  const p = await fetch(`${url()}/rest/v1/usuarios?id=eq.${encodeURIComponent(u.id)}&select=precisa_trocar_senha`, {
    headers: { ...h, "Accept-Profile": "hub" },
  });
  // Sem a flag não dá pra saber se a senha é provisória: não deixa passar.
  const linhas = p.ok ? await p.json() : null;
  const linha = Array.isArray(linhas) ? linhas[0] : undefined;
  if (!linha) return null;
  return { id: u.id, email: String(u.email).trim().toLowerCase(), precisaTrocarSenha: !!linha.precisa_trocar_senha };
}
