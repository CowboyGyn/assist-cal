import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Roda o Codigo.gs com uma planilha falsa na memória: nenhum dado real é lido ou gravado.
const USUARIOS = [
  ["Nome", "Celular", "Senha", "Ativo"],
  ["Ana Teste", "(62) 9 9111-1111", "h1$x", "sim"],
  ["Bia Teste", "(62) 9 9222-2222", "h1$x", "não"],
  ["Cau Teste", "64 3333-3333", "h1$x", ""], // número antigo, sem o 9
];

function montar(linhasUso = []) {
  const gravadas = [];
  const usuarios = { getDataRange: () => ({ getDisplayValues: () => USUARIOS }) };
  const uso = {
    getLastRow: () => 1 + linhasUso.length,
    getMaxRows: () => 1000,
    getRange: (linha, coluna, n) => ({
      getValues: () => linhasUso.slice(linha - 2, linha - 2 + n),
      setValues: (v) => gravadas.push(...v),
    }),
  };
  const ctx = {
    Utilities: { formatDate: (d) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10) },
    SpreadsheetApp: {
      openById: () => ({ getSheets: () => [usuarios], getSheetByName: (n) => (n === "Uso" ? uso : null) }),
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      createTextOutput: (texto) => ({ setMimeType: () => JSON.parse(texto) }),
      MimeType: { JSON: "json" },
    },
    console: { error: () => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../apps-script/Codigo.gs", import.meta.url), "utf8"), ctx);
  ctx.comprovanteValido = () => true; // a assinatura usa a chave guardada no Google
  return { ctx, gravadas };
}

const evento = { modulo: "agio", acao: "calcular", quando: new Date().toISOString() };

test("aba Uso grava o celular como está no cadastro, com ou sem o 9 no login", () => {
  const { ctx, gravadas } = montar();
  ctx.registrarUso({ celular: "62 9111-1111", comprovante: "x", eventos: [evento] });
  ctx.registrarUso({ celular: "(62) 99111-1111", comprovante: "x", eventos: [evento] });
  ctx.registrarUso({ celular: "64 9 3333-3333", comprovante: "x", eventos: [evento] });
  assert.deepEqual(
    gravadas.map((l) => l[2]),
    ["(62) 9 9111-1111", "(62) 9 9111-1111", "(64) 3333-3333"],
  );
});

test("celular com 0 antes do DDD mantém o 9 no formato", () => {
  const { ctx } = montar();
  assert.equal(ctx.formatarCelular("6299999999", "0 62 9 9999-9999"), "(62) 9 9999-9999");
  assert.equal(ctx.formatarCelular("6299999999", "+55 62 9 9999-9999"), "(62) 9 9999-9999");
  assert.equal(ctx.formatarCelular("6299999999", "062 9999-9999"), "(62) 9999-9999");
  assert.equal(ctx.formatarCelular("6299999999", "62 9999-9999"), "(62) 9999-9999");
});

test("ranking não dá pontos a quem foi desativado", () => {
  const agora = new Date();
  const { ctx } = montar([
    [agora, "Ana Teste", "(62) 9 9111-1111", "Ágio de animais", "Calculou"],
    [agora, "Bia Teste", "(62) 9 9222-2222", "Ágio de animais", "Exportou PDF"],
    [agora, "Cau Teste", "(64) 3333-3333", "Ágio de animais", "Calculou"],
  ]);
  const pontos = { ...ctx.pontosRanking() };
  assert.deepEqual(pontos, { 6291111111: 2, 6433333333: 2 });
  assert.equal(ctx.posicaoDe(pontos, "6292222222", 2).posicao, 0);
});

test("pedido sem dados recebe 'Requisição inválida.'", () => {
  const { ctx } = montar();
  for (const corpo of ["null", "[]", "5", '"texto"', "{", ""]) {
    const r = ctx.doPost({ postData: { contents: corpo } });
    assert.equal(r.ok, false, corpo);
    assert.equal(r.erro, "Requisição inválida.", corpo);
  }
  assert.equal(ctx.doPost({}).erro, "Requisição inválida.");
  assert.equal(ctx.doPost({ postData: { contents: "{}" } }).erro, "Ação desconhecida.");
});

test("padronizarCelularesUso reescreve o celular das linhas antigas como está no cadastro", () => {
  const { ctx } = montar();
  const coluna = [["62 9111-1111"], ["(62) 9 9111-1111"], ["064 9 3333-3333"], ["(11) 9 8888-7777"]];
  let gravado = null;
  const aba = {
    getLastRow: () => 1 + coluna.length,
    getRange: (linha, col, n, largura) => {
      assert.deepEqual([linha, col, n, largura], [2, 3, coluna.length, 1]); // só a coluna Celular
      return { getValues: () => coluna, setValues: (v) => (gravado = v) };
    },
  };
  ctx.SpreadsheetApp.flush = () => {};
  const r = ctx.celularesPadronizados(USUARIOS, aba);
  assert.deepEqual({ ...r }, { linhas: 4, mudados: 2 });
  assert.deepEqual(
    gravado.map((l) => l[0]),
    ["(62) 9 9111-1111", "(62) 9 9111-1111", "(64) 3333-3333", "(11) 9 8888-7777"], // fora do cadastro fica igual
  );
});

test("padronizarCelularesUso não grava nada quando já está tudo certo", () => {
  const { ctx } = montar();
  const aba = {
    getLastRow: () => 2,
    getRange: () => ({ getValues: () => [["(62) 9 9111-1111"]], setValues: () => assert.fail("não devia gravar") }),
  };
  assert.deepEqual({ ...ctx.celularesPadronizados(USUARIOS, aba) }, { linhas: 1, mudados: 0 });
});
