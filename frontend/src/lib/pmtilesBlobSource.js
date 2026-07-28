// Implementa a interface Source da lib `pmtiles` lendo os bytes de um dado
// já em memória (IndexedDB), em vez de fazer range request HTTP. É o que
// permite o mapa renderizar 100% offline depois do download inicial.
//
// Aceita tanto ArrayBuffer quanto Blob: quem lê do IndexedDB (Mapa.jsx) já
// guarda ArrayBuffer (ver db.js) — Blob (ainda aceito aqui pro caso de dado
// recém-baixado da rede, ex: AdminCamadas.jsx) sofre de um bug conhecido do
// WebKit/Safari onde um Blob retirado do IndexedDB perde o "backing file" e
// QUALQUER leitura (.slice()/.arrayBuffer()) lança
// "NotFoundError: The object can not be found here." — foi exatamente esse
// erro, repetido em toda camada, que quebrava a geometria no iOS. ArrayBuffer
// é dado binário puro, sem essa semântica de arquivo, e não sofre do bug.
export class BlobSource {
  constructor(key, dados) {
    this.key = key;
    this.bufferPromise = dados instanceof ArrayBuffer ? Promise.resolve(dados) : dados.arrayBuffer();
  }

  getKey() {
    return this.key;
  }

  async getBytes(offset, length) {
    const buffer = await this.bufferPromise;
    const data = buffer.slice(offset, offset + length);
    return { data };
  }
}
