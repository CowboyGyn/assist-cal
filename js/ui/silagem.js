// Módulo "Estoque de silagem": quanto há no silo e por quantos dias dura.
import { calcularSilagem, kgSilagemPadrao, SILAGENS, CATEGORIAS, PERDAS_PADRAO, AVANCO_MINIMO_CM } from "../calc/silagem.js";
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
  avisarUso,
  guardarUltimoSilo,
} from "./comum.js";

const CHAVE_STORAGE = "ateg-cal:silagem";
const CAMPOS_GERAIS = ["fazenda", "silo", "silagem", "comprimentoM", "alturaM", "larguraTopoM", "larguraBaseM", "estoqueT",
  "densidade", "msPct", "perdasPct", "consumoKgDia", "diasNecessarios"];
const CAMPOS_LOTE = ["tipo", "animais", "pesoKg", "kgAnimal"];
const MODOS = { modoEstoque: ["medidas", "toneladas"], modoConsumo: ["total", "animais"] };

const form = $("formSilagem");
const erro = $("erroSilagem");
const resultado = $("resultadoSilagem");
const listaLotes = $("listaLotesSilagem");

// O campo já se chama "Silagem": a lista mostra só a planta, que cabe no celular.
for (const [tipo, s] of Object.entries(SILAGENS)) {
  const planta = s.nome.replace("Silagem de ", "");
  form.elements.silagem.append(new Option(planta[0].toUpperCase() + planta.slice(1), tipo));
}

const silagemAtual = () => SILAGENS[form.elements.silagem.value];
const msAtual = () => {
  const ms = numero(form.elements.msPct.value);
  return ms > 0 && ms <= 100 ? ms : silagemAtual().msPct;
};

// ---------- Lotes de animais ----------

function opcoesCategorias() {
  const grupos = new Map();
  for (const [tipo, c] of Object.entries(CATEGORIAS)) {
    if (!grupos.has(c.grupo)) grupos.set(c.grupo, document.createElement("optgroup"));
    grupos.get(c.grupo).label = c.grupo;
    grupos.get(c.grupo).append(new Option(c.nome, tipo));
  }
  return [...grupos.values()];
}

function atualizarLote(item) {
  const tipo = item.querySelector('[data-campo="tipo"]').value;
  const campoPeso = item.querySelector('[data-campo="pesoKg"]');
  campoPeso.placeholder = CATEGORIAS[tipo].pesoKg;
  const peso = numero(campoPeso.value);
  const kg = kgSilagemPadrao(tipo, peso > 0 ? peso : CATEGORIAS[tipo].pesoKg, msAtual());
  item.querySelector('[data-campo="kgAnimal"]').placeholder = fmt(kg, 1);
}

function novoLote(dados = {}) {
  const item = $("modeloLoteSilagem").content.firstElementChild.cloneNode(true);
  item.querySelector('[data-campo="tipo"]').replaceChildren(...opcoesCategorias());
  for (const n of CAMPOS_LOTE) {
    const v = dados[n];
    if (v !== undefined && v !== null) item.querySelector(`[data-campo="${n}"]`).value = v;
  }
  item.addEventListener("input", () => atualizarLote(item));
  item.querySelector(".remover").addEventListener("click", () => item.remove());
  listaLotes.append(item);
  atualizarLote(item);
  return item;
}

function lerLotes() {
  return [...listaLotes.children].map((item) => {
    const dados = {};
    for (const n of CAMPOS_LOTE) dados[n] = item.querySelector(`[data-campo="${n}"]`).value.trim();
    return dados;
  });
}

function iniciarLotes(lotes) {
  listaLotes.replaceChildren();
  const validos = (lotes ?? []).filter((l) => CATEGORIAS[l.tipo]);
  for (const l of validos.length ? validos : [{}]) novoLote(l);
}

$("btnAddLoteSilagem").addEventListener("click", () => {
  novoLote().querySelector('[data-campo="animais"]').focus();
});

// ---------- Modos e referências ----------

function atualizarTela() {
  const medidas = form.elements.modoEstoque.value === "medidas";
  $("blocoMedidas").hidden = !medidas;
  $("blocoToneladas").hidden = medidas;
  $("campoDensidade").hidden = !medidas;
  const animais = form.elements.modoConsumo.value === "animais";
  $("blocoConsumoTotal").hidden = animais;
  $("blocoConsumoAnimais").hidden = !animais;
  const s = silagemAtual();
  form.elements.densidade.placeholder = s.densidade;
  form.elements.msPct.placeholder = s.msPct;
  for (const item of listaLotes.children) atualizarLote(item);
}

form.addEventListener("change", (e) => {
  if (["modoEstoque", "modoConsumo", "silagem"].includes(e.target.name)) atualizarTela();
});
form.elements.msPct.addEventListener("input", () => {
  for (const item of listaLotes.children) atualizarLote(item);
});

// ---------- Salvar e restaurar ----------

function estadoAtual() {
  const estado = { lotes: lerLotes() };
  for (const n of [...CAMPOS_GERAIS, ...Object.keys(MODOS)]) estado[n] = form.elements[n].value;
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
    if (!SILAGENS[form.elements.silagem.value]) form.elements.silagem.value = "silagem-milho";
    for (const [n, validos] of Object.entries(MODOS)) {
      if (validos.includes(estado[n])) form.elements[n].value = estado[n];
    }
  }
  iniciarLotes(estado?.lotes);
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
    r = calcularSilagem({
      silagem: estado.silagem,
      modoEstoque: estado.modoEstoque,
      comprimentoM: numero(estado.comprimentoM),
      larguraTopoM: numero(estado.larguraTopoM),
      larguraBaseM: numero(estado.larguraBaseM),
      alturaM: numero(estado.alturaM),
      densidade: numero(estado.densidade),
      estoqueT: numero(estado.estoqueT),
      msPct: numero(estado.msPct),
      perdasPct: numero(estado.perdasPct),
      modoConsumo: estado.modoConsumo,
      consumoKgDia: numero(estado.consumoKgDia),
      // Linha sem número de animais fica de fora.
      lotes: estado.lotes.filter((l) => l.animais !== "").map((l) => ({
        tipo: l.tipo,
        animais: numero(l.animais),
        pesoKg: numero(l.pesoKg),
        kgAnimal: numero(l.kgAnimal),
      })),
      diasNecessarios: numero(estado.diasNecessarios),
    });
  } catch (err) {
    mostrarErro(err.message);
    return;
  }
  salvar(estado);
  avisarUso("estoque-silagem", "calcular");
  const fazenda = estado.fazenda.trim();
  const silo = estado.silo.trim();
  guardarUltimoSilo({
    fazenda,
    silo,
    silagem: r.silagem,
    estoqueT: r.estoqueT,
    // Só leva a MS digitada; vazia, o Volumoso usa a mesma referência.
    msPct: numero(estado.msPct) === null ? null : r.msPct,
  });
  resultado.innerHTML =
    cabecalhoRelatorio("Estoque de silagem", fazenda) +
    renderizarResultado(r, fazenda, silo) +
    renderizarPremissas(r, silo) +
    rodapeRelatorio() +
    botaoPdf();
  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("btnLimparSilagem").addEventListener("click", () => {
  form.reset();
  iniciarLotes();
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

const fmtT = (t) => fmt(t, t < 10 ? 2 : 1);

function dataDaqui(dias) {
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(dias));
  return d.toLocaleDateString("pt-BR");
}

function avisos(r) {
  const lista = [];
  if (r.avancoCmDia !== null && r.avancoCmDia < AVANCO_MINIMO_CM) {
    lista.push(`O painel avança ${fmt(r.avancoCmDia)} cm por dia, menos que os ${AVANCO_MINIMO_CM} cm recomendados: a silagem exposta
      esquenta e estraga. Mantenha a face do painel lisa e a lona rente a ela; no próximo silo, use um painel menor para este consumo.`);
  }
  if (r.dias < 1) lista.push("O estoque não dá para um dia de consumo. Confira as medidas e o consumo informados.");
  return lista.map((t) => `<p class="aviso atencao">${t}</p>`).join("");
}

function renderizarMeta(r) {
  const m = r.meta;
  if (!m) return "";
  if (m.saldoT >= 0) {
    return `<p class="aviso ok">Dá para os ${fmt(m.dias)} dias e sobram <b>${fmtT(m.saldoT)} t</b>
      (cerca de ${fmt(r.dias - m.dias)} dias a mais).</p>`;
  }
  const porAnimal = r.modoConsumo === "animais"
    ? ` Isso é ${fmt(m.fatorConsumo * 100)}% do consumo atual em cada categoria.`
    : "";
  return `<p class="aviso atencao">Faltam <b>${fmtT(-m.saldoT)} t</b> para os ${fmt(m.dias)} dias
      (cerca de ${fmt(m.dias - r.dias)} dias sem silagem).</p>
    <table><tbody>
      <tr><td>Para durar ${fmt(m.dias)} dias, fornecer no máximo</td><td><b>${fmt(m.kgDiaMaximo)} kg/dia</b></td></tr>
      <tr><td>Ou comprar ou produzir mais</td><td><b>${fmtT(m.faltaEstoqueT)} t</b> de silagem</td></tr>
    </tbody></table>
    ${porAnimal ? `<p class="nota">${porAnimal.trim()} Reduzir silagem pede outro volumoso para não faltar comida.</p>` : ""}`;
}

function renderizarEstoque(r) {
  const linhas = [];
  if (r.modoEstoque === "medidas") {
    linhas.push(
      ["Painel", `(${fmt(r.larguraTopoM, 1)} + ${fmt(r.larguraBaseM, 1)}) ÷ 2 × ${fmt(r.alturaM, 1)} m = ${fmt(r.painelM2, 1)} m²`],
      ["Volume", `${fmt(r.painelM2, 1)} m² × ${fmt(r.comprimentoM, 1)} m = ${fmt(r.volumeM3)} m³`],
      [`Silagem (${fmt(r.densidade)} kg/m³)`, `${fmtT(r.estoqueT)} t`],
    );
  } else {
    linhas.push(["Silagem informada", `${fmtT(r.estoqueT)} t`]);
  }
  linhas.push(
    [`Matéria seca (${fmt(r.msPct, 1)}%)`, `${fmtT(r.estoqueMsT)} t MS`],
    [`Descontadas as perdas (${fmt(r.perdasPct)}%)`, `<b>${fmtT(r.aproveitavelT)} t</b> para o cocho`],
  );
  return `
    <h3>Estoque</h3>
    <table><tbody>${linhas.map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join("")}</tbody></table>`;
}

function renderizarLotes(r) {
  if (r.modoConsumo !== "animais") return "";
  const linhas = r.lotes
    .map((l) => `<tr>
        <td>${escapar(l.nome)}<span class="decimal">${fmt(l.pesoKg)} kg${l.referencia ? " · referência" : ""}</span></td>
        <td>${fmt(l.animais)}</td>
        <td>${fmt(l.kgAnimal, 1)}</td>
        <td>${fmt(l.kgDia)}</td>
      </tr>`)
    .join("");
  return `
    <h3>Consumo dos animais</h3>
    <table>
      <thead><tr><th>Categoria</th><th>Animais</th><th>kg/animal/dia</th><th>kg/dia</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td>Total</td><td>${fmt(r.animais)}</td><td></td><td>${fmt(r.consumoKgDia)}</td></tr></tfoot>
    </table>`;
}

function renderizarResultado(r, fazenda, silo) {
  return `
    <h2>Estoque de silagem</h2>
    <p class="sub">${[fazenda, silo, r.nome].filter(Boolean).map(escapar).join(" · ")}</p>
    <p class="destaque"><b>${fmt(Math.floor(r.dias))} dias</b><span>de silagem com o consumo informado · acaba por volta de ${dataDaqui(r.dias)}</span></p>
    <div class="indicadores">
      <div class="indicador"><b>${fmtT(r.estoqueT)}</b><span>t de silagem no estoque</span></div>
      <div class="indicador"><b>${fmt(r.consumoKgDia)}</b><span>kg de silagem por dia</span></div>
      ${r.avancoCmDia !== null
        ? `<div class="indicador"><b>${fmt(r.avancoCmDia)}</b><span>cm de avanço do painel por dia</span></div>`
        : `<div class="indicador"><b>${fmt(r.consumoMsKgDia)}</b><span>kg de MS por dia</span></div>`}
    </div>
    ${avisos(r)}
    ${renderizarMeta(r)}
    ${renderizarEstoque(r)}
    ${renderizarLotes(r)}
    <p class="nota">A densidade de referência vale para silagem bem compactada; silo mal compactado tem menos silagem por m³.
      As perdas cobrem o topo e as laterais estragados e o que se perde na retirada. A data considera o consumo de hoje até o fim.</p>`;
}

function renderizarPremissas(r, silo) {
  const linhas = [
    ["Silo", `${silo ? `${escapar(silo)} · ` : ""}${escapar(r.nome)}`],
    r.modoEstoque === "medidas"
      ? ["Medidas", `${fmt(r.comprimentoM, 1)} m de comprimento · ${fmt(r.alturaM, 1)} m de altura · ${fmt(r.larguraTopoM, 1)} m no topo e ${fmt(r.larguraBaseM, 1)} m na base · ${fmt(r.densidade)} kg/m³`]
      : ["Estoque", `${fmtT(r.estoqueT)} t informadas`],
    ["Matéria seca", `${fmt(r.msPct, 1)}%`],
    ["Perdas até o cocho", `${fmt(r.perdasPct)}%`],
    r.modoConsumo === "animais"
      ? ["Consumo", `${fmt(r.animais)} animais · ${fmt(r.consumoKgDia)} kg/dia`]
      : ["Consumo", `${fmt(r.consumoKgDia)} kg/dia informados`],
  ];
  if (r.meta) linhas.push(["Precisa durar", `${fmt(r.meta.dias)} dias`]);
  return premissasRelatorio(linhas);
}

ativarPdf(resultado, () => ["Estoque de silagem", form.elements.fazenda.value.trim()], "estoque-silagem");

form.elements.perdasPct.placeholder = PERDAS_PADRAO;
restaurar();
