# Build context = raiz do repo (não backend/), pra conseguir copiar
# pipeline/rotulos (irmão de backend/, não filho) — ver Render dashboard:
# Dockerfile Path = backend/Dockerfile, Docker Build Context Directory = .
FROM node:20-bookworm-slim

# gdal-bin -> ogr2ogr. build-essential/libsqlite3-dev/zlib1g-dev -> compilar
# tippecanoe (não existe pacote apt pronto). python3/pip -> scripts de
# rótulo em pipeline/rotulos/. git -> clonar tippecanoe. Mesma lista de
# pacotes já validada em .github/workflows/pipeline.yml (roda hoje contra
# um fixture sintético), adaptada pro apt não-interativo do Debian.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates \
      gdal-bin \
      build-essential libsqlite3-dev zlib1g-dev \
      python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# tippecanoe + tile-join — `make install` do mesmo Makefile gera os dois
# binários (confirmado localmente nesta sessão: tile-join sai junto de
# tippecanoe no mesmo build).
RUN git clone --depth 1 https://github.com/felt/tippecanoe.git /tmp/tippecanoe \
    && cd /tmp/tippecanoe \
    && make -j"$(nproc)" \
    && make install \
    && rm -rf /tmp/tippecanoe

WORKDIR /app

# Scripts de rótulo (Python) — deps pinadas em pipeline/requirements.txt.
# --break-system-packages é obrigatório no Debian 12+ (PEP 668,
# "externally managed environment" bloqueia pip install fora de venv);
# seguro aqui porque o container não tem nenhum outro uso de Python.
COPY pipeline/requirements.txt ./pipeline/requirements.txt
RUN pip install --break-system-packages --no-cache-dir -r pipeline/requirements.txt
COPY pipeline/rotulos ./pipeline/rotulos

# App Node — caminho espelha a estrutura do repo (backend/ irmão de
# pipeline/), pra ROTULOS_SCRIPTS_DIR (3 níveis acima de admin.js) resolver
# igual em produção e em dev local, sem lógica divergente por ambiente.
COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev
COPY backend/src ./src

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
