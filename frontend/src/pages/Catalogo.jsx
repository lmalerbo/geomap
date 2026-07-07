import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { buscarCatalogo, baixarMapa } from "../lib/api.js";
import { salvarMapaBaixado, listarMapasBaixados } from "../lib/db.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Catalogo() {
  const { sessao, sair } = useAuth();
  const navigate = useNavigate();
  const [mapas, setMapas] = useState([]);
  const [baixadosIds, setBaixadosIds] = useState(new Set());
  const [baixando, setBaixando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarCatalogo();
  }, []);

  async function carregarBaixados() {
    const locais = await listarMapasBaixados();
    setBaixadosIds(new Set(locais.map((m) => m.id)));
    return locais;
  }

  async function carregarCatalogo() {
    setCarregando(true);
    const locais = await carregarBaixados();
    try {
      const remoto = await buscarCatalogo(sessao.token);
      setMapas(remoto);
      setAviso(null);
    } catch {
      setAviso("Sem conexão com o servidor — mostrando só os mapas já baixados neste dispositivo.");
      setMapas(locais.map((m) => ({ id: m.id, nome: m.nome, versao: "-", categoria: "-" })));
    } finally {
      setCarregando(false);
    }
  }

  async function handleBaixar(mapa) {
    setBaixando(mapa.id);
    try {
      const blob = await baixarMapa(sessao.token, mapa.id);
      await salvarMapaBaixado(mapa.id, mapa.nome, blob);
      setBaixadosIds((prev) => new Set(prev).add(mapa.id));
    } catch (err) {
      setAviso(`Falha ao baixar "${mapa.nome}": ${err.message}`);
    } finally {
      setBaixando(null);
    }
  }

  function handleSair() {
    sair();
    navigate("/login");
  }

  return (
    <main className="tela-catalogo">
      <header>
        <h1>Mapas disponíveis</h1>
        <button type="button" onClick={handleSair}>
          Sair
        </button>
      </header>

      {aviso && <p className="aviso">{aviso}</p>}
      {carregando && <p>Carregando...</p>}

      <ul className="lista-mapas">
        {mapas.map((mapa) => {
          const jaBaixado = baixadosIds.has(mapa.id);
          return (
            <li key={mapa.id} className="item-mapa">
              <div>
                <strong>{mapa.nome}</strong>
                <span className="meta">
                  {mapa.categoria} · v{mapa.versao}
                </span>
              </div>
              <div className="acoes">
                {jaBaixado && (
                  <Link to={`/mapa/${mapa.id}`} className="botao">
                    Abrir
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => handleBaixar(mapa)}
                  disabled={baixando === mapa.id}
                >
                  {baixando === mapa.id ? "Baixando..." : jaBaixado ? "Atualizar" : "Baixar"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {!carregando && mapas.length === 0 && <p>Nenhum mapa disponível.</p>}
    </main>
  );
}
