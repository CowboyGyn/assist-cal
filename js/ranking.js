// Ranking de usuários: pergunta ao Apps Script a posição de quem está logado (só a dele) e
// guarda a última resposta no aparelho, para o selo aparecer também offline.
import { LOGIN_URL } from "./config.js";
import { sessaoAtual } from "./ui/login.js";

const CHAVE = "ateg-cal:ranking";
const INTERVALO_MS = 30 * 60 * 1000; // o script recalcula o ranking a cada 30 minutos
const TEMPO_LIMITE_MS = 15000;

let buscando = false;

// Última posição conhecida deste login: entrar de novo (outro comprovante) pergunta na hora.
export function rankingGuardado() {
  const s = sessaoAtual();
  // Login de antes do comprovante (31/10/2026): o script não responde, então o selo pede para entrar de novo.
  if (s && !s.comprovante) return { semSessao: true };
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE));
    if (r && s && r.celular === s.celular && r.sessao === s.comprovante) return r;
  } catch {
    // sem armazenamento ou dado inválido
  }
  return null;
}

// aoAtualizar é chamado quando chega uma posição nova.
export async function atualizarRanking(aoAtualizar) {
  const s = sessaoAtual();
  if (!LOGIN_URL || !s || !s.comprovante || buscando || !navigator.onLine) return;
  const guardado = rankingGuardado();
  if (guardado && Date.now() - guardado.em < INTERVALO_MS) return;
  buscando = true;
  try {
    const resp = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ acao: "ranking", celular: s.celular, comprovante: s.comprovante }),
      signal: AbortSignal.timeout?.(TEMPO_LIMITE_MS),
    });
    const r = await resp.json();
    const base = { celular: s.celular, sessao: s.comprovante, em: Date.now() };
    let novo;
    if (r.ok) novo = { ...base, posicao: r.posicao, total: r.total, pontos: r.pontos, dias: r.dias };
    // Comprovante recusado (vencido ou de outra chave): o selo pede para entrar de novo.
    else if (r.erro === "Sessão inválida.") novo = { ...base, semSessao: true };
    // Script antigo ou erro passageiro: o selo só não aparece e tenta de novo depois.
    else return;
    localStorage.setItem(CHAVE, JSON.stringify(novo));
    aoAtualizar?.(novo);
  } catch {
    // sem conexão: tenta de novo na próxima abertura
  } finally {
    buscando = false;
  }
}
