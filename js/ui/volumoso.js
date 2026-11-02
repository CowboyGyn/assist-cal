// Módulo "Volumoso para a seca": rebanho por categoria, volumosos do cocho e resultado.
import {
  calcularVolumosoSeca,
  mesesDaSeca,
  lotesDoRebanho,
  kgVolumosoPadrao,
  CATEGORIAS,
  VOLUMOSOS,
  NOMES_MESES,
  SECA_PADRAO,
} from "../calc/volumoso.js";
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
  lerUltimoRebanho,
  lerUltimoSilo,
} from "./comum.js";

const CHAVE_STORAGE = "ateg-cal:volumoso-seca";
const CAMPOS_LOTE = ["tipo", "animais", "pesoKg", "kgMSDia"];
const CAMPOS_VOLUMOSO = ["tipo", "participacaoPct", "estoqueT", "msPct", "produtividadeT", "perdasPct", "custoT"];

const form = $("formVolumoso");
const erro = $("erroVolumoso");
const resultado = $("resultadoVolumoso");
const listaLotes = $("listaLotes");
const listaVolumosos = $("listaVolumosos");

const reais = (v, casas = 0) => `R$ ${fmt(v, casas)}`;
const toneladas = (v) => fmt(v, v > 0 && v < 10 ? 1 : 0);

// ---------- Formulário: meses ----------

function preencherMeses() {
  form.elements.mesInicio.replaceChildren(...NOMES_MESES.map((m, i) => new Option(m, i)));
  form.elements.mesInicio.value = SECA_PADRAO.mesInicio;
}

const diasInformados = () => numero(form.elements.diasSeca.value) ?? SECA_PADRAO.dias;

// Mostra o período: "1º de maio a 26 de novembro".
function atualizarDias() {
  const dias = diasInformados();
  if (!(dias >= 30 && dias <= 365)) {
    $("diasSeca").textContent = "Informe de 30 a 365 dias.";
    return;
  }
  const meses = mesesDaSeca(Number(form.elements.mesInicio.value), dias);
  $("diasSeca").textContent = `De 1º de ${meses[0].nome.toLowerCase()} a ${meses.at(-1).dias} de ${meses.at(-1).nome.toLowerCase()}`;
}

// ---------- Itens (categorias e volumosos) ----------

function opcoesCategorias() {
  const grupos = new Map();
  for (const [tipo, c] of Object.entries(CATEGORIAS)) {
    if (!grupos.has(c.grupo)) grupos.set(c.grupo, document.createElement("optgroup"));
    grupos.get(c.grupo).label = c.grupo;
    grupos.get(c.grupo).append(new Option(c.nome, tipo));
  }
  return [...grupos.values()];
}

// Placeholders mostram a referência da categoria (e o consumo para o peso digitado).
function atualizarLote(item) {
  const campo = (n) => item.querySelector(`[data-campo="${n}"]`);
  const tipo = campo("tipo").value;
  const peso = numero(campo("pesoKg").value) ?? CATEGORIAS[tipo].pesoKg;
  campo("pesoKg").placeholder = CATEGORIAS[tipo].pesoKg;
  campo("kgMSDia").placeholder = Number.isFinite(peso) ? fmt(kgVolumosoPadrao(tipo, peso), 1) : "";
}

function atualizarVolumoso(item) {
  const ref = VOLUMOSOS[item.querySelector('[data-campo="tipo"]').value];
  for (const n of ["msPct", "produtividadeT", "perdasPct", "custoT"]) {
    item.querySelector(`[data-campo="${n}"]`).placeholder = fmt(ref[n]);
  }
}

function novoItem(modelo, lista, campos, dados, aoMudar) {
  const item = $(modelo).content.firstElementChild.cloneNode(true);
  const tipo = item.querySelector('[data-campo="tipo"]');
  if (modelo === "modeloLote") tipo.replaceChildren(...opcoesCategorias());
  else tipo.replaceChildren(...Object.entries(VOLUMOSOS).map(([t, v]) => new Option(v.nome, t)));
  for (const n of campos) {
    const v = dados[n];
    if (v !== undefined && v !== null) item.querySelector(`[data-campo="${n}"]`).value = v;
  }
  item.addEventListener("input", () => aoMudar(item));
  item.addEventListener("change", () => aoMudar(item));
  item.querySelector(".remover").addEventListener("click", () => item.remove());
  lista.append(item);
  aoMudar(item);
  return item;
}

const novoLote = (dados = {}) => novoItem("modeloLote", listaLotes, CAMPOS_LOTE, dados, atualizarLote);
const novoVolumoso = (dados = {}) => novoItem("modeloVolumoso", listaVolumosos, CAMPOS_VOLUMOSO, dados, atualizarVolumoso);

function lerItens(lista, campos) {
  return [...lista.children].map((item) => {
    const dados = {};
    for (const n of campos) {
      const valor = item.querySelector(`[data-campo="${n}"]`).value;
      dados[n] = n === "tipo" ? valor : valor.trim();
    }
    return dados;
  });
}

$("btnAddLote").addEventListener("click", () => {
  novoLote().querySelector('[data-campo="animais"]').focus();
});

$("btnAddVolumoso").addEventListener("click", () => {
  const usados = new Set(lerItens(listaVolumosos, ["tipo"]).map((v) => v.tipo));
  const livre = Object.keys(VOLUMOSOS).find((t) => !usados.has(t));
  if (livre) novoVolumoso({ tipo: livre });
});

// ---------- Trazer do Rebanho ideal ----------

function atualizarBotoesImportar() {
  for (const [origem, id] of [["leite", "btnImportarLeite"], ["corte", "btnImportarCorte"]]) {
    const dados = lerUltimoRebanho(origem);
    $(id).disabled = !dados;
    $(id).title = dados
      ? `Último cálculo${dados.fazenda ? ` (${dados.fazenda})` : ""} em ${dados.data}`
      : `Calcule antes o Rebanho ideal — ${origem}`;
  }
  const silo = lerUltimoSilo();
  $("btnImportarSilo").disabled = !silo;
  $("btnImportarSilo").title = silo
    ? `Último cálculo${silo.silo ? ` (${silo.silo})` : ""} em ${silo.data}`
    : "Calcule antes o Estoque de silagem";
}

// Põe o estoque do silo na silagem do mesmo tipo, criando a linha se ela não existir.
function importarSilo() {
  const silo = lerUltimoSilo();
  if (!silo || !VOLUMOSOS[silo.silagem]) return;
  const item = [...listaVolumosos.children].find((i) => i.querySelector('[data-campo="tipo"]').value === silo.silagem)
    ?? novoVolumoso({ tipo: silo.silagem });
  item.querySelector('[data-campo="estoqueT"]').value = Math.round(silo.estoqueT * 10) / 10;
  if (silo.msPct) item.querySelector('[data-campo="msPct"]').value = Math.round(silo.msPct * 10) / 10;
  if (!form.elements.fazenda.value && silo.fazenda) form.elements.fazenda.value = silo.fazenda;
  const nome = VOLUMOSOS[silo.silagem].nome.toLowerCase();
  $("notaImportarSilo").textContent = `Trazido${silo.silo ? ` (${silo.silo})` : ""}: ${fmt(silo.estoqueT, 1)} t de ${nome}, `
    + `calculado em ${silo.data}. Aqui valem as perdas do Volumoso. Se tiver mais de um silo, some as toneladas.`;
  $("notaImportarSilo").hidden = false;
}

$("btnImportarSilo").addEventListener("click", importarSilo);

function importar(origem) {
  const dados = lerUltimoRebanho(origem);
  if (!dados) return;
  listaLotes.replaceChildren();
  for (const l of lotesDoRebanho(origem, dados.categorias, dados.fase)) novoLote(l);
  if (!form.elements.fazenda.value && dados.fazenda) form.elements.fazenda.value = dados.fazenda;
}

$("btnImportarLeite").addEventListener("click", () => importar("leite"));
$("btnImportarCorte").addEventListener("click", () => importar("corte"));

// ---------- Salvar e restaurar ----------

function estadoAtual() {
  return {
    fazenda: form.elements.fazenda.value,
    mesInicio: form.elements.mesInicio.value,
    diasSeca: form.elements.diasSeca.value,
    pastoPct: form.elements.pastoPct.value,
    lotes: lerItens(listaLotes, CAMPOS_LOTE),
    volumosos: lerItens(listaVolumosos, CAMPOS_VOLUMOSO),
  };
}

function salvar() {
  try {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(estadoAtual()));
  } catch {
    // Sem armazenamento: segue sem lembrar os dados.
  }
}

function iniciarListas(estado) {
  listaLotes.replaceChildren();
  listaVolumosos.replaceChildren();
  const lotes = estado?.lotes?.length ? estado.lotes : [{ tipo: "vacas-lactacao" }];
  const volumosos = estado?.volumosos?.length ? estado.volumosos : [{ tipo: "silagem-milho" }];
  for (const l of lotes) if (CATEGORIAS[l.tipo]) novoLote(l);
  for (const v of volumosos) if (VOLUMOSOS[v.tipo]) novoVolumoso(v);
}

function restaurar() {
  let estado = null;
  try {
    estado = JSON.parse(localStorage.getItem(CHAVE_STORAGE));
  } catch {
    estado = null;
  }
  if (estado && typeof estado === "object") {
    for (const n of ["fazenda", "mesInicio", "diasSeca", "pastoPct"]) {
      if (typeof estado[n] === "string" && estado[n] !== "") form.elements[n].value = estado[n];
    }
  }
  iniciarListas(estado);
}

// ---------- Cálculo ----------

function mostrarErro(msg) {
  erro.textContent = msg;
  erro.hidden = false;
  resultado.hidden = true;
}

form.addEventListener("input", (e) => {
  if (e.target.name === "mesInicio" || e.target.name === "diasSeca") atualizarDias();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  erro.hidden = true;
  const estado = estadoAtual();
  const entrada = {
    mesInicio: Number(estado.mesInicio),
    diasSeca: diasInformados(),
    pastoPct: numero(estado.pastoPct) ?? 0,
    lotes: estado.lotes.map((l) => ({ tipo: l.tipo, animais: numero(l.animais), pesoKg: numero(l.pesoKg), kgMSDia: numero(l.kgMSDia) })),
    volumosos: estado.volumosos.map((v) => {
      const dados = { tipo: v.tipo };
      for (const n of CAMPOS_VOLUMOSO.slice(1)) dados[n] = numero(v[n]);
      return dados;
    }),
  };
  let r;
  try {
    r = calcularVolumosoSeca(entrada);
  } catch (err) {
    mostrarErro(err.message);
    return;
  }
  salvar();
  avisarUso("volumoso-seca", "calcular");
  const fazenda = estado.fazenda.trim();
  resultado.innerHTML =
    cabecalhoRelatorio("Volumoso para a seca", fazenda) +
    renderizarResultado(r, fazenda) +
    renderizarPremissas(r) +
    rodapeRelatorio() +
    botaoPdf();
  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("btnLimparVolumoso").addEventListener("click", () => {
  form.reset();
  form.elements.mesInicio.value = SECA_PADRAO.mesInicio;
  atualizarDias();
  iniciarListas(null);
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

const periodo = (r) =>
  `${r.dias} dias: 1º de ${r.meses[0].nome.toLowerCase()} a ${r.meses.at(-1).dias} de ${r.meses.at(-1).nome.toLowerCase()}`;

function renderizarResultado(r, fazenda) {
  const necessarioTotal = r.volumosos.reduce((s, v) => s + v.tMNNecessaria, 0);
  const cobertoEstoque = r.volumosos.reduce((s, v) => s + Math.min(v.estoqueT, v.tMNNecessaria), 0);
  const kgMedio = (r.tMSVolumoso * 1000) / (r.animais * r.dias);

  const linhasCategorias = r.categorias
    .map(
      (c) => `<tr>
        <td>${escapar(c.nome)}<span class="decimal">${fmt(c.pesoKg)} kg</span></td>
        <td>${fmt(c.animais)}</td>
        <td>${fmt(c.kgMSDia, 1)}</td>
        <td>${fmt(c.tMSSeca, 1)}</td>
      </tr>`,
    )
    .join("");

  return `
    <h2>Volumoso para a seca</h2>
    <p class="sub">${[fazenda ? escapar(fazenda) : null, periodo(r)].filter(Boolean).join(" · ")}</p>
    <p class="destaque"><b>${toneladas(necessarioTotal)} t</b><span>de volumoso para a seca (matéria natural, com perdas)</span></p>
    <div class="indicadores">
      <div class="indicador"><b>${fmt(r.tMSCocho, 1)} t</b><span>de matéria seca no cocho</span></div>
      <div class="indicador"><b>${fmt(r.areaHa, 1)} ha</b><span>a plantar para o que falta</span></div>
      <div class="indicador"><b>${fmt((cobertoEstoque / necessarioTotal) * 100, 0)}%</b><span>coberto pelo estoque atual</span></div>
      <div class="indicador"><b>${reais(r.custoTotal)}</b><span>custo do volumoso da seca</span></div>
      <div class="indicador"><b>${reais(r.custoAnimalDia, 2)}</b><span>por animal por dia</span></div>
      <div class="indicador"><b>${fmt(kgMedio, 1)} kg</b><span>MS de volumoso por animal/dia (média)</span></div>
    </div>
    ${renderizarAvisos(r)}
    <h3>Rebanho</h3>
    <table>
      <thead><tr><th>Categoria</th><th>Animais</th><th>kg MS/dia</th><th>t MS seca</th></tr></thead>
      <tbody>${linhasCategorias}</tbody>
      <tfoot><tr><td>Total</td><td>${fmt(r.animais)}</td><td></td><td>${fmt(r.tMSVolumoso, 1)}</td></tr></tfoot>
    </table>
    ${r.pastoPct > 0 ? `<p class="nota">O pasto fornece ${fmt(r.pastoPct)}% (${fmt(r.tMSPasto, 1)} t MS); o cocho, ${fmt(r.tMSCocho, 1)} t MS.</p>` : ""}
    <h3>Volumosos</h3>
    ${r.volumosos.map(renderizarVolumoso).join("")}
    ${renderizarMensal(r)}
    <p class="nota">Rebanho constante durante a seca. Toneladas de matéria natural (MN); o necessário inclui as
      perdas da colheita ao cocho. O comprimento do silo é para a seca toda: pode ser dividido em mais de um silo,
      abrindo um de cada vez.</p>`;
}

function renderizarVolumoso(v) {
  const linhas = [
    ["Fornecido no cocho", `${toneladas(v.tMNFornecida)} t`],
    ["Necessário produzir/armazenar (com perdas)", `${toneladas(v.tMNNecessaria)} t`],
    ["Estoque atual", `${toneladas(v.estoqueT)} t`],
    v.faltaT > 0 ? ["Falta", `<b>${toneladas(v.faltaT)} t</b>`] : ["Sobra", `${toneladas(v.sobraT)} t`],
    ["Área a plantar", `<b>${fmt(v.areaHa, 1)} ha</b>`],
    ["Consumo por dia", `${fmt(v.diarioMN * 1000, 0)} kg`],
    ["Custo do volumoso da seca", reais(v.custoTotal)],
  ];
  if (v.faltaT > 0 && v.estoqueT > 0) linhas.push(["Custo para produzir o que falta", reais(v.custoFalta)]);
  if (v.silo) {
    const s = v.silo;
    linhas.push(
      ["Volume de silo", `${fmt(s.volumeM3, 0)} m³`],
      ["Silo sugerido (largura × altura × comprimento)",
        `${fmt(s.larguraM, 1)} × ${fmt(s.alturaM, 1)} × ${fmt(s.comprimentoM, 0)} m`],
    );
  }
  return `
    <h4>${escapar(v.nome)} <small>· ${fmt(v.participacaoPct, 0)}% da MS do cocho</small></h4>
    <table><tbody>${linhas.map(([n, val]) => `<tr><td>${n}</td><td>${val}</td></tr>`).join("")}</tbody></table>`;
}

function renderizarAvisos(r) {
  const avisos = [];
  for (const v of r.volumosos) {
    const nome = v.nome.toLowerCase();
    if (v.faltaT > 0.05) {
      avisos.push(`<p class="aviso atencao">Faltam ${toneladas(v.faltaT)} t de ${escapar(nome)}: plante cerca de
        ${fmt(v.areaHa, 1)} ha${v.acabaEm ? `; o estoque atual acaba em ${v.acabaEm.toLowerCase()}` : ""}.</p>`);
    } else if (v.estoqueT > 0) {
      avisos.push(`<p class="aviso ok">O estoque de ${escapar(nome)} cobre a seca toda e sobram ${toneladas(v.sobraT)} t.</p>`);
    }
    if (v.silo && v.silo.larguraM < 2.5) {
      avisos.push(`<p class="aviso atencao">Silo de ${escapar(nome)} com painel estreito (${fmt(v.silo.larguraM, 1)} m):
        para retirar 25 cm por dia, prefira silo-bolsa (bag) ou um silo de superfície menor.</p>`);
    }
  }
  return avisos.join("");
}

function renderizarMensal(r) {
  const temEstoque = r.estoqueT > 0;
  const abrev = (nome) => nome.slice(0, 3);
  const grafico = graficoBarras({
    valores: r.meses.map((m) => m.consumoT),
    rotulos: r.meses.map((m) => abrev(m.nome)),
    cor: "var(--cat-novilhas2)",
    formatar: (v) => toneladas(v),
    dicas: r.meses.map((m) => `${m.nome}: ${toneladas(m.consumoT)} t de volumoso no cocho`),
    descricao: "Consumo de volumoso no cocho por mês, em toneladas de matéria natural",
  });
  const linhas = r.meses
    .map(
      (m) => `<tr><td>${m.nome}</td><td>${m.dias}</td><td>${toneladas(m.consumoT)}</td>
        ${temEstoque ? `<td>${toneladas(m.estoqueFimT)}</td>` : ""}</tr>`,
    )
    .join("");
  return `
    <h3>Mês a mês (t de volumoso no cocho)</h3>
    ${grafico}
    <table>
      <thead><tr><th>Mês</th><th>Dias</th><th>Consumo (t)</th>${temEstoque ? "<th>Estoque no fim (t)</th>" : ""}</tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td>Total</td><td>${r.dias}</td><td>${toneladas(r.tMNFornecida)}</td>${temEstoque ? "<td></td>" : ""}</tr></tfoot>
    </table>`;
}

function renderizarPremissas(r) {
  const linhas = [
    ["Período da seca", periodo(r)],
    ["Volumoso que vem do pasto", `${fmt(r.pastoPct)}%`],
    ...r.categorias.map((c) => [`${c.nome}`, `${fmt(c.animais)} animais · ${fmt(c.pesoKg)} kg · ${fmt(c.kgMSDia, 1)} kg MS/dia`]),
    ...r.volumosos.map((v) => [
      v.nome,
      `${fmt(v.participacaoPct, 0)}% · MS ${fmt(v.msPct, 1)}% · ${fmt(v.produtividadeT, 1)} t/ha · perdas ${fmt(v.perdasPct, 1)}% · ${reais(v.custoT)}/t`,
    ]),
    ["Silo", "Fatia mínima de 25 cm por dia; densidade de 550 a 600 kg/m³"],
  ];
  return premissasRelatorio(linhas);
}

ativarDicas(resultado);
ativarPdf(resultado, () => ["Volumoso seca", form.elements.fazenda.value.trim()], "volumoso-seca");

preencherMeses();
restaurar();
atualizarDias();
atualizarBotoesImportar();
// O Rebanho ideal pode ser calculado depois de abrir este módulo.
window.addEventListener("hashchange", atualizarBotoesImportar);
