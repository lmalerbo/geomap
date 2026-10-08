import { Component } from "react";
import { recarregarPraVersaoNova } from "../lib/versaoNova.js";

// Arquivo da versão anterior que não existe mais (o app foi atualizado com a
// aba aberta). Mensagem do Chrome, do Safari e do Firefox.
const ERRO_VERSAO_ANTIGA = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

// Error boundary só existe como componente de classe em React — não tem
// equivalente em hook. Sem isso, um erro de render não tratado (bug,
// dado inesperado) derruba a tela inteira em branco, sem nenhum aviso.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { comErro: false, erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { comErro: true, erro };
  }

  componentDidCatch(erro, info) {
    console.error("Erro não tratado:", erro, info);
    if (ERRO_VERSAO_ANTIGA.test(erro?.message || "")) recarregarPraVersaoNova();
  }

  render() {
    if (this.state.comErro) {
      return (
        <main className="tela-mapa-erro">
          <h1>Algo deu errado</h1>
          <p>
            O GeoMap encontrou um erro inesperado. Seus dados baixados continuam
            salvos — recarregar a página costuma resolver.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Recarregar
          </button>
          {/* Sem acesso a um Mac, não dá pra abrir o Web Inspector remoto
              num iPad/iPhone — isso é a única forma de ver o erro real de
              um dispositivo em campo. Custo de UX baixo (fica escondido
              atrás de um <details>), valor alto pra suporte. */}
          <details className="detalhes-erro-tecnico">
            <summary>Detalhes técnicos</summary>
            <pre>{this.state.erro?.stack || this.state.erro?.message || String(this.state.erro)}</pre>
          </details>
        </main>
      );
    }
    return this.props.children;
  }
}
