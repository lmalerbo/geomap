import { jsPDF } from "jspdf";
import { zipSync, strToU8 } from "fflate";

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

// Relatório de campo em PDF — título, mapa/data/tipo/valor em destaque e
// snapshot do mapa (ver preserveDrawingBuffer em Mapa.jsx, sem isso
// toDataURL() do canvas WebGL volta em preto sólido). Sem a lista de
// pontos (ver gerarCsvMedicao) — o PDF é pra ler/imprimir, não pra
// carregar dado bruto; `imagemMapaDataUrl` é opcional, PDF sem imagem
// (ex: toDataURL falhou por algum motivo) ainda sai completo, só sem a
// seção de mapa.
export function gerarPdfMedicao({ pontos, modo, resultado, nomeMapa, imagemMapaDataUrl }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text("GeoMap — Relatório de Medição em Campo", 14, y);
  y += 10;

  doc.setFontSize(11);
  doc.setTextColor(90);
  const agora = new Date();
  doc.text(`Mapa: ${nomeMapa}`, 14, y);
  y += 6;
  doc.text(`Data: ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR")}`, 14, y);
  y += 6;
  doc.text(`Tipo de medição: ${modo === "area" ? "Área" : "Distância percorrida"}`, 14, y);
  y += 6;
  doc.text(`Pontos capturados: ${pontos.length} (lista completa no coordenadas.csv, dentro do zip)`, 14, y);
  y += 12;

  doc.setTextColor(20);
  doc.setFontSize(24);
  doc.text(resultado, 14, y);
  y += 12;

  if (imagemMapaDataUrl) {
    const alturaImagem = 95;
    doc.addImage(imagemMapaDataUrl, "JPEG", 14, y, largura - 28, alturaImagem);
    y += alturaImagem + 10;
  }

  return doc;
}

// Zip com os 3 arquivos — relatório em PDF, geometria em KML e as
// coordenadas cruas em CSV — pra baixar tudo de uma vez com 1 clique só,
// em vez do usuário ter que exportar cada formato separado. zipSync do
// `fflate` (já era dependência transitiva do jsPDF/pmtiles, sem lib nova
// de verdade adicionada só pra isso).
export function gerarZipMedicao({ pontos, modo, resultado, nomeMapa, imagemMapaDataUrl }) {
  const nomeCompleto = `${nomeMedicao(modo)} — ${nomeMapa}`;
  const doc = gerarPdfMedicao({ pontos, modo, resultado, nomeMapa, imagemMapaDataUrl });
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
