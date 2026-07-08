import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PMTiles } from "pmtiles";
import {
  listarMapasAdmin,
  baixarMapaAdmin,
  buscarConfigEstilo,
  salvarConfigEstilo,
  renomearMapaAdmin,
} from "../lib/api.js";
import { BlobSource } from "../lib/pmtilesBlobSource.js";
import { corDaCamada } from "../lib/paleta.js";
import { useAuth } from "../context/AuthContext.jsx";

const CAMADA_ROTULOS = "rotulos";

export default function AdminCamadas() {
  const { sessao } = useAuth();
  const [mapas, setMapas] = useState([]);
  const [mapaId, setMapaId] = useState("");
  const [form, setForm] = useState(null);
  const [temRotulosNoDado, setTemRotulosNoDado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvoEm, setSalvoEm] = useState(null);

  useEffect(() => {
    listarMapasAdmin(sessao.token).then(setMapas).catch((e) => setErro(e.message));
  }, [sessao.token]);

  useEffect(() => {
    if (!mapaId) {
      setForm(null);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    setSalvoEm(null);

    (async () => {
      try {
        const mapa = mapas.find((m) => String(m.id) === String(mapaId));
        const [estilo, blob] = await Promise.all([
          buscarConfigEstilo(sessao.token, mapaId),
          baixarMapaAdmin(sessao.token, mapaId),
        ]);
        const pmtiles = new PMTiles(new BlobSource(`admin-estilo-${mapaId}`, blob));
        const metadata = await pmtiles.getMetadata();
        const camadas = metadata?.vector_layers || [];
        const camadaPrincipal = camadas.find((l) => l.id !== CAMADA_ROTULOS);
        const ehTalhao = "TALHAO" in (camadaPrincipal?.fields || {});
        const temRotulos = camadas.some((l) => l.id === CAMADA_ROTULOS);

        if (cancelado) return;
        setTemRotulosNoDado(temRotulos);
        setForm({
          nome: mapa?.nome || "",
          cor: estilo?.cor || corDaCamada(Number(mapaId)),
          opacidadePreenchimento: estilo?.opacidadePreenchimento ?? (ehTalhao ? 0.35 : 0),
          mostrarRotulo: estilo?.mostrarRotulo ?? true,
          zoomRotulo: estilo?.zoomRotulo ?? (ehTalhao ? 13 : 10),
        });
      } catch (e) {
        if (!cancelado) setErro(e.message);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaId, sessao.token]);

  function atualizarCampo(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await Promise.all([
        renomearMapaAdmin(sessao.token, mapaId, form.nome),
        salvarConfigEstilo(sessao.token, mapaId, {
          cor: form.cor,
          opacidadePreenchimento: Number(form.opacidadePreenchimento),
          mostrarRotulo: form.mostrarRotulo,
          zoomRotulo: Number(form.zoomRotulo),
        }),
      ]);
      setMapas((atual) =>
        atual.map((m) => (String(m.id) === String(mapaId) ? { ...m, nome: form.nome } : m))
      );
      setSalvoEm(new Date());
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoMap — Editar camadas</strong>
        <span className="status-sync" />
        <Link to="/admin" className="botao botao-sair">
          ← Admin
        </Link>
      </header>

      <div className="painel-admin-conteudo">
        <label className="campo-select-mapa">
          Camada
          <select value={mapaId} onChange={(e) => setMapaId(e.target.value)}>
            <option value="">Selecione…</option>
            {mapas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>

        {erro && <p className="erro">{erro}</p>}
        {carregando && <p>Carregando…</p>}

        {form && !carregando && (
          <>
            <label className="campo-form-admin">
              Nomenclatura
              <input
                type="text"
                value={form.nome}
                onChange={(e) => atualizarCampo("nome", e.target.value)}
              />
            </label>

            <label className="campo-form-admin campo-form-admin--cor">
              Cor da camada
              <input
                type="color"
                value={form.cor}
                onChange={(e) => atualizarCampo("cor", e.target.value)}
              />
            </label>

            <label className="campo-form-admin">
              Opacidade do preenchimento ({form.opacidadePreenchimento})
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={form.opacidadePreenchimento}
                onChange={(e) => atualizarCampo("opacidadePreenchimento", e.target.value)}
              />
            </label>

            <label className="campo-form-admin campo-form-admin--checkbox">
              <input
                type="checkbox"
                checked={form.mostrarRotulo}
                disabled={!temRotulosNoDado}
                onChange={(e) => atualizarCampo("mostrarRotulo", e.target.checked)}
              />
              Mostrar rótulo
              {!temRotulosNoDado && " (este mapa não tem camada de rótulos gerada no pipeline)"}
            </label>

            <label className="campo-form-admin">
              Zoom mínimo do rótulo ({form.zoomRotulo})
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                disabled={!form.mostrarRotulo}
                value={form.zoomRotulo}
                onChange={(e) => atualizarCampo("zoomRotulo", e.target.value)}
              />
            </label>

            <div className="acoes-admin-atributos">
              <button type="button" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
              {salvoEm && (
                <span className="confirmacao-salvo">
                  Salvo às{" "}
                  {salvoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
