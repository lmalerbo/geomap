import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PMTiles } from "pmtiles";
import {
  listarCamadasAdmin,
  listarMapasAdmin,
  enviarCamadaAdmin,
  atualizarArquivoCamadaAdmin,
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
  FORMAS_PONTO,
} from "../lib/estiloCamada.js";
import { lerValoresUnicos, lerMinMax, detectarTipoGeometria } from "../lib/pmtilesValores.js";
import { useAuth } from "../context/AuthContext.jsx";

const CAMADA_ROTULOS = "rotulos";
const MAX_CATEGORIAS = 30;

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

function ehZip(arquivo) {
  return arquivo?.name.toLowerCase().endsWith(".zip");
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
  const [arquivoUpload, setArquivoUpload] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erroUpload, setErroUpload] = useState(null);

  const [camadaSelecionadaId, setCamadaSelecionadaId] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState(null);
  const [sujo, setSujo] = useState(false);

  const [arquivoForm, setArquivoForm] = useState(null); // { nome }
  const [novaVersao, setNovaVersao] = useState("");
  const [novoArquivo, setNovoArquivo] = useState(null);
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
    if (!arquivoUpload) {
      setErroUpload("Selecione um arquivo .pmtiles ou .zip (shapefile)");
      return;
    }
    if (!formUpload.mapaId) {
      setErroUpload("Selecione a qual mapa essa camada pertence");
      return;
    }
    setEnviando(true);
    setErroUpload(null);
    try {
      const nova = await enviarCamadaAdmin(sessao.token, { ...formUpload, arquivo: arquivoUpload });
      setFormUpload(FORM_UPLOAD_VAZIO);
      setArquivoUpload(null);
      document.getElementById("campo-arquivo-pmtiles").value = "";
      setMostrarUpload(false);
      await carregarCamadas();
      setCamadaSelecionadaId(nova.id);
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
        setNovoArquivo(null);

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
    if (!novoArquivo) {
      setErroDetalhe("Selecione um arquivo .pmtiles ou .zip (shapefile)");
      return;
    }
    setSalvandoArquivo(true);
    setErroDetalhe(null);
    try {
      await atualizarArquivoCamadaAdmin(sessao.token, camadaSelecionadaId, {
        versao: novaVersao,
        arquivo: novoArquivo,
      });
      setNovoArquivo(null);
      await carregarCamadas();
      setSalvoArquivoEm(new Date());
      setSujo(false);
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
      const valores = await lerValoresUnicos(pmtiles, sourceLayerId, estiloForm.preenchimento.campo);
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
                Arquivo (.zip do shapefile ou .pmtiles já convertido)
                <input
                  id="campo-arquivo-pmtiles"
                  type="file"
                  accept=".pmtiles,.zip"
                  required
                  onChange={(e) => setArquivoUpload(e.target.files[0] || null)}
                />
                <span className="ajuda-campo-form-admin">
                  Zip precisa conter .shp + .dbf + .shx (e .prj, se tiver). Converte automaticamente —
                  sem rótulo/número no mapa ainda, isso continua manual por enquanto.
                </span>
              </label>
              <button type="submit" disabled={enviando}>
                {enviando
                  ? ehZip(arquivoUpload)
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
              <p className="sem-dados-estatistica">Nenhuma camada aqui ainda.</p>
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
                    accept=".pmtiles,.zip"
                    onChange={(e) => {
                      setNovoArquivo(e.target.files[0] || null);
                      setSujo(true);
                    }}
                    aria-label="Novo arquivo (.zip do shapefile ou .pmtiles)"
                  />
                  <button type="submit" disabled={salvandoArquivo}>
                    {salvandoArquivo && ehZip(novoArquivo) ? "Convertendo…" : "Atualizar arquivo"}
                  </button>
                </form>

                <button
                  type="button"
                  className="botao-remover-mapa botao-remover-camada-workspace"
                  onClick={removerCamadaSelecionada}
                  disabled={removendo}
                >
                  {removendo ? "Removendo…" : "Remover camada"}
                </button>
              </div>

              <div className="cartao-form-admin">
                <h2>Estilo</h2>

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
                    <button
                      type="button"
                      className="botao-secundario"
                      onClick={gerarCategoriasParaCampo}
                      disabled={!estiloForm.preenchimento.campo || gerandoCategorias}
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
                            <span>{String(cat.valor)}</span>
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
                                <span>{String(cat.valor)}</span>
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
