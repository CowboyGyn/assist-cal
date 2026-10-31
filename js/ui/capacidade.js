// Módulo "Capacidade de suporte": forragem colhida em 1 m², matéria seca e dias de ocupação.
import {
  calcularCapacidade,
  consumoReferenciaPct,
  CATEGORIAS,
  CORTES,
  LEITE_PADRAO_KG,
  KG_UA,
  CONSUMO_UA_PCT,
  MS_PADRAO,
  DESCANSO_PADRAO,
  OCUPACAO_PADRAO,
  PONTOS_RECOMENDADOS,
  OCUPACAO_CUIDADO,
} from "../calc/capacidade.js";
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
} from "./comum.js";

const CHAVE_STORAGE = "ateg-cal:capacidade";
const CAMPOS_GERAIS = ["fazenda", "piquete", "areaHa", "msPct", "pesoUmidoG", "pesoSecoG", "aproveitamentoPct", "descansoDias", "ocupacaoDias"];
const CAMPOS_LOTE = ["tipo", "animais", "pesoKg", "leiteKg", "consumoPct", "pastoPct"];
const CV_ALTO = 30; // pontos muito diferentes: o piquete pede mais amostras
const AMOSTRA_ALTA_KG = 15; // acima disso, provável digitação em gramas

const form = $("formCapacidade");
const erro = $("erroCapacidade");
const resultado = $("resultadoCapacidade");
const listaPontos = $("listaPontos");
const listaLotes = $("listaLotesCapacidade");

// ---------- Pontos de coleta ----------

function novoPonto(valor = "") {
  const numeroPonto = listaPontos.children.length + 1;
  const campo = document.createElement("label");
  campo.className = "campo";
  const titulo = document.createElement("span");
  titulo.textContent = `Ponto ${numeroPonto}`;
  const entrada = document.createElement("input");
  entrada.type = "number";
  entrada.inputMode = "decimal";
  entrada.min = "0";
  entrada.step = "0.01";
  entrada.value = valor;
  campo.append(titulo, entrada);
  listaPontos.append(campo);
  return entrada;
}

const lerPontos = () => [...listaPontos.querySelectorAll("input")].map((c) => c.value.trim());

function iniciarPontos(valores = []) {
  listaPontos.replaceChildren();
  const quantidade = Math.max(PONTOS_RECOMENDADOS, valores.length);
  for (let i = 0; i < quantidade; i++) novoPonto(valores[i] ?? "");
}

$("btnAddPonto").addEventListener("click", () => novoPonto().focus());

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
  const c = CATEGORIAS[tipo];
  const campo = (nome) => item.querySelector(`[data-campo="${nome}"]`);
  campo("pesoKg").placeholder = c.pesoKg;
  campo("pastoPct").placeholder = c.pastoPct;
  campo("leiteKg").closest(".campo").hidden = tipo !== "vacas-lactacao";
  const peso = numero(campo("pesoKg").value);
  const pct = consumoReferenciaPct(tipo, peso > 0 ? peso : null, numero(campo("leiteKg").value));
  campo("consumoPct").placeholder = fmt(pct, 1);
}

function novoLote(dados = {}) {
  const item = $("modeloLoteCapacidade").content.firstElementChild.cloneNode(true);
  item.querySelector('[data-campo="tipo"]').replaceChildren(...opcoesCategorias());
  for (const n of CAMPOS_LOTE) {
    const v = dados[n];
    if (v !== undefined && v !== null) item.querySelector(`[data-campo="${n}"]`).value = v;
  }
  item.querySelector('[data-campo="leiteKg"]').placeholder = LEITE_PADRAO_KG;
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

$("btnAddLoteCapacidade").addEventListener("click", () => {
  novoLote().querySelector('[data-campo="animais"]').focus();
});

// ---------- Salvar e restaurar ----------

function estadoAtual() {
  const estado = { pontos: lerPontos(), lotes: lerLotes(), corte: form.elements.corte.value };
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

function atualizarAproveitamento() {
  form.elements.aproveitamentoPct.placeholder = CORTES[form.elements.corte.value].aproveitamentoPct;
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
    if (CORTES[estado.corte]) form.elements.corte.value = estado.corte;
    if (estado.pesoUmidoG || estado.pesoSecoG) $("blocoMicroondas").open = true;
  }
  iniciarPontos(Array.isArray(estado?.pontos) ? estado.pontos : []);
  iniciarLotes(estado?.lotes);
  atualizarAproveitamento();
}

form.addEventListener("change", (e) => {
  if (e.target.name === "corte") atualizarAproveitamento();
});

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
    r = calcularCapacidade({
      areaHa: numero(estado.areaHa),
      amostrasKg: estado.pontos.map(numero).filter((v) => v !== null),
      msPct: numero(estado.msPct),
      pesoUmidoG: numero(estado.pesoUmidoG),
      pesoSecoG: numero(estado.pesoSecoG),
      corte: estado.corte,
      aproveitamentoPct: numero(estado.aproveitamentoPct),
      descansoDias: numero(estado.descansoDias),
      ocupacaoDias: numero(estado.ocupacaoDias),
      // Linha sem número de animais fica de fora: o cálculo sai só pela forragem.
      lotes: estado.lotes.filter((l) => l.animais !== "").map((l) => ({
        tipo: l.tipo,
        animais: numero(l.animais),
        pesoKg: numero(l.pesoKg),
        leiteKg: numero(l.leiteKg),
        consumoPct: numero(l.consumoPct),
        pastoPct: numero(l.pastoPct),
      })),
    });
  } catch (err) {
    mostrarErro(err.message);
    return;
  }
  salvar(estado);
  avisarUso("capacidade-suporte", "calcular");
  const fazenda = estado.fazenda.trim();
  const piquete = estado.piquete.trim();
  resultado.innerHTML =
    cabecalhoRelatorio("Capacidade de suporte", fazenda) +
    renderizarResultado(r, fazenda, piquete) +
    renderizarPremissas(r, piquete) +
    rodapeRelatorio() +
    botaoPdf();
  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("btnLimparCapacidade").addEventListener("click", () => {
  form.reset();
  iniciarPontos();
  iniciarLotes();
  atualizarAproveitamento();
  $("blocoMicroondas").open = false;
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

function avisos(r) {
  const lista = [];
  const a = r.amostras;
  if (a.media > AMOSTRA_ALTA_KG) {
    lista.push(`A média ficou em ${fmt(a.media, 1)} kg/m². Confira se os pesos foram digitados em kg, e não em gramas.`);
  }
  if (a.pontos < PONTOS_RECOMENDADOS) {
    lista.push(`Foram ${fmt(a.pontos)} ${a.pontos === 1 ? "ponto" : "pontos"} de coleta. O recomendado é de 8 a 10 por piquete.`);
  }
  if (a.cvPct > CV_ALTO) {
    lista.push(`Os pontos variaram bastante (${fmt(a.cvPct)}%). Colete mais pontos ou avalie as manchas do piquete separadamente.`);
  }
  if (r.msOrigem === "referencia") {
    lista.push(`Matéria seca estimada em ${fmt(MS_PADRAO)}%. Meça no micro-ondas: esse valor muda bastante o resultado.`);
  }
  if (r.diasOcupacao !== null && r.diasOcupacao < 1) {
    lista.push("A forragem útil dura menos de um dia para este lote. Reduza os animais ou use uma área maior.");
  }
  if (r.diasOcupacao !== null && r.diasOcupacao > OCUPACAO_CUIDADO) {
    lista.push(`Ocupação acima de ${OCUPACAO_CUIDADO} dias: o gado pode voltar a comer a rebrota. Avalie dividir o piquete ou aumentar o lote.`);
  }
  return lista.map((t) => `<p class="aviso atencao">${t}</p>`).join("");
}

function renderizarResultado(r, fazenda, piquete) {
  const comLote = r.diasOcupacao !== null;
  const dias = comLote ? fmt(r.diasOcupacao, 1) : "";
  return `
    <h2>Capacidade de suporte</h2>
    <p class="sub">${[fazenda, piquete].filter(Boolean).map(escapar).concat(`${fmt(r.areaHa, 2)} ha`).join(" · ")}</p>
    <p class="destaque">${
      comLote
        ? `<b>${dias} dias</b><span>de ocupação deste piquete com o lote informado</span>`
        : `<b>${fmt(r.capacidadeUaHa, 1)} UA/ha</b><span>de capacidade de suporte no ciclo de ${fmt(r.cicloDias)} dias</span>`
    }</p>
    <div class="indicadores">
      <div class="indicador"><b>${fmt(r.capacidadeUaHa, 1)}</b><span>UA/ha de capacidade de suporte</span></div>
      <div class="indicador"><b>${fmt(r.msKgHa)}</b><span>kg de MS/ha no pasto</span></div>
      <div class="indicador"><b>${fmt(r.utilKgHa)}</b><span>kg de MS/ha aproveitáveis</span></div>
    </div>
    ${avisos(r)}
    ${renderizarForragem(r)}
    ${comLote ? renderizarLotes(r) : ""}
    ${renderizarCenarios(r)}
    <h3>Rotação</h3>
    <table><tbody>
      <tr><td>Descanso + ocupação</td><td>${fmt(r.descansoDias)} + ${fmt(r.ocupacaoBase, 1)} = ${fmt(r.cicloDias, 1)} dias</td></tr>
      <tr><td>Piquetes deste tamanho para a rotação</td><td>${fmt(r.piquetes)}</td></tr>
      <tr><td>Área total da rotação</td><td>${fmt(r.areaModuloHa, 2)} ha</td></tr>
    </tbody></table>
    <p class="nota">A capacidade considera 1 UA = ${KG_UA} kg, consumindo ${fmt(CONSUMO_UA_PCT, 1)}% do peso em MS só de pasto, e não
      soma o capim que cresce durante a ocupação. O aproveitamento é uma referência de manejo: ajuste pelo que você observa na saída.
      Consumo de referência baseado na NASEM (leite, 2021; corte, 2016), para pasto de qualidade média: troque pelo valor da fazenda quando tiver.</p>`;
}

function renderizarForragem(r) {
  const linhas = [
    ["Peso verde médio", `${fmt(r.amostras.media, 2)} kg/m²`],
    ["Forragem verde", `${fmt(r.verdeKgHa)} kg/ha`],
    [`Matéria seca (${fmt(r.msPct, 1)}%)`, `${fmt(r.msKgHa)} kg MS/ha`],
    [`Aproveitamento (${fmt(r.aproveitamentoPct)}%)`, `${fmt(r.utilKgHa)} kg MS/ha`],
    [`Forragem aproveitável em ${fmt(r.areaHa, 2)} ha`, `<b>${fmt(r.utilPiqueteKg)} kg MS</b>`],
  ];
  return `
    <h3>Da amostra à forragem aproveitável</h3>
    <table><tbody>${linhas.map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join("")}</tbody></table>`;
}

function renderizarLotes(r) {
  const linhas = r.lotes
    .map((l) => `<tr>
        <td>${escapar(l.nome)}<span class="decimal">${fmt(l.animais)} × ${fmt(l.pesoKg)} kg</span></td>
        <td>${fmt(l.ua, 1)}</td>
        <td>${fmt(l.consumoAnimalKg, 1)}</td>
        <td>${fmt(l.consumoDiaKg)}</td>
      </tr>`)
    .join("");
  return `
    <h3>Consumo do lote</h3>
    <table>
      <thead><tr><th>Categoria</th><th>UA</th><th>kg MS de pasto/animal/dia</th><th>kg MS/dia</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td>Total</td><td>${fmt(r.uaLote, 1)}</td><td></td><td>${fmt(r.consumoDiaKg)}</td></tr></tfoot>
    </table>`;
}

function renderizarCenarios(r) {
  const linhas = r.cenarios
    .map((c) => `<tr><td>${fmt(c.dias)} ${c.dias === 1 ? "dia" : "dias"}</td><td>${fmt(c.ua, 1)}</td><td>${fmt(c.uaHa, 1)}</td></tr>`)
    .join("");
  return `
    <h3>Quanto gado cabe neste piquete</h3>
    <table>
      <thead><tr><th>Ocupação</th><th>UA no piquete</th><th>UA/ha</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

function renderizarPremissas(r, piquete) {
  const origemMs = { "micro-ondas": "medida no micro-ondas", informada: "informada", referencia: "referência" }[r.msOrigem];
  const linhas = [
    ["Piquete", `${piquete ? `${escapar(piquete)} · ` : ""}${fmt(r.areaHa, 2)} ha`],
    ["Coleta", `${fmt(r.amostras.pontos)} ${r.amostras.pontos === 1 ? "ponto" : "pontos"} de 1 m² · corte ${CORTES[r.corte].nome.toLowerCase()}`],
    ["Matéria seca", `${fmt(r.msPct, 1)}% (${origemMs})`],
    ["Aproveitamento", `${fmt(r.aproveitamentoPct)}%`],
    ["Descanso", `${fmt(r.descansoDias)} dias`],
    ["Unidade animal", `${KG_UA} kg · consumo de ${fmt(CONSUMO_UA_PCT, 1)}% do peso em MS`],
    ...r.lotes.map((l) => [
      l.nome,
      `${fmt(l.animais)} animais · ${fmt(l.pesoKg)} kg${l.leiteKg === null ? "" : ` · ${fmt(l.leiteKg, 1)} kg de leite/dia`} · consumo de ${fmt(l.consumoPct, 1)}% do peso · ${fmt(l.pastoPct)}% vindo do pasto`,
    ]),
  ];
  return premissasRelatorio(linhas);
}

ativarPdf(resultado, () => ["Capacidade de suporte", form.elements.fazenda.value.trim()], "capacidade-suporte");

form.elements.msPct.placeholder = MS_PADRAO;
form.elements.descansoDias.placeholder = DESCANSO_PADRAO;
form.elements.ocupacaoDias.placeholder = OCUPACAO_PADRAO;
restaurar();
