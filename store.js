// Armazenamento local do protótipo (localStorage) + máquina de estados do
// fluxo da ATEC. Nada aqui toca em Salesforce.
//
// Modelo: cada ATEC tem flow.macro (macroetapa do path, ver MACRO_STAGES em
// data.js) e flow.step (subpasso dentro dela). Toda mudança passa por uma
// ação em ACOES, que confere o perfil responsável, grava o histórico e move a
// ATEC. Etapas puladas ficam em flow.skipped ("não se aplica" no path).
const STORAGE_KEY = "atec-prototype-store";
const SEQ_KEY = "atec-prototype-seq";
const VERSION_KEY = "atec-prototype-version";
const ROLE_KEY = "atec-prototype-role";
const RODIZIO_KEY = "atec-prototype-rodizio";
const SEQ_COTACAO_KEY = "atec-prototype-seq-cotacao";
const STORE_VERSION = "3"; // v3 = dados reais do portal (empreendimentos, itens e picklists)

// Dados da v1 (fluxo antigo) são incompatíveis: zera e avisa uma vez.
let dadosAntigosApagados = false;
(function migrarVersao() {
  if (localStorage.getItem(VERSION_KEY) === STORE_VERSION) return;
  if (localStorage.getItem(STORAGE_KEY)) dadosAntigosApagados = true;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SEQ_KEY);
  localStorage.removeItem(RODIZIO_KEY);
  localStorage.removeItem(SEQ_COTACAO_KEY);
  localStorage.setItem(VERSION_KEY, STORE_VERSION);
})();

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const store = raw ? JSON.parse(raw) : {};
    Object.values(store).forEach(normalizarAtec);
    return store;
  } catch (e) {
    return {};
  }
}

// Ajusta ATECs gravadas por versões anteriores do protótipo
function normalizarAtec(atec) {
  if (!atec || !atec.flow) return;
  atec.cotacoes = atec.cotacoes || [];
  const r = atec.flow.reparo;
  if (r) {
    r.entrega = r.entrega || { fotos: [], anexos: r.evidencias || [] };
    r.validacoes = r.validacoes || [];
    if (atec.flow.step === "validacaoCliente") atec.flow.step = "acompanhar";
  }
  // a Análise Obra deixou de existir (a ATEC passou a fazer parte da obra)
  if (atec.flow.macro === "analiseObra") {
    atec.flow.macro = "planejamento";
    atec.flow.step = "orcar";
    atec.flow.planejamento = atec.flow.planejamento || { tentativas: 0 };
    if (!atec.flow.visited.includes("planejamento")) atec.flow.visited.push("planejamento");
  }
  atec.flow.visited = atec.flow.visited.filter((k) => k !== "analiseObra");
  atec.flow.skipped = atec.flow.skipped.filter((k) => k !== "analiseObra");
  delete atec.flow.obra;
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    throw new Error("Espaço do navegador esgotado — remova fotos ou use \"Limpar dados de teste\".");
  }
}

function getAllAtecs() {
  const store = readStore();
  return Object.values(store).sort((a, b) => (a.CreatedDate < b.CreatedDate ? 1 : -1));
}

function getAtec(id) {
  const store = readStore();
  return store[id] || null;
}

function saveAtec(atec) {
  const store = readStore();
  store[atec.id] = atec;
  writeStore(store);
  return atec;
}

function nextSequence() {
  const seq = Number(localStorage.getItem(SEQ_KEY) || "0") + 1;
  localStorage.setItem(SEQ_KEY, String(seq));
  return seq;
}

// ---- perfil atual ("Atuando como") ----
function getCurrentRole() {
  return localStorage.getItem(ROLE_KEY) || ROLE_PADRAO;
}

function setCurrentRole(role) {
  localStorage.setItem(ROLE_KEY, role);
}

// ---- relógio (o carregador de exemplos retrocede as datas) ----
let clockOverride = null;
function now() {
  return clockOverride ? new Date(clockOverride) : new Date();
}

// ============================================================================
// Regras de negócio puras
// ============================================================================
function alcadaPara(tabela, valor) {
  return tabela.find((faixa) => valor <= faixa.ate);
}

function getCarteira(empreendimento) {
  const analistas = CARTEIRAS_ANALISTAS[empreendimento];
  return analistas ? { nome: empreendimento, analistas } : CARTEIRA_GERAL;
}

// Rodízio dentro da carteira: guarda o próximo índice de cada carteira
function proximoAnalista(empreendimento) {
  const carteira = getCarteira(empreendimento);
  const ponteiros = JSON.parse(localStorage.getItem(RODIZIO_KEY) || "{}");
  const idx = ponteiros[carteira.nome] || 0;
  ponteiros[carteira.nome] = (idx + 1) % carteira.analistas.length;
  localStorage.setItem(RODIZIO_KEY, JSON.stringify(ponteiros));
  return { analista: carteira.analistas[idx], carteira: carteira.nome };
}

function valorEstimadoAtual(atec) {
  const inv = atec.flow.investigacao;
  if (inv && inv.valorAtualizado != null) return inv.valorAtualizado;
  return atec.flow.vistoria.valorEstimado;
}

// Valor que define a alçada do reparo: o negociado, se houver; senão o orçado
function valorDoReparo(atec) {
  const p = atec.flow.planejamento;
  return p.valorNegociado != null ? p.valorNegociado : p.valorOrcamento;
}

function deriveStatusAtec(flow) {
  if (flow.macro === "finalizada") return "Finalizada";
  if (flow.macro === "negativa") return flow.step === "finalizada" ? "Finalizada – Negativa" : "Em negativa";
  if (flow.macro === "abertura" || flow.macro === "triagem") return "Aberta";
  return "Em andamento";
}

// ============================================================================
// Subpassos: rótulo e perfil(is) responsável(is). label/roles podem ser
// funções da ATEC (aprovações dependem da alçada calculada).
// ============================================================================
const STEPS = {
  "abertura.checklist": { label: "Checklist de abertura", roles: [ROLES.FRONT, ROLES.ANALISTA] },
  "triagem.conferir": { label: "Conferir solicitação e garantia", roles: [ROLES.ANALISTA] },
  "triagem.nivel2": { label: "Análise Nível 02", roles: [ROLES.ANALISTA] },
  "vistoria.registrar": { label: "Vistoria em campo", roles: [ROLES.ANALISTA] },
  "vistoria.termo": { label: "Assinatura do cliente", roles: [ROLES.ANALISTA] },
  "vistoria.nivel2": { label: "Análise Nível 02", roles: [ROLES.ANALISTA] },
  "investigacao.fornecedor": { label: "Fornecedor e custo", roles: [ROLES.ANALISTA] },
  "investigacao.aprovacao": {
    label: (a) => `Aguardando aprovação ${a.flow.investigacao.atual.aprovador}`,
    roles: (a) => [a.flow.investigacao.atual.aprovador]
  },
  "investigacao.reprovada": { label: "Investigação reprovada", roles: [ROLES.ANALISTA] },
  "investigacao.realizar": { label: "Realizar investigação", roles: [ROLES.ANALISTA] },
  "planejamento.orcar": { label: "Orçamento do reparo", roles: [ROLES.ANALISTA] },
  "planejamento.negociacao": { label: "Negociação Suprimentos", roles: [ROLES.SUPRIMENTOS] },
  "aprovacao.ficha": { label: "Ficha de aprovação", roles: [ROLES.ANALISTA] },
  "aprovacao.aprovar": {
    label: (a) => `Aguardando aprovação ${a.flow.aprovacao.aprovador}`,
    roles: (a) => [a.flow.aprovacao.aprovador]
  },
  "reparo.acompanhar": { label: "Realização do reparo", roles: [ROLES.ANALISTA] },
  "reparo.termo": { label: "Termo de entrega — assinatura do cliente", roles: [ROLES.ANALISTA] },
  "reparo.analisarReprovacao": { label: "Analisar reprovação", roles: [ROLES.ANALISTA] },
  "reparo.finalizar": { label: "Finalizar ATEC", roles: [ROLES.ANALISTA] },
  "finalizada.concluida": { label: "Concluída", roles: [] },
  "negativa.escrever": { label: "Escrever devolutiva", roles: [ROLES.ANALISTA] },
  "negativa.aprovar": {
    label: (a) => `Aprovação da devolutiva (${a.flow.negativa.aprovadorAtual})`,
    roles: (a) => [a.flow.negativa.aprovadorAtual]
  },
  "negativa.finalizar": { label: "Finalizar ATEC", roles: [ROLES.FRONT, ROLES.ANALISTA] },
  "negativa.finalizada": { label: "Encerrada", roles: [] }
};

function stepInfo(atec) {
  const def = STEPS[`${atec.flow.macro}.${atec.flow.step}`];
  if (!def) return { label: "-", roles: [] };
  return {
    label: typeof def.label === "function" ? def.label(atec) : def.label,
    roles: typeof def.roles === "function" ? def.roles(atec) : def.roles
  };
}

function etapaAtualTexto(atec) {
  return `${MACRO_LABELS[atec.flow.macro]} · ${stepInfo(atec).label}`;
}

// ============================================================================
// Criação
// ============================================================================
function createAtec(formData, perfil) {
  const seq = nextSequence();
  const created = now().toISOString();

  const atec = {
    id: `ATEC-${seq}`,
    Name: `ATEC-${String(seq).padStart(4, "0")}`,
    CreatedDate: created,
    Cliente: formData.cliente || null,
    Empreendimento: formData.empreendimento || null,
    Unidade: formData.unidade || null,
    Solicitante: formData.solicitante || null,
    Telefone: formData.telefone || null,
    Email: formData.email || null,
    Origem: formData.origem || null,
    CanalAbertura: formData.canalAbertura || null,
    Item: formData.item || null,
    SubItem: formData.subItem || null,
    Ambiente: formData.ambiente || null,
    SubAmbiente: formData.subAmbiente || null,
    Descricao: formData.descricao || null,
    ClienteCritico: !!formData.clienteCritico,
    AnalistaResponsavel: null,
    StatusATEC: "Aberta",
    cotacoes: [], // lista relacionada "Cotações" (componente atecCriarCotacao)

    flow: {
      macro: "abertura",
      step: "checklist",
      visited: ["abertura"],
      skipped: [],
      stageEnteredAt: created,
      history: [],
      valores: [], // trilha de valores: estimado, atualizado, orçado, negociado
      atribuicao: null,
      abertura: { checklistAnswers: {} },
      triagem: {},
      nivel2: null, // { origem, motivo, outroTexto, seguir }
      vistoria: { fotos: [], anexos: [], checklistAnswers: {} },
      investigacao: null,
      planejamento: null,
      aprovacao: null,
      reparo: null,
      negativa: null
    }
  };

  log(atec, perfil || ROLES.FRONT, "ATEC aberta", `Canal: ${atec.CanalAbertura || "-"}`);
  saveAtec(atec);
  return atec;
}

// ============================================================================
// Helpers de transição
// ============================================================================
function log(atec, perfil, acao, detalhe = "") {
  atec.flow.history.push({ em: now().toISOString(), perfil, etapa: etapaAtualTexto(atec), acao, detalhe });
}

function goTo(atec, macro, step) {
  const f = atec.flow;
  if (f.macro !== macro) {
    f.stageEnteredAt = now().toISOString();
    if (!f.visited.includes(macro)) f.visited.push(macro);
    f.skipped = f.skipped.filter((k) => k !== macro);
  }
  f.macro = macro;
  f.step = step;
  atec.StatusATEC = deriveStatusAtec(f);
}

function pular(atec, macro) {
  if (!atec.flow.skipped.includes(macro) && !atec.flow.visited.includes(macro)) atec.flow.skipped.push(macro);
}

function registrarValor(atec, rotulo, valor) {
  atec.flow.valores.push({ rotulo, valor, em: now().toISOString() });
}

function fmtBRL(valor) {
  if (valor == null || isNaN(valor)) return "-";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function novoReparo() {
  return { validacoes: [], entrega: { fotos: [], anexos: [] }, termo: null };
}

// O que o cliente vê e assina no termo de entrega do serviço
function conteudoEntrega(e) {
  return {
    dataInicio: e.dataInicio,
    dataConclusao: e.dataConclusao,
    executadoPor: (e.executadoPor || "").trim(),
    servicoExecutado: (e.servicoExecutado || "").trim(),
    observacoes: (e.observacoes || "").trim(),
    fotos: (e.fotos || []).length
  };
}

// O que o cliente vê e assina no termo de vistoria
function conteudoTermo(v) {
  return { data: v.data, tecnico: v.tecnico, observacoes: (v.observacoes || "").trim(), fotos: (v.fotos || []).length };
}

// ---- Garantia: 5 anos a partir do Habite-se do empreendimento ----
const ANOS_GARANTIA = 5;

function habiteSeDoEmpreendimento(nome) {
  const e = PORTAL.empreendimentos.find((x) => x.nome === nome);
  return e ? e.habiteSe : null;
}

function fmtDiaISO(iso) {
  if (!iso) return "-";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

// { habiteSe, ate, naGarantia } ou null se o empreendimento não tem Habite-se
function garantiaPorHabiteSe(atec) {
  const habiteSe = habiteSeDoEmpreendimento(atec.Empreendimento);
  if (!habiteSe) return null;
  const ate = new Date(`${habiteSe}T00:00:00`);
  ate.setFullYear(ate.getFullYear() + ANOS_GARANTIA);
  const hoje = now();
  hoje.setHours(0, 0, 0, 0);
  const iso = `${ate.getFullYear()}-${String(ate.getMonth() + 1).padStart(2, "0")}-${String(ate.getDate()).padStart(2, "0")}`;
  return { habiteSe, ate: iso, naGarantia: hoje <= ate };
}

// ---- Ficha de aprovação: valores iniciais (o que o sistema já sabe) e validação ----
function fichaInicial(atec) {
  const f = atec.flow;
  const v = f.vistoria || {};
  const cot = cotacaoDoPlanejamento(atec);
  const anterior = f.aprovacao && f.aprovacao.fichaRascunho;
  if (anterior) return JSON.parse(JSON.stringify(anterior));
  const g = f.triagem && f.triagem.habiteSe ? f.triagem : null;
  return {
    origem: "ATEC",
    dataAnalise: now().toISOString().slice(0, 10),
    resumo: [atec.Descricao, v.observacoes].filter(Boolean).join("\n\n"),
    impacto: [],
    garantia: { dentroPrazo: f.triagem && f.triagem.garantia ? f.triagem.garantia : "" },
    prazoAplicavel: `${ANOS_GARANTIA} anos a partir do Habite-se`,
    fundamentacao: g ? `Habite-se em ${fmtDiaISO(g.habiteSe)}; garantia até ${fmtDiaISO(g.garantiaAte)}.` : "",
    liberalidade: f.triagem && f.triagem.garantia === "Não" ? [] : ["NA"],
    justificativa: f.nivel2 && f.nivel2.motivo ? (f.nivel2.motivo === "Outro" ? f.nivel2.outroTexto : f.nivel2.motivo) : "",
    perfilCliente: atec.ClienteCritico ? ["Crítico"] : [],
    maisUnidades: "",
    quantasUnidades: "",
    tecResponsavel: v.tecnico || "",
    tecCargo: "Técnico",
    diagnostico: v.observacoes || "",
    causaRaiz: "",
    solucao: cot ? cot.observacao : "",
    responsabilidadeTecnica: "ATEC",
    tecnica: {},
    orc: { material: null, maoDeObra: null, equipamentos: null, outros: null },
    motivoEscolha: "",
    precoTabelado: "",
    risco: {},
    parecerAT: "",
    engenharia: "Não consultado"
  };
}

function pendenciasFicha(fi) {
  const p = [];
  const vazio = (x) => !(x || "").toString().trim();
  if (vazio(fi.resumo)) p.push("resumo do caso");
  if (!(fi.impacto || []).length) p.push("impacto identificado");
  if (FICHA.garantia.some(([k]) => !(fi.garantia || {})[k])) p.push("análise de garantia (todas as perguntas)");
  if (!(fi.liberalidade || []).length) p.push("motivo de liberalidade (ou NA)");
  if ((fi.liberalidade || []).some((m) => m !== "NA") && vazio(fi.justificativa)) p.push("justificativa da liberalidade");
  if (!fi.maisUnidades) p.push("se o cliente tem mais de 1 unidade");
  if (vazio(fi.diagnostico)) p.push("diagnóstico técnico");
  if (vazio(fi.causaRaiz)) p.push("causa raiz");
  if (vazio(fi.solucao)) p.push("solução técnica recomendada");
  if (FICHA.tecnica.some(([k]) => !(fi.tecnica || {})[k])) p.push("validação técnica (todas as perguntas)");
  if (vazio(fi.motivoEscolha)) p.push("motivo da escolha do fornecedor");
  if (!fi.precoTabelado) p.push("se existe preço tabelado");
  if (FICHA.riscos.some((r) => !(fi.risco || {})[r])) p.push("matriz de risco");
  if (!fi.parecerAT) p.push("parecer da Assistência Técnica");
  return p;
}

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

function iniciarPlanejamento(atec) {
  atec.flow.planejamento = atec.flow.planejamento || { tentativas: 0 };
  goTo(atec, "planejamento", "orcar");
}

function iniciarAprovacaoReparo(atec) {
  const valor = valorDoReparo(atec);
  const alcada = alcadaPara(ALCADAS_REPARO, valor);
  const anteriores = atec.flow.aprovacao ? atec.flow.aprovacao.decisoes : [];
  const fichaAnterior = atec.flow.aprovacao ? atec.flow.aprovacao.ficha || atec.flow.aprovacao.fichaRascunho : null;
  atec.flow.aprovacao = { valor, aprovador: alcada.perfil, faixa: alcada.faixa, decisoes: anteriores, fichaRascunho: fichaAnterior, ficha: null };
  if (APROVADORES_COM_FICHA.includes(alcada.perfil)) {
    goTo(atec, "aprovacao", "ficha");
    log(atec, ROLE_SISTEMA, "Ficha de aprovação necessária", `${fmtBRL(valor)} → ${alcada.perfil} (${alcada.faixa}): preencher a ficha para enviar por e-mail`);
    return;
  }
  goTo(atec, "aprovacao", "aprovar");
  log(atec, ROLE_SISTEMA, "Enviado para aprovação do reparo", `${fmtBRL(valor)} → ${alcada.perfil} (${alcada.faixa})`);
}

function abrirNivel2(atec, origem) {
  atec.flow.nivel2 = { origem, motivo: null, outroTexto: "", seguir: null };
  goTo(atec, origem, "nivel2");
}

function abrirNegativa(atec, perfil, origem, motivo) {
  atec.flow.negativa = {
    origem,
    motivo,
    data: now().toISOString(),
    devolutiva: "",
    aprovadorAtual: null,
    aprovacoes: [],
    reprovacoes: [],
    enviadaEm: null
  };
  goTo(atec, "negativa", "escrever");
  log(atec, perfil, "ATEC encaminhada para Negativa", `Origem: ${origem} · Motivo: ${motivo || "-"}`);
}

// ============================================================================
// Ações (uma por botão das telas). Assinatura: (atec, perfil, dados).
// Lançam Error com mensagem amigável quando falta algo obrigatório.
// ============================================================================
const ACOES = {
  concluirAbertura(atec, perfil, { checklistAnswers }) {
    atec.flow.abertura.checklistAnswers = checklistAnswers;
    log(atec, perfil, "Checklist de abertura concluído");
    const { analista, carteira } = proximoAnalista(atec.Empreendimento);
    atec.AnalistaResponsavel = analista;
    atec.flow.atribuicao = { analista, carteira };
    goTo(atec, "triagem", "conferir");
    log(atec, ROLE_SISTEMA, "Analista atribuído automaticamente", `${analista} (rodízio da carteira ${carteira})`);
  },

  // Garantia pela data do Habite-se do empreendimento: até 5 anos está na
  // garantia; depois disso, vencida. Só sem Habite-se cadastrado o analista informa.
  decidirTriagem(atec, perfil, { garantia: informada, observacao }) {
    const g = garantiaPorHabiteSe(atec);
    const garantia = g ? (g.naGarantia ? "Sim" : "Não") : informada;
    exigir(garantia, "Empreendimento sem data de Habite-se: informe se o item está na garantia.");
    atec.flow.triagem = { garantia, observacao, habiteSe: g ? g.habiteSe : null, garantiaAte: g ? g.ate : null };
    const base = g ? ` (Habite-se ${fmtDiaISO(g.habiteSe)}, garantia até ${fmtDiaISO(g.ate)})` : " (informado pelo analista)";
    log(atec, perfil, "Triagem concluída", `Na garantia: ${garantia}${base}${observacao ? ` · ${observacao}` : ""}`);
    if (garantia === "Sim") goTo(atec, "vistoria", "registrar");
    else abrirNivel2(atec, "triagem");
  },

  // Salvamento parcial da vistoria (não muda de etapa)
  salvarVistoria(atec, perfil, dados) {
    Object.assign(atec.flow.vistoria, dados);
  },

  vistoriaParaNivel2(atec, perfil, dados) {
    Object.assign(atec.flow.vistoria, dados);
    log(atec, perfil, "Vistoria constatou item fora da garantia", "Encaminhada para Análise Nível 02");
    abrirNivel2(atec, "vistoria");
  },

  decidirNivel2(atec, perfil, { motivo, outroTexto, seguir }) {
    exigir(motivo, "Selecione o motivo da Análise Nível 02.");
    exigir(motivo !== "Outro" || (outroTexto || "").trim(), "Descreva o motivo \"Outro\".");
    exigir(seguir, "Informe se a ATEC segue.");
    Object.assign(atec.flow.nivel2, { motivo, outroTexto: motivo === "Outro" ? outroTexto : "", seguir });
    const motivoTexto = motivo === "Outro" ? `Outro: ${outroTexto}` : motivo;
    log(atec, perfil, "Análise Nível 02", `Motivo: ${motivoTexto} · Seguir com a ATEC: ${seguir}`);
    // "Sim" volta para a Vistoria com o que já foi preenchido preservado
    if (seguir === "Sim") goTo(atec, "vistoria", "registrar");
    else abrirNegativa(atec, perfil, "Análise Nível 02", motivoTexto);
  },

  // Registra a vistoria e gera o termo; a etapa só termina com a assinatura
  concluirVistoria(atec, perfil, dados) {
    Object.assign(atec.flow.vistoria, dados);
    const v = atec.flow.vistoria;
    exigir(v.data, "Informe a data da vistoria.");
    exigir(v.tecnico, "Informe o técnico responsável.");
    exigir((v.observacoes || "").trim(), "Registre as observações da vistoria (elas vão para o termo do cliente).");
    exigir(v.valorEstimado != null && v.valorEstimado >= 0, "Informe o valor estimado do reparo.");
    exigir(v.necessarioInvestigacao, "Informe se é necessário investigação.");
    log(atec, perfil, "Vistoria registrada", "Termo gerado para assinatura do cliente");
    goTo(atec, "vistoria", "termo");
  },

  voltarVistoria(atec, perfil) {
    log(atec, perfil, "Termo não assinado", "Voltou para editar a vistoria");
    goTo(atec, "vistoria", "registrar");
  },

  // O cliente confere o termo e assina; a cópia assinada fica guardada
  assinarTermoVistoria(atec, perfil, { nome, assinatura }) {
    exigir(atec.flow.step === "termo", "Gere o termo a partir da vistoria.");
    exigir((nome || "").trim(), "Informe o nome de quem assina.");
    exigir(assinatura, "O cliente precisa assinar o termo.");
    const v = atec.flow.vistoria;
    v.termo = { nome: nome.trim(), assinatura, em: now().toISOString(), ...conteudoTermo(v) };
    log(atec, perfil, "Cliente assinou o termo de vistoria", `Assinado por ${v.termo.nome}`);
    registrarValor(atec, "Estimado na vistoria", v.valorEstimado);
    log(atec, perfil, "Vistoria concluída", `Técnico: ${v.tecnico} · Valor estimado: ${fmtBRL(v.valorEstimado)} · Investigação: ${v.necessarioInvestigacao}`);
    if (v.necessarioInvestigacao === "Sim") {
      atec.flow.investigacao = { tentativas: [], atual: null, fornecedoresReprovados: [] };
      goTo(atec, "investigacao", "fornecedor");
    } else {
      pular(atec, "investigacao");
      iniciarPlanejamento(atec);
    }
  },

  enviarInvestigacao(atec, perfil, { fornecedor, custo }) {
    exigir(fornecedor, "Selecione o fornecedor.");
    exigir(custo != null && custo >= 0, "Informe o custo da investigação (0 se não houver custo).");
    const inv = atec.flow.investigacao;
    if (custo === 0) {
      inv.atual = { fornecedor, custo, aprovador: null, status: "Sem custo" };
      inv.tentativas.push({ ...inv.atual });
      log(atec, perfil, "Investigação sem custo", `${fornecedor} · aprovação dispensada`);
      goTo(atec, "investigacao", "realizar");
      return;
    }
    const alcada = alcadaPara(ALCADAS_INVESTIGACAO, custo);
    inv.atual = { fornecedor, custo, aprovador: alcada.perfil, faixa: alcada.faixa, status: "Aguardando" };
    log(atec, perfil, "Investigação enviada para aprovação", `${fornecedor} · ${fmtBRL(custo)} → ${alcada.perfil} (${alcada.faixa})`);
    goTo(atec, "investigacao", "aprovacao");
  },

  aprovarInvestigacao(atec, perfil, { aprovado, comentario }) {
    exigir(aprovado || (comentario || "").trim(), "Informe o motivo da reprovação.");
    const inv = atec.flow.investigacao;
    inv.atual.status = aprovado ? "Aprovada" : "Reprovada";
    inv.atual.comentario = comentario || "";
    inv.atual.decididoPor = perfil;
    inv.tentativas.push({ ...inv.atual });
    if (aprovado) {
      log(atec, perfil, "Custo da investigação aprovado", `${inv.atual.fornecedor} · ${fmtBRL(inv.atual.custo)}`);
      goTo(atec, "investigacao", "realizar");
    } else {
      inv.fornecedoresReprovados.push(inv.atual.fornecedor);
      log(atec, perfil, "Investigação reprovada", `Fornecedor ${inv.atual.fornecedor} reprovado por ${perfil}: ${comentario}`);
      goTo(atec, "investigacao", "reprovada");
    }
  },

  decidirReprovacaoInvestigacao(atec, perfil, { acao, motivo }) {
    exigir(acao, "Escolha como seguir.");
    if (acao === "outroFornecedor") {
      exigir(FORNECEDORES_MOCK.some((f) => !atec.flow.investigacao.fornecedoresReprovados.includes(f)), "Não há outro fornecedor disponível no cadastro.");
      log(atec, perfil, "Orçar com outro fornecedor");
      goTo(atec, "investigacao", "fornecedor");
    } else {
      exigir((motivo || "").trim(), "Informe o motivo da negativa.");
      abrirNegativa(atec, perfil, "Investigação", motivo);
    }
  },

  concluirInvestigacao(atec, perfil, { laudo, anexos, valorAtualizado, seguir }) {
    exigir((laudo || "").trim(), "Registre o laudo da investigação.");
    exigir(seguir, "Informe se a ATEC segue.");
    const inv = atec.flow.investigacao;
    Object.assign(inv, { laudo, anexos: anexos || [], seguir });
    if (valorAtualizado != null) {
      inv.valorAtualizado = valorAtualizado;
      registrarValor(atec, "Atualizado na investigação", valorAtualizado);
    }
    log(atec, perfil, "Investigação realizada", `Seguir com a ATEC: ${seguir}${valorAtualizado != null ? ` · Valor atualizado: ${fmtBRL(valorAtualizado)}` : ""}`);
    if (seguir === "Sim") iniciarPlanejamento(atec);
    else abrirNegativa(atec, perfil, "Investigação", laudo);
  },

  // Ficha Corporativa de Aprovação: rascunho e envio por e-mail ao aprovador
  salvarFicha(atec, perfil, ficha) {
    atec.flow.aprovacao.fichaRascunho = ficha;
  },

  enviarFichaAprovacao(atec, perfil, ficha) {
    exigir(atec.flow.macro === "aprovacao" && atec.flow.step === "ficha", "A ficha só é enviada na etapa de aprovação.");
    const faltando = pendenciasFicha(ficha);
    exigir(!faltando.length, `Preencha a ficha antes de enviar: ${faltando.join("; ")}.`);
    const ap = atec.flow.aprovacao;
    ap.ficha = { ...ficha, enviadaEm: now().toISOString(), para: ap.aprovador, email: EMAIL_APROVADOR[ap.aprovador], enviadaPor: perfil };
    ap.fichaRascunho = null;
    log(atec, perfil, "Ficha de aprovação enviada por e-mail", `Para ${ap.aprovador} (${ap.ficha.email})`);
    goTo(atec, "aprovacao", "aprovar");
    log(atec, ROLE_SISTEMA, "Enviado para aprovação do reparo", `${fmtBRL(ap.valor)} → ${ap.aprovador} (${ap.faixa})`);
  },

  // O orçamento do reparo é a cotação criada pela aba Cotações (atecCriarCotacao)
  enviarOrcamento(atec, perfil, { cotacaoId }) {
    const cot = (atec.cotacoes || []).find((c) => c.id === cotacaoId);
    exigir(cot, "Cotação não encontrada.");
    exigir(cot.valorTotal > 0, "Para seguir no fluxo, a cotação precisa ter ao menos um item com valor.");
    const fornecedor = [...new Set(cot.itens.map((i) => i.fornecedor))].join(", ");
    const p = atec.flow.planejamento;
    Object.assign(p, { cotacaoId, fornecedor, valorOrcamento: cot.valorTotal, detalhamento: cot.observacao, valorNegociado: null, obsNegociacao: "" });
    p.tentativas += 1;
    registrarValor(atec, p.tentativas > 1 ? `Orçamento (${p.tentativas}ª versão)` : "Orçamento", cot.valorTotal);
    log(atec, perfil, "Orçamento registrado", `${cot.Name} · ${fornecedor} · ${fmtBRL(cot.valorTotal)}`);
    if (cot.valorTotal > LIMITE_NEGOCIACAO_SUPRIMENTOS) {
      cot.Status_Aprovacao = "Em negociação";
      log(atec, ROLE_SISTEMA, "Encaminhado para negociação", `Orçamento acima de ${fmtBRL(LIMITE_NEGOCIACAO_SUPRIMENTOS)}`);
      goTo(atec, "planejamento", "negociacao");
    } else {
      cot.Status_Aprovacao = "Em aprovação";
      iniciarAprovacaoReparo(atec);
    }
  },

  negociarSuprimentos(atec, perfil, { valorNegociado, obs }) {
    exigir(valorNegociado > 0, "Informe o valor negociado.");
    const p = atec.flow.planejamento;
    Object.assign(p, { valorNegociado, obsNegociacao: obs || "" });
    registrarValor(atec, "Negociado por Suprimentos", valorNegociado);
    log(atec, perfil, "Negociação concluída", `${fmtBRL(p.valorOrcamento)} → ${fmtBRL(valorNegociado)}${obs ? ` · ${obs}` : ""}`);
    const cot = cotacaoDoPlanejamento(atec);
    if (cot) cot.Status_Aprovacao = "Em aprovação";
    iniciarAprovacaoReparo(atec);
  },

  aprovarReparo(atec, perfil, { aprovado, comentario }) {
    exigir(aprovado || (comentario || "").trim(), "Informe o motivo da reprovação.");
    const ap = atec.flow.aprovacao;
    ap.decisoes.push({ aprovado, comentario, perfil, valor: ap.valor, em: now().toISOString() });
    const cot = cotacaoDoPlanejamento(atec);
    if (cot) cot.Status_Aprovacao = aprovado ? "Aprovada" : "Reprovada";
    if (aprovado) {
      log(atec, perfil, "Reparo aprovado", `${fmtBRL(ap.valor)}${comentario ? ` · ${comentario}` : ""}`);
      atec.flow.reparo = atec.flow.reparo || novoReparo();
      goTo(atec, "reparo", "acompanhar");
    } else {
      log(atec, perfil, "Reparo reprovado", comentario);
      goTo(atec, "planejamento", "orcar");
    }
  },

  // Entrega do serviço (página em outra aba, igual à vistoria): o analista
  // registra o que foi executado e o cliente confere e assina o termo de entrega.
  salvarEntrega(atec, perfil, dados) {
    Object.assign(atec.flow.reparo.entrega, dados);
  },

  registrarEntrega(atec, perfil, dados) {
    const e = atec.flow.reparo.entrega;
    Object.assign(e, dados);
    exigir(e.dataInicio, "Informe a data de início do serviço.");
    exigir(e.dataConclusao, "Informe a data de conclusão do serviço.");
    exigir(e.dataConclusao >= e.dataInicio, "A data de conclusão deve ser igual ou posterior ao início.");
    exigir((e.executadoPor || "").trim(), "Informe quem executou o serviço.");
    exigir((e.servicoExecutado || "").trim(), "Descreva o serviço executado (vai para o termo do cliente).");
    exigir((e.fotos || []).length + (e.anexos || []).length > 0, "Anexe ao menos uma foto ou evidência do serviço.");
    log(atec, perfil, "Entrega do serviço registrada", "Termo de entrega gerado para assinatura do cliente");
    goTo(atec, "reparo", "termo");
  },

  voltarEntrega(atec, perfil) {
    log(atec, perfil, "Termo de entrega não assinado", "Voltou para editar o registro da entrega");
    goTo(atec, "reparo", "acompanhar");
  },

  assinarTermoEntrega(atec, perfil, { nome, assinatura }) {
    exigir(atec.flow.step === "termo" && atec.flow.macro === "reparo", "Gere o termo a partir do registro da entrega.");
    exigir((nome || "").trim(), "Informe o nome de quem assina.");
    exigir(assinatura, "O cliente precisa assinar o termo.");
    const r = atec.flow.reparo;
    r.termo = { nome: nome.trim(), assinatura, em: now().toISOString(), ...conteudoEntrega(r.entrega) };
    r.validacoes.push({ resultado: "validado", metodo: "termo", nome: r.termo.nome, assinatura, em: r.termo.em });
    log(atec, perfil, "Cliente assinou o termo de entrega", `Assinado por ${r.termo.nome}`);
    goTo(atec, "reparo", "finalizar");
  },

  recusarEntrega(atec, perfil, { motivo }) {
    exigir(atec.flow.step === "termo" && atec.flow.macro === "reparo", "Gere o termo a partir do registro da entrega.");
    exigir((motivo || "").trim(), "Informe por que o cliente não aceita o serviço.");
    atec.flow.reparo.validacoes.push({ resultado: "reprovado", motivo: motivo.trim(), em: now().toISOString() });
    log(atec, perfil, "Cliente não aceitou a entrega do serviço", motivo.trim());
    goTo(atec, "reparo", "analisarReprovacao");
  },

  analisarReprovacao(atec, perfil, { parecer }) {
    exigir((parecer || "").trim(), "Registre o parecer.");
    const r = atec.flow.reparo;
    r.validacoes[r.validacoes.length - 1].parecer = parecer;
    log(atec, perfil, "Reprovação analisada", parecer);
    goTo(atec, "reparo", "acompanhar");
  },

  finalizarAtec(atec, perfil, { obs }) {
    atec.flow.reparo.obsEncerramento = obs || "";
    log(atec, perfil, "ATEC finalizada", obs || "");
    goTo(atec, "finalizada", "concluida");
  },

  escreverDevolutiva(atec, perfil, { texto }) {
    exigir((texto || "").trim(), "Escreva a devolutiva para o cliente.");
    const n = atec.flow.negativa;
    n.devolutiva = texto;
    n.aprovacoes = [];
    n.aprovadorAtual = APROVADORES_DEVOLUTIVA[0];
    log(atec, perfil, "Devolutiva enviada para aprovação", `Próximo: ${n.aprovadorAtual}`);
    goTo(atec, "negativa", "aprovar");
  },

  aprovarDevolutiva(atec, perfil, { aprovado, comentario }) {
    exigir(aprovado || (comentario || "").trim(), "Informe o motivo da reprovação.");
    const n = atec.flow.negativa;
    if (!aprovado) {
      n.reprovacoes.push({ perfil, comentario, em: now().toISOString() });
      n.aprovadorAtual = null;
      log(atec, perfil, "Devolutiva reprovada", comentario);
      goTo(atec, "negativa", "escrever");
      return;
    }
    n.aprovacoes.push({ perfil, comentario: comentario || "", em: now().toISOString() });
    log(atec, perfil, "Devolutiva aprovada", comentario || "");
    const proximo = APROVADORES_DEVOLUTIVA[APROVADORES_DEVOLUTIVA.indexOf(perfil) + 1];
    if (proximo) {
      n.aprovadorAtual = proximo;
      return;
    }
    n.aprovadorAtual = null;
    n.enviadaEm = now().toISOString();
    goTo(atec, "negativa", "finalizar");
    log(atec, ROLE_SISTEMA, "Devolutiva enviada ao cliente", atec.Email || "");
  },

  finalizarNegativa(atec, perfil, { obs }) {
    atec.flow.negativa.obsEncerramento = obs || "";
    log(atec, perfil, "ATEC finalizada (Negativa)", obs || "");
    goTo(atec, "negativa", "finalizada");
  }
};

// Executa uma ação conferindo o perfil responsável e persiste. Retorna a ATEC.
function executarAcao(atecId, nomeAcao, perfil, dados = {}) {
  const atec = getAtec(atecId);
  exigir(atec, "ATEC não encontrada.");
  const { roles } = stepInfo(atec);
  exigir(roles.includes(perfil), `Esta etapa é do perfil ${roles.join(" ou ")}.`);
  ACOES[nomeAcao](atec, perfil, dados);
  saveAtec(atec);
  return atec;
}

// ============================================================================
// Path: macroetapas com estado (completa, ativa, não se aplica, pendente).
// Na Negativa, as etapas que não chegaram a acontecer dão lugar a um passo
// vermelho "Negativa".
// ============================================================================
function buildPathStages(atec) {
  const f = atec.flow;
  const negativa = f.macro === "negativa";
  const stages = [];

  for (const { key, label } of MACRO_STAGES) {
    const tocada = f.visited.includes(key) || f.skipped.includes(key);
    if (negativa && !tocada) continue;
    let estado = "pendente";
    if (key === f.macro) estado = key === "finalizada" ? "completa" : "ativa";
    else if (f.skipped.includes(key)) estado = "naoSeAplica";
    else if (f.visited.includes(key)) estado = "completa";
    stages.push({ key, label, estado });
  }
  if (negativa) {
    stages.push({ key: "negativa", label: "Negativa", estado: f.step === "finalizada" ? "negativaFinal" : "negativa" });
  }
  return stages;
}

function resetStore() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SEQ_KEY);
  localStorage.removeItem(RODIZIO_KEY);
}

// ============================================================================
// Aba "Detalhe" (espelho do LWC atecDetalhe). Campos que o fluxo já coleta
// são lidos do fluxo; o resto fica em atec.campos. O que o usuário grava em
// "Editar" passa a valer por cima do valor que veio do fluxo.
// ============================================================================
const CAMPO_PARA_PROPRIEDADE = {
  Sub_Item: "SubItem",
  Ambiente: "Ambiente",
  Sub_Ambiente: "SubAmbiente",
  Analista_Responsavel: "AnalistaResponsavel"
};

function valorDoFluxo(atec, key) {
  const f = atec.flow;
  const v = f.vistoria || {};
  const p = f.planejamento || {};
  switch (key) {
    case "Origem": return atec.Origem;
    case "Cliente_Critico": return atec.ClienteCritico ? "Sim" : "Não";
    case "Conta": return atec.Cliente;
    case "Data_do_Habite_se": return habiteSeDoEmpreendimento(atec.Empreendimento);
    case "Empreendimento": return atec.Empreendimento;
    case "Unidade": return atec.Unidade;
    case "CreatedDate": return atec.CreatedDate;
    case "Solicitante": return atec.Solicitante;
    case "Email_do_Solicitante": return atec.Email;
    case "Telefone_de_Contato": return atec.Telefone;
    case "Item": return atec.Item;
    case "Descricao": return atec.Descricao;
    case "Status_Tecnico": return MACRO_LABELS[f.macro];
    case "Substatus": return stepInfo(atec).label;
    case "Status_ATEC": return atec.StatusATEC;
    // SLA: dentro/fora do prazo pela data do SLA Padrão do Reparo
    case "Status_SLA":
    case "Status_SLA_Tecnico": {
      const sla = (atec.campos || {}).Data_da_Previsao_de_Conclusao;
      if (!sla) return null;
      const fechada = f.macro === "finalizada" || (f.macro === "negativa" && f.step === "finalizada");
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return !fechada && new Date(`${String(sla).slice(0, 10)}T00:00:00`) < hoje ? "Fora do Prazo" : "Dentro do Prazo";
    }
    // a vistoria em campo preenche o laudo, o técnico e quem recebeu (assinou o termo)
    case "Detalhes_da_Vistoria": return v.observacoes;
    case "Tecnico_Responsavel": return v.tecnico;
    case "Vistoria_recebida_por": return v.termo ? v.termo.nome : null;
    case "Data_Inicio_do_Reparo": return f.reparo && f.reparo.entrega ? f.reparo.entrega.dataInicio : null;
    case "Data_de_Conclusao": return f.reparo && f.reparo.termo ? f.reparo.termo.dataConclusao : null;
    case "Detalhamento_do_Reparo": return p.detalhamento;
    default: return null;
  }
}

function valorCampoDetalhe(atec, key) {
  if (CAMPO_PARA_PROPRIEDADE[key]) return atec[CAMPO_PARA_PROPRIEDADE[key]];
  const campos = atec.campos || {};
  return key in campos ? campos[key] : valorDoFluxo(atec, key);
}

function opcoesCampoDetalhe(atec, key) {
  if (key === "Sub_Item") return getSubItemOptions(atec.Item); // filtrado pelo Item, como no LWC
  if (key === "Analista_Responsavel") return ANALISTAS_ATEC;
  if (key === "Tecnico_Responsavel") return TECNICOS_MOCK;
  return OPCOES_DETALHE[key] || [];
}

// Status Técnico usado nas regras do LWC. As regras citam valores da picklist
// real ("Planejamento do Reparo", "Reparo em andamento", "Reparo finalizado");
// aqui eles correspondem às etapas do fluxo.
function statusTecnicoDasRegras(atec) {
  const f = atec.flow;
  if (f.macro === "planejamento") return "planejamento do reparo";
  if (f.macro === "reparo") return "reparo em andamento";
  if (f.macro === "finalizada") return "reparo finalizado";
  return "";
}

// Mesmas regras de atecDetalhe.validateForm(); devolve { campo: mensagem }
function validarDetalhe(atec, d) {
  const erros = {};
  const statusTecnico = statusTecnicoDasRegras(atec);

  if (statusTecnico === "planejamento do reparo" && !d.Planejamento_do_Reparo) {
    erros.Planejamento_do_Reparo = 'Sempre preencher o "Planejamento do Reparo" ao alterar o campo "Status Técnico" para "Planejamento do Reparo".';
  }

  const origem = (d.Origem || "").toLowerCase();
  if ((origem === "whatsapp" || origem === "whastapp" || origem === "telefone") && !d.Telefone_de_Contato) {
    erros.Telefone_de_Contato = 'Para Origem "WhatsApp" ou "Telefone" sempre preencher o campo Telefone.';
  }
  if (origem === "e-mail" && !d.Email_do_Solicitante) {
    erros.Email_do_Solicitante = 'Para Origem "E-mail" sempre preencher o campo Email do Solicitante.';
  }

  if (statusTecnico === "reparo em andamento") {
    if (!d.Data_Prevista_de_Inicio_do_Reparo) erros.Data_Prevista_de_Inicio_do_Reparo = "Preencher datas previstas de Reparo quando Status em andamento.";
    if (!d.Data_Prevista_de_Fim_do_Reparo) erros.Data_Prevista_de_Fim_do_Reparo = "Preencher datas previstas de Reparo quando Status em andamento.";
  }

  if (statusTecnico === "reparo finalizado") {
    if (!d.Data_de_Conclusao) erros.Data_de_Conclusao = 'Sempre preencher o campo "Data Conclusão Técnica" para "Reparo Finalizado".';
    if (!d.Data_Prevista_de_Fim_do_Reparo) erros.Data_Prevista_de_Fim_do_Reparo = 'Sempre preencher o campo "Data Prevista Fim do Reparo" para "Reparo Finalizado".';
    if (!d.Data_Prevista_de_Inicio_do_Reparo) erros.Data_Prevista_de_Inicio_do_Reparo = 'Sempre preencher o campo "Data Prevista Início do Reparo" para "Reparo Finalizado".';
    if (!d.Detalhes_da_Vistoria) erros.Detalhes_da_Vistoria = 'Sempre preencher o campo "Laudo da Vistoria" para "Reparo Finalizado".';
    if (!d.Vistoria_recebida_por) erros.Vistoria_recebida_por = 'Sempre preencher o campo "Vistoria Recebida por" para "Reparo Finalizado".';
    if (!d.Licao_Aprendida) erros.Licao_Aprendida = 'Sempre preencher o campo "Lição Aprendida" para "Reparo Finalizado".';
    if (!d.Tecnico_Responsavel) erros.Tecnico_Responsavel = 'Sempre preencher o campo "Técnico Responsável" para "Reparo Finalizado".';
    if (d.Solucionado_na_Vistoria === "Não" && !d.Data_Inicio_do_Reparo) {
      erros.Data_Inicio_do_Reparo = 'Sempre preencher o campo "Data Início do Reparo" para "Reparo Finalizado" quando "Solucionado na Vistoria" = "Não".';
    }
  }
  return erros;
}

// Botão "Salvar" da aba Detalhe. Devolve os erros (vazio = salvou).
function salvarDetalhe(atecId, valores, perfil) {
  const atec = getAtec(atecId);
  exigir(atec, "ATEC não encontrada.");
  const erros = validarDetalhe(atec, valores);
  if (Object.keys(erros).length) return erros;

  atec.campos = atec.campos || {};
  const alterados = [];
  DETALHE_SECOES.flatMap((s) => s.campos).filter((c) => c.editar && c.editar !== "fluxo").forEach((c) => {
    const novo = valores[c.key] == null ? "" : valores[c.key];
    const atual = valorCampoDetalhe(atec, c.key) || "";
    // updateAtec (Apex) ignora data em branco: limpar uma data não apaga o valor salvo
    if ((c.editar === "date" || c.editar === "datetime") && !novo) return;
    if (novo === atual) return;
    if (CAMPO_PARA_PROPRIEDADE[c.key]) atec[CAMPO_PARA_PROPRIEDADE[c.key]] = novo || null;
    else atec.campos[c.key] = novo;
    alterados.push(c.label.replace(/:$/, ""));
  });
  if (alterados.length) {
    log(atec, perfil, "ATEC atualizada (Detalhe)", alterados.join(", "));
    saveAtec(atec);
  }
  return {};
}

// ============================================================================
// Cotações (espelho do LWC atecCriarCotacao / atecListaCotacoes)
// ============================================================================
function cotacaoDoPlanejamento(atec) {
  const p = atec.flow.planejamento;
  return p && p.cotacaoId ? (atec.cotacoes || []).find((c) => c.id === p.cotacaoId) : null;
}

function nextSequenceCotacao() {
  const seq = Number(localStorage.getItem(SEQ_COTACAO_KEY) || "0") + 1;
  localStorage.setItem(SEQ_COTACAO_KEY, String(seq));
  return seq;
}

// Mesmas validações do formulário do atecCriarCotacao (campos required,
// observação com 50+ caracteres, itens com descrição, fornecedor, qtd >= 1 e
// valor unitário >= 0,01). Devolve { campo: mensagem }.
function validarCotacao(c) {
  const erros = {};
  const obrigatorio = "Preencha este campo.";
  if (!c.tipo) erros.tipo = obrigatorio;
  if (!c.itemOrcamento) erros.itemOrcamento = obrigatorio;
  if (!(c.observacao || "").trim()) erros.observacao = obrigatorio;
  else if (c.observacao.length < 50) erros.observacao = "A observação deve conter no mínimo 50 caracteres.";
  (c.itens || []).forEach((item) => {
    if (!(item.descricao || "").trim()) erros[`item-${item.id}-descricao`] = obrigatorio;
    if (!item.fornecedor) erros[`item-${item.id}-fornecedor`] = obrigatorio;
    else if (!FORNECEDORES_MOCK.includes(item.fornecedor)) erros[`item-${item.id}-fornecedor`] = "Selecione um fornecedor da lista.";
    if (!(item.quantidade >= 1) || !Number.isInteger(item.quantidade)) erros[`item-${item.id}-quantidade`] = "O valor mínimo é 1.";
    if (item.valorUnitario == null || isNaN(item.valorUnitario)) erros[`item-${item.id}-valorUnitario`] = obrigatorio;
    else if (item.valorUnitario < 0.01) erros[`item-${item.id}-valorUnitario`] = "O valor mínimo é 0,01.";
  });
  return erros;
}

// "Confirmar" do modal Criar Cotação. Na etapa Planejamento e Orçamento a
// cotação vira o orçamento do reparo e a ATEC segue no fluxo.
function criarCotacao(atecId, dados, perfil) {
  const atec = getAtec(atecId);
  exigir(atec, "ATEC não encontrada.");
  const erros = validarCotacao(dados);
  if (Object.keys(erros).length) return { erros };

  const naEtapa = atec.flow.macro === "planejamento" && atec.flow.step === "orcar";
  if (naEtapa) {
    const { roles } = stepInfo(atec);
    exigir(roles.includes(perfil), `O orçamento desta etapa é do perfil ${roles.join(" ou ")}.`);
  }
  const itens = dados.itens.map((i) => ({ ...i, descricao: i.descricao.slice(0, 80), valorTotalItem: i.quantidade * i.valorUnitario }));
  const valorTotal = itens.reduce((t, i) => t + i.valorTotalItem, 0);
  exigir(!naEtapa || valorTotal > 0, "Para seguir no fluxo, a cotação precisa ter ao menos um item com valor.");
  const cot = {
    id: `COT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    Name: `COT-${String(nextSequenceCotacao()).padStart(4, "0")}`,
    tipo: dados.tipo,
    itemOrcamento: dados.itemOrcamento,
    outrosContatos: dados.outrosContatos || "",
    observacao: dados.observacao,
    anexos: dados.anexos || [],
    itens,
    valorTotal,
    Status: "Ativa",
    Status_Aprovacao: "Rascunho",
    Cotador: perfil,
    criadaEm: now().toISOString()
  };
  atec.cotacoes = atec.cotacoes || [];
  atec.cotacoes.unshift(cot);
  log(atec, perfil, "Cotação criada", `${cot.Name} · ${fmtBRL(valorTotal)}`);
  if (naEtapa) ACOES.enviarOrcamento(atec, perfil, { cotacaoId: cot.id });
  saveAtec(atec);
  return { cotacao: cot, seguiuFluxo: naEtapa };
}
