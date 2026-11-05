// Ranking de usuários: pergunta ao Apps Script a posição de quem está logado (só a dele) e
// guarda a última resposta no aparelho, para o selo aparecer também offline.
import { LOGIN_URL } from "./config.js";
import { sessaoAtual } from "./ui/login.js";

const CHAVE = "ateg-cal:ranking";
const INTERVALO_MS = 30 * 60 * 1000; // o script recalcula o ranking a cada 30 minutos
const TEMPO_LIMITE_MS = 15000;

let buscando = false;

// Última posição conhecida deste celular (outro login no aparelho não herda a posição).
export function rankingGuardado() {
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE));
    const s = sessaoAtual();
    if (r && s && r.celular === s.celular) return r;
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
    // Script antigo ("Ação desconhecida") ou sessão recusada: o selo só não aparece.
    if (!r.ok) return;
    const novo = { celular: s.celular, posicao: r.posicao, total: r.total, pontos: r.pontos, dias: r.dias, em: Date.now() };
    localStorage.setItem(CHAVE, JSON.stringify(novo));
    aoAtualizar?.(novo);
  } catch {
    // sem conexão: tenta de novo na próxima abertura
  } finally {
    buscando = false;
  }
}
