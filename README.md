# ECHO lite DEMO

Demo isolada para apresentar um modelo local do LM Studio. A pasta nao depende do frontend original e nao inclui loja, pagamentos ou informacoes internas do ECHO.

## Como usar localmente

1. Abra o LM Studio, carregue o modelo e inicie o servidor OpenAI-compatible na porta `1234`.
2. Execute `start-demo.bat`.
3. Abra `http://127.0.0.1:8787`.

O servidor da demo encaminha `/api/chat` e `/api/models` para o LM Studio local. Assim, quem acessar pelo tunnel nao tenta conectar no `localhost` do proprio computador.

## Imagens

O botao de imagem aceita PNG, JPG, WEBP e GIF. A imagem e reduzida no navegador e enviada no formato multimodal para o modelo. O modelo carregado precisa ter suporte a visao para responder sobre imagens.

## Contexto das conversas

Cada conversa tem um `chatId` e um `contextId` proprio. O navegador envia somente as mensagens da conversa ativa, enquanto o proxy mantem a separacao por sessao e conversa. O historico enviado e limitado a aproximadamente 24k tokens, deixando espaco para a resposta dentro de modelos com janela de 32k.

## Cloudflare Tunnel

Com a demo local aberta, execute `cloudflare-tunnel.bat`. Ele cria um tunnel temporario e mostra o endereco publico no terminal.

Para um dominio fixo, use `cloudflared-config.yml.example` como base para o `config.yml` do tunnel nomeado e aponte o hostname para `http://127.0.0.1:8787`.

## Configuracao opcional

```bat
set PORT=8787
set LM_STUDIO_URL=http://127.0.0.1:1234
node server.js
```

Antes de abrir ao publico, lembre que qualquer pessoa com o endereco do tunnel podera consumir o modelo e os recursos do seu PC. Para uso mais longo, coloque Cloudflare Access ou outra autenticacao na frente da demo.
