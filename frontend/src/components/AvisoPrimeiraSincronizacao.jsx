// Explica pro usuário por que a primeira sincronização pode demorar (os
// .pmtiles de cada camada costumam ter dezenas de MB, baixados inteiros
// antes de fazerem sentido visualmente) — sem isso, um mapa aparecendo
// "quebrado" (sem rótulo, sem imagem de fundo) enquanto ainda sincroniza
// numa conexão ruim parece bug, quando na real é só carregamento em
// andamento. Mostrado só quando não existe NADA local ainda (nunca
// sincronizou com sucesso nesse dispositivo/navegador) — não é "já vi
// isso uma vez" via localStorage, é o estado real: se o IndexedDB for
// perdido (comum no Safari/iOS, que pode limpar armazenamento por
// inatividade) e precisar sincronizar tudo de novo do zero, o aviso volta
// a fazer sentido e deve reaparecer.
export default function AvisoPrimeiraSincronizacao({ mostrar, aoFechar }) {
  if (!mostrar) return null;
  return (
    <div className="aviso aviso-sincronizacao" role="status">
      <p>
        <strong>Baixando os mapas da sua fazenda pela primeira vez neste aparelho.</strong>{" "}
        Pode levar alguns minutos dependendo da conexão — deixe o app aberto até terminar.
        Depois disso, funciona offline normalmente.
      </p>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar aviso"
        title="Fechar aviso"
      >
        ×
      </button>
    </div>
  );
}
