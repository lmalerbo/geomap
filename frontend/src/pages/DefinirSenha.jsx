import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { entrarComHub } from "../lib/api.js";
import { hub } from "../lib/hub.js";
import { useAuth } from "../context/AuthContext.jsx";
import AlertaErro from "../components/AlertaErro.jsx";
import { useOcupado } from "../components/movimento/index.js";

// Tela obrigatória enquanto sessao.precisaTrocarSenha for true — serve os
// dois casos que levam a uma senha temporária conhecida (sempre a mesma
// constante fixa no backend): o 1º login de um usuário recém-criado, e
// depois que o admin redefine a senha de alguém. Não pede a senha atual
// de novo (o próprio login que trouxe até aqui já provou isso).
export default function DefinirSenha() {
  const { entrar } = useAuth();
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
      const { data } = await hub.auth.getSession();
      if (!data.session) {
        fim(false);
        navigate("/login", { replace: true });
        return;
      }
      const { error } = await hub.auth.updateUser({ password: novaSenha });
      if (error) throw new Error(error.message);
      const r = await hub.schema("hub").rpc("senha_definida");
      if (r.error) throw new Error(r.error.message);
      const { data: nova } = await hub.auth.getSession();
      const { token, usuario } = await entrarComHub(nova.session.access_token);
      await fim(true);
      entrar(token, usuario, false);
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
          Sua senha ainda é a provisória. Escolha uma senha própria (mínimo 8 caracteres) — ela vale para o Hub e o GeoMap.
        </p>
        <label>
          Nova senha
          <input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            required
            minLength={8}
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
            minLength={8}
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
