import { openDB } from "idb";

const DB_NAME = "geoportal";
const STORE = "mapas_baixados";

function abrirDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: "id" });
    },
  });
}

export async function salvarMapaBaixado(mapaId, nome, blob) {
  const db = await abrirDb();
  await db.put(STORE, { id: mapaId, nome, blob, baixadoEm: new Date().toISOString() });
}

export async function buscarMapaBaixado(mapaId) {
  const db = await abrirDb();
  return db.get(STORE, mapaId);
}

export async function listarMapasBaixados() {
  const db = await abrirDb();
  return db.getAll(STORE);
}
