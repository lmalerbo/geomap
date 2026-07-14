import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { listarMapasDisponiveis, listarMapasBaixados } from "../lib/db.js";
import { sincronizarMapas } from "../lib/sync.js";
import { useAuth } from "../context/AuthContext.jsx";
import MenuLateral from "../components/MenuLateral.jsx";
import IconeEstadoVazio from "../components/IconeEstadoVazio.jsx";

function IconeMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export default function Inicio() {
  const { sessao, sair } = useAuth();
  const navigate = useNavigate();
  const [mapas, setMapas] = useState([]);
  const [contagemCamadas, setContagemCamadas] = useState(new Map());
  const [sincronizando, setSincronizando] = useState(true);
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState(null);
  const [offline, setOffline] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  function contarCamadasPorMapa(camadas) {
    const contagem = new Map();
    for (const c of camadas) {
      contagem.set(c.mapaId, (contagem.get(c.mapaId) || 0) + 1);
    }
    return contagem;
  }

  // 1) offline-first: mostra o que já existe localmente assim que a tela abre.
  useEffect(() => {
    Promise.all([listarMapasDisponiveis(), listarMapasBaixados()]).then(([locais, camadas]) => {
      setMapas(locais);
      setContagemCamadas(contarCamadasPorMapa(camadas));
    });
  }, []);

  // 2) sincroniza tudo (todos os mapas permitidos, todas as camadas deles)
  // em segundo plano, sem UI de bloqueio.
  useEffect(() => {
    let cancelado = false;

    sincronizarMapas(sessao.token).then((resultado) => {
      if (cancelado) return;
      listarMapasDisponiveis().then(setMapas);
      setContagemCamadas(contarCamadasPorMapa(resultado.mapas));
      setOffline(!resultado.online);
      if (resultado.online) setUltimaSincronizacao(resultado.sincronizadoEm);
      setSincronizando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [sessao.token]);

  function handleSair() {
    sair();
    navigate("/login");
  }

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoMap</strong>
        <span className="status-sync">
          {sincronizando && <span className="spinner" aria-hidden="true" />}
          {sincronizando
            ? "Sincronizando…"
            : offline
              ? "Offline — usando últimos mapas salvos"
              : ultimaSincronizacao
                ? `Atualizado às ${ultimaSincronizacao.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : null}
        </span>
        <button
          type="button"
          className="botao-circular"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
          title="Menu"
        >
          <IconeMenu />
        </button>
      </header>

      <MenuLateral
        aberto={menuAberto}
        aoFechar={() => setMenuAberto(false)}
        ehAdmin={sessao.usuario.papel === "admin"}
        aoSair={handleSair}
      />

      <div className="painel-admin">
        {mapas.map((mapa) => (
          <Link key={mapa.id} to={`/mapa/${mapa.id}`} className="cartao-admin cartao-admin--link">
            <h2>{mapa.nome}</h2>
            {mapa.descricao && <p>{mapa.descricao}</p>}
            <p>{contagemCamadas.get(mapa.id) || 0} camada(s) disponível(is)</p>
          </Link>
        ))}

        {mapas.length === 0 && !sincronizando && (
          <p className="sem-dados-estatistica">
            <IconeEstadoVazio />
            {offline
              ? "Nenhum mapa disponível localmente. Conecte-se à internet para sincronizar."
              : "Nenhum mapa disponível para sua conta. Peça ao administrador para conceder acesso se precisar ver algum mapa."}
          </p>
        )}
      </div>
    </main>
  );
}
