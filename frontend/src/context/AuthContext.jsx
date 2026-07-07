import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(() => {
    const salvo = localStorage.getItem("geoportal_sessao");
    return salvo ? JSON.parse(salvo) : null;
  });

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
