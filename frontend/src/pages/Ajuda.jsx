import { useNavigate } from "react-router-dom";

const DICAS = [
  {
    titulo: "Buscar uma fazenda",
    texto:
      'Use a lupa no topo do mapa e digite o nome ou o código da fazenda (ex: "Pedra" ou "10003"). Separe vários termos com ";" pra buscar mais de uma de uma vez.',
  },
  {
    titulo: "Ligar/desligar camadas",
    texto: 'O botão "Camadas" abre o painel com todas as camadas do mapa — marque ou desmarque pra mostrar só o que interessa.',
  },
  {
    titulo: "Ver os dados de um talhão",
    texto: "Toque num talhão no mapa pra abrir o painel com os atributos dele. Se houver mais de uma feição no mesmo ponto, dá pra navegar entre elas.",
  },
  {
    titulo: "Medir distância ou área",
    texto: 'O botão de medição (régua) deixa marcar pontos no mapa e calcula a distância/área percorrida.',
  },
  {
    titulo: "Gravar um percurso",
    texto: 'Grava o caminho percorrido usando o GPS do aparelho e exporta como KML ao final — útil pra registrar um trajeto em campo.',
  },
  {
    titulo: "Fundo de satélite",
    texto: "Alterna entre o fundo padrão e imagem de satélite — só funciona com internet, não é baixado pro uso offline.",
  },
  {
    titulo: "Funciona sem internet?",
    texto:
      "Sim — depois da primeira sincronização (feita automaticamente ao entrar com internet), os mapas permitidos ficam salvos no aparelho e continuam funcionando normalmente sem rede nenhuma.",
  },
];

export default function Ajuda() {
  const navigate = useNavigate();

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoMap — Ajuda</strong>
        <span className="status-sync" />
        <button type="button" className="botao botao-sair" onClick={() => navigate(-1)}>
          ← Voltar
        </button>
      </header>

      <div className="painel-admin-conteudo">
        <section className="cartao-form-admin">
          <h2>Sobre o GeoMap</h2>
          <p>
            Visualizador de mapas geoespaciais das fazendas (talhões, limites e outras camadas),
            com login próprio e permissão por grupo. Depois da primeira sincronização, funciona
            100% offline em campo.
          </p>
        </section>

        <section className="cartao-form-admin">
          <h2>Dicas rápidas</h2>
          <dl className="lista-dicas-ajuda">
            {DICAS.map((d) => (
              <div key={d.titulo}>
                <dt>{d.titulo}</dt>
                <dd>{d.texto}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="versao-app">Versão do app: {typeof __GIT_HASH__ !== "undefined" ? __GIT_HASH__ : "dev"}</p>
      </div>
    </main>
  );
}
