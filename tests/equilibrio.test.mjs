import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularEquilibrio, DIAS_MES } from "../js/calc/equilibrio.js";

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// 500 L/dia = 15.000 L/mês a R$ 2,50; COE de R$ 28.500 (R$ 1,90/L), todo variável.
const base = { litrosDia: 500, precoLitro: 2.5, coeTotal: 28500, margemDesejada: 15000 };

test("situação atual: receita, COE por litro, sobra por litro e margem bruta", () => {
  const r = calcularEquilibrio(base);
  assert.equal(r.litrosMes, 500 * DIAS_MES);
  perto(r.receitaLeite, 37500);
  perto(r.coeLitro, 1.9);
  perto(r.sobraLitro, 0.6);
  perto(r.margemBruta, 9000);
});

test("leite para a margem desejada = margem ÷ (preço − COE por litro)", () => {
  const r = calcularEquilibrio({ ...base, vacas: 25 });
  perto(r.meta.litrosMes, 25000);
  perto(r.meta.litrosDia, 833.33);
  perto(r.meta.diferencaDia, 333.33);
  perto(r.meta.diferencaPct, 66.67);
  perto(r.meta.vacas, 833.33 / 20); // 20 L/vaca/dia hoje
  perto(r.precoNecessario, 2.9);
  assert.equal(r.atingida, false);
});

test("ponto de equilíbrio: preço em que a margem bruta fica zero", () => {
  perto(calcularEquilibrio(base).precoEquilibrio, 1.9);
});

test("outras receitas reduzem o leite necessário e o preço de equilíbrio", () => {
  const r = calcularEquilibrio({ ...base, outrasReceitas: 3000 });
  perto(r.meta.litrosMes, 20000);
  perto(r.precoEquilibrio, 1.7);
  perto(r.margemBruta, 12000);
});

test("COE pelos itens: soma dos valores, vazios ficam de fora", () => {
  const r = calcularEquilibrio({
    ...base,
    modoCustos: "itens",
    itens: [
      { nome: "Concentrado", valor: 15000 },
      { nome: "Mão de obra", valor: 6000 },
      { nome: "Energia", valor: 7500 },
      { nome: "Arrendamento", valor: null },
    ],
  });
  perto(r.coe, 28500);
  assert.equal(r.itens.length, 3);
  perto(r.meta.litrosMes, 25000);
});

test("margem já alcançada: leite necessário abaixo do de hoje", () => {
  const r = calcularEquilibrio({ ...base, margemDesejada: 6000 });
  assert.equal(r.atingida, true);
  perto(r.meta.litrosDia, 333.33);
});

test("COE por litro maior que o preço: nenhum volume chega à margem", () => {
  const r = calcularEquilibrio({ ...base, coeTotal: 40000 });
  assert.equal(r.semSobra, true);
  assert.equal(r.meta, null);
});

test("margem bruta desejada é obrigatória", () => {
  assert.throws(() => calcularEquilibrio({ ...base, margemDesejada: null }), /Informe a margem bruta desejada/);
  assert.throws(() => calcularEquilibrio({ ...base, margemDesejada: -1 }), /zero ou mais/);
});

test("validações", () => {
  assert.throws(() => calcularEquilibrio({ ...base, litrosDia: null }), /produção atual/);
  assert.throws(() => calcularEquilibrio({ ...base, precoLitro: 0 }), /preço do leite/);
  assert.throws(() => calcularEquilibrio({ ...base, coeTotal: null }), /COE do mês/);
  assert.throws(() => calcularEquilibrio({ ...base, modoCustos: "itens", itens: [] }), /ao menos um custo/);
  assert.throws(() => calcularEquilibrio({ ...base, vacas: 0 }), /vacas em lactação/);
});
