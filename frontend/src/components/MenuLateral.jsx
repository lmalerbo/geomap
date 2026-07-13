import { useEffect } from "react";
import { Link } from "react-router-dom";

export function IconeMapas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 20 3 17V4l6 3m0 13 6-3m-6 3V7m6 10 6 3V7l-6-3m0 16V4m0 3-6-3" />
    </svg>
  );
}

function IconeCamadas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function IconeUsuarios() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

// Movido de Admin.jsx (tela removida — vira só as entradas aqui dentro).
const SECOES_ADMIN = [
  {
    titulo: "Gerenciar mapas",
    descricao: "Criar mapas (projetos/fazendas) e definir quais grupos têm acesso a cada um.",
    rota: "/admin/mapas",
    Icone: IconeMapas,
  },
  {
    titulo: "Gerenciar camadas",
    descricao: "Upload, arquivo, simbologia e atributos de cada camada, tudo num só lugar.",
    rota: "/admin/camadas",
    Icone: IconeCamadas,
  },
  {
    titulo: "Gerenciar usuários",
    descricao: "Criar/editar usuários, papel, senha e os grupos que definem permissão.",
    rota: "/admin/usuarios",
    Icone: IconeUsuarios,
  },
  {
    titulo: "Estatísticas",
    descricao: "Camadas mais baixadas, usuários mais ativos.",
    rota: "/admin/estatisticas",
    Icone: IconeGrafico,
  },
];

// Substitui os botões "Admin"/"Sair" do cabeçalho por um único menu:
// seções administrativas (só pra quem é admin) + Sair sempre no rodapé.
// Sempre montado (mesmo fechado) pra permitir a transição de slide/fade
// via CSS, em vez de aparecer/sumir abruptamente.
export default function MenuLateral({ aberto, aoFechar, ehAdmin, aoSair }) {
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e) {
      if (e.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  return (
    <>
      <div
        className={`menu-lateral-backdrop${aberto ? " aberto" : ""}`}
        onClick={aoFechar}
        aria-hidden="true"
      />
      <aside className={`menu-lateral${aberto ? " aberto" : ""}`} aria-hidden={!aberto}>
        <div className="cabecalho-menu-lateral">
          <strong>Menu</strong>
          <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar menu">
            ×
          </button>
        </div>

        <nav className="corpo-menu-lateral">
          {ehAdmin &&
            SECOES_ADMIN.map((secao) => (
              <Link key={secao.titulo} to={secao.rota} className="item-menu-lateral" onClick={aoFechar}>
                <span className="icone-item-menu-lateral" aria-hidden="true">
                  <secao.Icone />
                </span>
                <span className="texto-item-menu-lateral">
                  <strong>{secao.titulo}</strong>
                  <small>{secao.descricao}</small>
                </span>
              </Link>
            ))}
        </nav>

        <div className="rodape-menu-lateral">
          <button type="button" className="botao-sair" onClick={aoSair}>
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
