import { Component } from "react";

// Error boundary só existe como componente de classe em React — não tem
// equivalente em hook. Sem isso, um erro de render não tratado (bug,
// dado inesperado) derruba a tela inteira em branco, sem nenhum aviso.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { comErro: false };
  }

  static getDerivedStateFromError() {
    return { comErro: true };
  }

  componentDidCatch(erro, info) {
    console.error("Erro não tratado:", erro, info);
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
        </main>
      );
    }
    return this.props.children;
  }
}
