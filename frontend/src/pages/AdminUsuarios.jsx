import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listarUsuariosAdmin,
  criarUsuarioAdmin,
  atualizarUsuarioAdmin,
  redefinirSenhaUsuarioAdmin,
  listarGruposAdmin,
  criarGrupoAdmin,
  renomearGrupoAdmin,
  removerGrupoAdmin,
} from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

const FORM_USUARIO_VAZIO = {
  nome: "",
  email: "",
  senha: "",
  departamento: "",
  papel: "usuario",
  grupoIds: [],
};

export default function AdminUsuarios() {
  const { sessao } = useAuth();
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [erro, setErro] = useState(null);

  const [form, setForm] = useState(FORM_USUARIO_VAZIO);
  const [enviando, setEnviando] = useState(false);

  const [editandoId, setEditandoId] = useState(null);
  const [formEdicao, setFormEdicao] = useState(null);
  const [salvandoEdicaoId, setSalvandoEdicaoId] = useState(null);

  const [redefinindoId, setRedefinindoId] = useState(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [enviandoSenha, setEnviandoSenha] = useState(false);

  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const [criandoGrupo, setCriandoGrupo] = useState(false);
  const [editandoGrupoId, setEditandoGrupoId] = useState(null);
  const [nomeGrupoEdicao, setNomeGrupoEdicao] = useState("");
  const [removendoGrupoId, setRemovendoGrupoId] = useState(null);
  const [carregando, setCarregando] = useState(true);

  function carregarUsuarios() {
    return listarUsuariosAdmin(sessao.token).then(setUsuarios);
  }

  function carregarGrupos() {
    return listarGruposAdmin(sessao.token).then(setGrupos);
  }

  useEffect(() => {
    Promise.allSettled([
      carregarUsuarios().catch((e) => setErro(e.message)),
      carregarGrupos().catch((e) => setErro(e.message)),
    ]).then(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao.token]);

  function nomeDoGrupo(grupoId) {
    return grupos.find((g) => g.id === grupoId)?.nome || "—";
  }

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
      await criarUsuarioAdmin(sessao.token, form);
      setForm(FORM_USUARIO_VAZIO);
      await carregarUsuarios();
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function abrirEdicao(usuario) {
    setEditandoId(usuario.id);
    setFormEdicao({
      nome: usuario.nome,
      departamento: usuario.departamento || "",
      papel: usuario.papel,
      status: usuario.status,
      grupoIds: usuario.grupoIds || [],
    });
    setErro(null);
  }

  function fecharEdicao() {
    setEditandoId(null);
    setFormEdicao(null);
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

  async function salvarEdicao(e, usuarioId) {
    e.preventDefault();
    setSalvandoEdicaoId(usuarioId);
    setErro(null);
    try {
      await atualizarUsuarioAdmin(sessao.token, usuarioId, formEdicao);
      fecharEdicao();
      await carregarUsuarios();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvandoEdicaoId(null);
    }
  }

  function abrirRedefinicao(usuarioId) {
    setRedefinindoId(usuarioId);
    setNovaSenha("");
    setErro(null);
  }

  async function redefinirSenha(e, usuarioId) {
    e.preventDefault();
    setEnviandoSenha(true);
    setErro(null);
    try {
      await redefinirSenhaUsuarioAdmin(sessao.token, usuarioId, novaSenha);
      setRedefinindoId(null);
      setNovaSenha("");
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviandoSenha(false);
    }
  }

  async function criarGrupo(e) {
    e.preventDefault();
    if (!novoGrupoNome.trim()) return;
    setCriandoGrupo(true);
    setErro(null);
    try {
      await criarGrupoAdmin(sessao.token, novoGrupoNome.trim());
      setNovoGrupoNome("");
      await carregarGrupos();
    } catch (err) {
      setErro(err.message);
    } finally {
      setCriandoGrupo(false);
    }
  }

  function abrirEdicaoGrupo(grupo) {
    setEditandoGrupoId(grupo.id);
    setNomeGrupoEdicao(grupo.nome);
  }

  async function salvarEdicaoGrupo(e, grupoId) {
    e.preventDefault();
    setErro(null);
    try {
      await renomearGrupoAdmin(sessao.token, grupoId, nomeGrupoEdicao);
      setEditandoGrupoId(null);
      await carregarGrupos();
    } catch (err) {
      setErro(err.message);
    }
  }

  async function removerGrupo(grupo) {
    const usadoPorAlguem = usuarios.some((u) => (u.grupoIds || []).includes(grupo.id));
    const aviso = usadoPorAlguem
      ? `O grupo "${grupo.nome}" tem usuários vinculados a ele — removê-lo tira o acesso deles a qualquer mapa que dependa desse grupo. Continuar?`
      : `Remover o grupo "${grupo.nome}"?`;
    if (!window.confirm(aviso)) return;

    setRemovendoGrupoId(grupo.id);
    setErro(null);
    try {
      await removerGrupoAdmin(sessao.token, grupo.id);
      await Promise.all([carregarGrupos(), carregarUsuarios()]);
    } catch (err) {
      setErro(err.message);
    } finally {
      setRemovendoGrupoId(null);
    }
  }

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoMap — Gerenciar usuários</strong>
        <span className="status-sync" />
        <button type="button" className="botao botao-sair" onClick={() => navigate(-1)}>
          ← Voltar
        </button>
      </header>

      <div className="painel-admin-conteudo painel-admin-conteudo--largo">
        {erro && <p className="erro">{erro}</p>}
        {carregando && (
          <p className="status-carregando-admin">
            <span className="spinner" aria-hidden="true" /> Carregando…
          </p>
        )}

        <form onSubmit={criar} className="cartao-form-admin">
          <h2>Novo usuário</h2>

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
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => atualizarCampo("email", e.target.value)}
            />
          </label>

          <label className="campo-form-admin">
            Senha temporária
            <input
              type="text"
              required
              minLength={6}
              value={form.senha}
              onChange={(e) => atualizarCampo("senha", e.target.value)}
            />
          </label>

          <label className="campo-form-admin">
            Departamento
            <input
              type="text"
              value={form.departamento}
              onChange={(e) => atualizarCampo("departamento", e.target.value)}
            />
          </label>

          <label className="campo-form-admin">
            Papel
            <select value={form.papel} onChange={(e) => atualizarCampo("papel", e.target.value)}>
              <option value="usuario">Usuário</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <div className="campo-form-admin">
            Grupos
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
            {enviando ? "Criando…" : "Criar usuário"}
          </button>
        </form>

        <h2 className="titulo-lista-mapas">Usuários existentes</h2>
        <ul className="lista-mapas-admin">
          {usuarios.map((u) => {
            const ehVoce = u.id === sessao.usuario.id;
            return (
              <li key={u.id} className="item-mapa-admin">
                <div className="linha-mapa-admin">
                  <div className="info-mapa-admin">
                    <strong>
                      {u.nome} {ehVoce && "(você)"}
                    </strong>
                    <span className="detalhe-mapa-admin">
                      {u.email} · {u.departamento || "sem departamento"}
                    </span>
                    <span className="linha-badges">
                      <span className={`badge badge--papel-${u.papel}`}>{u.papel}</span>
                      <span className={`badge badge--status-${u.status}`}>{u.status}</span>
                      {(u.grupoIds || []).map((id) => (
                        <span key={id} className="badge badge--grupo">
                          {nomeDoGrupo(id)}
                        </span>
                      ))}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="botao-secundario"
                    onClick={() => (redefinindoId === u.id ? setRedefinindoId(null) : abrirRedefinicao(u.id))}
                  >
                    {redefinindoId === u.id ? "Cancelar" : "Redefinir senha"}
                  </button>
                  <button
                    type="button"
                    className="botao-secundario"
                    onClick={() => (editandoId === u.id ? fecharEdicao() : abrirEdicao(u))}
                  >
                    {editandoId === u.id ? "Cancelar" : "Editar"}
                  </button>
                </div>

                {redefinindoId === u.id && (
                  <form className="form-atualizar-arquivo" onSubmit={(e) => redefinirSenha(e, u.id)}>
                    <input
                      type="text"
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      aria-label="Nova senha"
                      placeholder="Nova senha (mín. 6 caracteres)"
                      minLength={6}
                      required
                    />
                    <button type="submit" disabled={enviandoSenha}>
                      {enviandoSenha ? "Salvando…" : "Salvar senha"}
                    </button>
                  </form>
                )}

                {editandoId === u.id && formEdicao && (
                  <form className="form-atualizar-arquivo form-atualizar-arquivo--workspace" onSubmit={(e) => salvarEdicao(e, u.id)}>
                    <input
                      type="text"
                      value={formEdicao.departamento}
                      onChange={(e) => setFormEdicao((atual) => ({ ...atual, departamento: e.target.value }))}
                      aria-label="Departamento"
                      placeholder="Departamento"
                    />
                    <select
                      value={formEdicao.papel}
                      onChange={(e) => setFormEdicao((atual) => ({ ...atual, papel: e.target.value }))}
                      disabled={ehVoce}
                      title={ehVoce ? "Você não pode alterar o próprio papel" : undefined}
                    >
                      <option value="usuario">Usuário</option>
                      <option value="admin">Admin</option>
                    </select>
                    <select
                      value={formEdicao.status}
                      onChange={(e) => setFormEdicao((atual) => ({ ...atual, status: e.target.value }))}
                      disabled={ehVoce}
                      title={ehVoce ? "Você não pode alterar o próprio status" : undefined}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
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
                    <button type="submit" disabled={salvandoEdicaoId === u.id}>
                      {salvandoEdicaoId === u.id ? "Salvando…" : "Salvar"}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>

        <h2 className="titulo-lista-mapas">Grupos</h2>
        <form onSubmit={criarGrupo} className="form-atualizar-arquivo">
          <input
            type="text"
            value={novoGrupoNome}
            onChange={(e) => setNovoGrupoNome(e.target.value)}
            aria-label="Nome do novo grupo"
            placeholder="Nome do novo grupo"
            required
          />
          <button type="submit" disabled={criandoGrupo}>
            {criandoGrupo ? "Criando…" : "Criar grupo"}
          </button>
        </form>

        <ul className="lista-mapas-admin">
          {grupos.map((g) => (
            <li key={g.id} className="item-mapa-admin">
              <div className="linha-mapa-admin">
                {editandoGrupoId === g.id ? (
                  <form className="form-atualizar-arquivo" onSubmit={(e) => salvarEdicaoGrupo(e, g.id)}>
                    <input
                      type="text"
                      value={nomeGrupoEdicao}
                      onChange={(e) => setNomeGrupoEdicao(e.target.value)}
                      aria-label="Nome do grupo"
                      required
                    />
                    <button type="submit">Salvar</button>
                    <button type="button" className="botao-secundario" onClick={() => setEditandoGrupoId(null)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div className="info-mapa-admin">
                    <strong>{g.nome}</strong>
                  </div>
                )}
                {editandoGrupoId !== g.id && (
                  <>
                    <button type="button" className="botao-secundario" onClick={() => abrirEdicaoGrupo(g)}>
                      Renomear
                    </button>
                    <button
                      type="button"
                      className="botao-remover-mapa"
                      onClick={() => removerGrupo(g)}
                      disabled={removendoGrupoId === g.id}
                    >
                      {removendoGrupoId === g.id ? "Removendo…" : "Remover"}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
