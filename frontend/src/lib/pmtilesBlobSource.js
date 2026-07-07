// Implementa a interface Source da lib `pmtiles` lendo os bytes de um Blob
// já em memória (IndexedDB), em vez de fazer range request HTTP. É o que
// permite o mapa renderizar 100% offline depois do download inicial.
export class BlobSource {
  constructor(key, blob) {
    this.key = key;
    this.blob = blob;
  }

  getKey() {
    return this.key;
  }

  async getBytes(offset, length) {
    const fatia = this.blob.slice(offset, offset + length);
    const data = await fatia.arrayBuffer();
    return { data };
  }
}
