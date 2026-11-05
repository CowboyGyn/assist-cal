// Módulo "Rebanho ideal — leite": formulário, cálculo e resultado.
import {
  calcularPadraoAteg,
  calcularPorIndices,
  INDICES_PADRAO,
  PESOS_PADRAO,
} from "../calc/rebanho.js";
import {
  $,
  fmt,
  fmtAnimais,
  inteiroComDecimal,
  escapar,
  lerNumero as lerCampo,
  salvarFormulario,
  restaurarFormulario,
  esquecerFormulario,
  cabecalhoRelatorio,
  premissasRelatorio,
  rodapeRelatorio,
  botaoPdf,
  ativarPdf,
  ativarDicas,
  avisarUso,
  guardarUltimoRebanho,
} from "./comum.js";

const CHAVE_STORAGE = "ateg-cal:rebanho-leite";

const form = $("formRebanho");
const blocoIndices = $("blocoIndices");
const erro = $("erroRebanho");
const resultado = $("resultadoRebanho");

const CAMPOS_PESO = {
  pesoVaca: "vaca",
  pesoBezerra: "bezerra",
  pesoNovilhaAte24: "novilhaAte24",
  pesoNovilhaAcima24: "novilhaAcima24",
};

const lerNumero = (nome, padrao) => lerCampo(form, nome, padrao);

// Mostra os valores padrão como placeholder: campo vazio usa o padrão.
function preencherPlaceholders() {
  for (const [nome, valor] of Object.entries(INDICES_PADRAO)) {
    const campo = form.elements[nome];
    if (campo && campo.tagName === "INPUT") campo.placeholder = fmt(valor, Number.isInteger(valor) ? 0 : 1);
  }
  for (const [nome, chave] of Object.entries(CAMPOS_PESO)) {
    form.elements[nome].placeholder = PESOS_PADRAO[chave];
  }
}

function modoAtual() {
  return form.elements.modo.value;
}

function atualizarModo() {
  blocoIndices.hidden = modoAtual() !== "indices";
}

function lerEntrada() {
  const pesos = {};
  for (const [nome, chave] of Object.entries(CAMPOS_PESO)) {
    pesos[chave] = lerNumero(nome, PESOS_PADRAO[chave]);
  }
  const indices = { recria: form.elements.recria.value };
  for (const nome of Object.keys(INDICES_PADRAO)) {
    if (nome !== "recria") indices[nome] = lerNumero(nome, INDICES_PADRAO[nome]);
  }
  return {
    fazenda: form.elements.fazenda.value.trim(),
    vacas: lerNumero("vacas", Number.NaN),
    modo: modoAtual(),
    indices,
    pesos,
  };
}

function mostrarErro(msg) {
  erro.textContent = msg;
  erro.hidden = false;
  resultado.hidden = true;
}

form.addEventListener("change", (e) => {
  if (e.target.name === "modo") atualizarModo();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  erro.hidden = true;
  const entrada = lerEntrada();
  if (!Number.isFinite(entrada.vacas)) {
    mostrarErro("Informe o número de vacas em lactação.");
    form.elements.vacas.focus();
    return;
  }
  let r;
  try {
    r =
      entrada.modo === "indices"
        ? calcularPorIndices(entrada.vacas, entrada.indices, entrada.pesos)
        : calcularPadraoAteg(entrada.vacas, entrada.pesos);
  } catch (err) {
    mostrarErro(err.message);
    return;
  }
  salvarFormulario(form, CHAVE_STORAGE);
  avisarUso("rebanho-leite", "calcular");
  guardarUltimoRebanho("leite", entrada.fazenda, r);
  resultado.innerHTML =
    cabecalhoRelatorio("Rebanho ideal (leite)", entrada.fazenda) +
    renderizarResultado(r, entrada.fazenda) +
    renderizarPremissas(r, entrada.pesos) +
    rodapeRelatorio() +
    botaoPdf();
  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("btnLimpar").addEventListener("click", () => {
  form.reset();
  atualizarModo();
  erro.hidden = true;
  resultado.hidden = true;
  resultado.innerHTML = "";
  esquecerFormulario(CHAVE_STORAGE);
});

function renderizarPremissas(r, pesos) {
  const linhas = [];
  if (r.modo === "indices") {
    const ix = r.premissas;
    linhas.push(
      ["Intervalo entre partos", `${fmt(ix.iepMeses, 1)} meses`],
      ["Período seco", `${fmt(ix.periodoSecoDias)} dias`],
      ["Idade ao 1º parto", `${fmt(ix.idadePrimeiroPartoMeses)} meses`],
      ["Descarte anual de vacas", `${fmt(ix.descarteAnualPct, 1)}%`],
      ["Mortalidade de bezerras", `${fmt(ix.mortBezerrasPct, 1)}%/ano`],
      ["Mortalidade de novilhas", `${fmt(ix.mortNovilhasPct, 1)}%/ano`],
      ["Fêmeas nos nascimentos", `${fmt(ix.femeasNascimentosPct)}%`],
      ["Recria", ix.recria === "todas" ? "Todas as fêmeas nascidas" : "Só a reposição necessária"],
    );
  } else {
    linhas.push(["Proporções", "55% lactação · 9% secas · 16% novilhas · 20% bezerras"]);
  }
  linhas.push(
    ["Pesos (vaca / bezerra / novilha até 24 m / acima 24 m)",
      `${fmt(pesos.vaca)} / ${fmt(pesos.bezerra)} / ${fmt(pesos.novilhaAte24)} / ${fmt(pesos.novilhaAcima24)} kg`],
  );
  return premissasRelatorio(linhas);
}

// A cor acompanha a categoria (não a posição); "novilhas" do padrão Assist = 12–24 meses.
const corCategoria = (id) => `var(--cat-${id === "novilhas" ? "novilhas1" : id})`;

function renderizarComposicao(r) {
  const pct = (c) => (c.quantidade / r.total) * 100;
  const segmentos = r.categorias
    .map(
      (c) =>
        `<span style="flex:${c.quantidade};background:${corCategoria(c.id)}"
          data-dica="${escapar(c.nome)}: ${fmt(c.inteiro)} animais (${fmt(pct(c), 0)}%)"></span>`,
    )
    .join("");
  const legenda = r.categorias
    .map(
      (c) =>
        `<li><i style="background:${corCategoria(c.id)}"></i>${escapar(c.nome)}<b>${fmt(pct(c), 0)}%</b></li>`,
    )
    .join("");
  return `
    <div class="composicao" role="img" aria-label="Composição do rebanho por categoria">${segmentos}</div>
    <ul class="legenda">${legenda}</ul>`;
}

function renderizarResultado(r, fazenda) {
  const linhas = r.categorias
    .map(
      (c) => `
        <tr>
          <td><span class="ponto" style="background:${corCategoria(c.id)}"></span>${escapar(c.nome)}</td>
          <td>${fmt(c.inteiro)}<span class="decimal">${fmt(c.quantidade, 1)}</span></td>
          <td>${fmt(c.ua, 1)}</td>
        </tr>`,
    )
    .join("");

  const subtitulo = [
    fazenda ? escapar(fazenda) : null,
    r.modo === "indices" ? "Índices da fazenda" : "Padrão Assist (55/9/16/20)",
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <h2>Rebanho ideal</h2>
    <p class="sub">${subtitulo}</p>
    <p class="destaque"><b>${fmt(r.totalInteiro)}</b><span>animais no total ·${fmt(r.uaTotal, 1)} UA</span></p>
    ${renderizarComposicao(r)}
    <h3>Por categoria</h3>
    <table>
      <thead><tr><th>Categoria</th><th>Animais</th><th>UA</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>${fmt(r.totalInteiro)}<span class="decimal">${fmt(r.total, 1)}</span></td>
          <td>${fmt(r.uaTotal, 1)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="indicadores">
      <div class="indicador"><b>${fmt(r.pctLactacaoVacas, 1)}%</b><span>vacas em lactação / total de vacas</span></div>
      <div class="indicador"><b>${fmt(r.pctLactacaoRebanho, 1)}%</b><span>vacas em lactação / rebanho</span></div>
      <div class="indicador"><b>${fmt(r.uaTotal / r.total, 2)}</b><span>UA por animal (450 kg = 1 UA)</span></div>
    </div>
    ${r.modo === "indices" ? renderizarReposicao(r) : ""}
    <p class="nota">Número de animais arredondado mantendo o total; o número menor mostra o valor calculado.</p>`;
}

function renderizarReposicao(r) {
  const rep = r.reposicao;
  const linhas = [
    ["Partos por ano", rep.partosAno],
    ["Fêmeas nascidas por ano", rep.femeasNascidasAno],
    ["Novilhas necessárias por ano (descarte)", rep.necessariaAno],
    ["Novilhas possíveis por ano (recriando todas)", rep.possivelAno],
  ]
    .map(([nome, v]) => `<tr><td>${nome}</td><td>${inteiroComDecimal(v)}</td></tr>`)
    .join("");

  let aviso;
  if (rep.saldoAno < -0.05) {
    aviso = `<p class="aviso atencao">Déficit de reposição: faltam cerca de ${fmtAnimais(-rep.saldoAno)} por ano
      para repor o descarte. Reveja descarte, mortalidade, IEP ou planeje a compra de animais.</p>`;
  } else if (r.premissas.recria === "reposicao" && rep.femeasNaoRecriadasAno > 0.05) {
    aviso = `<p class="aviso ok">Sobram cerca de ${fmtAnimais(rep.femeasNaoRecriadasAno, "bezerra")} por ano além da
      reposição, para venda.</p>`;
  } else if (r.premissas.recria === "todas" && rep.saldoAno > 0.05) {
    aviso = `<p class="aviso ok">Recriando todas as fêmeas, sobram cerca de ${fmtAnimais(rep.saldoAno)} por ano
      além da reposição, para venda ou crescimento do rebanho.</p>`;
  } else {
    aviso = `<p class="aviso ok">A recria cobre a reposição do rebanho.</p>`;
  }

  return `
    <h3>Reposição</h3>
    <table><tbody>${linhas}</tbody></table>
    ${aviso}`;
}

ativarDicas(resultado);
ativarPdf(resultado, () => ["Rebanho ideal", form.elements.fazenda.value.trim()], "rebanho-leite");

preencherPlaceholders();
restaurarFormulario(form, CHAVE_STORAGE);
atualizarModo();
