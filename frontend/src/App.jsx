import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Mapa from "./pages/Mapa.jsx";
import Admin from "./pages/Admin.jsx";

function RotaProtegida({ children }) {
  const { sessao } = useAuth();
  return sessao ? children : <Navigate to="/login" replace />;
}

function RotaAdmin({ children }) {
  const { sessao } = useAuth();
  if (!sessao) return <Navigate to="/login" replace />;
  return sessao.usuario.papel === "admin" ? children : <Navigate to="/mapa" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/mapa"
            element={
              <RotaProtegida>
                <Mapa />
              </RotaProtegida>
            }
          />
          <Route
            path="/admin"
            element={
              <RotaAdmin>
                <Admin />
              </RotaAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/mapa" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
