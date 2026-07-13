import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Inicio from "./pages/Inicio.jsx";
import Mapa from "./pages/Mapa.jsx";
import AdminCamadas from "./pages/AdminCamadas.jsx";
import AdminMapas from "./pages/AdminMapas.jsx";
import AdminUsuarios from "./pages/AdminUsuarios.jsx";
import AdminEstatisticas from "./pages/AdminEstatisticas.jsx";

function RotaProtegida({ children }) {
  const { sessao } = useAuth();
  return sessao ? children : <Navigate to="/login" replace />;
}

function RotaAdmin({ children }) {
  const { sessao } = useAuth();
  if (!sessao) return <Navigate to="/login" replace />;
  return sessao.usuario.papel === "admin" ? children : <Navigate to="/inicio" replace />;
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
      {/* import.meta.env.BASE_URL vem do "base" do vite.config.js — "/" local,
          "/geomap/" no build do GitHub Pages (ver GITHUB_PAGES nesse config).
          Sem isso as rotas do React Router não batem com a URL real numa
          project page do GitHub Pages. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<Login />} />
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
          {/* Tela-grade /admin foi substituída pelo menu lateral (MenuLateral.jsx,
              acionado do cabeçalho de Inicio.jsx/Mapa.jsx) — link direto pra
              /admin cai na primeira seção. */}
          <Route path="/admin" element={<Navigate to="/admin/mapas" replace />} />
          <Route
            path="/admin/camadas"
            element={
              <RotaAdmin>
                <AdminCamadas />
              </RotaAdmin>
            }
          />
          <Route
            path="/admin/mapas"
            element={
              <RotaAdmin>
                <AdminMapas />
              </RotaAdmin>
            }
          />
          <Route
            path="/admin/usuarios"
            element={
              <RotaAdmin>
                <AdminUsuarios />
              </RotaAdmin>
            }
          />
          <Route
            path="/admin/estatisticas"
            element={
              <RotaAdmin>
                <AdminEstatisticas />
              </RotaAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
