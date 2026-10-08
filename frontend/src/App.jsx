import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { JobsProvider } from "./context/JobsContext.jsx";
import AvisoPinsDescartados from "./components/AvisoPinsDescartados.jsx";
import { importarComRecarga } from "./lib/versaoNova.js";

// Code-splitting por rota (Lighthouse apontou ~230 KiB de JS não usado no
// primeiro load — em boa parte MapLibre GL + libs de importação de
// shapefile/KML, que só fazem sentido em /mapa/:id, nunca em /login ou nas
// telas de admin). Cada import() vira um chunk próprio no build do Vite —
// só baixa quando a rota é acessada de verdade, em vez de tudo junto no
// bundle principal.
const Login = lazy(importarComRecarga(() => import("./pages/Login.jsx")));
const PrimeiroAcesso = lazy(importarComRecarga(() => import("./pages/PrimeiroAcesso.jsx")));
const Inicio = lazy(importarComRecarga(() => import("./pages/Inicio.jsx")));
const Mapa = lazy(importarComRecarga(() => import("./pages/Mapa.jsx")));
const AdminCamadas = lazy(importarComRecarga(() => import("./pages/AdminCamadas.jsx")));
const AdminMapas = lazy(importarComRecarga(() => import("./pages/AdminMapas.jsx")));
const AdminUsuarios = lazy(importarComRecarga(() => import("./pages/AdminUsuarios.jsx")));
const AdminEstatisticas = lazy(importarComRecarga(() => import("./pages/AdminEstatisticas.jsx")));
const AdminVisaoGeral = lazy(importarComRecarga(() => import("./pages/AdminVisaoGeral.jsx")));
const LayoutAdmin = lazy(importarComRecarga(() => import("./components/LayoutAdmin.jsx")));
const Ajuda = lazy(importarComRecarga(() => import("./pages/Ajuda.jsx")));
const Indicadores = lazy(importarComRecarga(() => import("./pages/Indicadores.jsx")));
const DefinirSenha = lazy(importarComRecarga(() => import("./pages/DefinirSenha.jsx")));

function CarregandoRota() {
  return (
    <main className="carregando-rota">
      <span className="spinner spinner--grande" aria-hidden="true" />
    </main>
  );
}

// Enquanto precisaTrocarSenha for true (1º login com a senha temporária de
// criação, ou depois de um reset feito pelo admin), nenhuma rota protegida
// deixa passar — só a própria tela de definir senha.
function RotaProtegida({ children }) {
  const { sessao } = useAuth();
  if (!sessao) return <Navigate to="/login" replace />;
  if (sessao.precisaTrocarSenha) return <Navigate to="/definir-senha" replace />;
  return children;
}

function RotaAdmin({ children }) {
  const { sessao } = useAuth();
  if (!sessao) return <Navigate to="/login" replace />;
  if (sessao.precisaTrocarSenha) return <Navigate to="/definir-senha" replace />;
  return sessao.usuario.papel === "admin" ? children : <Navigate to="/inicio" replace />;
}

// A própria tela de definir senha também exige sessão (o token da senha
// temporária), mas não pode reentrar em si mesma pelo gate acima.
function RotaDefinirSenha({ children }) {
  const { sessao } = useAuth();
  return sessao ? children : <Navigate to="/login" replace />;
}

// key={mapaId}: força o componente a remontar do zero ao trocar de mapa
// pelo botão "Trocar mapa" (senão os refs do MapLibre/IndexedDB de um mapa
// vazariam pro outro, já que é a mesma instância de componente).
function MapaRoteado() {
  const { mapaId } = useParams();
  return <Mapa key={mapaId} />;
}

export default function App() {
  return (
    <AuthProvider>
      {/* JobsProvider fica fora das <Routes> de propósito — precisa
          continuar montado enquanto o usuário navega entre telas (ou o
          polling de job em segundo plano, que sobrevive à troca de tela,
          pararia junto com o componente que o criou). */}
      <JobsProvider>
        <AvisoPinsDescartados />
        {/* import.meta.env.BASE_URL vem do "base" do vite.config.js — "/" local,
            "/geomap/" no build do GitHub Pages (ver GITHUB_PAGES nesse config).
            Sem isso as rotas do React Router não batem com a URL real numa
            project page do GitHub Pages. */}
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Suspense fallback={<CarregandoRota />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
              <Route
                path="/definir-senha"
                element={
                  <RotaDefinirSenha>
                    <DefinirSenha />
                  </RotaDefinirSenha>
                }
              />
              <Route
                path="/inicio"
                element={
                  <RotaProtegida>
                    <Inicio />
                  </RotaProtegida>
                }
              />
              <Route
                path="/mapa/:mapaId"
                element={
                  <RotaProtegida>
                    <MapaRoteado />
                  </RotaProtegida>
                }
              />
              {/* Administração (redesenho, fase 5): menu lateral fixo do
                  LayoutAdmin em volta de todas as telas; /admin é a Visão geral. */}
              <Route
                path="/admin"
                element={
                  <RotaAdmin>
                    <LayoutAdmin />
                  </RotaAdmin>
                }
              >
                <Route index element={<AdminVisaoGeral />} />
                <Route path="mapas" element={<AdminMapas />} />
                <Route path="camadas" element={<AdminCamadas />} />
                <Route path="usuarios" element={<AdminUsuarios />} />
                <Route path="estatisticas" element={<AdminEstatisticas />} />
              </Route>
              <Route
                path="/indicadores"
                element={
                  <RotaProtegida>
                    <Indicadores />
                  </RotaProtegida>
                }
              />
              <Route
                path="/ajuda"
                element={
                  <RotaProtegida>
                    <Ajuda />
                  </RotaProtegida>
                }
              />
              <Route path="*" element={<Navigate to="/inicio" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </JobsProvider>
    </AuthProvider>
  );
}
