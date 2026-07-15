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
// mesmo com os binários funcionando direito.
server.requestTimeout = 10 * 60 * 1000;
