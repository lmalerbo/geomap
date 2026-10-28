import { Progresso } from "./movimento/index.js";
import { textosProgressoSync } from "../lib/progressoSync.js";

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
// `progresso`: retrato de lib/progressoSync.js (null enquanto o catálogo
// ainda não chegou e não se sabe o que baixar).
export default function AvisoPrimeiraSincronizacao({ mostrar, progresso, aoFechar }) {
  if (!mostrar) return null;
  const p = progresso
    ? textosProgressoSync(progresso)
    : { texto: "Conferindo os mapas…", estado: "enviando", valor: 0, total: 1, detalhe: "" };

  return (
    <div className="aviso-sincronizacao" role="status">
      <strong>Baixando os mapas da sua fazenda pela primeira vez neste aparelho</strong>
      <Progresso valor={p.valor} total={p.total} texto={p.texto} estado={p.estado} detalhe={p.detalhe} />
      <p>Deixe o app aberto até terminar. Depois disso, funciona sem internet.</p>
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
