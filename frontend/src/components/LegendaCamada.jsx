import { formatarValorCategoria } from "../lib/estiloCamada.js";

// Desenha a forma real configurada (círculo/quadrado/triângulo/estrela) —
// antes o painel de camadas sempre mostrava o mesmo quadradinho arredondado
// pra qualquer camada de ponto, não importa a forma configurada no admin.
export function IconeFormaPonto({ forma, cor, corBorda, tamanho = 14 }) {
  const meio = tamanho / 2;
  const estiloComum = { fill: cor || "#999", stroke: corBorda || "rgba(0,0,0,0.2)", strokeWidth: 1 };
  let elemento;
  if (forma === "quadrado") {
    elemento = <rect x="1.5" y="1.5" width={tamanho - 3} height={tamanho - 3} rx="2" style={estiloComum} />;
  } else if (forma === "triangulo") {
    elemento = <path d={`M ${meio} 2 L ${tamanho - 2} ${tamanho - 2} L 2 ${tamanho - 2} Z`} style={estiloComum} />;
  } else if (forma === "estrela") {
    const pontos = pontosEstrela(meio, meio, meio - 2, meio - 5.5, 5);
    elemento = <polygon points={pontos} style={estiloComum} />;
  } else {
    elemento = <circle cx={meio} cy={meio} r={meio - 1.5} style={estiloComum} />;
  }
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      {elemento}
    </svg>
  );
}

function pontosEstrela(cx, cy, raioExterno, raioInterno, pontas) {
  const pontos = [];
  for (let i = 0; i < pontas * 2; i++) {
    const raio = i % 2 === 0 ? raioExterno : raioInterno;
    const angulo = (Math.PI / pontas) * i - Math.PI / 2;
    pontos.push(`${cx + raio * Math.cos(angulo)},${cy + raio * Math.sin(angulo)}`);
  }
  return pontos.join(" ");
}

// Faixa de cores — usada no lugar do swatch de 1 cor só quando a camada é
// categorizada/graduada/gradiente, pra dar uma pista visual de "isso tem
// mais de uma cor" sem precisar expandir a legenda completa.
export function FaixaCores({ cores }) {
  if (cores.length === 0) return null;
  return (
    <span className="faixa-cores-camada" aria-hidden="true">
      {cores.map((cor, i) => (
        <span key={i} style={{ backgroundColor: cor }} />
      ))}
    </span>
  );
}

export function FaixaGradiente({ corInicial, corFinal }) {
  return (
    <span
      className="faixa-cores-camada"
      aria-hidden="true"
      style={{ background: `linear-gradient(90deg, ${corInicial}, ${corFinal})` }}
    />
  );
}

// true quando existe algo pra legenda expansível mostrar além do swatch
// compacto — camada 100% "simples"/"fixo" não ganha a setinha de expandir.
export function temLegendaDetalhada({ preenchimento, contorno, simbolo, ehPonto }) {
  if (preenchimento?.modo && preenchimento.modo !== "simples") return true;
  if (contorno?.modo === "categorizado") return true;
  if (ehPonto && simbolo?.modo === "categorizado") return true;
  return false;
}

function BlocoLegendaCores({ titulo, itens }) {
  return (
    <div className="bloco-legenda-camada">
      <strong>{titulo}</strong>
      <ul>
        {itens.map((item, i) => (
          <li key={i}>
            <span className="swatch-camada" style={{ backgroundColor: item.cor }} aria-hidden="true" />
            {item.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Painel expandido com a legenda completa — cor/forma real de cada
// categoria, faixa a faixa (graduado) ou os dois extremos (gradiente).
// Só chamado quando temLegendaDetalhada(...) já confirmou que há algo aqui.
export default function LegendaCamada({ preenchimento, contorno, simbolo, ehPonto }) {
  const blocos = [];

  if (preenchimento?.modo === "categorizado") {
    blocos.push(
      <BlocoLegendaCores
        key="preench-cat"
        titulo={`Preenchimento por ${preenchimento.campo || "atributo"}`}
        itens={[
          ...preenchimento.categorias.map((c) => ({ cor: c.cor, texto: formatarValorCategoria(c.valor) })),
          { cor: preenchimento.corSemCategoria, texto: "Outros valores" },
        ]}
      />
    );
  } else if (preenchimento?.modo === "graduado" && preenchimento.classes.length > 0) {
    const ordenadas = [...preenchimento.classes].sort((a, b) => a.ate - b.ate);
    blocos.push(
      <BlocoLegendaCores
        key="preench-grad"
        titulo={`Preenchimento por ${preenchimento.campoNumerico || "atributo"}`}
        itens={[
          { cor: preenchimento.corAbaixoDoMinimo, texto: `Abaixo de ${ordenadas[0].ate}` },
          ...ordenadas.map((c) => ({ cor: c.cor, texto: `Até ${c.ate}` })),
        ]}
      />
    );
  } else if (preenchimento?.modo === "gradiente" && preenchimento.corInicial && preenchimento.corFinal) {
    blocos.push(
      <div key="preench-gradiente" className="bloco-legenda-camada">
        <strong>Preenchimento por {preenchimento.campoNumerico || "atributo"}</strong>
        <div className="legenda-gradiente">
          <FaixaGradiente corInicial={preenchimento.corInicial} corFinal={preenchimento.corFinal} />
          <span>
            {preenchimento.min} – {preenchimento.max}
          </span>
        </div>
      </div>
    );
  }

  if (contorno?.modo === "categorizado") {
    blocos.push(
      <BlocoLegendaCores
        key="contorno-cat"
        titulo={`Contorno por ${contorno.campo || "atributo"}`}
        itens={[
          ...contorno.categorias.map((c) => ({ cor: c.cor, texto: formatarValorCategoria(c.valor) })),
          { cor: contorno.corSemCategoria, texto: "Outros valores" },
        ]}
      />
    );
  }

  if (ehPonto && simbolo?.modo === "categorizado" && simbolo.categorias.length > 0) {
    blocos.push(
      <div key="simbolo-cat" className="bloco-legenda-camada">
        <strong>Forma por {simbolo.campo || "atributo"}</strong>
        <ul>
          {simbolo.categorias.map((c, i) => (
            <li key={i}>
              <IconeFormaPonto forma={c.forma} cor="#999" corBorda="#555" />
              {formatarValorCategoria(c.valor)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (blocos.length === 0) return null;
  return <div className="legenda-camada">{blocos}</div>;
}
