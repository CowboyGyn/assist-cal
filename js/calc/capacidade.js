// Capacidade de suporte e dias de ocupação a partir da forragem colhida em quadrados de 1 m².
// Funções puras, sem interface.

export const KG_UA = 450;
export const CONSUMO_UA_PCT = 2.5;
export const MS_PADRAO = 22;
export const DESCANSO_PADRAO = 30;
export const OCUPACAO_PADRAO = 3;
export const PONTOS_RECOMENDADOS = 8; // Embrapa: de 8 a 10 pontos por piquete
export const OCUPACAO_CUIDADO = 7; // acima disso, o gado pode voltar a comer a rebrota

export const CORTES = {
  solo: { nome: "Rente ao solo", aproveitamentoPct: 50 },
  saida: { nome: "Na altura de saída", aproveitamentoPct: 70 },
};

// Consumo em % do peso vivo. SBW = peso vivo × 0,96, como na NASEM (2016).
// Matrizes: pasto de TDN moderado (52-59%), 2,2% e 2,5% do SBW; recria: NEma de 1,1 Mcal/kg,
// 2,48% do SBW. Vacas secas: NASEM (2021) a mais de 3 semanas do parto, com 65% de FDN.
// Vaca em lactação sai da equação, pela produção. Touros, novilhas, bezerros ao pé e
// equinos não têm valor confirmado na NASEM: ficam como referência de campo.
export const CATEGORIAS = {
  "vacas-lactacao": { nome: "Vacas em lactação", grupo: "Leite", pesoKg: 500, pastoPct: 60 },
  "vacas-secas": { nome: "Vacas secas", grupo: "Leite", pesoKg: 500, consumoPct: 1.7, pastoPct: 85 },
  "novilhas-leite": { nome: "Novilhas (leite)", grupo: "Leite", pesoKg: 330, consumoPct: 2.4, pastoPct: 85 },
  bezerras: { nome: "Bezerras desaleitadas", grupo: "Leite", pesoKg: 120, consumoPct: 3.1, pastoPct: 50 },
  "matrizes-secas": { nome: "Matrizes solteiras ou gestantes", grupo: "Corte", pesoKg: 450, consumoPct: 2.1, pastoPct: 95 },
  "matrizes-paridas": { nome: "Matrizes paridas", grupo: "Corte", pesoKg: 450, consumoPct: 2.4, pastoPct: 95 },
  touros: { nome: "Touros", grupo: "Corte", pesoKg: 700, consumoPct: 2.1, pastoPct: 95 },
  recria: { nome: "Recria (corte)", grupo: "Corte", pesoKg: 250, consumoPct: 2.4, pastoPct: 85 },
  engorda: { nome: "Engorda / terminação", grupo: "Corte", pesoKg: 420, consumoPct: 2.4, pastoPct: 60 },
  "bezerros-pe": { nome: "Bezerros ao pé", grupo: "Corte", pesoKg: 120, consumoPct: 1.0, pastoPct: 100 },
  equinos: { nome: "Equinos", grupo: "Outros", pesoKg: 400, consumoPct: 2.0, pastoPct: 100 },
  outra: { nome: "Outra categoria", grupo: "Outros", pesoKg: 300, consumoPct: 2.2, pastoPct: 80 },
};

export const LEITE_PADRAO_KG = 15;
const ENERGIA_LEITE = 0.74; // Mcal/kg, leite com cerca de 4% de gordura
const ECC_VACA = 3;
const DEL_VACA = 150;

// NASEM (2021), equação só com dados do animal, para vaca multípara.
export function consumoLactacaoKg(pesoKg, leiteKg) {
  const leiteEnergia = leiteKg * ENERGIA_LEITE;
  return (9.4 + 0.305 * leiteEnergia + 0.022 * pesoKg - 2.559 * ECC_VACA) * (1 - 0.348 * Math.exp(-0.053 * DEL_VACA));
}

// Percentual sugerido para a categoria, com o peso e o leite informados.
export function consumoReferenciaPct(tipo, pesoKg, leiteKg) {
  const categoria = CATEGORIAS[tipo];
  const peso = pesoKg ?? categoria.pesoKg;
  if (tipo !== "vacas-lactacao") return categoria.consumoPct;
  return (consumoLactacaoKg(peso, leiteKg ?? LEITE_PADRAO_KG) / peso) * 100;
}

const M2_POR_HA = 10000;
const CENARIOS_DIAS = [1, 3, 5, 7];
const CONSUMO_UA_KG = KG_UA * (CONSUMO_UA_PCT / 100);

const positivo = (v) => Number.isFinite(v) && v > 0;
const percentual = (v) => Number.isFinite(v) && v > 0 && v <= 100;

function resumirAmostras(amostrasKg) {
  if (!amostrasKg?.length) throw new Error("Informe o peso de ao menos um ponto de coleta.");
  if (!amostrasKg.every(positivo)) throw new Error("Os pesos dos pontos de coleta devem ser maiores que zero.");
  const media = amostrasKg.reduce((s, v) => s + v, 0) / amostrasKg.length;
  if (amostrasKg.length < 2) return { pontos: 1, media, cvPct: 0 };
  const variancia = amostrasKg.reduce((s, v) => s + (v - media) ** 2, 0) / (amostrasKg.length - 1);
  return { pontos: amostrasKg.length, media, cvPct: (Math.sqrt(variancia) / media) * 100 };
}

// Micro-ondas tem prioridade: é a medida feita na hora. Sem medida, usa a referência.
function definirMs({ msPct, pesoUmidoG, pesoSecoG }) {
  if (pesoUmidoG !== null && pesoUmidoG !== undefined && pesoSecoG !== null && pesoSecoG !== undefined) {
    if (!positivo(pesoUmidoG) || !positivo(pesoSecoG) || pesoSecoG > pesoUmidoG) {
      throw new Error("No micro-ondas, o peso seco deve ser menor que o peso úmido.");
    }
    return { msPct: (pesoSecoG / pesoUmidoG) * 100, origem: "micro-ondas" };
  }
  if (msPct === null || msPct === undefined) return { msPct: MS_PADRAO, origem: "referencia" };
  if (!percentual(msPct)) throw new Error("Informe a matéria seca de 1 a 100%.");
  return { msPct, origem: "informada" };
}

function calcularLote(l) {
  const categoria = CATEGORIAS[l.tipo];
  if (!categoria) throw new Error("Escolha a categoria dos animais.");
  const pesoKg = l.pesoKg ?? categoria.pesoKg;
  const pastoPct = l.pastoPct ?? categoria.pastoPct;
  const nome = categoria.nome.toLowerCase();
  if (!positivo(l.animais)) throw new Error(`Informe o número de animais de ${nome}.`);
  if (!positivo(pesoKg)) throw new Error(`Informe o peso de ${nome}.`);
  const leiteKg = l.tipo === "vacas-lactacao" ? l.leiteKg ?? LEITE_PADRAO_KG : null;
  if (leiteKg !== null && !(Number.isFinite(leiteKg) && leiteKg >= 0)) throw new Error("Informe o leite por vaca.");
  const consumoPct = l.consumoPct ?? consumoReferenciaPct(l.tipo, pesoKg, leiteKg);
  if (!positivo(consumoPct)) throw new Error(`Informe o consumo de ${nome}.`);
  if (!percentual(pastoPct)) throw new Error(`Informe de 1 a 100% da dieta vinda do pasto em ${nome}.`);
  const consumoAnimalKg = pesoKg * (consumoPct / 100) * (pastoPct / 100);
  return {
    tipo: l.tipo,
    nome: categoria.nome,
    animais: l.animais,
    pesoKg,
    leiteKg,
    consumoPct,
    pastoPct,
    consumoAnimalKg,
    consumoDiaKg: consumoAnimalKg * l.animais,
    ua: (l.animais * pesoKg) / KG_UA,
  };
}

// amostrasKg: peso verde de cada quadrado de 1 m². lotes: [{ tipo, animais, pesoKg, leiteKg, consumoPct, pastoPct }].
export function calcularCapacidade({
  areaHa,
  amostrasKg,
  msPct = null,
  pesoUmidoG = null,
  pesoSecoG = null,
  corte = "solo",
  aproveitamentoPct = null,
  descansoDias = null,
  ocupacaoDias = null,
  lotes = [],
}) {
  if (!positivo(areaHa)) throw new Error("Informe a área do piquete.");
  if (!CORTES[corte]) throw new Error("Escolha como a forragem foi cortada.");
  const amostras = resumirAmostras(amostrasKg);
  const ms = definirMs({ msPct, pesoUmidoG, pesoSecoG });
  const aproveitamento = aproveitamentoPct ?? CORTES[corte].aproveitamentoPct;
  const descanso = descansoDias ?? DESCANSO_PADRAO;
  const ocupacaoPlanejada = ocupacaoDias ?? OCUPACAO_PADRAO;
  if (!percentual(aproveitamento)) throw new Error("Informe o aproveitamento de 1 a 100%.");
  if (!Number.isFinite(descanso) || descanso < 0) throw new Error("Informe os dias de descanso.");
  if (!positivo(ocupacaoPlanejada)) throw new Error("Informe os dias de ocupação planejados.");

  const verdeKgHa = amostras.media * M2_POR_HA;
  const msKgHa = verdeKgHa * (ms.msPct / 100);
  const utilKgHa = msKgHa * (aproveitamento / 100);
  const utilPiqueteKg = utilKgHa * areaHa;

  const calculados = lotes.map(calcularLote);
  const consumoDiaKg = calculados.reduce((s, l) => s + l.consumoDiaKg, 0);
  const diasOcupacao = calculados.length ? utilPiqueteKg / consumoDiaKg : null;
  const ocupacaoBase = diasOcupacao ?? ocupacaoPlanejada;
  const cicloDias = descanso + ocupacaoBase;
  const piquetes = Math.ceil(descanso / ocupacaoBase) + 1;

  return {
    areaHa,
    amostras,
    msPct: ms.msPct,
    msOrigem: ms.origem,
    corte,
    aproveitamentoPct: aproveitamento,
    descansoDias: descanso,
    ocupacaoPlanejada,
    verdeKgHa,
    msKgHa,
    utilKgHa,
    msPiqueteKg: msKgHa * areaHa,
    utilPiqueteKg,
    lotes: calculados,
    uaLote: calculados.reduce((s, l) => s + l.ua, 0),
    consumoDiaKg,
    diasOcupacao,
    ocupacaoBase,
    cicloDias,
    capacidadeUaHa: utilKgHa / (CONSUMO_UA_KG * cicloDias),
    piquetes,
    areaModuloHa: piquetes * areaHa,
    cenarios: CENARIOS_DIAS.map((dias) => {
      const ua = utilPiqueteKg / (CONSUMO_UA_KG * dias);
      return { dias, ua, uaHa: ua / areaHa };
    }),
  };
}
