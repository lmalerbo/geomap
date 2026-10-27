import { Link } from "react-router-dom";
import { useFormularioLogin } from "../hooks/useFormularioLogin.js";
import AlertaErro from "../components/AlertaErro.jsx";
import NotaServidorAcordando from "../components/NotaServidorAcordando.jsx";

// Porta de entrada dedicada pra quem nunca logou — por baixo é o MESMO
// POST /login de sempre (useFormularioLogin), só com moldura/copy
// pensada pra um novato que já recebeu e-mail + senha temporária do
// administrador (nunca auto-cadastro: sem a senha temporária certa,
// ninguém entra — ver decisão registrada no histórico do projeto).
export default function PrimeiroAcesso() {
  const { email, setEmail, senha, setSenha, erro, botao, servidorAcordando, handleSubmit } =
    useFormularioLogin();

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
        {erro && <AlertaErro semTremida>{erro}</AlertaErro>}
        <button {...botao.propsBotao({ type: "submit" })}>{botao.conteudo("Continuar")}</button>
        {servidorAcordando && <NotaServidorAcordando />}
        <div className="links-login">
          <Link to="/login" className="link-botao">
            ← Voltar pro login
          </Link>
        </div>
      </form>
    </main>
  );
}
