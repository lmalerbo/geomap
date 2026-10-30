import { useState } from "react";
import { botoesDoStatus, ROTULOS_STATUS, CORES_EXCEDENTE } from "../lib/excedente.js";
import { useOcupado } from "./movimento/index.js";

function diaLocal(deslocamentoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const formatarDia = (dia) => (dia ? dia.split("-").reverse().join("/") : "");

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

// Cartão do talhão no mapa de Plantio Excedente. `trechoDesenhado` chega do
// Mapa.jsx depois que o usuário desenha o trecho pela medição de área.
export default function CartaoExcedente({ caso, podeEditar, aoApontar, aoDesenhar, aoFechar, trechoDesenhado }) {
  const [acao, setAcao] = useState(null); // status escolhido aguardando os campos
  const [area, setArea] = useState(caso.areaExcedenteHa ?? "");
  const [observacao, setObservacao] = useState("");
  const [dataAjuste, setDataAjuste] = useState(diaLocal(0));
  const [outroDia, setOutroDia] = useState(false);

  function montarCampos(status) {
    const campos = {};
    if (status === "precisa_ajuste") {
      campos.areaExcedenteHa = area === "" ? null : Number(area);
      if (trechoDesenhado) campos.poligonoExcedente = trechoDesenhado;
    }
    if (status === "ajustado") campos.dataAjuste = dataAjuste;
    if (observacao.trim()) campos.observacao = observacao.trim();
    return campos;
  }

  const enviar = (status) => aoApontar({ casoId: caso.id, status, campos: montarCampos(status) });
  const fecharFormulario = () => {
    setAcao(null);
    setObservacao("");
  };

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
      {caso.areaExcedenteHa != null && <p>Área excedente estimada: {caso.areaExcedenteHa} ha</p>}
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
          <label>
            Área excedente estimada (ha)
            <input type="number" min="0" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} />
          </label>
          <label>
            Observação
            <textarea value={observacao} maxLength={2000} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          <button type="button" onClick={aoDesenhar}>{trechoDesenhado ? "Desenhar de novo" : "Desenhar trecho"}</button>
          {trechoDesenhado && <p>Trecho desenhado.</p>}
          <div className="acoes-excedente">
            <BotaoAcao rotulo="Confirmar" aoAcao={() => enviar("precisa_ajuste")} aoDepois={fecharFormulario} />
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
            <li key={h.id}>{ROTULOS_STATUS[h.statusNovo]} por {h.usuarioNome || "?"}, {formatarDia(h.feitoEm?.slice(0, 10))}</li>
          ))}
        </ol>
      )}
    </aside>
  );
}
