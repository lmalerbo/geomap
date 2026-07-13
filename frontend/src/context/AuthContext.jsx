import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

function tokenExpirado(token) {
  const partes = token.split(".");
  if (partes.length !== 3) return true;
  try {
    const payload = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function carregarSessaoSalva() {
  const salvo = localStorage.getItem("geoportal_sessao");
  if (!salvo) return null;
  try {
    const sessao = JSON.parse(salvo);
    if (!sessao?.token || tokenExpirado(sessao.token)) {
      localStorage.removeItem("geoportal_sessao");
      return null;
    }
    return sessao;
  } catch {
    localStorage.removeItem("geoportal_sessao");
    return null;
  }
}

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(() => carregarSessaoSalva());

  const entrar = useCallback((token, usuario) => {
    const nova = { token, usuario };
    localStorage.setItem("geoportal_sessao", JSON.stringify(nova));
    setSessao(nova);
  }, []);

  const sair = useCallback(() => {
    localStorage.removeItem("geoportal_sessao");
    setSessao(null);
  }, []);

  return (
    <AuthContext.Provider value={{ sessao, entrar, sair }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
