# Backend — GeoPortal

Node.js/Express + PostgreSQL. Login (JWT + bcrypt) é o único endpoint da
Fase 0/1 inicial — catálogo e download vêm depois (ver `docs/ROADMAP.md`).

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
4. `npm install`
5. `npm run migrate` — aplica `src/db/migrations/001_schema_inicial.sql`
   (tabelas do `docs/SCHEMA_BANCO.md`).
6. `npm run seed` — cria usuário de teste `teste@geoportal.local` / `senha123`
   (dado fictício, só para dev local).
7. `npm run start` (ou `npm run dev` com reload automático).

## Testar o login

```
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@geoportal.local","senha":"senha123"}'
```

Retorna `{ token, usuario }`. Cada login bem-sucedido grava uma linha em
`logs` (`acao = 'login'`), conforme `docs/SCHEMA_BANCO.md`.
