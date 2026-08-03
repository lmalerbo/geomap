import { Link } from "react-router-dom";
import { useFormularioLogin } from "../hooks/useFormularioLogin.js";

// Porta de entrada dedicada pra quem nunca logou — por baixo é o MESMO
// POST /login de sempre (useFormularioLogin), só com moldura/copy
// pensada pra um novato que já recebeu e-mail + senha temporária do
// administrador (nunca auto-cadastro: sem a senha temporária certa,
// ninguém entra — ver decisão registrada no histórico do projeto).
export default function PrimeiroAcesso() {
  const { email, setEmail, senha, setSenha, erro, carregando, handleSubmit } = useFormularioLogin();

  return (
    <main className="tela-login">
      <form onSubmit={handleSubmit} className="form-login">
        <h1>Primeiro acesso</h1>
        <p>
          Digite seu e-mail e a senha temporária que seu administrador te passou. Na sequência
          você escolhe sua própria senha.
        </p>
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
          Senha temporária
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
          {carregando ? "Entrando..." : "Continuar"}
        </button>
        <div className="links-login">
          <Link to="/login" className="link-botao">
            ← Voltar pro login
          </Link>
        </div>
      </form>
    </main>
  );
}
