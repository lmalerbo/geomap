import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const { entrar } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const { token, usuario } = await login(email, senha);
      entrar(token, usuario);
      navigate("/inicio");
    } catch (err) {
      // fetch() falha com TypeError quando nem chega a completar a
      // requisição (sem internet, servidor fora do ar) — diferente de um
      // erro HTTP normal (credenciais erradas), que já vem formatado.
      if (err instanceof TypeError) {
        setErro("Sem conexão com o servidor. Verifique sua internet e tente de novo.");
      } else {
        setErro(err.message);
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="tela-login">
      <form onSubmit={handleSubmit} className="form-login">
        <h1>GeoMap</h1>
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </label>
        {erro && (
          <p className="alerta-erro" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {erro}
          </p>
        )}
        <button type="submit" disabled={carregando}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
