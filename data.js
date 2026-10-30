// Dados do protótipo (mesmo conteúdo usado nos componentes LWC),
// extraídos dos documentos: Checklist Geral Abertura ATEC Nivel1.docx (Nível 1)
// e dos 6 checklists técnicos por Item/Sub Item (Ar Condicionado, Esquadria x2,
// Hidrossanitária, Pintura, Fissuras) — preenchidos na etapa de Vistoria.

// ============================================================================
// Etapas do fluxo (macroetapas exibidas no path) e subpassos de cada uma.
// A máquina de estados que move a ATEC entre elas fica em store.js.
// ============================================================================
const MACRO_STAGES = [
  { key: "abertura", label: "Abertura" },
  { key: "triagem", label: "Triagem" },
  { key: "vistoria", label: "Vistoria" },
  { key: "investigacao", label: "Investigação" },
  { key: "planejamento", label: "Planejamento e Orçamento" },
  { key: "aprovacao", label: "Aprovação" },
  { key: "reparo", label: "Reparo" },
  { key: "finalizada", label: "Finalizada" }
];

const MACRO_LABELS = Object.fromEntries(MACRO_STAGES.map((m) => [m.key, m.label]));
MACRO_LABELS.negativa = "Negativa";

// ---- Perfis (seletor "Atuando como"; "Sistema" age sozinho) ----
const ROLES = {
  FRONT: "Front",
  ANALISTA: "Analista ATEC",
  ESPECIALISTA: "Especialista ATEC",
  SUPERVISORA: "Supervisora ATEC",
  HEAD: "Head CRC",
  DIRETOR: "Diretor",
  SUPRIMENTOS: "Suprimentos",
  CLIENTE: "Cliente"
};
const ROLE_SISTEMA = "Sistema";
const ROLE_PADRAO = ROLES.ANALISTA;

// ---- Regras de valor ----
const LIMITE_NEGOCIACAO_SUPRIMENTOS = 10000; // orçamento ACIMA disso -> Suprimentos negocia

// Alçadas: o primeiro limite que comporta o valor define o aprovador (valor <= ate)
const ALCADAS_INVESTIGACAO = [
  { ate: 2000, perfil: ROLES.SUPERVISORA, faixa: "até R$ 2.000,00" },
  { ate: 10000, perfil: ROLES.HEAD, faixa: "R$ 2.000,01 a R$ 10.000,00" },
  { ate: Infinity, perfil: ROLES.DIRETOR, faixa: "acima de R$ 10.000,00" }
];

const ALCADAS_REPARO = [
  { ate: 1000, perfil: ROLES.ESPECIALISTA, faixa: "até R$ 1.000,00" },
  { ate: 2500, perfil: ROLES.SUPERVISORA, faixa: "R$ 1.000,01 a R$ 2.500,00" },
  { ate: 5000, perfil: ROLES.HEAD, faixa: "R$ 2.500,01 a R$ 5.000,00" },
  { ate: Infinity, perfil: ROLES.DIRETOR, faixa: "acima de R$ 5.000,00" }
];

// Aprovação da devolutiva da Negativa: sequencial, nesta ordem
const APROVADORES_DEVOLUTIVA = [ROLES.SUPERVISORA, ROLES.HEAD, ROLES.DIRETOR];

const ANALISE_NIVEL_2_OPTIONS = [
  "Liberalidade",
  "Risco jurídico",
  "Erro construtivo",
  "Tratativa de finalização de obra",
  "Tratativa de vistoria reprovada",
  "Decisão da Diretoria",
  "Outro"
];

const CANAL_ABERTURA_OPTIONS = ["Front", "ATEC Salesforce", "Portal ATEC"];

// ---- Distribuição automática: carteira (empreendimento) -> analistas, em rodízio ----
// carteiras por empreendimento (dados-portal.js); nomes de analistas fictícios
const CARTEIRAS_ANALISTAS = Object.fromEntries(PORTAL.empreendimentos.map((e) => [e.nome, e.analistas]));
const CARTEIRA_GERAL = { nome: "Carteira Geral", analistas: PORTAL.analistas };

// ---- Cadastros fictícios ----
const FORNECEDORES_MOCK = [
  "HidroTec Serviços",
  "Construfix Manutenção",
  "Esquadrias Goiás",
  "Pinturas Prime",
  "Climatiza Ar",
  "Engenharia Reparo Total"
];
const TECNICOS_MOCK = PORTAL.tecnicos; // valores reais da picklist Técnico Responsável

// Reparos anteriores (fictícios, fixos) por Item / Sub Item — exibidos na aprovação do reparo
const HISTORICO_REPAROS_MOCK = {
  "Instalação hidro-sanitária|Vazão": [
    { atec: "ATEC-0912", empreendimento: "OPUS GYRO VACA BRAVA DESIGN", data: "03/2026", valor: 1850 },
    { atec: "ATEC-0877", empreendimento: "OPUS GYRO ROOFTOP", data: "01/2026", valor: 3200 },
    { atec: "ATEC-0815", empreendimento: "OPUS TELLURE", data: "11/2025", valor: 1240 }
  ],
  "Esquadrias Metálicas|Vedação": [
    { atec: "ATEC-0930", empreendimento: "SUNNA BY OPUS", data: "04/2026", valor: 4600 },
    { atec: "ATEC-0861", empreendimento: "OPUS GYRO VACA BRAVA DESIGN", data: "12/2025", valor: 2900 }
  ],
  "Esquadrias Metálicas|Mau funcionamento": [
    { atec: "ATEC-0899", empreendimento: "OPUS GYRO ROOFTOP", data: "02/2026", valor: 980 },
    { atec: "ATEC-0840", empreendimento: "OPUS TELLURE", data: "10/2025", valor: 1350 }
  ],
  "Pintura|Manchamento": [
    { atec: "ATEC-0921", empreendimento: "OPUS TELLURE", data: "03/2026", valor: 760 },
    { atec: "ATEC-0850", empreendimento: "SUNNA BY OPUS", data: "11/2025", valor: 1120 }
  ],
  "Fissuras|Trinca parede": [
    { atec: "ATEC-0905", empreendimento: "OPUS GYRO VACA BRAVA DESIGN", data: "02/2026", valor: 2300 },
    { atec: "ATEC-0832", empreendimento: "OPUS GYRO ROOFTOP", data: "09/2025", valor: 15800 }
  ],
  "Instalação ar condicionado|Localização dos pontos": [
    { atec: "ATEC-0890", empreendimento: "SUNNA BY OPUS", data: "01/2026", valor: 640 }
  ]
};

const ORIGEM_OPTIONS = PORTAL.picklists.Origem;
const AMBIENTE_OPTIONS = PORTAL.picklists.Ambiente;

// Listas de amostra p/ simular lookups de Cliente/Empreendimento/Unidade (sem Apex/Salesforce)
const CLIENTES_MOCK = PORTAL.clientes.map((c) => c.nome);
const EMPREENDIMENTOS_MOCK = PORTAL.empreendimentos.map((e) => e.nome);
const UNIDADES_MOCK = [...new Set(PORTAL.empreendimentos.flatMap((e) => e.unidades))];

const CHECKLIST_NIVEL_1 = {
  titulo: "CHECKLIST GERAL DE ABERTURA DE ATEC (NÍVEL 1)",
  subtitulo: "Preenchimento obrigatório para 100% das aberturas da ATEC",
  blocos: [
    {
      tipo: "tabela",
      titulo: "IDENTIFICAÇÃO DO CLIENTE E UNIDADE",
      itens: [
        "Nome do cliente confirmado",
        "Telefone atualizado",
        "E-mail atualizado",
        "Empreendimento",
        "Torre/Bloco",
        "Unidade",
        "Cliente é proprietário",
        "Cliente é inquilino",
        "Unidade está ocupada",
        "Melhor horário para contato informado"
      ]
    },
    {
      tipo: "tabela",
      titulo: "VALIDAÇÃO DE GARANTIA",
      itens: [
        "Data do Habite-se validada",
        "Data da entrega validada",
        "Prazo de garantia consultado no Manual",
        "Garantia vigente para o item",
        "Empreendimento possui regra específicas"
      ]
    },
    {
      tipo: "tabela",
      titulo: "MODIFICAÇÕES NA UNIDADE",
      itens: [
        "Marcenaria",
        "Gesso/forro",
        "Ar-condicionado",
        "Automação",
        "Instalação elétrica",
        "Alteração hidráulica",
        "Pintura",
        "Revestimento",
        "Cortina/persiana",
        "Vidro",
        "Outro"
      ]
    },
    {
      tipo: "tabela",
      titulo: "IMPACTO E CRITICIDADE",
      itens: [
        "Há risco à segurança",
        "Impede uso do ambiente",
        "Pode causar dano progressivo",
        "Há risco elétrico",
        "Há vazamento ativo",
        "Há risco de queda",
        "Outro"
      ]
    },
    {
      tipo: "tabela",
      titulo: "EVIDÊNCIAS OBRIGATÓRIAS",
      itens: [
        "Foto geral do ambiente",
        "Foto aproximada do problema",
        "Foto do item completo",
        "Vídeo demonstrando o defeito 360º",
        "Vídeo do funcionamento"
      ]
    },
    {
      tipo: "tabela",
      titulo: "REGISTRO DA ABERTURA",
      itens: [
        "Motivo da ATEC",
        "Ambiente afetado",
        "Item afetado",
        "Descrição detalhada",
        "Garantia validada",
        "Evidências anexadas",
        "Prioridade definida",
        "Encaminhamento registrado"
      ]
    },
    {
      tipo: "aberta",
      titulo: "HISTÓRICO DO PROBLEMA",
      perguntas: [
        "Quando o problema começou?",
        "O problema é contínuo ou intermitente?",
        "O problema está aumentando?",
        "Já houve atendimento anterior?",
        "Existe protocolo anterior?",
        "Já foi realizado reparo?",
        "O problema retornou após reparo?"
      ]
    }
  ]
};

const INVESTIGACAO_CHECKLISTS = [
  {
    item: "Instalação ar condicionado",
    subItem: "Localização dos pontos",
    arquivo: "Checklist ATEC Ar Condicionado Localizacao Pontos.docx",
    blocos: [
      { tipo: "tabela", titulo: "GARANTIA", itens: ["Data do Habite-se validada", "Garantia consultada no Manual do Proprietário", "Item dentro do prazo de garantia (5 anos)", "Empreendimento possui regra específica"] },
      { tipo: "tabela", titulo: "MODIFICAÇÕES", itens: ["Reforma no ambiente", "Alteração em gesso/forro", "Instalação de marcenaria", "Fechamento de varanda", "Alteração elétrica", "Alteração hidráulica", "Intervenção no ponto do ar-condicionado", "Outro"] },
      { tipo: "tabela", titulo: "VERIFICAÇÕES TÉCNICAS", itens: ["Cliente consultou memorial descritivo", "Cliente consultou projeto", "Já houve tentativa de instalação", "Já houve intervenção no ponto", "Ponto está visível", "Existe divergência entre projeto e execução"] },
      { tipo: "tabela", titulo: "EVIDÊNCIAS OBRIGATÓRIAS", itens: ["Foto geral do ambiente", "Foto do local do ponto", "Vídeo do ambiente", "Foto do projeto/memorial (se houver)", "Foto da infraestrutura existente"] },
      { tipo: "aberta", titulo: "SONDAGEM TÉCNICA", perguntas: ["Em qual ambiente está o ponto?", "O cliente verificou o memorial descritivo?", "O cliente verificou o projeto?", "Já houve tentativa de instalação do ar-condicionado?", "Já houve intervenção nesse ponto?", "Existe dificuldade para localizar o ponto?"] },
      { tipo: "escolha", titulo: "CRITICIDADE", opcoes: ["Alta", "Média", "Baixa"] },
      { tipo: "escolha", titulo: "DECISÃO FINAL", opcoes: ["Agendar vistoria presencial para o Campo", "Solicitar complementação", "Encerrar como improcedente", "Abrir ATEC após validação das Evidências"] }
    ]
  },
  {
    item: "Esquadrias Metálicas",
    subItem: "Mau funcionamento",
    arquivo: "Checklist ATEC Esquadria Mau Funcionamento.docx",
    blocos: [
      { tipo: "aberta", titulo: "GARANTIA", perguntas: ["A garantia para esse item é de até 5 anos do Habite-se. Acima de 5 anos: não procedente por tempo de garantia."] },
      { tipo: "tabela", titulo: "MODIFICAÇÕES", itens: ["Instalação de persiana integrada", "Automação", "Repintura da esquadria", "Instalação de película", "Instalação de tela de proteção", "Troca de fechadura", "Perfuração da esquadria", "Marcenaria próxima", "Alteração de gesso/forro", "Reforma no ambiente", "Outro"] },
      { tipo: "tabela", titulo: "VERIFICAÇÕES ESPECÍFICAS", itens: ["A peça fecha totalmente", "A trava funciona corretamente", "Existe fresta visível", "Há entrada de água", "Há entrada de vento", "Há dificuldade para movimentação", "Existe ruído anormal", "Houve limpeza dos trilhos e drenos"] },
      { tipo: "tabela", titulo: "POSSÍVEIS IMPROCEDÊNCIAS", itens: ["Mau uso identificado", "Dano por impacto", "Falta de manutenção", "Modificação pelo cliente", "Intervenção de terceiros", "Desgaste natural"] },
      { tipo: "tabela", titulo: "EVIDÊNCIAS OBRIGATÓRIAS", itens: ["Foto geral do ambiente", "Foto da peça completa", "Foto aproximada do defeito", "Vídeo demonstrando o defeito", "Foto dos trilhos", "Foto da trava/fecho", "Foto das borrachas"] },
      { tipo: "escolha", titulo: "IDENTIFICAÇÃO DO ITEM", opcoes: ["Porta", "Janela", "Persiana manual", "Persiana motorizada", "Fecho", "Trava", "Vidro", "Borracha", "Escova", "Roldana", "Motor", "Trilho"] },
      { tipo: "escolha", titulo: "CARACTERIZAÇÃO DO PROBLEMA", opcoes: ["Não abre", "Não fecha", "Não trava", "Está pesada", "Está desalinhada", "Faz ruído", "Raspa", "Entrada de água", "Entrada de vento", "Vidro solto", "Persiana não sobe", "Persiana não desce", "Motor não funciona"] },
      { tipo: "aberta", titulo: "SONDAGEM TÉCNICA", perguntas: ["O defeito surgiu recentemente?", "Há quanto tempo ocorre?", "O problema é contínuo ou intermitente?", "Já foi realizada manutenção anterior?", "O problema piorou com o tempo?", "Houve impacto ou batida?", "O problema ocorre em mais de uma peça?"] },
      { tipo: "escolha", titulo: "DECISÃO FINAL", opcoes: ["Agendar vistoria presencial para o Campo", "Solicitar complementação", "Encerrar como improcedente", "Abrir ATEC após validação das Evidências"] }
    ]
  },
  {
    item: "Esquadrias Metálicas",
    subItem: "Vedação",
    arquivo: "Checklist ATEC Esquadria Vedacao.docx",
    blocos: [
      { tipo: "tabela", titulo: "GARANTIA", itens: ["Data do Habite-se validada", "Garantia consultada no Manual do Proprietário", "Item dentro do prazo de garantia (5 anos)", "Empreendimento possui regra específica"] },
      { tipo: "tabela", titulo: "MODIFICAÇÕES", itens: ["Desmontagem da esquadria para troca de piso", "Instalação de persiana", "Automação", "Repintura da esquadria", "Troca de vidro", "Instalação de película", "Reforma no ambiente", "Outro"] },
      { tipo: "tabela", titulo: "VERIFICAÇÕES DE VEDAÇÃO", itens: ["Entrada de água", "Entrada de vento", "Entrada de poeira", "Entrada de ruído", "Problema ocorre em outras esquadrias", "Esquadria encosta em todo perímetro quando fechada", "Há deformação visível", "Drenos aparentam obstruídos"] },
      { tipo: "tabela", titulo: "EVIDÊNCIAS OBRIGATÓRIAS", itens: ["Foto geral do ambiente", "Foto da esquadria completa", "Foto do ponto de entrada", "Vídeo demonstrando a falha", "Vídeo durante chuva (se possível)", "Foto dos trilhos e drenos", "Foto das borrachas"] },
      { tipo: "escolha", titulo: "CARACTERIZAÇÃO DO PROBLEMA", opcoes: ["Entrada de água", "Entrada de vento", "Entrada de poeira", "Entrada de ruído", "Ocorre apenas em chuva forte", "Ocorre sempre", "Associado a infiltração"] },
      { tipo: "aberta", titulo: "SONDAGEM TÉCNICA", perguntas: ["Quando o problema foi percebido?", "O problema aumentou com o tempo?", "Acontece em mais de uma esquadria?", "Já houve manutenção anterior?", "Existe infiltração associada?"] },
      { tipo: "escolha", titulo: "CRITICIDADE", opcoes: ["Alta", "Média", "Baixa"] },
      { tipo: "escolha", titulo: "DECISÃO FINAL", opcoes: ["Agendar vistoria presencial para o Campo", "Solicitar complementação", "Encerrar como improcedente", "Abrir ATEC após validação das Evidências"] }
    ]
  },
  {
    item: "Instalação hidro-sanitária",
    subItem: "Vazão",
    arquivo: "Checklist ATEC Hidrossanitaria_ Vazao e Pressao.docx",
    blocos: [
      { tipo: "tabela", titulo: "DESCLASSIFICATÓRIOS – GARANTIA", itens: ["Data do Habite-se validada", "Garantia consultada no Manual do Proprietário", "Empreendimento possui regra específica", "Item dentro do prazo de garantia (5 anos)"] },
      { tipo: "tabela", titulo: "MODIFICAÇÕES", itens: ["Reforma no ambiente", "Troca de torneira", "Troca de chuveiro", "Instalação de filtro", "Instalação de pressurizador", "Instalação de aquecedor", "Alteração hidráulica", "Outro"] },
      { tipo: "tabela", titulo: "VERIFICAÇÕES COM O CLIENTE", itens: ["Registro totalmente aberto", "Ponto já funcionou normalmente", "Outros pontos funcionam normalmente", "Houve interrupção recente no abastecimento", "Condomínio informou manutenção", "Existe pressurizador instalado", "Existe aquecedor instalado"] },
      { tipo: "tabela", titulo: "POSSÍVEIS IMPROCEDÊNCIAS", itens: ["Equipamento trocado pelo cliente", "Registro parcialmente fechado", "Restritor removido/alterado", "Pressurizador instalado posteriormente", "Problema causado por equipamento particular", "Alteração hidráulica realizada"] },
      { tipo: "tabela", titulo: "EVIDÊNCIAS OBRIGATÓRIAS", itens: ["Vídeo do ambiente", "Vídeo demonstrando o fluxo de água", "Vídeo comparando com outro ponto", "Foto do equipamento", "Foto do registro", "Foto do ambiente"] },
      { tipo: "escolha", titulo: "CARACTERIZAÇÃO", opcoes: ["Pouca pressão", "Pressão elevada", "Oscilação"] },
      { tipo: "escolha", titulo: "CRITICIDADE", opcoes: ["Alta", "Média", "Baixa"] },
      { tipo: "escolha", titulo: "DECISÃO FINAL", opcoes: ["Agendar vistoria presencial para o Campo", "Solicitar complementação", "Encerrar como improcedente", "Abrir ATEC após validação das Evidências"] }
    ]
  },
  {
    item: "Pintura",
    subItem: "Manchamento",
    arquivo: "Checklist ATEC Pintura Manchamento.docx",
    blocos: [
      { tipo: "tabela", titulo: "GARANTIA", itens: ["Data do Habite-se validada", "Garantia consultada no Manual do Proprietário", "Item dentro do prazo de garantia (5 anos)", "Empreendimento possui regra específica"] },
      { tipo: "tabela", titulo: "MODIFICAÇÕES NO AMBIENTE", itens: ["Montagem de marcenaria", "Mudança com movimentação de móveis", "Reforma no ambiente", "Repintura parcial ou total", "Instalação de quadros ou objetos", "Instalação de papel de parede", "Limpeza química/produtos específicos", "Outro"] },
      { tipo: "tabela", titulo: "POSSÍVEIS IMPROCEDÊNCIAS", itens: ["Parede suja/encardida", "Marca de móvel ou quadro", "Respingo de limpeza", "Diferença estética sem perda funcional", "Repintura realizada pelo cliente", "Problema decorrente de uso"] },
      { tipo: "tabela", titulo: "EVIDÊNCIAS OBRIGATÓRIAS", itens: ["Foto geral do ambiente", "Foto aproximada da mancha", "Vídeo 360° do ambiente", "Foto com escala (régua ou objeto)", "Foto do teto e paredes adjacentes"] },
      { tipo: "escolha", titulo: "CARACTERIZAÇÃO DO MANCHAMENTO", opcoes: ["Escorrimento", "Diferença de tonalidade", "Respingo", "Umidade", "Mofo", "Sujeira/encardido", "Mancha amarelada", "Eflorescência", "Descascamento", "Empolamento", "Outro"] },
      { tipo: "aberta", titulo: "SONDAGEM TÉCNICA", perguntas: ["A mancha está aumentando?", "O problema surgiu após chuva?", "O local possui tubulação próxima?", "O local já apresentou infiltração?", "O ambiente é úmido?", "Já houve limpeza da área?", "Foi utilizada tinta ou produto de limpeza?", "Desde quando a mancha foi percebida?"] },
      { tipo: "escolha", titulo: "CLASSIFICAÇÃO DE CRITICIDADE", opcoes: ["Alta", "Média", "Baixa"] },
      { tipo: "escolha", titulo: "DECISÃO FINAL", opcoes: ["Agendar vistoria presencial para o Campo", "Solicitar complementação", "Encerrar como improcedente", "Abrir ATEC após validação das Evidências"] }
    ]
  },
  {
    item: "Fissuras",
    subItem: "Trinca parede",
    arquivo: "Checklist_ATEC Fissuras Paredes.docx",
    blocos: [
      { tipo: "tabela", titulo: "GARANTIA", itens: ["Data do Habite-se validada", "Garantia consultada no Manual do Proprietário", "Item dentro do prazo de garantia", "Empreendimento possui regra específica"] },
      { tipo: "tabela", titulo: "MODIFICAÇÕES NO AMBIENTE", itens: ["Furação na parede", "Instalação de móveis planejados", "Instalação de TV ou painéis", "Gesso/forro", "Pintura ou repintura", "Reforma no ambiente", "Demolição ou quebra de parede", "Vibração causada por obra", "Outro"] },
      { tipo: "tabela", titulo: "AVALIAÇÃO DE RISCO", itens: ["Há desnível na parede", "Existe desprendimento de revestimento", "A fissura possui abertura perceptível", "Existe infiltração ativa", "A fissura está aumentando", "Há risco à segurança"] },
      { tipo: "tabela", titulo: "POSSÍVEIS IMPROCEDÊNCIAS", itens: ["Fissura decorrente de furação", "Fissura após instalação de móveis", "Fissura após reforma", "Vibração causada por terceiros", "Repintura realizada pelo cliente", "Fissura estética sem evolução"] },
      { tipo: "tabela", titulo: "EVIDÊNCIAS OBRIGATÓRIAS", itens: ["Foto geral do ambiente", "Foto aproximada da fissura", "Vídeo 360° do ambiente", "Foto com régua ou moeda para escala", "Foto da parede completa", "Foto de outros locais com fissura"] },
      { tipo: "escolha", titulo: "LOCALIZAÇÃO DA FISSURA", opcoes: ["Próxima ao teto", "Próxima ao piso", "No meio da parede", "Próxima à porta", "Próxima à janela", "Em quina/canto", "No encontro entre alvenaria e estrutura"] },
      { tipo: "escolha", titulo: "CARACTERIZAÇÃO VISUAL", opcoes: ["Fina (tipo fio de cabelo)", "Aberta", "Vertical", "Horizontal", "Diagonal", "Ramificada", "Em formato de mapa"] },
      { tipo: "aberta", titulo: "SONDAGEM TÉCNICA", perguntas: ["Há quanto tempo a fissura foi percebida?", "A fissura aumentou com o tempo?", "Existe infiltração associada?", "Existe umidade ou mofo?", "A fissura apareceu após reforma?", "O local sofreu impacto?", "Existem fissuras semelhantes em outros ambientes?"] },
      { tipo: "escolha", titulo: "CLASSIFICAÇÃO DE CRITICIDADE", opcoes: ["Alta", "Média", "Baixa"] },
      { tipo: "escolha", titulo: "DECISÃO FINAL", opcoes: ["Agendar vistoria presencial para o Campo", "Solicitar complementação", "Encerrar como improcedente", "Abrir ATEC após validação das Evidências"] }
    ]
  }
];

function getItemOptions() {
  return [...new Set(INVESTIGACAO_CHECKLISTS.map((c) => c.item))];
}

function getSubItemOptions(item) {
  return INVESTIGACAO_CHECKLISTS.filter((c) => c.item === item).map((c) => c.subItem);
}

function getChecklistFor(item, subItem) {
  return INVESTIGACAO_CHECKLISTS.find((c) => c.item === item && c.subItem === subItem);
}

// ============================================================================
// Checklists de abertura — catálogo parametrizável (ver README.md).
// Cada entrada diz a quais Item/Sub Item se aplica; "*" = todos. Vale a entrada
// mais específica (Item + Sub Item > só Item > padrão). Hoje só existe o
// Nível 1 geral, mas a ATEC pode cadastrar novos aqui sem mexer no fluxo.
// ============================================================================
const CHECKLISTS_ABERTURA = [
  { id: "nivel1-geral", aplicaA: { item: "*", subItem: "*" }, checklist: CHECKLIST_NIVEL_1 }
];

function getChecklistAbertura(item, subItem) {
  const pontuar = ({ aplicaA }) => {
    const itemOk = aplicaA.item === "*" || aplicaA.item === item;
    const subOk = aplicaA.subItem === "*" || aplicaA.subItem === subItem;
    if (!itemOk || !subOk) return -1;
    return (aplicaA.item !== "*" ? 2 : 0) + (aplicaA.subItem !== "*" ? 1 : 0);
  };
  const candidatos = CHECKLISTS_ABERTURA.map((c) => ({ c, p: pontuar(c) })).filter((x) => x.p >= 0);
  candidatos.sort((a, b) => b.p - a.p);
  return candidatos.length ? candidatos[0].c.checklist : CHECKLIST_NIVEL_1;
}

// ============================================================================
// Aba "Detalhe" — mesmas seções, rótulos, ordem e campos editáveis do LWC
// atecDetalhe (projeto assistencia-tecnica, atecDetalhe.html). O LWC recebe as
// opções das picklists do Apex em tempo real (getAtecInfo, *_options); aqui
// elas vêm de dados-portal.js, consultadas na org.
//
// tipo: texto | data | dataHora | link (exibição)
// editar: null (somente leitura, igual ao LWC) | "select" | "textarea" |
//         "date" | "datetime" | "fluxo" (no LWC é editável; aqui quem define é o fluxo)
// largura: "inteira" = slds-size_1-of-1 no celular; "meia" = 1-of-2 no médio
// ============================================================================
const OPCOES_DETALHE = {
  Tipo_de_Vistoria: PORTAL.picklists.Tipo_de_Vistoria,
  Classificacao_Tecnica: PORTAL.picklists.Classificacao_Tecnica,
  Prioridade_Tecnica: PORTAL.picklists.Prioridade_Tecnica,
  Ambiente: PORTAL.picklists.Ambiente,
  Sub_Ambiente: PORTAL.picklists.Sub_Ambiente,
  Licao_Aprendida: PORTAL.picklists.Licao_Aprendida,
  Solucionado_na_Vistoria: PORTAL.picklists.Solucionado_na_Vistoria,
  Planejamento_do_Reparo: PORTAL.picklists.Planejamento_do_Reparo,
  Status_Triagem: PORTAL.picklists.Status_Triagem,
  Status_Web_Vistoria: PORTAL.picklists.Status_Web_Vistoria,
  Responsavel_Triagem: PORTAL.picklists.Responsavel_Triagem,
  Responsavel_Web_Vistoria: PORTAL.picklists.Responsavel_Web_Vistoria
};

const DETALHE_SECOES = [
  {
    titulo: "Dados Gerais",
    campos: [
      { key: "Origem", label: "Origem:" },
      { key: "Cliente_Critico", label: "Cliente crítico:" },
      { key: "Conta", label: "Conta:", tipo: "link" },
      { key: "Empreendimento", label: "Empreendimento:", tipo: "link" },
      { key: "Unidade", label: "Unidade:", tipo: "link" },
      { key: "Data_do_Habite_se", label: "Data do Habite-se:", tipo: "data" },
      { key: "Unidade_Personalizada", label: "Unidade PSN?:" },
      { key: "Unidade_Decorada", label: "Unidade Decorada?:" },
      { key: "CreatedDate", label: "Data de Criação:", tipo: "dataHora" },
      { key: "Tipo_de_Vistoria", label: "Tipo de Vistoria:", editar: "select" },
      { key: "Classificacao_Tecnica", label: "Classificação Técnica:", editar: "select" },
      { key: "Prioridade_Tecnica", label: "Prioridade Técnica:", editar: "select" }
    ]
  },
  {
    titulo: "Resumo Solicitação",
    campos: [
      { key: "Solicitante", label: "Solicitante:" },
      { key: "Email_do_Solicitante", label: "E-mail Solicitante:" },
      { key: "Telefone_de_Contato", label: "Telefone Solicitante:" },
      { key: "Entrega_das_chaves", label: "Data Entrega Chaves:", tipo: "data" },
      { key: "Tipo_de_Assistencia_Tecnica", label: "Tipo de Assistência:" },
      { key: "Item", label: "Item:" },
      { key: "Sub_Item", label: "Sub Item:", editar: "select" },
      { key: "Posse_das_chaves", label: "Posse das Chaves:" },
      { key: "Prioridade", label: "Prioridade:" },
      { key: "Ambiente", label: "Ambiente:", editar: "select" },
      { key: "Sub_Ambiente", label: "Sub Ambiente:", editar: "select" },
      { key: "Descricao", label: "Descrição:", largura: "inteira" }
    ]
  },
  {
    titulo: "Prazos",
    campos: [
      { key: "Data_da_Previsao_de_Conclusao", label: "SLA Padrão do Reparo:", tipo: "data" },
      { key: "Status_SLA", label: "SLA Padrão:" },
      { key: "Status_SLA_Tecnico", label: "SLA Padrão Técnico:" },
      { key: "Data_de_Agendamento_da_Vistoria", label: "Data Agend. Vistoria:", tipo: "dataHora", editar: "datetime" },
      { key: "Nova_data_de_Agendamento_da_Vistoria", label: "Data Agendamento da Nova Vistoria:", tipo: "dataHora", editar: "datetime" }
    ]
  },
  {
    titulo: "Vistoria (Analista ATEC)",
    campos: [
      { key: "Vistoria_recebida_por", label: "Vistoria Recebido por:", editar: "textarea" },
      { key: "Analista_Responsavel", label: "Analista Responsável:", editar: "select" },
      { key: "Detalhes_da_Vistoria", label: "Laudo da Vistoria:", editar: "textarea", largura: "inteira" },
      { key: "Laudo_Complementar", label: "Laudo da Complementar:", editar: "textarea", largura: "inteira" },
      { key: "Suporte_Tecnico_Necessario", label: "Suporte Téc. Necessário:", editar: "textarea" },
      { key: "Licao_Aprendida", label: "Lição Aprendida:", editar: "select" },
      { key: "Solucionado_na_Vistoria", label: "Solucionado na Vistoria:", editar: "select" },
      { key: "Tecnico_Responsavel", label: "Técnico Responsável:", editar: "select" },
      { key: "Descricao_da_Licao", label: "Descrição da Lição:", editar: "textarea", largura: "inteira" },
      { key: "Status_Tecnico", label: "Status Técnico:", editar: "fluxo" },
      { key: "Substatus", label: "Substatus:", editar: "fluxo" },
      { key: "Status_ATEC", label: "Status ATEC:", editar: "fluxo" },
      { key: "Parecer", label: "Parecer:", editar: "textarea", largura: "inteira" },
      { key: "Resumo_do_Pedido__c", label: "Resumo do Pedido:", editar: "textarea", largura: "inteira" }
    ]
  },
  {
    titulo: "Planejamento de Reparo (Analista ATEC)",
    campos: [
      { key: "Planejamento_do_Reparo", label: "Planejamento do Reparo:", editar: "select" },
      { key: "Data_Prevista_de_Inicio_do_Reparo", label: "Data Prevista Início:", tipo: "data", editar: "date" },
      { key: "Data_Prevista_de_Fim_do_Reparo", label: "Data Prevista Fim:", tipo: "data", editar: "date" },
      { key: "Detalhamento_do_Reparo", label: "Detalhamento do Reparo:", editar: "textarea", largura: "inteira" },
      { key: "Data_Inicio_do_Reparo", label: "Data Início Reparo:", tipo: "data", editar: "date" },
      { key: "Data_de_Conclusao", label: "Data Conclusão Técnica:", tipo: "data", editar: "date" }
    ]
  },
  {
    titulo: "Triagem e Atendimento Web (Analista ATEC)",
    campos: [
      { key: "Data_Preenchimento_do_Laudo_Triagem", label: "Data Preenchimento Laudo Triagem:", tipo: "dataHora", editar: "datetime" },
      { key: "Responsavel_Triagem", label: "Responsável Triagem:", editar: "select" },
      { key: "Status_Triagem", label: "Status Triagem:", editar: "select" },
      { key: "Laudo_Triagem", label: "Laudo Triagem:", editar: "textarea", largura: "meia" },
      { key: "Data_Preenchimento_do_Laudo_Web_Vistoria", label: "Data Preenchimento Laudo Web:", tipo: "dataHora", editar: "datetime" },
      { key: "Responsavel_Web_Vistoria", label: "Responsável Web Vistoria:", editar: "select" },
      { key: "Status_Web_Vistoria", label: "Status Web Vistoria:", editar: "select" },
      { key: "Laudo_Web_Vistoria", label: "Laudo Web Vistoria:", editar: "textarea", largura: "meia" }
    ]
  }
];

const ANALISTAS_ATEC = [...new Set([...CARTEIRA_GERAL.analistas, ...Object.values(CARTEIRAS_ANALISTAS).flat()])].sort();

// ============================================================================
// Portal: itens do menu (atecNavegacao) e "usuário logado" de cada perfil do
// seletor "Atuando como" (aparece em "Olá, <nome>!").
// ============================================================================
// Menu real do portal (NavigationMenuItem "Default Navigation"). "Início"
// (/atecs) abre o resumo; os demais módulos ficam fora do protótipo.
const NAVEGACAO_PORTAL = PORTAL.navegacao.map((n) => ({
  label: n.label,
  hash: n.target === "/atecs" ? "#/inicio" : `#/fora/${n.label}`
}));

// Só o perfil Analista ATEC tem uma pessoa real conhecida (o analista com mais
// ATECs); os outros perfis aparecem pelo nome do perfil.
const USUARIO_POR_PERFIL = {
  "Analista ATEC": PORTAL.analistas[0]
};

// ============================================================================
// Ficha Corporativa de Aprovação — Garantia | Assistência Técnica | Exceções
// (modelo "Checklist de aprovação PDF"). Vai por e-mail quando a aprovação do
// reparo cai na alçada da Supervisora ATEC ou do Diretor.
// ============================================================================
const APROVADORES_COM_FICHA = [ROLES.SUPERVISORA, ROLES.DIRETOR];
const EMAIL_APROVADOR = {
  [ROLES.SUPERVISORA]: "supervisao.atec@opus.exemplo",
  [ROLES.DIRETOR]: "diretoria@opus.exemplo"
};

const FICHA = {
  origens: ["CRC", "ATEC", "Ouvidoria", "Jurídico", "Condomínio", "Diretoria", "Laudo"],
  impactos: ["Estético", "Funcional", "Segurança", "Estrutural", "Impermeabilização", "Área Comum", "Fachada", "Equipamento"],
  garantia: [
    ["dentroPrazo", "Está dentro do prazo de garantia?"],
    ["cobertura", "Existe cobertura contratual?"],
    ["responsabilidadeOpus", "Existe responsabilidade da Opus?"],
    ["laudoAnterior", "Existe laudo anterior relacionado?"],
    ["falhaExecutiva", "É uma falha executiva?"],
    ["reincidencia", "Existe reincidência?"],
    ["adimplente", "Cliente está adimplente?"]
  ],
  motivosLiberalidade: ["Relacionamento", "Jurídico", "Marca", "Erro construtivo", "Comercial", "Diretoria", "Outro", "NA"],
  perfisCliente: ["Crítico", "Ação judicial", "Notificação", "Relacionamento com a diretoria", "VIP"],
  tecnica: [
    ["validadaEngenharia", "Solução validada pela Engenharia", ["Sim", "Não", "NA"]],
    ["eliminaCausa", "Elimina causa raiz", ["Sim", "Não"]],
    ["normas", "Atende normas técnicas", ["Sim", "Não"]],
    ["fabricante", "Atende especificação fabricante", ["Sim", "Não"]],
    ["garantiaFornecedor", "Possui garantia fornecedor", ["Sim", "Não"]],
    ["riscoFuturo", "Gera risco futuro conhecido", ["Sim", "Não"]]
  ],
  riscos: ["Financeiro", "Jurídico", "Imagem", "Segurança", "Reincidência"],
  niveisRisco: ["Baixo", "Médio", "Alto"],
  pareceres: ["Favorável", "Não Favorável"],
  engenharia: ["Não consultado", "Favorável", "Não Favorável"]
};
