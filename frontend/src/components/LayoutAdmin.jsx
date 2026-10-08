import { Suspense, createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { buscarVisaoGeralAdmin } from "../lib/api.js";
import { usePinsPendentes, sairDescartandoPins } from "../hooks/usePinsPendentes.js";
import { useApontamentosNaFila } from "../hooks/useApontamentosNaFila.js";
import { IconeMapas, IconeCamadas } from "./MenuLateral.jsx";

// Estrutura das telas de administração (redesenho, fase 5 — ver
// docs/REDESENHO_FRONTEND.md): menu lateral fixo no desktop, gaveta no
// celular. Busca o resumo da Visão geral uma vez pra os indicadores do menu
// (ponto de alerta, camadas atrasadas) e compartilha com as telas filhas.

const ResumoAdminContext = createContext(null);

export function useResumoAdmin() {
  return useContext(ResumoAdminContext);
}

function IconeVisaoGeral() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconePessoas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </svg>
  );
}

function IconeGrafico() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M6 20v-6M12 20V4M18 20v-10" />
    </svg>
  );
}

function IconeVoltar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function IconeMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function iniciaisDoNome(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

const TITULOS = {
  "/admin": "Visão geral",
  "/admin/mapas": "Mapas",
  "/admin/camadas": "Camadas",
  "/admin/usuarios": "Usuários e grupos",
  "/admin/estatisticas": "Estatísticas",
};

export default function LayoutAdmin() {
  const { sessao, sair } = useAuth();
  const navigate = useNavigate();
  const local = useLocation();
  const pinsPendentes = usePinsPendentes();
  const filaApontamentos = useApontamentosNaFila();
  const [resumo, setResumo] = useState(null);
  const [erroResumo, setErroResumo] = useState(null);
  const [menuAberto, setMenuAberto] = useState(false);

  const recarregarResumo = useCallback(() => {
    return buscarVisaoGeralAdmin(sessao.token)
      .then((r) => {
        setResumo(r);
        setErroResumo(null);
      })
      .catch((e) => setErroResumo(e.message));
  }, [sessao.token]);

  useEffect(() => {
    recarregarResumo();
  }, [recarregarResumo]);

  // Fecha a gaveta do celular ao navegar.
  useEffect(() => {
    setMenuAberto(false);
  }, [local.pathname]);

  const auto = resumo?.automacao;
  const ponteCaida = Boolean(resumo?.ponteDm?.emUso && !resumo.ponteDm.conectada);
  const atencao = Boolean((auto && auto.atrasadas > 0) || ponteCaida);

  async function aoSair() {
    if (await sairDescartandoPins(pinsPendentes, sair, undefined, filaApontamentos.qtdPendentes)) navigate("/login");
  }

  const itens = [
    { rota: "/admin", fim: true, rotulo: "Visão geral", Icone: IconeVisaoGeral, marca: atencao ? "ponto" : null },
    { rota: "/admin/mapas", rotulo: "Mapas", Icone: IconeMapas, contagem: resumo?.totais.mapas },
    { rota: "/admin/camadas", rotulo: "Camadas", Icone: IconeCamadas, alerta: auto?.atrasadas || null },
    { rota: "/admin/usuarios", rotulo: "Usuários e grupos", Icone: IconePessoas },
    { rota: "/admin/estatisticas", rotulo: "Estatísticas", Icone: IconeGrafico },
  ];

  return (
    <ResumoAdminContext.Provider value={{ resumo, erroResumo, recarregarResumo }}>
      <div className={`adm${menuAberto ? " adm--menu-aberto" : ""}`}>
        <header className="adm-topo-celular">
          <button type="button" className="adm-botao-menu" onClick={() => setMenuAberto(true)} aria-label="Abrir menu de administração">
            <IconeMenu />
            {atencao && <span className="adm-ponto" aria-hidden="true" />}
          </button>
          <strong>{TITULOS[local.pathname] || "Administração"}</strong>
        </header>
        <div className="adm-fundo-menu" onClick={() => setMenuAberto(false)} aria-hidden="true" />

        <nav className="adm-menu" aria-label="Administração">
          <div className="adm-marca">
            <span className="adm-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11Z" />
                <circle cx="12" cy="10" r="2.2" />
              </svg>
            </span>
            <span>
              <strong>GeoMap</strong>
              <small>Administração</small>
            </span>
          </div>

          {itens.map((item) => (
            <NavLink key={item.rota} to={item.rota} end={item.fim} className={({ isActive }) => `adm-item${isActive ? " ativo" : ""}`}>
              <item.Icone />
              <span className="adm-item-rotulo">{item.rotulo}</span>
              {item.marca === "ponto" && <span className="adm-ponto" aria-label="precisa de atenção" />}
              {item.alerta ? (
                <span className="adm-selo adm-selo--alerta" aria-label={`${item.alerta} atrasadas`}>
                  {item.alerta}
                </span>
              ) : item.contagem != null ? (
                <span className="adm-contagem">{item.contagem}</span>
              ) : null}
            </NavLink>
          ))}

          <div className="adm-espaco" />
          <NavLink to="/inicio" className="adm-item adm-item--voltar">
            <IconeVoltar />
            <span className="adm-item-rotulo">Voltar aos mapas</span>
          </NavLink>
          <div className="adm-conta">
            <span className="adm-avatar" aria-hidden="true">
              {iniciaisDoNome(sessao.usuario.nome)}
            </span>
            <span className="adm-conta-texto">
              <strong>{sessao.usuario.nome}</strong>
              <small>Administrador</small>
            </span>
            <button type="button" className="adm-sair" onClick={aoSair}>
              Sair
            </button>
          </div>
        </nav>

        <main className="adm-conteudo">
          {/* Suspense próprio: trocar de tela carrega o chunk da página sem
              derrubar o menu (o Suspense da raiz trocaria a tela toda). */}
          <Suspense
            fallback={
              <p className="status-carregando-admin adm-pagina">
                <span className="spinner" aria-hidden="true" /> Carregando…
              </p>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </ResumoAdminContext.Provider>
  );
}
