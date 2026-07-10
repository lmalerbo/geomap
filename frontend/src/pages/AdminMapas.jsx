import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listarMapasAdmin,
  listarGruposAdmin,
  enviarMapaAdmin,
  atualizarArquivoMapaAdmin,
  removerMapaAdmin,
} from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { corDaCamada } from "../lib/paleta.js";

export default function AdminMapas() {
  const { sessao } = useAuth();
  const [mapas, setMapas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [form, setForm] = useState({ nome: "", versao: "1.0", categoria: "", grupoIds: [] });
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizandoId, setAtualizandoId] = useState(null);
  const [novaVersao, setNovaVersao] = useState("");
  const [novoArquivo, setNovoArquivo] = useState(null);
  const [enviandoAtualizacao, setEnviandoAtualizacao] = useState(false);

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

  async function enviar(e) {
    e.preventDefault();
    if (!arquivo) {
      setErro("Selecione um arquivo .pmtiles");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await enviarMapaAdmin(sessao.token, { ...form, arquivo });
      setForm({ nome: "", versao: "1.0", categoria: "", grupoIds: [] });
      setArquivo(null);
      document.getElementById("campo-arquivo-pmtiles").value = "";
      await carregarMapas();
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function abrirAtualizacao(mapa) {
    setAtualizandoId(mapa.id);
    setNovaVersao(mapa.versao);
    setNovoArquivo(null);
    setErro(null);
  }

  function fecharAtualizacao() {
    setAtualizandoId(null);
    setNovoArquivo(null);
  }

  async function enviarAtualizacao(e, mapa) {
    e.preventDefault();
    if (!novoArquivo) {
      setErro("Selecione um arquivo .pmtiles");
      return;
    }
    setEnviandoAtualizacao(true);
    setErro(null);
    try {
      await atualizarArquivoMapaAdmin(sessao.token, mapa.id, { versao: novaVersao, arquivo: novoArquivo });
      fecharAtualizacao();
      await carregarMapas();
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviandoAtualizacao(false);
    }
  }

  async function remover(mapa) {
    if (!window.confirm(`Remover "${mapa.nome}"? Os usuários que já baixaram continuam com a cópia local até o próximo sync, mas o mapa some do catálogo.`)) {
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
        <strong>GeoMap — Adicionar/remover camadas</strong>
        <span className="status-sync" />
        <Link to="/admin" className="botao botao-sair">
          ← Admin
        </Link>
      </header>

      <div className="painel-admin-conteudo painel-admin-conteudo--largo">
        {erro && <p className="erro">{erro}</p>}

        <form onSubmit={enviar} className="cartao-form-admin">
          <h2>Adicionar camada</h2>

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
            Versão
            <input
              type="text"
              required
              value={form.versao}
              onChange={(e) => atualizarCampo("versao", e.target.value)}
            />
          </label>

          <label className="campo-form-admin">
            Categoria
            <input
              type="text"
              value={form.categoria}
              onChange={(e) => atualizarCampo("categoria", e.target.value)}
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

          <label className="campo-form-admin">
            Arquivo .pmtiles
            <input
              id="campo-arquivo-pmtiles"
              type="file"
              accept=".pmtiles"
              required
              onChange={(e) => setArquivo(e.target.files[0] || null)}
            />
          </label>

          <button type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Adicionar camada"}
          </button>
        </form>

        <h2 className="titulo-lista-mapas">Camadas existentes</h2>
        <ul className="lista-mapas-admin">
          {mapas.map((m) => (
            <li key={m.id} className="item-mapa-admin">
              <div className="linha-mapa-admin">
                <span
                  className="swatch-camada"
                  style={{ backgroundColor: m.estilo_config?.cor || corDaCamada(m.id) }}
                  aria-hidden="true"
                />
                <div className="info-mapa-admin">
                  <strong>{m.nome}</strong>
                  <span className="detalhe-mapa-admin">
                    {m.categoria ? `${m.categoria} · ` : ""}v{m.versao}
                  </span>
                </div>
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => (atualizandoId === m.id ? fecharAtualizacao() : abrirAtualizacao(m))}
                >
                  {atualizandoId === m.id ? "Cancelar" : "Atualizar arquivo"}
                </button>
                <button
                  type="button"
                  className="botao-remover-mapa"
                  onClick={() => remover(m)}
                  disabled={removendoId === m.id}
                >
                  {removendoId === m.id ? "Removendo…" : "Remover"}
                </button>
              </div>

              {atualizandoId === m.id && (
                <form className="form-atualizar-arquivo" onSubmit={(e) => enviarAtualizacao(e, m)}>
                  <input
                    type="text"
                    value={novaVersao}
                    onChange={(e) => setNovaVersao(e.target.value)}
                    aria-label="Nova versão"
                    required
                  />
                  <input
                    type="file"
                    accept=".pmtiles"
                    onChange={(e) => setNovoArquivo(e.target.files[0] || null)}
                    aria-label="Novo arquivo .pmtiles"
                    required
                  />
                  <button type="submit" disabled={enviandoAtualizacao}>
                    {enviandoAtualizacao ? "Enviando…" : "Enviar nova versão"}
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
