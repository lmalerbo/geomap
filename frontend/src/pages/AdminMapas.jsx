import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listarMapasAdmin,
  listarGruposAdmin,
  listarCamadasAdmin,
  criarMapaAdmin,
  atualizarMapaAdmin,
  removerMapaAdmin,
  duplicarMapaAdmin,
  atualizarOrdemCamadasAdmin,
} from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useResumoAdmin } from "../components/LayoutAdmin.jsx";
import IconeEstadoVazio from "../components/IconeEstadoVazio.jsx";

// Mapas (redesenho do admin, fase 5): lista em cards à esquerda e o mapa
// escolhido à direita, em abas — Camadas (ordem de cima pra baixo), Acesso
// (grupos que veem e podem anotar) e Detalhes (nome, descrição, duplicar,
// remover). No celular, lista e painel aparecem um de cada vez.

const ABAS = [
  { id: "camadas", rotulo: "Camadas" },
  { id: "acesso", rotulo: "Acesso" },
  { id: "detalhes", rotulo: "Detalhes" },
];

const SITUACAO = {
  atrasada: { rotulo: "Atrasada", classe: "alerta" },
  erro: { rotulo: "Falhou", classe: "erro" },
  atualizando: { rotulo: "Atualizando", classe: "andamento" },
  em_dia: { rotulo: "Automação", classe: "ok" },
};

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

function textoGrupos(permissoes, grupos) {
  if (!permissoes?.length) return "Nenhum grupo";
  return permissoes
    .map((p) => `${grupos.find((g) => g.id === p.grupoId)?.nome ?? "?"}${p.podeEditar ? " (anota)" : ""}`)
    .join(", ");
}

function EditorAcesso({ grupos, permissoes, aoMudar }) {
  if (grupos.length === 0) {
    return <p className="adm-suave">Nenhum grupo criado ainda — crie em Usuários e grupos.</p>;
  }
  return (
    <ul className="adm-lista-acesso">
      {grupos.map((g) => {
        const p = permissoes.find((x) => x.grupoId === g.id);
        return (
          <li key={g.id} className={p ? "ativo" : ""}>
            <label className="adm-acesso-grupo">
              <input
                type="checkbox"
                checked={Boolean(p)}
                onChange={() =>
                  aoMudar(p ? permissoes.filter((x) => x.grupoId !== g.id) : [...permissoes, { grupoId: g.id, podeEditar: false }])
                }
              />
              <span className="adm-avatar adm-avatar--grupo" aria-hidden="true">
                {g.nome.charAt(0).toUpperCase()}
              </span>
              <span className="adm-forte">{g.nome}</span>
            </label>
            <label className={`adm-interruptor${p ? "" : " desativado"}`}>
              <input
                type="checkbox"
                role="switch"
                disabled={!p}
                checked={p?.podeEditar === true}
                onChange={() => aoMudar(permissoes.map((x) => (x.grupoId === g.id ? { ...x, podeEditar: !x.podeEditar } : x)))}
              />
              <span aria-hidden="true" />
              Pode anotar
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminMapas() {
  const { sessao } = useAuth();
  const { resumo, recarregarResumo } = useResumoAdmin();
  const [params, setParams] = useSearchParams();
  const [mapas, setMapas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [camadas, setCamadas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [aba, setAba] = useState("camadas");
  const [ocupado, setOcupado] = useState(null); // "ordem" | "acesso" | "detalhes" | "duplicar" | "remover" | "criar"

  // Rascunhos do mapa selecionado (descartados ao trocar de mapa).
  const [ordem, setOrdem] = useState([]);
  const [permissoes, setPermissoes] = useState([]);
  const [detalhes, setDetalhes] = useState({ nome: "", descricao: "" });
  const [novo, setNovo] = useState({ nome: "", descricao: "", permissoes: [] });
  const [arrastando, setArrastando] = useState(null);
  // Ref além do state: eventos de drag não garantem que o setState do
  // dragstart já aplicou quando o drop chega (mesmo motivo de AdminCamadas).
  const arrastandoRef = useRef(null);

  const selecionado = params.get("mapa") || null; // id (string) | "novo" | null
  const mapa = mapas.find((m) => String(m.id) === selecionado) || null;

  async function carregar() {
    const [m, g, c] = await Promise.all([
      listarMapasAdmin(sessao.token),
      listarGruposAdmin(sessao.token),
      listarCamadasAdmin(sessao.token),
    ]);
    setMapas(m);
    setGrupos(g);
    setCamadas(c);
    return m;
  }

  useEffect(() => {
    carregar()
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao.token]);

  // Desktop abre já com o primeiro mapa; no celular a lista vem primeiro.
  useEffect(() => {
    if (!selecionado && mapas.length > 0 && window.matchMedia("(min-width: 901px)").matches) {
      setParams({ mapa: String(mapas[0].id) }, { replace: true });
    }
  }, [mapas, selecionado, setParams]);

  const camadasDoMapa = useMemo(
    () => camadas.filter((c) => mapa && c.mapa_id === mapa.id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
    [camadas, mapa]
  );

  useEffect(() => {
    setOrdem(camadasDoMapa);
    setPermissoes(mapa?.permissoes || []);
    setDetalhes({ nome: mapa?.nome || "", descricao: mapa?.descricao || "" });
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa?.id, camadasDoMapa]);

  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(id);
  }, [aviso]);

  const situacaoPorCamada = useMemo(
    () => new Map((resumo?.automacao.camadas || []).map((c) => [c.id, c])),
    [resumo]
  );

  function selecionar(id) {
    setParams(id ? { mapa: String(id) } : {});
    setAba("camadas");
  }

  const ordemMudou = ordem.map((c) => c.id).join(",") !== camadasDoMapa.map((c) => c.id).join(",");
  const acessoMudou =
    JSON.stringify([...permissoes].sort((a, b) => a.grupoId - b.grupoId)) !==
    JSON.stringify([...(mapa?.permissoes || [])].sort((a, b) => a.grupoId - b.grupoId));
  const detalhesMudou = mapa && (detalhes.nome !== mapa.nome || detalhes.descricao !== (mapa.descricao || ""));
  const temVoos = camadasDoMapa.some((c) => c.estilo_config?.tipoCamada === "voos");

  function mover(origem, destino) {
    if (origem === destino) return;
    setOrdem((atual) => {
      const novaOrdem = [...atual];
      const [item] = novaOrdem.splice(origem, 1);
      novaOrdem.splice(destino, 0, item);
      return novaOrdem;
    });
  }

  async function executar(tipo, acao, mensagem) {
    setOcupado(tipo);
    setErro(null);
    try {
      await acao();
      if (mensagem) setAviso(mensagem);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  }

  const salvarOrdem = () =>
    executar(
      "ordem",
      async () => {
        await atualizarOrdemCamadasAdmin(sessao.token, mapa.id, ordem.map((c) => c.id));
        await carregar();
      },
      "Ordem salva · vale para todos no próximo sincronismo"
    );

  const salvarMapa = (tipo) =>
    executar(
      tipo,
      async () => {
        await atualizarMapaAdmin(sessao.token, mapa.id, {
          nome: tipo === "detalhes" ? detalhes.nome : mapa.nome,
          descricao: tipo === "detalhes" ? detalhes.descricao : mapa.descricao || "",
          permissoes: tipo === "acesso" ? permissoes : mapa.permissoes || [],
        });
        await carregar();
      },
      tipo === "acesso" ? "Acesso salvo" : "Detalhes salvos"
    );

  const duplicar = () =>
    executar(
      "duplicar",
      async () => {
        const copia = await duplicarMapaAdmin(sessao.token, mapa.id);
        await carregar();
        recarregarResumo();
        if (copia?.id) selecionar(copia.id);
      },
      "Mapa duplicado"
    );

  const remover = () => {
    if (!window.confirm(`Remover o mapa "${mapa.nome}"? Essa ação não pode ser desfeita.`)) return;
    executar("remover", async () => {
      await removerMapaAdmin(sessao.token, mapa.id);
      await carregar();
      recarregarResumo();
      selecionar(null);
    }, "Mapa removido");
  };

  async function criar(e) {
    e.preventDefault();
    await executar(
      "criar",
      async () => {
        const criado = await criarMapaAdmin(sessao.token, novo);
        setNovo({ nome: "", descricao: "", permissoes: [] });
        await carregar();
        recarregarResumo();
        selecionar(criado.id);
      },
      "Mapa criado"
    );
  }

  const termo = filtro.trim().toLowerCase();
  const mapasFiltrados = mapas.filter(
    (m) => !termo || m.nome.toLowerCase().includes(termo) || (m.descricao || "").toLowerCase().includes(termo)
  );
  const totalCamadas = mapas.reduce((s, m) => s + (m.camadaCount || 0), 0);

  return (
    <div className={`adm-pagina adm-mapas${selecionado ? " adm-mapas--detalhe" : ""}`}>
      <header className="adm-cabecalho">
        <div>
          <h1>Mapas</h1>
          <p>
            {plural(mapas.length, "mapa", "mapas")} · {plural(totalCamadas, "camada", "camadas")} · escolha um mapa para ver camadas e
            acesso
          </p>
        </div>
      </header>

      {erro && <p className="erro">{erro}</p>}
      {aviso && (
        <p className="adm-toast" role="status">
          {aviso}
        </p>
      )}

      <div className="adm-mestre-detalhe">
        <section className="adm-mestre" aria-label="Lista de mapas">
          <div className="adm-barra-lista">
            <input
              type="search"
              className="adm-busca"
              placeholder="Filtrar mapas"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              aria-label="Filtrar mapas"
            />
            <button type="button" className="botao-acao-primario" onClick={() => selecionar("novo")}>
              + Novo mapa
            </button>
          </div>
          {carregando ? (
            <p className="status-carregando-admin">
              <span className="spinner" aria-hidden="true" /> Carregando…
            </p>
          ) : mapasFiltrados.length === 0 ? (
            <p className="adm-vazio">
              <IconeEstadoVazio /> {mapas.length === 0 ? "Nenhum mapa criado ainda." : "Nenhum mapa com esse nome."}
            </p>
          ) : (
            <ul className="adm-lista-cartoes">
              {mapasFiltrados.map((m) => {
                const atrasadas = camadas.filter(
                  (c) => c.mapa_id === m.id && ["atrasada", "erro"].includes(situacaoPorCamada.get(c.id)?.situacao)
                );
                const voos = camadas.some((c) => c.mapa_id === m.id && c.estilo_config?.tipoCamada === "voos");
                const anota = (m.permissoes || []).some((p) => p.podeEditar);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      className={`adm-cartao-mapa${String(m.id) === selecionado ? " selecionado" : ""}`}
                      onClick={() => selecionar(m.id)}
                      aria-current={String(m.id) === selecionado ? "true" : undefined}
                    >
                      <span className="adm-cartao-mapa-topo">
                        <strong>{m.nome}</strong>
                        {voos && <span className="adm-etiqueta">Apontamento de voo</span>}
                        {!voos && anota && <span className="adm-etiqueta">Anotações</span>}
                      </span>
                      {m.descricao && <span className="adm-suave">{m.descricao}</span>}
                      <span className="adm-cartao-mapa-rodape">
                        {plural(m.camadaCount || 0, "camada", "camadas")} · {textoGrupos(m.permissoes, grupos)}
                      </span>
                      {atrasadas.length > 0 && (
                        <span className="adm-chip adm-chip--alerta">
                          {[...new Set(atrasadas.map((c) => c.nome))].join(", ")} atrasada
                          {atrasadas.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="adm-detalhe" aria-label="Mapa selecionado">
          {selecionado === "novo" ? (
            <form className="adm-cartao adm-form" onSubmit={criar}>
              <button type="button" className="adm-voltar-lista" onClick={() => selecionar(null)}>
                ← Mapas
              </button>
              <h2>Novo mapa</h2>
              <label className="adm-campo">
                Nome
                <input type="text" required value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
              </label>
              <label className="adm-campo">
                Descrição
                <input type="text" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
              </label>
              <div className="adm-campo">
                Quem vê este mapa
                <EditorAcesso grupos={grupos} permissoes={novo.permissoes} aoMudar={(p) => setNovo({ ...novo, permissoes: p })} />
              </div>
              <div className="adm-acoes-form">
                <button type="submit" className="botao-acao-primario" disabled={ocupado === "criar"}>
                  {ocupado === "criar" && <span className="spinner" aria-hidden="true" />}
                  {ocupado === "criar" ? "Criando…" : "Criar mapa"}
                </button>
              </div>
            </form>
          ) : !mapa ? (
            !carregando && (
              <p className="adm-vazio adm-cartao">
                <IconeEstadoVazio /> Escolha um mapa na lista.
              </p>
            )
          ) : (
            <div className="adm-cartao adm-painel-mapa">
              <button type="button" className="adm-voltar-lista" onClick={() => selecionar(null)}>
                ← Mapas
              </button>
              <div className="adm-painel-titulo">
                <div>
                  <h2>{mapa.nome}</h2>
                  <p className="adm-suave">
                    {plural(mapa.camadaCount || 0, "camada", "camadas")} · {textoGrupos(mapa.permissoes, grupos)}
                  </p>
                </div>
                <Link to={`/mapa/${mapa.id}`} className="botao-acao-secundario adm-link-botao">
                  Abrir no mapa
                </Link>
              </div>

              <div className="segmentado adm-abas" role="tablist" aria-label="Seções do mapa">
                {ABAS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="tab"
                    aria-selected={aba === a.id}
                    className={aba === a.id ? "ativo" : ""}
                    onClick={() => setAba(a.id)}
                  >
                    {a.rotulo}
                  </button>
                ))}
              </div>

              {aba === "camadas" && (
                <div className="adm-aba" role="tabpanel">
                  <div className="adm-aba-topo">
                    <span className="adm-suave">
                      {temVoos
                        ? "Mapa com camada de voos: a ordem fica fixa (a camada de voos sempre por cima)."
                        : ordem.length > 1
                          ? "Arraste para ordenar — a de cima aparece por cima no mapa."
                          : "Com uma camada só não há o que ordenar."}
                    </span>
                    <Link to={`/admin/camadas?mapaId=${mapa.id}`} className="adm-link-forte">
                      + Adicionar camada
                    </Link>
                  </div>
                  {ordem.length === 0 ? (
                    <p className="adm-vazio">
                      <IconeEstadoVazio /> Nenhuma camada neste mapa ainda.
                    </p>
                  ) : (
                    <ol className="adm-lista-ordem">
                      {ordem.map((c, i) => {
                        const sit = situacaoPorCamada.get(c.id);
                        const s = sit && SITUACAO[sit.situacao];
                        const podeArrastar = !temVoos && ordem.length > 1;
                        return (
                          <li
                            key={c.id}
                            draggable={podeArrastar}
                            onDragStart={() => {
                              arrastandoRef.current = i;
                              setArrastando(i);
                            }}
                            onDragOver={(e) => podeArrastar && e.preventDefault()}
                            onDrop={() => {
                              if (arrastandoRef.current !== null) mover(arrastandoRef.current, i);
                              arrastandoRef.current = null;
                              setArrastando(null);
                            }}
                            onDragEnd={() => {
                              arrastandoRef.current = null;
                              setArrastando(null);
                            }}
                            className={arrastando === i ? "arrastando" : ""}
                          >
                            {podeArrastar && (
                              <span className="adm-alca" aria-hidden="true">
                                ⠿
                              </span>
                            )}
                            <span className="adm-posicao">{i + 1}</span>
                            <span className="adm-ordem-nome">
                              <Link to={`/admin/camadas?camada=${c.id}`} className="adm-forte">
                                {c.nome}
                              </Link>
                              <small className="adm-suave">
                                Versão {c.versao}
                                {c.estilo_config?.tipoCamada === "voos" ? " · camada de voos" : ""}
                              </small>
                            </span>
                            {s && (
                              <span className={`adm-chip adm-chip--${s.classe}`}>
                                {sit.situacao === "atrasada" ? `${s.rotulo} · ${plural(sit.diasAtraso, "dia", "dias")}` : s.rotulo}
                              </span>
                            )}
                            {podeArrastar && (
                              <span className="adm-setas">
                                <button type="button" onClick={() => mover(i, i - 1)} disabled={i === 0} aria-label={`Subir ${c.nome}`}>
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => mover(i, i + 1)}
                                  disabled={i === ordem.length - 1}
                                  aria-label={`Descer ${c.nome}`}
                                >
                                  ↓
                                </button>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {ordemMudou && (
                    <div className="adm-barra-pendente" role="status">
                      <span>Ordem alterada · vale para todos no próximo sincronismo</span>
                      <button type="button" className="botao-acao-secundario" onClick={() => setOrdem(camadasDoMapa)}>
                        Desfazer
                      </button>
                      <button type="button" className="botao-acao-primario" onClick={salvarOrdem} disabled={ocupado === "ordem"}>
                        {ocupado === "ordem" && <span className="spinner" aria-hidden="true" />}
                        Salvar ordem
                      </button>
                    </div>
                  )}
                </div>
              )}

              {aba === "acesso" && (
                <div className="adm-aba" role="tabpanel">
                  <p className="adm-suave">
                    Quem vê este mapa (e pode baixar para usar sem internet). “Pode anotar” libera marcar pontos no mapa.
                  </p>
                  <EditorAcesso grupos={grupos} permissoes={permissoes} aoMudar={setPermissoes} />
                  {acessoMudou && (
                    <div className="adm-barra-pendente" role="status">
                      <span>Acesso alterado</span>
                      <button type="button" className="botao-acao-secundario" onClick={() => setPermissoes(mapa.permissoes || [])}>
                        Desfazer
                      </button>
                      <button type="button" className="botao-acao-primario" onClick={() => salvarMapa("acesso")} disabled={ocupado === "acesso"}>
                        {ocupado === "acesso" && <span className="spinner" aria-hidden="true" />}
                        Salvar acesso
                      </button>
                    </div>
                  )}
                </div>
              )}

              {aba === "detalhes" && (
                <div className="adm-aba adm-form" role="tabpanel">
                  <label className="adm-campo">
                    Nome
                    <input type="text" value={detalhes.nome} onChange={(e) => setDetalhes({ ...detalhes, nome: e.target.value })} />
                  </label>
                  <label className="adm-campo">
                    Descrição
                    <input type="text" value={detalhes.descricao} onChange={(e) => setDetalhes({ ...detalhes, descricao: e.target.value })} />
                  </label>
                  <div className="adm-acoes-form">
                    <button
                      type="button"
                      className="botao-acao-primario"
                      onClick={() => salvarMapa("detalhes")}
                      disabled={!detalhesMudou || !detalhes.nome.trim() || ocupado === "detalhes"}
                    >
                      {ocupado === "detalhes" && <span className="spinner" aria-hidden="true" />}
                      Salvar
                    </button>
                  </div>

                  <div className="adm-bloco-acao">
                    <div>
                      <strong>Duplicar mapa</strong>
                      <span className="adm-suave">Cria uma cópia com as mesmas camadas, estilos e grupos.</span>
                    </div>
                    <button type="button" className="botao-acao-secundario" onClick={duplicar} disabled={ocupado === "duplicar"}>
                      {ocupado === "duplicar" && <span className="spinner" aria-hidden="true" />}
                      {ocupado === "duplicar" ? "Duplicando…" : "Duplicar"}
                    </button>
                  </div>

                  <div className="adm-bloco-acao adm-bloco-acao--perigo">
                    <div>
                      <strong>Remover mapa</strong>
                      <span className="adm-suave">
                        {mapa.camadaCount > 0
                          ? `Só é possível remover um mapa sem camadas. Este tem ${plural(mapa.camadaCount, "camada", "camadas")} — remova-as primeiro em Camadas.`
                          : "Remove o mapa e o acesso dos grupos a ele."}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="botao-acao-perigo"
                      onClick={remover}
                      disabled={mapa.camadaCount > 0 || ocupado === "remover"}
                    >
                      {ocupado === "remover" && <span className="spinner" aria-hidden="true" />}
                      Remover mapa
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
