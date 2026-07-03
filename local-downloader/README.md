# Downloader local

Script que roda no seu computador (sempre ligado) pra resolver os casos em
que a plataforma (Kick, etc.) bloqueia o download automático do servidor
por proteção anti-bot. Ele usa os cookies do navegador em que **você já
está logado** nessa plataforma, baixa o vídeo, e devolve o arquivo pronto
pro app continuar (transcrição, cortes) — o mesmo caminho de um upload
manual do PC, só que automático.

Não tenta contornar nenhuma proteção anti-bot — usa seu login de verdade.

## Requisitos

1. **Node.js 20 ou mais novo** instalado neste computador.
2. **yt-dlp** instalado (baixe o `.exe` em https://github.com/yt-dlp/yt-dlp/releases
   e coloque numa pasta do PATH, ou anote o caminho completo pra colocar no `config.json`).
3. Estar **logado no navegador** (Chrome, Edge ou Firefox) na plataforma de
   onde você quer importar (ex.: Kick) — o script lê os cookies desse
   navegador, não precisa digitar usuário/senha em lugar nenhum.

## Configuração

1. Copie `config.example.json` para `config.json` nesta mesma pasta.
2. Preencha:
   - `serverUrl`: a URL do seu app no Railway (ex. `https://viralcortes-ai-production.up.railway.app`)
   - `token`: o mesmo valor que está em `LOCAL_DOWNLOADER_TOKEN` nas Variables do Railway
   - `browser`: `chrome`, `edge` ou `firefox` — qual navegador você usa pra ficar logado
   - `ytDlpPath`: deixe `yt-dlp` se instalou no PATH, ou o caminho completo do `.exe`

## Rodar

Abra um terminal nesta pasta (`local-downloader`) e rode:

```
node download-worker.js
```

Deixe essa janela aberta — ela fica checando o servidor a cada 15 segundos.
Quando alguém tentar importar um link do Kick (ou de outra plataforma
bloqueada) no app, aparece aqui automaticamente, baixa, e envia de volta.

Pra deixar rodando sempre sem precisar abrir manualmente: crie uma tarefa
no **Agendador de Tarefas do Windows** que rode `node download-worker.js`
nessa pasta ao iniciar o Windows.

## Se der erro de sessão expirada

Se o Kick (ou outra plataforma) passar a bloquear de novo mesmo com esse
script rodando, geralmente é porque a sessão do navegador expirou — só
fazer login de novo nesse navegador resolve, sem precisar mexer em nada
aqui.
