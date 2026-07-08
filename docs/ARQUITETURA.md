# Arquitetura — GeoMap

## Os dois mundos: online (publicação/login) e offline (uso em campo)

### Mundo online — só acontece com internet (escritório ou 4G no início do dia)

```
Analista GIS atualiza dados no ArcGIS Pro
        │
        ▼
Exporta .shp (etapa que já existe hoje, antes do CarryMap Builder)
        │
        ▼
Pipeline roda tippecanoe → gera .pmtiles
        │
        ▼
Upload do .pmtiles pro servidor (via script ou painel simples)
        │
        ▼
Mapa aparece no catálogo do backend, associado a um grupo de permissão
```

```
Usuário abre o Portal (PWA) com internet
        │
        ▼
Login (JWT) — usuário e senha próprios, sem Microsoft/Google
        │
        ▼
Backend consulta grupo do usuário e retorna só os mapas permitidos
        │
        ▼
Usuário toca em "Baixar mapa da Fazenda X"
        │
        ▼
Backend registra log (usuário, mapa, timestamp, IP) e libera o .pmtiles
        │
        ▼
PWA salva o .pmtiles no IndexedDB do navegador
```

### Mundo offline — em campo, sem sinal nenhum

```
App abre normalmente (PWA — o "shell" já está em cache pelo service worker,
não depende de rede pra abrir)
        │
        ▼
Lê o .pmtiles direto do IndexedDB (nenhuma chamada ao backend)
        │
        ▼
MapLibre GL JS renderiza os vetores localmente
        │
        ▼
Usuário clica num talhão → atributos aparecem na hora
(os atributos já estão embutidos no próprio .pmtiles, gerados pelo
tippecanoe a partir dos campos do .shp original)
```

Ponto chave: identificar um talhão em campo **nunca depende de rede**, porque
o tippecanoe empacota geometria + atributos juntos dentro do tile vetorial.

## Camadas do sistema

| Camada | Responsabilidade | Tecnologia sugerida |
|---|---|---|
| Pipeline | .shp → .pmtiles | tippecanoe + script Python/Node |
| Armazenamento | guardar os .pmtiles publicados | disco local do servidor ou bucket (definir depois) |
| Backend | login, catálogo, permissões, log de download | Node/Express ou FastAPI + PostgreSQL |
| Cliente (PWA) | catálogo, download, cache offline, visualização | MapLibre GL JS + Workbox |

## Por que .pmtiles e não GeoJSON puro

- Um único arquivo estático (fácil de baixar, cachear, versionar).
- Suporta datasets grandes sem travar o navegador (tiles carregados sob
  demanda, mesmo estando 100% local/offline).
- Não depende de servidor de tiles rodando — o arquivo é "burro" e
  autocontido, o que combina com o requisito de funcionar sem rede.

## O que NÃO é este sistema (ser honesto sobre os limites)

- Não é DRM: uma vez baixado, o arquivo existe no dispositivo do usuário.
- Não impede captura de tela ou extração manual do IndexedDB por alguém com
  conhecimento técnico avançado.
- O ganho é de **controle de acesso e auditoria na borda** (login, permissão
  por grupo, log de quem baixou o quê e quando, revogação de novos acessos),
  não de proteção criptográfica do conteúdo já entregue.
