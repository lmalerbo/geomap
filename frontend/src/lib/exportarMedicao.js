import { jsPDF } from "jspdf";
import { zipSync, strToU8 } from "fflate";

// Paleta do próprio app (index.css :root) — replicada aqui como RGB
// porque jsPDF trabalha com componentes numéricos, não var(--...).
const COR_ACCENT = [44, 107, 71]; // --accent #2c6b47
const COR_ACCENT_BG = [234, 243, 238]; // mesmo tom da badge --papel-admin (#eaf3ee)
const COR_TEXTO = [31, 41, 51]; // --text #1f2933
const COR_TEXTO_MUTED = [82, 96, 109]; // --text-muted #52606d
const COR_FUNDO_CARD = [247, 249, 250]; // --bg #f7f9fa
const COR_BORDA = [217, 226, 230]; // --border #d9e2e6

// Mesma justificativa de não usar `tokml` já registrada em trackLog.js —
// o formato aqui é só 1 geometria (linha ou polígono fechado), não vale a
// dependência.
function escaparXml(texto) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function coordenadasKml(pontos) {
  return pontos.map(([lng, lat]) => `${lng},${lat},0`).join(" ");
}

// `modo`: "distancia" (LineString) | "area" (Polygon fechado — o próprio
// KML exige o primeiro/último ponto iguais, diferente do preview no mapa
// que só fecha visualmente via geojsonMedicao).
export function gerarKmlMedicao(pontos, modo, resultado, nome) {
  const geometria =
    modo === "area"
      ? `<Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <tessellate>1</tessellate>
            <coordinates>${coordenadasKml([...pontos, pontos[0]])}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>`
      : `<LineString>
        <tessellate>1</tessellate>
        <coordinates>${coordenadasKml(pontos)}</coordinates>
      </LineString>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escaparXml(nome)}</name>
    <Placemark>
      <name>${escaparXml(nome)}</name>
      <description>${escaparXml(resultado)}</description>
      ${geometria}
    </Placemark>
  </Document>
</kml>
`;
}

// CSV das coordenadas capturadas — separado do PDF de propósito (ver
// gerarPdfMedicao): um trajeto/perímetro com muitos pontos (testado com
// 131) deixava o relatório com várias páginas de números que ninguém lê
// no papel, e não servia pra nada ali. Ponto a ponto bruto é dado de
// planilha, não de relatório.
export function gerarCsvMedicao(pontos) {
  const linhas = ["indice,latitude,longitude"];
  pontos.forEach(([lng, lat], i) => {
    linhas.push(`${i + 1},${lat.toFixed(6)},${lng.toFixed(6)}`);
  });
  return linhas.join("\n") + "\n";
}

function nomeMedicao(modo) {
  return modo === "area" ? "Área medida" : "Distância medida";
}

function nomeArquivoMedicao(nomeMapa, extensao) {
  const agora = new Date();
  const carimbo = agora.toISOString().replace(/[:.]/g, "-");
  return `medicao-${nomeMapa}-${carimbo}.${extensao}`;
}

// Encaixa a imagem dentro de uma caixa (largMax x altMax) preservando a
// proporção real do canvas capturado — "contain", não "stretch". Antes a
// imagem sempre saía esticada/achatada pra proporção da caixa fixa
// (~1.9:1), o que distorcia bastante numa captura em retrato (celular).
function dimensoesContidas(larguraReal, alturaReal, largMax, altMax) {
  const proporcao = larguraReal / alturaReal;
  let largura = largMax;
  let altura = largura / proporcao;
  if (altura > altMax) {
    altura = altMax;
    largura = altura * proporcao;
  }
  return { largura, altura };
}

function linhaInfo(doc, label, valor, x, y) {
  doc.setFont(undefined, "bold");
  doc.setTextColor(...COR_TEXTO_MUTED);
  doc.text(label, x, y);
  const larguraLabel = doc.getTextWidth(label);
  doc.setFont(undefined, "normal");
  doc.setTextColor(...COR_TEXTO);
  doc.text(valor, x + larguraLabel + 2, y);
}

// Relatório de campo em PDF — cabeçalho colorido (identidade visual do
// app), cartão com os dados da medição, valor medido em destaque e o
// snapshot do mapa (ver preserveDrawingBuffer em Mapa.jsx, sem isso
// toDataURL() do canvas WebGL volta em preto sólido) contido sem esticar.
// Sem a lista de pontos (ver gerarCsvMedicao) — o PDF é pra ler/imprimir,
// não pra carregar dado bruto. `imagemMapa` é opcional — PDF sem ela (ex:
// toDataURL falhou por algum motivo) ainda sai completo, só sem essa seção.
export function gerarPdfMedicao({ pontos, modo, resultado, nomeMapa, imagemMapa }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margem = 14;
  const larguraUtil = largura - margem * 2;

  // Cabeçalho
  doc.setFillColor(...COR_ACCENT);
  doc.rect(0, 0, largura, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont(undefined, "bold");
  doc.text("GeoMap", margem, 13);
  doc.setFontSize(10.5);
  doc.setFont(undefined, "normal");
  doc.text("Relatório de Medição em Campo", margem, 20);

  let y = 40;

  // Cartão de informações
  const agora = new Date();
  const linhasInfo = [
    ["Mapa:", nomeMapa],
    ["Data:", `${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR")}`],
    ["Tipo de medição:", modo === "area" ? "Área" : "Distância percorrida"],
    ["Pontos capturados:", `${pontos.length} (lista completa em coordenadas.csv, dentro do zip)`],
  ];
  const alturaCard = linhasInfo.length * 6.5 + 10;
  doc.setFillColor(...COR_FUNDO_CARD);
  doc.setDrawColor(...COR_BORDA);
  doc.roundedRect(margem, y, larguraUtil, alturaCard, 2, 2, "FD");
  doc.setFontSize(10.5);
  let yInfo = y + 9;
  for (const [label, valor] of linhasInfo) {
    linhaInfo(doc, label, valor, margem + 6, yInfo);
    yInfo += 6.5;
  }
  y += alturaCard + 8;

  // Valor medido em destaque
  const alturaResultado = 20;
  doc.setFillColor(...COR_ACCENT_BG);
  doc.roundedRect(margem, y, larguraUtil, alturaResultado, 2, 2, "F");
  doc.setTextColor(...COR_ACCENT);
  doc.setFont(undefined, "bold");
  doc.setFontSize(22);
  doc.text(resultado, margem + 6, y + 14);
  doc.setFont(undefined, "normal");
  y += alturaResultado + 10;

  // Snapshot do mapa — contido dentro da largura útil sem esticar
  // (ver dimensoesContidas), com uma borda fina delimitando a imagem.
  if (imagemMapa?.dataUrl) {
    const alturaMaximaImagem = 100;
    const { largura: largImg, altura: altImg } = dimensoesContidas(
      imagemMapa.largura,
      imagemMapa.altura,
      larguraUtil,
      alturaMaximaImagem
    );
    doc.addImage(imagemMapa.dataUrl, "JPEG", margem, y, largImg, altImg);
    doc.setDrawColor(...COR_BORDA);
    doc.rect(margem, y, largImg, altImg);
    y += altImg + 8;
  }

  // Rodapé — linha fina + identificação, mesma posição em toda página.
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COR_BORDA);
    doc.line(margem, altura - 14, largura - margem, altura - 14);
    doc.setFontSize(8.5);
    doc.setTextColor(...COR_TEXTO_MUTED);
    doc.text("Gerado automaticamente pelo GeoMap", margem, altura - 9);
    doc.text(`Página ${p} de ${totalPaginas}`, largura - margem, altura - 9, { align: "right" });
  }

  return doc;
}

// Zip com os 3 arquivos — relatório em PDF, geometria em KML e as
// coordenadas cruas em CSV — pra baixar tudo de uma vez com 1 clique só,
// em vez do usuário ter que exportar cada formato separado. zipSync do
// `fflate` (já era dependência transitiva do jsPDF/pmtiles, sem lib nova
// de verdade adicionada só pra isso).
export function gerarZipMedicao({ pontos, modo, resultado, nomeMapa, imagemMapa }) {
  const nomeCompleto = `${nomeMedicao(modo)} — ${nomeMapa}`;
  const doc = gerarPdfMedicao({ pontos, modo, resultado, nomeMapa, imagemMapa });
  const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
  const kml = gerarKmlMedicao(pontos, modo, resultado, nomeCompleto);
  const csv = gerarCsvMedicao(pontos);

  return zipSync({
    "relatorio.pdf": pdfBytes,
    "medicao.kml": strToU8(kml),
    "coordenadas.csv": strToU8(csv),
  });
}

export function baixarZipMedicao(params) {
  const zip = gerarZipMedicao(params);
  const blob = new Blob([zip], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivoMedicao(params.nomeMapa, "zip");
  link.click();
  URL.revokeObjectURL(url);
}
