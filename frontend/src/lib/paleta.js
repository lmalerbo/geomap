// Paleta categórica validada (dataviz skill): ordem fixa, checada pra
// separação CVD e contraste contra o fundo do mapa. A cor é atribuída pelo
// id do mapa (identidade), nunca pela posição na lista — assim uma camada
// não muda de cor só porque outra camada foi sincronizada antes/depois.
export const PALETA_HEX = [
  "#2a78d6", // azul
  "#1baf7a", // água
  "#eda100", // amarelo
  "#008300", // verde
  "#4a3aa7", // violeta
  "#e34948", // vermelho
  "#e87ba4", // magenta
  "#eb6834", // laranja
];

export function corDaCamada(mapaId) {
  return PALETA_HEX[mapaId % PALETA_HEX.length];
}
