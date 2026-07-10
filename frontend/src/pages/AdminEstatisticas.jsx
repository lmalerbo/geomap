import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buscarEstatisticasAdmin } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AdminEstatisticas() {
  const { sessao } = useAuth();
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
        <Link to="/admin" className="botao botao-sair">
          ← Admin
        </Link>
      </header>

      <div className="painel-admin-conteudo painel-admin-conteudo--largo">
        {erro && <p className="erro">{erro}</p>}

        {dados && (
          <>
            <div className="tiles-estatisticas">
              <div className="tile-estatistica">
                <strong>{dados.totais.total_mapas}</strong>
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
              <h2>Mapas mais baixados</h2>
              {dados.mapasMaisBaixados.length === 0 ? (
                <p className="sem-dados-estatistica">Nenhum download registrado ainda.</p>
              ) : (
                <ol className="lista-ranking">
                  {dados.mapasMaisBaixados.map((m) => (
                    <li key={m.nome}>
                      <span className="nome-ranking">{m.nome}</span>
                      <span className="contagem-ranking">{m.downloads}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="cartao-form-admin">
              <h2>Usuários mais ativos</h2>
              {dados.usuariosMaisAtivos.length === 0 ? (
                <p className="sem-dados-estatistica">Nenhum download registrado ainda.</p>
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
