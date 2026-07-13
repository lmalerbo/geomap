// Exportação de percurso (track log) pra KML — não usa nenhuma lib de
// terceiros: o formato precisado aqui é só 1 LineString, XML simples o
// bastante pra não valer a pena a dependência (a alternativa mais comum,
// `tokml`, está sem manutenção há quase 10 anos e arrasta uma cadeia de
// dependências de teste com vulnerabilidades críticas/altas conhecidas —
// ver `npm audit` antes de reconsiderar adicioná-la).

function escaparXml(texto) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// `pontos`: array de [lng, lat] cronológico (ver pontosPercurso em Mapa.jsx).
export function gerarKmlPercurso(pontos, nome) {
  const coordenadas = pontos.map(([lng, lat]) => `${lng},${lat},0`).join("\n          ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escaparXml(nome)}</name>
    <Placemark>
      <name>${escaparXml(nome)}</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${coordenadas}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
`;
}

// Dispara o download no navegador (Blob + <a download>, sem servidor
// envolvido — funciona offline, mesmo padrão de "baixar arquivo" client-side
// já usado nesse tipo de fluxo).
export function baixarKmlPercurso(pontos, nomeMapa) {
  const agora = new Date();
  const carimbo = agora.toISOString().replace(/[:.]/g, "-");
  const nomeArquivo = `percurso-${nomeMapa}-${carimbo}.kml`;
  const kml = gerarKmlPercurso(pontos, `Percurso — ${nomeMapa}`);
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}
