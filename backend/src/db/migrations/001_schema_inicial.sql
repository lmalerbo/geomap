-- Schema inicial do GeoPortal — ver docs/SCHEMA_BANCO.md

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    departamento TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grupos (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuarios_grupos (
    usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    grupo_id INTEGER NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
    PRIMARY KEY (usuario_id, grupo_id)
);

CREATE TABLE IF NOT EXISTS mapas (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    versao TEXT NOT NULL,
    categoria TEXT,
    arquivo_path TEXT NOT NULL,
    publicado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissoes (
    mapa_id INTEGER NOT NULL REFERENCES mapas (id) ON DELETE CASCADE,
    grupo_id INTEGER NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
    PRIMARY KEY (mapa_id, grupo_id)
);

CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
    mapa_id INTEGER REFERENCES mapas (id),
    acao TEXT NOT NULL CHECK (acao IN ('login', 'download')),
    data_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip TEXT
);
