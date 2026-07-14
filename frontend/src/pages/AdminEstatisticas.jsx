import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buscarEstatisticasAdmin } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import IconeEstadoVazio from "../components/IconeEstadoVazio.jsx";

export default function AdminEstatisticas() {
  const { sessao } = useAuth();
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    buscarEstatisticasAdmin(sessao.token)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [sessao.token]);

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoMap — Estatísticas</strong>
        <span className="status-sync" />
        <button type="button" className="botao botao-sair" onClick={() => navigate(-1)}>
          ← Voltar
        </button>
      </header>

      <div className="painel-admin-conteudo painel-admin-conteudo--largo">
        {erro && <p className="erro">{erro}</p>}
        {!dados && !erro && (
          <p className="status-carregando-admin">
            <span className="spinner" aria-hidden="true" /> Carregando…
          </p>
        )}

        {dados && (
          <>
            <div className="tiles-estatisticas">
              <div className="tile-estatistica">
                <strong>{dados.totais.total_camadas}</strong>
                <span>Camadas cadastradas</span>
              </div>
              <div className="tile-estatistica">
                <strong>{dados.totais.total_usuarios}</strong>
                <span>Usuários ativos</span>
              </div>
              <div className="tile-estatistica">
                <strong>{dados.totais.total_downloads}</strong>
                <span>Downloads no total</span>
              </div>
            </div>

            <div className="cartao-form-admin">
              <h2>Camadas mais baixadas</h2>
              {dados.camadasMaisBaixadas.length === 0 ? (
                <p className="sem-dados-estatistica">
                  <IconeEstadoVazio /> Nenhum download registrado ainda.
                </p>
              ) : (
                <ol className="lista-ranking">
                  {dados.camadasMaisBaixadas.map((c) => (
                    <li key={c.nome}>
                      <span className="nome-ranking">{c.nome}</span>
                      <span className="contagem-ranking">{c.downloads}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="cartao-form-admin">
              <h2>Usuários mais ativos</h2>
              {dados.usuariosMaisAtivos.length === 0 ? (
                <p className="sem-dados-estatistica">
                  <IconeEstadoVazio /> Nenhum download registrado ainda.
                </p>
              ) : (
                <ol className="lista-ranking">
                  {dados.usuariosMaisAtivos.map((u) => (
                    <li key={u.email}>
                      <span className="nome-ranking">
                        {u.nome}
                        <span className="detalhe-mapa-admin"> {u.email}</span>
                      </span>
                      <span className="contagem-ranking">{u.downloads}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
