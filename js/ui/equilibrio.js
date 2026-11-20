// Módulo "Ponto de equilíbrio": quanto leite produzir para a margem bruta desejada e quanto zera a margem.
import { calcularEquilibrio, ITENS_PADRAO, DIAS_MES } from "../calc/equilibrio.js";
import {
  $,
  fmt,
  numero,
  escapar,
  cabecalhoRelatorio,
  premissasRelatorio,
  rodapeRelatorio,
  botaoPdf,
  ativarPdf,
  ativarDicas,
  avisarUso,
  graficoBarras,
} from "./comum.js";

const CHAVE_STORAGE = "ateg-cal:equilibrio";
const CAMPOS_GERAIS = ["fazenda", "litrosDia", "precoLitro", "vacas", "outrasReceitas", "coeTotal", "margemDesejada"];
const CAMPOS_CUSTO = ["nome", "valor"];
const MODOS_CUSTO = ["total", "itens"];

const form = $("formEquilibrio");
const erro = $("erroEquilibrio");
const resultado = $("resultadoEquilibrio");
const listaCustos = $("listaCustos");

// ---------- Itens do COE ----------

function novoCusto(dados = {}) {
  const item = $("modeloCusto").content.firstElementChild.cloneNode(true);
  for (const n of CAMPOS_CUSTO) {
    const v = dados[n];
    if (v !== undefined && v !== null) item.querySelector(`[data-campo="${n}"]`).value = v;
  }
  item.querySelector(".remover").addEventListener("click", () => item.remove());
  listaCustos.append(item);
  return item;
}

function lerCustos() {
  return [...listaCustos.children].map((item) => {
    const dados = {};
    for (const n of CAMPOS_CUSTO) dados[n] = item.querySelector(`[data-campo="${n}"]`).value.trim();
    return dados;
  });
}

function iniciarCustos(custos) {
  listaCustos.replaceChildren();
  const validos = Array.isArray(custos) ? custos.filter((c) => c && typeof c.nome === "string") : [];
  for (const c of validos.length ? validos : ITENS_PADRAO) novoCusto(c);
}

$("btnAddCusto").addEventListener("click", () => {
  novoCusto().querySelector('[data-campo="nome"]').focus();
});

// ---------- Modos ----------

function atualizarTela() {
  const itens = form.elements.modoCustos.value === "itens";
  $("blocoItensCusto").hidden = !itens;
  $("blocoTotalCusto").hidden = itens;
}

form.addEventListener("change", (e) => {
  if (e.target.name === "modoCustos") atualizarTela();
});

// ---------- Salvar e restaurar ----------

function estadoAtual() {
  const estado = { custos: lerCustos(), modoCustos: form.elements.modoCustos.value };
  for (const n of CAMPOS_GERAIS) estado[n] = form.elements[n].value;
  return estado;
}

function salvar(estado) {
  try {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(estado));
  } catch {
    // Sem armazenamento: segue sem lembrar os dados.
  }
}

function restaurar() {
  let estado = null;
  try {
    estado = JSON.parse(localStorage.getItem(CHAVE_STORAGE));
  } catch {
    estado = null;
  }
  if (estado && typeof estado === "object") {
    for (const n of CAMPOS_GERAIS) {
      if (typeof estado[n] === "string" && estado[n] !== "") form.elements[n].value = estado[n];
    }
    if (MODOS_CUSTO.includes(estado.modoCustos)) form.elements.modoCustos.value = estado.modoCustos;
  }
  iniciarCustos(estado?.custos);
  atualizarTela();
}

// ---------- Cálculo ----------

function mostrarErro(msg) {
  erro.textContent = msg;
  erro.hidden = false;
  resultado.hidden = true;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  erro.hidden = true;
  const estado = estadoAtual();
  let r;
  try {
    r = calcularEquilibrio({
      litrosDia: numero(estado.litrosDia),
      precoLitro: numero(estado.precoLitro),
      outrasReceitas: numero(estado.outrasReceitas),
      vacas: numero(estado.vacas),
      modoCustos: estado.modoCustos,
      coeTotal: numero(estado.coeTotal),
      itens: estado.custos.map((c) => ({ nome: c.nome, valor: numero(c.valor) })),
      margemDesejada: numero(estado.margemDesejada),
    });
  } catch (err) {
    mostrarErro(err.message);
    // Sem a meta, leva direto ao campo que falta.
    if (numero(estado.margemDesejada) === null) form.elements.margemDesejada.focus();
    return;
  }
  salvar(estado);
  avisarUso("ponto-equilibrio", "calcular");
  const fazenda = estado.fazenda.trim();
  resultado.innerHTML =
    cabecalhoRelatorio("Ponto de equilíbrio", fazenda) +
    renderizarResultado(r, fazenda) +
    renderizarPremissas(r) +
    rodapeRelatorio() +
    botaoPdf();
  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("btnLimparEquilibrio").addEventListener("click", () => {
  form.reset();
  iniciarCustos();
  atualizarTela();
  erro.hidden = true;
  resultado.hidden = true;
  resultado.innerHTML = "";
  try {
    localStorage.removeItem(CHAVE_STORAGE);
  } catch {
    // ignora
  }
});

// ---------- Resultado ----------

const reais = (v, casas = 0) => `${v < 0 ? "−" : ""}R$ ${fmt(Math.abs(v), casas)}`; // não quebra entre R$ e o número
const porLitro = (v) => reais(v, 2);
// Nas tabelas o cabeçalho já diz R$/mês ou R$/L: só o número, com sinal.
const num = (v, casas = 0) => `${v < 0 ? "−" : ""}${fmt(Math.abs(v), casas)}`;

// Situação do volume em relação ao leite de hoje.
function comparacao(v) {
  if (v.diferencaDia > 0) return `${fmt(v.diferencaDia)} L/dia a mais que hoje (+${fmt(v.diferencaPct)}%)`;
  if (v.diferencaDia < 0) return `${fmt(-v.diferencaDia)} L/dia abaixo de hoje`;
  return "igual ao de hoje";
}

function renderizarMeta(r) {
  const m = r.meta;
  const linhas = [
    ["Leite necessário", `<b>${fmt(m.litrosDia)} L/dia</b><span class="decimal">${fmt(m.litrosMes)} L/mês</span>`],
    ["Em relação a hoje", comparacao(m)],
  ];
  if (m.vacas !== null) {
    linhas.push([`Vacas em lactação (a ${fmt(r.litrosVaca, 1)} L/vaca/dia)`, `${fmt(Math.ceil(m.vacas))} vacas (hoje ${fmt(r.vacas)})`]);
  }
  if (!r.atingida) linhas.push(["Ou, com o leite de hoje, preço necessário", `${porLitro(r.precoNecessario)}/L`]);
  return `
    <h3>Para a margem bruta de ${reais(r.margemDesejada)} por mês</h3>
    ${r.atingida ? `<p class="aviso ok">A margem bruta de hoje (${reais(r.margemBruta)}) já alcança a desejada.</p>` : ""}
    <table><tbody>${linhas.map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join("")}</tbody></table>`;
}

function renderizarEquilibrio(r) {
  const cobre = r.precoLitro > r.precoEquilibrio;
  return `
    <h3>Ponto de equilíbrio</h3>
    <p class="aviso ${cobre ? "ok" : "atencao"}">Com o leite abaixo de <b>${porLitro(r.precoEquilibrio)}/L</b>, a receita não paga
      o COE e a margem bruta fica negativa. Hoje o leite é vendido a ${porLitro(r.precoLitro)}/L,
      ${cobre ? `${porLitro(r.precoLitro - r.precoEquilibrio)} acima` : `${porLitro(r.precoEquilibrio - r.precoLitro)} abaixo`} desse ponto.</p>`;
}

function renderizarGrafico(r) {
  const barras = [
    { rotulo: "Hoje", valor: r.litrosDia, dica: `Produção de hoje: ${fmt(r.litrosDia)} L/dia` },
    { rotulo: "Para a meta", valor: r.meta.litrosDia, dica: `Para a margem desejada: ${fmt(r.meta.litrosDia)} L/dia` },
  ];
  return `
    <h3>Litros por dia</h3>
    ${graficoBarras({
      valores: barras.map((b) => b.valor),
      rotulos: barras.map((b) => b.rotulo),
      cor: "var(--verde)",
      formatar: (v) => fmt(v),
      dicas: barras.map((b) => b.dica),
      descricao: "Produção de hoje comparada com o leite necessário para a margem desejada",
    })}`;
}

function renderizarMes(r) {
  const L = r.litrosMes;
  const linha = (nome, v, total = false) =>
    `<tr${total ? ' class="total"' : ""}><td>${nome}</td><td class="${total ? (v < 0 ? "negativo" : "positivo") : ""}">${num(v)}</td><td>${num(v / L, 2)}</td></tr>`;
  return `
    <h3>Resultado do mês com o leite de hoje</h3>
    <table>
      <thead><tr><th></th><th>R$/mês</th><th>R$/L</th></tr></thead>
      <tbody>
        ${linha("Receita do leite", r.receitaLeite)}
        ${r.outrasReceitas ? linha("Outras receitas", r.outrasReceitas) : ""}
        ${linha("COE", -r.coe)}
        ${linha("<b>Margem bruta</b> (receita − COE)", r.margemBruta, true)}
      </tbody>
    </table>`;
}

function renderizarItens(r) {
  if (r.modoCustos !== "itens") return "";
  const L = r.litrosMes;
  return `
    <h3>COE informado</h3>
    <table>
      <thead><tr><th>Item</th><th>R$/mês</th><th>R$/L</th></tr></thead>
      <tbody>${r.itens.map((i) => `<tr><td>${escapar(i.nome)}</td><td>${num(i.valor)}</td><td>${num(i.valor / L, 2)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Total</td><td>${num(r.coe)}</td><td>${num(r.coeLitro, 2)}</td></tr></tfoot>
    </table>`;
}

function renderizarResultado(r, fazenda) {
  const sub = [fazenda, `${fmt(r.litrosDia)} L/dia a ${porLitro(r.precoLitro)}/L`].filter(Boolean).map(escapar).join(" · ");
  if (r.semSobra) {
    return `
      <h2>Ponto de equilíbrio</h2>
      <p class="sub">${sub}</p>
      <p class="aviso atencao">O COE por litro (${porLitro(r.coeLitro)}) é igual ou maior que o preço do leite
        (${porLitro(r.precoLitro)}/L): cada litro a mais aumenta o prejuízo, e nenhum volume chega à margem desejada.
        Com o leite de hoje, a margem de ${reais(r.margemDesejada)} exigiria o preço de ${porLitro(r.precoNecessario)}/L.
        Antes de produzir mais, é preciso reduzir o COE por litro (principalmente o concentrado) ou vender melhor o leite.</p>
      ${renderizarMes(r)}
      ${renderizarItens(r)}`;
  }
  return `
    <h2>Ponto de equilíbrio</h2>
    <p class="sub">${sub}</p>
    <p class="destaque"><b>${fmt(r.meta.litrosDia)} L/dia</b><span>é o leite que a fazenda precisa produzir para ter margem bruta
      de ${reais(r.margemDesejada)} por mês · hoje ${fmt(r.litrosDia)} L/dia</span></p>
    <div class="indicadores">
      <div class="indicador"><b class="${r.margemBruta < 0 ? "negativo" : ""}">${reais(r.margemBruta)}</b><span>margem bruta por mês hoje</span></div>
      <div class="indicador"><b>${porLitro(r.sobraLitro)}</b><span>margem bruta por litro</span></div>
      <div class="indicador"><b>${porLitro(r.coeLitro)}</b><span>COE por litro hoje</span></div>
    </div>
    ${renderizarMeta(r)}
    ${renderizarEquilibrio(r)}
    ${renderizarGrafico(r)}
    ${renderizarMes(r)}
    ${renderizarItens(r)}
    <p class="nota">Leite necessário = (margem desejada − outras receitas) ÷ (preço − COE por litro). Todo o COE é custo
      variável: o cálculo supõe que o COE por litro fica igual ao produzir mais. Mês de ${DIAS_MES} dias.</p>`;
}

function renderizarPremissas(r) {
  const linhas = [
    ["Produção e preço", `${fmt(r.litrosDia)} L/dia · ${porLitro(r.precoLitro)}/L${r.vacas ? ` · ${fmt(r.vacas)} vacas em lactação` : ""}`],
    ["COE do mês", `${reais(r.coe)} (${porLitro(r.coeLitro)}/L)${r.modoCustos === "itens" ? " pelos itens" : ""}`],
  ];
  if (r.outrasReceitas) linhas.push(["Outras receitas", `${reais(r.outrasReceitas)}/mês`]);
  linhas.push(["Margem bruta desejada", `${reais(r.margemDesejada)}/mês`]);
  return premissasRelatorio(linhas);
}

ativarPdf(resultado, () => ["Ponto de equilibrio", form.elements.fazenda.value.trim()], "ponto-equilibrio");
ativarDicas(resultado);

restaurar();
