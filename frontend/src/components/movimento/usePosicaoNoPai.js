import { useLayoutEffect } from "react";

// <Concluido> e <Voo> cobrem o elemento pai (position:absolute; inset:0).
// Se o pai for `static`, vira `relative` enquanto a peça estiver na tela,
// como no Hub, e volta ao que era quando ela sai.
export default function usePosicaoNoPai(ref) {
  useLayoutEffect(() => {
    const pai = ref.current?.parentElement;
    if (!pai || getComputedStyle(pai).position !== "static") return undefined;
    const antes = pai.style.position;
    pai.style.position = "relative";
    return () => {
      pai.style.position = antes;
    };
  }, [ref]);
}
