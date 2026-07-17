import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PMTiles } from "pmtiles";
import {
  listarCamadasAdmin,
  listarMapasAdmin,
  enviarCamadaAdmin,
  atualizarArquivoCamadaAdmin,
  consultarJobAdmin,
  removerCamadaAdmin,
  renomearCamadaAdmin,
  baixarCamadaAdmin,
  buscarConfigEstilo,
  salvarConfigEstilo,
  buscarConfigAtributos,
  salvarConfigAtributos,
} from "../lib/api.js";
import { BlobSource } from "../lib/pmtilesBlobSource.js";
import { corDaCamada } from "../lib/paleta.js";
import {
  normalizarEstiloConfig,
  gerarCategorias,
  gerarRampaClasses,
  gerarCategoriasForma,
  formatarValorCategoria,
  FORMAS_PONTO,
} from "../lib/estiloCamada.js";
import { lerValoresUnicos, lerValoresUnicosCombinados, lerMinMax, detectarTipoGeometria } from "../lib/pmtilesValores.js";
import { useAuth } from "../context/AuthContext.jsx";
import IconeEstadoVazio from "../components/IconeEstadoVazio.jsx";

const CAMADA_ROTULOS = "rotulos";
const MAX_CATEGORIAS = 30;
// Campo principal + até 2 adicionais = 3 no total, mesmo teto do "Valores
// únicos, muitos campos" do ArcGIS Pro.
const MAX_CAMPOS_ADICIONAIS = 2;

// Junta os campos disponíveis no .pmtiles (fonte da verdade dos nomes) com
// a config já salva (visibilidade/ordem) — campo novo entra visível no
// fim; campo que a config lembrava mas sumiu do dado é descartado.
function mesclarConfigAtributos(campos, salvos) {
  const porCampo = new Map(salvos.map((s) => [s.campo, s]));
  const ordenados = [...salvos].sort((a, b) => a.ordem - b.ordem).map((s) => s.campo);
  const restantes = campos.filter((c) => !porCampo.has(c));
  return [...ordenados, ...restantes]
    .filter((campo) => campos.includes(campo))
    .map((campo) => ({ campo, visivel: porCampo.get(campo)?.visivel ?? true }));
}

const FORM_UPLOAD_VAZIO = { nome: "", versao: "1.0", categoria: "", mapaId: "" };

// true quando a seleção atual vai passar pela conversão (shapefile: .zip
// único, ou os arquivos soltos selecionados sem zipar) — usado só pro
// texto do botão ("Convertendo…" vs "Enviando…"); um único .pmtiles não
// precisa de conversão nenhuma.
function ehConversaoShapefile(arquivos) {
  if (!arquivos || arquivos.length === 0) return false;
  return arquivos.length > 1 || !arquivos[0].name.toLowerCase().endsWith(".pmtiles");
}

// Some sozinha depois de um tempo — antes a confirmação "✓ Salvo às…"
// ficava presa na tela até a próxima ação trocar o texto, mesmo bem
// depois do usuário já ter visto. `setValor` de um useState é estável
// entre renders, por isso é seguro como dependência do efeito (não
// reinicia o timer à toa a cada render).
function useAutoDismiss(valor, setValor, delayMs = 2500) {
  useEffect(() => {
    if (!valor) return;
    const timer = setTimeout(() => setValor(null), delayMs);
    return () => clearTimeout(timer);
  }, [valor, setValor, delayMs]);
}

export default function AdminCamadas() {
  const { sessao } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [camadas, setCamadas] = useState([]);
  const [mapas, setMapas] = useState([]);
  const [filtroMapaId, setFiltroMapaId] = useState(searchParams.get("mapaId") || "");
  const [erroLista, setErroLista] = useState(null);

  const [mostrarUpload, setMostrarUpload] = useState(searchParams.get("mapaId") != null);
  const [formUpload, setFormUpload] = useState({
    ...FORM_UPLOAD_VAZIO,
    mapaId: searchParams.get("mapaId") || "",
  });
  const [arquivoUpload, setArquivoUpload] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [erroUpload, setErroUpload] = useState(null);

  // Criar/atualizar camada não trava mais esperando a conversão terminar
  // (pode levar minutos numa camada grande) — o backend responde na hora
  // com um jobId e a conversão roda em segundo plano; isso aqui só
  // acompanha cada job em andamento pra mostrar "Processando…" e refletir
  // o resultado quando terminar.
  const [jobsEmAndamento, setJobsEmAndamento] = useState([]); // [{ jobId, rotulo }]

  const [camadaSelecionadaId, setCamadaSelecionadaId] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState(null);
  const [sujo, setSujo] = useState(false);

  const [arquivoForm, setArquivoForm] = useState(null); // { nome }
  const [novaVersao, setNovaVersao] = useState("");
  const [novoArquivo, setNovoArquivo] = useState([]);
  const [removendo, setRemovendo] = useState(false);
  const [salvandoArquivo, setSalvandoArquivo] = useState(false);
  const [salvoArquivoEm, setSalvoArquivoEm] = useState(null);

  // estiloForm guarda o objeto normalizado inteiro (preenchimento/contorno/
  // rotulo/visibilidade) — ver lib/estiloCamada.js.
  const [estiloForm, setEstiloForm] = useState(null);
  const [temRotulosNoDado, setTemRotulosNoDado] = useState(false);
  const [ehPontoAtual, setEhPontoAtual] = useState(false);
  const [camposDisponiveis, setCamposDisponiveis] = useState([]);
  const [numClassesGraduado, setNumClassesGraduado] = useState(5);
  const [gerandoCategorias, setGerandoCategorias] = useState(false);
  const [gerandoFormas, setGerandoFormas] = useState(false);
  const [calculandoFaixas, setCalculandoFaixas] = useState(false);
  const [avisoEstilo, setAvisoEstilo] = useState(null);
  const [salvandoEstilo, setSalvandoEstilo] = useState(false);
  const [salvoEstiloEm, setSalvoEstiloEm] = useState(null);
  // pmtiles/source-layer da camada selecionada — só usados pelos botões
  // "Gerar categorias"/"Calcular faixas" (leem os tiles sob demanda), não
  // precisam disparar re-render, por isso ref em vez de state.
  const detalheAtualRef = useRef({ pmtiles: null, sourceLayerId: null });

  const [atributosLinhas, setAtributosLinhas] = useState(null);
  const [salvandoAtributos, setSalvandoAtributos] = useState(false);
  const [salvoAtributosEm, setSalvoAtributosEm] = useState(null);

  useAutoDismiss(salvoArquivoEm, setSalvoArquivoEm);
  useAutoDismiss(salvoEstiloEm, setSalvoEstiloEm);
  useAutoDismiss(salvoAtributosEm, setSalvoAtributosEm);

  function carregarCamadas() {
    return listarCamadasAdmin(sessao.token).then(setCamadas);
  }

  useEffect(() => {
    carregarCamadas().catch((e) => setErroLista(e.message));
    listarMapasAdmin(sessao.token)
      .then(setMapas)
      .catch((e) => setErroLista(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao.token]);

  // Some sozinha quando o componente desmonta (troca de tela) — sem isso,
  // o polling recursivo continuaria chamando setState num componente já
  // fora da árvore. Reseta pra true dentro do próprio setup do efeito (não
  // só no valor inicial do useRef) — em StrictMode (dev) o React roda
  // setup→cleanup→setup na primeira montagem; sem esse reset, o cleanup
  // do meio deixava montadoRef travado em false pro resto da vida do
  // componente, mesmo ele continuando montado de verdade (fazia o
  // polling do job nunca nem tentar consultar o backend).
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  // Consulta GET /admin/jobs/:id a cada poucos segundos até o status virar
  // "concluido" ou "erro" — usado tanto por criar quanto por atualizar
  // camada (ver enviarNovaCamada/enviarNovoArquivo). `rotulo` é só o nome
  // pra mostrar no indicador "Processando…".
  function acompanharJob(jobId, rotulo, { aoSucesso, aoErro }) {
    setJobsEmAndamento((atual) => [...atual, { jobId, rotulo }]);

    async function consultar() {
      if (!montadoRef.current) return;
      let job;
      try {
        job = await consultarJobAdmin(sessao.token, jobId);
      } catch {
        setTimeout(consultar, 4000);
        return;
      }
      if (!montadoRef.current) return;
      if (job.status === "processando") {
        setTimeout(consultar, 4000);
        return;
      }
      setJobsEmAndamento((atual) => atual.filter((j) => j.jobId !== jobId));
      if (job.status === "concluido") {
        aoSucesso?.(job);
      } else {
        aoErro?.(job);
      }
    }

    setTimeout(consultar, 2000);
  }

  const camadasFiltradas = useMemo(
    () =>
      filtroMapaId
        ? camadas.filter((c) => String(c.mapa_id) === String(filtroMapaId))
        : camadas,
    [camadas, filtroMapaId]
  );

  function nomeDoMapa(mapaId) {
    return mapas.find((m) => m.id === mapaId)?.nome || "—";
  }

  function atualizarFormUpload(campo, valor) {
    setFormUpload((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviarNovaCamada(e) {
    e.preventDefault();
    if (arquivoUpload.length === 0) {
      setErroUpload("Selecione um .pmtiles ou os arquivos do shapefile (.shp/.dbf/.shx/.prj)");
      return;
    }
    if (!formUpload.mapaId) {
      setErroUpload("Selecione a qual mapa essa camada pertence");
      return;
    }
    setEnviando(true);
    setErroUpload(null);
    try {
      const { jobId } = await enviarCamadaAdmin(sessao.token, { ...formUpload, arquivos: arquivoUpload });
      const nomeCamada = formUpload.nome;
      setFormUpload(FORM_UPLOAD_VAZIO);
      setArquivoUpload([]);
      document.getElementById("campo-arquivo-pmtiles").value = "";
      setMostrarUpload(false);
      acompanharJob(jobId, nomeCamada, {
        aoSucesso: async (job) => {
          await carregarCamadas();
          setCamadaSelecionadaId(job.camadaId);
        },
        aoErro: (job) => setErroLista(`Falha ao criar "${nomeCamada}": ${job.erro}`),
      });
    } catch (err) {
      setErroUpload(err.message);
    } finally {
      setEnviando(false);
    }
  }

  // Ao trocar de camada selecionada com algo editado e não salvo em
  // qualquer uma das 3 seções, confirma antes de descartar — não existia
  // como risco nas telas separadas de antes; existe agora que tudo fica
  // na mesma tela.
  function selecionarCamada(id) {
    if (sujo && !window.confirm("Há alterações não salvas nesta camada — trocar mesmo assim?")) {
      return;
    }
    setCamadaSelecionadaId(id);
  }

  useEffect(() => {
    if (camadaSelecionadaId == null) {
      setArquivoForm(null);
      setEstiloForm(null);
      setAtributosLinhas(null);
      detalheAtualRef.current = { pmtiles: null, sourceLayerId: null };
      return;
    }

    let cancelado = false;
    setCarregandoDetalhe(true);
    setErroDetalhe(null);
    setAvisoEstilo(null);
    setSalvoArquivoEm(null);
    setSalvoEstiloEm(null);
    setSalvoAtributosEm(null);
    setSujo(false);

    (async () => {
      try {
        const camada = camadas.find((c) => c.id === camadaSelecionadaId);
        const [estiloSalvo, atributosSalvos, blob] = await Promise.all([
          buscarConfigEstilo(sessao.token, camadaSelecionadaId),
          buscarConfigAtributos(sessao.token, camadaSelecionadaId),
          baixarCamadaAdmin(sessao.token, camadaSelecionadaId),
        ]);

        // Um único PMTiles/metadata pro workspace inteiro — as 3 telas
        // separadas de antes baixavam o mesmo arquivo 3 vezes.
        const pmtiles = new PMTiles(new BlobSource(`admin-camada-${camadaSelecionadaId}`, blob));
        const metadata = await pmtiles.getMetadata();
        const todasCamadas = metadata?.vector_layers || [];
        const camadaPrincipal = todasCamadas.find((l) => l.id !== CAMADA_ROTULOS);
        const ehTalhao = "TALHAO" in (camadaPrincipal?.fields || {});
        const temRotulos = todasCamadas.some((l) => l.id === CAMADA_ROTULOS);
        const campos = Object.keys(camadaPrincipal?.fields || {});
        const ehPonto = camadaPrincipal ? (await detectarTipoGeometria(pmtiles, camadaPrincipal.id)) === 1 : false;

        if (cancelado) return;

        detalheAtualRef.current = { pmtiles, sourceLayerId: camadaPrincipal?.id || null };

        setArquivoForm({ nome: camada?.nome || "" });
        setNovaVersao(camada?.versao || "");
        setNovoArquivo([]);

        setTemRotulosNoDado(temRotulos);
        setEhPontoAtual(ehPonto);
        setCamposDisponiveis(campos);
        setNumClassesGraduado(5);
        setEstiloForm(
          normalizarEstiloConfig(estiloSalvo, {
            ehTalhao,
            ehPonto,
            corPadrao: corDaCamada(camadaSelecionadaId),
          })
        );

        setAtributosLinhas(mesclarConfigAtributos(campos, atributosSalvos));
      } catch (e) {
        if (!cancelado) setErroDetalhe(e.message);
      } finally {
        if (!cancelado) setCarregandoDetalhe(false);
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camadaSelecionadaId, sessao.token]);

  function atualizarArquivoFormCampo(valor) {
    setArquivoForm({ nome: valor });
    setSujo(true);
  }

  async function salvarArquivo() {
    setSalvandoArquivo(true);
    setErroDetalhe(null);
    try {
      await renomearCamadaAdmin(sessao.token, camadaSelecionadaId, arquivoForm.nome);
      setCamadas((atual) =>
        atual.map((c) => (c.id === camadaSelecionadaId ? { ...c, nome: arquivoForm.nome } : c))
      );
      setSalvoArquivoEm(new Date());
      setSujo(false);
    } catch (e) {
      setErroDetalhe(e.message);
    } finally {
      setSalvandoArquivo(false);
    }
  }

  async function enviarNovoArquivo(e) {
    e.preventDefault();
    if (novoArquivo.length === 0) {
      setErroDetalhe("Selecione um .pmtiles ou os arquivos do shapefile (.shp/.dbf/.shx/.prj)");
      return;
    }
    setSalvandoArquivo(true);
    setErroDetalhe(null);
    const nomeCamada = camadas.find((c) => c.id === camadaSelecionadaId)?.nome || "camada";
    try {
      const { jobId } = await atualizarArquivoCamadaAdmin(sessao.token, camadaSelecionadaId, {
        versao: novaVersao,
        arquivos: novoArquivo,
      });
      setNovoArquivo([]);
      setSujo(false);
      acompanharJob(jobId, nomeCamada, {
        aoSucesso: async () => {
          await carregarCamadas();
          setSalvoArquivoEm(new Date());
        },
        aoErro: (job) => setErroLista(`Falha ao atualizar arquivo de "${nomeCamada}": ${job.erro}`),
      });
    } catch (e) {
      setErroDetalhe(e.message);
    } finally {
      setSalvandoArquivo(false);
    }
  }

  async function removerCamadaSelecionada() {
    const camada = camadas.find((c) => c.id === camadaSelecionadaId);
    if (
      !window.confirm(
        `Remover "${camada?.nome}"? Os usuários que já baixaram continuam com a cópia local até o próximo sync, mas a camada some do catálogo.`
      )
    ) {
      return;
    }
    setRemovendo(true);
    setErroDetalhe(null);
    try {
      await removerCamadaAdmin(sessao.token, camadaSelecionadaId);
      setCamadaSelecionadaId(null);
      await carregarCamadas();
    } catch (e) {
      setErroDetalhe(e.message);
    } finally {
      setRemovendo(false);
    }
  }

  function atualizarPreenchimento(campo, valor) {
    setEstiloForm((atual) => ({ ...atual, preenchimento: { ...atual.preenchimento, [campo]: valor } }));
    setSujo(true);
  }

  // Campo de nível superior do estilo (hoje só tipoDesenho) — mesmo padrão
  // dos outros atualizarX, sem sub-objeto.
  function atualizarEstiloFormCampo(campo, valor) {
    setEstiloForm((atual) => ({ ...atual, [campo]: valor }));
    setSujo(true);
  }

  // Categorizado combinando até 3 campos (igual "Valores únicos, muitos
  // campos" do ArcGIS Pro) — o principal fica em preenchimento.campo (select
  // de sempre), estes são os 0-2 extras. Mudar/remover não limpa categorias
  // sozinho (mesmo comportamento de sempre ao trocar o campo principal) —
  // usuário clica "Gerar categorias" de novo pra recalcular.
  function adicionarCampoAdicional() {
    if (estiloForm.preenchimento.camposAdicionais.length >= MAX_CAMPOS_ADICIONAIS) return;
    atualizarPreenchimento("camposAdicionais", [...estiloForm.preenchimento.camposAdicionais, ""]);
  }

  function atualizarCampoAdicional(indice, valor) {
    const campos = estiloForm.preenchimento.camposAdicionais.map((c, i) => (i === indice ? valor : c));
    atualizarPreenchimento("camposAdicionais", campos);
  }

  function removerCampoAdicional(indice) {
    atualizarPreenchimento(
      "camposAdicionais",
      estiloForm.preenchimento.camposAdicionais.filter((_, i) => i !== indice)
    );
  }

  function atualizarContorno(campo, valor) {
    setEstiloForm((atual) => ({ ...atual, contorno: { ...atual.contorno, [campo]: valor } }));
    setSujo(true);
  }

  function atualizarRotulo(campo, valor) {
    setEstiloForm((atual) => ({ ...atual, rotulo: { ...atual.rotulo, [campo]: valor } }));
    setSujo(true);
  }

  function atualizarVisibilidade(campo, valor) {
    setEstiloForm((atual) => ({ ...atual, visibilidade: { ...atual.visibilidade, [campo]: valor } }));
    setSujo(true);
  }

  function atualizarSimbolo(campo, valor) {
    setEstiloForm((atual) => ({ ...atual, simbolo: { ...atual.simbolo, [campo]: valor } }));
    setSujo(true);
  }

  function atualizarCategoriaForma(indice, forma) {
    setEstiloForm((atual) => {
      const categorias = atual.simbolo.categorias.map((c, i) => (i === indice ? { ...c, forma } : c));
      return { ...atual, simbolo: { ...atual.simbolo, categorias } };
    });
    setSujo(true);
  }

  function atualizarCategoria(indice, cor) {
    setEstiloForm((atual) => {
      const categorias = atual.preenchimento.categorias.map((c, i) => (i === indice ? { ...c, cor } : c));
      return { ...atual, preenchimento: { ...atual.preenchimento, categorias } };
    });
    setSujo(true);
  }

  function atualizarClasse(indice, campo, valor) {
    setEstiloForm((atual) => {
      const classes = atual.preenchimento.classes.map((c, i) =>
        i === indice ? { ...c, [campo]: valor } : c
      );
      return { ...atual, preenchimento: { ...atual.preenchimento, classes } };
    });
    setSujo(true);
  }

  async function gerarCategoriasParaCampo() {
    const { pmtiles, sourceLayerId } = detalheAtualRef.current;
    if (!pmtiles || !sourceLayerId || !estiloForm.preenchimento.campo) return;
    setGerandoCategorias(true);
    setAvisoEstilo(null);
    try {
      const campos = [estiloForm.preenchimento.campo, ...estiloForm.preenchimento.camposAdicionais];
      const valores =
        campos.length === 1
          ? await lerValoresUnicos(pmtiles, sourceLayerId, campos[0])
          : await lerValoresUnicosCombinados(pmtiles, sourceLayerId, campos);
      if (valores.length === 0) {
        setAvisoEstilo("Nenhum valor encontrado pra esse campo.");
      } else if (valores.length > MAX_CATEGORIAS) {
        setAvisoEstilo(
          `${valores.length} valores únicos encontrados — provavelmente não é um campo de categoria (ex: um ID). Escolha outro campo.`
        );
      } else {
        atualizarPreenchimento("categorias", gerarCategorias(valores));
      }
    } catch (e) {
      setAvisoEstilo(e.message);
    } finally {
      setGerandoCategorias(false);
    }
  }

  async function gerarFormasParaCampo() {
    const { pmtiles, sourceLayerId } = detalheAtualRef.current;
    if (!pmtiles || !sourceLayerId || !estiloForm.simbolo.campo) return;
    setGerandoFormas(true);
    setAvisoEstilo(null);
    try {
      const valores = await lerValoresUnicos(pmtiles, sourceLayerId, estiloForm.simbolo.campo);
      if (valores.length === 0) {
        setAvisoEstilo("Nenhum valor encontrado pra esse campo.");
      } else if (valores.length > MAX_CATEGORIAS) {
        setAvisoEstilo(
          `${valores.length} valores únicos encontrados — provavelmente não é um campo de categoria (ex: um ID). Escolha outro campo.`
        );
      } else {
        atualizarSimbolo("categorias", gerarCategoriasForma(valores));
      }
    } catch (e) {
      setAvisoEstilo(e.message);
    } finally {
      setGerandoFormas(false);
    }
  }

  async function calcularFaixasParaCampo() {
    const { pmtiles, sourceLayerId } = detalheAtualRef.current;
    if (!pmtiles || !sourceLayerId || !estiloForm.preenchimento.campoNumerico) return;
    setCalculandoFaixas(true);
    setAvisoEstilo(null);
    try {
      const minMax = await lerMinMax(pmtiles, sourceLayerId, estiloForm.preenchimento.campoNumerico);
      if (!minMax) {
        setAvisoEstilo("Nenhum valor numérico encontrado pra esse campo.");
      } else {
        const classes = gerarRampaClasses(
          minMax.min,
          minMax.max,
          Math.max(2, Number(numClassesGraduado) || 5),
          estiloForm.preenchimento.cor || corDaCamada(camadaSelecionadaId)
        );
        atualizarPreenchimento("classes", classes);
      }
    } catch (e) {
      setAvisoEstilo(e.message);
    } finally {
      setCalculandoFaixas(false);
    }
  }

  async function calcularFaixaGradiente() {
    const { pmtiles, sourceLayerId } = detalheAtualRef.current;
    if (!pmtiles || !sourceLayerId || !estiloForm.preenchimento.campoNumerico) return;
    setCalculandoFaixas(true);
    setAvisoEstilo(null);
    try {
      const minMax = await lerMinMax(pmtiles, sourceLayerId, estiloForm.preenchimento.campoNumerico);
      if (!minMax) {
        setAvisoEstilo("Nenhum valor numérico encontrado pra esse campo.");
      } else {
        setEstiloForm((atual) => ({
          ...atual,
          preenchimento: { ...atual.preenchimento, min: minMax.min, max: minMax.max },
        }));
        setSujo(true);
      }
    } catch (e) {
      setAvisoEstilo(e.message);
    } finally {
      setCalculandoFaixas(false);
    }
  }

  async function salvarEstilo() {
    setSalvandoEstilo(true);
    setErroDetalhe(null);
    try {
      await salvarConfigEstilo(sessao.token, camadaSelecionadaId, estiloForm);
      setSalvoEstiloEm(new Date());
      setSujo(false);
    } catch (e) {
      setErroDetalhe(e.message);
    } finally {
      setSalvandoEstilo(false);
    }
  }

  function alternarAtributoVisivel(indice) {
    setAtributosLinhas((atual) =>
      atual.map((linha, i) => (i === indice ? { ...linha, visivel: !linha.visivel } : linha))
    );
    setSujo(true);
  }

  function moverAtributo(indice, direcao) {
    setAtributosLinhas((atual) => {
      const novo = [...atual];
      const alvo = indice + direcao;
      if (alvo < 0 || alvo >= novo.length) return atual;
      [novo[indice], novo[alvo]] = [novo[alvo], novo[indice]];
      return novo;
    });
    setSujo(true);
  }

  async function salvarAtributos() {
    setSalvandoAtributos(true);
    setErroDetalhe(null);
    try {
      const atributos = atributosLinhas.map((l, ordem) => ({
        campo: l.campo,
        visivel: l.visivel,
        ordem,
      }));
      await salvarConfigAtributos(sessao.token, camadaSelecionadaId, atributos);
      setSalvoAtributosEm(new Date());
      setSujo(false);
    } catch (e) {
      setErroDetalhe(e.message);
    } finally {
      setSalvandoAtributos(false);
    }
  }

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoMap — Gerenciar camadas</strong>
        <span className="status-sync" />
        <button type="button" className="botao botao-sair" onClick={() => navigate(-1)}>
          ← Voltar
        </button>
      </header>

      <div className="workspace-camadas">
        <aside className="lista-camadas-workspace">
          <div className="cabecalho-lista-camadas">
            <label className="campo-select-mapa campo-select-mapa--inline">
              Filtrar por mapa
              <select value={filtroMapaId} onChange={(e) => setFiltroMapaId(e.target.value)}>
                <option value="">Todos os mapas</option>
                {mapas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="botao-secundario"
              onClick={() => setMostrarUpload((v) => !v)}
            >
              {mostrarUpload ? "Cancelar" : "+ Nova camada"}
            </button>
          </div>

          {erroLista && <p className="erro">{erroLista}</p>}

          {jobsEmAndamento.length > 0 && (
            <ul className="lista-jobs-em-andamento">
              {jobsEmAndamento.map((job) => (
                <li key={job.jobId}>
                  <span className="spinner" aria-hidden="true" />
                  Processando "{job.rotulo}"…
                </li>
              ))}
            </ul>
          )}

          {mostrarUpload && (
            <form onSubmit={enviarNovaCamada} className="cartao-form-admin form-upload-camada">
              {erroUpload && <p className="erro">{erroUpload}</p>}
              <label className="campo-form-admin">
                Mapa
                <select
                  value={formUpload.mapaId}
                  onChange={(e) => atualizarFormUpload("mapaId", e.target.value)}
                  required
                >
                  <option value="">Selecione…</option>
                  {mapas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo-form-admin">
                Nome
                <input
                  type="text"
                  required
                  value={formUpload.nome}
                  onChange={(e) => atualizarFormUpload("nome", e.target.value)}
                />
              </label>
              <label className="campo-form-admin">
                Versão
                <input
                  type="text"
                  required
                  value={formUpload.versao}
                  onChange={(e) => atualizarFormUpload("versao", e.target.value)}
                />
              </label>
              <label className="campo-form-admin">
                Categoria
                <input
                  type="text"
                  value={formUpload.categoria}
                  onChange={(e) => atualizarFormUpload("categoria", e.target.value)}
                />
              </label>
              <label className="campo-form-admin">
                Arquivo (.pmtiles já convertido, ou os arquivos do shapefile)
                <input
                  id="campo-arquivo-pmtiles"
                  type="file"
                  multiple
                  accept=".pmtiles,.shp,.dbf,.shx,.prj,.cpg,.qmd"
                  required
                  onChange={(e) => setArquivoUpload(Array.from(e.target.files))}
                />
                <span className="ajuda-campo-form-admin">
                  Selecione um .pmtiles pronto, ou os arquivos soltos do shapefile de uma vez
                  (.shp/.dbf/.shx/.prj, sem precisar zipar) — converte e gera o rótulo/número no
                  mapa automaticamente quando a camada tiver os campos certos (TALHAO+SECAO ou
                  DESC_SECAO).
                </span>
              </label>
              <button type="submit" disabled={enviando}>
                {enviando && <span className="spinner" aria-hidden="true" />}
                {enviando
                  ? ehConversaoShapefile(arquivoUpload)
                    ? "Convertendo shapefile… isso pode levar alguns minutos"
                    : "Enviando…"
                  : "Adicionar camada"}
              </button>
            </form>
          )}

          <ul className="lista-selecionavel-camadas">
            {camadasFiltradas.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`item-selecionavel-camada${camadaSelecionadaId === c.id ? " item-selecionavel-camada--ativo" : ""}`}
                  onClick={() => selecionarCamada(c.id)}
                >
                  <span
                    className="swatch-camada"
                    style={{
                      backgroundColor:
                        c.estilo_config?.preenchimento?.cor || c.estilo_config?.cor || corDaCamada(c.id),
                    }}
                    aria-hidden="true"
                  />
                  <span className="info-item-camada">
                    <strong>{c.nome}</strong>
                    <span className="detalhe-mapa-admin">
                      {nomeDoMapa(c.mapa_id)} · v{c.versao}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {camadasFiltradas.length === 0 && (
              <p className="sem-dados-estatistica">
                <IconeEstadoVazio /> Nenhuma camada aqui ainda.
              </p>
            )}
          </ul>
        </aside>

        <section className="detalhe-camada-workspace">
          {camadaSelecionadaId == null && (
            <p className="sem-dados-estatistica">
              Selecione uma camada na lista à esquerda pra editar arquivo, estilo e atributos.
            </p>
          )}

          {erroDetalhe && <p className="erro">{erroDetalhe}</p>}
          {carregandoDetalhe && <p>Carregando…</p>}

          {camadaSelecionadaId != null && !carregandoDetalhe && arquivoForm && (
            <>
              <div className="cartao-form-admin">
                <h2>Arquivo</h2>
                <label className="campo-form-admin">
                  Nomenclatura
                  <input
                    type="text"
                    value={arquivoForm.nome}
                    onChange={(e) => atualizarArquivoFormCampo(e.target.value)}
                  />
                </label>
                <div className="acoes-admin-atributos">
                  <button type="button" onClick={salvarArquivo} disabled={salvandoArquivo}>
                    {salvandoArquivo && <span className="spinner" aria-hidden="true" />}
                    {salvandoArquivo ? "Salvando…" : "Salvar nome"}
                  </button>
                  {salvoArquivoEm && (
                    <span className="confirmacao-salvo">
                      ✓ Salvo às{" "}
                      {salvoArquivoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>

                <form className="form-atualizar-arquivo form-atualizar-arquivo--workspace" onSubmit={enviarNovoArquivo}>
                  <input
                    type="text"
                    value={novaVersao}
                    onChange={(e) => {
                      setNovaVersao(e.target.value);
                      setSujo(true);
                    }}
                    aria-label="Nova versão"
                    placeholder="Versão"
                    required
                  />
                  <input
                    type="file"
                    multiple
                    accept=".pmtiles,.shp,.dbf,.shx,.prj,.cpg,.qmd"
                    onChange={(e) => {
                      setNovoArquivo(Array.from(e.target.files));
                      setSujo(true);
                    }}
                    aria-label="Novo arquivo (.pmtiles pronto ou os arquivos do shapefile)"
                  />
                  <button type="submit" disabled={salvandoArquivo}>
                    {salvandoArquivo && <span className="spinner" aria-hidden="true" />}
                    {salvandoArquivo && ehConversaoShapefile(novoArquivo) ? "Convertendo…" : "Atualizar arquivo"}
                  </button>
                </form>

                <button
                  type="button"
                  className="botao-remover-mapa botao-remover-camada-workspace"
                  onClick={removerCamadaSelecionada}
                  disabled={removendo}
                >
                  {removendo && <span className="spinner" aria-hidden="true" />}
                  {removendo ? "Removendo…" : "Remover camada"}
                </button>
              </div>

              <div className="cartao-form-admin">
                <h2>Estilo</h2>

                {!ehPontoAtual && (
                  <>
                    <h3 className="subtitulo-estilo">Tipo de desenho</h3>
                    <label className="campo-form-admin campo-form-admin--checkbox">
                      <input
                        type="radio"
                        name="tipo-desenho"
                        checked={estiloForm.tipoDesenho === "contorno"}
                        onChange={() => atualizarEstiloFormCampo("tipoDesenho", "contorno")}
                      />
                      Só contorno (linha)
                    </label>
                    <label className="campo-form-admin campo-form-admin--checkbox">
                      <input
                        type="radio"
                        name="tipo-desenho"
                        checked={estiloForm.tipoDesenho === "preenchimento"}
                        onChange={() => atualizarEstiloFormCampo("tipoDesenho", "preenchimento")}
                      />
                      Só preenchimento
                    </label>
                    <label className="campo-form-admin campo-form-admin--checkbox">
                      <input
                        type="radio"
                        name="tipo-desenho"
                        checked={estiloForm.tipoDesenho === "ambos"}
                        onChange={() => atualizarEstiloFormCampo("tipoDesenho", "ambos")}
                      />
                      Preenchimento + contorno
                    </label>
                  </>
                )}

                {(ehPontoAtual || estiloForm.tipoDesenho !== "contorno") && (
                  <>
                    <h3 className="subtitulo-estilo">Preenchimento</h3>
                <label className="campo-form-admin">
                  Modo
                  <select
                    value={estiloForm.preenchimento.modo}
                    onChange={(e) => atualizarPreenchimento("modo", e.target.value)}
                  >
                    <option value="simples">Cor única</option>
                    <option value="categorizado">Categorizado (1 cor por valor de um campo)</option>
                    <option value="graduado">Graduado (rampa de cor por faixa numérica)</option>
                    <option value="gradiente">Gradiente contínuo (2 cores por faixa numérica)</option>
                  </select>
                </label>

                {avisoEstilo && <p className="erro">{avisoEstilo}</p>}

                {estiloForm.preenchimento.modo === "simples" && (
                  <label className="campo-form-admin campo-form-admin--cor">
                    Cor
                    <input
                      type="color"
                      value={estiloForm.preenchimento.cor}
                      onChange={(e) => atualizarPreenchimento("cor", e.target.value)}
                    />
                    <span className="valor-cor-atual">{estiloForm.preenchimento.cor}</span>
                  </label>
                )}

                {estiloForm.preenchimento.modo === "categorizado" && (
                  <>
                    <label className="campo-form-admin">
                      Campo
                      <select
                        value={estiloForm.preenchimento.campo || ""}
                        onChange={(e) => atualizarPreenchimento("campo", e.target.value)}
                      >
                        <option value="">Selecione…</option>
                        {camposDisponiveis.map((campo) => (
                          <option key={campo} value={campo}>
                            {campo}
                          </option>
                        ))}
                      </select>
                    </label>

                    {estiloForm.preenchimento.camposAdicionais.map((campoAdicional, i) => (
                      <label key={i} className="campo-form-admin campo-form-admin--combinado">
                        Combinar com
                        <span className="linha-campo-combinado">
                          <select
                            value={campoAdicional}
                            onChange={(e) => atualizarCampoAdicional(i, e.target.value)}
                          >
                            <option value="">Selecione…</option>
                            {camposDisponiveis.map((campo) => (
                              <option key={campo} value={campo}>
                                {campo}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="botao-remover-campo-combinado"
                            onClick={() => removerCampoAdicional(i)}
                            aria-label="Remover este campo da combinação"
                            title="Remover este campo da combinação"
                          >
                            ×
                          </button>
                        </span>
                      </label>
                    ))}
                    {estiloForm.preenchimento.camposAdicionais.length < MAX_CAMPOS_ADICIONAIS && (
                      <button type="button" className="botao-secundario" onClick={adicionarCampoAdicional}>
                        + Combinar com outro campo
                      </button>
                    )}

                    <button
                      type="button"
                      className="botao-secundario"
                      onClick={gerarCategoriasParaCampo}
                      disabled={
                        !estiloForm.preenchimento.campo ||
                        estiloForm.preenchimento.camposAdicionais.some((c) => !c) ||
                        gerandoCategorias
                      }
                    >
                      {gerandoCategorias ? "Lendo valores…" : "Gerar categorias a partir dos dados"}
                    </button>
                    {estiloForm.preenchimento.categorias.length > 0 && (
                      <ul className="lista-categorias-estilo">
                        {estiloForm.preenchimento.categorias.map((cat, i) => (
                          <li key={cat.valor} className="linha-categoria-estilo">
                            <input
                              type="color"
                              value={cat.cor}
                              onChange={(e) => atualizarCategoria(i, e.target.value)}
                            />
                            <span>{formatarValorCategoria(cat.valor)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="campo-form-admin campo-form-admin--cor">
                      Cor pros valores sem categoria
                      <input
                        type="color"
                        value={estiloForm.preenchimento.corSemCategoria}
                        onChange={(e) => atualizarPreenchimento("corSemCategoria", e.target.value)}
                      />
                    </label>
                  </>
                )}

                {estiloForm.preenchimento.modo === "graduado" && (
                  <>
                    <label className="campo-form-admin">
                      Campo numérico
                      <select
                        value={estiloForm.preenchimento.campoNumerico || ""}
                        onChange={(e) => atualizarPreenchimento("campoNumerico", e.target.value)}
                      >
                        <option value="">Selecione…</option>
                        {camposDisponiveis.map((campo) => (
                          <option key={campo} value={campo}>
                            {campo}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="campo-form-admin">
                      Número de faixas
                      <input
                        type="number"
                        min="2"
                        max="9"
                        value={numClassesGraduado}
                        onChange={(e) => setNumClassesGraduado(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="botao-secundario"
                      onClick={calcularFaixasParaCampo}
                      disabled={!estiloForm.preenchimento.campoNumerico || calculandoFaixas}
                    >
                      {calculandoFaixas ? "Calculando…" : "Calcular faixas a partir dos dados"}
                    </button>
                    {estiloForm.preenchimento.classes.length > 0 && (
                      <ul className="lista-categorias-estilo">
                        {estiloForm.preenchimento.classes.map((classe, i) => (
                          <li key={i} className="linha-categoria-estilo">
                            <input
                              type="color"
                              value={classe.cor}
                              onChange={(e) => atualizarClasse(i, "cor", e.target.value)}
                            />
                            <span>até {classe.ate}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="campo-form-admin campo-form-admin--cor">
                      Cor abaixo da primeira faixa
                      <input
                        type="color"
                        value={estiloForm.preenchimento.corAbaixoDoMinimo}
                        onChange={(e) => atualizarPreenchimento("corAbaixoDoMinimo", e.target.value)}
                      />
                    </label>
                  </>
                )}

                {estiloForm.preenchimento.modo === "gradiente" && (
                  <>
                    <label className="campo-form-admin">
                      Campo numérico
                      <select
                        value={estiloForm.preenchimento.campoNumerico || ""}
                        onChange={(e) => atualizarPreenchimento("campoNumerico", e.target.value)}
                      >
                        <option value="">Selecione…</option>
                        {camposDisponiveis.map((campo) => (
                          <option key={campo} value={campo}>
                            {campo}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="campo-form-admin campo-form-admin--cor">
                      Cor inicial
                      <input
                        type="color"
                        value={estiloForm.preenchimento.corInicial || "#ffffff"}
                        onChange={(e) => atualizarPreenchimento("corInicial", e.target.value)}
                      />
                    </label>
                    <label className="campo-form-admin campo-form-admin--cor">
                      Cor final
                      <input
                        type="color"
                        value={estiloForm.preenchimento.corFinal || "#000000"}
                        onChange={(e) => atualizarPreenchimento("corFinal", e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="botao-secundario"
                      onClick={calcularFaixaGradiente}
                      disabled={!estiloForm.preenchimento.campoNumerico || calculandoFaixas}
                    >
                      {calculandoFaixas ? "Calculando…" : "Calcular faixa automaticamente"}
                    </button>
                    <label className="campo-form-admin">
                      Valor mínimo (cor inicial)
                      <input
                        type="number"
                        value={estiloForm.preenchimento.min}
                        onChange={(e) => atualizarPreenchimento("min", Number(e.target.value))}
                      />
                    </label>
                    <label className="campo-form-admin">
                      Valor máximo (cor final)
                      <input
                        type="number"
                        value={estiloForm.preenchimento.max}
                        onChange={(e) => atualizarPreenchimento("max", Number(e.target.value))}
                      />
                    </label>
                  </>
                )}

                <label className="campo-form-admin">
                  Opacidade do preenchimento ({estiloForm.preenchimento.opacidade})
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={estiloForm.preenchimento.opacidade}
                    onChange={(e) => atualizarPreenchimento("opacidade", Number(e.target.value))}
                  />
                </label>
                  </>
                )}

                {(ehPontoAtual || estiloForm.tipoDesenho !== "preenchimento") && (
                  <>
                <h3 className="subtitulo-estilo">Contorno</h3>
                <label className="campo-form-admin campo-form-admin--cor">
                  Cor
                  <input
                    type="color"
                    value={estiloForm.contorno.cor}
                    onChange={(e) => atualizarContorno("cor", e.target.value)}
                  />
                </label>
                <label className="campo-form-admin">
                  Largura ({estiloForm.contorno.largura}px)
                  <input
                    type="range"
                    min="0.5"
                    max="6"
                    step="0.5"
                    value={estiloForm.contorno.largura}
                    onChange={(e) => atualizarContorno("largura", Number(e.target.value))}
                  />
                </label>
                <label className="campo-form-admin">
                  Opacidade ({estiloForm.contorno.opacidade})
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={estiloForm.contorno.opacidade}
                    onChange={(e) => atualizarContorno("opacidade", Number(e.target.value))}
                  />
                </label>
                {!ehPontoAtual && (
                  <label className="campo-form-admin">
                    Estilo do traço
                    <select
                      value={estiloForm.contorno.estiloTraco}
                      onChange={(e) => atualizarContorno("estiloTraco", e.target.value)}
                    >
                      <option value="solido">Sólido</option>
                      <option value="tracejado">Tracejado</option>
                      <option value="pontilhado">Pontilhado</option>
                    </select>
                  </label>
                )}
                  </>
                )}

                {ehPontoAtual && (
                  <>
                    <h3 className="subtitulo-estilo">Símbolo (forma do ponto)</h3>
                    <label className="campo-form-admin campo-form-admin--checkbox">
                      <input
                        type="radio"
                        name="modo-simbolo"
                        checked={estiloForm.simbolo.modo === "fixo"}
                        onChange={() => atualizarSimbolo("modo", "fixo")}
                      />
                      1 forma pra camada toda
                    </label>
                    <label className="campo-form-admin campo-form-admin--checkbox">
                      <input
                        type="radio"
                        name="modo-simbolo"
                        checked={estiloForm.simbolo.modo === "categorizado"}
                        onChange={() => atualizarSimbolo("modo", "categorizado")}
                      />
                      Uma forma por categoria de atributo
                    </label>

                    {estiloForm.simbolo.modo === "fixo" ? (
                      <label className="campo-form-admin">
                        Forma
                        <select
                          value={estiloForm.simbolo.forma}
                          onChange={(e) => atualizarSimbolo("forma", e.target.value)}
                        >
                          {FORMAS_PONTO.map((f) => (
                            <option key={f.valor} value={f.valor}>
                              {f.rotulo}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <>
                        <label className="campo-form-admin">
                          Campo
                          <select
                            value={estiloForm.simbolo.campo || ""}
                            onChange={(e) => atualizarSimbolo("campo", e.target.value || null)}
                          >
                            <option value="">Selecione um campo…</option>
                            {camposDisponiveis.map((campo) => (
                              <option key={campo} value={campo}>
                                {campo}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="botao-secundario"
                          onClick={gerarFormasParaCampo}
                          disabled={!estiloForm.simbolo.campo || gerandoFormas}
                        >
                          {gerandoFormas ? "Gerando…" : "Gerar formas a partir dos dados"}
                        </button>
                        {estiloForm.simbolo.categorias.length > 0 && (
                          <ul className="lista-categorias-estilo">
                            {estiloForm.simbolo.categorias.map((cat, i) => (
                              <li key={cat.valor} className="linha-categoria-estilo">
                                <select
                                  value={cat.forma}
                                  onChange={(e) => atualizarCategoriaForma(i, e.target.value)}
                                >
                                  {FORMAS_PONTO.map((f) => (
                                    <option key={f.valor} value={f.valor}>
                                      {f.rotulo}
                                    </option>
                                  ))}
                                </select>
                                <span>{formatarValorCategoria(cat.valor)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <label className="campo-form-admin">
                          Forma pros valores fora da lista
                          <select
                            value={estiloForm.simbolo.formaSemCategoria}
                            onChange={(e) => atualizarSimbolo("formaSemCategoria", e.target.value)}
                          >
                            {FORMAS_PONTO.map((f) => (
                              <option key={f.valor} value={f.valor}>
                                {f.rotulo}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}

                    {(estiloForm.simbolo.modo === "categorizado" || estiloForm.simbolo.forma !== "circulo") && (
                      <span className="detalhe-mapa-admin">
                        Formas diferentes de círculo (ou por categoria) sempre aparecem
                        preenchidas — preenchimento e contorno não têm opacidade
                        independente nelas como têm no círculo.
                      </span>
                    )}
                  </>
                )}

                <h3 className="subtitulo-estilo">Rótulo</h3>
                <label className="campo-form-admin campo-form-admin--checkbox">
                  <input
                    type="checkbox"
                    checked={estiloForm.rotulo.mostrar}
                    onChange={(e) => atualizarRotulo("mostrar", e.target.checked)}
                  />
                  Mostrar rótulo
                </label>

                {estiloForm.rotulo.mostrar && (
                  <>
                    <label className="campo-form-admin campo-form-admin--checkbox">
                      <input
                        type="radio"
                        name="origem-rotulo"
                        checked={estiloForm.rotulo.origem === "pipeline"}
                        disabled={!temRotulosNoDado}
                        onChange={() => atualizarRotulo("origem", "pipeline")}
                      />
                      Camada de rótulos do pipeline
                      {!temRotulosNoDado && " (esta camada não tem rótulos gerados no pipeline)"}
                    </label>
                    <label className="campo-form-admin campo-form-admin--checkbox">
                      <input
                        type="radio"
                        name="origem-rotulo"
                        checked={estiloForm.rotulo.origem === "atributo"}
                        onChange={() => atualizarRotulo("origem", "atributo")}
                      />
                      Direto de um atributo do polígono
                    </label>

                    {estiloForm.rotulo.origem === "atributo" && (
                      <label className="campo-form-admin">
                        Campo do rótulo
                        <select
                          value={estiloForm.rotulo.campo || ""}
                          onChange={(e) => atualizarRotulo("campo", e.target.value)}
                        >
                          <option value="">Selecione…</option>
                          {camposDisponiveis.map((campo) => (
                            <option key={campo} value={campo}>
                              {campo}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="campo-form-admin">
                      Tamanho da fonte ({estiloForm.rotulo.tamanhoFonte}px)
                      <input
                        type="range"
                        min="8"
                        max="24"
                        step="1"
                        value={estiloForm.rotulo.tamanhoFonte}
                        onChange={(e) => atualizarRotulo("tamanhoFonte", Number(e.target.value))}
                      />
                    </label>
                    <label className="campo-form-admin campo-form-admin--cor">
                      Cor do texto
                      <input
                        type="color"
                        value={estiloForm.rotulo.cor}
                        onChange={(e) => atualizarRotulo("cor", e.target.value)}
                      />
                    </label>
                    <label className="campo-form-admin">
                      Zoom mínimo do rótulo ({estiloForm.rotulo.zoomMinimo})
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="1"
                        value={estiloForm.rotulo.zoomMinimo}
                        onChange={(e) => atualizarRotulo("zoomMinimo", Number(e.target.value))}
                      />
                    </label>
                  </>
                )}

                <h3 className="subtitulo-estilo">Visibilidade da camada</h3>
                <label className="campo-form-admin">
                  Zoom mínimo ({estiloForm.visibilidade.zoomMinimo})
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="1"
                    value={estiloForm.visibilidade.zoomMinimo}
                    onChange={(e) => atualizarVisibilidade("zoomMinimo", Number(e.target.value))}
                  />
                </label>
                <label className="campo-form-admin">
                  Zoom máximo ({estiloForm.visibilidade.zoomMaximo})
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="1"
                    value={estiloForm.visibilidade.zoomMaximo}
                    onChange={(e) => atualizarVisibilidade("zoomMaximo", Number(e.target.value))}
                  />
                </label>

                <div className="acoes-admin-atributos">
                  <button type="button" onClick={salvarEstilo} disabled={salvandoEstilo}>
                    {salvandoEstilo && <span className="spinner" aria-hidden="true" />}
                    {salvandoEstilo ? "Salvando…" : "Salvar estilo"}
                  </button>
                  {salvoEstiloEm && (
                    <span className="confirmacao-salvo">
                      ✓ Salvo às{" "}
                      {salvoEstiloEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>

              <div className="cartao-form-admin">
                <h2>Atributos</h2>
                <p className="contagem-atributos">
                  {atributosLinhas.filter((l) => l.visivel).length} de {atributosLinhas.length} visíveis
                </p>
                <ul className="lista-atributos-admin">
                  {atributosLinhas.map((linha, i) => (
                    <li
                      key={linha.campo}
                      className={`linha-atributo-admin${linha.visivel ? "" : " linha-atributo-admin--oculto"}`}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={linha.visivel}
                          onChange={() => alternarAtributoVisivel(i)}
                        />
                        {linha.campo}
                      </label>
                      <div className="botoes-ordem">
                        <button
                          type="button"
                          onClick={() => moverAtributo(i, -1)}
                          disabled={i === 0}
                          aria-label={`Mover ${linha.campo} pra cima`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moverAtributo(i, 1)}
                          disabled={i === atributosLinhas.length - 1}
                          aria-label={`Mover ${linha.campo} pra baixo`}
                        >
                          ↓
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="acoes-admin-atributos">
                  <button type="button" onClick={salvarAtributos} disabled={salvandoAtributos}>
                    {salvandoAtributos && <span className="spinner" aria-hidden="true" />}
                    {salvandoAtributos ? "Salvando…" : "Salvar atributos"}
                  </button>
                  {salvoAtributosEm && (
                    <span className="confirmacao-salvo">
                      ✓ Salvo às{" "}
                      {salvoAtributosEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
