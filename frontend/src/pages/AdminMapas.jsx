import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import IconeLordicon from "../components/IconeLordicon.jsx";

const FORM_VAZIO = { nome: "", descricao: "", permissoes: [] };

// Confirmação de "salvo" some sozinha depois de um tempo — mesmo padrão já
// usado em AdminCamadas.jsx (useAutoDismiss), reescrito aqui em vez de
// importado de lá pra manter as duas telas independentes.
function useAutoDismiss(valor, setValor, delayMs = 2500) {
  useEffect(() => {
    if (!valor) return;
    const id = setTimeout(() => setValor(null), delayMs);
    return () => clearTimeout(id);
  }, [valor, setValor, delayMs]);
}

function alternarGrupoEm(permissoes, grupoId) {
  return permissoes.some((p) => p.grupoId === grupoId)
    ? permissoes.filter((p) => p.grupoId !== grupoId)
    : [...permissoes, { grupoId, podeEditar: false }];
}

function alternarAnotarEm(permissoes, grupoId) {
  return permissoes.map((p) => (p.grupoId === grupoId ? { ...p, podeEditar: !p.podeEditar } : p));
}

export default function AdminMapas() {
  const { sessao } = useAuth();
  const navigate = useNavigate();
  const [mapas, setMapas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [formEdicao, setFormEdicao] = useState(FORM_VAZIO);
  const [salvandoEdicaoId, setSalvandoEdicaoId] = useState(null);
  const [removendoId, setRemovendoId] = useState(null);
  const [duplicandoId, setDuplicandoId] = useState(null);
  const [carregando, setCarregando] = useState(true);

  // Ordenar camadas (o que fica em cima/embaixo no mapa) — pedido do Leo
  // (2026-09-30). `camadas` guarda TODAS as camadas de TODOS os mapas (já
  // ordenadas por mapa_id, ordem — ver GET /admin/camadas), igual ao padrão
  // já usado por AdminCamadas.jsx; `ordenandoId` decide qual mapa está com
  // a lista de reordenação aberta, `ordemCamadas` é a cópia local (só desse
  // mapa) que o arrastar-e-soltar edita antes de salvar.
  const [camadas, setCamadas] = useState([]);
  const [ordenandoId, setOrdenandoId] = useState(null);
  const [ordemCamadas, setOrdemCamadas] = useState([]);
  const [salvandoOrdemId, setSalvandoOrdemId] = useState(null);
  const [ordemSalvaEm, setOrdemSalvaEm] = useState(null);
  const [arrastandoIndiceOrdem, setArrastandoIndiceOrdem] = useState(null);
  // Ref (não só o state acima) pelo mesmo motivo já documentado em
  // AdminCamadas.jsx (moverAtributoPara): eventos de drag são "continuous
  // priority" no React 18, setState dentro de onDragStart não garante
  // flush síncrono antes do onDrop seguinte — ler o state direto ali
  // arriscava pegar o valor de ANTES do dragstart.
  const arrastandoIndiceOrdemRef = useRef(null);

  useAutoDismiss(ordemSalvaEm, setOrdemSalvaEm);

  function carregarMapas() {
    return listarMapasAdmin(sessao.token).then(setMapas);
  }

  useEffect(() => {
    Promise.allSettled([
      carregarMapas().catch((e) => setErro(e.message)),
      listarGruposAdmin(sessao.token)
        .then(setGrupos)
        .catch((e) => setErro(e.message)),
      listarCamadasAdmin(sessao.token)
        .then(setCamadas)
        .catch((e) => setErro(e.message)),
    ]).then(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao.token]);

  function abrirOrdenacao(mapa) {
    setOrdenandoId(mapa.id);
    setOrdemCamadas(camadas.filter((c) => c.mapa_id === mapa.id));
    setErro(null);
  }

  function fecharOrdenacao() {
    setOrdenandoId(null);
  }

  function moverCamadaPara(origem, destino) {
    if (origem === destino) return;
    setOrdemCamadas((atual) => {
      const novo = [...atual];
      const [item] = novo.splice(origem, 1);
      novo.splice(destino, 0, item);
      return novo;
    });
  }

  async function salvarOrdem(mapaId) {
    setSalvandoOrdemId(mapaId);
    setErro(null);
    try {
      await atualizarOrdemCamadasAdmin(sessao.token, mapaId, ordemCamadas.map((c) => c.id));
      setCamadas((atual) => {
        const semEsseMapa = atual.filter((c) => c.mapa_id !== mapaId);
        const reordenadas = ordemCamadas.map((c, i) => ({ ...c, ordem: i }));
        return [...semEsseMapa, ...reordenadas];
      });
      setOrdemSalvaEm(new Date());
      setOrdenandoId(null);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvandoOrdemId(null);
    }
  }

  function atualizarCampo(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function alternarGrupo(grupoId) {
    setForm((atual) => ({ ...atual, permissoes: alternarGrupoEm(atual.permissoes, grupoId) }));
  }

  function alternarAnotar(grupoId) {
    setForm((atual) => ({ ...atual, permissoes: alternarAnotarEm(atual.permissoes, grupoId) }));
  }

  async function criar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await criarMapaAdmin(sessao.token, form);
      setForm(FORM_VAZIO);
      await carregarMapas();
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function abrirEdicao(mapa) {
    setEditandoId(mapa.id);
    setFormEdicao({ nome: mapa.nome, descricao: mapa.descricao || "", permissoes: mapa.permissoes || [] });
    setErro(null);
  }

  function fecharEdicao() {
    setEditandoId(null);
  }

  function alternarGrupoEdicao(grupoId) {
    setFormEdicao((atual) => ({ ...atual, permissoes: alternarGrupoEm(atual.permissoes, grupoId) }));
  }

  function alternarAnotarEdicao(grupoId) {
    setFormEdicao((atual) => ({ ...atual, permissoes: alternarAnotarEm(atual.permissoes, grupoId) }));
  }

  async function salvarEdicao(e, mapaId) {
    e.preventDefault();
    setSalvandoEdicaoId(mapaId);
    setErro(null);
    try {
      await atualizarMapaAdmin(sessao.token, mapaId, formEdicao);
      fecharEdicao();
      await carregarMapas();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvandoEdicaoId(null);
    }
  }

  async function remover(mapa) {
    if (!window.confirm(`Remover o mapa "${mapa.nome}"? Essa ação não pode ser desfeita.`)) {
      return;
    }
    setRemovendoId(mapa.id);
    setErro(null);
    try {
      await removerMapaAdmin(sessao.token, mapa.id);
      await carregarMapas();
    } catch (err) {
      setErro(err.message);
    } finally {
      setRemovendoId(null);
    }
  }

  // Cria uma cópia completa (mesmos grupos, cada camada com o próprio
  // arquivo duplicado no R2) — pode demorar alguns segundos a mais que as
  // outras ações se o mapa de origem tiver várias camadas.
  async function duplicar(mapa) {
    setDuplicandoId(mapa.id);
    setErro(null);
    try {
      await duplicarMapaAdmin(sessao.token, mapa.id);
      await carregarMapas();
    } catch (err) {
      setErro(err.message);
    } finally {
      setDuplicandoId(null);
    }
  }

  return (
    <div className="adm-pagina adm-pagina--legada">

      <div className="painel-admin-conteudo painel-admin-conteudo--largo">
        {erro && <p className="erro">{erro}</p>}
        {carregando && (
          <p className="status-carregando-admin">
            <span className="spinner" aria-hidden="true" /> Carregando…
          </p>
        )}

        <form onSubmit={criar} className="cartao-form-admin">
          <h2>Novo mapa</h2>

          <label className="campo-form-admin">
            Nome
            <input
              type="text"
              required
              value={form.nome}
              onChange={(e) => atualizarCampo("nome", e.target.value)}
            />
          </label>

          <label className="campo-form-admin">
            Descrição
            <input
              type="text"
              value={form.descricao}
              onChange={(e) => atualizarCampo("descricao", e.target.value)}
            />
          </label>

          <div className="campo-form-admin">
            Grupos com permissão
            <div className="lista-grupos-checkbox">
              {grupos.map((g) => (
                <div key={g.id} className="linha-grupo-permissao">
                  <label className="opcao-grupo">
                    <input
                      type="checkbox"
                      checked={form.permissoes.some((p) => p.grupoId === g.id)}
                      onChange={() => alternarGrupo(g.id)}
                    />
                    {g.nome}
                  </label>
                  {form.permissoes.some((p) => p.grupoId === g.id) && (
                    <label className="caixa-pode-anotar">
                      <input
                        type="checkbox"
                        checked={form.permissoes.find((p) => p.grupoId === g.id)?.podeEditar === true}
                        onChange={() => alternarAnotar(g.id)}
                      />
                      pode anotar
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button type="submit" disabled={enviando}>
            {enviando && <span className="spinner" aria-hidden="true" />}
            {enviando ? "Criando…" : "Criar mapa"}
          </button>
        </form>

        <h2 className="titulo-lista-mapas">Mapas existentes</h2>
        <ul className="lista-mapas-admin">
          {mapas.map((m) => (
            <li key={m.id} className="item-mapa-admin">
              <div className="linha-mapa-admin">
                <div className="info-mapa-admin">
                  <strong>{m.nome}</strong>
                  <span className="detalhe-mapa-admin">
                    {m.camadaCount > 0
                      ? `${m.camadaCount} camada${m.camadaCount > 1 ? "s" : ""}`
                      : "nenhuma camada ainda"}{" "}
                    · {m.descricao || "sem descrição"} ·{" "}
                    {(m.permissoes || [])
                      .map((p) => {
                        const nome = grupos.find((g) => g.id === p.grupoId)?.nome ?? p.grupoId;
                        return `${nome}${p.podeEditar ? " (anota)" : ""}`;
                      })
                      .join(", ") || "nenhum grupo com acesso"}
                  </span>
                </div>
                <Link to={`/admin/camadas?mapaId=${m.id}`} className="botao-secundario">
                  Adicionar camada
                </Link>
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => (editandoId === m.id ? fecharEdicao() : abrirEdicao(m))}
                >
                  {editandoId === m.id ? "Cancelar" : "Editar"}
                </button>
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => (ordenandoId === m.id ? fecharOrdenacao() : abrirOrdenacao(m))}
                  disabled={m.camadaCount < 2}
                  title={m.camadaCount < 2 ? "Precisa de 2+ camadas pra ter o que ordenar" : "O que fica em cima, o que fica embaixo"}
                >
                  {ordenandoId === m.id ? "Cancelar" : "Ordenar camadas"}
                </button>
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => duplicar(m)}
                  disabled={duplicandoId === m.id}
                  title="Cria uma cópia deste mapa com todas as camadas"
                >
                  {duplicandoId === m.id && <span className="spinner" aria-hidden="true" />}
                  {duplicandoId === m.id ? "Duplicando…" : "Duplicar"}
                </button>
                <button
                  type="button"
                  className="botao-remover-mapa"
                  onClick={() => remover(m)}
                  disabled={removendoId === m.id || m.camadaCount > 0}
                  title={m.camadaCount > 0 ? "Remova as camadas desse mapa antes de removê-lo" : undefined}
                >
                  {removendoId === m.id ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : (
                    <IconeLordicon nome="minus-circle" trigger="hover" tamanho={18} cor="#ffffff" />
                  )}
                  {removendoId === m.id ? "Removendo…" : "Remover"}
                </button>
              </div>

              {editandoId === m.id && (
                <form className="form-atualizar-arquivo" onSubmit={(e) => salvarEdicao(e, m.id)}>
                  <input
                    type="text"
                    value={formEdicao.nome}
                    onChange={(e) => setFormEdicao((atual) => ({ ...atual, nome: e.target.value }))}
                    aria-label="Nome do mapa"
                    required
                  />
                  <input
                    type="text"
                    value={formEdicao.descricao}
                    onChange={(e) => setFormEdicao((atual) => ({ ...atual, descricao: e.target.value }))}
                    aria-label="Descrição do mapa"
                  />
                  <div className="lista-grupos-checkbox">
                    {grupos.map((g) => (
                      <div key={g.id} className="linha-grupo-permissao">
                        <label className="opcao-grupo">
                          <input
                            type="checkbox"
                            checked={formEdicao.permissoes.some((p) => p.grupoId === g.id)}
                            onChange={() => alternarGrupoEdicao(g.id)}
                          />
                          {g.nome}
                        </label>
                        {formEdicao.permissoes.some((p) => p.grupoId === g.id) && (
                          <label className="caixa-pode-anotar">
                            <input
                              type="checkbox"
                              checked={
                                formEdicao.permissoes.find((p) => p.grupoId === g.id)?.podeEditar === true
                              }
                              onChange={() => alternarAnotarEdicao(g.id)}
                            />
                            pode anotar
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="submit" disabled={salvandoEdicaoId === m.id}>
                    {salvandoEdicaoId === m.id && <span className="spinner" aria-hidden="true" />}
                    {salvandoEdicaoId === m.id ? "Salvando…" : "Salvar"}
                  </button>
                </form>
              )}

              {ordenandoId === m.id && (
                <div className="cartao-form-admin">
                  <p className="detalhe-mapa-admin">
                    Arraste pra reordenar — a de cima fica por cima no mapa.
                  </p>
                  <ul className="lista-atributos-admin">
                    {ordemCamadas.map((c, i) => (
                      <li
                        key={c.id}
                        draggable
                        onDragStart={() => {
                          arrastandoIndiceOrdemRef.current = i;
                          setArrastandoIndiceOrdem(i);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (arrastandoIndiceOrdemRef.current !== null) {
                            moverCamadaPara(arrastandoIndiceOrdemRef.current, i);
                          }
                          arrastandoIndiceOrdemRef.current = null;
                          setArrastandoIndiceOrdem(null);
                        }}
                        onDragEnd={() => {
                          arrastandoIndiceOrdemRef.current = null;
                          setArrastandoIndiceOrdem(null);
                        }}
                        className={`linha-atributo-admin${
                          arrastandoIndiceOrdem === i ? " linha-atributo-admin--arrastando" : ""
                        }`}
                      >
                        <span className="alca-arrastar" aria-hidden="true" title="Arraste pra reordenar">
                          ⠿
                        </span>
                        {c.nome}
                      </li>
                    ))}
                  </ul>
                  {ordemSalvaEm && <p className="confirmacao-salvo">✓ Salvo às {ordemSalvaEm.toLocaleTimeString()}</p>}
                  <button type="button" onClick={() => salvarOrdem(m.id)} disabled={salvandoOrdemId === m.id}>
                    {salvandoOrdemId === m.id && <span className="spinner" aria-hidden="true" />}
                    {salvandoOrdemId === m.id ? "Salvando…" : "Salvar ordem"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
