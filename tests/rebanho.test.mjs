import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arredondarMantendoTotal,
  calcularPadraoAteg,
  calcularPorIndices,
  INDICES_PADRAO,
} from "../js/calc/rebanho.js";

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const qtd = (r, id) => r.categorias.find((c) => c.id === id).quantidade;

test("arredondamento mantém a soma do rebanho", () => {
  assert.deepEqual(arredondarMantendoTotal([10, 1.64, 2.91, 3.63]), [10, 2, 3, 3]);
  assert.deepEqual(arredondarMantendoTotal([30, 4.5, 4.5]), [30, 5, 4]);
});

test("padrão Assist com 10 vacas não perde animais (bug do app original)", () => {
  const r = calcularPadraoAteg(10);
  perto(r.total, 18.18);
  assert.equal(r.totalInteiro, 18);
  assert.equal(r.categorias.reduce((s, c) => s + c.inteiro, 0), 18);
  perto(r.pctLactacaoVacas, (55 / 64) * 100);
  perto(r.pctLactacaoRebanho, 55);
});

test("padrão Assist: proporções 55/9/16/20", () => {
  const r = calcularPadraoAteg(55);
  perto(r.total, 100);
  perto(qtd(r, "secas"), 9);
  perto(qtd(r, "novilhas"), 16);
  perto(qtd(r, "bezerras"), 20);
});

test("UA usa 450 kg", () => {
  const r = calcularPadraoAteg(55, { vaca: 450, bezerra: 225, novilhaAte24: 360, novilhaAcima24: 420 });
  // 55 + 9 vacas × 1 UA + 16 novilhas × 0,8 UA + 20 bezerras × 0,5 UA
  perto(r.uaTotal, 64 + 12.8 + 10);
});

test("índices: % em lactação = (IEP − PS) / IEP", () => {
  const r = calcularPorIndices(30, INDICES_PADRAO);
  const iepDias = 13 * (365 / 12);
  perto(r.pctLactacaoVacas, ((iepDias - 60) / iepDias) * 100);
});

test("índices: recria só da reposição produz exatamente a reposição necessária", () => {
  const r = calcularPorIndices(30, INDICES_PADRAO);
  perto(r.reposicao.produzidaAno, r.reposicao.necessariaAno);
  assert.ok(r.reposicao.saldoAno > 0);
  // Com índices típicos, a estrutura fica próxima dos 55% do padrão Assist.
  assert.ok(r.pctLactacaoRebanho > 50 && r.pctLactacaoRebanho < 60, `${r.pctLactacaoRebanho}`);
});

test("índices: recria de todas as fêmeas aumenta o rebanho jovem", () => {
  const rep = calcularPorIndices(30, INDICES_PADRAO);
  const todas = calcularPorIndices(30, { ...INDICES_PADRAO, recria: "todas" });
  assert.ok(todas.total > rep.total);
  perto(todas.reposicao.femeasNaoRecriadasAno, 0);
});

test("índices: déficit de reposição limita a recria às fêmeas nascidas", () => {
  const r = calcularPorIndices(30, { ...INDICES_PADRAO, descarteAnualPct: 50, mortBezerrasPct: 20 });
  assert.ok(r.reposicao.saldoAno < 0);
  perto(r.reposicao.femeasNaoRecriadasAno, 0);
});

test("índices: primeiro parto aos 24 meses não cria categoria acima de 24 m", () => {
  const r = calcularPorIndices(30, { ...INDICES_PADRAO, idadePrimeiroPartoMeses: 24 });
  assert.equal(r.categorias.some((c) => c.id === "novilhas2"), false);
});

test("validações", () => {
  assert.throws(() => calcularPadraoAteg(0));
  assert.throws(() => calcularPadraoAteg(10.5));
  assert.throws(() => calcularPorIndices(10, { ...INDICES_PADRAO, periodoSecoDias: 400 }));
  assert.throws(() => calcularPorIndices(10, { ...INDICES_PADRAO, iepMeses: Number.NaN }));
});
