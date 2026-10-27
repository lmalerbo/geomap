import { useState } from "react";
import { Link } from "react-router-dom";
import { useFormularioLogin } from "../hooks/useFormularioLogin.js";
import AlertaErro from "../components/AlertaErro.jsx";
import NotaServidorAcordando from "../components/NotaServidorAcordando.jsx";

export default function Login() {
  const { email, setEmail, senha, setSenha, erro, botao, servidorAcordando, handleSubmit } =
    useFormularioLogin();
  // Não existe reset de senha por e-mail hoje (auth 100% própria, sem
  // provedor de e-mail configurado) — "Esqueci minha senha" só orienta a
  // falar com o admin, que redefine pela tela de Gerenciar Usuários.
  const [mostrarAjudaSenha, setMostrarAjudaSenha] = useState(false);

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
        {erro && <AlertaErro semTremida>{erro}</AlertaErro>}
        <button {...botao.propsBotao({ type: "submit" })}>{botao.conteudo("Entrar")}</button>
        {servidorAcordando && <NotaServidorAcordando />}
        <div className="links-login">
          <button type="button" className="link-botao" onClick={() => setMostrarAjudaSenha((v) => !v)}>
            Esqueci minha senha
          </button>
          <Link to="/primeiro-acesso" className="link-botao">
            1º acesso
          </Link>
        </div>
        {mostrarAjudaSenha && (
          <p className="aviso-login">
            Fale com o administrador do sistema — ele pode redefinir sua senha pela tela de
            Gerenciar Usuários.
          </p>
        )}
      </form>
    </main>
  );
}
