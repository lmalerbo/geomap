// Reconhece o padrao de nome usado pela exportacao FME (visto direto na
// pasta de rede pelo Leo):
//
//   {Talhoes|limites}_{unidade}_{DD}_{MM}_{YYYY}_fme.{shp|shx|dbf|prj|cpg}
//
// Ex: "Talhoes_da_Pedra_20_07_2026_fme.shp", "limites_da_Pedra_18_07_2026_fme.dbf".
// Capitalizacao do prefixo de tipo e inconsistente entre os dois exemplos
// reais ("Talhoes" maiusculo, "limites" minusculo) -- por isso o "i" no
// regex. O grupo de unidade e greedy (".+") pra cobrir nomes com
// underscore no meio, tipo "da_Pedra", e ainda assim ancorar certo na
// data por causa do sufixo fixo "_fme.<ext>".
const REGEX_NOME = /^(talhoes|limites)_(.+)_(\d{2})_(\d{2})_(\d{4})_fme\.(shp|shx|dbf|prj|cpg)$/i;

export const EXTENSOES_OBRIGATORIAS = ["shp", "shx", "dbf", "prj"];
export const EXTENSOES_OPCIONAIS = ["cpg"];

// Unidades reconhecidas nesta leva -- qualquer outra (ex: "Ipe", visto no
// mesmo print) e ignorada de proposito, ver docs/ROADMAP.md.
export const UNIDADES_SUPORTADAS = new Set(["da_pedra"]);

// Devolve null se o nome nao bate com o padrao esperado (arquivo de
// outra origem, digitado a mao, etc) -- nunca lanca excecao, quem chama
// decide se loga/ignora.
export function interpretarNomeArquivo(nomeArquivo) {
  const m = REGEX_NOME.exec(nomeArquivo);
  if (!m) return null;
  const [, tipoBruto, unidadeBruta, dd, mm, yyyy, extensaoBruta] = m;
  const tipo = tipoBruto.toLowerCase() === "talhoes" ? "talhoes" : "limites";
  const unidade = unidadeBruta.toLowerCase();
  const extensao = extensaoBruta.toLowerCase();
  // ISO (YYYY-MM-DD) -- comparacao de string lexicografica ja equivale a
  // comparacao cronologica, sem precisar de Date/parsing extra em nenhum
  // outro lugar do codigo.
  const data = `${yyyy}-${mm}-${dd}`;
  const baseSemExtensao = nomeArquivo.slice(0, nomeArquivo.length - extensaoBruta.length - 1);
  return { tipo, unidade, data, extensao, baseSemExtensao, nomeArquivo };
}

export function unidadeSuportada(unidade) {
  return UNIDADES_SUPORTADAS.has(unidade);
}
