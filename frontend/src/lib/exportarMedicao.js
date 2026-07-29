import { jsPDF } from "jspdf";

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

function nomeMedicao(modo) {
  return modo === "area" ? "Área medida" : "Distância medida";
}

function nomeArquivoMedicao(nomeMapa, extensao) {
  const agora = new Date();
  const carimbo = agora.toISOString().replace(/[:.]/g, "-");
  return `medicao-${nomeMapa}-${carimbo}.${extensao}`;
}

export function baixarKmlMedicao(pontos, modo, resultado, nomeMapa) {
  const kml = gerarKmlMedicao(pontos, modo, resultado, `${nomeMedicao(modo)} — ${nomeMapa}`);
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivoMedicao(nomeMapa, "kml");
  link.click();
  URL.revokeObjectURL(url);
}

// Relatório de campo em PDF — título, mapa/data/tipo/valor em destaque,
// snapshot do mapa (ver preserveDrawingBuffer em Mapa.jsx, sem isso
// toDataURL() do canvas WebGL volta em branco) e a lista de pontos
// capturados (útil tanto pra conferência quanto como registro bruto caso
// o KML se perca). `imagemMapaDataUrl` é opcional — PDF sem imagem
// (ex: toDataURL falhou por algum motivo) ainda sai completo, só sem a
// seção de mapa.
export function gerarPdfMedicao({ pontos, modo, resultado, nomeMapa, imagemMapaDataUrl }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
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
  doc.text(`Pontos capturados: ${pontos.length}`, 14, y);
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

  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text("Pontos capturados (latitude, longitude)", 14, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor(70);
  for (let i = 0; i < pontos.length; i++) {
    if (y > alturaPagina - 15) {
      doc.addPage();
      y = 18;
    }
    const [lng, lat] = pontos[i];
    doc.text(`${i + 1}. ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 18, y);
    y += 5;
  }

  return doc;
}

export function baixarPdfMedicao(params) {
  const doc = gerarPdfMedicao(params);
  doc.save(nomeArquivoMedicao(params.nomeMapa, "pdf"));
}
