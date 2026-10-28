// O "campo": 4 barrinhas que crescem como linhas de plantio, no lugar do
// spinner. Porte de Mo.campo do Hub (docs/movimento-esperas.md).
// `herdaCor`: dentro de botão, as barras usam a cor do texto.
const CLASSE_TAMANHO = { normal: "", grande: "g", pequeno: "p" };

export default function Campo({ tamanho = "normal", herdaCor = false, className = "" }) {
  const classes = ["mo-campo", CLASSE_TAMANHO[tamanho] ?? "", herdaCor ? "b" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
