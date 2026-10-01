import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { buscarIndicadoresVoo } from "../lib/api.js";
import {
  hojeLocal, safraDe, ultimos30Dias, mesAtual, formatarHa, formatarPercentual, formatarDataHora,
  chaveResultado, salvarUltimoResultado, lerUltimoResultado, criarSequenciaRequisicoes,
} from "../lib/periodoIndicadores.js";
import CartaoKpi from "../components/indicadores/CartaoKpi.jsx";
import BarraProgresso from "../components/indicadores/BarraProgresso.jsx";
import BarrasPorTipo from "../components/indicadores/BarrasPorTipo.jsx";
import ColunasSemanais from "../components/indicadores/ColunasSemanais.jsx";

// Indicadores de voo — ver docs/superpowers/specs/2026-10-01-indicadores-voo-design.md.
// O backend decide o que cada um vê: piloto recebe o painel da equipe + o
// próprio rendimento; admin recebe também a lista por piloto e escolhe um.

const ATALHOS = [
  { id: "safra", rotulo: "Safra atual", periodo: safraDe },
  { id: "30d", rotulo: "Últimos 30 dias", periodo: ultimos30Dias },
  { id: "mes", rotulo: "Mês atual", periodo: mesAtual },
];

function MeuRendimento({ dados }) {
  return (
    <section className="ind-secao">
      <h2>Meu rendimento · {dados.piloto}</h2>
      <div className="ind-kpis ind-kpis--3">
        <CartaoKpi rotulo="Hectares voados" valor={formatarHa(dados.ha)} unidade="ha" cor="realizado" />
        <CartaoKpi rotulo="Talhões" valor={formatarHa(dados.talhoes)} detalhe={`${dados.diasVoados} dias com voo`} />
        <CartaoKpi rotulo="Média por dia voado" valor={formatarHa(dados.mediaHaPorDia)} unidade="ha" />
      </div>
      <h2 style={{ marginTop: 16 }}>Por semana</h2>
      <ColunasSemanais semanas={dados.porSemana} />
    </section>
  );
}

export default function Indicadores() {
  const navigate = useNavigate();
  const { sessao } = useAuth();
  const ehAdmin = sessao.usuario.papel === "admin";
  const hoje = hojeLocal();

  const [periodo, setPeriodo] = useState(() => safraDe(hoje));
  const [piloto, setPiloto] = useState("");
  const [pilotosConhecidos, setPilotosConhecidos] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const [offlineDesde, setOfflineDesde] = useState(null);

  const sequencia = useRef(criarSequenciaRequisicoes());
  const usuarioId = sessao.usuario.id;

  const carregar = useCallback(
    async ({ forcar = false } = {}) => {
      const chave = chaveResultado({ ...periodo, piloto, usuarioId });
      const id = sequencia.current.nova();
      setCarregando(true);
      setErro(null);
      try {
        const resposta = await buscarIndicadoresVoo(sessao.token, { ...periodo, piloto, forcar });
        if (!sequencia.current.ehAtual(id)) return; // período/piloto já mudou
        setDados(resposta);
        setOfflineDesde(null);
        salvarUltimoResultado(chave, resposta);
        if (resposta.porPiloto) {
          setPilotosConhecidos((atuais) => {
            const mapa = new Map(atuais.map((p) => [p.pilotoId, p.piloto]));
            for (const p of resposta.porPiloto) mapa.set(p.pilotoId, p.piloto);
            return [...mapa].map(([pilotoId, nome]) => ({ pilotoId, piloto: nome }));
          });
        }
      } catch (e) {
        if (!sequencia.current.ehAtual(id)) return;
        if (e.status === 403) {
          setSemAcesso(true);
        } else {
          const salvo = lerUltimoResultado(chave);
          if (salvo && e.status === undefined) {
            setDados(salvo.dados);
            setOfflineDesde(salvo.salvoEm);
          } else {
            setErro(e.status === undefined ? "Sem conexão e sem dados salvos neste aparelho para esse período." : e.message);
          }
        }
      } finally {
        if (sequencia.current.ehAtual(id)) setCarregando(false);
      }
    },
    [periodo, piloto, sessao.token, usuarioId]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atalhoAtivo = ATALHOS.find((a) => {
    const p = a.periodo(hoje);
    return p.de === periodo.de && p.ate === periodo.ate;
  })?.id;

  if (semAcesso) {
    return (
      <main className="tela-indicadores">
        <header className="barra-mapa">
          <strong>Indicadores de voo</strong>
          <span className="status-sync" />
          <button type="button" className="botao botao-sair" onClick={() => navigate(-1)}>← Voltar</button>
        </header>
        <div className="ind-conteudo">
          <p className="ind-aviso">Indicadores disponíveis só para pilotos e administradores.</p>
        </div>
      </main>
    );
  }

  const r = dados?.resumo;
  return (
    <main className="tela-indicadores">
      <header className="barra-mapa">
        <strong>Indicadores de voo</strong>
        <span className="status-sync" />
        <button type="button" className="botao botao-sair" onClick={() => navigate(-1)}>← Voltar</button>
      </header>

      <div className="ind-conteudo">
        <div className="ind-filtros">
          <label>
            De
            <input
              type="date"
              value={periodo.de}
              max={periodo.ate}
              onChange={(e) => e.target.value && setPeriodo((p) => ({ ...p, de: e.target.value }))}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={periodo.ate}
              min={periodo.de}
              onChange={(e) => e.target.value && setPeriodo((p) => ({ ...p, ate: e.target.value }))}
            />
          </label>
          <div className="ind-atalhos">
            {ATALHOS.map((a) => (
              <button key={a.id} type="button" aria-pressed={atalhoAtivo === a.id} onClick={() => setPeriodo(a.periodo(hoje))}>
                {a.rotulo}
              </button>
            ))}
          </div>
          {ehAdmin && (
            <label>
              Piloto
              <select value={piloto} onChange={(e) => setPiloto(e.target.value)}>
                <option value="">Equipe toda</option>
                {pilotosConhecidos.map((p) => (
                  <option key={p.pilotoId} value={p.pilotoId}>{p.piloto}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {offlineDesde && <p className="ind-aviso">Sem conexão · dados de {formatarDataHora(offlineDesde)}</p>}
        {dados?.desatualizado && !offlineDesde && (
          <p className="ind-aviso">O DroneManagement não respondeu; mostrando os últimos dados obtidos.</p>
        )}

        {carregando && !dados && (
          <div className="ind-carregando">
            <span className="spinner" aria-hidden="true" /> Buscando voos no DroneManagement…
          </div>
        )}

        {erro && (
          <div className="ind-aviso">
            {erro}{" "}
            <button type="button" className="botao" onClick={() => carregar()}>Tentar de novo</button>
          </div>
        )}

        {dados && (
          <>
            {dados.meuRendimento && <MeuRendimento dados={dados.meuRendimento} />}

            <section className="ind-secao">
              <h2>Equipe</h2>
              <div className="ind-kpis">
                <CartaoKpi
                  rotulo="Área total"
                  valor={formatarHa(r.totalHa)}
                  unidade="ha"
                  detalhe={`${formatarHa(r.realizadoTalhoes)} voados + ${formatarHa(r.aVoarTalhoes)} a voar`}
                />
                <CartaoKpi
                  rotulo="HA realizado"
                  valor={formatarHa(r.realizadoHa)}
                  unidade="ha"
                  detalhe={`${formatarPercentual(r.progresso)} do total`}
                  cor="realizado"
                />
                <CartaoKpi rotulo="A voar" valor={formatarHa(r.aVoarHa)} unidade="ha" detalhe="situação atual" cor="aVoar" />
                <CartaoKpi
                  rotulo="Últimos 15 dias úteis"
                  valor={formatarHa(dados.ultimos15DiasUteis.ha)}
                  unidade="ha"
                  detalhe={`${dados.ultimos15DiasUteis.diasComVoo} dias com voo`}
                  cor="recente"
                />
              </div>
              <BarraProgresso progresso={r.progresso} />
            </section>

            <section className="ind-secao">
              <h2>Realizado × a voar por tipo (ha)</h2>
              <BarrasPorTipo itens={dados.porTipo} />
            </section>

            <section className="ind-secao">
              <h2>Evolução semanal da equipe (ha)</h2>
              <ColunasSemanais semanas={dados.porSemana} />
            </section>

            {dados.porPiloto && (
              <section className="ind-secao">
                <h2>Por piloto</h2>
                {dados.porPiloto.length === 0 ? (
                  <p className="ind-vazio">Nenhum voo no período.</p>
                ) : (
                  <div className="ind-tabela-pilotos">
                    <table>
                      <thead>
                        <tr><th>Piloto</th><th>ha</th><th>Talhões</th><th>Dias voados</th><th>Média ha/dia</th></tr>
                      </thead>
                      <tbody>
                        {dados.porPiloto.map((p) => (
                          <tr key={p.pilotoId}>
                            <td>{p.piloto}</td>
                            <td>{formatarHa(p.ha)}</td>
                            <td>{formatarHa(p.talhoes)}</td>
                            <td>{p.diasVoados}</td>
                            <td>{formatarHa(p.mediaHaPorDia)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            <footer className="ind-rodape">
              <span>Dados do DroneManagement · atualizados {formatarDataHora(dados.atualizadoEm)}</span>
              <button type="button" className="botao" disabled={carregando} onClick={() => carregar({ forcar: true })}>
                {carregando ? "Atualizando…" : "Atualizar"}
              </button>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
