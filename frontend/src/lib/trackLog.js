// Exportação de percurso (track log) pra KML — não usa nenhuma lib de
// terceiros: o formato precisado aqui é só algumas LineStrings, XML simples
// o bastante pra não valer a pena a dependência (a alternativa mais comum,
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

// `segmentos`: array de segmentos, cada um um array de [lng, lat]
// cronológico (ver pontosPercurso em useTrackLog.js) — pausar/continuar
// gera mais de um segmento. Cada segmento com >=2 pontos vira um
// <Placemark> próprio dentro do mesmo <Document>, em vez de uma única
// LineString — abre no Google Earth/Maps como linhas distintas do mesmo
// percurso, sem depender de MultiGeometry (mais simples e mais compatível
// entre viewers de KML).
export function gerarKmlPercurso(segmentos, nome) {
  const segmentosValidos = segmentos.filter((pontos) => pontos.length >= 2);
  const placemarks = segmentosValidos
    .map((pontos, i) => {
      const coordenadas = pontos.map(([lng, lat]) => `${lng},${lat},0`).join("\n          ");
      const nomeSegmento = segmentosValidos.length > 1 ? `${nome} — Segmento ${i + 1}` : nome;
      return `    <Placemark>
      <name>${escaparXml(nomeSegmento)}</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${coordenadas}
        </coordinates>
      </LineString>
    </Placemark>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escaparXml(nome)}</name>
${placemarks}
  </Document>
</kml>
`;
}

function nomeArquivoPercurso(nomeMapa) {
  const agora = new Date();
  const carimbo = agora.toISOString().replace(/[:.]/g, "-");
  return `percurso-${nomeMapa}-${carimbo}.kml`;
}

// File em vez de só Blob — reusado tanto pelo download (<a download>)
// quanto pelo compartilhamento (Web Share API, que exige File pra anexar).
export function criarArquivoKmlPercurso(segmentos, nomeMapa) {
  const kml = gerarKmlPercurso(segmentos, `Percurso — ${nomeMapa}`);
  return new File([kml], nomeArquivoPercurso(nomeMapa), {
    type: "application/vnd.google-earth.kml+xml",
  });
}

// Dispara o download no navegador (Blob + <a download>, sem servidor
// envolvido — funciona offline, mesmo padrão de "baixar arquivo" client-side
// já usado nesse tipo de fluxo).
export function baixarKmlPercurso(segmentos, nomeMapa) {
  const file = criarArquivoKmlPercurso(segmentos, nomeMapa);
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

// Web Share API (com arquivo anexado) quando o navegador suporta — abre o
// share sheet nativo do SO (WhatsApp, "abrir com" Google Earth, etc.),
// cobrindo tanto "compartilhar" quanto "abrir" num passo só. Sem suporte
// (a maioria dos desktops, navegadores mais antigos, ou o MIME do arquivo
// caindo fora da lista "segura" do navegador — ver comentário abaixo),
// cai pro download de sempre. Devolve o que realmente aconteceu
// ("compartilhado" | "cancelado" | "baixado") — o chamador precisa saber
// diferenciar "abriu a folha de compartilhamento" de "só baixou o
// arquivo", senão parece que o botão não fez nada quando na real ele
// silenciosamente caiu no fallback. Cancelamento do usuário no share
// sheet (AbortError) não é erro — só um `throw` de verdade (outro tipo de
// falha) deve virar mensagem de erro pro chamador.
export async function compartilharKmlPercurso(segmentos, nomeMapa) {
  const nomeArquivo = nomeArquivoPercurso(nomeMapa);
  const kml = gerarKmlPercurso(segmentos, `Percurso — ${nomeMapa}`);
  // Web Share (arquivo) só aceita uma lista restrita de tipos "seguros"
  // por navegador (basicamente imagem/vídeo/áudio/texto) — o MIME KML de
  // verdade (application/vnd.google-earth.kml+xml, usado no download via
  // criarArquivoKmlPercurso) cai fora dessa lista na maioria dos
  // Android/Chrome, fazendo canShare() devolver false silenciosamente
  // mesmo o conteúdo sendo texto puro — é a causa mais provável do botão
  // "Compartilhar" parecer não fazer nada em campo. text/plain entra na
  // categoria aceita; a extensão .kml do NOME do arquivo continua
  // preservada, que é o que o app de destino (Google Earth etc.) usa pra
  // reconhecer o formato, não o MIME declarado aqui.
  const arquivo = new File([kml], nomeArquivo, { type: "text/plain" });
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nomeArquivo, text: `Percurso — ${nomeMapa}` });
      return "compartilhado";
    } catch (erro) {
      if (erro.name === "AbortError") return "cancelado";
      throw erro;
    }
  }
  baixarKmlPercurso(segmentos, nomeMapa);
  return "baixado";
}
