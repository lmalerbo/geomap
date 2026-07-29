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

// URL assinada (expira em minutos) pro navegador baixar o arquivo DIRETO
// do R2, sem os bytes passarem pelo Render — a única banda que o Render
// gasta agora é a resposta JSON minúscula com essa URL, não o .pmtiles
// inteiro (que pode ter dezenas de MB). Isso importa de verdade: o plano
// free do Render cortou a banda incluída de 100GB/mês pra 5GB/mês em
// 2026-04, e servir os arquivos de mapa por ele estourava essa cota
// rápido com uso normal (workspace inteiro fica suspenso até o mês virar
// quando estoura, sem opção gratuita de desbloquear na hora).
//
// Uma tentativa anterior desse MESMO objetivo (redirect 302 pra uma URL
// assinada) não funcionou — o Chromium recusava o redirect numa cadeia de
// 2 domínios (github.io -> onrender.com -> R2) mesmo com CORS do bucket
// configurado certinho (confirmado via curl). A diferença aqui: em vez de
// redirect (o navegador segue automaticamente, dentro da MESMA requisição
// de rede), o backend devolve a URL como JSON e o FRONTEND faz uma
// segunda requisição própria pra ela — é um fetch CORS normal de 1 salto
// só (github.io -> R2 direto), não uma cadeia de redirect entre domínios,
// que é o tipo de CORS que os navegadores lidam bem.
export async function gerarUrlAssinada(chave, expiraEmSegundos = 300) {
  const comando = new GetObjectCommand({ Bucket: BUCKET, Key: chave });
  return getSignedUrl(r2, comando, { expiresIn: expiraEmSegundos });
}
