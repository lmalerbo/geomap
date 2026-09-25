// Catálogo fixo de ícones do Mapa do Preparo (anotações/pins) — ver
// docs/superpowers/specs/2026-09-24-mapa-preparo-anotacoes-design.md.
// As chaves precisam bater com backend/src/lib/iconesPreparo.js.
// `desenho` são elementos SVG num viewBox 24×24, traço branco sem
// preenchimento (o estilo de traço vem do <g> em svgPin).
export const ICONES_PREPARO = [
  { chave: "pedra", nome: "Pedra", desenho: '<path d="M4 17.5 6.5 11l4-3.5 5 1.5 3.5 4-1 4.5z"/><path d="M10.5 7.5l1 5 7 1"/>' },
  { chave: "toco", nome: "Toco / raiz", desenho: '<ellipse cx="12" cy="7" rx="4.5" ry="1.8"/><path d="M7.5 7v8M16.5 7v8"/><path d="M7.5 15 4.5 20M16.5 15l3 5M12 16v4M10 15.5l-2 4.5M14 15.5l2 4.5"/>' },
  { chave: "erosao", nome: "Erosão / voçoroca", desenho: '<path d="M3 8h5l4 11 4-11h5"/><path d="M12 3v6M9.5 6.5 12 9l2.5-2.5"/>' },
  { chave: "alagamento", nome: "Área alagada", desenho: '<path d="M3 8c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0"/><path d="M3 13c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0"/><path d="M3 18c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0"/>' },
  { chave: "formigueiro", nome: "Formigueiro", desenho: '<circle cx="12" cy="6.5" r="2"/><ellipse cx="12" cy="11.5" rx="1.8" ry="2.2"/><ellipse cx="12" cy="17.5" rx="2.6" ry="3"/><path d="M10.2 10.5 6 8.5M13.8 10.5 18 8.5M10.2 12.5 6 13.5M13.8 12.5l4.2 1M10.5 15 7 18M13.5 15l3.5 3M11 4.8 9.5 2.5M13 4.8l1.5-2.3"/>' },
  { chave: "cupinzeiro", nome: "Cupinzeiro", desenho: '<path d="M5.5 20c1-6 3-13.5 6.5-16 3.5 2.5 5.5 10 6.5 16z"/><path d="M3 20h18"/><path d="M11 10h2M10 14h4"/>' },
  { chave: "curva_nivel", nome: "Curva de nível danificada", desenho: '<path d="M3 8c2.5-1.8 5-1.8 7.5 0"/><path d="M14.5 8c2.2-1.5 4.4-1.5 6.5 0"/><path d="M11 5.5l1.5 3.5L14 6"/><path d="M3 13.5c6-3 12-3 18 0"/><path d="M3 18.5c6-3 12-3 18 0"/>' },
  { chave: "carreador", nome: "Carreador / estrada", desenho: '<path d="M8.5 3 5 21M15.5 3 19 21"/><path d="M12 4v3M12 10.5v3M12 17v3"/>' },
  { chave: "cerca", nome: "Cerca", desenho: '<path d="M5 5v16M12 5v16M19 5v16"/><path d="M5 5l0-1.5M12 5V3.5M19 5V3.5"/><path d="M3 9.5h18M3 15h18"/>' },
  { chave: "rede_eletrica", nome: "Rede elétrica / poste", desenho: '<path d="M10 3v18M6 21h8"/><path d="M5 6.5h10M6.5 10h7"/><path d="M19 11l-2.5 4h3L17 19.5"/>' },
  { chave: "tubulacao", nome: "Tubulação / irrigação", desenho: '<path d="M3 7h11v4H3z"/><path d="M14 9h3.5a2 2 0 0 1 2 2v1.5"/><path d="M19.5 15.5c-1 1.4-1.6 2.3-1.6 3a1.6 1.6 0 0 0 3.2 0c0-.7-.6-1.6-1.6-3z"/>' },
  { chave: "compactacao", nome: "Compactação do solo", desenho: '<path d="M12 2.5v7M9 6.5l3 3 3-3"/><path d="M3 13h18M3 17h18M3 21h18"/>' },
  { chave: "mato", nome: "Mato / planta daninha", desenho: '<path d="M12 21V11"/><path d="M12 14.5C8 14.5 6 11.5 6 8.5c3 0 6 2 6 6z"/><path d="M12 12c0-4 3-7 6-7 0 4-2 7-6 7z"/><path d="M4 21h16"/>' },
  { chave: "maquina", nome: "Máquina / implemento", desenho: '<circle cx="7" cy="16" r="4"/><circle cx="18" cy="17.5" r="2.5"/><path d="M4 12V6h6l2 6h7v3.5"/><path d="M11 17.5h4.5"/>' },
  { chave: "observacao", nome: "Observação geral", desenho: '<path d="M4 5h16v11H10l-4.5 4v-4H4z"/><path d="M8 9h8M8 12.5h5"/>' },
];

export const ICONE_PADRAO = "observacao";

// 8 cores fortes, legíveis sobre o fundo claro e sobre satélite.
export const PALETA_PINS = ["#16a34a", "#dc2626", "#ea580c", "#ca8a04", "#2563eb", "#7c3aed", "#db2777", "#475569"];

export function nomeIcone(chave) {
  const icone = ICONES_PREPARO.find((i) => i.chave === chave) || ICONES_PREPARO.find((i) => i.chave === ICONE_PADRAO);
  return icone.nome;
}

function desenhoIcone(chave) {
  return (ICONES_PREPARO.find((i) => i.chave === chave) || ICONES_PREPARO.find((i) => i.chave === ICONE_PADRAO)).desenho;
}

// Pin em gota (36×46, ponta embaixo no centro) preenchido com a cor
// escolhida + contorno escuro fino (contraste sobre satélite) +
// pictograma branco dentro da parte redonda.
export function svgPin(chave, cor) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">' +
    `<path d="M18 44.5C18 44.5 3 28.5 3 17a15 15 0 0 1 30 0C33 28.5 18 44.5 18 44.5z" fill="${cor}" stroke="#1f2933" stroke-width="1.5"/>` +
    '<g transform="translate(7 6) scale(0.9167)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    desenhoIcone(chave) +
    "</g></svg>"
  );
}

export function urlSvgPin(chave, cor) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgPin(chave, cor))}`;
}

export function idImagemPin(chave, cor) {
  return `pin-${chave}-${cor.replace("#", "").toLowerCase()}`;
}

function carregarImagem(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Rasteriza cada combinação ícone+cor ainda não registrada e adiciona ao
// MapLibre. Não é SDF (o ícone tem duas cores). Desenha em 2× para ficar
// nítido em telas de alta densidade.
export async function garantirImagensPins(map, pares) {
  const RAZAO = 2;
  const vistos = new Set();
  for (const { icone, cor } of pares) {
    const id = idImagemPin(icone, cor);
    if (vistos.has(id) || map.hasImage(id)) continue;
    vistos.add(id);
    const img = await carregarImagem(urlSvgPin(icone, cor));
    const canvas = document.createElement("canvas");
    canvas.width = 36 * RAZAO;
    canvas.height = 46 * RAZAO;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Re-checa: outra chamada concorrente pode ter registrado no meio.
    if (!map.hasImage(id)) {
      map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: RAZAO });
    }
  }
}
