# Assist Cal

Calculadora zootécnica para a Assistência Técnica e Gerencial: estrutura ideal do
rebanho leiteiro e previsão de vacas em lactação e de produção de leite para 12 meses.

App web instalável (PWA) que funciona offline, sem dependências externas.

## Estrutura

- `index.html`, `css/`, `icons/`, `manifest.webmanifest`, `sw.js` — o app.
- `js/calc/` — cálculos (funções puras, testadas em `tests/`).
- `js/ui/` — telas de cada módulo; `js/config.js` — configuração (login).
- `apps-script/` — script do Google para o login pela planilha (veja `apps-script/LEIAME.md`).

## Rodar localmente

```sh
python -m http.server 8765
```

Abra http://localhost:8765/.

## Testes

```sh
node --test tests/*.test.mjs
```

## Publicar uma atualização

1. Aumente `NUMERO` em `sw.js`, senão os celulares continuam com a versão antiga.
2. Faça commit e publique nos dois endereços: `git push novo main` (https://cowboygyn.github.io/assist-cal/)
   e `git push origin main` (https://cowboygyn.github.io/ateg-cal/). O GitHub Pages publica em cerca de 1 minuto.

## Dois endereços

O app mudou de `/ateg-cal/` para `/assist-cal/`. O mesmo código vai para os dois repositórios
(`CowboyGyn/ateg-cal` e `CowboyGyn/assist-cal`); no endereço antigo ele mostra o aviso de mudança
(`ENDERECO_ANTIGO` em `js/config.js`). O endereço antigo nunca deve ser apagado: o link circula
em mensagens antigas. A aba "Resumo de uso" da planilha mostra quantos usuários já migraram.
