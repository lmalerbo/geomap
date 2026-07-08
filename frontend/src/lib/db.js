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

export async function salvarMapaBaixado(mapaId, nome, versao, blob, atributosConfig) {
  const db = await abrirDb();
  await db.put(STORE, {
    id: mapaId,
    nome,
    versao,
    blob,
    atributosConfig: atributosConfig || [],
    baixadoEm: new Date().toISOString(),
  });
}

// Atualiza só nome/config de atributos, sem mexer no blob — usado quando o
// catálogo muda algo que não exige rebaixar o .pmtiles (ex: admin reordenou
// os atributos exibidos, mas a geometria continua a mesma).
export async function atualizarMetadadosMapa(mapaId, nome, atributosConfig) {
  const db = await abrirDb();
  const atual = await db.get(STORE, mapaId);
  if (!atual) return;
  await db.put(STORE, { ...atual, nome, atributosConfig: atributosConfig || [] });
}

export async function buscarMapaBaixado(mapaId) {
  const db = await abrirDb();
  return db.get(STORE, mapaId);
}

export async function listarMapasBaixados() {
  const db = await abrirDb();
  return db.getAll(STORE);
}

export async function removerMapaBaixado(mapaId) {
  const db = await abrirDb();
  await db.delete(STORE, mapaId);
}
