import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 é compatível com a API S3 (mesmo SDK oficial da AWS, só
// apontando o endpoint pro R2) — arquivos publicados (.pmtiles) vivem
// aqui em vez de disco local: um host free-tier (Render) não garante
// disco persistente entre deploys/restarts, diferente do PC/dev local
// (STORAGE_DIR) que sempre teve isso de graça.
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

export async function salvarArquivo(chave, buffer) {
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: chave, Body: buffer }));
}

// Best-effort — mesmo comportamento de antes (fs.unlink com .catch(() => {})),
// nunca derruba a rota chamadora por causa de limpeza de arquivo.
export async function apagarArquivo(chave) {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: chave })).catch(() => {});
}

// Cópia server-side (sem baixar/reenviar) — usada pra manter o backup
// leve de versão anterior antes de sobrescrever (".bak-<timestamp>"),
// mesma ideia que já existia com fs.rename no disco local.
export async function copiarArquivo(chaveOrigem, chaveDestino) {
  await r2
    .send(
      new CopyObjectCommand({
        Bucket: BUCKET,
        CopySource: `${BUCKET}/${chaveOrigem}`,
        Key: chaveDestino,
      })
    )
    .catch(() => {}); // se o arquivo antigo já não existir, segue o baile (mesma tolerância de antes)
}

// URL assinada de download, expira em poucos minutos — o cliente
// (fetch/navegador) é redirecionado pra ela em vez do backend fazer
// streaming do arquivo, offloadando o tráfego pro R2 direto.
export async function urlDownloadAssinada(chave, nomeParaDownload) {
  const comando = new GetObjectCommand({
    Bucket: BUCKET,
    Key: chave,
    ResponseContentDisposition: nomeParaDownload
      ? `attachment; filename="${nomeParaDownload}"`
      : undefined,
  });
  return getSignedUrl(r2, comando, { expiresIn: 300 });
}
