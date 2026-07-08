import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Mapa from "./pages/Mapa.jsx";

function RotaProtegida({ children }) {
  const { sessao } = useAuth();
  return sessao ? children : <Navigate to="/login" replace />;
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
          <Route path="*" element={<Navigate to="/mapa" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
