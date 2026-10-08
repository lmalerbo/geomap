import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listarUsuariosAdmin,
  criarUsuarioAdmin,
  atualizarUsuarioAdmin,
  redefinirSenhaUsuarioAdmin,
  removerUsuarioAdmin,
  vincularPilotoAdmin,
  listarGruposAdmin,
  listarMapasAdmin,
  criarGrupoAdmin,
  renomearGrupoAdmin,
  removerGrupoAdmin,
} from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { iniciaisDoNome } from "../components/LayoutAdmin.jsx";
import IconeEstadoVazio from "../components/IconeEstadoVazio.jsx";

// Usuários e grupos (redesenho do admin, fase 5): tabela com filtros rápidos
// e o painel da pessoa escolhida à direita; aba Grupos mostra membros e os
// mapas que cada grupo vê. Vínculo com o piloto do DroneManagement (antes só
// direto no banco) agora é feito aqui.

// Só pra exibir (nunca enviada pra API) — precisa bater com
// SENHA_TEMPORARIA_PADRAO em backend/src/lib/senhaTemporaria.js.
const SENHA_TEMPORARIA_EXIBIDA = "usina123";

const NOVO_VAZIO = { nome: "", email: "", departamento: "", papel: "usuario", grupoIds: [] };

const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function ultimoAcesso(data) {
  if (!data) return "Nunca";
  const d = new Date(data);
  const hoje = FMT_DIA.format(new Date());
  const ontem = FMT_DIA.format(new Date(Date.now() - 86400000));
  const dia = FMT_DIA.format(d);
  if (dia === hoje) return `Hoje · ${FMT_HORA.format(d)}`;
  if (dia === ontem) return `Ontem · ${FMT_HORA.format(d)}`;
  return dia;
}

// Cor estável por pessoa (avatar), a partir do id.
const CORES_AVATAR = ["#2c6b47", "#7c5cc4", "#b76e2a", "#2f6fae", "#a33d6b", "#3f7f7a", "#6b7280"];

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

export default function AdminUsuarios() {
  const { sessao } = useAuth();
  const [params, setParams] = useSearchParams();
  const [usuarios, setUsuarios] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [mapas, setMapas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [ocupado, setOcupado] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  const [piloto, setPiloto] = useState("");
  const [novo, setNovo] = useState(NOVO_VAZIO);
  const [novoGrupo, setNovoGrupo] = useState("");
  const [renomeando, setRenomeando] = useState(null); // {id, nome}

  const aba = params.get("aba") === "grupos" ? "grupos" : "usuarios";
  const selecionado = params.get("usuario");
  const usuario = usuarios.find((u) => String(u.id) === selecionado) || null;
  const ehVoce = usuario && usuario.id === sessao.usuario.id;

  async function carregar() {
    const [u, g, m] = await Promise.all([
      listarUsuariosAdmin(sessao.token),
      listarGruposAdmin(sessao.token),
      listarMapasAdmin(sessao.token),
    ]);
    setUsuarios(u);
    setGrupos(g);
    setMapas(m);
  }

  useEffect(() => {
    carregar()
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao.token]);

  useEffect(() => {
    if (!usuario) return setRascunho(null);
    setRascunho({
      departamento: usuario.departamento || "",
      papel: usuario.papel,
      status: usuario.status,
      grupoIds: usuario.grupoIds || [],
    });
    setPiloto(usuario.pilotoLogin || "");
    setErro(null);
  }, [usuario]);

  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(id);
  }, [aviso]);

  // Mapas que cada grupo vê (e se anota), pra mostrar ao lado do grupo.
  const mapasPorGrupo = useMemo(() => {
    const r = new Map();
    for (const m of mapas) {
      for (const p of m.permissoes || []) {
        if (!r.has(p.grupoId)) r.set(p.grupoId, []);
        r.get(p.grupoId).push({ nome: m.nome, anota: p.podeEditar });
      }
    }
    return r;
  }, [mapas]);

  const nomeGrupo = (id) => grupos.find((g) => g.id === id)?.nome || "—";

  const FILTROS = [
    { id: "todos", rotulo: "Todos", testa: () => true },
    { id: "admins", rotulo: "Admins", testa: (u) => u.papel === "admin" },
    { id: "semgrupo", rotulo: "Sem grupo", testa: (u) => u.status === "ativo" && (u.grupoIds || []).length === 0 },
    { id: "primeiro", rotulo: "Aguardando 1º acesso", testa: (u) => u.precisa_trocar_senha },
    { id: "inativos", rotulo: "Inativos", testa: (u) => u.status === "inativo" },
  ];
  const filtroAtual = FILTROS.find((f) => f.id === filtro);
  const termo = busca.trim().toLowerCase();
  const lista = usuarios.filter(
    (u) => filtroAtual.testa(u) && (!termo || u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo))
  );

  function mudarParams(novos) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(novos)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p);
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

  const mudou =
    usuario &&
    rascunho &&
    (rascunho.departamento !== (usuario.departamento || "") ||
      rascunho.papel !== usuario.papel ||
      rascunho.status !== usuario.status ||
      [...rascunho.grupoIds].sort().join() !== [...(usuario.grupoIds || [])].sort().join());

  const salvar = (extra = {}) =>
    executar(
      "salvar",
      async () => {
        await atualizarUsuarioAdmin(sessao.token, usuario.id, { nome: usuario.nome, ...rascunho, ...extra });
        await carregar();
      },
      "Alterações salvas"
    );

  const alternarStatus = () => {
    const novoStatus = usuario.status === "ativo" ? "inativo" : "ativo";
    if (novoStatus === "inativo" && !window.confirm(`Desativar "${usuario.nome}"? A pessoa não consegue mais entrar no GeoMap.`)) return;
    salvar({ status: novoStatus });
  };

  const redefinir = () => {
    if (!window.confirm(`Redefinir a senha de "${usuario.nome}" para a temporária (${SENHA_TEMPORARIA_EXIBIDA})? A pessoa escolhe outra no próximo acesso.`)) return;
    executar("senha", async () => {
      await redefinirSenhaUsuarioAdmin(sessao.token, usuario.id);
      await carregar();
    }, `Senha redefinida para ${SENHA_TEMPORARIA_EXIBIDA}`);
  };

  const excluir = () => {
    if (!window.confirm(`Excluir "${usuario.nome}" (${usuario.email})? Não dá para desfazer — para só bloquear o acesso, use Desativar.`)) return;
    executar("excluir", async () => {
      await removerUsuarioAdmin(sessao.token, usuario.id);
      await carregar();
      mudarParams({ usuario: null });
    }, "Usuário excluído");
  };

  // Vincula pelo login do DroneManagement (o backend busca o id lá — pode
  // levar uns segundos se a sessão com a plataforma precisar ser refeita).
  const salvarPiloto = (login) =>
    executar("piloto", async () => {
      await vincularPilotoAdmin(sessao.token, usuario.id, login);
      await carregar();
    }, login ? `Vinculado como ${login}` : "Vínculo de piloto removido");

  async function criarUsuario(e) {
    e.preventDefault();
    await executar("criar", async () => {
      const criado = await criarUsuarioAdmin(sessao.token, novo);
      setNovo(NOVO_VAZIO);
      await carregar();
      mudarParams({ usuario: String(criado.id) });
    }, `Usuário criado · senha temporária ${SENHA_TEMPORARIA_EXIBIDA}`);
  }

  async function criarGrupo(e) {
    e.preventDefault();
    if (!novoGrupo.trim()) return;
    await executar("grupo", async () => {
      await criarGrupoAdmin(sessao.token, novoGrupo.trim());
      setNovoGrupo("");
      await carregar();
    }, "Grupo criado");
  }

  async function renomearGrupo(e) {
    e.preventDefault();
    await executar("grupo", async () => {
      await renomearGrupoAdmin(sessao.token, renomeando.id, renomeando.nome);
      setRenomeando(null);
      await carregar();
    }, "Grupo renomeado");
  }

  const removerGrupo = (g, membros) => {
    const msg = membros > 0
      ? `O grupo "${g.nome}" tem ${plural(membros, "membro", "membros")} — eles perdem o acesso aos mapas que dependem dele. Remover mesmo assim?`
      : `Remover o grupo "${g.nome}"?`;
    if (!window.confirm(msg)) return;
    executar("grupo", async () => {
      await removerGrupoAdmin(sessao.token, g.id);
      await carregar();
    }, "Grupo removido");
  };

  function gruposDoUsuario(valor, aoMudar) {
    if (grupos.length === 0) return <p className="adm-suave">Nenhum grupo criado ainda.</p>;
    return (
      <ul className="adm-lista-acesso">
        {grupos.map((g) => {
          const marcado = valor.includes(g.id);
          const veMapas = mapasPorGrupo.get(g.id) || [];
          return (
            <li key={g.id} className={marcado ? "ativo" : ""}>
              <label className="adm-acesso-grupo">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => aoMudar(marcado ? valor.filter((id) => id !== g.id) : [...valor, g.id])}
                />
                <span className="adm-acesso-texto">
                  <span className="adm-forte">{g.nome}</span>
                  <small className="adm-suave">
                    {veMapas.length ? `Vê: ${veMapas.map((m) => `${m.nome}${m.anota ? " (anota)" : ""}`).join(", ")}` : "Ainda não vê nenhum mapa"}
                  </small>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  }

  const contagem = (f) => usuarios.filter(f.testa).length;

  return (
    <div className={`adm-pagina adm-usuarios${aba === "usuarios" && selecionado ? " adm-usuarios--detalhe" : ""}`}>
      <header className="adm-cabecalho">
        <div>
          <h1>Usuários e grupos</h1>
          <p>Quem entra no GeoMap e quais mapas cada grupo vê</p>
        </div>
        {aba === "usuarios" && (
          <button type="button" className="botao-acao-primario" onClick={() => mudarParams({ usuario: "novo" })}>
            + Novo usuário
          </button>
        )}
      </header>

      <div className="segmentado adm-abas" role="tablist" aria-label="Usuários ou grupos">
        <button type="button" role="tab" aria-selected={aba === "usuarios"} className={aba === "usuarios" ? "ativo" : ""} onClick={() => mudarParams({ aba: null })}>
          Usuários · {usuarios.length}
        </button>
        <button type="button" role="tab" aria-selected={aba === "grupos"} className={aba === "grupos" ? "ativo" : ""} onClick={() => mudarParams({ aba: "grupos", usuario: null })}>
          Grupos · {grupos.length}
        </button>
      </div>

      {erro && <p className="erro">{erro}</p>}
      {aviso && (
        <p className="adm-toast" role="status">
          {aviso}
        </p>
      )}
      {carregando && (
        <p className="status-carregando-admin">
          <span className="spinner" aria-hidden="true" /> Carregando…
        </p>
      )}

      {aba === "usuarios" && !carregando && (
        <div className="adm-mestre-detalhe adm-mestre-detalhe--painel-direita">
          <section className="adm-mestre" aria-label="Lista de usuários">
            <input
              type="search"
              className="adm-busca"
              placeholder="Buscar por nome ou e-mail"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar usuário"
            />
            <div className="adm-filtros" role="group" aria-label="Filtrar usuários">
              {FILTROS.map((f) => (
                <button key={f.id} type="button" className={`adm-filtro${filtro === f.id ? " ativo" : ""}`} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
                  {f.rotulo} · {contagem(f)}
                </button>
              ))}
            </div>
            <div className="adm-cartao adm-tabela-usuarios" role="table" aria-label="Usuários">
              <div className="adm-tabela-cabecalho" role="row">
                <span role="columnheader">Pessoa</span>
                <span role="columnheader">Grupos</span>
                <span role="columnheader">Papel</span>
                <span role="columnheader">Último acesso</span>
              </div>
              {lista.length === 0 ? (
                <p className="adm-vazio adm-vazio--tabela">
                  <IconeEstadoVazio /> Ninguém nesse filtro.
                </p>
              ) : (
                lista.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    role="row"
                    className={`adm-tabela-linha adm-linha-usuario${String(u.id) === selecionado ? " selecionada" : ""}${u.status === "inativo" ? " inativa" : ""}`}
                    onClick={() => mudarParams({ usuario: String(u.id) })}
                  >
                    <span role="cell" className="adm-pessoa">
                      <span className="adm-avatar" style={{ background: CORES_AVATAR[u.id % CORES_AVATAR.length] }} aria-hidden="true">
                        {iniciaisDoNome(u.nome)}
                      </span>
                      <span className="adm-pessoa-texto">
                        <span className="adm-forte">
                          {u.nome}
                          {u.id === sessao.usuario.id && <small className="adm-suave"> (você)</small>}
                        </span>
                        <small className="adm-suave">{u.email}</small>
                      </span>
                    </span>
                    <span role="cell" className="adm-suave">
                      {(u.grupoIds || []).length ? u.grupoIds.map(nomeGrupo).join(", ") : <span className="adm-texto-alerta">Sem grupo</span>}
                    </span>
                    <span role="cell">
                      {u.papel === "admin" ? <span className="adm-etiqueta adm-etiqueta--admin">Admin</span> : <span className="adm-suave">Usuário</span>}
                      {u.status === "inativo" && <span className="adm-etiqueta"> Inativo</span>}
                    </span>
                    <span role="cell" className="adm-suave">
                      {u.precisa_trocar_senha ? "Aguardando 1º acesso" : ultimoAcesso(u.ultimoAcesso)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="adm-detalhe" aria-label="Pessoa selecionada">
            {selecionado === "novo" ? (
              <form className="adm-cartao adm-form" onSubmit={criarUsuario}>
                <button type="button" className="adm-voltar-lista" onClick={() => mudarParams({ usuario: null })}>
                  ← Usuários
                </button>
                <h2>Novo usuário</h2>
                <label className="adm-campo">
                  Nome
                  <input type="text" required value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
                </label>
                <label className="adm-campo">
                  E-mail
                  <input type="email" required value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
                </label>
                <label className="adm-campo">
                  Departamento
                  <input type="text" value={novo.departamento} onChange={(e) => setNovo({ ...novo, departamento: e.target.value })} />
                </label>
                <div className="adm-campo">
                  Papel
                  <div className="segmentado" role="group" aria-label="Papel">
                    {[["usuario", "Usuário"], ["admin", "Administrador"]].map(([v, r]) => (
                      <button key={v} type="button" className={novo.papel === v ? "ativo" : ""} aria-pressed={novo.papel === v} onClick={() => setNovo({ ...novo, papel: v })}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="adm-campo">
                  Grupos
                  {gruposDoUsuario(novo.grupoIds, (ids) => setNovo({ ...novo, grupoIds: ids }))}
                </div>
                <p className="adm-suave">
                  Senha do primeiro acesso: <strong>{SENHA_TEMPORARIA_EXIBIDA}</strong> — a pessoa escolhe a dela ao entrar.
                </p>
                <div className="adm-acoes-form">
                  <button type="submit" className="botao-acao-primario" disabled={ocupado === "criar"}>
                    {ocupado === "criar" && <span className="spinner" aria-hidden="true" />}
                    Criar usuário
                  </button>
                </div>
              </form>
            ) : !usuario || !rascunho ? (
              <p className="adm-vazio adm-cartao">
                <IconeEstadoVazio /> Escolha uma pessoa na lista.
              </p>
            ) : (
              <div className="adm-cartao adm-form adm-painel-usuario">
                <button type="button" className="adm-voltar-lista" onClick={() => mudarParams({ usuario: null })}>
                  ← Usuários
                </button>
                <div className="adm-pessoa adm-pessoa--grande">
                  <span className="adm-avatar" style={{ background: CORES_AVATAR[usuario.id % CORES_AVATAR.length] }} aria-hidden="true">
                    {iniciaisDoNome(usuario.nome)}
                  </span>
                  <span className="adm-pessoa-texto">
                    <h2>{usuario.nome}</h2>
                    <small className="adm-suave">{usuario.email}</small>
                  </span>
                </div>

                {usuario.status === "inativo" && <p className="adm-aviso-linha">Conta desativada: essa pessoa não consegue entrar.</p>}
                {usuario.status === "ativo" && rascunho.grupoIds.length === 0 && (
                  <p className="adm-aviso-linha">Sem grupo: essa pessoa entra, mas não vê nenhum mapa.</p>
                )}

                <label className="adm-campo">
                  Departamento
                  <input type="text" value={rascunho.departamento} onChange={(e) => setRascunho({ ...rascunho, departamento: e.target.value })} />
                </label>

                <div className="adm-campo">
                  Papel
                  <div className="segmentado" role="group" aria-label="Papel">
                    {[["usuario", "Usuário"], ["admin", "Administrador"]].map(([v, r]) => (
                      <button
                        key={v}
                        type="button"
                        disabled={ehVoce}
                        className={rascunho.papel === v ? "ativo" : ""}
                        aria-pressed={rascunho.papel === v}
                        onClick={() => setRascunho({ ...rascunho, papel: v })}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  {ehVoce && <small className="adm-suave">Você não pode mudar o próprio papel nem se desativar.</small>}
                </div>

                <div className="adm-campo">
                  Grupos
                  {gruposDoUsuario(rascunho.grupoIds, (ids) => setRascunho({ ...rascunho, grupoIds: ids }))}
                </div>

                {mudou && (
                  <div className="adm-barra-pendente" role="status">
                    <span>Alterações não salvas</span>
                    <button type="button" className="botao-acao-secundario" onClick={() => setRascunho({ departamento: usuario.departamento || "", papel: usuario.papel, status: usuario.status, grupoIds: usuario.grupoIds || [] })}>
                      Descartar
                    </button>
                    <button type="button" className="botao-acao-primario" onClick={() => salvar()} disabled={ocupado === "salvar"}>
                      {ocupado === "salvar" && <span className="spinner" aria-hidden="true" />}
                      Salvar
                    </button>
                  </div>
                )}

                <div className="adm-bloco-acao">
                  <div>
                    <strong>Piloto no DroneManagement</strong>
                    <span className="adm-suave">
                      {usuario.pilotUserADId
                        ? usuario.pilotoLogin
                          ? `Vinculado como ${usuario.pilotoLogin} — pode apontar voos pelo mapa Voos.`
                          : "Vinculado (pelo identificador, antes do login). Digite o login para atualizar."
                        : "Necessário para apontar voos pelo mapa Voos. Use o mesmo usuário da entrada do DroneManagement."}
                    </span>
                    <input
                      type="text"
                      className="adm-entrada-piloto"
                      placeholder="Usuário no DroneManagement (ex.: lmalerbo)"
                      value={piloto}
                      onChange={(e) => setPiloto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && piloto.trim()) salvarPiloto(piloto.trim());
                      }}
                      aria-label="Login no DroneManagement"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <span className="adm-acoes-piloto">
                    <button
                      type="button"
                      className="botao-acao-secundario"
                      onClick={() => salvarPiloto(piloto.trim())}
                      disabled={
                        ocupado === "piloto" ||
                        !piloto.trim() ||
                        piloto.trim().toLowerCase() === (usuario.pilotoLogin || "").toLowerCase()
                      }
                    >
                      {ocupado === "piloto" && <span className="spinner" aria-hidden="true" />}
                      {ocupado === "piloto" ? "Procurando…" : "Vincular"}
                    </button>
                    {usuario.pilotUserADId && (
                      <button type="button" className="botao-acao-secundario adm-botao-perigo-leve" onClick={() => salvarPiloto("")} disabled={ocupado === "piloto"}>
                        Desvincular
                      </button>
                    )}
                  </span>
                </div>

                <div className="adm-bloco-acao">
                  <div>
                    <strong>Senha</strong>
                    <span className="adm-suave">Volta para a temporária ({SENHA_TEMPORARIA_EXIBIDA}); a pessoa escolhe outra no próximo acesso.</span>
                  </div>
                  <button type="button" className="botao-acao-secundario" onClick={redefinir} disabled={ocupado === "senha"}>
                    {ocupado === "senha" && <span className="spinner" aria-hidden="true" />}
                    Redefinir
                  </button>
                </div>

                {!ehVoce && (
                  <div className="adm-bloco-acao adm-bloco-acao--perigo">
                    <div>
                      <strong>{usuario.status === "ativo" ? "Desativar acesso" : "Reativar acesso"}</strong>
                      <span className="adm-suave">
                        {usuario.status === "ativo"
                          ? "Bloqueia a entrada sem apagar nada. Excluir apaga a conta de vez."
                          : "Libera a entrada de novo, com os mesmos grupos."}
                      </span>
                    </div>
                    <button type="button" className="botao-acao-secundario" onClick={alternarStatus} disabled={ocupado === "salvar"}>
                      {usuario.status === "ativo" ? "Desativar" : "Reativar"}
                    </button>
                    <button type="button" className="botao-acao-perigo" onClick={excluir} disabled={ocupado === "excluir"}>
                      {ocupado === "excluir" && <span className="spinner" aria-hidden="true" />}
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {aba === "grupos" && !carregando && (
        <div className="adm-grupos">
          <form className="adm-cartao adm-novo-grupo" onSubmit={criarGrupo}>
            <input type="text" className="adm-busca" placeholder="Nome do novo grupo" value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value)} aria-label="Nome do novo grupo" />
            <button type="submit" className="botao-acao-primario" disabled={!novoGrupo.trim() || ocupado === "grupo"}>
              + Criar grupo
            </button>
          </form>
          {grupos.length === 0 ? (
            <p className="adm-vazio">
              <IconeEstadoVazio /> Nenhum grupo ainda.
            </p>
          ) : (
            <ul className="adm-grade-grupos">
              {grupos.map((g) => {
                const membros = usuarios.filter((u) => (u.grupoIds || []).includes(g.id));
                const veMapas = mapasPorGrupo.get(g.id) || [];
                return (
                  <li key={g.id} className="adm-cartao adm-cartao-grupo">
                    <div className="adm-cartao-grupo-topo">
                      <span className="adm-avatar adm-avatar--grupo" aria-hidden="true">
                        {g.nome.charAt(0).toUpperCase()}
                      </span>
                      {renomeando?.id === g.id ? (
                        <form className="adm-renomear" onSubmit={renomearGrupo}>
                          <input type="text" className="adm-busca" value={renomeando.nome} onChange={(e) => setRenomeando({ ...renomeando, nome: e.target.value })} aria-label="Novo nome do grupo" autoFocus />
                          <button type="submit" className="botao-acao-primario" disabled={!renomeando.nome.trim()}>
                            Salvar
                          </button>
                          <button type="button" className="botao-acao-secundario" onClick={() => setRenomeando(null)}>
                            Cancelar
                          </button>
                        </form>
                      ) : (
                        <span className="adm-pessoa-texto">
                          <span className="adm-forte">{g.nome}</span>
                          <small className="adm-suave">{membros.length ? `${plural(membros.length, "membro", "membros")}: ${membros.map((u) => u.nome.split(" ")[0]).join(", ")}` : "Sem membros"}</small>
                        </span>
                      )}
                    </div>
                    <div className="adm-grupo-mapas">
                      <span className="adm-rotulo-secao">Vê estes mapas</span>
                      {veMapas.length ? (
                        <span className="adm-chips">
                          {veMapas.map((m) => (
                            <span key={m.nome} className="adm-etiqueta">
                              {m.nome}
                              {m.anota ? " · anota" : ""}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="adm-suave">Nenhum mapa ainda</span>
                      )}
                    </div>
                    {renomeando?.id !== g.id && (
                      <div className="adm-acoes-grupo">
                        <Link to="/admin/mapas" className="adm-link-forte">
                          Mudar acesso nos mapas →
                        </Link>
                        <span className="adm-espaco" />
                        <button type="button" className="botao-acao-secundario" onClick={() => setRenomeando({ id: g.id, nome: g.nome })}>
                          Renomear
                        </button>
                        <button type="button" className="botao-acao-secundario adm-botao-perigo-leve" onClick={() => removerGrupo(g, membros.length)}>
                          Remover
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
