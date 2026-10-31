// Contagem de uso dos módulos: guarda os eventos no aparelho (funciona offline) e
// envia em lote para o Apps Script, que grava na aba "Uso" da planilha.
import { LOGIN_URL } from "./config.js";
import { sessaoAtual } from "./ui/login.js";

const CHAVE_FILA = "ateg-cal:uso";
const MAX_FILA = 300; // offline por muito tempo: guarda só os eventos mais recentes
const LOTE = 100;
const ESPERA_ENVIO_MS = 5000;

let espera = null;
let enviando = false;

function lerFila() {
  try {
    const fila = JSON.parse(localStorage.getItem(CHAVE_FILA));
    return Array.isArray(fila) ? fila : [];
  } catch {
    return [];
  }
}

function gravarFila(fila) {
  try {
    localStorage.setItem(CHAVE_FILA, JSON.stringify(fila.slice(-MAX_FILA)));
  } catch {
    // Sem armazenamento: o uso deste aparelho não é contado.
  }
}

export function registrarUso(modulo, acao) {
  if (!LOGIN_URL) return;
  gravarFila([...lerFila(), { quando: new Date().toISOString(), modulo, acao }]);
  // Junta os eventos de alguns segundos num envio só.
  clearTimeout(espera);
  espera = setTimeout(enviarUso, ESPERA_ENVIO_MS);
}

// A versão em uso é o nome do cache do service worker (ex.: "ateg-cal-v15").
export async function versaoApp() {
  try {
    return (await caches.keys()).find((k) => k.startsWith("ateg-cal-")) ?? "";
  } catch {
    return "";
  }
}

export async function enviarUso() {
  const sessao = sessaoAtual();
  if (enviando || !sessao || !navigator.onLine || !lerFila().length) return;
  enviando = true;
  try {
    for (;;) {
      const lote = lerFila().slice(0, LOTE);
      if (!lote.length) break;
      const resp = await fetch(LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          acao: "uso",
          celular: sessao.celular,
          comprovante: sessao.comprovante,
          versaoApp: await versaoApp(),
          eventos: lote,
        }),
      });
      const r = await resp.json();
      // Script antigo ou recusa: mantém a fila para tentar depois.
      if (!r.ok) break;
      gravarFila(lerFila().slice(lote.length));
    }
  } catch {
    // Sem conexão com o script: tenta de novo na próxima oportunidade.
  } finally {
    enviando = false;
  }
}
