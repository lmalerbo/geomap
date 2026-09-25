import { useState } from "react";
import { ICONES_PREPARO, PALETA_PINS, urlSvgPin, nomeIcone } from "../../lib/iconesPreparo.js";
import { formatarCoordenada } from "../../lib/coordenadas.js";

export default function FormularioPin({ rascunho, aoSalvar, aoCancelar }) {
  const [icone, setIcone] = useState(rascunho.inicial.icone);
  const [cor, setCor] = useState(rascunho.inicial.cor);
  const [titulo, setTitulo] = useState(rascunho.inicial.titulo);
  const [nota, setNota] = useState(rascunho.inicial.nota);
  // Enquanto o usuário não digitar um título próprio, o título acompanha o
  // nome do ícone escolhido.
  const [tituloEditado, setTituloEditado] = useState(Boolean(rascunho.id));
  const [salvando, setSalvando] = useState(false);
  // aoSalvar grava no IndexedDB antes de tentar enviar — pode rejeitar (ex:
  // quota do navegador estourada, modo privado que bloqueia storage). Sem
  // capturar isso, `salvando` ficava true pra sempre (Salvar/Cancelar
  // travados) e o usuário não tinha como saber o que aconteceu nem sair do
  // formulário.
  const [erro, setErro] = useState(null);

  function escolherIcone(chave) {
    setIcone(chave);
    if (!tituloEditado) setTitulo(nomeIcone(chave));
  }

  async function enviar(e) {
    e.preventDefault();
    const t = titulo.trim();
    if (!t) return;
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar({ icone, cor, titulo: t.slice(0, 120), nota: nota.slice(0, 2000) });
    } catch {
      setErro("Não foi possível salvar a anotação neste aparelho. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <aside className="painel-flutuante painel-formulario-pin aberto" aria-label={rascunho.id ? "Editar anotação" : "Nova anotação"}>
      <form onSubmit={enviar}>
        <h2>{rascunho.id ? "Editar anotação" : "Nova anotação"}</h2>
        <p className="coordenada-formulario-pin">
          {formatarCoordenada(rascunho.lngLat)}
          {rascunho.precisao ? ` (GPS ±${rascunho.precisao} m)` : ""}
        </p>

        <fieldset className="grade-icones-pin">
          <legend>Tipo</legend>
          {ICONES_PREPARO.map((i) => (
            <button
              key={i.chave}
              type="button"
              className={`opcao-icone-pin${icone === i.chave ? " selecionado" : ""}`}
              onClick={() => escolherIcone(i.chave)}
              aria-pressed={icone === i.chave}
            >
              <img src={urlSvgPin(i.chave, cor)} alt="" width="28" height="36" />
              <span>{i.nome}</span>
            </button>
          ))}
        </fieldset>

        <fieldset className="paleta-pin">
          <legend>Cor</legend>
          {PALETA_PINS.map((c) => (
            <button
              key={c}
              type="button"
              className={`amostra-cor-pin${cor === c ? " selecionado" : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => setCor(c)}
              aria-label={`Cor ${c}`}
              aria-pressed={cor === c}
            />
          ))}
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} aria-label="Outra cor" />
        </fieldset>

        <label className="campo-pin">
          Título
          <input
            type="text"
            value={titulo}
            maxLength={120}
            required
            onChange={(e) => {
              setTitulo(e.target.value);
              setTituloEditado(true);
            }}
          />
        </label>
        <label className="campo-pin">
          Nota
          <textarea value={nota} maxLength={2000} rows={4} onChange={(e) => setNota(e.target.value)} />
        </label>

        {erro && <p className="erro">{erro}</p>}

        <div className="acoes-pin">
          <button type="button" onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !titulo.trim()}>
            {salvando && <span className="spinner" aria-hidden="true" />} Salvar
          </button>
        </div>
      </form>
    </aside>
  );
}
