import { openDB } from "idb";

const DB_NAME = "geoportal";
const STORE_CAMADAS = "mapas_baixados";
const STORE_MAPAS = "mapas_disponiveis";
const STORE_ARQUIVO_IMPORTADO = "arquivo_importado_por_mapa";

function abrirDb() {
  return openDB(DB_NAME, 3, {
    upgrade(db, versaoAnterior) {
      if (versaoAnterior < 1) {
        db.createObjectStore(STORE_CAMADAS, { keyPath: "id" });
      }
      if (versaoAnterior < 2) {
        // Leve (sem blob) — só o necessário pra tela inicial listar os
        // mapas (projetos) permitidos mesmo offline, antes de qualquer um
        // ser aberto.
        db.createObjectStore(STORE_MAPAS, { keyPath: "id" });
      }
      if (versaoAnterior < 3) {
        // KML/Shapefile importado pelo usuário (ver useImportacaoTemporaria)
        // — passou a persistir por mapa, em vez de sumir ao recarregar a
        // página. 1 registro por mapaId (o app só suporta 1 arquivo
        // importado por vez, sempre substituído por uma nova importação).
        db.createObjectStore(STORE_ARQUIVO_IMPORTADO, { keyPath: "mapaId" });
      }
    },
  });
}

export async function salvarMapaBaixado(camadaId, mapaId, nome, versao, blob, atributosConfig, estiloConfig) {
  const db = await abrirDb();
  // Convertido pra ArrayBuffer antes de gravar — Blob guardado direto no
  // IndexedDB sofre de um bug do WebKit/Safari onde o "backing file" se
  // perde silenciosamente (ex: PWA não aberto por um tempo, pressão de
  // armazenamento), fazendo Blob.slice()/arrayBuffer() lançar
  // "NotFoundError: The object can not be found here." em QUALQUER leitura
  // futura, pra qualquer camada — foi esse erro, batendo em toda camada, que
  // quebrava a geometria no iOS. ArrayBuffer é dado binário puro e não tem
  // esse problema (ver BlobSource, que lê esse campo).
  const dados = await blob.arrayBuffer();
  await db.put(STORE_CAMADAS, {
    id: camadaId,
    mapaId,
    nome,
    versao,
    blob: dados,
    atributosConfig: atributosConfig || [],
    estiloConfig: estiloConfig || null,
    baixadoEm: new Date().toISOString(),
  });
}

// Atualiza nome/mapaId/config de atributos/estilo, sem mexer no blob —
// usado quando o catálogo muda algo que não exige rebaixar o .pmtiles (ex:
// admin reordenou os atributos exibidos ou mudou a cor, mas a geometria não
// mudou). Reescreve mapaId sempre (não só nos campos que "parecem" novos):
// um registro salvo antes do campo mapaId existir (versão anterior a
// múltiplos mapas) nunca teria outra chance de ganhar esse valor, já que a
// versao dele pode nunca mudar de novo — sem isso a camada fica escondida
// pra sempre no mapa certo (mapaId undefined não bate com nenhum filtro).
export async function atualizarMetadadosMapa(camadaId, mapaId, nome, atributosConfig, estiloConfig) {
  const db = await abrirDb();
  const atual = await db.get(STORE_CAMADAS, camadaId);
  if (!atual) return;
  await db.put(STORE_CAMADAS, {
    ...atual,
    mapaId,
    nome,
    atributosConfig: atributosConfig || [],
    estiloConfig: estiloConfig || null,
  });
}

export async function listarMapasBaixados() {
  const db = await abrirDb();
  return db.getAll(STORE_CAMADAS);
}

export async function removerMapaBaixado(camadaId) {
  const db = await abrirDb();
  await db.delete(STORE_CAMADAS, camadaId);
}

export async function salvarMapasDisponiveis(mapas) {
  const db = await abrirDb();
  const tx = db.transaction(STORE_MAPAS, "readwrite");
  await tx.store.clear();
  for (const mapa of mapas) {
    await tx.store.put({ id: mapa.id, nome: mapa.nome, descricao: mapa.descricao });
  }
  await tx.done;
}

export async function listarMapasDisponiveis() {
  const db = await abrirDb();
  return db.getAll(STORE_MAPAS);
}

export async function salvarArquivoImportado(mapaId, nome, geojson, visivel) {
  const db = await abrirDb();
  await db.put(STORE_ARQUIVO_IMPORTADO, {
    mapaId,
    nome,
    geojson,
    visivel,
    importadoEm: new Date().toISOString(),
  });
}

export async function buscarArquivoImportado(mapaId) {
  const db = await abrirDb();
  return db.get(STORE_ARQUIVO_IMPORTADO, mapaId);
}

export async function removerArquivoImportado(mapaId) {
  const db = await abrirDb();
  await db.delete(STORE_ARQUIVO_IMPORTADO, mapaId);
}
