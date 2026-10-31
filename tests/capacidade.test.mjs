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
  perto(l.consumoAnimalKg, 9); // 500 kg × 3% × 60%
  perto(r.consumoDiaKg, 450);
  perto(r.diasOcupacao, 5.56);
  perto(r.capacidadeUaHa, 2500 / (11.25 * (30 + 2500 / 450)));
  assert.equal(r.piquetes, 7);
  perto(r.uaLote, 55.56);
});

test("lotes somam consumo e aceitam peso, consumo e parte do pasto próprios", () => {
  const r = calcularCapacidade({
    ...base,
    areaHa: 2,
    lotes: [
      { tipo: "recria", animais: 10, pesoKg: 300, consumoPct: 2.5, pastoPct: 100 },
      { tipo: "matrizes-secas", animais: 10 },
    ],
  });
  perto(r.lotes[0].consumoDiaKg, 75);
  perto(r.lotes[1].consumoDiaKg, 89.78);
  perto(r.diasOcupacao, 5000 / 164.78);
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
  perto(r.lotes[0].consumoAnimalKg, consumoLactacaoKg(500, 30) * 0.6);
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
  assert.throws(() => calcularCapacidade({ ...base, lotes: [{ tipo: "recria", animais: 5, pastoPct: 0 }] }), /pasto/);
  assert.throws(() => calcularCapacidade({ ...base, lotes: [{ tipo: "x", animais: 5 }] }), /categoria/);
});
