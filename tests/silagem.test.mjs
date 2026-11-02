import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularSilagem, kgSilagemPadrao, SILAGENS } from "../js/calc/silagem.js";

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const medidas = { comprimentoM: 20, larguraTopoM: 6, larguraBaseM: 4, alturaM: 2, densidade: 600 };

test("estoque pelas medidas: seção de trapézio × comprimento × densidade", () => {
  const r = calcularSilagem({ ...medidas, consumoKgDia: 1000 });
  assert.equal(r.painelM2, 10);
  assert.equal(r.volumeM3, 200);
  assert.equal(r.estoqueT, 120);
  perto(r.aproveitavelT, 108); // 10% de perdas
  perto(r.dias, 108);
  perto(r.estoqueMsT, 120 * 0.33);
});

test("sem largura da base, o silo é tratado como retangular", () => {
  const r = calcularSilagem({ ...medidas, larguraBaseM: null, consumoKgDia: 1000 });
  assert.equal(r.painelM2, 12);
  assert.equal(r.larguraBaseM, 6);
});

test("densidade e MS vazias usam a referência da silagem", () => {
  const r = calcularSilagem({ ...medidas, silagem: "silagem-capim", densidade: null, consumoKgDia: 1000 });
  assert.equal(r.densidade, SILAGENS["silagem-capim"].densidade);
  assert.equal(r.msPct, SILAGENS["silagem-capim"].msPct);
});

test("estoque informado em toneladas, sem avanço de painel", () => {
  const r = calcularSilagem({ modoEstoque: "toneladas", estoqueT: 50, perdasPct: 0, consumoKgDia: 2000 });
  assert.equal(r.dias, 25);
  assert.equal(r.avancoCmDia, null);
});

test("avanço do painel conta a silagem descartada", () => {
  const r = calcularSilagem({ ...medidas, consumoKgDia: 1350 });
  // 1.350 ÷ 0,9 = 1.500 kg tirados; 1.500 ÷ 600 = 2,5 m³; ÷ 10 m² = 25 cm
  perto(r.avancoCmDia, 25);
});

test("consumo pelos animais: soma das categorias e referência pela MS da silagem", () => {
  const r = calcularSilagem({
    ...medidas,
    modoConsumo: "animais",
    lotes: [
      { tipo: "vacas-lactacao", animais: 40, kgAnimal: 25 },
      { tipo: "novilhas-leite", animais: 10 },
    ],
  });
  const novilha = kgSilagemPadrao("novilhas-leite", 330, 33);
  perto(novilha, (330 * 0.024 * 0.85) / 0.33);
  perto(r.lotes[1].kgAnimal, novilha);
  assert.equal(r.lotes[1].referencia, true);
  perto(r.consumoKgDia, 1000 + 10 * novilha);
  assert.equal(r.animais, 50);
});

test("meta: sobra, falta e consumo máximo para durar os dias necessários", () => {
  const sobra = calcularSilagem({ ...medidas, consumoKgDia: 1000, diasNecessarios: 100 });
  perto(sobra.meta.saldoT, 8);
  assert.equal(sobra.meta.faltaEstoqueT, 0);
  const falta = calcularSilagem({ ...medidas, consumoKgDia: 1000, diasNecessarios: 120 });
  perto(falta.meta.saldoT, -12);
  perto(falta.meta.faltaEstoqueT, 12 / 0.9);
  perto(falta.meta.kgDiaMaximo, 900);
  perto(falta.meta.fatorConsumo, 0.9);
});

test("recusa dados inválidos", () => {
  assert.throws(() => calcularSilagem({ ...medidas, comprimentoM: 0, consumoKgDia: 1 }), /comprimento/);
  assert.throws(() => calcularSilagem({ ...medidas, alturaM: null, consumoKgDia: 1 }), /altura/);
  assert.throws(() => calcularSilagem({ modoEstoque: "toneladas", consumoKgDia: 1 }), /toneladas/);
  assert.throws(() => calcularSilagem({ ...medidas }), /kg de silagem/);
  assert.throws(() => calcularSilagem({ ...medidas, modoConsumo: "animais" }), /categoria/);
  assert.throws(() => calcularSilagem({ ...medidas, modoConsumo: "animais", lotes: [{ tipo: "recria", animais: 0 }] }), /animais/);
  assert.throws(() => calcularSilagem({ ...medidas, consumoKgDia: 1, perdasPct: 100 }), /perdas/);
  assert.throws(() => calcularSilagem({ ...medidas, consumoKgDia: 1, diasNecessarios: 0 }), /durar/);
  assert.throws(() => calcularSilagem({ ...medidas, silagem: "feno", consumoKgDia: 1 }), /silagem/);
});
