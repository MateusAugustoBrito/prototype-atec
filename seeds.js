// "Carregar exemplos": cria ATECs fictícias em etapas diferentes passando pelas
// MESMAS ações das telas (executarAcao), então cada exemplo tem histórico,
// trilha de valores e path coerentes. O relógio é retrocedido para as datas
// parecerem reais (um passo a cada 6 horas).
// Rabisco simples para as assinaturas dos exemplos
const ASSINATURA_EXEMPLO = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="460" height="150"><path d="M30 105c25-60 45-70 55-40s-5 45 15 20 30-55 45-30 0 40 20 25 25-35 40-20 10 30 30 15 35-30 60-25 45 10 80 5" fill="none" stroke="#16325c" stroke-width="3" stroke-linecap="round"/></svg>'
);

// Clientes, empreendimentos e unidades reais (dados-portal.js); telefone e
// e-mail continuam fictícios.
function clienteReal(i) {
  const c = PORTAL.clientes[i % PORTAL.clientes.length];
  const primeiro = c.nome.split(" ")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return {
    cliente: c.nome,
    solicitante: c.nome,
    empreendimento: c.empreendimento,
    unidade: c.unidade,
    email: `${primeiro}.cliente@exemplo.com`,
    telefone: `(62) 9${String(8100 + i * 37).padStart(4, "0")}-${String(1000 + i * 211).slice(0, 4)}`
  };
}

const EXEMPLOS = [
  {
    prazos: { sla: 2 },
    dados: { ...clienteReal(0), origem: "WhastApp", canalAbertura: "Portal ATEC", item: "Instalação hidro-sanitária", subItem: "Vazão", ambiente: "Unidade Residencial", subAmbiente: "Banho Master", descricao: "Chuveiro do banho master com pouca pressão desde a semana passada." },
    passos: [["concluirAbertura", ROLES.FRONT, {}]]
  },
  {
    prazos: { sla: 6, agendamentoHoje: "10:00" },
    dados: { ...clienteReal(16), origem: "Telefone", canalAbertura: "Front", item: "Pintura", subItem: "Manchamento", ambiente: "Unidade Residencial", subAmbiente: "Sala", descricao: "Mancha amarelada na parede da sala, próxima ao teto." },
    passos: [
      ["concluirAbertura", ROLES.FRONT, {}],
      ["decidirTriagem", ROLES.ANALISTA, { observacao: "Empreendimento entregue em 2015." }],
      ["decidirNivel2", ROLES.ANALISTA, { motivo: "Liberalidade", seguir: "Sim" }]
    ]
  },
  {
    prazos: { sla: 8 },
    dados: { ...clienteReal(2), origem: "Atendimento On-line", canalAbertura: "ATEC Salesforce", item: "Esquadrias Metálicas", subItem: "Vedação", ambiente: "Unidade Residencial", subAmbiente: "Suite Master", descricao: "Entrada de água pela janela da suíte em dias de chuva forte." },
    passos: [
      ["concluirAbertura", ROLES.ANALISTA, {}],
      ["decidirTriagem", ROLES.ANALISTA, {}],
      ["concluirVistoria", ROLES.ANALISTA, { data: "2026-09-28", tecnico: TECNICOS_MOCK[0], observacoes: "Borracha ressecada no perímetro; dreno parcialmente obstruído.", valorEstimado: 6200, necessarioInvestigacao: "Sim" }],
      ["enviarInvestigacao", ROLES.ANALISTA, { fornecedor: "Esquadrias Goiás", custo: 3400 }]
    ]
  },
  {
    prazos: { sla: 1 },
    dados: { ...clienteReal(3), origem: "E-mail", canalAbertura: "Front", item: "Fissuras", subItem: "Trinca parede", ambiente: "Area Comum", subAmbiente: "Fachada", descricao: "Trinca diagonal aumentando na parede próxima à unidade." },
    passos: [
      ["concluirAbertura", ROLES.FRONT, {}],
      ["decidirTriagem", ROLES.ANALISTA, {}],
      ["concluirVistoria", ROLES.ANALISTA, { data: "2026-09-30", tecnico: TECNICOS_MOCK[1], observacoes: "Fissura com abertura de 3 mm e desnível. Possível recalque.", valorEstimado: 18500, necessarioInvestigacao: "Não" }]
    ]
  },
  {
    prazos: { sla: 5 },
    dados: { ...clienteReal(4), origem: "WhastApp", canalAbertura: "Portal ATEC", item: "Esquadrias Metálicas", subItem: "Vedação", ambiente: "Unidade Residencial", subAmbiente: "Varanda", descricao: "Porta de correr da varanda deixando entrar vento e água." },
    passos: [
      ["concluirAbertura", ROLES.FRONT, {}],
      ["decidirTriagem", ROLES.ANALISTA, {}],
      ["concluirVistoria", ROLES.ANALISTA, { data: "2026-09-22", tecnico: TECNICOS_MOCK[2], observacoes: "Troca completa das vedações e ajuste do trilho.", valorEstimado: 9800, necessarioInvestigacao: "Não" }],
      ["enviarOrcamento", ROLES.ANALISTA, { fornecedor: "Esquadrias Goiás", valorOrcamento: 12400, inicio: "2026-10-14", fim: "2026-10-16", detalhamento: "Substituição de borrachas, escovas e regulagem das roldanas." }]
    ]
  },
  {
    prazos: { sla: 15 },
    dados: { ...clienteReal(5), origem: "Presencial", canalAbertura: "ATEC Salesforce", item: "Instalação hidro-sanitária", subItem: "Vazão", ambiente: "Unidade Residencial", subAmbiente: "Cozinha", descricao: "Oscilação de pressão na torneira da cozinha." },
    passos: [
      ["concluirAbertura", ROLES.ANALISTA, {}],
      ["decidirTriagem", ROLES.ANALISTA, {}],
      ["concluirVistoria", ROLES.ANALISTA, { data: "2026-09-25", tecnico: TECNICOS_MOCK[3], observacoes: "Válvula redutora com defeito.", valorEstimado: 7200, necessarioInvestigacao: "Não" }],
      ["enviarOrcamento", ROLES.ANALISTA, { fornecedor: "HidroTec Serviços", valorOrcamento: 6850, inicio: "2026-10-13", fim: "2026-10-14", detalhamento: "Troca da válvula redutora de pressão do apartamento." }],
      ["enviarFichaAprovacao", ROLES.ANALISTA, null]
    ]
  },
  {
    prazos: { sla: -2 },
    dados: { ...clienteReal(6), origem: "Telefone", canalAbertura: "Front", item: "Esquadrias Metálicas", subItem: "Mau funcionamento", ambiente: "Unidade Residencial", subAmbiente: "Suite 2", descricao: "Janela do quarto não trava." },
    passos: [
      ["concluirAbertura", ROLES.FRONT, {}],
      ["decidirTriagem", ROLES.ANALISTA, {}],
      ["concluirVistoria", ROLES.ANALISTA, { data: "2026-09-20", tecnico: TECNICOS_MOCK[0], observacoes: "Fecho quebrado.", valorEstimado: 450, necessarioInvestigacao: "Não" }],
      ["enviarOrcamento", ROLES.ANALISTA, { fornecedor: "Esquadrias Goiás", valorOrcamento: 420, inicio: "2026-10-01", fim: "2026-10-01", detalhamento: "Troca do fecho da janela." }],
      ["aprovarReparo", ROLES.ESPECIALISTA, { aprovado: true }],
      ["registrarEntrega", ROLES.ANALISTA, { dataInicio: "2026-10-01", dataConclusao: "2026-10-01", executadoPor: "Esquadrias Goiás", servicoExecutado: "Troca do fecho da janela do quarto 2 e regulagem da folha.", anexos: ["foto-fecho-novo.jpg"] }]
    ]
  },
  {
    prazos: { sla: 9 },
    dados: { ...clienteReal(17), origem: "WhastApp", canalAbertura: "Portal ATEC", item: "Instalação ar condicionado", subItem: "Localização dos pontos", ambiente: "Unidade Residencial", subAmbiente: "Suite 1", descricao: "Não encontramos o ponto de dreno do ar-condicionado da suíte." },
    passos: [
      ["concluirAbertura", ROLES.FRONT, {}],
      ["decidirTriagem", ROLES.ANALISTA, { observacao: "Ponto alterado pela marcenaria do cliente." }],
      ["decidirNivel2", ROLES.ANALISTA, { motivo: "Outro", outroTexto: "Intervenção de terceiros no ponto", seguir: "Não" }],
      ["escreverDevolutiva", ROLES.ANALISTA, { texto: "Prezado(a) cliente, após análise identificamos que o ponto de dreno foi alterado durante a instalação da marcenaria, o que exclui a cobertura da garantia. Permanecemos à disposição." }],
      ["aprovarDevolutiva", ROLES.SUPERVISORA, { aprovado: true }]
    ]
  },
  {
    prazos: { sla: -20 },
    dados: { ...clienteReal(8), origem: "E-mail", canalAbertura: "Front", item: "Pintura", subItem: "Manchamento", ambiente: "Unidade Residencial", subAmbiente: "Suite 3", descricao: "Mancha de umidade no teto do quarto." },
    passos: [
      ["concluirAbertura", ROLES.FRONT, {}],
      ["decidirTriagem", ROLES.ANALISTA, {}],
      ["concluirVistoria", ROLES.ANALISTA, { data: "2026-09-10", tecnico: TECNICOS_MOCK[1], observacoes: "Infiltração pontual já sanada pelo condomínio; repintura necessária.", valorEstimado: 900, necessarioInvestigacao: "Não" }],
      ["enviarOrcamento", ROLES.ANALISTA, { fornecedor: "Pinturas Prime", valorOrcamento: 780, inicio: "2026-09-18", fim: "2026-09-19", detalhamento: "Tratamento e repintura do teto." }],
      ["aprovarReparo", ROLES.ESPECIALISTA, { aprovado: true }],
      ["registrarEntrega", ROLES.ANALISTA, { dataInicio: "2026-09-18", dataConclusao: "2026-09-19", executadoPor: "Pinturas Prime", servicoExecutado: "Tratamento da mancha de umidade e repintura completa do teto do quarto.", anexos: ["teto-antes.jpg", "teto-depois.jpg"] }],
      ["assinarTermoEntrega", ROLES.ANALISTA, { nome: clienteReal(8).solicitante, assinatura: ASSINATURA_EXEMPLO }],
      ["finalizarAtec", ROLES.ANALISTA, { obs: "Cliente satisfeito com o acabamento." }]
    ]
  }
];

// O orçamento é feito pela cotação (como na tela): cria a cotação com um item
// e grava as datas previstas nos campos do Detalhe.
function criarCotacaoExemplo(atecId, perfil, { fornecedor, valorOrcamento, inicio, fim, detalhamento }) {
  const r = criarCotacao(atecId, {
    tipo: "Serviço",
    itemOrcamento: "367 - Manutenção pós entrega",
    outrosContatos: "",
    observacao: `${detalhamento} Orçamento conforme vistoria técnica realizada na unidade.`,
    anexos: ["orcamento-fornecedor.pdf"],
    itens: [{ id: 1, descricao: detalhamento, fornecedor, quantidade: 1, valorUnitario: valorOrcamento }]
  }, perfil);
  if (r.erros) throw new Error(`Exemplo inválido: ${Object.values(r.erros).join(" ")}`);
  const atec = getAtec(atecId);
  atec.campos = { ...(atec.campos || {}), Data_Prevista_de_Inicio_do_Reparo: inicio, Data_Prevista_de_Fim_do_Reparo: fim, Planejamento_do_Reparo: "Agendamento de execução" };
  saveAtec(atec);
}

// Datas que o portal usa no Início (ATEC's do dia, a vencer, SLA), relativas a hoje
function aplicarPrazosExemplo(atecId, prazos) {
  if (!prazos) return;
  const atec = getAtec(atecId);
  const hoje = new Date();
  const dia = (n) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  atec.campos = atec.campos || {};
  if (prazos.sla != null) atec.campos.Data_da_Previsao_de_Conclusao = dia(prazos.sla);
  if (prazos.agendamentoHoje) {
    const [h, m] = prazos.agendamentoHoje.split(":").map(Number);
    const d = new Date(hoje);
    d.setHours(h, m, 0, 0);
    atec.campos.Data_de_Agendamento_da_Vistoria = d.toISOString();
  }
  saveAtec(atec);
}

// Ficha de aprovação preenchida (parte automática + respostas do analista)
function fichaExemplo(atecId) {
  const fi = fichaInicial(getAtec(atecId));
  Object.assign(fi, {
    impacto: ["Funcional"],
    garantia: { ...fi.garantia, cobertura: "Sim", responsabilidadeOpus: "Sim", laudoAnterior: "Não", falhaExecutiva: "Sim", reincidencia: "Não", adimplente: "Sim" },
    liberalidade: ["NA"],
    maisUnidades: "Não",
    causaRaiz: "Válvula redutora de pressão com defeito de fabricação, sem relação com o uso.",
    tecnica: { validadaEngenharia: "NA", eliminaCausa: "Sim", normas: "Sim", fabricante: "Sim", garantiaFornecedor: "Sim", riscoFuturo: "Não" },
    orc: { material: 2350, maoDeObra: 4500, equipamentos: null, outros: null },
    motivoEscolha: "Único fornecedor com a peça em estoque e disponibilidade para início imediato.",
    precoTabelado: "Não",
    risco: { Financeiro: "Médio", "Jurídico": "Baixo", Imagem: "Baixo", "Segurança": "Baixo", "Reincidência": "Baixo" },
    parecerAT: "Favorável"
  });
  return fi;
}

function carregarExemplos() {
  const HORA = 3600 * 1000;
  const PASSO = 6 * HORA;
  const INTERVALO = 20 * HORA;
  // recua o relógio o suficiente para o último exemplo terminar há ~2 horas
  const duracao = EXEMPLOS.reduce((t, ex) => t + ex.passos.length * PASSO + INTERVALO, 0);
  let relogio = Date.now() - duracao - 2 * HORA;
  try {
    EXEMPLOS.forEach((exemplo) => {
      clockOverride = relogio;
      const perfilAbertura = exemplo.passos[0][1];
      const atec = createAtec(exemplo.dados, perfilAbertura);
      exemplo.passos.forEach(([acao, perfil, dados]) => {
        relogio += PASSO;
        clockOverride = relogio;
        if (acao === "enviarFichaAprovacao") {
          executarAcao(atec.id, acao, perfil, fichaExemplo(atec.id));
          return;
        }
        if (acao === "enviarOrcamento") {
          criarCotacaoExemplo(atec.id, perfil, dados);
          return;
        }
        // o código de confirmação do cliente é aleatório: o exemplo usa o gerado
        executarAcao(atec.id, acao, perfil, dados);
        // a vistoria só termina com o termo assinado pelo cliente
        if (acao === "concluirVistoria") {
          executarAcao(atec.id, "assinarTermoVistoria", perfil, { nome: exemplo.dados.solicitante, assinatura: ASSINATURA_EXEMPLO });
        }
      });
      aplicarPrazosExemplo(atec.id, exemplo.prazos);
      relogio += INTERVALO;
    });
  } finally {
    clockOverride = null;
  }
}
