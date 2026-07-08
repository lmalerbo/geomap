# Backend — GeoMap

Node.js/Express + PostgreSQL. Endpoints da Fase 1: login (JWT + bcrypt),
catálogo (`GET /mapas`) e download (`GET /mapas/:id/download`), ambos
protegidos por token e filtrados pela permissão de grupo do usuário.

## Setup local

1. PostgreSQL rodando (local ou remoto). No Windows, via scoop:
   ```
   scoop install postgresql
   pg_ctl -D "<data-dir>" start
   ```
2. Criar role e banco de dev:
   ```sql
   CREATE ROLE geoportal LOGIN PASSWORD 'geoportal';
   CREATE DATABASE geoportal_dev OWNER geoportal;
   ```
3. `cp .env.example .env` e ajustar `DATABASE_URL`/`JWT_SECRET` se necessário.
   `STORAGE_DIR` (padrão `./storage`) é onde os `.pmtiles` publicados ficam.
4. `npm install`
5. `npm run migrate` — aplica `src/db/migrations/001_schema_inicial.sql`
   (tabelas do `docs/SCHEMA_BANCO.md`).
6. `npm run seed` — cria usuário de teste `teste@geoportal.local` / `senha123`
   e dois mapas fictícios (um visível pro grupo do usuário, outro restrito a
   outro grupo, só pra provar que o filtro de permissão funciona). Dado
   fictício, só para dev local.
7. Coloque um `.pmtiles` de teste em `storage/talhoes_teste.pmtiles` (pode
   baixar o artefato `pmtiles-teste` de uma run do
   `.github/workflows/pipeline.yml`).
8. `npm run start` (ou `npm run dev` com reload automático).

## Testar login → catálogo → download

```
TOKEN=$(curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@geoportal.local","senha":"senha123"}' | jq -r .token)

curl http://localhost:3000/mapas -H "Authorization: Bearer $TOKEN"
curl -o mapa.pmtiles http://localhost:3000/mapas/1/download -H "Authorization: Bearer $TOKEN"
```

- `/login`: valida credenciais com bcrypt, emite JWT, grava log (`acao='login'`).
- `/mapas`: só retorna mapas que algum grupo do usuário tem permissão de ver.
- `/mapas/:id/download`: confere a permissão de novo (não confia no catálogo),
  grava log (`acao='download'`) e libera o arquivo. Mapa fora da permissão
  do usuário retorna 404. Sem token, qualquer uma das três rotas protegidas
  retorna 401.
