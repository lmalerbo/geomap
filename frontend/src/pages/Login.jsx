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
      navigate("/mapa");
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="tela-login">
      <form onSubmit={handleSubmit} className="form-login">
        <h1>GeoPortal</h1>
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
        {erro && <p className="erro">{erro}</p>}
        <button type="submit" disabled={carregando}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
