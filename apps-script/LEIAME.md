# Login do ATeG Cal com a planilha do Google

O app não lê a planilha diretamente. Um pequeno script (Apps Script) roda na sua conta
Google, confere celular e senha e responde só "ok + nome" ou "erro". Assim as senhas
nunca chegam ao celular de ninguém.

## 1. Planilha

Linha 1 com os cabeçalhos (qualquer ordem):

| Nome | Celular | Senha | Ativo (opcional) |
|------|---------|-------|------------------|
| Fulano de Tal | (62) 9 9999-0000 | 1234 | sim |

- O celular pode estar escrito de qualquer jeito: `(62) 9 9999-0000`, `62999990000` e `5562999990000` funcionam.
- Formate a coluna **Senha como texto simples** (Formatar → Número → Texto simples), senão uma senha como `0123` vira `123`.
- Na coluna **Ativo**, escreva `não` para bloquear alguém sem apagar a linha.
- **Importante:** deixe o compartilhamento da planilha como **Restrito** (só você). O script acessa com a sua conta; ninguém mais precisa do link.

## 2. Criar o script

1. Abra a planilha → **Extensões → Apps Script**.
2. Apague o conteúdo e cole todo o arquivo `Codigo.gs` desta pasta. Salve.
3. No topo, escolha a função `testarLeitura` e clique em **Executar**. Autorize o acesso (a tela "app não verificado" é normal: clique em *Avançado → Acessar*).

## 3. Publicar

1. **Implantar → Nova implantação** → tipo **App da Web**.
2. *Executar como:* **Eu**. *Quem pode acessar:* **Qualquer pessoa**.
3. Clique em **Implantar** e copie o endereço que termina em `/exec`.
4. No app, abra `js/config.js` e cole o endereço em `LOGIN_URL`.
5. Em `sw.js`, aumente a versão (`ateg-cal-vN`) para os celulares receberem a mudança.

Se alterar o `Codigo.gs` depois: aumente `VERSAO` no topo do arquivo, anote a mudança no
histórico e publique em **Implantar → Gerenciar implantações → editar → Nova versão**
(o endereço continua o mesmo).

Para conferir qual versão está no ar, abra o endereço `/exec` no navegador: aparece
`{"ok":true,"servico":"ATeG Cal login","versao":"1.0.0"}`.

## Primeiro acesso (cadastro pelo app) — versão 1.1.0

- Quem toca em "Primeiro acesso? Cadastre-se" informa nome, celular, e-mail, município/UF,
  função e senha. O script grava uma linha nova com Ativo = `sim` (liberado na hora).
- As colunas que faltarem (Ativo, Município, UF, E-mail, Função, Cadastro em) são criadas
  sozinhas no fim da linha 1 no primeiro cadastro.
- Celular já cadastrado é recusado ("use Entrar ou Esqueci a senha").
- A cada cadastro você recebe um e-mail. Para isso, depois de colar a versão nova, rode
  `testarLeitura` uma vez no editor e autorize o **envio de e-mail**.
- Para bloquear alguém: troque a coluna Ativo dessa pessoa para `não`.

## Como funciona

- O login vale por 30 dias no aparelho (`DIAS_SESSAO` em `js/config.js`), inclusive offline.
- Após 5 senhas erradas, aquele celular fica bloqueado por 15 minutos.
- As senhas ficam protegidas na coluna Senha (começam com `h1$`) e ninguém consegue lê-las.
  Depois de implantar a 1.12.0, rode `protegerSenhas` uma vez para proteger as antigas.
- "Esqueci a senha" envia um código de 6 dígitos ao e-mail do cadastro. Vale por 15 minutos.
- Quem não tem o e-mail fala pelo WhatsApp de suporte. Para ajudar: escreva uma senha
  provisória por cima, na coluna Senha dessa pessoa, e envie a ela. No login, o app pede uma senha nova.
- O login devolve um comprovante de sessão, assinado com a chave. O aceite e a contagem de
  uso só são gravados com ele. Sessões antigas têm a contagem aceita até 05/12/2026.
- A chave `CHAVE_SENHAS` fica em Configurações do projeto → Propriedades do script. Não a
  apague nem a altere: sem ela, todos precisariam recuperar a senha.
- Quem for desativado ou trocar de senha continua com acesso até a sessão de 30 dias vencer.
