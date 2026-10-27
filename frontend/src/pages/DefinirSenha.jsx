import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { definirSenha } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import AlertaErro from "../components/AlertaErro.jsx";
import { useOcupado } from "../components/movimento/index.js";

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
  // Erro que veio do servidor (junto do ✕ do botão) x conferência local das
  // senhas, que não passa pelo botão e mantém a tremida da mensagem.
  const [erroNoBotao, setErroNoBotao] = useState(false);
  const botao = useOcupado();

  async function handleSubmit(e) {
    e.preventDefault();
    if (botao.estado !== "parado") return;
    setErro(null);
    if (novaSenha !== confirmacao) {
      setErroNoBotao(false);
      setErro("As senhas não coincidem.");
      return;
    }
    const fim = botao.iniciar({ texto: "Salvando…" });
    try {
      await definirSenha(sessao.token, novaSenha);
      await fim(true);
      confirmarSenhaDefinida();
      navigate("/inicio", { replace: true });
    } catch (err) {
      setErroNoBotao(true);
      setErro(err.message);
      fim(false);
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
        {erro && <AlertaErro semTremida={erroNoBotao}>{erro}</AlertaErro>}
        <button {...botao.propsBotao({ type: "submit" })}>
          {botao.conteudo("Salvar e continuar")}
        </button>
      </form>
    </main>
  );
}
