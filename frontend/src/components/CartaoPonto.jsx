import LinhaCoordenada from "./LinhaCoordenada.jsx";

// Clique fora de qualquer feição: mostra a coordenada do ponto (todos os
// mapas). Em mapa com anotação liberada, oferece criar um pin ali.
export default function CartaoPonto({ lngLat, podeAnotar, aoAdicionarPin, aoFechar }) {
  return (
    <aside className={`painel-flutuante painel-atributos painel-ponto${lngLat ? " aberto" : ""}`}>
      {lngLat && (
        <>
          <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar ponto selecionado" title="Fechar">
            ×
          </button>
          <h2>Ponto selecionado</h2>
          <LinhaCoordenada lngLat={lngLat} />
          {podeAnotar && (
            <button type="button" className="botao botao-adicionar-pin" onClick={aoAdicionarPin}>
              + Adicionar pin aqui
            </button>
          )}
        </>
      )}
    </aside>
  );
}
