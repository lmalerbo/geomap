import { useEffect, useState } from "react";
import { listarPinsPendentes, limparPinsLocais, limparApontamentosLocais } from "../lib/db.js";
import { EVENTO_PINS_ATUALIZADOS } from "../lib/syncPinsApp.js";

// Quantas anotações ainda não foram enviadas (todos os mapas) — usado no
// cabeçalho e para avisar antes de sair da conta.
export function usePinsPendentes() {
  const [quantidade, setQuantidade] = useState(0);
  useEffect(() => {
    let ativo = true;
    async function atualizar() {
      const n = (await listarPinsPendentes()).length;
      if (ativo) setQuantidade(n);
    }
    atualizar();
    window.addEventListener(EVENTO_PINS_ATUALIZADOS, atualizar);
    const intervalo = setInterval(atualizar, 15000);
    return () => {
      ativo = false;
      window.removeEventListener(EVENTO_PINS_ATUALIZADOS, atualizar);
      clearInterval(intervalo);
    };
  }, []);
  return quantidade;
}

// Confirmação de saída da conta quando há anotações ainda não enviadas —
// usado por handleSair em Mapa.jsx e Inicio.jsx (extraído pra não duplicar
// o mesmo texto/regra nos dois lugares, achado de revisão 2026-09-25).
// Retorna true quando pode seguir com o logout (sem pendentes, ou o usuário
// confirmou mesmo assim).
export function confirmarSaidaComPendentes(quantidade, apontamentos = 0) {
  if (quantidade <= 0 && apontamentos <= 0) return true;
  const partes = [];
  if (quantidade > 0) partes.push(`${quantidade} anotação(ões)`);
  if (apontamentos > 0) partes.push(`${apontamentos} apontamento(s) de voo`);
  return window.confirm(
    `Você tem ${partes.join(" e ")} ainda não enviado(s). Sair agora vai descartá-los. Sair mesmo assim?`
  );
}

// Apaga tudo que foi guardado em nome do usuário que está saindo: anotações
// e a fila de apontamentos de voo (redesenho fase 4).
async function limparDadosLocaisDoUsuario() {
  await limparPinsLocais();
  await limparApontamentosLocais();
}

// Logout compartilhado de Mapa.jsx/Inicio.jsx: confirma (se houver
// pendentes), apaga os pins locais e só então chama `sair` do AuthContext.
// Se não der pra apagar, não sai — senão os pendentes iriam pro servidor
// com a identidade do próximo usuário (achado de revisão final 2026-09-25).
// Devolve true quando saiu de fato (quem chama só navega nesse caso).
export async function sairDescartandoPins(
  quantidadePendentes,
  sair,
  limpar = limparDadosLocaisDoUsuario,
  quantidadeApontamentos = 0
) {
  if (!confirmarSaidaComPendentes(quantidadePendentes, quantidadeApontamentos)) return false;
  try {
    await limpar();
  } catch (erro) {
    console.error("Falha ao apagar dados locais antes de sair", erro);
    window.alert("Não foi possível apagar as anotações e apontamentos deste aparelho. Tente sair de novo.");
    return false;
  }
  sair();
  return true;
}
