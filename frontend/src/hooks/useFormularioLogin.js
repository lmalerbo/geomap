import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useOcupado } from "../components/movimento/index.js";

// Depois disso esperando, a tela explica a demora: o backend no Render
// dorme após ~15 min parado e a primeira entrada do dia leva até 1 minuto.
export const ESPERA_SERVIDOR_ACORDANDO = 8000;

// Logica de autenticação compartilhada entre a tela de Login normal e a
// de Primeiro Acesso — as duas fazem exatamente a mesma chamada
// (POST /login, que já serve tanto senha definitiva quanto a temporária
// fixa) e o mesmo redirecionamento por precisaTrocarSenha; só mudam a
// moldura/copy em volta (ver Login.jsx / PrimeiroAcesso.jsx).
export function useFormularioLogin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [servidorAcordando, setServidorAcordando] = useState(false);
  const botao = useOcupado();
  const timerAcordando = useRef(null);
  const { entrar } = useAuth();
  const navigate = useNavigate();

  useEffect(() => () => clearTimeout(timerAcordando.current), []);

  function pararAvisoAcordando() {
    clearTimeout(timerAcordando.current);
    setServidorAcordando(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (botao.estado !== "parado") return;
    setErro(null);
    const fim = botao.iniciar({ texto: "Entrando…" });
    timerAcordando.current = setTimeout(() => setServidorAcordando(true), ESPERA_SERVIDOR_ACORDANDO);
    try {
      const { token, usuario, precisaTrocarSenha } = await login(email, senha);
      pararAvisoAcordando();
      // Só troca de tela depois do ✓ — senão ele nem aparece.
      await fim(true);
      entrar(token, usuario, precisaTrocarSenha);
      navigate(precisaTrocarSenha ? "/definir-senha" : "/inicio");
    } catch (err) {
      pararAvisoAcordando();
      // fetch() falha com TypeError quando nem chega a completar a
      // requisição (sem internet, servidor fora do ar) — diferente de um
      // erro HTTP normal (credenciais erradas), que já vem formatado.
      if (err instanceof TypeError) {
        setErro("Sem conexão com o servidor. Verifique sua internet e tente de novo.");
      } else {
        setErro(err.message);
      }
      // A mensagem aparece junto do ✕, sem esperar a tremida acabar.
      fim(false);
    }
  }

  return { email, setEmail, senha, setSenha, erro, botao, servidorAcordando, handleSubmit };
}
