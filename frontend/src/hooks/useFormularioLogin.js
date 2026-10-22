import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { entrarComHub } from "../lib/api.js";
import { hub } from "../lib/hub.js";
import { mensagemErroLogin } from "../lib/erroLogin.js";
import { useAuth } from "../context/AuthContext.jsx";

// Login único: entra no Supabase do Hub e troca o token pelo do GeoMap.
// Compartilhado entre Login e PrimeiroAcesso (só muda a moldura).
export function useFormularioLogin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const { entrar } = useAuth();
  const navigate = useNavigate();

  async function concluir(accessToken) {
    try {
      const { token, usuario } = await entrarComHub(accessToken);
      entrar(token, usuario, false);
      navigate("/inicio");
    } catch (err) {
      if (err.precisaTrocarSenha) return navigate("/definir-senha");
      throw err;
    }
  }

  // Já entrou no Hub neste navegador: entra direto. Enquanto confere, o formulário fica ocupado
  // (um clique em Entrar no meio disso disputava a sessão com esta entrada e mostrava erro falso).
  useEffect(() => {
    setCarregando(true);
    hub.auth.getSession()
      .then(({ data }) => (data.session ? concluir(data.session.access_token) : null))
      .catch(() => {})
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (carregando) return;
    setErro(null);
    setCarregando(true);
    try {
      const { data, error } = await hub.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) throw new Error(mensagemErroLogin(error));
      await concluir(data.session.access_token);
    } catch (err) {
      setErro(err instanceof TypeError
        ? "Sem conexão com o servidor. Verifique sua internet e tente de novo."
        : err.message);
    } finally {
      setCarregando(false);
    }
  }

  return { email, setEmail, senha, setSenha, erro, carregando, handleSubmit };
}
