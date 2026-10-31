import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCapacidade, consumoLactacaoKg, consumoReferenciaPct, CATEGORIAS } from "../js/calc/capacidade.js";

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const base = { areaHa: 1, amostrasKg: [2, 2], msPct: 25, descansoDias: 30 };

test("da amostra de 1 m² à forragem útil por hectare", () => {
  const r = calcularCapacidade(base);
  assert.equal(r.verdeKgHa, 20000);
  assert.equal(r.msKgHa, 5000);
  assert.equal(r.utilKgHa, 2500); // rente ao solo: 50%
});

test("corte na altura de saída aproveita mais, e o valor digitado prevalece", () => {
  assert.equal(calcularCapacidade({ ...base, corte: "saida" }).utilKgHa, 3500);
  assert.equal(calcularCapacidade({ ...base, corte: "saida", aproveitamentoPct: 60 }).utilKgHa, 3000);
});

test("sem animais: capacidade pelo ciclo planejado de descanso + ocupação", () => {
  const r = calcularCapacidade({ ...base, ocupacaoDias: 3 });
  assert.equal(r.diasOcupacao, null);
  assert.equal(r.cicloDias, 33);
  perto(r.capacidadeUaHa, 2500 / (11.25 * 33));
  assert.equal(r.piquetes, 11); // 30 ÷ 3 + 1
  assert.equal(r.areaModuloHa, 11);
});

test("com animais: dias de ocupação pelo consumo vindo do pasto", () => {
  const r = calcularCapacidade({ ...base, lotes: [{ tipo: "vacas-lactacao", animais: 50, consumoPct: 3 }] });
  const l = r.lotes[0];
  assert.equal(l.pesoKg, 500);
  perto(l.consumoAnimalKg, 8.46); // 500 kg × 1,1% ÷ 65% de FDN
  assert.equal(l.limitadoPeloFdn, true);
  perto(r.consumoDiaKg, 423.08);
  perto(r.diasOcupacao, 5.91);
  perto(r.capacidadeUaHa, 2500 / (11.25 * (30 + 2500 / 423.08)));
  assert.equal(r.piquetes, 7);
  perto(r.uaLote, 55.56);
});

test("o concentrado limita o pasto quando sobra menos que o limite pelo FDN", () => {
  const r = calcularCapacidade({ ...base, lotes: [{ tipo: "vacas-lactacao", animais: 1, consumoPct: 3, concentradoKg: 8 }] });
  const l = r.lotes[0];
  perto(l.consumoTotalKg, 15);
  perto(l.semConcentradoKg, 7);
  assert.equal(l.limitadoPeloFdn, false);
  perto(l.consumoAnimalKg, 7);
});

test("FDN maior reduz o consumo de pasto", () => {
  const consumo = (fdnPct) => calcularCapacidade({ ...base, fdnPct, lotes: [{ tipo: "vacas-lactacao", animais: 1, consumoPct: 3 }] }).lotes[0].consumoAnimalKg;
  perto(consumo(55), 10);
  perto(consumo(75), 7.33);
});

test("corte usa capacidade de FDN de 1,3% do peso", () => {
  const r = calcularCapacidade({ ...base, lotes: [{ tipo: "matrizes-paridas", animais: 1 }] });
  assert.equal(r.lotes[0].capacidadeFdnPct, 1.3);
  perto(r.lotes[0].consumoAnimalKg, 9);
});

test("sem FDN usa 65% e deixa isso marcado", () => {
  const r = calcularCapacidade(base);
  assert.equal(r.fdnPct, 65);
  assert.equal(r.fdnEstimado, true);
  assert.equal(calcularCapacidade({ ...base, fdnPct: 60 }).fdnEstimado, false);
});

test("lotes somam consumo e aceitam peso e capacidade de FDN próprios", () => {
  const r = calcularCapacidade({
    ...base,
    areaHa: 2,
    lotes: [
      { tipo: "recria", animais: 10, pesoKg: 300, capacidadeFdnPct: 1.3 },
      { tipo: "matrizes-secas", animais: 10 },
    ],
  });
  perto(r.lotes[0].consumoDiaKg, 60);
  perto(r.lotes[1].consumoDiaKg, 90);
  perto(r.diasOcupacao, 5000 / 150);
});

test("cenários mostram quantas UA cabem em cada duração", () => {
  const r = calcularCapacidade({ ...base, areaHa: 2 });
  const tres = r.cenarios.find((c) => c.dias === 3);
  perto(tres.ua, 5000 / 33.75);
  perto(tres.uaHa, tres.ua / 2);
});

test("micro-ondas calcula a MS e tem prioridade sobre o valor digitado", () => {
  const r = calcularCapacidade({ ...base, pesoUmidoG: 200, pesoSecoG: 60 });
  assert.equal(r.msPct, 30);
  assert.equal(r.msOrigem, "micro-ondas");
});

test("sem MS usa a referência e deixa isso marcado", () => {
  const r = calcularCapacidade({ ...base, msPct: null });
  assert.equal(r.msPct, 22);
  assert.equal(r.msOrigem, "referencia");
});

test("consumo da vaca em lactação sobe com o leite, pela equação da NASEM 2021", () => {
  perto(consumoLactacaoKg(500, 15), 16.09, 0.02); // 9,4 + 3,39 + 11 - 7,68
  perto(consumoReferenciaPct("vacas-lactacao", 500, 15), 3.22, 0.01);
  assert.ok(consumoLactacaoKg(500, 30) > consumoLactacaoKg(500, 15));
  const r = calcularCapacidade({ ...base, lotes: [{ tipo: "vacas-lactacao", animais: 10, leiteKg: 30 }] });
  perto(r.lotes[0].consumoTotalKg, consumoLactacaoKg(500, 30));
  assert.equal(r.lotes[0].leiteKg, 30);
});

test("referências de corte seguem o peso em jejum da NASEM 2016", () => {
  perto(CATEGORIAS["matrizes-secas"].consumoPct, 2.2 * 0.96, 0.02);
  perto(CATEGORIAS["matrizes-paridas"].consumoPct, 2.5 * 0.96, 0.01);
  const pctRecria = (0.01245 + 0.019218 * 1.1 - 0.007259 * 1.1 ** 2) * 100 * 0.96;
  perto(CATEGORIAS.recria.consumoPct, pctRecria, 0.02);
});

test("média e variação das amostras", () => {
  const r = calcularCapacidade({ ...base, amostrasKg: [1, 2, 3] });
  assert.equal(r.amostras.pontos, 3);
  assert.equal(r.amostras.media, 2);
  perto(r.amostras.cvPct, 50);
  assert.equal(calcularCapacidade({ ...base, amostrasKg: [2] }).amostras.cvPct, 0);
});

test("recusa dados inválidos", () => {
  assert.throws(() => calcularCapacidade({ ...base, areaHa: 0 }), /área/);
  assert.throws(() => calcularCapacidade({ ...base, amostrasKg: [] }), /ponto/);
  assert.throws(() => calcularCapacidade({ ...base, amostrasKg: [2, 0] }), /maiores que zero/);
  assert.throws(() => calcularCapacidade({ ...base, msPct: 120 }), /matéria seca/);
  assert.throws(() => calcularCapacidade({ ...base, pesoUmidoG: 100, pesoSecoG: 150 }), /peso seco/);
  assert.throws(() => calcularCapacidade({ ...base, aproveitamentoPct: 0 }), /aproveitamento/);
  assert.throws(() => calcularCapacidade({ ...base, lotes: [{ tipo: "recria", animais: 0 }] }), /animais/);
  assert.throws(() => calcularCapacidade({ ...base, fdnPct: 0 }), /FDN/);
  assert.throws(() => calcularCapacidade({ ...base, lotes: [{ tipo: "recria", animais: 5, concentradoKg: 50 }] }), /concentrado/);
  assert.throws(() => calcularCapacidade({ ...base, lotes: [{ tipo: "recria", animais: 5, capacidadeFdnPct: 0 }] }), /FDN/);
  assert.throws(() => calcularCapacidade({ ...base, lotes: [{ tipo: "x", animais: 5 }] }), /categoria/);
});
