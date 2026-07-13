import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  listarMapasAdmin,
  listarGruposAdmin,
  criarMapaAdmin,
  atualizarMapaAdmin,
  removerMapaAdmin,
} from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

const FORM_VAZIO = { nome: "", descricao: "", grupoIds: [] };

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

  function carregarMapas() {
    return listarMapasAdmin(sessao.token).then(setMapas);
  }

  useEffect(() => {
    carregarMapas().catch((e) => setErro(e.message));
    listarGruposAdmin(sessao.token)
      .then(setGrupos)
      .catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao.token]);

  function atualizarCampo(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function alternarGrupo(grupoId) {
    setForm((atual) => {
      const jaTem = atual.grupoIds.includes(grupoId);
      return {
        ...atual,
        grupoIds: jaTem ? atual.grupoIds.filter((g) => g !== grupoId) : [...atual.grupoIds, grupoId],
      };
    });
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
    setFormEdicao({ nome: mapa.nome, descricao: mapa.descricao || "", grupoIds: mapa.grupoIds || [] });
    setErro(null);
  }

  function fecharEdicao() {
    setEditandoId(null);
  }

  function alternarGrupoEdicao(grupoId) {
    setFormEdicao((atual) => {
      const jaTem = atual.grupoIds.includes(grupoId);
      return {
        ...atual,
        grupoIds: jaTem ? atual.grupoIds.filter((g) => g !== grupoId) : [...atual.grupoIds, grupoId],
      };
    });
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

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoMap — Gerenciar mapas</strong>
        <span className="status-sync" />
        <button type="button" className="botao botao-sair" onClick={() => navigate(-1)}>
          ← Voltar
        </button>
      </header>

      <div className="painel-admin-conteudo painel-admin-conteudo--largo">
        {erro && <p className="erro">{erro}</p>}

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
                <label key={g.id} className="opcao-grupo">
                  <input
                    type="checkbox"
                    checked={form.grupoIds.includes(g.id)}
                    onChange={() => alternarGrupo(g.id)}
                  />
                  {g.nome}
                </label>
              ))}
            </div>
          </div>

          <button type="submit" disabled={enviando}>
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
                    {(m.grupoIds || [])
                      .map((id) => grupos.find((g) => g.id === id)?.nome)
                      .filter(Boolean)
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
                  className="botao-remover-mapa"
                  onClick={() => remover(m)}
                  disabled={removendoId === m.id || m.camadaCount > 0}
                  title={m.camadaCount > 0 ? "Remova as camadas desse mapa antes de removê-lo" : undefined}
                >
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
                      <label key={g.id} className="opcao-grupo">
                        <input
                          type="checkbox"
                          checked={formEdicao.grupoIds.includes(g.id)}
                          onChange={() => alternarGrupoEdicao(g.id)}
                        />
                        {g.nome}
                      </label>
                    ))}
                  </div>
                  <button type="submit" disabled={salvandoEdicaoId === m.id}>
                    {salvandoEdicaoId === m.id ? "Salvando…" : "Salvar"}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
