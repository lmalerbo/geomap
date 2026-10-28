import { useState } from "react";
import { hojeLocal, resumirPlanejamento, tituloDia } from "../lib/planejamentoVoo.js";

function formatarHa(valor) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

// Números do resumo (hectares, tipos, fazendas) — mesmas linhas no cartão
// de um planejamento salvo e na prévia de um rascunho.
function Resumo({ resumo }) {
  if (resumo.qtdTalhoes === 0) return <p>Nenhum talhão pendente nesta área</p>;
  return (
    <>
      <p>
        {formatarHa(resumo.hectares)} ha · {resumo.qtdTalhoes}{" "}
        {resumo.qtdTalhoes === 1 ? "talhão pendente" : "talhões pendentes"}
      </p>
      <p>{resumo.porTipo.map((t) => `${t.sigla} ${formatarHa(t.hectares)} ha`).join(" · ")}</p>
      <ul>
        {resumo.porFazenda.map((f) => (
          <li key={f.secao}>
            {f.fazenda} — {formatarHa(f.hectares)} ha — {f.siglas.join(" ")}
          </li>
        ))}
      </ul>
    </>
  );
}

// Rascunho de um planejamento novo (ver usePlanejamentos.abrirRascunho). A
// data fica local ao cartão; a key vem do id do rascunho, então um rascunho
// novo começa com a data sugerida.
function ConteudoRascunho({ rascunho, pendentes, aoSalvar, aoCancelar }) {
  const [data, setData] = useState(rascunho.data);
  const resumo = rascunho.carregando ? null : resumirPlanejamento(rascunho.talhoes, pendentes);
  return (
    <>
      <h2>Novo planejamento</h2>
      <label>
        Data{" "}
        <input
          type="date"
          min={hojeLocal()}
          value={data}
          disabled={rascunho.salvando}
          onChange={(e) => setData(e.target.value)}
        />
      </label>
      {rascunho.carregando && <p>Carregando talhões…</p>}
      {resumo && <Resumo resumo={resumo} />}
      {resumo && (
        <p>
          {rascunho.talhoes.length === 1 ? "1 talhão na área" : `${rascunho.talhoes.length} talhões na área`}
        </p>
      )}
      {rascunho.semRotulos && (
        <p className="erro">Esta camada de voos não tem rótulos; publique de novo pelo pipeline</p>
      )}
      {rascunho.erro && <p className="erro">{rascunho.erro}</p>}
      <div>
        <button type="button" className="botao-acao-secundario" onClick={aoCancelar} disabled={rascunho.salvando}>
          Cancelar
        </button>{" "}
        <button
          type="button"
          className="botao-acao-primario"
          onClick={() => aoSalvar(data)}
          disabled={rascunho.carregando || rascunho.salvando || rascunho.semRotulos || !data}
        >
          {rascunho.salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </>
  );
}

// Ações do admin sobre um planejamento salvo: alterar a data e apagar.
function AcoesAdmin({ planejamento, aoAlterarData, aoApagar }) {
  const [alterando, setAlterando] = useState(false);
  const [novaData, setNovaData] = useState(planejamento.data);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);

  async function salvarData() {
    setOcupado(true);
    setErro(null);
    try {
      await aoAlterarData(planejamento.id, novaData);
      setAlterando(false);
    } catch (err) {
      setErro(err.message || "Não foi possível alterar a data");
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    if (!window.confirm(`Apagar o planejamento de ${tituloDia(planejamento.data)}?`)) return;
    setOcupado(true);
    setErro(null);
    try {
      await aoApagar(planejamento.id);
    } catch (err) {
      setErro(err.message || "Não foi possível apagar o planejamento");
      setOcupado(false);
    }
  }

  return (
    <div>
      {alterando ? (
        <>
          <input type="date" min={hojeLocal()} value={novaData} disabled={ocupado} onChange={(e) => setNovaData(e.target.value)} />{" "}
          <button type="button" className="botao-acao-primario" onClick={salvarData} disabled={ocupado || !novaData}>
            Salvar data
          </button>{" "}
          <button type="button" className="botao-acao-secundario" onClick={() => setAlterando(false)} disabled={ocupado}>
            Cancelar
          </button>
        </>
      ) : (
        <>
          <button type="button" className="botao-acao-secundario" onClick={() => setAlterando(true)} disabled={ocupado}>
            Alterar data
          </button>{" "}
          <button type="button" className="botao-acao-perigo" onClick={apagar} disabled={ocupado}>
            Apagar
          </button>
        </>
      )}
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}

// Cartão do polígono de planejamento de voo (ver usePlanejamentos). Mesma
// moldura do painel de atributos. Os números são calculados aqui, a partir
// dos talhões guardados no polígono e das pendências do aparelho. Com
// `rascunho`, mostra o formulário de um planejamento novo no lugar.
export default function CartaoPlanejamento({
  planejamento,
  pendentes,
  aoFechar,
  rascunho,
  ehAdmin,
  aoSalvarRascunho,
  aoCancelarRascunho,
  aoAlterarData,
  aoApagar,
}) {
  const aberto = Boolean(rascunho || planejamento);
  const resumo = !rascunho && planejamento ? resumirPlanejamento(planejamento.talhoes, pendentes) : null;
  return (
    <aside className={`painel-flutuante painel-atributos painel-planejamento${aberto ? " aberto" : ""}`}>
      {rascunho ? (
        <ConteudoRascunho
          key={rascunho.id}
          rascunho={rascunho}
          pendentes={pendentes}
          aoSalvar={aoSalvarRascunho}
          aoCancelar={aoCancelarRascunho}
        />
      ) : (
        planejamento &&
        resumo && (
          <>
            <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar" title="Fechar">
              ×
            </button>
            <h2>{tituloDia(planejamento.data)}</h2>
            <Resumo resumo={resumo} />
            {ehAdmin && (
              <AcoesAdmin
                key={planejamento.id}
                planejamento={planejamento}
                aoAlterarData={aoAlterarData}
                aoApagar={aoApagar}
              />
            )}
          </>
        )
      )}
    </aside>
  );
}
