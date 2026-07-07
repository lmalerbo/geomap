Este é o início do projeto GeoPortal. Antes de escrever qualquer código, leia
CLAUDE.md e todos os arquivos em docs/ (ARQUITETURA.md, SCHEMA_BANCO.md,
ROADMAP.md) — eles definem o escopo, a arquitetura e o que fica de fora do
MVP. Não pule essa leitura.

Contexto resumido: é um visualizador web (PWA) de mapas geoespaciais de
fazenda, que substitui um fluxo atual baseado em arquivos CarryMap (.cmf2)
distribuídos com senha compartilhada. A fonte dos dados é um .shp que já é
gerado hoje antes da etapa do CarryMap. O requisito não-negociável do MVP é
funcionar 100% offline em campo depois de um download inicial autenticado.

Quero que você me ajude a executar a Fase 0 e o começo da Fase 1 do
ROADMAP.md, nesta ordem:

1. Me pergunte qual stack de backend eu prefiro (Node/Express ou FastAPI) —
   não decida sozinho, essa decisão está em aberto no CLAUDE.md.
2. Monte a estrutura de pastas do repositório (pipeline/, backend/,
   frontend/, docs/ já existe).
3. Verifique se `tippecanoe` está disponível no ambiente; se não estiver, me
   diga como instalar (não tente instalar sozinho sem eu confirmar).
4. Crie um `.shp` sintético simples de teste (2-3 talhões fictícios com
   atributos tipo nome, área, variedade de cana) só pra validar o pipeline —
   deixe claro que é dado fake.
5. Escreva o script do pipeline (.shp → tippecanoe → .pmtiles) e rode com o
   dado sintético, me mostrando o resultado.
6. Só depois disso, comece o esqueleto do backend (tabelas do
   SCHEMA_BANCO.md + endpoint de login).

Não avance pra etapas de frontend/PWA nesta primeira sessão — quero validar
o pipeline e o backend mínimo primeiro. Vá em passos pequenos e me mostre
cada resultado antes de seguir pro próximo item.
