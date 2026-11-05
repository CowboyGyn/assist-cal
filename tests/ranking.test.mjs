import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Roda o Codigo.gs com um stub de Utilities (data no fuso de Brasília), sem planilha.
const ctx = {
  Utilities: {
    formatDate: (d) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10),
  },
};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../apps-script/Codigo.gs", import.meta.url), "utf8"), ctx);
const { calcularPontos, posicaoDe, contarCadastros } = ctx;

const agora = new Date("2026-11-05T15:00:00-03:00").getTime();
const h = (horas) => new Date(agora - horas * 3600000);
const ANA = "(62) 9 9111-1111";
const BIA = "(62) 9 9222-2222";
const CAU = "(64) 9 9333-3333";

test("pontos: 1 por dia de uso, 1 por cálculo, 2 por PDF, 3 por convite; abrir não pontua", () => {
  const p = calcularPontos(
    [
      [h(1), "Ana", ANA, "App", "Abriu"],
      [h(1), "Ana", ANA, "Rebanho ideal — leite", "Abriu"],
      [h(1), "Ana", ANA, "Rebanho ideal — leite", "Calculou"],
      [h(1), "Ana", ANA, "Rebanho ideal — leite", "Exportou PDF"],
      [h(30), "Ana", ANA, "Convite", "Enviou"],
      [h(2), "Bia", BIA, "App", "Abriu"],
    ],
    agora,
  );
  assert.equal(p["6291111111"], 1 + 1 + 2 + 1 + 3); // dois dias de uso
  assert.equal(p["6292222222"], 1);
});

test("só vale o que está nos últimos 30 dias", () => {
  const p = calcularPontos(
    [
      [h(24 * 31), "Ana", ANA, "Ágio de animais", "Calculou"],
      [h(24 * 29), "Bia", BIA, "Ágio de animais", "Calculou"],
      ["texto", "Cau", CAU, "App", "Abriu"],
    ],
    agora,
  );
  assert.deepEqual(Object.keys(p), ["6292222222"]);
});

test("posição: empatados dividem o lugar e quem não pontuou fica fora", () => {
  const pontos = { a: 10, b: 7, c: 7, d: 2 };
  assert.deepEqual({ ...posicaoDe(pontos, "a") }, { posicao: 1, total: 4, pontos: 10 });
  assert.deepEqual({ ...posicaoDe(pontos, "c") }, { posicao: 2, total: 4, pontos: 7 });
  assert.deepEqual({ ...posicaoDe(pontos, "d") }, { posicao: 4, total: 4, pontos: 2 });
  assert.deepEqual({ ...posicaoDe(pontos, "z") }, { posicao: 0, total: 4, pontos: 0 });
});

test("total é o número de cadastros ativos, sem repetir celular", () => {
  const valores = [
    ["Nome", "Celular", "Senha", "Ativo"],
    ["Ana", ANA, "h1$x", "sim"],
    ["Bia", BIA, "h1$x", ""],
    ["Bia de novo", "62992222222", "h1$x", ""],
    ["Cau", CAU, "h1$x", "não"],
    ["", "", "", ""],
  ];
  assert.equal(contarCadastros(valores), 2);
  const pontos = { a: 10, b: 7 };
  assert.deepEqual({ ...posicaoDe(pontos, "b", 163) }, { posicao: 2, total: 163, pontos: 7 });
  assert.deepEqual({ ...posicaoDe(pontos, "z", 163) }, { posicao: 0, total: 163, pontos: 0 });
  assert.equal(posicaoDe(pontos, "a", 1).total, 2); // nunca menos que quem pontuou
});
