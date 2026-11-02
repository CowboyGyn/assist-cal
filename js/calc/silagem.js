// Estoque de silagem: quanto há no silo e por quantos dias dura com o consumo do rebanho.
// Funções puras, sem interface.
import { CATEGORIAS, VOLUMOSOS, kgVolumosoPadrao } from "./volumoso.js";

export { CATEGORIAS };

// MS e densidade (kg de matéria natural/m³) vêm da mesma tabela do Volumoso para a seca.
export const SILAGENS = Object.fromEntries(
  ["silagem-milho", "silagem-sorgo", "silagem-capim"].map((tipo) => [tipo, VOLUMOSOS[tipo]]),
);

export const PERDAS_PADRAO = 10; // silo já fechado: topo, laterais e retirada até o cocho
export const AVANCO_MINIMO_CM = 25; // retirada mínima do painel por dia, para não estragar

// Silagem por animal (kg de matéria natural/dia) se toda a parte volumosa da dieta for silagem.
export const kgSilagemPadrao = (tipo, pesoKg, msPct) => kgVolumosoPadrao(tipo, pesoKg) / (msPct / 100);

const positivo = (v) => Number.isFinite(v) && v > 0;

function calcularEstoque({ modoEstoque, comprimentoM, larguraTopoM, larguraBaseM, alturaM, densidade, estoqueT }) {
  if (modoEstoque === "toneladas") {
    if (!positivo(estoqueT)) throw new Error("Informe as toneladas de silagem no estoque.");
    return { estoqueT, volumeM3: null, painelM2: null };
  }
  if (modoEstoque !== "medidas") throw new Error("Escolha como informar o estoque.");
  const base = larguraBaseM ?? larguraTopoM;
  if (!positivo(comprimentoM)) throw new Error("Informe o comprimento de silo que ainda falta usar.");
  if (!positivo(larguraTopoM)) throw new Error("Informe a largura do silo no topo.");
  if (!positivo(base)) throw new Error("Informe a largura do silo na base.");
  if (!positivo(alturaM)) throw new Error("Informe a altura da silagem.");
  if (!positivo(densidade)) throw new Error("Informe a densidade da silagem.");
  // Seção de trapézio: serve para trincheira, encosta e superfície.
  const painelM2 = ((larguraTopoM + base) / 2) * alturaM;
  const volumeM3 = painelM2 * comprimentoM;
  return { estoqueT: (volumeM3 * densidade) / 1000, volumeM3, painelM2, larguraBaseM: base };
}

function calcularLote(l, msPct) {
  const categoria = CATEGORIAS[l.tipo];
  if (!categoria) throw new Error("Escolha a categoria dos animais.");
  const nome = categoria.nome.toLowerCase();
  if (!positivo(l.animais)) throw new Error(`Informe o número de animais de ${nome}.`);
  const pesoKg = l.pesoKg ?? categoria.pesoKg;
  if (!positivo(pesoKg)) throw new Error(`Informe o peso de ${nome}.`);
  const kgAnimal = l.kgAnimal ?? kgSilagemPadrao(l.tipo, pesoKg, msPct);
  if (!positivo(kgAnimal)) throw new Error(`Informe a silagem por animal de ${nome}.`);
  return {
    tipo: l.tipo,
    nome: categoria.nome,
    animais: l.animais,
    pesoKg,
    kgAnimal,
    referencia: l.kgAnimal === null || l.kgAnimal === undefined,
    kgDia: kgAnimal * l.animais,
  };
}

// lotes: [{ tipo, animais, pesoKg, kgAnimal }]. Consumo sempre em kg de matéria natural fornecida.
export function calcularSilagem({
  silagem = "silagem-milho",
  modoEstoque = "medidas",
  comprimentoM = null,
  larguraTopoM = null,
  larguraBaseM = null,
  alturaM = null,
  densidade = null,
  estoqueT = null,
  msPct = null,
  perdasPct = null,
  modoConsumo = "total",
  consumoKgDia = null,
  lotes = [],
  diasNecessarios = null,
}) {
  const ref = SILAGENS[silagem];
  if (!ref) throw new Error("Escolha o tipo de silagem.");
  const ms = msPct ?? ref.msPct;
  const perdas = perdasPct ?? PERDAS_PADRAO;
  const dens = densidade ?? ref.densidade;
  if (!(Number.isFinite(ms) && ms > 0 && ms <= 100)) throw new Error("Informe a matéria seca de 1 a 100%.");
  if (!(Number.isFinite(perdas) && perdas >= 0 && perdas < 100)) throw new Error("Informe as perdas de 0 a 99%.");

  const estoque = calcularEstoque({ modoEstoque, comprimentoM, larguraTopoM, larguraBaseM, alturaM, densidade: dens, estoqueT });
  const aproveitavelT = estoque.estoqueT * (1 - perdas / 100);

  let calculados = [];
  let consumo;
  if (modoConsumo === "animais") {
    if (!lotes.length) throw new Error("Informe ao menos uma categoria com animais.");
    calculados = lotes.map((l) => calcularLote(l, ms));
    consumo = calculados.reduce((s, l) => s + l.kgDia, 0);
  } else if (modoConsumo === "total") {
    if (!positivo(consumoKgDia)) throw new Error("Informe quantos kg de silagem são fornecidos por dia.");
    consumo = consumoKgDia;
  } else {
    throw new Error("Escolha como informar o consumo.");
  }

  const dias = (aproveitavelT * 1000) / consumo;
  // O painel perde também a parte descartada, não só o que vai ao cocho.
  const avancoCmDia = estoque.painelM2 ? (consumo / (1 - perdas / 100) / dens / estoque.painelM2) * 100 : null;

  let meta = null;
  if (diasNecessarios !== null && diasNecessarios !== undefined) {
    if (!positivo(diasNecessarios)) throw new Error("Informe por quantos dias a silagem precisa durar.");
    const necessarioT = (consumo * diasNecessarios) / 1000;
    const kgDiaMaximo = (aproveitavelT * 1000) / diasNecessarios;
    meta = {
      dias: diasNecessarios,
      necessarioT,
      saldoT: aproveitavelT - necessarioT,
      // Silagem a mais a guardar, antes das perdas, para cobrir a falta.
      faltaEstoqueT: Math.max(0, necessarioT - aproveitavelT) / (1 - perdas / 100),
      kgDiaMaximo,
      fatorConsumo: kgDiaMaximo / consumo,
    };
  }

  return {
    silagem,
    nome: ref.nome,
    msPct: ms,
    perdasPct: perdas,
    densidade: dens,
    modoEstoque,
    comprimentoM,
    larguraTopoM,
    larguraBaseM: estoque.larguraBaseM ?? null,
    alturaM,
    volumeM3: estoque.volumeM3,
    painelM2: estoque.painelM2,
    estoqueT: estoque.estoqueT,
    estoqueMsT: estoque.estoqueT * (ms / 100),
    aproveitavelT,
    modoConsumo,
    lotes: calculados,
    animais: calculados.reduce((s, l) => s + l.animais, 0),
    consumoKgDia: consumo,
    consumoMsKgDia: consumo * (ms / 100),
    dias,
    avancoCmDia,
    meta,
  };
}
