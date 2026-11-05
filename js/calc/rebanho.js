// Estrutura ideal do rebanho leiteiro a partir do número de vacas em lactação.
// Funções puras, sem dependência de interface, para poderem ser testadas e reutilizadas.

export const KG_POR_UA = 450;
const DIAS_ANO = 365;
const DIAS_MES = DIAS_ANO / 12;

// Proporções do rebanho total usadas no app ATeG original.
export const PADRAO_ATEG = {
  lactacao: 0.55,
  secas: 0.09,
  novilhas: 0.16,
  bezerras: 0.2,
};

export const INDICES_PADRAO = {
  iepMeses: 13,
  periodoSecoDias: 60,
  idadePrimeiroPartoMeses: 30,
  descarteAnualPct: 20,
  mortBezerrasPct: 5,
  mortNovilhasPct: 2,
  femeasNascimentosPct: 50,
  recria: "reposicao", // "reposicao": recria só as fêmeas necessárias; "todas": recria todas
};

// Pesos vivos médios de cada categoria (kg), usados apenas para converter em UA.
export const PESOS_PADRAO = {
  vaca: 500,
  bezerra: 120,
  novilhaAte24: 300,
  novilhaAcima24: 420,
};

function exigirNumero(valor, nome, min, max) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new Error(`${nome}: informe um número válido.`);
  }
  if (valor < min || valor > max) {
    throw new Error(`${nome}: o valor deve estar entre ${min} e ${max}.`);
  }
}

function validarVacas(vacasLactacao) {
  exigirNumero(vacasLactacao, "Vacas em lactação", 1, 100000);
  if (!Number.isInteger(vacasLactacao)) {
    throw new Error("Vacas em lactação: informe um número inteiro.");
  }
}

function validarPesos(pesos) {
  exigirNumero(pesos.vaca, "Peso da vaca", 150, 1000);
  exigirNumero(pesos.bezerra, "Peso médio da bezerra", 30, 400);
  exigirNumero(pesos.novilhaAte24, "Peso médio da novilha até 24 meses", 80, 700);
  exigirNumero(pesos.novilhaAcima24, "Peso médio da novilha acima de 24 meses", 150, 800);
}

// Arredonda as quantidades para inteiros mantendo a soma igual ao total arredondado
// (método dos maiores restos). Evita o rebanho "perder" animais no arredondamento.
export function arredondarMantendoTotal(valores) {
  const alvo = Math.round(valores.reduce((s, v) => s + v, 0));
  const pisos = valores.map(Math.floor);
  let faltam = alvo - pisos.reduce((s, v) => s + v, 0);
  const ordem = valores
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto);
  for (const { i } of ordem) {
    if (faltam <= 0) break;
    pisos[i] += 1;
    faltam -= 1;
  }
  return pisos;
}

function montarResultado(modo, categorias, extras) {
  const inteiros = arredondarMantendoTotal(categorias.map((c) => c.quantidade));
  const itens = categorias.map((c, i) => ({
    ...c,
    inteiro: inteiros[i],
    ua: (c.quantidade * c.pesoKg) / KG_POR_UA,
  }));
  const total = itens.reduce((s, c) => s + c.quantidade, 0);
  const lactacao = itens.find((c) => c.id === "lactacao").quantidade;
  const secas = itens.find((c) => c.id === "secas").quantidade;
  return {
    modo,
    categorias: itens,
    total,
    totalInteiro: inteiros.reduce((s, v) => s + v, 0),
    uaTotal: itens.reduce((s, c) => s + c.ua, 0),
    pctLactacaoVacas: (lactacao / (lactacao + secas)) * 100,
    pctLactacaoRebanho: (lactacao / total) * 100,
    ...extras,
  };
}

// Modo padrão Assist: proporções fixas do rebanho total (55/9/16/20).
export function calcularPadraoAteg(vacasLactacao, pesos = PESOS_PADRAO) {
  validarVacas(vacasLactacao);
  validarPesos(pesos);
  const total = vacasLactacao / PADRAO_ATEG.lactacao;
  return montarResultado("padrao", [
    { id: "lactacao", nome: "Vacas em lactação", quantidade: vacasLactacao, pesoKg: pesos.vaca },
    { id: "secas", nome: "Vacas secas", quantidade: total * PADRAO_ATEG.secas, pesoKg: pesos.vaca },
    { id: "novilhas", nome: "Novilhas 12–24 meses", quantidade: total * PADRAO_ATEG.novilhas, pesoKg: pesos.novilhaAte24 },
    { id: "bezerras", nome: "Bezerras 0–12 meses", quantidade: total * PADRAO_ATEG.bezerras, pesoKg: pesos.bezerra },
  ]);
}

// Modo por índices: rebanho em equilíbrio (estado estacionário) a partir dos índices
// zootécnicos da fazenda. Mortalidades são taxas anuais distribuídas de forma linear
// ao longo de cada fase, e o estoque de cada fase é a média entre entrada e saída.
export function calcularPorIndices(vacasLactacao, indices = INDICES_PADRAO, pesos = PESOS_PADRAO) {
  validarVacas(vacasLactacao);
  validarPesos(pesos);
  const ix = { ...INDICES_PADRAO, ...indices };
  exigirNumero(ix.iepMeses, "Intervalo entre partos (meses)", 11, 30);
  exigirNumero(ix.periodoSecoDias, "Período seco (dias)", 0, 150);
  exigirNumero(ix.idadePrimeiroPartoMeses, "Idade ao primeiro parto (meses)", 18, 48);
  exigirNumero(ix.descarteAnualPct, "Taxa de descarte anual (%)", 0, 60);
  exigirNumero(ix.mortBezerrasPct, "Mortalidade de bezerras (%)", 0, 50);
  exigirNumero(ix.mortNovilhasPct, "Mortalidade de novilhas (%)", 0, 50);
  exigirNumero(ix.femeasNascimentosPct, "Fêmeas nos nascimentos (%)", 1, 100);
  if (ix.recria !== "reposicao" && ix.recria !== "todas") {
    throw new Error("Recria: opção inválida.");
  }

  const iepDias = ix.iepMeses * DIAS_MES;
  if (ix.periodoSecoDias >= iepDias) {
    throw new Error("O período seco deve ser menor que o intervalo entre partos.");
  }

  const fracLactacao = (iepDias - ix.periodoSecoDias) / iepDias;
  const vacas = vacasLactacao / fracLactacao;
  const partosAno = (vacas * DIAS_ANO) / iepDias;
  const femeasNascidasAno = partosAno * (ix.femeasNascimentosPct / 100);

  const mb = ix.mortBezerrasPct / 100;
  const mn = ix.mortNovilhasPct / 100;
  const t1 = Math.min(12, ix.idadePrimeiroPartoMeses - 12) / 12; // anos de 12 meses até 24 m (ou até o parto)
  const t2 = Math.max(0, ix.idadePrimeiroPartoMeses - 24) / 12; // anos de 24 meses até o parto

  // Por fêmea nascida: estoque médio em cada fase e sobrevivência até o primeiro parto.
  const estBezerra = 1 - mb / 2;
  const aos12 = 1 - mb;
  const estNovilha1 = aos12 * t1 * (1 - (mn * t1) / 2);
  const aoFimFase1 = aos12 * (1 - mn * t1);
  const estNovilha2 = aoFimFase1 * t2 * (1 - (mn * t2) / 2);
  const aoParto = aoFimFase1 * (1 - mn * t2);

  const reposicaoNecessariaAno = vacas * (ix.descarteAnualPct / 100);
  const novilhasPossiveisAno = femeasNascidasAno * aoParto;

  // Fêmeas que entram na recria por ano.
  const femeasRecriadasAno =
    ix.recria === "todas"
      ? femeasNascidasAno
      : Math.min(femeasNascidasAno, reposicaoNecessariaAno / aoParto);
  const novilhasProduzidasAno = femeasRecriadasAno * aoParto;

  const categorias = [
    { id: "lactacao", nome: "Vacas em lactação", quantidade: vacasLactacao, pesoKg: pesos.vaca },
    { id: "secas", nome: "Vacas secas", quantidade: vacas - vacasLactacao, pesoKg: pesos.vaca },
  ];
  if (t2 > 0) {
    categorias.push({
      id: "novilhas2",
      nome: `Novilhas 24–${ix.idadePrimeiroPartoMeses} meses`,
      quantidade: femeasRecriadasAno * estNovilha2,
      pesoKg: pesos.novilhaAcima24,
    });
  }
  categorias.push(
    {
      id: "novilhas1",
      nome: `Novilhas 12–${Math.min(24, ix.idadePrimeiroPartoMeses)} meses`,
      quantidade: femeasRecriadasAno * estNovilha1,
      pesoKg: pesos.novilhaAte24,
    },
    { id: "bezerras", nome: "Bezerras 0–12 meses", quantidade: femeasRecriadasAno * estBezerra, pesoKg: pesos.bezerra },
  );

  return montarResultado("indices", categorias, {
    premissas: ix,
    reposicao: {
      partosAno,
      femeasNascidasAno,
      necessariaAno: reposicaoNecessariaAno,
      possivelAno: novilhasPossiveisAno,
      produzidaAno: novilhasProduzidasAno,
      // Positivo: fêmeas excedentes que podem ser vendidas. Negativo: déficit de reposição.
      saldoAno: novilhasPossiveisAno - reposicaoNecessariaAno,
      femeasNaoRecriadasAno: femeasNascidasAno - femeasRecriadasAno,
    },
  });
}
