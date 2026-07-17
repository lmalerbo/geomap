import { PALETA_HEX } from "./paleta.js";

const PREENCHIMENTO_VAZIO = {
  modo: "simples",
  cor: null,
  opacidade: 0,
  campo: null,
  // Campos extras pra categorizar combinando valores de até 3 campos (igual
  // "Valores únicos, muitos campos" do ArcGIS Pro) — vazio (o caso comum,
  // 1 campo só) preserva o comportamento de sempre.
  camposAdicionais: [],
  categorias: [],
  corSemCategoria: "#999999",
  campoNumerico: null,
  classes: [],
  corAbaixoDoMinimo: "#999999",
  // Modo "gradiente" (transição contínua entre 2 cores, sem degraus —
  // diferente do "graduado" acima, que é por faixas discretas).
  corInicial: null,
  corFinal: null,
  min: 0,
  max: 100,
};

// Separador usado tanto pra montar o valor combinado (chave de categorias[])
// quanto na expressão MapLibre (concat) que produz esse mesmo valor em
// runtime — precisa ser idêntico dos dois lados pro "match" bater. Caractere
// de controle (Unit Separator, U+001F) proposital, escrito via escape (nunca
// literal na fonte — caractere invisível direto no arquivo já causou bug de
// encoding nesse projeto antes): não aparece em dado de atributo real, então
// nunca colide com um valor genuíno de campo.
export const SEPARADOR_CAMPOS = "\u001F";

const CONTORNO_VAZIO = { cor: null, largura: 1.5, opacidade: 1, estiloTraco: "solido" };

const ROTULO_VAZIO = {
  mostrar: true,
  origem: "pipeline", // "pipeline" (camada rotulos gerada pelo pipeline) | "atributo" (campo do próprio polígono)
  campo: null,
  tamanhoFonte: 12,
  cor: "#1f2933",
  zoomMinimo: 10,
};

const VISIBILIDADE_VAZIA = { zoomMinimo: 0, zoomMaximo: 24 };

// Só tem efeito em camadas de ponto (Mapa.jsx decide se usa, olhando
// ehPonto) — formas além do círculo exigem layer "symbol" com ícone
// gerado em runtime (ver desenharBitmapForma), não um "circle" comum.
export const FORMAS_PONTO = [
  { valor: "circulo", rotulo: "Círculo" },
  { valor: "quadrado", rotulo: "Quadrado" },
  { valor: "triangulo", rotulo: "Triângulo" },
  { valor: "estrela", rotulo: "Estrela" },
];

const SIMBOLO_VAZIO = {
  modo: "fixo", // "fixo" (1 forma pra camada toda) | "categorizado" (1 forma por valor de campo)
  forma: "circulo",
  campo: null,
  categorias: [], // [{valor, forma}]
  formaSemCategoria: "circulo",
};

// Única fonte de verdade dos defaults/heurística de estilo — usada tanto
// pra renderizar (Mapa.jsx) quanto pra editar (AdminCamadas.jsx). Aceita
// null, o formato antigo (flat: {cor, opacidadePreenchimento, mostrarRotulo,
// zoomRotulo}) ou o novo (com sub-objetos preenchimento/contorno/rotulo/
// visibilidade) e sempre devolve o formato novo completo — uma camada com
// config salva no formato antigo continua renderizando exatamente igual,
// sem precisar de migração de banco.
// MapLibre valida estritamente o tipo das propriedades de estilo — um
// "4" (string, o que sai de qualquer <input type="range"/"number"> do
// React) em vez de 4 (number) faz addLayer() lançar exceção e aborta a
// aplicação de TODAS as camadas seguintes no mesmo loop (Mapa.jsx). Força
// number aqui, na única fonte de verdade, pra cobrir tanto config nova
// quanto qualquer config antiga que já tenha sido salva com string.
function numeroOuPadrao(valor, padrao) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

// Decide se a camada desenha só contorno, só preenchimento, ou os dois —
// campo de nível superior novo (tipoDesenho), só relevante pra camada
// não-ponto (Mapa.jsx ignora isso pra ponto). Config já salva com esse
// campo usa ele direto; config salva ANTES dele existir (toda camada já
// publicada) infere a partir das opacidades já salvas, pra continuar
// renderizando exatamente igual sem precisar resalvar.
function tipoDesenhoOuPadrao(bruto, preenchimento, contorno) {
  if (bruto?.tipoDesenho) return bruto.tipoDesenho;
  const temContorno = contorno.opacidade > 0;
  const temPreenchimento = preenchimento.opacidade > 0;
  if (temContorno && temPreenchimento) return "ambos";
  if (temContorno) return "contorno";
  if (temPreenchimento) return "preenchimento";
  return "ambos";
}

export function normalizarEstiloConfig(bruto, { ehTalhao = false, ehPonto = false, corPadrao = "#2a78d6" } = {}) {
  // Talhão ganha preenchimento translúcido (dá pra ver o mapa base por
  // baixo); ponto ganha preenchimento praticamente sólido (era um "circle-
  // opacity: Math.max(0.75, ...)" fixo em Mapa.jsx — virou heurística de
  // default aqui pra não depender de um floor hardcoded que impedia zerar o
  // preenchimento de propósito). Os dois têm um motivo pra não ficar 0 por
  // padrão; as demais camadas (linha/contorno simples, ex: Limites) ficam
  // só com o contorno mesmo, preenchimento 0.
  const opacidadeHeuristica = ehTalhao ? 0.35 : ehPonto ? 0.85 : 0;
  const zoomRotuloHeuristico = ehTalhao ? 13 : 10;

  if (bruto?.preenchimento) {
    const cor = bruto.preenchimento.cor || corPadrao;
    const preenchimento = { ...PREENCHIMENTO_VAZIO, cor, opacidade: opacidadeHeuristica, ...bruto.preenchimento };
    const contorno = { ...CONTORNO_VAZIO, cor, ...bruto.contorno };
    const rotulo = { ...ROTULO_VAZIO, zoomMinimo: zoomRotuloHeuristico, ...bruto.rotulo };
    const visibilidade = { ...VISIBILIDADE_VAZIA, ...bruto.visibilidade };
    const simbolo = { ...SIMBOLO_VAZIO, ...bruto.simbolo };
    const preenchimentoFinal = {
      ...preenchimento,
      opacidade: numeroOuPadrao(preenchimento.opacidade, opacidadeHeuristica),
      classes: preenchimento.classes.map((c) => ({ ...c, ate: numeroOuPadrao(c.ate, 0) })),
      camposAdicionais: Array.isArray(preenchimento.camposAdicionais) ? preenchimento.camposAdicionais : [],
      min: numeroOuPadrao(preenchimento.min, 0),
      max: numeroOuPadrao(preenchimento.max, 100),
    };
    const contornoFinal = {
      ...contorno,
      largura: numeroOuPadrao(contorno.largura, 1.5),
      opacidade: numeroOuPadrao(contorno.opacidade, 1),
    };
    return {
      tipoDesenho: tipoDesenhoOuPadrao(bruto, preenchimentoFinal, contornoFinal),
      preenchimento: preenchimentoFinal,
      contorno: contornoFinal,
      rotulo: {
        ...rotulo,
        tamanhoFonte: numeroOuPadrao(rotulo.tamanhoFonte, 12),
        zoomMinimo: numeroOuPadrao(rotulo.zoomMinimo, zoomRotuloHeuristico),
      },
      visibilidade: {
        zoomMinimo: numeroOuPadrao(visibilidade.zoomMinimo, 0),
        zoomMaximo: numeroOuPadrao(visibilidade.zoomMaximo, 24),
      },
      simbolo,
    };
  }

  // Formato antigo (flat) ou vazio/null.
  const cor = bruto?.cor || corPadrao;
  const opacidade = numeroOuPadrao(bruto?.opacidadePreenchimento, opacidadeHeuristica);
  const zoomMinimo = numeroOuPadrao(bruto?.zoomRotulo, zoomRotuloHeuristico);
  const mostrar = bruto?.mostrarRotulo ?? true;
  const preenchimentoAntigo = { ...PREENCHIMENTO_VAZIO, cor, opacidade };
  const contornoAntigo = { ...CONTORNO_VAZIO, cor };

  return {
    tipoDesenho: tipoDesenhoOuPadrao(bruto, preenchimentoAntigo, contornoAntigo),
    preenchimento: preenchimentoAntigo,
    contorno: contornoAntigo,
    rotulo: { ...ROTULO_VAZIO, mostrar, zoomMinimo },
    visibilidade: { ...VISIBILIDADE_VAZIA },
    simbolo: { ...SIMBOLO_VAZIO },
  };
}

// Expressão MapLibre que produz o valor a comparar no "match" — um "get"
// simples (1 campo, o caso comum) ou um "concat" dos campos escolhidos
// unidos por SEPARADOR_CAMPOS (categorizado combinando até 3 campos, igual
// "Valores únicos, muitos campos" do ArcGIS Pro) — precisa bater exatamente
// com o valor combinado montado em lerValoresUnicosCombinados
// (pmtilesValores.js), que é o mesmo texto usado como chave em
// categorias[].valor.
function expressaoValorCategoria(preenchimento) {
  const campos = [preenchimento.campo, ...preenchimento.camposAdicionais];
  if (campos.length === 1) return ["get", campos[0]];
  return [
    "concat",
    ...campos.flatMap((campo, i) => (i === 0 ? [["to-string", ["get", campo]]] : [SEPARADOR_CAMPOS, ["to-string", ["get", campo]]])),
  ];
}

// Monta a expressão de fill-color do MapLibre a partir do preenchimento
// normalizado — um valor literal (modo simples) ou uma expressão
// data-driven (categorizado/graduado).
export function expressaoCorPreenchimento(preenchimento) {
  if (preenchimento.modo === "categorizado" && preenchimento.campo && preenchimento.categorias.length > 0) {
    const pares = preenchimento.categorias.flatMap((c) => [c.valor, c.cor]);
    return ["match", expressaoValorCategoria(preenchimento), ...pares, preenchimento.corSemCategoria];
  }
  if (
    preenchimento.modo === "gradiente" &&
    preenchimento.campoNumerico &&
    preenchimento.corInicial &&
    preenchimento.corFinal &&
    preenchimento.max > preenchimento.min
  ) {
    return [
      "interpolate",
      ["linear"],
      ["get", preenchimento.campoNumerico],
      preenchimento.min,
      preenchimento.corInicial,
      preenchimento.max,
      preenchimento.corFinal,
    ];
  }
  if (preenchimento.modo === "graduado" && preenchimento.campoNumerico && preenchimento.classes.length > 0) {
    const ordenadas = [...preenchimento.classes].sort((a, b) => a.ate - b.ate);
    const passos = ordenadas.slice(0, -1).flatMap((c) => [c.ate, c.cor]);
    const ultima = ordenadas[ordenadas.length - 1];
    return [
      "step",
      ["get", preenchimento.campoNumerico],
      preenchimento.corAbaixoDoMinimo,
      ...passos,
      ultima.cor,
    ];
  }
  return preenchimento.cor;
}

// dasharray do MapLibre é em múltiplos da largura da linha, não pixels
// fixos — os valores abaixo dão um traço/pontinho proporcional em
// qualquer largura configurada. "Pontilhado" usa um dash quase-zero com
// ponta arredondada (line-cap: round), o jeito padrão de desenhar bolinha
// em vez de traço no MapLibre; "sólido" não usa dasharray nenhum.
export function expressaoTracoLinha(estiloTraco) {
  if (estiloTraco === "tracejado") return { dasharray: [3, 2], cap: "butt" };
  if (estiloTraco === "pontilhado") return { dasharray: [0.1, 1.5], cap: "round" };
  return { dasharray: null, cap: "butt" };
}

// Atribui cores da paleta categórica validada (dataviz), por índice — igual
// ao critério já usado pra cor padrão de camada, mas aqui por valor único.
// `valoresUnicos` já vem combinado (join por SEPARADOR_CAMPOS) quando há
// mais de 1 campo — a função não precisa saber disso, só atribui cor.
export function gerarCategorias(valoresUnicos) {
  return valoresUnicos.map((valor, i) => ({ valor, cor: PALETA_HEX[i % PALETA_HEX.length] }));
}

// Texto legível de um valor de categorias[] (possivelmente combinado de
// vários campos) pra exibir no admin — troca SEPARADOR_CAMPOS por " / ".
// Sem efeito num valor de 1 campo só (não contém o separador).
export function formatarValorCategoria(valor) {
  return String(valor).split(SEPARADOR_CAMPOS).join(" / ");
}

// Atribui formas por índice, ciclando FORMAS_PONTO — mesmo critério de
// gerarCategorias, mas pra forma em vez de cor.
export function gerarCategoriasForma(valoresUnicos) {
  return valoresUnicos.map((valor, i) => ({
    valor,
    forma: FORMAS_PONTO[i % FORMAS_PONTO.length].valor,
  }));
}

export function nomeImagemForma(forma) {
  return `forma-${forma}`;
}

// Expressão de icon-image do MapLibre a partir do símbolo normalizado — um
// nome de ícone fixo (modo "fixo") ou uma expressão data-driven
// (modo "categorizado"), mesmo padrão de expressaoCorPreenchimento.
export function expressaoIconePorCategoria(simbolo) {
  if (simbolo.modo === "categorizado" && simbolo.campo && simbolo.categorias.length > 0) {
    const pares = simbolo.categorias.flatMap((c) => [c.valor, nomeImagemForma(c.forma)]);
    return ["match", ["get", simbolo.campo], ...pares, nomeImagemForma(simbolo.formaSemCategoria)];
  }
  return nomeImagemForma(simbolo.forma);
}

// Formas diferentes de círculo só existem como ícone SDF (layer "symbol") —
// um "circle" comum não tem propriedade de forma. Continuar usando "circle"
// no modo fixo+círculo (o caso default de toda camada de ponto já existente)
// preserva fill/contorno 100% independentes (circle-opacity e
// circle-stroke-opacity são propriedades separadas); ícone SDF só tem UMA
// opacidade pro símbolo inteiro (preenchimento+contorno juntos) — trade-off
// aceito explicitamente pra ganhar forma categorizada.
export function usaIconeSimbolo(simbolo) {
  return simbolo.modo === "categorizado" || simbolo.forma !== "circulo";
}

function hexParaRgba(hex, alpha) {
  const { r, g, b } = hexParaRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Cor do halo (contorno) do ícone, com a opacidade do contorno embutida no
// próprio alpha — como icon-opacity é uma única propriedade pro símbolo
// inteiro (ver usaIconeSimbolo), embutir aqui é o jeito de contorno.opacidade
// continuar tendo efeito visível independente, mesmo sem um "icon-stroke-
// opacity" separado no MapLibre.
export function corHaloIcone(contorno) {
  return hexParaRgba(contorno.cor, contorno.opacidade);
}

// Desenha uma forma preenchida (branco opaco sobre transparente) num canvas
// pequeno — vira um ícone SDF (map.addImage(..., {sdf: true})), que o
// MapLibre re-colore por feição via icon-color/icon-halo-color. Não é uma
// distance-field matemática de verdade (só um alpha mask simples), mas pro
// tamanho pequeno desses marcadores o anti-aliasing do próprio canvas já
// dá uma borda suave o bastante.
export function desenharBitmapForma(forma, tamanho = 24) {
  const canvas = document.createElement("canvas");
  canvas.width = tamanho;
  canvas.height = tamanho;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000000";
  const c = tamanho / 2;
  const r = tamanho * 0.42;
  ctx.beginPath();
  if (forma === "quadrado") {
    const lado = r * 1.7;
    ctx.rect(c - lado / 2, c - lado / 2, lado, lado);
  } else if (forma === "triangulo") {
    ctx.moveTo(c, c - r);
    ctx.lineTo(c + r * 0.87, c + r * 0.5);
    ctx.lineTo(c - r * 0.87, c + r * 0.5);
    ctx.closePath();
  } else if (forma === "estrela") {
    const pontas = 5;
    const rInterno = r * 0.42;
    for (let i = 0; i < pontas * 2; i++) {
      const raio = i % 2 === 0 ? r : rInterno;
      const angulo = (Math.PI / pontas) * i - Math.PI / 2;
      const x = c + raio * Math.cos(angulo);
      const y = c + raio * Math.sin(angulo);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    ctx.arc(c, c, r, 0, Math.PI * 2);
  }
  ctx.fill();
  return ctx.getImageData(0, 0, tamanho, tamanho);
}

function hexParaRgb(hex) {
  const limpo = hex.replace("#", "");
  return {
    r: parseInt(limpo.slice(0, 2), 16),
    g: parseInt(limpo.slice(2, 4), 16),
    b: parseInt(limpo.slice(4, 6), 16),
  };
}

function rgbParaHsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslParaHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const paraHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${paraHex(r)}${paraHex(g)}${paraHex(b)}`;
}

// N classes de intervalo igual entre min e max, rampa clara→escura a partir
// de 1 cor base (mesma matiz/saturação da cor base, luminosidade variando
// de ~85% até a luminosidade da própria cor).
export function gerarRampaClasses(min, max, numClasses, corBase) {
  const { h, s, l: lBase } = rgbParaHsl(hexParaRgb(corBase));
  const passo = (max - min) / numClasses;
  const classes = [];
  for (let i = 0; i < numClasses; i++) {
    const ate = i === numClasses - 1 ? max : min + passo * (i + 1);
    const t = numClasses === 1 ? 1 : i / (numClasses - 1);
    const lClasse = 85 - t * (85 - lBase);
    classes.push({ ate: Number(ate.toFixed(2)), cor: hslParaHex(h, s, lClasse) });
  }
  return classes;
}
