// Leite necessário para a margem bruta desejada e ponto de equilíbrio. Funções puras, sem interface.
//
// Tudo é mensal. Pela metodologia, o COE é tudo o que se gasta no mês para produzir o leite
// (concentrado, mão de obra contratada, insumos, energia...) e é todo custo variável:
// acompanha os litros, com o mesmo R$ por litro.
//   Margem bruta = receita − COE
//   Sobra por litro = preço − COE por litro
//   Leite para a margem desejada (L/mês) = (margem desejada − outras receitas) ÷ sobra por litro
//   Ponto de equilíbrio = preço em que a margem bruta fica zero = COE por litro − outras receitas por litro

export const DIAS_MES = 30;

// Itens típicos do COE do leite.
export const ITENS_PADRAO = [
  "Concentrado e ração",
  "Volumoso (silagem, adubo, sementes)",
  "Sal mineral",
  "Medicamentos e vacinas",
  "Inseminação e reprodução",
  "Higiene de ordenha",
  "Mão de obra contratada (com encargos)",
  "Energia elétrica",
  "Combustível",
  "Manutenção de máquinas e instalações",
  "Frete e impostos sobre o leite",
  "Arrendamento",
  "Outras despesas",
].map((nome) => ({ nome }));

const positivo = (v) => Number.isFinite(v) && v > 0;
const naoNegativo = (v) => Number.isFinite(v) && v >= 0;
const vazio = (v) => v === null || v === undefined;

function coePorItens(itens) {
  const usados = itens.filter((i) => !vazio(i.valor));
  if (!usados.length) throw new Error("Informe o valor de ao menos um custo do mês.");
  const lista = usados.map((i) => {
    const nome = String(i.nome || "").trim() || "Item sem nome";
    if (!naoNegativo(i.valor)) throw new Error(`Informe o valor de "${nome}" com zero ou mais.`);
    return { nome, valor: i.valor };
  });
  return { coe: lista.reduce((s, i) => s + i.valor, 0), itens: lista };
}

export function calcularEquilibrio({
  litrosDia = null,
  precoLitro = null,
  outrasReceitas = null,
  vacas = null,
  modoCustos = "total",
  coeTotal = null,
  itens = [],
  margemDesejada = null,
}) {
  if (!positivo(litrosDia)) throw new Error("Informe a produção atual de leite (litros por dia).");
  if (!positivo(precoLitro)) throw new Error("Informe o preço do leite (R$ por litro).");
  const outras = outrasReceitas ?? 0;
  if (!naoNegativo(outras)) throw new Error("Informe as outras receitas com valor zero ou maior.");
  if (!vazio(vacas) && !positivo(vacas)) throw new Error("Informe as vacas em lactação com número maior que zero.");

  let custos;
  if (modoCustos === "total") {
    if (!naoNegativo(coeTotal)) throw new Error("Informe o COE do mês (R$).");
    custos = { coe: coeTotal, itens: [] };
  } else if (modoCustos === "itens") {
    custos = coePorItens(itens);
  } else {
    throw new Error("Escolha como informar o COE.");
  }

  if (vazio(margemDesejada)) {
    throw new Error("Informe a margem bruta desejada (R$ por mês): o cálculo mostra quanto leite produzir para chegar a ela.");
  }
  if (!naoNegativo(margemDesejada)) throw new Error("Informe a margem bruta desejada com zero ou mais.");

  const litrosMes = litrosDia * DIAS_MES;
  const coe = custos.coe;
  const coeLitro = coe / litrosMes;
  const sobraLitro = precoLitro - coeLitro;
  const receitaLeite = precoLitro * litrosMes;
  const margemBruta = receitaLeite + outras - coe;

  const resultado = {
    litrosDia,
    precoLitro,
    outrasReceitas: outras,
    vacas: vacas ?? null,
    modoCustos,
    itens: custos.itens,
    margemDesejada,
    litrosMes,
    receitaLeite,
    coe,
    coeLitro,
    sobraLitro,
    margemBruta,
    litrosVaca: vacas ? litrosDia / vacas : null,
    // Ponto de equilíbrio: preço do leite em que a margem bruta fica zero.
    precoEquilibrio: Math.max(0, coeLitro - outras / litrosMes),
    // Mesmo leite de hoje: preço que daria a margem desejada.
    precoNecessario: coeLitro + (margemDesejada - outras) / litrosMes,
    atingida: margemBruta >= margemDesejada,
    // Sem sobra por litro, nenhum volume chega à margem: produzir mais aumenta o prejuízo.
    semSobra: sobraLitro <= 0,
    meta: null,
  };
  if (resultado.semSobra) return resultado;

  const l = Math.max(0, (margemDesejada - outras) / sobraLitro);
  const ld = l / DIAS_MES;
  resultado.meta = {
    litrosMes: l,
    litrosDia: ld,
    diferencaDia: ld - litrosDia,
    diferencaPct: (ld / litrosDia - 1) * 100,
    vacas: resultado.litrosVaca ? ld / resultado.litrosVaca : null,
  };
  return resultado;
}
