-- Fluxo de senha temporária fixa: criar usuário ou redefinir senha nunca
-- mais deixa o admin escolher a senha em si (sempre "usina123", constante
-- em código) — o usuário só entra de verdade depois de trocar por uma
-- senha própria, na primeira vez que logar com uma senha temporária.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS precisa_trocar_senha BOOLEAN NOT NULL DEFAULT false;
