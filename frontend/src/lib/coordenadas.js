// Coordenada sempre em graus decimais (pedido do Leo): é o formato que
// Google Maps/WhatsApp entendem ao colar.
export function formatarCoordenada({ lat, lng }) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// navigator.clipboard só existe em contexto seguro (HTTPS/localhost);
// fallback com textarea + execCommand para navegadores antigos.
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // cai no fallback
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  return ok;
}
