import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { definirSenha } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

// Tela obrigatória enquanto sessao.precisaTrocarSenha for true — serve os
// dois casos que levam a uma senha temporária conhecida (sempre a mesma
// constante fixa no backend): o 1º login de um usuário recém-criado, e
// depois que o admin redefine a senha de alguém. Não pede a senha atual
// de novo (o próprio login que trouxe até aqui já provou isso).
export default function DefinirSenha() {
  const { sessao, confirmarSenhaDefinida } = useAuth();
  const navigate = useNavigate();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null);
    if (novaSenha !== confirmacao) {
      setErro("As senhas não coincidem.");
      return;
    }
    setEnviando(true);
    try {
      await definirSenha(sessao.token, novaSenha);
      confirmarSenhaDefinida();
      navigate("/inicio", { replace: true });
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="tela-login">
      <form onSubmit={handleSubmit} className="form-login">
        <h1>Defina sua senha</h1>
        <p>
          Sua senha ainda é a temporária. Escolha uma senha própria antes de continuar — isso só
          precisa ser feito uma vez.
        </p>
        <label>
          Nova senha
          <input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            required
            minLength={6}
            autoFocus
          />
        </label>
        <label>
          Confirmar nova senha
          <input
            type="password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            required
            minLength={6}
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
        <button type="submit" disabled={enviando}>
          {enviando && <span className="spinner" aria-hidden="true" />}
          {enviando ? "Salvando…" : "Salvar e continuar"}
        </button>
      </form>
    </main>
  );
}
