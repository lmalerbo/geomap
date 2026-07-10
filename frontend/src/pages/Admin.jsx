import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function IconeCamadas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function IconeSimbologia() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function IconeLista() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconeGrafico() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

// Shell do painel de administração. Cada seção vira uma tela própria
// (ver CLAUDE.md) — `rota` presente = já implementada, ausente = "em breve".
const SECOES = [
  {
    titulo: "Adicionar/remover camadas",
    descricao: "Upload de novos .pmtiles gerados pelo pipeline (Fase 3).",
    rota: "/admin/mapas",
    Icone: IconeCamadas,
  },
  {
    titulo: "Editar camadas",
    descricao: "Simbologia, rótulos e nomenclatura por camada.",
    rota: "/admin/camadas",
    Icone: IconeSimbologia,
  },
  {
    titulo: "Editar atributos",
    descricao: "Quais atributos aparecem no painel de cada camada (Limites, Talhões, ...) e em que ordem.",
    rota: "/admin/atributos",
    Icone: IconeLista,
  },
  {
    titulo: "Estatísticas",
    descricao: "Mapas mais baixados, usuários mais ativos.",
    rota: "/admin/estatisticas",
    Icone: IconeGrafico,
  },
];

export default function Admin() {
  const { sair } = useAuth();
  const navigate = useNavigate();

  function handleSair() {
    sair();
    navigate("/login");
  }

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoMap — Administração</strong>
        <span className="status-sync" />
        <Link to="/mapa" className="botao botao-sair">
          ← Mapa
        </Link>
        <button type="button" className="botao-sair" onClick={handleSair}>
          Sair
        </button>
      </header>

      <div className="painel-admin">
        {SECOES.map((secao) =>
          secao.rota ? (
            <Link
              key={secao.titulo}
              to={secao.rota}
              className="cartao-admin cartao-admin--link"
            >
              <span className="icone-cartao-admin" aria-hidden="true">
                <secao.Icone />
              </span>
              <h2>{secao.titulo}</h2>
              <p>{secao.descricao}</p>
            </Link>
          ) : (
            <article key={secao.titulo} className="cartao-admin cartao-admin--em-breve">
              <span className="icone-cartao-admin" aria-hidden="true">
                <secao.Icone />
              </span>
              <h2>{secao.titulo}</h2>
              <p>{secao.descricao}</p>
              <span className="etiqueta-em-breve">Em breve</span>
            </article>
          )
        )}
      </div>
    </main>
  );
}
