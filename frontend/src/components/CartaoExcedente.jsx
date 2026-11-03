import { useRef, useState } from "react";
import { botoesDoStatus, ROTULOS_STATUS, CORES_EXCEDENTE } from "../lib/excedente.js";
import { useOcupado } from "./movimento/index.js";
import { areaTrechoHa, lerTrechoDeArquivo } from "../lib/trechoExcedente.js";

function diaLocal(deslocamentoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const formatarDia = (dia) => (dia ? dia.split("-").reverse().join("/") : "");
// feitoEm vem em UTC: cortar a string daria o dia seguinte depois das 21h.
const formatarMomento = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

// Botão de ação com a espera do movimento (ver docs/movimento-esperas.md):
// o ✓/✕ aparece antes de o cartão mudar. `aoDepois` só roda depois disso.
function BotaoAcao({ rotulo, aoAcao, aoDepois, className = "" }) {
  const ocupado = useOcupado();
  return (
    <button
      {...ocupado.propsBotao({
        type: "button",
        className,
        onClick: () => ocupado.executar(aoAcao, { texto: "Salvando…" }).then(() => aoDepois?.()).catch(() => {}),
      })}
    >
      {ocupado.conteudo(rotulo)}
    </button>
  );
}

const abreFormulario = (status) => status === "precisa_ajuste" || status === "ajustado";

const fmtHa = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// Cartão do talhão no mapa de Plantio Excedente. `trechoDesenhado` chega do
// Mapa.jsx: desenhado pela medição de área ou lido de um .kml/.zip
// (`aoDefinirTrecho`). A área sai sempre da geometria, nunca digitada.
export default function CartaoExcedente({
  caso, podeEditar, aoApontar, aoDesenhar, aoDefinirTrecho, aoDescartarTrecho, aoFechar, trechoDesenhado,
}) {
  const [acao, setAcao] = useState(null); // status escolhido aguardando os campos
  const [erroArquivo, setErroArquivo] = useState(null);
  const [lendoArquivo, setLendoArquivo] = useState(false);
  const entradaArquivo = useRef(null);
  const areaTrecho = trechoDesenhado ? areaTrechoHa(trechoDesenhado) : null;
  const [observacao, setObservacao] = useState("");
  const [dataAjuste, setDataAjuste] = useState(diaLocal(0));
  const [outroDia, setOutroDia] = useState(false);

  function montarCampos(status) {
    const campos = {};
    if (status === "precisa_ajuste") {
      campos.areaExcedenteHa = areaTrecho;
      campos.poligonoExcedente = trechoDesenhado;
    }
    if (status === "ajustado") campos.dataAjuste = dataAjuste;
    if (observacao.trim()) campos.observacao = observacao.trim();
    return campos;
  }

  const enviar = (status) => aoApontar({ casoId: caso.id, status, campos: montarCampos(status) });
  const fecharFormulario = () => {
    setAcao(null);
    setObservacao("");
    setErroArquivo(null);
    aoDescartarTrecho?.(); // senão o próximo "Precisa de ajuste" reaproveitaria o desenho
  };

  async function aoEscolherArquivo(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setErroArquivo(null);
    setLendoArquivo(true);
    try {
      aoDefinirTrecho(await lerTrechoDeArquivo(file), { enquadrar: true });
    } catch (err) {
      setErroArquivo(err.message);
    } finally {
      setLendoArquivo(false);
    }
  }

  return (
    <aside className="painel-flutuante painel-atributos aberto cartao-excedente" aria-label="Análise de plantio excedente">
      <header className="cabecalho-atributos">
        <div>
          <h2>Talhão {caso.talhao}</h2>
          <p className="subtitulo">{caso.fazenda} · cód. {caso.secao}{caso.fornecedor ? " · fornecedor" : ""}</p>
        </div>
        <button type="button" className="fechar" aria-label="Fechar" onClick={aoFechar}>×</button>
      </header>
      <p className="selo-status-excedente" style={{ "--cor-status": CORES_EXCEDENTE[caso.status] }}>
        {ROTULOS_STATUS[caso.status]}{caso.pendente ? " · aguardando envio" : ""}
      </p>
      <p>Voo de Falhas Plantio em {formatarDia(caso.dataVoo)}</p>
      {caso.vooCancelado && <p className="aviso">Voo cancelado no DroneManagement.</p>}
      {caso.areaExcedenteHa != null && <p>Área excedente: {fmtHa(caso.areaExcedenteHa)} ha</p>}
      {caso.observacao && <p>{caso.observacao}</p>}
      {caso.dataAjuste && <p>Ajuste feito em {formatarDia(caso.dataAjuste)}</p>}

      {podeEditar && !acao && (
        <div className="acoes-excedente">
          {botoesDoStatus(caso.status).map((b) =>
            abreFormulario(b.status) ? (
              <button key={b.status} type="button" onClick={() => setAcao(b.status)}>
                {b.rotulo}
              </button>
            ) : (
              <BotaoAcao key={b.status} rotulo={b.rotulo} aoAcao={() => enviar(b.status)} />
            ),
          )}
        </div>
      )}

      {podeEditar && acao === "precisa_ajuste" && (
        <form className="form-excedente" onSubmit={(e) => e.preventDefault()}>
          <div className="acoes-excedente">
            <button type="button" onClick={aoDesenhar}>{trechoDesenhado ? "Desenhar de novo" : "Desenhar trecho"}</button>
            <button type="button" disabled={lendoArquivo} onClick={() => entradaArquivo.current?.click()}>
              {lendoArquivo ? "Lendo arquivo…" : "Enviar arquivo (.kml ou .zip)"}
            </button>
            <input ref={entradaArquivo} type="file" accept=".kml,.zip" hidden onChange={aoEscolherArquivo} />
          </div>
          {erroArquivo && <p className="erro">{erroArquivo}</p>}
          {trechoDesenhado ? (
            <p className="area-trecho-excedente">
              Área excedente: <strong>{fmtHa(areaTrecho)} ha</strong>
              {trechoDesenhado.type === "MultiPolygon" && ` em ${trechoDesenhado.coordinates.length} partes`}
            </p>
          ) : (
            <p className="dica-trecho-excedente">Desenhe o trecho no mapa ou envie o .kml / .zip do shapefile: a área é calculada pela geometria.</p>
          )}
          <label>
            Observação
            <textarea value={observacao} maxLength={2000} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          <div className="acoes-excedente">
            {trechoDesenhado ? (
              <BotaoAcao rotulo="Confirmar" aoAcao={() => enviar("precisa_ajuste")} aoDepois={fecharFormulario} />
            ) : (
              <button type="button" disabled>Confirmar</button>
            )}
            <button type="button" onClick={fecharFormulario}>Cancelar</button>
          </div>
        </form>
      )}

      {podeEditar && acao === "ajustado" && (
        <form className="form-excedente" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>Data do ajuste</legend>
            <button type="button" onClick={() => { setOutroDia(false); setDataAjuste(diaLocal(0)); }}>Hoje</button>
            <button type="button" onClick={() => { setOutroDia(false); setDataAjuste(diaLocal(-1)); }}>Ontem</button>
            <button type="button" onClick={() => setOutroDia(true)}>Outro dia</button>
            {outroDia && <input type="date" value={dataAjuste} max={diaLocal(0)} onChange={(e) => setDataAjuste(e.target.value)} />}
            <p>{formatarDia(dataAjuste)}</p>
          </fieldset>
          <label>
            Observação
            <textarea value={observacao} maxLength={2000} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          <div className="acoes-excedente">
            <BotaoAcao rotulo="Confirmar" aoAcao={() => enviar("ajustado")} aoDepois={fecharFormulario} />
            <button type="button" onClick={fecharFormulario}>Cancelar</button>
          </div>
        </form>
      )}

      {caso.historico?.length > 0 && (
        <ol className="historico-excedente">
          {caso.historico.filter((h) => !h.substituido).map((h) => (
            <li key={h.id}>{ROTULOS_STATUS[h.statusNovo]} por {h.usuarioNome || "?"}, {formatarMomento(h.feitoEm)}</li>
          ))}
        </ol>
      )}
    </aside>
  );
}
