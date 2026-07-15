import "dotenv/config";
import { app } from "./app.js";

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`GeoMap backend rodando em http://localhost:${port}`);
});

// Conversão de shapefile grande (ogr2ogr + tippecanoe + geração de rótulos
// + tile-join, tudo síncrono dentro de uma requisição, ver admin.js) pode
// passar dos 5min padrão do Node (server.requestTimeout desde o Node 18) —
// sem isso, uma camada grande derrubaria a conexão no meio da conversão
// mesmo com os binários funcionando direito. Testado contra produção real
// (Render free tier, 0.1 CPU): Talhões completo (~7500 feições) levou
// ~8min só no passo de rótulos (que sozinho já bateu no timeout de 5min
// de cada execFileAsync em admin.js, por isso TIMEOUT_CONVERSAO subiu pra
// 15min lá) — 20min aqui dá folga sobre a soma realista dos passos.
server.requestTimeout = 20 * 60 * 1000;
