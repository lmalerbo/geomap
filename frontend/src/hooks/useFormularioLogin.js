import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

// Logica de autenticação compartilhada entre a tela de Login normal e a
// de Primeiro Acesso — as duas fazem exatamente a mesma chamada
// (POST /login, que já serve tanto senha definitiva quanto a temporária
// fixa) e o mesmo redirecionamento por precisaTrocarSenha; só mudam a
// moldura/copy em volta (ver Login.jsx / PrimeiroAcesso.jsx).
export function useFormularioLogin() {
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
      const { token, usuario, precisaTrocarSenha } = await login(email, senha);
      entrar(token, usuario, precisaTrocarSenha);
      navigate(precisaTrocarSenha ? "/definir-senha" : "/inicio");
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

  return { email, setEmail, senha, setSenha, erro, carregando, handleSubmit };
}
