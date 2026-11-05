// Configuração do app.

// Endereço do Apps Script de login (termina em /exec). Veja apps-script/LEIAME.md.
// Vazio = login desligado: o app abre direto, sem pedir celular e senha.
export const LOGIN_URL = "https://script.google.com/macros/s/AKfycbxlU0zdfpjTHpkIFxbK0FcIv58nPRKNrI6tUYRr70qT7UsBN146OytiR4WjdzKkM-ru/exec";

// Por quantos dias o login vale no aparelho (funciona offline nesse período).
// Ao mudar o texto dos Termos de uso, aumente a versão: o app pede um novo aceite a todos.
export const TERMOS_VERSAO = "1.1";

export const DIAS_SESSAO = 30;

// Endereço público do app, usado no convite pelo WhatsApp e no aviso de mudança de endereço.
export const APP_URL = "https://cowboygyn.github.io/assist-cal/";

// O mesmo código é publicado nos dois endereços. No antigo (/ateg-cal/) o app funciona igual, mas
// mostra o aviso de mudança. Login e cálculos guardados são do domínio e valem nos dois (no Android).
export const ENDERECO_ANTIGO = (globalThis.location?.pathname ?? "").startsWith("/ateg-cal/");

// Prefixo do cache do service worker e da versão enviada à aba Uso: separa os dois endereços.
export const PREFIXO_VERSAO = ENDERECO_ANTIGO ? "ateg-cal" : "assist-cal";

// WhatsApp que recebe os pedidos de "Esqueci a senha".
export const WHATSAPP_SUPORTE = "5562991176151";
