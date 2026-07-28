// Links diretos pra abrir um ponto marcado no mapa em apps de navegação
// externos — sem depender de rede viária/roteamento próprio (esse app fica
// só com "aqui está o ponto exato"), cada um usa o esquema de URL público
// do respectivo app (abre o app instalado se houver, senão a versão web).
export function linkGoogleMaps(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function linkWaze(lat, lng) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function linkAppleMaps(lat, lng) {
  return `https://maps.apple.com/?ll=${lat},${lng}`;
}

// Web Share API (share sheet nativo do SO) — mesmo contrato de retorno já
// usado em trackLog.js:compartilharKmlPercurso ("compartilhado"/"cancelado"),
// pra distinguir o usuário cancelar o share sheet de um erro de verdade.
// Sem File nenhum aqui (só título/texto/url), então não tem a limitação de
// MIME que afeta o compartilhamento de KML — url simples é aceita por
// qualquer navegador com suporte a navigator.share.
export async function compartilharLocalizacao(lat, lng, titulo) {
  try {
    await navigator.share({ title: titulo, text: titulo, url: linkGoogleMaps(lat, lng) });
    return "compartilhado";
  } catch (erro) {
    if (erro.name === "AbortError") return "cancelado";
    throw erro;
  }
}
