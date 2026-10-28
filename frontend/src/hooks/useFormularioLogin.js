import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { entrarComHub } from "../lib/api.js";
import { hub } from "../lib/hub.js";
import { mensagemErroLogin } from "../lib/erroLogin.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useOcupado } from "../components/movimento/index.js";

// Depois disso esperando, a tela explica a demora: o backend no Render
// dorme após ~15 min parado e a primeira entrada do dia leva até 1 minuto.
export const ESPERA_SERVIDOR_ACORDANDO = 8000;

// Login único: entra no Supabase do Hub e troca o token pelo do GeoMap.
// Compartilhado entre Login e PrimeiroAcesso (só muda a moldura).
export function useFormularioLogin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [servidorAcordando, setServidorAcordando] = useState(false);
  const botao = useOcupado();
  const timerAcordando = useRef(null);
  // Enquanto confere se já há sessão do Hub, um clique em Entrar disputaria
  // a sessão com a entrada automática e mostraria erro falso.
  const conferindoSessao = useRef(true);
  const { entrar } = useAuth();
  const navigate = useNavigate();

  useEffect(() => () => clearTimeout(timerAcordando.current), []);

  function pararAvisoAcordando() {
    clearTimeout(timerAcordando.current);
    setServidorAcordando(false);
  }

  // Troca o token do Hub pelo do GeoMap com o botão ocupado. Só muda de tela
  // depois do ✓ — senão ele nem aparece.
  async function concluir(fim, obterAccessToken) {
    timerAcordando.current = setTimeout(() => setServidorAcordando(true), ESPERA_SERVIDOR_ACORDANDO);
    try {
      const accessToken = await obterAccessToken();
      let sessaoGeomap;
      try {
        sessaoGeomap = await entrarComHub(accessToken);
      } catch (err) {
        if (!err.precisaTrocarSenha) throw err;
        pararAvisoAcordando();
        await fim(true);
        return navigate("/definir-senha");
      }
      pararAvisoAcordando();
      await fim(true);
      entrar(sessaoGeomap.token, sessaoGeomap.usuario, false);
      navigate("/inicio");
    } catch (err) {
      pararAvisoAcordando();
      // fetch() falha com TypeError quando nem chega a completar a
      // requisição (sem internet, servidor fora do ar) — diferente de um
      // erro HTTP normal (credenciais erradas), que já vem formatado.
      setErro(err instanceof TypeError
        ? "Sem conexão com o servidor. Verifique sua internet e tente de novo."
        : err.message);
      // A mensagem aparece junto do ✕, sem esperar a tremida acabar.
      fim(false);
    }
  }

  // Já entrou no Hub neste navegador: entra direto.
  useEffect(() => {
    hub.auth.getSession()
      .then(({ data }) => {
        conferindoSessao.current = false;
        if (!data.session) return;
        const fim = botao.iniciar({ texto: "Entrando…" });
        return concluir(fim, async () => data.session.access_token);
      })
      .catch(() => { conferindoSessao.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (conferindoSessao.current || botao.estado !== "parado") return;
    setErro(null);
    const fim = botao.iniciar({ texto: "Entrando…" });
    await concluir(fim, async () => {
      const { data, error } = await hub.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) throw new Error(mensagemErroLogin(error));
      return data.session.access_token;
    });
  }

  return { email, setEmail, senha, setSenha, erro, botao, servidorAcordando, handleSubmit };
}
