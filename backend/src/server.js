import "dotenv/config";
import { app } from "./app.js";

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`GeoMap backend rodando em http://localhost:${port}`);
});
