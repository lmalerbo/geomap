import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

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

// Mesma cópia server-side de copiarArquivo, mas SEM engolir erro — usada
// em "duplicar mapa" (ver POST /admin/mapas/:id/duplicar), onde o arquivo
// de origem tem que existir de verdade (é uma duplicação real, não um
// backup tolerante a arquivo já ausente); deixa o erro subir pra virar um
// 500 claro em vez de criar silenciosamente uma camada apontando pra uma
// chave que não existe no bucket.
export async function duplicarArquivo(chaveOrigem, chaveDestino) {
  await r2.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${chaveOrigem}`,
      Key: chaveDestino,
    })
  );
}

// Streaming direto do R2 pela resposta do próprio backend — tentativa
// inicial foi um redirect 302 pra uma URL assinada do R2, mas isso faz o
// navegador falar direto com um domínio diferente (r2.cloudflarestorage.com),
// que precisa da própria política de CORS do bucket configurada certinho;
// mesmo configurada corretamente (confirmado via curl com o header
// Access-Control-Allow-Origin presente), o Chromium seguiu recusando o
// redirect nessa cadeia de 2 domínios (github.io -> onrender.com -> R2) —
// sem uma causa raiz 100% isolada (rede/antivírus local mexendo na conexão
// era a suspeita mais forte), streaming resolve de vez: o navegador só
// fala com o nosso próprio domínio (onrender.com), que já tem CORS aberto
// (app.use(cors()) em app.js) — sem depender de política de CORS de
// terceiro nenhuma.
export async function streamArquivo(chave) {
  return r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: chave }));
}
