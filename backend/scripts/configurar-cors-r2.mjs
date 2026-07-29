// Configura a política de CORS do bucket R2 pra aceitar GET direto do
// navegador (github.io em produção, localhost em dev) — necessário desde
// que o download de camadas passou a devolver uma URL assinada (o
// navegador busca o arquivo direto do R2, não mais via streaming pelo
// Render, ver storage.js/mapas.js). Roda uma vez só (ou de novo, se o
// bucket ou os domínios mudarem — idempotente, sempre sobrescreve a
// política inteira).
//
// Uso: node scripts/configurar-cors-r2.mjs (a partir de backend/, com as
// variáveis R2_* já carregadas no ambiente/.env).
import "dotenv/config";
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

const ORIGENS_PERMITIDAS = [
  "https://lmalerbo.github.io",
  "http://localhost:5173",
  "http://localhost:4173", // vite preview
];

async function main() {
  await r2.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ORIGENS_PERMITIDAS,
            AllowedMethods: ["GET", "HEAD"],
            AllowedHeaders: ["*"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );
  console.log("CORS configurado no bucket", BUCKET, "pras origens:", ORIGENS_PERMITIDAS);

  const atual = await r2.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.log("Confirmado, política atual:", JSON.stringify(atual.CORSRules, null, 2));
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
