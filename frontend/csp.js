// CSP do index.html (ver o comentário em vite.config.js). Fica num módulo à parte para ser testada
// (src/lib/csp.test.js): em 22/10 ela bloqueava o Supabase do Hub e o login digitado falhava.
export function cspContent(command) {
  const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000';
  // *.r2.cloudflarestorage.com — desde que o download de camadas passou a
  // buscar o .pmtiles direto do R2 (URL assinada, ver lib/api.js), em vez
  // de streaming pelo backend, sem isso a própria CSP do app bloqueia essa
  // conexão (confirmado: "Refused to connect because it violates the
  // document's Content Security Policy", não é CORS do bucket).
  const conectaCom = [
    "'self'",
    apiUrl,
    'https://server.arcgisonline.com',
    'https://*.r2.cloudflarestorage.com',
    // Login único (22/10/2026): o login digitado fala direto com o Supabase do Hub.
    process.env.VITE_HUB_SUPABASE_URL || 'https://dpvsivypabmvmrrpgmhc.supabase.co',
  ].join(' ');
  const scriptSrc = command === 'serve' ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  return [
    "default-src 'self'",
    scriptSrc,
    // 'unsafe-inline' necessário porque o app usa muito style={{...}}
    // inline do React (swatches de cor de camada, posicionamento de
    // painéis) — CSP restringe atributo style inline, não só <style>/<link>.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://server.arcgisonline.com",
    "font-src 'self'",
    `connect-src ${conectaCom}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
