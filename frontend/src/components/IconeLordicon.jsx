import { defineElement } from "@lordicon/element";
import lottie from "lottie-web";

// Ícone animado (Lottie, catálogo Lordicon) — os .json em public/lordicon/
// foram baixados uma vez e ficam hospedados como asset estático do próprio
// app, nunca a URL do CDN deles: o embed code que o Lordicon devolve vem
// com um token JWT que expira em poucos dias, inviável de gravar direto no
// código (o ícone pararia de carregar sozinho depois do vencimento). Ver
// PROPOSTA_ANIMACOES.md pro contexto de onde cada ícone é usado.
//
// Precisa do wrapper oficial @lordicon/element (registra o custom element
// <lord-icon>) — os .json do Lordicon não são Lottie "puro": têm múltiplos
// estados nomeados na mesma timeline (marcadores tipo "in-reveal"/
// "hover-swirl"), e tocar isso direto com lottie-web puro (sem o wrapper)
// falha com BMConfigErrorEvent, sem renderizar nada.
// Nível de módulo — roda uma vez só, na primeira vez que esse arquivo é
// importado (nunca de novo, mesmo que o componente monte várias vezes).
defineElement(lottie.loadAnimation);

// `trigger`: "loop" (anima direto, contínuo — pra estados de espera longa)
// | "hover" (só anima uma vez enquanto o mouse está em cima, como o botão
// de "Remover"). `import.meta.env.BASE_URL` é o mesmo cuidado já aplicado
// nas fontes do mapa — sem isso, o caminho não bate com a URL real numa
// project page do GitHub Pages.
export default function IconeLordicon({ nome, trigger = "loop", tamanho = 20, cor, className }) {
  return (
    <lord-icon
      src={`${import.meta.env.BASE_URL}lordicon/${nome}.json`}
      trigger={trigger}
      colors={cor ? `primary:${cor}` : undefined}
      className={className}
      style={{ width: tamanho, height: tamanho, display: "inline-block", flexShrink: 0, marginRight: 6 }}
    ></lord-icon>
  );
}
