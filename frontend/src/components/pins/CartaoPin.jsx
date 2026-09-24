import LinhaCoordenada from "../LinhaCoordenada.jsx";
import { nomeIcone, urlSvgPin } from "../../lib/iconesPreparo.js";

function formatarDataHora(iso) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CartaoPin({ pin, podeEditar, aoEditar, aoMover, aoRemover, aoFechar }) {
  return (
    <aside className={`painel-flutuante painel-atributos painel-pin${pin ? " aberto" : ""}`}>
      {pin && (
        <>
          <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar anotação" title="Fechar">
            ×
          </button>
          <h2 className="titulo-pin">
            <img src={urlSvgPin(pin.icone, pin.cor)} alt="" width="22" height="28" />
            <span>{pin.titulo}</span>
          </h2>
          <p className="tipo-pin">{nomeIcone(pin.icone)}</p>
          {pin.nota && <p className="nota-pin">{pin.nota}</p>}
          <LinhaCoordenada lngLat={{ lng: pin.lng, lat: pin.lat }} />
          <p className="autoria-pin">
            Criado por {pin.criadoPorNome || "usuário removido"} em {formatarDataHora(pin.criadoEm)}
            {pin.atualizadoEm !== pin.criadoEm && (
              <>
                <br />
                Editado por {pin.atualizadoPorNome || "usuário removido"} em {formatarDataHora(pin.atualizadoEm)}
              </>
            )}
          </p>
          {pin.pendente && <p className="pendente-pin">Aguardando envio (sem internet)</p>}
          {podeEditar && (
            <div className="acoes-pin">
              <button type="button" onClick={aoEditar}>Editar</button>
              <button type="button" onClick={aoMover}>Mover</button>
              <button
                type="button"
                className="botao-remover-mapa"
                onClick={() => {
                  if (window.confirm(`Remover a anotação "${pin.titulo}"?`)) aoRemover();
                }}
              >
                Remover
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
