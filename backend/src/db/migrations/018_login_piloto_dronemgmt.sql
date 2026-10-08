-- Vínculo de piloto pelo login do DroneManagement (2026-10-08): o admin
-- digita o usuário (ex.: lmalerbo) e o backend busca o id na plataforma
-- (GET .../identity/appuser/by-username/{login}). Guarda o login pra tela
-- mostrar "Vinculado como lmalerbo" — não há busca reversa id -> login.
-- Vínculos antigos (feitos colando o id) ficam com login NULL.
ALTER TABLE pilotos_dronemgmt ADD COLUMN IF NOT EXISTS login_dronemgmt TEXT;
