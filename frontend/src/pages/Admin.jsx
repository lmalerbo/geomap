import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Shell do painel de administração — só a navegação/proteção por papel.
// Cada seção vira uma tela própria nas próximas etapas (ver CLAUDE.md).
const SECOES = [
  {
    titulo: "Adicionar/remover camadas",
    descricao: "Upload de novos .pmtiles gerados pelo pipeline (Fase 3).",
  },
  {
    titulo: "Editar camadas",
    descricao: "Simbologia, rótulos e nomenclatura por camada.",
  },
  {
    titulo: "Editar atributos — Limites",
    descricao: "Quais atributos aparecem no painel e em que ordem.",
  },
  {
    titulo: "Editar atributos — Talhões",
    descricao: "Quais atributos aparecem no painel e em que ordem.",
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
        {SECOES.map((secao) => (
          <article key={secao.titulo} className="cartao-admin cartao-admin--em-breve">
            <h2>{secao.titulo}</h2>
            <p>{secao.descricao}</p>
            <span className="etiqueta-em-breve">Em breve</span>
          </article>
        ))}
      </div>
    </main>
  );
}
