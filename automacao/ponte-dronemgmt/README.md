# Ponte do DroneManagement (servidor geo)

Desde 07/10/2026 o DroneManagement não responde mais pela internet pública,
então o backend no Render não consegue mais chegar até ele. Ele só funciona
de dentro da rede da empresa. Este programa roda no servidor geo, que fica
dentro da rede. Ele busca no GeoMap os pedidos pendentes, como pendências de
voo, apontamentos e vínculo de piloto, executa cada um no DroneManagement e
devolve a resposta. A arquitetura completa está em
[docs/PONTE_DRONEMGMT.md](../../docs/PONTE_DRONEMGMT.md).

Enquanto a ponte estiver desligada, ninguém vê pendências novas nem consegue
apontar voo. O app mostra uma mensagem clara e a Visão geral do admin mostra
um alerta. Os apontamentos feitos sem conexão continuam na fila do aparelho.

## Configuração (uma vez só, no servidor geo)

A máquina e a pasta são as mesmas da automação diária
(`vigiar-talhoes-limites`), que já tem Node, git e o certificado do
FortiGate (`fortinet-ca.pem`).

1. **Gere um token** (texto longo e aleatório que o Render e a ponte
   compartilham). No PowerShell:

   ```powershell
   [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
   ```

   Guarde o resultado. Ele vai em dois lugares: no Render e no `.env` abaixo.

2. **No Render** (serviço `geomap-docker` → Environment), adicione:
   - `PONTE_DM_TOKEN` = o token gerado;
   - `DM_VIA_PONTE` = `1`.

   Salve. O Render faz um novo deploy sozinho.

3. **No servidor geo**, na pasta do repositório:

   ```powershell
   git pull
   cd backend
   npm ci --omit=dev
   npx playwright install chromium
   cd ..\automacao\ponte-dronemgmt
   copy .env.example .env
   notepad .env
   ```

   Preencha o `.env` com o token e os mesmos valores de `DRONEMGMT_*` que
   estão no Render. O `.env` nunca vai para o git.

4. **Teste na mão** rodando `iniciar.cmd`. A janela deve mostrar
   `conectado ao GeoMap — aguardando pedidos`. Na Visão geral do admin deve aparecer "Ponte do
   DroneManagement (servidor geo) conectada". Feche a janela depois do teste.

5. **Deixe a ponte iniciando sozinha** sempre que o usuário entrar no
   Windows. Feche antes a janela de teste (Ctrl+C e `S`), pra não ficarem
   duas pontes rodando. Comando usado no servidor geo:

   ```powershell
   schtasks /create /sc onlogon /tn "GeoMap - Ponte DroneManagement" /tr "C:\Users\geotecnologia\Documents\geomap\automacao\ponte-dronemgmt\iniciar.cmd"
   schtasks /run /tn "GeoMap - Ponte DroneManagement"
   ```

   Em outra máquina, troque o caminho pelo caminho real do repositório. Se
   o caminho tiver espaços, rode o comando no **Prompt de Comando** (cmd), e
   não no PowerShell, com o caminho entre `\"...\"`. O PowerShell 5.1 estraga
   as aspas internas e o `schtasks` recusa o argumento.

   O `iniciar.cmd` repete sem parar: se o programa cair, ele volta sozinho
   em 10 segundos.

## Quando der problema

- **Alerta "ponte desligada" no admin.** Confira se a janela
  "GeoMap - Ponte DroneManagement" está aberta no servidor geo e se o portal
  da rede (FortiGate) não expirou. Esse portal é o mesmo da automação
  diária.
- **"resposta não é do GeoMap (o portal de autenticação da rede
  expirou?)" no `log.txt`.** O portal da rede expirou. No servidor geo,
  abra **no navegador**, e não no PowerShell, o endereço
  `https://www.uspedra.com.br/suporte/module/commons/fechanet.jsp?fgNovaGuia=S`
  e entre com o usuário e a senha da rede (os mesmos do DroneManagement).
  A ponte reconecta sozinha em alguns segundos, sem reiniciar nada.
- **"o GeoMap recusou o token da ponte" (401) no `log.txt`.** O token do
  `.env` não é igual ao do Render. Confira se não há aspas no valor e se o
  deploy no Render já terminou (aba Events). Depois de mudar o `.env`,
  reinicie a ponte: ela só lê o `.env` quando começa.
- **Atualizar o programa.** Feche a janela, rode `git pull` (e
  `npm ci --omit=dev` em `backend/` se as dependências mudaram) e rode
  `schtasks /run` de novo.
- **O DroneManagement voltou a funcionar pela internet.** No Render, apague
  `DM_VIA_PONTE`. O backend volta a acessar a plataforma direto, e a ponte
  pode ser desligada.

O `log.txt` desta pasta só registra as mudanças de estado (conectou, caiu,
erro) e um resumo por hora.
