import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PMTiles } from "pmtiles";
import {
  listarMapasAdmin,
  baixarMapaAdmin,
  buscarConfigAtributos,
  salvarConfigAtributos,
} from "../lib/api.js";
import { BlobSource } from "../lib/pmtilesBlobSource.js";
import { useAuth } from "../context/AuthContext.jsx";

const CAMADA_ROTULOS = "rotulos";

// Junta os campos disponíveis no .pmtiles (fonte da verdade dos nomes) com
// a config já salva (visibilidade/ordem) — campo novo entra visível no
// fim; campo que a config lembrava mas sumiu do dado é descartado.
function mesclarConfig(campos, salvos) {
  const porCampo = new Map(salvos.map((s) => [s.campo, s]));
  const ordenados = [...salvos].sort((a, b) => a.ordem - b.ordem).map((s) => s.campo);
  const restantes = campos.filter((c) => !porCampo.has(c));
  return [...ordenados, ...restantes]
    .filter((campo) => campos.includes(campo))
    .map((campo) => ({ campo, visivel: porCampo.get(campo)?.visivel ?? true }));
}

export default function AdminAtributos() {
  const { sessao } = useAuth();
  const [mapas, setMapas] = useState([]);
  const [mapaId, setMapaId] = useState("");
  const [linhas, setLinhas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvoEm, setSalvoEm] = useState(null);

  useEffect(() => {
    listarMapasAdmin(sessao.token).then(setMapas).catch((e) => setErro(e.message));
  }, [sessao.token]);

  useEffect(() => {
    if (!mapaId) {
      setLinhas(null);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    setSalvoEm(null);

    (async () => {
      try {
        const [salvos, blob] = await Promise.all([
          buscarConfigAtributos(sessao.token, mapaId),
          baixarMapaAdmin(sessao.token, mapaId),
        ]);
        const pmtiles = new PMTiles(new BlobSource(`admin-${mapaId}`, blob));
        const metadata = await pmtiles.getMetadata();
        const camadaPrincipal = (metadata?.vector_layers || []).find(
          (l) => l.id !== CAMADA_ROTULOS
        );
        const campos = Object.keys(camadaPrincipal?.fields || {});
        if (!cancelado) setLinhas(mesclarConfig(campos, salvos));
      } catch (e) {
        if (!cancelado) setErro(e.message);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [mapaId, sessao.token]);

  function alternarVisivel(indice) {
    setLinhas((atual) =>
      atual.map((linha, i) => (i === indice ? { ...linha, visivel: !linha.visivel } : linha))
    );
  }

  function mover(indice, direcao) {
    setLinhas((atual) => {
      const novo = [...atual];
      const alvo = indice + direcao;
      if (alvo < 0 || alvo >= novo.length) return atual;
      [novo[indice], novo[alvo]] = [novo[alvo], novo[indice]];
      return novo;
    });
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const atributos = linhas.map((l, ordem) => ({ campo: l.campo, visivel: l.visivel, ordem }));
      await salvarConfigAtributos(sessao.token, mapaId, atributos);
      setSalvoEm(new Date());
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoMap — Editar atributos</strong>
        <span className="status-sync" />
        <Link to="/admin" className="botao botao-sair">
          ← Admin
        </Link>
      </header>

      <div className="painel-admin-conteudo">
        <label className="campo-select-mapa">
          Camada
          <select value={mapaId} onChange={(e) => setMapaId(e.target.value)}>
            <option value="">Selecione…</option>
            {mapas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>

        {erro && <p className="erro">{erro}</p>}
        {carregando && <p>Carregando campos…</p>}

        {linhas && !carregando && (
          <>
            <ul className="lista-atributos-admin">
              {linhas.map((linha, i) => (
                <li key={linha.campo} className="linha-atributo-admin">
                  <label>
                    <input
                      type="checkbox"
                      checked={linha.visivel}
                      onChange={() => alternarVisivel(i)}
                    />
                    {linha.campo}
                  </label>
                  <div className="botoes-ordem">
                    <button
                      type="button"
                      onClick={() => mover(i, -1)}
                      disabled={i === 0}
                      aria-label={`Mover ${linha.campo} pra cima`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(i, 1)}
                      disabled={i === linhas.length - 1}
                      aria-label={`Mover ${linha.campo} pra baixo`}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="acoes-admin-atributos">
              <button type="button" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
              {salvoEm && (
                <span className="confirmacao-salvo">
                  Salvo às{" "}
                  {salvoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
