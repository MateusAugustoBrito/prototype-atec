// Protótipo estático (sem Salesforce, sem deploy). Router simples por hash.
// Markup construído com classes reais do SLDS (ver slds.js) + classes reais
// copiadas de atecListagem.css/atecNavegacao.css para bater com o visual do portal.
//
// O fluxo (etapas, regras, alçadas) vive em store.js; aqui ficam só as telas.
// Cada subpasso tem uma função render*, embrulhada por stepShell(), que mostra o
// responsável e bloqueia a tela quando o perfil "Atuando como" não é o dele.

const root = document.getElementById("app-root");

function showToast(message, variant = "success") {
  const toast = el("div", { class: `toast toast--${variant}` }, message);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), variant === "error" ? 4000 : 2600);
}

function navigate(hash) {
  window.location.hash = hash;
}

function sectionCard(titleText, children, headerExtra = null) {
  const header = el("div", { class: "section-title-row" }, [
    el("h2", { class: "section-title" }, titleText),
    headerExtra
  ]);
  return el("div", { class: "resumo-section slds-var-m-bottom_medium" }, [header, ...children]);
}

function fmtDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

// "2026-10-09" (input date) -> "09/10/2026"
function fmtDia(iso) {
  if (!iso) return "-";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function tempoDesde(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const horas = Math.floor(ms / 3600000);
  if (horas < 1) return "menos de 1 hora";
  if (horas < 24) return `${horas} hora${horas > 1 ? "s" : ""}`;
  const dias = Math.floor(horas / 24);
  return `${dias} dia${dias > 1 ? "s" : ""}`;
}

function parseValor(texto) {
  if (texto === "" || texto == null) return null;
  const n = Number(String(texto).replace(",", "."));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

// ============================================================================
// Header: seletor "Atuando como" + carregar/limpar dados
// ============================================================================
function renderHeaderControls() {
  const slot = document.getElementById("header-controls");
  slot.innerHTML = "";
  const select = el("select", { class: "role-select", id: "role-select", "aria-label": "Atuando como" },
    Object.values(ROLES).map((r) => {
      const opt = el("option", { value: r }, r);
      if (r === getCurrentRole()) opt.setAttribute("selected", "selected");
      return opt;
    }));
  select.addEventListener("change", (e) => trocarPerfil(e.target.value));

  slot.appendChild(el("label", { class: "role-label", for: "role-select" }, "Atuando como"));
  slot.appendChild(select);
  slot.appendChild(el("a", {
    href: "#", class: "reset-link", onclick: (e) => {
      e.preventDefault();
      carregarExemplos();
      showToast("Exemplos carregados.");
      navigate("#/inicio");
      render();
    }
  }, "Carregar exemplos"));
  slot.appendChild(el("a", {
    href: "#", class: "reset-link", onclick: (e) => {
      e.preventDefault();
      if (window.confirm("Isso vai apagar todas as ATECs criadas neste protótipo. Continuar?")) {
        resetStore();
        navigate("#/listagem");
        render();
      }
    }
  }, "Limpar dados de teste"));
}

function trocarPerfil(role) {
  setCurrentRole(role);
  renderHeaderControls();
  render();
  showToast(`Atuando como ${role}.`);
}

// ============================================================================
// Router
// ============================================================================
function render() {
  const scrollY = window.scrollY;
  const hash = window.location.hash || "#/inicio";
  root.innerHTML = "";
  renderNavegacao(hash);

  const vistoria = hash.match(/^#\/vistoria\/(.+)$/);
  const entrega = hash.match(/^#\/entrega\/(.+)$/);
  const ficha = hash.match(/^#\/ficha\/(.+)$/);
  const match = hash.match(/^#\/detalhe\/(.+)$/);
  document.body.classList.toggle("modo-vistoria", Boolean(vistoria || entrega || ficha));
  if (vistoria) {
    renderPaginaVistoria(decodeURIComponent(vistoria[1]));
    window.scrollTo(0, scrollY);
  } else if (entrega) {
    renderPaginaEntrega(decodeURIComponent(entrega[1]));
    window.scrollTo(0, scrollY);
  } else if (ficha) {
    renderPaginaFicha(decodeURIComponent(ficha[1]));
    window.scrollTo(0, scrollY);
  } else if (match) {
    renderDetalhe(decodeURIComponent(match[1]));
    window.scrollTo(0, scrollY);
  } else if (hash.startsWith("#/listagem")) {
    renderListagem();
  } else if (hash.startsWith("#/fora/")) {
    renderForaDoPrototipo(decodeURIComponent(hash.slice("#/fora/".length)));
  } else {
    renderInicio();
  }
}

window.addEventListener("hashchange", render);
// A vistoria roda em outra aba: quando ela grava, o Detalhe se atualiza sozinho.
// A própria página de vistoria não redesenha, para não perder o que está sendo digitado.
window.addEventListener("storage", () => {
  renderHeaderControls();
  if (!/^#\/(vistoria|entrega|ficha)\//.test(window.location.hash)) render();
});
window.addEventListener("DOMContentLoaded", () => {
  renderHeaderControls();
  render();
  if (dadosAntigosApagados) {
    showToast("O fluxo da ATEC mudou: as ATECs de teste da versão anterior foram apagadas.", "warning");
  }
});

// Executa uma ação do fluxo como o perfil atual e redesenha a tela
function agir(atec, nomeAcao, dados, mensagemOk) {
  try {
    executarAcao(atec.id, nomeAcao, getCurrentRole(), dados);
    if (mensagemOk) showToast(mensagemOk);
    render();
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ============================================================================
// Listagem
// ============================================================================
// ============================================================================
// Navegação do portal (espelho do LWC atecNavegacao): logo + "ATEC",
// "Olá, <nome>!" com avatar e a barra de menus.
// ============================================================================
let menuUsuarioAberto = false;

function iniciais(nome) {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "..";
  return partes.length > 1 ? (partes[0][0] + partes[partes.length - 1][0]).toUpperCase() : partes[0].slice(0, 2).toUpperCase();
}

function usuarioLogado() {
  return USUARIO_POR_PERFIL[getCurrentRole()] || null;
}

function renderNavegacao(hash) {
  const nav = document.getElementById("portal-nav");
  if (!nav) return;
  const pessoa = usuarioLogado();
  const nome = pessoa || getCurrentRole();
  const ativo = (item) => (item.hash === "#/inicio" ? !hash.startsWith("#/fora/") : hash.startsWith(item.hash));
  nav.innerHTML = "";
  nav.append(
    el("div", { class: "top-bar" }, [
      el("div", { class: "top-bar-left brand" }, [
        el("img", { class: "logo", src: "img/logo-opus-light.png", alt: "Opus" }),
        el("h4", { class: "slds-var-m-left_x-small" }, "ATEC")
      ]),
      el("div", { class: "top-bar-right" }, [
        el("div", { class: "welcome-text" }, `Olá, ${pessoa ? pessoa.split(" ")[0] : nome}!`),
        el("div", { class: "user-menu" }, [
          el("button", { type: "button", class: "user-avatar", title: nome, "aria-label": "Menu do Usuário", onclick: (e) => { e.stopPropagation(); menuUsuarioAberto = !menuUsuarioAberto; renderNavegacao(window.location.hash || "#/inicio"); } }, iniciais(nome)),
          menuUsuarioAberto
            ? el("div", { class: "user-menu-dropdown" }, el("ul", { class: "slds-list_vertical" }, [
              el("li", { class: "user-menu-item", onclick: () => { menuUsuarioAberto = false; showToast("Sair não faz parte do protótipo."); renderNavegacao(window.location.hash); } },
                el("div", { class: "menu-action-item" }, [el("span", { "aria-hidden": "true" }, "⎋"), el("span", {}, "Sair")]))
            ]))
            : null
        ])
      ])
    ]),
    el("div", { class: "bottom-bar" }, el("nav", {}, el("ul", { class: "slds-list_horizontal" }, NAVEGACAO_PORTAL.map((item) =>
      el("li", { class: `nav-item${ativo(item) ? " active" : ""}` }, el("a", { href: item.hash }, el("span", { class: "menu-label" }, item.label)))))))
  );
}

document.addEventListener("click", () => {
  if (menuUsuarioAberto) { menuUsuarioAberto = false; renderNavegacao(window.location.hash || "#/inicio"); }
});

function renderForaDoPrototipo(nome) {
  root.appendChild(el("div", { class: "resumo-section" }, [
    el("h2", { class: "section-title" }, nome),
    el("p", { class: "section-subtitle" }, `A tela de ${nome} existe no portal, mas não faz parte deste protótipo.`)
  ]));
}

// ============================================================================
// Dados derivados usados no Início e na Listagem (mesmos campos do portal)
// ============================================================================
function atecAberta(atec) {
  const f = atec.flow;
  return !(f.macro === "finalizada" || (f.macro === "negativa" && f.step === "finalizada"));
}

function statusPortal(atec) {
  return atecAberta(atec) ? "Aberto" : "Fechado";
}

function inicioDoDia(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dataAgendamentoVistoria(atec) {
  return valorCampoDetalhe(atec, "Nova_data_de_Agendamento_da_Vistoria") || valorCampoDetalhe(atec, "Data_de_Agendamento_da_Vistoria");
}

function ultimaModificacao(atec) {
  const h = atec.flow.history;
  return h.length ? h[h.length - 1].em : atec.CreatedDate;
}

function dataFechamento(atec) {
  const h = [...atec.flow.history].reverse().find((x) => x.acao === "ATEC finalizada" || x.acao === "ATEC finalizada (Negativa)");
  return h ? h.em : null;
}

function localAtec(atec) {
  return [atec.Empreendimento, atec.Unidade].filter(Boolean).join(" - ") || "Local não especificado";
}

// "ATEC's pendentes atualização": mesmas 3 regras de getAtecsPendentesAtualizacao (Apex)
function motivoPendencia(atec) {
  if (!atecAberta(atec)) return "";
  const hoje = inicioDoDia();
  const ag = dataAgendamentoVistoria(atec);
  if (atec.flow.macro === "vistoria" && ag && new Date(ag) < hoje) return "Atualização de Status";
  const fim = valorCampoDetalhe(atec, "Data_Prevista_de_Fim_do_Reparo");
  if (fim && new Date(`${fim}T00:00:00`) < hoje) return "Previsão de fim vencida";
  const seteDias = new Date(hoje);
  seteDias.setDate(seteDias.getDate() - 7);
  if (new Date(ultimaModificacao(atec)) < seteDias) return "Atualização imediata";
  return "";
}

// ============================================================================
// Início (espelho do LWC atecResumo): Seu Resumo, Relatório Semanal,
// ATEC's do dia, a vencer e pendentes de atualização
// ============================================================================
function cardAtec(atec, filhos, classe = "") {
  return el("div", { class: `atec-card shadow-card ${classe}`, onclick: () => navigate(`#/detalhe/${atec.id}`) }, filhos);
}

function vazio(texto) {
  return el("div", { class: "empty-message" }, el("p", { class: "slds-text-body_regular slds-text-align_center" }, texto));
}

function renderInicio() {
  const atecs = getAllAtecs();
  const abertas = atecs.filter(atecAberta);
  const hoje = inicioDoDia();
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  // Seu Resumo: total de abertas + uma contagem por Status Técnico, em 3 colunas
  const stats = MACRO_STAGES.filter((m) => m.key !== "finalizada").map((m) => ({ label: m.label, value: abertas.filter((a) => a.flow.macro === m.key).length }));
  stats.push({ label: "Negativa", value: abertas.filter((a) => a.flow.macro === "negativa").length });
  const colunas = [[], [], []];
  stats.forEach((st, i) => colunas[i % 3].push(st));

  const doDia = abertas.filter((a) => {
    const ag = dataAgendamentoVistoria(a);
    return ag && new Date(ag) >= hoje && new Date(ag) < amanha;
  });

  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + 10);
  const aVencer = abertas.map((a) => {
    const sla = valorCampoDetalhe(a, "Data_da_Previsao_de_Conclusao");
    if (!sla) return null;
    const data = new Date(`${String(sla).slice(0, 10)}T00:00:00`);
    if (data > limite) return null;
    const dias = Math.ceil((data - new Date()) / 86400000);
    return { atec: a, data, status: dias <= 3 ? "critico" : "atencao" };
  }).filter(Boolean).sort((x, y) => x.data - y.data);

  const pendentes = abertas.map((a) => ({ atec: a, motivo: motivoPendencia(a) })).filter((x) => x.motivo)
    .sort((x, y) => new Date(ultimaModificacao(x.atec)) - new Date(ultimaModificacao(y.atec)));

  root.append(
    el("div", { class: "resumo-section slds-var-m-bottom_x-small" }, el("div", { class: "inicio-titulo" }, [
      el("h2", { class: "section-title" }, "Seu Resumo 📈"),
      el("span", { class: "inicio-acoes" }, [
        sldsButton("Listagem de ATEC's", { onClick: () => navigate("#/listagem") }),
        [ROLES.FRONT, ROLES.ANALISTA].includes(getCurrentRole()) ? sldsButton("Nova ATEC", { variant: "brand", onClick: openModalCriarAtec }) : null
      ])
    ])),
    el("div", { class: "resumo-section slds-var-m-bottom_x-small" }, el("div", { class: "summary-flex-container" }, [
      el("div", { class: "summary-col-main" }, el("div", { class: "main-stat-card shadow-card", onclick: () => navigate("#/listagem") }, [
        el("span", { class: "main-stat-value" }, String(abertas.length)),
        el("span", { class: "main-stat-label" }, "ATEC's Abertas")
      ])),
      ...colunas.map((col) => el("div", { class: "summary-col-stats" }, col.map((st) => el("div", { class: "stat-card shadow-card" }, [
        el("span", { class: "stat-value" }, String(st.value)),
        el("span", { class: "stat-label" }, st.label)
      ]))))
    ])),
    el("div", { class: "resumo-section slds-var-m-bottom_x-small" }, [
      el("h2", { class: "section-title" }, "Relatório Semanal"),
      el("p", { class: "slds-text-body_small slds-var-m-bottom_x-small" }, [
        el("span", { class: "sla-legend atec-open" }, "Aberto"),
        el("span", { class: "sla-legend atec-close" }, "Fechado")
      ]),
      graficoSemanal(atecs)
    ]),
    el("div", { class: "resumo-section slds-var-m-bottom_x-small" }, [
      el("h2", { class: "section-title" }, `ATEC's do dia (${doDia.length}) 📍`),
      el("p", { class: "section-subtitle" }, "Faça o check-in na vistoria ao chegar no local."),
      el("div", { class: "scroll-container" }, doDia.length ? doDia.map((a) => cardAtec(a, [
        el("div", { class: "card-header" }, el("span", { class: "slds-text-title_bold" }, a.Name)),
        el("p", { class: "slds-text-body_small" }, localAtec(a)),
        el("p", { class: "slds-text-body_small" }, [el("b", {}, "Item:"), ` ${a.Item || "Item não especificado"}`]),
        el("p", { class: "slds-text-body_small" }, [el("b", {}, "Solicitante:"), ` ${a.Solicitante || "Solicitante não informado"}`]),
        el("p", { class: "slds-text-body_small" }, [el("b", {}, "Contato:"), ` ${a.Telefone || ""}`]),
        a.ClienteCritico ? el("span", { class: "slds-badge slds-badge_lightest badge-critico slds-var-m-vertical_small" }, "Cliente crítico") : null,
        el("p", { class: "slds-text-body_small slds-text-color_weak slds-var-m-top_small" }, fmtDataHoraCurta(dataAgendamentoVistoria(a))),
        el("div", { class: "slds-var-m-top_medium" }, sldsButton("Fazer Check-in", {
          variant: "success",
          extraClass: "slds-button_stretch",
          onClick: (e) => {
            e.stopPropagation();
            if (a.flow.macro === "vistoria" && ["registrar", "termo"].includes(a.flow.step)) window.open(urlPaginaVistoria(a), "_blank");
            else showToast(`${a.Name} não está na etapa de vistoria.`, "warning");
          }
        }))
      ])) : [vazio("Nenhum registro encontrado para o dia.")])
    ]),
    el("div", { class: "resumo-section slds-var-m-bottom_x-small" }, [
      el("h2", { class: "section-title" }, `ATEC's a vencer (${aVencer.length}) 🚩`),
      el("p", { class: "section-subtitle" }, "Somente ATEC's a vencer nos próximos 10 dias"),
      el("div", { class: "slds-grid slds-wrap" }, [
        el("div", {}, el("span", { class: "sla-legend sla-critico" }, `SLA restante de 0 a 3 dias (${aVencer.filter((x) => x.status === "critico").length})`)),
        el("div", {}, el("span", { class: "sla-legend sla-atencao" }, `SLA restante de 4 a 10 dias (${aVencer.filter((x) => x.status === "atencao").length})`))
      ]),
      el("div", { class: "scroll-container" }, aVencer.length ? aVencer.map(({ atec: a, data, status }) => cardAtec(a, [
        el("div", { class: "card-header" }, el("span", { class: "slds-text-title_bold" }, a.Name)),
        el("p", { class: "slds-text-body_small" }, [el("b", {}, "Data SLA:"), ` ${data.toLocaleDateString("pt-BR")}`]),
        el("p", { class: "slds-text-body_small" }, localAtec(a)),
        el("p", { class: "slds-text-body_small" }, [el("b", {}, "Item:"), ` ${a.Item || "Item não especificado"}`])
      ], `atec-vencer--${status}`)) : [vazio("Nenhum registro encontrado a vencer nos próximos 10 dias.")])
    ]),
    el("div", { class: "resumo-section" }, [
      el("h2", { class: "section-title" }, `ATEC's pendentes atualização (${pendentes.length}) 🔔`),
      el("p", { class: "section-subtitle" }, "Somente ATEC's pendentes de atualização"),
      el("div", { class: "scroll-container" }, pendentes.length ? pendentes.map(({ atec: a, motivo }) => cardAtec(a, [
        el("p", { class: "slds-text-title_bold" }, a.Name),
        el("p", { class: "slds-text-body_small" }, localAtec(a)),
        el("p", { class: "slds-text-body_small" }, [el("b", {}, "Item:"), ` ${a.Item || "Item não especificado"}`]),
        el("p", { class: "slds-text-body_small" }, [el("b", {}, "Motivo:"), ` ${motivo}`])
      ])) : [vazio("Nenhum registro pendente para atualização.")])
    ])
  );
  if (!atecs.length) {
    root.prepend(el("div", { class: "selo selo-info selo-bloco" }, [
      "Nenhuma ATEC criada ainda. Clique em ",
      el("a", { class: "link", href: "#", onclick: (e) => { e.preventDefault(); carregarExemplos(); render(); } }, "Carregar exemplos"),
      " para preencher o portal."
    ]));
  }
}

// Relatório Semanal (atecGrafico): ATECs abertas e fechadas nos últimos 7 dias
function graficoSemanal(atecs) {
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = inicioDoDia();
    d.setDate(d.getDate() - i);
    dias.push(d);
  }
  const mesmoDia = (iso, d) => iso && inicioDoDia(new Date(iso)).getTime() === d.getTime();
  const abertas = dias.map((d) => atecs.filter((a) => mesmoDia(a.CreatedDate, d)).length);
  const fechadas = dias.map((d) => atecs.filter((a) => mesmoDia(dataFechamento(a), d)).length);
  const max = Math.max(4, ...abertas, ...fechadas);
  const W = 720, H = 260, esq = 46, dir = 34, topo = 34, base = 46;
  const x = (i) => esq + (i * (W - esq - dir)) / 6;
  const y = (v) => topo + (H - topo - base) * (1 - v / max);
  const ns = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs, texto) => {
    const n = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (texto != null) n.textContent = texto;
    return n;
  };
  const g = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "grafico-semanal", role: "img", "aria-label": "Volume de ATECs abertas e fechadas na semana" });
  g.appendChild(svg("text", { x: W / 2, y: 18, "text-anchor": "middle", class: "grafico-titulo" }, "Volume de ATECs abertas e fechadas na semana"));
  for (let v = 0; v <= max; v += Math.ceil(max / 4)) {
    g.appendChild(svg("line", { x1: esq, x2: W - dir, y1: y(v), y2: y(v), class: v === 0 ? "grafico-zero" : "grafico-grade" }));
    g.appendChild(svg("text", { x: esq - 8, y: y(v) + 4, "text-anchor": "end", class: "grafico-eixo" }, String(v)));
  }
  dias.forEach((d, i) => g.appendChild(svg("text", { x: x(i), y: H - base + 18, "text-anchor": "middle", class: "grafico-eixo" }, d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }))));
  g.appendChild(svg("text", { x: W / 2, y: H - 6, "text-anchor": "middle", class: "grafico-eixo" }, "Dia da Semana"));
  g.appendChild(svg("text", { x: 12, y: (H - base + topo) / 2, "text-anchor": "middle", class: "grafico-eixo", transform: `rotate(-90 12 ${(H - base + topo) / 2})` }, "Quantidade"));
  [[abertas, "rgba(255, 99, 132, 1)", "rgba(255, 99, 132, 0.2)", "Abertas"], [fechadas, "rgba(75, 192, 192, 1)", "rgba(75, 192, 192, 0.3)", "Fechadas"]].forEach(([serie, cor, fundo, nome]) => {
    const pts = serie.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    g.appendChild(svg("polygon", { points: `${x(0)},${y(0)} ${pts} ${x(6)},${y(0)}`, fill: fundo }));
    g.appendChild(svg("polyline", { points: pts, fill: "none", stroke: cor, "stroke-width": 2 }));
    serie.forEach((v, i) => {
      const c = svg("circle", { cx: x(i), cy: y(v), r: 3.5, fill: cor });
      c.appendChild(svg("title", {}, `${nome}: ${v}`));
      g.appendChild(c);
    });
  });
  return el("div", { class: "grafico-wrap" }, g);
}

// ============================================================================
// Listagem (espelho do LWC atecListagem): filtros, Filtrar, Exportar e a
// tabela com as mesmas colunas
// ============================================================================
const filtrosListagem = { atec: "", empreendimento: "", unidade: "", sla: "", analista: [], status: "", statusTecnico: [], item: "" };

function linhaListagem(atec) {
  const c = (k) => valorCampoDetalhe(atec, k);
  const dia = (v) => (v ? fmtDia(String(v).slice(0, 10)) : "");
  const ultima = ultimaModificacao(atec);
  return {
    atec,
    "ATEC": atec.Name,
    "Status": statusPortal(atec),
    "Status SLA Técnico": c("Status_SLA_Tecnico") || "",
    "Status SLA": c("Status_SLA") || "",
    "Status Técnico": c("Status_Tecnico") || "",
    "Analista Responsável": atec.AnalistaResponsavel || "",
    "Data Criação": dia(atec.CreatedDate.slice(0, 10)),
    "Data Agendamento Vistoria": dataAgendamentoVistoria(atec) ? new Date(dataAgendamentoVistoria(atec)).toLocaleDateString("pt-BR") : "",
    "Preenchimento Laudo Vistoria": atec.flow.vistoria.termo ? new Date(atec.flow.vistoria.termo.em).toLocaleDateString("pt-BR") : "",
    "Data Prevista Início Reparo": dia(c("Data_Prevista_de_Inicio_do_Reparo")),
    "Data Prevista Fim Reparo": dia(c("Data_Prevista_de_Fim_do_Reparo")),
    "Data Prevista Conclusão": dia(c("Data_da_Previsao_de_Conclusao")),
    "Data Conclusão": dia(c("Data_de_Conclusao")),
    "Dias do Último Posicionamento": String(Math.floor((inicioDoDia() - inicioDoDia(new Date(ultima))) / 86400000)),
    "Data Ultima Modificação": new Date(ultima).toLocaleDateString("pt-BR"),
    "Empreendimento": atec.Empreendimento || "",
    "Unidade": atec.Unidade || "",
    "Cliente": atec.Cliente || "",
    "Item": atec.Item || "",
    "Sub Item": atec.SubItem || "",
    "Tipo Assistência Técnica": c("Tipo_de_Assistencia_Tecnica") || ""
  };
}

const COLUNAS_LISTAGEM = ["ATEC", "Status", "Status SLA Técnico", "Status SLA", "Status Técnico", "Analista Responsável", "Data Criação", "Data Agendamento Vistoria", "Preenchimento Laudo Vistoria", "Data Prevista Início Reparo", "Data Prevista Fim Reparo", "Data Prevista Conclusão", "Data Conclusão", "Dias do Último Posicionamento", "Data Ultima Modificação", "Empreendimento", "Unidade", "Cliente", "Item", "Sub Item", "Tipo Assistência Técnica"];

function aplicarFiltrosListagem(linhas) {
  const f = filtrosListagem;
  return linhas.filter((l) =>
    (!f.atec || l.ATEC.toLowerCase().includes(f.atec.toLowerCase())) &&
    (!f.empreendimento || l.Empreendimento === f.empreendimento) &&
    (!f.unidade || l.Unidade === f.unidade) &&
    (!f.sla || l["Status SLA Técnico"] === f.sla) &&
    (!f.analista.length || f.analista.includes(l["Analista Responsável"])) &&
    (!f.status || l.Status === f.status) &&
    (!f.statusTecnico.length || f.statusTecnico.includes(l["Status Técnico"])) &&
    (!f.item || l.Item === f.item));
}

// Lista de seleção múltipla (c-multi-pick-list): "N selecionados"
function multiSelecao(id, rotulo, opcoes, selecionados) {
  const resumo = () => (selecionados.length >= 2 ? `${selecionados.length} selecionados` : selecionados.join(", ") || `Selecione ${rotulo.toLowerCase()}`);
  const texto = el("span", { class: "multi__texto" }, resumo());
  return el("details", { class: "multi", id }, [
    el("summary", { class: "slds-select multi__resumo" }, texto),
    el("div", { class: "multi__opcoes" }, opcoes.map((op) => {
      const input = el("input", { type: "checkbox", value: op });
      if (selecionados.includes(op)) input.setAttribute("checked", "checked");
      input.addEventListener("change", () => {
        if (input.checked) selecionados.push(op);
        else selecionados.splice(selecionados.indexOf(op), 1);
        texto.textContent = resumo();
      });
      return el("label", { class: "multi__opcao" }, [input, el("span", {}, op)]);
    }))
  ]);
}

function exportarListagem(linhas) {
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const csv = [COLUNAS_LISTAGEM.map(esc).join(";"), ...linhas.map((l) => COLUNAS_LISTAGEM.map((c) => esc(l[c])).join(";"))].join("\r\n");
  const a = el("a", { href: URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })), download: `atecs-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function renderListagem() {
  const todas = getAllAtecs().map(linhaListagem);
  const linhas = aplicarFiltrosListagem(todas);
  const unicos = (campo, base = todas) => [...new Set(base.map((l) => l[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const f = filtrosListagem;
  const rascunho = { ...f, analista: [...f.analista], statusTecnico: [...f.statusTecnico] };

  const unidadeSelect = () => sldsSelect({ id: "fl-unidade", options: unicos("Unidade", rascunho.empreendimento ? todas.filter((l) => l.Empreendimento === rascunho.empreendimento) : todas), value: rascunho.unidade, placeholder: "Selecione a unidade:", onChange: (v) => (rascunho.unidade = v) });
  let unidadeAtual = unidadeSelect();
  const unidadeSlot = el("div", {}, unidadeAtual);

  const filtro = (rotulo, controle, id) => el("div", { class: "slds-col slds-size_1-of-1 slds-medium-size_4-of-12 slds-large-size_2-of-12 slds-var-m-bottom_x-small" },
    el("div", { class: "slds-form-element" }, [el("label", { class: "slds-form-element__label", for: id }, rotulo), el("div", { class: "slds-form-element__control" }, controle)]));

  const atecInput = sldsInput({ id: "fl-atec", value: rascunho.atec, placeholder: "Selecione a ATEC:", list: "fl-atec-lista", onInput: (v) => (rascunho.atec = v) });
  const filtrar = () => { Object.assign(filtrosListagem, rascunho); render(); };
  atecInput.addEventListener("keydown", (e) => { if (e.key === "Enter") filtrar(); });

  root.append(
    el("div", { class: "slds-var-m-bottom_medium breadcrumb" }, [el("a", { href: "#/inicio" }, "Início"), " / Listagem"]),
    el("div", { class: "resumo-section slds-var-m-bottom_small" }, el("div", { class: "inicio-titulo" }, [
      el("h2", { class: "section-title", style: "margin-bottom: 0" }, `Listagem de ATEC's (${linhas.length})`),
      [ROLES.FRONT, ROLES.ANALISTA].includes(getCurrentRole()) ? sldsButton("Nova ATEC", { variant: "brand", onClick: openModalCriarAtec }) : null
    ])),
    el("datalist", { id: "fl-atec-lista" }, todas.map((l) => el("option", { value: l.ATEC }))),
    el("div", { class: "slds-grid slds-wrap slds-gutters slds-grid_vertical-align-end slds-var-m-bottom_x-small filtros-listagem" }, [
      filtro("ATEC:", atecInput, "fl-atec"),
      filtro("Empreendimento:", sldsSelect({ id: "fl-emp", options: unicos("Empreendimento"), value: rascunho.empreendimento, placeholder: "Selecione o empreendimento:", onChange: (v) => {
        rascunho.empreendimento = v;
        rascunho.unidade = "";
        const novo = unidadeSelect();
        unidadeSlot.replaceChild(novo, unidadeAtual);
        unidadeAtual = novo;
      } }), "fl-emp"),
      filtro("Unidade:", unidadeSlot, "fl-unidade"),
      filtro("SLA:", sldsSelect({ id: "fl-sla", options: ["Dentro do Prazo", "Fora do Prazo"], value: rascunho.sla, placeholder: "Selecione o SLA:", onChange: (v) => (rascunho.sla = v) }), "fl-sla"),
      filtro("Analista Responsável:", multiSelecao("fl-analista", "o analista responsável", unicos("Analista Responsável"), rascunho.analista), "fl-analista"),
      filtro("Status:", sldsSelect({ id: "fl-status", options: ["Aberto", "Fechado"], value: rascunho.status, placeholder: "Selecione o status", onChange: (v) => (rascunho.status = v) }), "fl-status"),
      filtro("Status Técnico:", multiSelecao("fl-stec", "o status técnico", [...MACRO_STAGES.map((m) => m.label), "Negativa"], rascunho.statusTecnico), "fl-stec"),
      filtro("Item:", sldsSelect({ id: "fl-item", options: getItemOptions(), value: rascunho.item, placeholder: "Selecione o item", onChange: (v) => (rascunho.item = v) }), "fl-item"),
      el("div", { class: "slds-col slds-size_1-of-1 slds-medium-size_6-of-12 slds-large-size_2-of-12 slds-var-p-bottom_medium" },
        sldsButton("⏷ Filtrar", { variant: "brand", onClick: filtrar })),
      linhas.length ? el("div", { class: "slds-col slds-text-align_right slds-var-p-bottom_medium" },
        sldsButton("Exportar", { variant: "outline-brand", extraClass: "btn-exportar", onClick: () => exportarListagem(linhas) })) : null
    ]),
    linhas.length
      ? el("div", { class: "table-scroll tabela-listagem" }, el("table", { class: "slds-table slds-table_bordered slds-table_cell-buffer slds-table_striped" }, [
        el("thead", {}, el("tr", { class: "slds-line-height_reset" }, COLUNAS_LISTAGEM.map((c) => el("th", { scope: "col" }, el("div", { class: "slds-truncate", title: c }, c))))),
        el("tbody", {}, linhas.map((l) => el("tr", {}, COLUNAS_LISTAGEM.map((c) => c === "ATEC"
          ? el("th", { scope: "row" }, el("a", { class: "decoration", href: `#/detalhe/${l.atec.id}` }, l.ATEC))
          : el("td", {}, el("div", { class: "slds-truncate", title: l[c] }, l[c]))))))
      ]))
      : el("div", { class: "resumo-section" }, el("p", { class: "empty-state" }, todas.length ? "Nenhuma ATEC encontrada com esses filtros." : "Nenhuma ATEC criada ainda.")),
    el("p", { class: "listagem-rodape" }, `${linhas.length} de ${todas.length} registro(s)`)
  );
}

function statusBadge(status) {
  const cls = {
    "Aberta": "badge-info",
    "Em andamento": "badge-warning",
    "Em negativa": "badge-error",
    "Finalizada": "badge-success",
    "Finalizada – Negativa": "badge-muted"
  }[status] || "";
  return el("span", { class: `slds-badge ${cls}` }, status || "-");
}

function acaoTrocarPerfil(role) {
  return el("button", { type: "button", class: "slds-button slds-button_outline-brand btn-trocar", onclick: () => trocarPerfil(role) }, `Atuar como ${role}`);
}

// ============================================================================
// Modal "Nova ATEC"
// ============================================================================
function openModalCriarAtec() {
  const form = {
    cliente: "", empreendimento: "", unidade: "", solicitante: "", telefone: "", email: "",
    origem: "", canalAbertura: "", item: "", subItem: "", ambiente: "", subAmbiente: "",
    descricao: "", clienteCritico: false
  };

  const errorBox = el("div", { class: "field-error slds-var-m-top_small" }, "");

  const subItemControl = sldsSelect({ id: "f-subitem", options: [], placeholder: "Selecione o Item primeiro", disabled: true, onChange: (v) => (form.subItem = v) });
  const subItemField = sldsFormField({ label: "Sub Item:", id: "f-subitem", required: true, control: subItemControl });

  function rebuildSubItem(item) {
    form.subItem = "";
    const options = item ? getSubItemOptions(item) : [];
    const novoSelect = sldsSelect({
      id: "f-subitem", options,
      placeholder: options.length ? "Selecione..." : "Selecione o Item primeiro",
      disabled: !options.length,
      onChange: (v) => (form.subItem = v)
    });
    const control = subItemField.querySelector(".slds-form-element__control");
    control.innerHTML = "";
    control.appendChild(novoSelect);
  }

  const grid = el("div", { class: "form-grid-slds" }, [
    sldsFormField({ label: "Nome do Cliente:", id: "f-cliente", required: true, control: sldsInput({ id: "f-cliente", placeholder: "Digite ou selecione...", list: "clientes-datalist", onInput: (v) => (form.cliente = v) }) }),
    sldsFormField({ label: "Canal de abertura:", id: "f-canal", required: true, control: sldsSelect({ id: "f-canal", options: CANAL_ABERTURA_OPTIONS, onChange: (v) => (form.canalAbertura = v) }) }),
    sldsFormField({ label: "Empreendimento:", id: "f-empreendimento", control: sldsInput({ id: "f-empreendimento", list: "empreendimentos-datalist", onInput: (v) => (form.empreendimento = v) }) }),
    sldsFormField({ label: "Unidade:", id: "f-unidade", control: sldsInput({ id: "f-unidade", list: "unidades-datalist", onInput: (v) => (form.unidade = v) }) }),
    sldsFormField({ label: "Solicitante:", id: "f-solicitante", control: sldsInput({ id: "f-solicitante", onInput: (v) => (form.solicitante = v) }) }),
    sldsFormField({ label: "Telefone de Contato:", id: "f-telefone", control: sldsInput({ id: "f-telefone", type: "tel", onInput: (v) => (form.telefone = v) }) }),
    sldsFormField({ label: "Email do Solicitante:", id: "f-email", required: true, control: sldsInput({ id: "f-email", type: "email", onInput: (v) => (form.email = v) }) }),
    sldsFormField({ label: "Origem:", id: "f-origem", control: sldsSelect({ id: "f-origem", options: ORIGEM_OPTIONS, onChange: (v) => (form.origem = v) }) }),
    sldsFormField({ label: "Item:", id: "f-item", required: true, control: sldsSelect({ id: "f-item", options: getItemOptions(), onChange: (v) => { form.item = v; rebuildSubItem(v); } }) }),
    subItemField,
    sldsFormField({ label: "Ambiente:", id: "f-ambiente", control: sldsSelect({ id: "f-ambiente", options: AMBIENTE_OPTIONS, onChange: (v) => (form.ambiente = v) }) }),
    sldsFormField({ label: "Sub Ambiente:", id: "f-subambiente", control: sldsInput({ id: "f-subambiente", onInput: (v) => (form.subAmbiente = v) }) }),
    sldsFormField({ label: "Descrição:", id: "f-descricao", required: true, full: true, control: sldsTextarea({ id: "f-descricao", onInput: (v) => (form.descricao = v) }) }),
    sldsCheckbox({ id: "f-critico", label: "Cliente Crítico", onChange: (v) => (form.clienteCritico = v) })
  ]);

  const datalists = [
    el("datalist", { id: "clientes-datalist" }, CLIENTES_MOCK.map((c) => el("option", { value: c }))),
    el("datalist", { id: "empreendimentos-datalist" }, EMPREENDIMENTOS_MOCK.map((c) => el("option", { value: c }))),
    el("datalist", { id: "unidades-datalist" }, UNIDADES_MOCK.map((c) => el("option", { value: c })))
  ];

  const modalRef = sldsModal({
    title: "Nova ATEC",
    bodyNode: [grid, errorBox, ...datalists],
    footerNode: [
      sldsButton("Cancelar", { onClick: () => closeModal() }),
      sldsButton("Criar", {
        variant: "brand",
        onClick: () => {
          if (!form.cliente || !form.canalAbertura || !form.email || !form.item || !form.subItem || !form.descricao) {
            errorBox.textContent = "Preencha os campos obrigatórios: Nome do Cliente, Canal de abertura, Email, Item, Sub Item e Descrição.";
            return;
          }
          const atec = createAtec(form, getCurrentRole());
          closeModal();
          showToast(`${atec.Name} criada com sucesso!`);
          navigate(`#/detalhe/${atec.id}`);
        }
      })
    ],
    onClose: () => closeModal()
  });

  function closeModal() {
    modalRef.section.remove();
    modalRef.backdrop.remove();
  }

  document.body.appendChild(modalRef.section);
  document.body.appendChild(modalRef.backdrop);
}

// ============================================================================
// Detalhe
// ============================================================================
function renderDetalhe(id) {
  const atec = getAtec(id);

  if (!atec) {
    root.appendChild(sectionCard("ATEC não encontrada", [
      el("a", { class: "link", href: "#", onclick: (e) => { e.preventDefault(); navigate("#/listagem"); } }, "Voltar para a listagem")
    ]));
    return;
  }

  root.appendChild(el("div", { class: "slds-var-m-bottom_small breadcrumb" }, [
    el("a", { href: "#/listagem" }, "Início"),
    ` / ${atec.Name}`
  ]));

  root.appendChild(sldsTabs([
    { label: "Detalhe", content: renderDetalheTab(atec) },
    { label: "Classificação IA ✨", content: renderForaDeEscopoTab("Classificação IA") },
    { label: "Anexos", content: renderForaDeEscopoTab("Upload/listagem de anexos") },
    { label: "Cotações", content: renderCotacoesTab(atec) },
    { label: "Relacionados", content: renderRelacionadosTab(atec) }
  ]));
}

// Aba "Detalhe": card do fluxo no lugar do c-path e, abaixo, as mesmas seções,
// campos e botões Editar/Cancelar/Salvar do LWC atecDetalhe.
let edicaoDetalhe = null; // { atecId, valores, erros }

function iniciarEdicaoDetalhe(atec) {
  const valores = {};
  DETALHE_SECOES.forEach((s) => s.campos.forEach((c) => (valores[c.key] = valorCampoDetalhe(atec, c.key) || "")));
  edicaoDetalhe = { atecId: atec.id, valores, erros: {} };
  render();
}

function cancelarEdicaoDetalhe() {
  edicaoDetalhe = null;
  render();
}

function salvarEdicaoDetalhe(atec) {
  const erros = salvarDetalhe(atec.id, edicaoDetalhe.valores, getCurrentRole());
  if (Object.keys(erros).length) {
    edicaoDetalhe.erros = erros;
    showToast(Object.values(erros).join(" "), "error");
    render();
    return;
  }
  edicaoDetalhe = null;
  showToast("ATEC atualizada com sucesso");
  render();
}

function botoesEdicaoDetalhe(atec, editando) {
  return el("div", { class: "detalhe-acoes" }, editando
    ? [sldsButton("Cancelar", { onClick: cancelarEdicaoDetalhe }), sldsButton("Salvar", { variant: "brand", onClick: () => salvarEdicaoDetalhe(atec) })]
    : [sldsButton("✎ Editar", { onClick: () => iniciarEdicaoDetalhe(atec) })]);
}

function fmtDataHoraCurta(valor) {
  if (!valor) return "";
  return new Date(valor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function textoCampoDetalhe(campo, valor) {
  if (!valor) return "";
  if (campo.tipo === "data") return fmtDia(String(valor).slice(0, 10));
  if (campo.tipo === "dataHora") return fmtDataHoraCurta(valor);
  return String(valor);
}

function classeColunaDetalhe(campo) {
  if (campo.largura === "inteira") return "slds-col slds-size_1-of-1 slds-medium-size_1-of-3 slds-large-size_1-of-4";
  if (campo.largura === "meia") return "slds-col slds-size_1-of-1 slds-medium-size_1-of-2 slds-large-size_1-of-4";
  return "slds-col slds-size_1-of-2 slds-medium-size_1-of-3 slds-large-size_1-of-4";
}

// datetime-local quer "AAAA-MM-DDTHH:MM" no horário local
function paraInputDataHora(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function controleEdicaoDetalhe(atec, campo) {
  const ed = edicaoDetalhe;
  const id = `det-${campo.key}`;
  const valor = ed.valores[campo.key] || "";
  const mudar = (v) => {
    ed.valores[campo.key] = v;
    if (ed.erros[campo.key]) {
      delete ed.erros[campo.key];
      const coluna = document.getElementById(id) && document.getElementById(id).closest(".detalhe-campo");
      if (coluna) {
        coluna.classList.remove("slds-has-error");
        const ajuda = coluna.querySelector(".slds-form-element__help");
        if (ajuda) ajuda.remove();
      }
    }
  };
  if (campo.editar === "select") {
    const opcoes = opcoesCampoDetalhe(atec, campo.key);
    // mantém o valor atual mesmo se não estiver na lista de exemplo
    const lista = valor && !opcoes.includes(valor) ? [valor, ...opcoes] : opcoes;
    return sldsSelect({ id, options: lista, value: valor, onChange: mudar });
  }
  if (campo.editar === "textarea") return sldsTextarea({ id, value: valor, rows: 3, onInput: mudar });
  if (campo.editar === "date") return sldsInput({ id, type: "date", value: String(valor).slice(0, 10), onInput: mudar });
  if (campo.editar === "datetime") {
    const input = sldsInput({ id, type: "datetime-local", value: paraInputDataHora(valor), onInput: (v) => mudar(v ? new Date(v).toISOString() : "") });
    return input;
  }
  return null;
}

function campoDetalhe(atec, campo) {
  const editando = edicaoDetalhe && edicaoDetalhe.atecId === atec.id;
  const valor = valorCampoDetalhe(atec, campo.key);
  const coluna = classeColunaDetalhe(campo);

  if (editando && campo.editar && campo.editar !== "fluxo") {
    const erro = edicaoDetalhe.erros[campo.key];
    return el("div", { class: `${coluna} detalhe-campo slds-form-element${erro ? " slds-has-error" : ""}` }, [
      el("label", { class: "slds-form-element__label", for: `det-${campo.key}` }, campo.label),
      el("div", { class: "slds-form-element__control" }, controleEdicaoDetalhe(atec, campo)),
      erro ? el("div", { class: "slds-form-element__help" }, erro) : null
    ]);
  }

  const texto = textoCampoDetalhe(campo, valor);
  const conteudo = campo.tipo === "link" && texto
    ? el("a", { href: "#", class: "slds-text-link", onclick: (e) => e.preventDefault() }, el("span", { class: "field-value" }, texto))
    : el("span", { class: "field-value" }, texto);
  return el("div", { class: `${coluna} detalhe-campo` }, [
    el("span", { class: "field-label" }, campo.label),
    el("div", { class: "field-value-container" }, [conteudo]),
    editando && campo.editar === "fluxo" ? el("p", { class: "detalhe-nota" }, "Definido pelo fluxo da ATEC") : null
  ]);
}

// ---------- seções com o que foi preenchido nas etapas já concluídas ----------
function etapaConcluida(atec, macro) {
  return atec.flow.visited.includes(macro) && atec.flow.macro !== macro;
}

// "Concluída em <data> por <perfil>", a partir do histórico
function conclusaoEtapa(atec, acao) {
  const h = [...atec.flow.history].reverse().find((x) => x.acao === acao);
  return h ? el("p", { class: "etapa-preenchida__meta" }, `Concluída em ${fmtDataHoraCurta(h.em)} por ${h.perfil}`) : null;
}

function secaoEtapaPreenchida(titulo, meta, corpo) {
  return el("div", { class: "resumo-section slds-var-m-bottom_x-small etapa-preenchida" }, [
    el("div", { class: "section-title slds-grid slds-grid_align-spread" }, [
      el("h2", {}, titulo),
      el("span", { class: "selo selo-success" }, "Etapa concluída")
    ]),
    meta,
    ...corpo
  ]);
}

function renderEtapasPreenchidas(atec) {
  const f = atec.flow;
  const secoes = [];

  if (etapaConcluida(atec, "abertura")) {
    secoes.push(secaoEtapaPreenchida("Abertura", conclusaoEtapa(atec, "Checklist de abertura concluído"), [
      sldsFieldsGrid([
        ["Canal de abertura:", atec.CanalAbertura],
        ["Analista atribuído:", f.atribuicao && f.atribuicao.analista],
        ["Carteira:", f.atribuicao && f.atribuicao.carteira]
      ]),
      renderChecklistLeitura(getChecklistAbertura(atec.Item, atec.SubItem), f.abertura.checklistAnswers,
        atec.CanalAbertura === "Portal ATEC" ? "Briefing do Portal" : "Checklist de abertura")
    ]));
  }

  if (etapaConcluida(atec, "triagem")) {
    const n2 = f.nivel2 && f.nivel2.origem === "triagem" && f.nivel2.motivo ? f.nivel2 : null;
    secoes.push(secaoEtapaPreenchida("Triagem", conclusaoEtapa(atec, "Triagem concluída"), [
      sldsFieldsGrid([
        ["Item na garantia:", f.triagem.garantia],
        f.triagem.habiteSe ? ["Data do Habite-se:", fmtDiaISO(f.triagem.habiteSe)] : null,
        f.triagem.garantiaAte ? ["Garantia até:", fmtDiaISO(f.triagem.garantiaAte)] : null,
        ["Observação da triagem:", f.triagem.observacao],
        n2 ? ["Análise Nível 02 — motivo:", n2.motivo === "Outro" ? `Outro: ${n2.outroTexto}` : n2.motivo] : null,
        n2 ? ["Análise Nível 02 — seguiu com a ATEC:", n2.seguir] : null
      ].filter(Boolean))
    ]));
  }

  const v = f.vistoria;
  if (etapaConcluida(atec, "vistoria") && v.termo) {
    const checklistTecnico = getChecklistFor(atec.Item, atec.SubItem);
    const n2 = f.nivel2 && f.nivel2.origem === "vistoria" && f.nivel2.motivo ? f.nivel2 : null;
    secoes.push(secaoEtapaPreenchida("Vistoria em campo", conclusaoEtapa(atec, "Vistoria concluída"), [
      sldsFieldsGrid([
        ["Data da vistoria:", fmtDia(v.data)],
        ["Técnico responsável:", v.tecnico],
        ["Valor estimado do reparo:", v.valorEstimado != null ? fmtBRL(v.valorEstimado) : null],
        ["Necessário investigação:", v.necessarioInvestigacao],
        ["Observações:", v.observacoes],
        ["Outros anexos:", (v.anexos || []).join(", ")],
        n2 ? ["Análise Nível 02 — motivo:", n2.motivo === "Outro" ? `Outro: ${n2.outroTexto}` : n2.motivo] : null
      ].filter(Boolean)),
      (v.fotos || []).length
        ? el("div", {}, [
          el("span", { class: "field-label" }, `Fotos (${v.fotos.length}):`),
          el("div", { class: "fotos-grid" }, v.fotos.map((foto) => el("figure", { class: "foto" }, [el("img", { src: foto.dataUrl, alt: foto.nome }), el("figcaption", {}, foto.nome)])))
        ])
        : null,
      checklistTecnico ? renderChecklistLeitura(checklistTecnico, v.checklistAnswers, `Checklist técnico — ${atec.Item} / ${atec.SubItem}`) : null,
      el("div", { class: "termo-resumo" }, [
        el("div", {}, [
          el("span", { class: "field-label" }, "Termo de vistoria:"),
          el("p", { class: "field-value" }, `Assinado por ${v.termo.nome} em ${fmtDataHoraCurta(v.termo.em)}`)
        ]),
        el("span", { class: "termo-resumo__acoes" }, [
          sldsButton("Ver termo assinado", { onClick: () => window.open(urlPaginaVistoria(atec), "_blank") }),
          sldsButton("Imprimir / salvar PDF", { onClick: () => imprimirTermo(atec) })
        ])
      ])
    ]));
  }
  const r = f.reparo;
  if (r && r.termo && (etapaConcluida(atec, "reparo") || f.step === "finalizar")) {
    const e = r.entrega;
    const recusas = r.validacoes.filter((x) => x.resultado === "reprovado");
    secoes.push(secaoEtapaPreenchida("Reparo — entrega do serviço", conclusaoEtapa(atec, "Cliente assinou o termo de entrega"), [
      sldsFieldsGrid([
        ["Data de início:", fmtDia(e.dataInicio)],
        ["Data de conclusão:", fmtDia(e.dataConclusao)],
        ["Executado por:", e.executadoPor],
        ["Cotação:", (cotacaoDoPlanejamento(atec) || {}).Name],
        ["Serviço executado:", e.servicoExecutado],
        ["Observações:", e.observacoes],
        ["Outros anexos:", (e.anexos || []).join(", ")],
        recusas.length ? ["Recusas anteriores do cliente:", recusas.map((x) => x.motivo).join(" · ")] : null
      ].filter(Boolean)),
      (e.fotos || []).length
        ? el("div", {}, [
          el("span", { class: "field-label" }, `Fotos (${e.fotos.length}):`),
          el("div", { class: "fotos-grid" }, e.fotos.map((foto) => el("figure", { class: "foto" }, [el("img", { src: foto.dataUrl, alt: foto.nome }), el("figcaption", {}, foto.nome)])))
        ])
        : null,
      el("div", { class: "termo-resumo" }, [
        el("div", {}, [
          el("span", { class: "field-label" }, "Termo de entrega:"),
          el("p", { class: "field-value" }, `Assinado por ${r.termo.nome} em ${fmtDataHoraCurta(r.termo.em)}`)
        ]),
        el("span", { class: "termo-resumo__acoes" }, [
          sldsButton("Ver termo assinado", { onClick: () => window.open(urlPaginaEntrega(atec), "_blank") }),
          sldsButton("Imprimir / salvar PDF", { onClick: () => imprimirTermoEntrega(atec) })
        ])
      ])
    ]));
  }
  return secoes;
}

function renderDetalheTab(atec) {
  const editando = edicaoDetalhe && edicaoDetalhe.atecId === atec.id;
  const secoes = DETALHE_SECOES.map((secao, i) => el("div", { class: "resumo-section slds-var-m-bottom_x-small" }, [
    el("div", { class: "section-title slds-grid slds-grid_align-spread" }, el("h2", {}, secao.titulo)),
    el("div", { class: "slds-grid slds-wrap slds-gutters" }, secao.campos.map((c) => campoDetalhe(atec, c))),
    // como no LWC: Cancelar/Salvar também no fim da última seção
    editando && i === DETALHE_SECOES.length - 1 ? el("div", { class: "slds-var-m-top_large" }, botoesEdicaoDetalhe(atec, true)) : null
  ]));
  return el("div", { class: editando ? "detalhe-editando" : "" }, [
    renderFluxoCard(atec),
    botoesEdicaoDetalhe(atec, editando),
    ...secoes,
    ...renderEtapasPreenchidas(atec),
    // histórico de transições por último, depois de todas as seções
    el("div", { class: "resumo-section slds-var-m-bottom_x-small" }, [renderHistorico(atec)])
  ]);
}

function renderForaDeEscopoTab(nome) {
  return el("div", { class: "resumo-section" }, [
    el("p", { class: "etapa-fim-escopo" }, `${nome} não faz parte do escopo deste protótipo.`)
  ]);
}

// Aba "Cotações": botão Criar Cotação + lista com as colunas do atecListaCotacoes
function renderCotacoesTab(atec) {
  const cotacoes = atec.cotacoes || [];
  const corpo = cotacoes.length
    ? el("table", { class: "slds-table slds-table_bordered slds-table_cell-buffer mini-table tabela-cotacoes" }, [
      el("thead", {}, el("tr", {}, ["Cod.", "Status", "Status da Aprovação", "Valor Total", "Saldo da Cotação"].map((t, i) => el("th", { class: i >= 3 ? "num" : "" }, t)))),
      el("tbody", {}, cotacoes.flatMap((c) => {
        const detalhe = el("tr", { class: "cotacao-detalhe", hidden: "hidden" }, el("td", { colspan: "5" }, detalheCotacao(c)));
        return [
          el("tr", {}, [
            el("td", {}, el("a", { href: "#", class: "slds-text-link", onclick: (e) => { e.preventDefault(); detalhe.hidden = !detalhe.hidden; } }, c.Name)),
            el("td", {}, c.Status),
            el("td", {}, el("span", { class: `selo ${seloStatusAprovacao(c.Status_Aprovacao)}` }, c.Status_Aprovacao)),
            el("td", { class: "num" }, fmtBRL(c.valorTotal)),
            el("td", { class: "num" }, fmtBRL(c.valorTotal))
          ]),
          detalhe
        ];
      }))
    ])
    : el("p", { class: "empty-state" }, "Nenhuma cotação encontrada.");
  return el("div", { class: "resumo-section green" }, [
    el("div", { class: "slds-text-align_right" }, [sldsButton("Criar Cotação", { variant: "brand", onClick: () => abrirCriarCotacao(atec) })]),
    el("div", { class: "slds-var-m-top_large" }, [corpo])
  ]);
}

function seloStatusAprovacao(status) {
  return { Aprovada: "selo-success", Reprovada: "selo-error", "Em aprovação": "selo-warning", "Em negociação": "selo-warning" }[status] || "selo-info";
}

function detalheCotacao(c) {
  return el("div", { class: "cotacao-detalhe__corpo" }, [
    resumoLinhas([
      ["Tipo de cotação", c.tipo],
      ["Tipo ATEC", c.itemOrcamento],
      ["Outros Contatos Fornecedor", c.outrosContatos],
      ["Observação Geral", c.observacao],
      ["Anexos", c.anexos.join(", ")],
      ["Criada em", `${fmtDataHoraCurta(c.criadaEm)} por ${c.Cotador}`]
    ]),
    el("table", { class: "slds-table slds-table_bordered slds-table_cell-buffer mini-table" }, [
      el("thead", {}, el("tr", {}, ["Item", "Fornecedor", "Qtd.", "Vlr. Unit.", "Vlr. Total"].map((t, i) => el("th", { class: i >= 2 ? "num" : "" }, t)))),
      el("tbody", {}, c.itens.map((i) => el("tr", {}, [
        el("td", {}, i.descricao), el("td", {}, i.fornecedor), el("td", { class: "num" }, String(i.quantidade)),
        el("td", { class: "num" }, fmtBRL(i.valorUnitario)), el("td", { class: "num" }, fmtBRL(i.valorTotalItem))
      ])))
    ])
  ]);
}

// Modal "Criar Cotação" — conteúdo copiado do LWC atecCriarCotacao
// (Tipo de cotação, Tipo ATEC, Outros Contatos, Observação Geral, Valor Total,
// tabela de itens e Anexos), com os botões Fechar/Confirmar do c/modal.
const CLASSES_FINANCEIRAS_ATEC = [
  "367 - Manutenção pós entrega",
  "540 - Assistência por liberalidade da incorporação",
  "536 - Outras Despesas - Empreendimentos entregues"
];

function abrirCriarCotacao(atec) {
  const cot = { tipo: "", itemOrcamento: "", outrosContatos: "", observacao: "", anexos: [], itens: [] };
  let erros = {};
  let itemTempId = 0;

  const totalEl = el("div", { class: "cot-total__valor" }, fmtBRL(0));
  const calcularTotal = () => {
    totalEl.textContent = fmtBRL(cot.itens.reduce((t, i) => t + (i.quantidade || 0) * (i.valorUnitario || 0), 0));
  };

  const ajuda = (chave) => (erros[chave] ? el("div", { class: "slds-form-element__help" }, erros[chave]) : null);
  const limparErro = (chave, wrap) => {
    if (!erros[chave]) return;
    delete erros[chave];
    wrap.classList.remove("slds-has-error");
    const h = wrap.querySelector(".slds-form-element__help");
    if (h) h.remove();
  };

  const radio = (chave, label, opcoes) => {
    const wrap = el("fieldset", { class: `slds-form-element cot-radio${erros[chave] ? " slds-has-error" : ""}` }, [
      el("legend", { class: "slds-form-element__legend slds-form-element__label" }, [el("abbr", { class: "slds-required", title: "obrigatório" }, "*"), label]),
      el("div", { class: "slds-form-element__control" }, opcoes.map((op, i) => {
        const id = `cot-${chave}-${i}`;
        const input = el("input", { type: "radio", name: `cot-${chave}`, id, value: op });
        if (cot[chave] === op) input.setAttribute("checked", "checked");
        input.addEventListener("change", () => { cot[chave] = op; limparErro(chave, wrap); });
        return el("span", { class: "slds-radio" }, [input, el("label", { class: "slds-radio__label", for: id }, [el("span", { class: "slds-radio_faux" }), el("span", { class: "slds-form-element__label" }, op)])]);
      })),
      ajuda(chave)
    ]);
    return wrap;
  };

  const areaTexto = (chave, label, { obrigatorio = false, placeholder = "" } = {}) => {
    const t = sldsTextarea({ id: `cot-${chave}`, value: cot[chave], rows: 3, onInput: (v) => { cot[chave] = v; limparErro(chave, wrap); } });
    if (placeholder) t.setAttribute("placeholder", placeholder);
    const wrap = el("div", { class: `slds-form-element slds-var-m-bottom_small${erros[chave] ? " slds-has-error" : ""}` }, [
      el("label", { class: "slds-form-element__label", for: `cot-${chave}` }, [obrigatorio ? el("abbr", { class: "slds-required", title: "obrigatório" }, "*") : null, label]),
      el("div", { class: "slds-form-element__control" }, t),
      ajuda(chave)
    ]);
    return wrap;
  };

  const celula = (item, campoItem, controle) => {
    const chave = `item-${item.id}-${campoItem}`;
    const wrap = el("div", { class: `slds-form-element${erros[chave] ? " slds-has-error" : ""}` }, [controle, ajuda(chave)]);
    controle.addEventListener("input", () => limparErro(chave, wrap));
    controle.addEventListener("change", () => limparErro(chave, wrap));
    return wrap;
  };

  const areaItens = el("div");
  const desenharItens = () => {
    areaItens.innerHTML = "";
    if (!cot.itens.length) {
      areaItens.appendChild(el("div", { class: "slds-text-align_center slds-var-p-around_medium slds-text-color_weak" }, "Clique no botão '+' para adicionar o primeiro item."));
      return;
    }
    areaItens.appendChild(el("table", { class: "slds-table slds-table_cell-buffer slds-table_bordered slds-table_col-bordered cot-itens" }, [
      el("thead", {}, el("tr", { class: "slds-line-height_reset" }, ["Item", "Fornecedor", "Qtd.", "Vlr. Unit.", "Vlr. Total", ""].map((t) => el("th", {}, t)))),
      el("tbody", {}, cot.itens.map((item) => {
        const totalItem = el("span", {}, fmtBRL((item.quantidade || 0) * (item.valorUnitario || 0)));
        const atualizarLinha = () => { totalItem.textContent = fmtBRL((item.quantidade || 0) * (item.valorUnitario || 0)); calcularTotal(); };
        const desc = sldsInput({ id: `cot-item-${item.id}-desc`, value: item.descricao, placeholder: "Descrição do Item", onInput: (v) => (item.descricao = v) });
        desc.setAttribute("maxlength", "80");
        const forn = sldsInput({ id: `cot-item-${item.id}-forn`, value: item.fornecedor || "", placeholder: "Buscar Fornecedor...", list: "cot-fornecedores", onInput: (v) => (item.fornecedor = v) });
        const qtd = sldsInput({ id: `cot-item-${item.id}-qtd`, type: "number", value: String(item.quantidade), onInput: (v) => { item.quantidade = parseFloat(v) || 0; atualizarLinha(); } });
        qtd.setAttribute("min", "1"); qtd.setAttribute("step", "1");
        const vu = sldsInput({ id: `cot-item-${item.id}-vu`, type: "number", value: item.valorUnitario != null ? String(item.valorUnitario) : "", placeholder: "R$ 0,00", onInput: (v) => { item.valorUnitario = v === "" ? null : parseFloat(v); atualizarLinha(); } });
        vu.setAttribute("min", "0.01"); vu.setAttribute("step", "0.01");
        return el("tr", { class: "slds-hint-parent" }, [
          el("td", { "data-label": "Item" }, celula(item, "descricao", desc)),
          el("td", { "data-label": "Fornecedor" }, celula(item, "fornecedor", forn)),
          el("td", { "data-label": "Qtd." }, celula(item, "quantidade", qtd)),
          el("td", { "data-label": "Vlr. Unit." }, celula(item, "valorUnitario", vu)),
          el("td", { "data-label": "Vlr. Total", class: "num" }, totalItem),
          el("td", { class: "slds-cell-shrink" }, el("button", { type: "button", class: "slds-button slds-button_icon slds-button_icon-border-filled cot-remover", title: "Remover item", onclick: () => { cot.itens = cot.itens.filter((x) => x !== item); desenharItens(); calcularTotal(); } }, "🗑"))
        ]);
      }))
    ]));
  };

  const corpo = el("div");
  const desenhar = () => {
    corpo.innerHTML = "";
    corpo.append(
      el("datalist", { id: "cot-fornecedores" }, FORNECEDORES_MOCK.map((f) => el("option", { value: f }))),
      el("div", { class: "slds-box slds-theme_default slds-var-m-bottom_medium" }, el("div", { class: "cot-grid" }, [
        el("div", {}, [radio("tipo", "Tipo de cotação", ["Serviço", "Produto"]), radio("itemOrcamento", "Tipo ATEC", CLASSES_FINANCEIRAS_ATEC)]),
        el("div", {}, [
          areaTexto("outrosContatos", "Outros Contatos Fornecedor", { placeholder: "E-mails, telefones..." }),
          areaTexto("observacao", "Observação Geral", { obrigatorio: true })
        ]),
        el("div", { class: "cot-total" }, [el("span", { class: "slds-form-element__label" }, "Valor Total da Cotação"), totalEl])
      ])),
      el("div", { class: "slds-box slds-theme_default slds-var-m-bottom_medium" }, [
        el("div", { class: "cot-itens__topo" }, [
          el("h3", { class: "slds-text-heading_small" }, "Itens da cotação"),
          el("button", { type: "button", class: "slds-button slds-button_icon slds-button_icon-brand cot-adicionar", title: "Adicionar item", onclick: () => {
            itemTempId++;
            cot.itens.push({ id: itemTempId, descricao: "", quantidade: 1, valorUnitario: null, fornecedor: "" });
            desenharItens();
          } }, "+")
        ]),
        areaItens
      ]),
      el("div", { class: "slds-box slds-theme_default" }, [
        el("h3", { class: "slds-text-heading_small slds-var-m-bottom_small" }, "Anexos"),
        seletorAnexos("cot-anexos", cot.anexos, (n) => (cot.anexos = n))
      ])
    );
    desenharItens();
    calcularTotal();
  };
  desenhar();

  const fechar = () => { modalRef.section.remove(); modalRef.backdrop.remove(); };
  const confirmar = () => {
    let resultado;
    try {
      resultado = criarCotacao(atec.id, cot, getCurrentRole());
    } catch (e) {
      showToast(e.message, "error");
      return;
    }
    if (resultado.erros) {
      erros = resultado.erros;
      desenhar();
      showToast("Por favor, preencha todos os campos obrigatórios corretamente.", "error");
      return;
    }
    fechar();
    showToast(resultado.seguiuFluxo ? "Cotação salva com sucesso! Orçamento enviado no fluxo da ATEC." : "Cotação salva com sucesso!");
    render();
  };
  const modalRef = sldsModal({
    title: "Criar Cotação",
    bodyNode: [corpo],
    footerNode: [sldsButton("Fechar", { onClick: fechar }), sldsButton("Confirmar", { variant: "brand", onClick: confirmar })],
    onClose: fechar
  });
  modalRef.section.classList.add("slds-modal_large");
  document.body.append(modalRef.section, modalRef.backdrop);
}

function relacionadoSection(title, colorClass, headerButton = null, conteudo = null) {
  return el("div", { class: "resumo-section slds-var-m-bottom_medium", style: "padding:0" }, [
    el("div", { class: `resumo-section_header ${colorClass}` }, [el("h2", {}, title), headerButton]),
    el("div", { class: "slds-var-p-around_medium" }, [conteudo || el("p", { class: "empty-state" }, "Nenhum registro encontrado.")])
  ]);
}

// Mesmas colunas de atecListaVistorias (Cod., Data Fim, Status); o termo
// assinado na vistoria em campo aparece aqui e abre na página da vistoria.
function listaVistorias(atec) {
  const termo = atec.flow.vistoria && atec.flow.vistoria.termo;
  if (!termo) return null;
  return el("table", { class: "slds-table slds-table_bordered slds-table_cell-buffer mini-table" }, [
    el("thead", {}, el("tr", {}, [el("th", {}, "Cod."), el("th", {}, "Data Fim"), el("th", {}, "Status")])),
    el("tbody", {}, el("tr", {}, [
      el("td", {}, el("a", { href: urlPaginaVistoria(atec), target: "_blank", class: "slds-text-link" }, `Termo de vistoria — ${atec.Name}`)),
      el("td", {}, fmtDataHoraCurta(termo.em)),
      el("td", {}, `Assinado por ${termo.nome}`)
    ]))
  ]);
}

function renderRelacionadosTab(atec) {
  const btnComentario = sldsButton("Criar Comentário", {
    variant: "brand",
    onClick: () => showToast("Criação de comentário não faz parte do escopo deste protótipo.", "warning")
  });
  return el("div", {}, [
    relacionadoSection("Comentários", "blueComentario", btnComentario),
    relacionadoSection("Contratos Mega", "green"),
    relacionadoSection("Vistorias", "blueVistoriaDeUnidade", null, listaVistorias(atec)),
    relacionadoSection("Personalizações", "bluePersonalizacao"),
    relacionadoSection("Entrega/Devolução de Materiais PSN", "blueMateriais"),
    relacionadoSection("Histórico de Mensagens", "blueMateriais"),
    relacionadoSection("Histórico de alterações", "blueHistoricoAlteracoes")
  ]);
}

// ============================================================================
// Card "Fluxo da ATEC": path, selos, etapa atual, trilha de valores, histórico
// ============================================================================
function renderFluxoCard(atec) {
  const f = atec.flow;
  const selos = [];
  if (f.atribuicao) selos.push(el("span", { class: "selo selo-info" }, `Atribuída automaticamente a ${f.atribuicao.analista} (rodízio da carteira ${f.atribuicao.carteira})`));
  if (f.nivel2) {
    const n2 = f.nivel2;
    const resumo = n2.motivo ? `${n2.motivo === "Outro" ? `Outro: ${n2.outroTexto}` : n2.motivo} · seguiu: ${n2.seguir}` : "em análise";
    selos.push(el("span", { class: "selo selo-warning" }, `Nível 02 (na ${MACRO_LABELS[n2.origem]}) · ${resumo}`));
  }
  if (f.negativa) selos.push(el("span", { class: "selo selo-error" }, `Negativa · origem: ${f.negativa.origem}`));

  return sectionCard("Fluxo da ATEC", [
    el("div", { class: "slds-var-m-vertical_medium" }, [sldsPath(buildPathStages(atec))]),
    selos.length ? el("div", { class: "selos" }, selos) : null,
    el("div", { class: "etapa-box slds-var-m-top_medium" }, [renderEtapaBox(atec)]),
    f.valores.length ? renderTrilhaValores(atec) : null
  ], statusBadge(atec.StatusATEC));
}

function renderTrilhaValores(atec) {
  return el("details", { class: "fluxo-details" }, [
    el("summary", {}, `Trilha de valores (${atec.flow.valores.length})`),
    el("table", { class: "slds-table slds-table_bordered slds-table_cell-buffer mini-table" }, [
      el("thead", {}, el("tr", {}, [el("th", {}, "Valor"), el("th", {}, "Origem"), el("th", {}, "Quando")])),
      el("tbody", {}, atec.flow.valores.map((v) => el("tr", {}, [
        el("td", { class: "num" }, fmtBRL(v.valor)), el("td", {}, v.rotulo), el("td", {}, fmtDate(v.em))
      ])))
    ])
  ]);
}

function renderHistorico(atec) {
  const itens = [...atec.flow.history].reverse();
  return el("details", { class: "fluxo-details", open: "open" }, [
    el("summary", {}, `Histórico de transições (${itens.length})`),
    el("div", { class: "table-scroll" }, el("table", { class: "slds-table slds-table_bordered slds-table_cell-buffer mini-table" }, [
      el("thead", {}, el("tr", {}, [el("th", {}, "Quando"), el("th", {}, "Perfil"), el("th", {}, "Etapa"), el("th", {}, "Ação / decisão")])),
      el("tbody", {}, itens.map((h) => el("tr", { class: h.perfil === ROLE_SISTEMA ? "hist-sistema" : "" }, [
        el("td", { class: "nowrap" }, fmtDate(h.em)),
        el("td", { class: "nowrap" }, h.perfil),
        el("td", {}, h.etapa),
        el("td", { class: "slds-cell-wrap" }, [el("strong", {}, h.acao), h.detalhe ? el("div", { class: "hist-detalhe" }, h.detalhe) : null])
      ])))
    ]))
  ]);
}

// Moldura de cada subpasso: título, responsável, tempo na etapa e bloqueio por perfil
function stepShell(atec, titulo, corpo) {
  const { roles } = stepInfo(atec);
  const perfil = getCurrentRole();
  const liberado = roles.length === 0 || roles.includes(perfil);

  const header = el("div", { class: "etapa-header" }, [
    el("h3", { class: "etapa-titulo" }, titulo),
    el("div", { class: "etapa-meta" }, [
      roles.length ? el("span", { class: "chip" }, `Responsável: ${roles.join(" ou ")}`) : null,
      el("span", { class: "chip chip-muted" }, `Tempo na etapa: ${tempoDesde(atec.flow.stageEnteredAt)}`)
    ])
  ]);

  const aviso = liberado ? null : el("div", { class: "aviso-perfil" }, [
    el("span", {}, `Você está atuando como ${perfil}. Esta etapa é do perfil ${roles.join(" ou ")}.`),
    el("span", { class: "aviso-perfil__btns" }, roles.map(acaoTrocarPerfil))
  ]);

  const fieldset = el("fieldset", { class: "etapa-corpo" }, corpo);
  if (!liberado) fieldset.setAttribute("disabled", "disabled");

  return el("div", {}, [header, aviso, fieldset]);
}

function renderEtapaBox(atec) {
  const chave = `${atec.flow.macro}.${atec.flow.step}`;
  const telas = {
    "abertura.checklist": renderAbertura,
    "triagem.conferir": renderTriagem,
    "triagem.nivel2": renderNivel2,
    "vistoria.nivel2": renderNivel2,
    "vistoria.registrar": renderVistoriaAtalho,
    "vistoria.termo": renderVistoriaAtalho,
    "investigacao.fornecedor": renderInvestigacaoFornecedor,
    "investigacao.aprovacao": renderInvestigacaoAprovacao,
    "investigacao.reprovada": renderInvestigacaoReprovada,
    "investigacao.realizar": renderInvestigacaoRealizar,
    "planejamento.orcar": renderPlanejamento,
    "planejamento.negociacao": renderNegociacao,
    "aprovacao.ficha": renderFichaAtalho,
    "aprovacao.aprovar": renderAprovacaoReparo,
    "reparo.acompanhar": renderEntregaAtalho,
    "reparo.termo": renderEntregaAtalho,
    "reparo.analisarReprovacao": renderAnalisarReprovacao,
    "reparo.finalizar": renderFinalizarReparo,
    "finalizada.concluida": renderFinalizada,
    "negativa.escrever": renderNegativaEscrever,
    "negativa.aprovar": renderNegativaAprovar,
    "negativa.finalizar": renderNegativaFinalizar,
    "negativa.finalizada": renderNegativaFinalizada
  };
  const tela = telas[chave];
  return tela ? tela(atec) : el("div", {}, "Etapa desconhecida.");
}

// ---------- blocos reutilizáveis das telas ----------
function botoes(...nodes) {
  return el("div", { class: "etapa-botoes" }, nodes);
}

function campo(label, control, { required = false, full = false } = {}) {
  const alvo = control.id ? control : control.querySelector("input, select, textarea");
  return sldsFormField({ label, id: (alvo && alvo.id) || nextId("campo"), required, control, full });
}

function inputValor({ id, value, onInput }) {
  const input = sldsInput({ id, type: "number", value: value != null ? String(value) : "", placeholder: "0,00", onInput });
  input.setAttribute("step", "0.01");
  input.setAttribute("min", "0");
  return el("div", { class: "input-moeda" }, [el("span", {}, "R$"), input]);
}

function resumoLinhas(pares) {
  return el("dl", { class: "resumo-linhas" }, pares.filter(Boolean).flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v || "-")]));
}

function decisaoSimNao(label, value, onChange) {
  return sldsRadioButtonGroup({ label, options: ["Sim", "Não"], value, onChange });
}

// Seletor de arquivos que guarda só o nome (anexos que não são fotos)
function seletorAnexos(id, nomes, onChange, accept = "") {
  const lista = el("ul", { class: "anexos-lista" });
  const desenhar = () => {
    lista.innerHTML = "";
    nomes.forEach((nome, i) => lista.appendChild(el("li", {}, [
      el("span", {}, nome),
      el("button", { type: "button", class: "link-remover", onclick: () => { nomes.splice(i, 1); desenhar(); onChange(nomes); } }, "remover")
    ])));
  };
  const input = el("input", { type: "file", id, multiple: "multiple", class: "input-arquivo", accept });
  input.addEventListener("change", () => {
    [...input.files].forEach((f) => nomes.push(f.name));
    input.value = "";
    desenhar();
    onChange(nomes);
  });
  desenhar();
  return el("div", {}, [input, lista]);
}

// Reduz a foto para miniatura (lado maior 480px, JPEG) para caber no navegador
function reduzirFoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 480 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ nome: file.name, dataUrl: canvas.toDataURL("image/jpeg", 0.7) });
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Mesmo valor do ?v= do index.html: evita o navegador usar o modelo de e-mail antigo em cache
const VERSAO_PROTOTIPO = "20261113";

function abrirPreviewEmail(arquivo, dados, titulo) {
  const iframe = el("iframe", { class: "email-preview", src: `${arquivo}?v=${VERSAO_PROTOTIPO}#${encodeURIComponent(JSON.stringify(dados))}`, title: titulo });
  const modalRef = sldsModal({
    title: titulo,
    bodyNode: [iframe],
    footerNode: [sldsButton("Fechar", { onClick: () => { modalRef.section.remove(); modalRef.backdrop.remove(); } })],
    onClose: () => { modalRef.section.remove(); modalRef.backdrop.remove(); }
  });
  document.body.appendChild(modalRef.section);
  document.body.appendChild(modalRef.backdrop);
}

function dadosEmail(atec) {
  return {
    numero: atec.Name,
    cliente: atec.Cliente || "-",
    empreendimento: atec.Empreendimento || "-",
    unidade: atec.Unidade || "-",
    item: `${atec.Item || "-"} / ${atec.SubItem || "-"}`,
    valor: fmtBRL(valorEstimadoAtual(atec)),
    analista: atec.AnalistaResponsavel || "-",
    descricao: atec.Descricao || "-",
    link: `${location.href.split("#")[0]}#/detalhe/${atec.id}`
  };
}

// ============================================================================
// Telas por subpasso
// ============================================================================
function renderAbertura(atec) {
  const answers = Object.keys(atec.flow.abertura.checklistAnswers).length
    ? atec.flow.abertura.checklistAnswers
    : { tabela: {}, aberta: {}, escolha: {}, lista: {} };
  const checklist = getChecklistAbertura(atec.Item, atec.SubItem);

  return stepShell(atec, "Abertura — checklist", [
    renderChecklist(checklist, answers, () => {}),
    botoes(sldsButton("Concluir abertura", {
      variant: "brand",
      onClick: () => agir(atec, "concluirAbertura", { checklistAnswers: answers }, "Abertura concluída. Analista atribuído automaticamente.")
    }))
  ]);
}

// Garantia calculada pelo Habite-se do empreendimento (5 anos), sem escolha manual
function painelGarantia(atec, estado) {
  const g = garantiaPorHabiteSe(atec);
  if (!g) {
    return el("div", {}, [
      el("div", { class: "selo selo-warning selo-bloco" }, `O empreendimento ${atec.Empreendimento || "-"} não tem data de Habite-se cadastrada. Informe a garantia manualmente.`),
      decisaoSimNao("O item está na garantia?", "", (v) => (estado.garantia = v))
    ]);
  }
  const anos = Math.floor((now() - new Date(`${g.habiteSe}T00:00:00`)) / (365.25 * 86400000));
  return el("div", { class: `garantia-painel ${g.naGarantia ? "is-garantia" : "is-vencida"}` }, [
    el("p", { class: "garantia-painel__resultado" }, g.naGarantia ? "✓ Na garantia" : "✕ Garantia vencida"),
    resumoLinhas([
      ["Empreendimento", atec.Empreendimento],
      ["Data do Habite-se", `${fmtDiaISO(g.habiteSe)} (${anos < 0 ? "data futura" : anos === 0 ? "há menos de 1 ano" : `há ${anos} ano${anos === 1 ? "" : "s"}`})`],
      [g.naGarantia ? "Garantia até" : "Garantia venceu em", fmtDiaISO(g.ate)]
    ]),
    el("p", { class: "garantia-painel__regra" }, `Regra: até ${ANOS_GARANTIA} anos do Habite-se o empreendimento está na garantia; depois disso, a garantia está vencida.`)
  ]);
}

function renderTriagem(atec) {
  const estado = { garantia: "", observacao: "" };
  const portal = atec.CanalAbertura === "Portal ATEC";
  const checklist = getChecklistAbertura(atec.Item, atec.SubItem);

  return stepShell(atec, "Triagem — conferir solicitação e garantia", [
    el("p", { class: "etapa-ajuda" }, "Analise a solicitação, confira o checklist/briefing e verifique se o item está na garantia."),
    resumoLinhas([["Item / Sub Item", `${atec.Item} / ${atec.SubItem}`], ["Descrição", atec.Descricao], ["Canal de abertura", atec.CanalAbertura]]),
    renderChecklistLeitura(checklist, atec.flow.abertura.checklistAnswers, portal ? "Briefing do Portal (somente leitura)" : "Checklist de abertura (somente leitura)"),
    painelGarantia(atec, estado),
    campo("Observação (opcional):", sldsTextarea({ id: "triagem-obs", rows: 2, onInput: (v) => (estado.observacao = v) }), { full: true }),
    el("p", { class: "etapa-ajuda" }, "Na garantia → Vistoria. Fora da garantia → Análise Nível 02."),
    botoes(sldsButton("Concluir triagem", { variant: "brand", onClick: () => agir(atec, "decidirTriagem", estado, "Triagem concluída.") }))
  ]);
}

function renderNivel2(atec) {
  const estado = { motivo: "", outroTexto: "", seguir: "" };
  const outroField = campo("Descreva o motivo:", sldsInput({ id: "nivel2-outro", onInput: (v) => (estado.outroTexto = v) }), { required: true, full: true });
  outroField.style.display = "none";
  const origem = MACRO_LABELS[atec.flow.nivel2.origem];

  return stepShell(atec, `Análise Nível 02 (a partir da ${origem})`, [
    el("p", { class: "etapa-ajuda" }, "Item fora da garantia. Informe o motivo para seguir (ou não) com a ATEC. Não seguir → Negativa."),
    sldsRadioButtonGroup({
      label: "Motivo",
      options: ANALISE_NIVEL_2_OPTIONS,
      onChange: (v) => { estado.motivo = v; outroField.style.display = v === "Outro" ? "block" : "none"; }
    }),
    outroField,
    decisaoSimNao("Seguir com a ATEC?", "", (v) => (estado.seguir = v)),
    atec.flow.nivel2.origem === "vistoria" ? el("p", { class: "etapa-ajuda" }, "Se seguir, a ATEC volta para a Vistoria com os dados já preenchidos.") : null,
    botoes(sldsButton("Concluir Análise Nível 02", { variant: "brand", onClick: () => agir(atec, "decidirNivel2", estado, "Análise Nível 02 registrada.") }))
  ]);
}

function renderVistoria(atec) {
  const v = atec.flow.vistoria;
  const draft = {
    data: v.data || "",
    tecnico: v.tecnico || "",
    observacoes: v.observacoes || "",
    fotos: [...(v.fotos || [])],
    anexos: [...(v.anexos || [])],
    checklistAnswers: Object.keys(v.checklistAnswers || {}).length ? v.checklistAnswers : { tabela: {}, aberta: {}, escolha: {}, lista: {} },
    valorEstimado: v.valorEstimado != null ? v.valorEstimado : null,
    necessarioInvestigacao: v.necessarioInvestigacao || ""
  };
  const salvar = () => {
    try { executarAcao(atec.id, "salvarVistoria", getCurrentRole(), draft); } catch (e) { /* bloqueado por perfil: não salva */ }
  };

  const fotos = seletorFotos("vistoria-fotos", draft.fotos, salvar, "vistoria");

  const checklistTecnico = getChecklistFor(atec.Item, atec.SubItem);
  const voltouDoNivel2 = atec.flow.nivel2 && atec.flow.nivel2.origem === "vistoria" && atec.flow.nivel2.seguir === "Sim";

  return stepShell(atec, "Vistoria em campo", [
    voltouDoNivel2 ? el("div", { class: "selo selo-warning selo-bloco" }, "Retornou da Análise Nível 02 — os dados já preenchidos foram preservados.") : null,
    el("div", { class: "form-grid-slds" }, [
      campo("Data da vistoria:", sldsInput({ id: "vistoria-data", type: "date", value: draft.data, onInput: (val) => { draft.data = val; salvar(); } }), { required: true }),
      campo("Técnico responsável:", sldsSelect({ id: "vistoria-tecnico", options: TECNICOS_MOCK, value: draft.tecnico, onChange: (val) => { draft.tecnico = val; salvar(); } }), { required: true }),
      campo("Observações:", sldsTextarea({ id: "vistoria-obs", value: draft.observacoes, rows: 3, onInput: (val) => (draft.observacoes = val) }), { full: true })
    ]),
    el("h4", { class: "bloco-titulo slds-var-m-top_medium" }, "Evidências"),
    el("div", { class: "form-grid-slds" }, [
      fotos.campo,
      el("div", {}, [el("label", { class: "slds-form-element__label", for: "vistoria-anexos" }, "Outros anexos (só o nome é guardado)"), seletorAnexos("vistoria-anexos", draft.anexos, () => salvar())])
    ]),
    fotos.galeria,
    checklistTecnico
      ? el("details", { class: "fluxo-details", open: "open" }, [
        el("summary", {}, `Checklist técnico — ${atec.Item} / ${atec.SubItem}`),
        renderChecklist(checklistTecnico, draft.checklistAnswers, () => {})
      ])
      : el("p", { class: "etapa-fim-escopo" }, "Nenhum checklist técnico mapeado para este Item/Sub Item."),
    el("div", { class: "form-grid-slds slds-var-m-top_medium" }, [
      campo("Valor estimado do reparo:", inputValor({ id: "vistoria-valor", value: draft.valorEstimado, onInput: (val) => (draft.valorEstimado = parseValor(val)) }), { required: true }),
      el("div", {}, [decisaoSimNao("Necessário investigação?", draft.necessarioInvestigacao, (val) => (draft.necessarioInvestigacao = val))])
    ]),
    el("p", { class: "etapa-ajuda" }, "Sem investigação, a ATEC segue direto para Planejamento e Orçamento."),
    el("p", { class: "etapa-ajuda" }, "Ao concluir, o termo de vistoria é gerado com a data, o técnico, as observações e as fotos para o cliente conferir e assinar."),
    botoes(
      sldsButton("Salvar rascunho", { onClick: () => { salvar(); showToast("Rascunho da vistoria salvo."); } }),
      sldsButton("Item fora da garantia → Nível 02", { onClick: () => agir(atec, "vistoriaParaNivel2", draft, "Encaminhada para Análise Nível 02.") }),
      sldsButton("Gerar termo para assinatura", { variant: "brand", onClick: () => agir(atec, "concluirVistoria", draft, "Termo de vistoria gerado.") })
    )
  ]);
}

// Fotos em miniatura (até 6), usadas na vistoria e na entrega do serviço.
// Altera a lista recebida e chama onChange a cada mudança.
function seletorFotos(id, lista, onChange, contexto) {
  const MAX_FOTOS = 6;
  const galeria = el("div", { class: "fotos-grid" });
  const contador = el("span", { class: "etapa-ajuda" });
  const desenhar = () => {
    galeria.innerHTML = "";
    lista.forEach((foto, i) => galeria.appendChild(el("figure", { class: "foto" }, [
      el("img", { src: foto.dataUrl, alt: foto.nome }),
      el("figcaption", {}, foto.nome),
      el("button", { type: "button", class: "foto-remover", title: "Remover foto", onclick: () => { lista.splice(i, 1); desenhar(); onChange(); } }, "×")
    ])));
    contador.textContent = `${lista.length}/${MAX_FOTOS} fotos`;
  };
  const input = el("input", { type: "file", id, accept: "image/*", multiple: "multiple", class: "input-arquivo" });
  input.addEventListener("change", async () => {
    const livres = MAX_FOTOS - lista.length;
    const arquivos = [...input.files];
    if (arquivos.length > livres) showToast(`Limite de ${MAX_FOTOS} fotos por ${contexto} — ${arquivos.length - livres} ignorada(s).`, "warning");
    for (const arq of arquivos.slice(0, Math.max(0, livres))) {
      try { lista.push(await reduzirFoto(arq)); } catch (e) { showToast(`Não foi possível ler ${arq.name}.`, "error"); }
    }
    input.value = "";
    desenhar();
    onChange();
  });
  desenhar();
  return {
    campo: el("div", {}, [el("label", { class: "slds-form-element__label", for: id }, "Fotos (miniaturas)"), input, contador]),
    galeria
  };
}

// ---------- partes comuns das páginas de termo (vistoria e entrega) ----------
function cabecalhoPaginaTermo(atec, selo, passos, passoAtual) {
  const feito = (i) => i < passoAtual || passoAtual === passos.length - 1;
  return el("header", { class: "vist-topo" }, [
    el("div", {}, [
      el("p", { class: "vist-topo__selo" }, `${selo} · ${atec.Name}`),
      el("h1", { class: "vist-topo__titulo" }, `${atec.Cliente || "-"} — ${atec.Unidade || "-"}`),
      el("p", { class: "vist-topo__sub" }, `${atec.Empreendimento || "-"} · ${atec.Item || "-"} / ${atec.SubItem || "-"}`)
    ]),
    el("ol", { class: "vist-passos" }, passos.map((nome, i) =>
      el("li", { class: feito(i) ? "is-feito" : i === passoAtual ? "is-atual" : "" }, [
        el("span", { class: "vist-passos__num" }, feito(i) ? "✓" : String(i + 1)),
        el("span", {}, nome)
      ])))
  ]);
}

function areaAssinaturaCliente(atec, estado) {
  estado.nome = estado.nome || atec.Solicitante || atec.Cliente || "";
  return el("div", { class: "termo-doc__coleta" }, [
    el("p", { class: "termo-doc__secao" }, "Assinatura do cliente"),
    padAssinatura((dataUrl) => (estado.assinatura = dataUrl)),
    campo("Nome de quem assina:", sldsInput({ id: "termo-nome", value: estado.nome, onInput: (val) => (estado.nome = val) }), { required: true })
  ]);
}

function blocoAssinado(termo) {
  return el("div", { class: "termo-doc__assinatura" }, [
    el("img", { src: termo.assinatura, alt: `Assinatura de ${termo.nome}` }),
    el("p", { class: "termo-doc__linha" }, termo.nome),
    el("p", { class: "termo-doc__data" }, `Assinado em ${fmtDate(termo.em)}`)
  ]);
}

function cabecalhoDocumento(atec, titulo) {
  return el("header", { class: "termo-doc__topo" }, [
    el("div", {}, [el("p", { class: "termo-doc__selo" }, "Assistência Técnica"), el("h2", { class: "termo-doc__titulo" }, titulo)]),
    el("p", { class: "termo-doc__numero" }, atec.Name)
  ]);
}

function imprimirDocumento(titulo, doc) {
  const janela = window.open("", "_blank");
  if (!janela) { showToast("O navegador bloqueou a janela de impressão.", "error"); return; }
  const css = new URL("styles.css", location.href).href;
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title><link rel="stylesheet" href="${css}"></head><body class="termo-impressao">${doc.outerHTML}</body></html>`);
  janela.document.close();
  janela.addEventListener("load", () => janela.print());
}

function paginaNaoEncontrada() {
  root.appendChild(sectionCard("ATEC não encontrada", [el("p", {}, "Feche esta aba e abra novamente pela ATEC.")]));
}

function botaoFecharAba() {
  return sldsButton("Fechar esta aba", { variant: "brand", onClick: () => window.close() });
}

// Documento que o cliente confere e assina ao final da vistoria.
// c = conteúdo (data, técnico, observações); termo = assinatura já coletada.
// areaAssinatura: nó com nome + pad, usado enquanto o termo não foi assinado.
function documentoTermoVistoria(atec, c, termo, areaAssinatura = null) {
  const fotos = (atec.flow.vistoria.fotos || []).slice(0, c.fotos);
  return el("article", { class: "termo-doc" }, [
    cabecalhoDocumento(atec, "Termo de Vistoria Técnica"),
    resumoLinhas([
      ["Cliente", atec.Cliente],
      ["Empreendimento", atec.Empreendimento],
      ["Unidade", atec.Unidade],
      ["Item / Sub Item", `${atec.Item || "-"} / ${atec.SubItem || "-"}`],
      ["Ambiente", [atec.Ambiente, atec.SubAmbiente].filter(Boolean).join(" — ")],
      ["Solicitação", atec.Descricao],
      ["Data da vistoria", fmtDia(c.data)],
      ["Técnico responsável", c.tecnico]
    ]),
    el("h3", { class: "termo-doc__secao" }, "Constatações da vistoria"),
    el("p", { class: "termo-doc__texto" }, c.observacoes || "-"),
    fotos.length ? el("h3", { class: "termo-doc__secao" }, `Registro fotográfico (${fotos.length})`) : null,
    fotos.length ? el("div", { class: "termo-doc__fotos" }, fotos.map((f) => el("img", { src: f.dataUrl, alt: f.nome }))) : null,
    el("h3", { class: "termo-doc__secao" }, "Declaração"),
    el("p", { class: "termo-doc__texto" }, "Declaro que acompanhei a vistoria técnica realizada na data acima e que as constatações registradas neste termo correspondem ao que foi verificado no local. Esta assinatura confirma a realização da vistoria e não representa decisão sobre a cobertura ou a execução do reparo, que serão analisadas pela equipe de Assistência Técnica."),
    termo ? blocoAssinado(termo) : areaAssinatura
  ]);
}

function urlPaginaVistoria(atec) {
  return `${location.href.split("#")[0]}#/vistoria/${encodeURIComponent(atec.id)}`;
}

// No Detalhe a vistoria não é preenchida: só mostra a situação e abre a
// página da vistoria em outra aba.
function renderVistoriaAtalho(atec) {
  const v = atec.flow.vistoria;
  const aguardandoAssinatura = atec.flow.step === "termo";
  const iniciada = v.data || v.tecnico || (v.observacoes || "").trim() || (v.fotos || []).length;
  const situacao = aguardandoAssinatura
    ? el("div", { class: "selo selo-warning selo-bloco" }, "Registro concluído. Aguardando a assinatura do cliente no termo de vistoria.")
    : iniciada
      ? el("div", { class: "selo selo-info selo-bloco" }, "Vistoria em andamento (rascunho salvo).")
      : null;
  return stepShell(atec, "Vistoria em campo", [
    el("p", { class: "etapa-ajuda" }, "A vistoria é feita numa página própria, aberta em outra aba: o analista registra o que viu no local e, ao final, o cliente confere e assina o termo de vistoria."),
    situacao,
    iniciada ? resumoLinhas([
      ["Data da vistoria", fmtDia(v.data)],
      ["Técnico responsável", v.tecnico],
      ["Fotos", `${(v.fotos || []).length}`]
    ]) : null,
    botoes(sldsButton(aguardandoAssinatura ? "Abrir termo para assinatura" : iniciada ? "Continuar vistoria" : "Fazer vistoria", {
      variant: "brand",
      onClick: () => window.open(urlPaginaVistoria(atec), "_blank")
    }))
  ]);
}

// Página da vistoria (aba separada): registro → assinatura do cliente → concluída
function renderPaginaVistoria(id) {
  const atec = getAtec(id);
  if (!atec) return paginaNaoEncontrada();
  const f = atec.flow;
  const v = f.vistoria;
  const naVistoria = f.macro === "vistoria" && (f.step === "registrar" || f.step === "termo");
  const passoAtual = naVistoria ? (f.step === "registrar" ? 0 : 1) : v.termo ? 2 : -1;

  const topo = cabecalhoPaginaTermo(atec, "Vistoria em campo", ["Registro da vistoria", "Assinatura do cliente", "Concluída"], passoAtual);

  let corpo;
  if (naVistoria) {
    corpo = f.step === "registrar" ? renderVistoria(atec) : renderTermoVistoria(atec);
  } else if (v.termo) {
    corpo = el("div", {}, [
      el("div", { class: "selo selo-success selo-bloco" }, `Vistoria concluída. Termo assinado por ${v.termo.nome} em ${fmtDate(v.termo.em)}.`),
      el("div", { class: "termo-folha" }, documentoTermoVistoria(atec, v.termo, v.termo)),
      botoes(
        sldsButton("Imprimir / salvar PDF", { onClick: () => imprimirTermo(atec) }),
        botaoFecharAba()
      )
    ]);
  } else {
    const texto = f.macro === "vistoria" && f.step === "nivel2"
      ? "A vistoria foi encaminhada para a Análise Nível 02. Continue pela ATEC."
      : `Esta ATEC não está na etapa de vistoria (etapa atual: ${etapaAtualTexto(atec)}).`;
    corpo = el("div", {}, [
      el("p", { class: "etapa-ajuda" }, texto),
      botoes(botaoFecharAba())
    ]);
  }

  root.appendChild(el("div", { class: "vist-pagina" }, [topo, el("div", { class: "vist-corpo" }, [corpo])]));
}

// Passo "Assinatura do cliente": o termo aparece como uma folha na própria
// etapa e o cliente assina no espaço de assinatura do documento.
function renderTermoVistoria(atec) {
  const v = atec.flow.vistoria;
  const estado = { nome: "", assinatura: null };
  const areaAssinatura = areaAssinaturaCliente(atec, estado);

  return stepShell(atec, "Termo de vistoria — assinatura do cliente", [
    el("p", { class: "etapa-ajuda" }, "Entregue o aparelho ao cliente para conferir o termo e assinar. Para corrigir alguma informação, volte para o registro."),
    el("div", { class: "termo-folha" }, documentoTermoVistoria(atec, conteudoTermo(v), null, areaAssinatura)),
    botoes(
      sldsButton("Voltar e editar registro", { onClick: () => agir(atec, "voltarVistoria", {}) }),
      sldsButton("Confirmar assinatura e concluir vistoria", { variant: "brand", onClick: () => agir(atec, "assinarTermoVistoria", estado, "Termo assinado. Vistoria concluída.") })
    )
  ]);
}

function imprimirTermo(atec) {
  const termo = atec.flow.vistoria.termo;
  imprimirDocumento(`Termo de vistoria ${atec.Name}`, documentoTermoVistoria(atec, termo, termo));
}

function renderTentativasInvestigacao(inv) {
  if (!inv.tentativas.length) return null;
  return el("table", { class: "slds-table slds-table_bordered slds-table_cell-buffer mini-table slds-var-m-bottom_small" }, [
    el("thead", {}, el("tr", {}, [el("th", {}, "Fornecedor"), el("th", {}, "Custo"), el("th", {}, "Situação"), el("th", {}, "Comentário")])),
    el("tbody", {}, inv.tentativas.map((t) => el("tr", {}, [
      el("td", {}, t.fornecedor), el("td", { class: "num" }, fmtBRL(t.custo)),
      el("td", {}, t.decididoPor ? `${t.status} (${t.decididoPor})` : t.status), el("td", { class: "slds-cell-wrap" }, t.comentario || "-")
    ])))
  ]);
}

function renderInvestigacaoFornecedor(atec) {
  const inv = atec.flow.investigacao;
  const disponiveis = FORNECEDORES_MOCK.filter((f) => !inv.fornecedoresReprovados.includes(f));
  const estado = { fornecedor: "", custo: null };
  const previsao = el("div", { class: "previsao" }, "Informe o custo para ver quem aprova.");
  const atualizarPrevisao = () => {
    if (estado.custo == null) { previsao.textContent = "Informe o custo para ver quem aprova."; return; }
    if (estado.custo === 0) { previsao.textContent = "Sem custo: a aprovação é dispensada e a investigação pode ser realizada."; return; }
    const a = alcadaPara(ALCADAS_INVESTIGACAO, estado.custo);
    previsao.textContent = `Aprovação: ${a.perfil} (${a.faixa}).`;
  };

  return stepShell(atec, "Investigação — fornecedor e custo", [
    el("p", { class: "etapa-ajuda" }, "A aprovação do custo vem antes de realizar a investigação. Nem toda investigação tem custo (informe 0)."),
    renderTentativasInvestigacao(inv),
    el("div", { class: "form-grid-slds" }, [
      campo("Fornecedor:", sldsSelect({ id: "inv-fornecedor", options: disponiveis, onChange: (v) => (estado.fornecedor = v) }), { required: true }),
      campo("Custo da investigação:", inputValor({ id: "inv-custo", onInput: (v) => { estado.custo = parseValor(v); atualizarPrevisao(); } }), { required: true })
    ]),
    previsao,
    botoes(sldsButton("Enviar", { variant: "brand", onClick: () => agir(atec, "enviarInvestigacao", estado, "Investigação registrada.") }))
  ]);
}

function painelAprovacao(atec, { titulo, linhas, extra, onDecidir }) {
  let comentario = "";
  return stepShell(atec, titulo, [
    resumoLinhas(linhas),
    extra || null,
    campo("Comentário (obrigatório para reprovar):", sldsTextarea({ id: nextId("aprov-coment"), rows: 2, onInput: (v) => (comentario = v) }), { full: true }),
    botoes(
      sldsButton("Reprovar", { variant: "destructive-text", onClick: () => onDecidir(false, comentario) }),
      sldsButton("Aprovar", { variant: "brand", onClick: () => onDecidir(true, comentario) })
    )
  ]);
}

function renderInvestigacaoAprovacao(atec) {
  const at = atec.flow.investigacao.atual;
  return painelAprovacao(atec, {
    titulo: `Investigação — aguardando aprovação ${at.aprovador}`,
    linhas: [["Fornecedor", at.fornecedor], ["Custo", fmtBRL(at.custo)], ["Alçada", `${at.aprovador} (${at.faixa})`]],
    extra: renderTentativasInvestigacao(atec.flow.investigacao),
    onDecidir: (aprovado, comentario) => agir(atec, "aprovarInvestigacao", { aprovado, comentario }, aprovado ? "Custo aprovado." : "Investigação reprovada.")
  });
}

function renderInvestigacaoReprovada(atec) {
  const inv = atec.flow.investigacao;
  const estado = { acao: "", motivo: "" };
  const motivoField = campo("Motivo da negativa:", sldsTextarea({ id: "inv-neg-motivo", rows: 2, onInput: (v) => (estado.motivo = v) }), { required: true, full: true });
  motivoField.style.display = "none";

  return stepShell(atec, "Investigação reprovada", [
    renderTentativasInvestigacao(inv),
    sldsRadioButtonGroup({
      label: "Como seguir?",
      options: ["Orçar com outro fornecedor", "Dar negativa"],
      onChange: (v) => { estado.acao = v === "Dar negativa" ? "negativa" : "outroFornecedor"; motivoField.style.display = estado.acao === "negativa" ? "block" : "none"; }
    }),
    motivoField,
    botoes(sldsButton("Confirmar", { variant: "brand", onClick: () => agir(atec, "decidirReprovacaoInvestigacao", estado) }))
  ]);
}

function renderInvestigacaoRealizar(atec) {
  const inv = atec.flow.investigacao;
  const estado = { laudo: "", anexos: [], valorAtualizado: null, seguir: "" };

  return stepShell(atec, "Realizar investigação", [
    resumoLinhas([["Fornecedor", inv.atual.fornecedor], ["Custo", inv.atual.custo ? fmtBRL(inv.atual.custo) : "Sem custo"], ["Valor estimado atual", fmtBRL(valorEstimadoAtual(atec))]]),
    el("p", { class: "etapa-ajuda" }, "O Analista registra o resultado em nome do fornecedor."),
    campo("Laudo da investigação:", sldsTextarea({ id: "inv-laudo", rows: 3, onInput: (v) => (estado.laudo = v) }), { required: true, full: true }),
    el("div", { class: "form-grid-slds" }, [
      el("div", {}, [el("label", { class: "slds-form-element__label", for: "inv-anexos" }, "Anexos (só o nome é guardado)"), seletorAnexos("inv-anexos", estado.anexos, (n) => (estado.anexos = n))]),
      campo("Atualizar valor estimado (opcional):", inputValor({ id: "inv-valor", onInput: (v) => (estado.valorAtualizado = parseValor(v)) }))
    ]),
    el("p", { class: "etapa-ajuda" }, "Seguindo com a ATEC, ela vai para Planejamento e Orçamento."),
    decisaoSimNao("Seguir com a ATEC?", "", (v) => (estado.seguir = v)),
    botoes(sldsButton("Concluir investigação", { variant: "brand", onClick: () => agir(atec, "concluirInvestigacao", estado, "Investigação concluída.") }))
  ]);
}

function ultimaReprovacaoReparo(atec) {
  const ap = atec.flow.aprovacao;
  if (!ap || !ap.decisoes.length) return null;
  const ult = ap.decisoes[ap.decisoes.length - 1];
  return ult.aprovado ? null : ult;
}

// O orçamento do reparo é feito pela cotação (aba Cotações → Criar Cotação);
// aqui a etapa só orienta e atalha para o mesmo formulário.
function renderPlanejamento(atec) {
  const reprov = ultimaReprovacaoReparo(atec);
  const anterior = cotacaoDoPlanejamento(atec);
  return stepShell(atec, "Planejamento e Orçamento", [
    reprov ? el("div", { class: "selo selo-error selo-bloco" }, `Reparo reprovado por ${reprov.perfil}: ${reprov.comentario}. Crie uma nova cotação.`) : null,
    resumoLinhas([
      ["Valor estimado", fmtBRL(valorEstimadoAtual(atec))],
      anterior ? ["Cotação anterior", `${anterior.Name} · ${fmtBRL(anterior.valorTotal)} · ${anterior.Status_Aprovacao}`] : null
    ]),
    el("div", { class: "instrucao-cotacao" }, [
      el("p", { class: "instrucao-cotacao__titulo" }, "O orçamento do reparo é feito pela cotação"),
      el("ol", {}, [
        el("li", {}, ["Abra a aba ", el("strong", {}, "Cotações"), " e clique em ", el("strong", {}, "Criar Cotação"), " (ou use o botão abaixo)."]),
        el("li", {}, "Informe o tipo de cotação, o Tipo ATEC, a observação geral e os itens com fornecedor, quantidade e valor unitário."),
        el("li", {}, `Ao confirmar, a cotação vira o orçamento desta etapa: acima de ${fmtBRL(LIMITE_NEGOCIACAO_SUPRIMENTOS)} vai para negociação com Suprimentos; até esse valor segue direto para a aprovação na alçada.`)
      ]),
      el("p", { class: "etapa-ajuda" }, "As datas previstas de início e fim do reparo são preenchidas no Detalhe (Editar → Planejamento de Reparo).")
    ]),
    botoes(sldsButton("Criar Cotação", { variant: "brand", onClick: () => abrirCriarCotacao(atec) }))
  ]);
}

function periodoPrevisto(atec) {
  const ini = valorCampoDetalhe(atec, "Data_Prevista_de_Inicio_do_Reparo");
  const fim = valorCampoDetalhe(atec, "Data_Prevista_de_Fim_do_Reparo");
  return ini || fim ? `${fmtDia(ini)} a ${fmtDia(fim)}` : "Não informado (Detalhe → Planejamento de Reparo)";
}

function renderNegociacao(atec) {
  const p = atec.flow.planejamento;
  const estado = { valorNegociado: null, obs: "" };
  return stepShell(atec, "Negociação — Suprimentos", [
    resumoLinhas([["Cotação", (cotacaoDoPlanejamento(atec) || {}).Name], ["Fornecedor", p.fornecedor], ["Valor orçado", fmtBRL(p.valorOrcamento)], ["Período previsto", periodoPrevisto(atec)], ["Detalhamento", p.detalhamento]]),
    el("div", { class: "form-grid-slds" }, [
      campo("Valor negociado:", inputValor({ id: "neg-valor", onInput: (v) => (estado.valorNegociado = parseValor(v)) }), { required: true }),
      campo("Observação:", sldsTextarea({ id: "neg-obs", rows: 2, onInput: (v) => (estado.obs = v) }))
    ]),
    botoes(sldsButton("Concluir negociação", { variant: "brand", onClick: () => agir(atec, "negociarSuprimentos", estado, "Negociação registrada.") }))
  ]);
}

// ============================================================================
// Ficha Corporativa de Aprovação (Supervisora ATEC / Diretor): preenchida
// numa página própria (aba separada) e enviada por e-mail ao aprovador
// ============================================================================
function urlPaginaFicha(atec) {
  return `${location.href.split("#")[0]}#/ficha/${encodeURIComponent(atec.id)}`;
}

function renderFichaAtalho(atec) {
  const ap = atec.flow.aprovacao;
  const rascunho = ap.fichaRascunho;
  return stepShell(atec, `Ficha de aprovação — ${ap.aprovador}`, [
    el("p", { class: "etapa-ajuda" }, `O reparo de ${fmtBRL(ap.valor)} cai na alçada da ${ap.aprovador === ROLES.DIRETOR ? "Diretoria" : ap.aprovador} (${ap.faixa}). Antes da aprovação, preencha a Ficha Corporativa de Aprovação: ela vai por e-mail para ${ap.aprovador} (${EMAIL_APROVADOR[ap.aprovador]}).`),
    rascunho ? el("div", { class: "selo selo-info selo-bloco" }, "Ficha em preenchimento (rascunho salvo).") : null,
    botoes(sldsButton(rascunho ? "Continuar ficha de aprovação" : "Preencher ficha de aprovação", { variant: "brand", onClick: () => window.open(urlPaginaFicha(atec), "_blank") }))
  ]);
}

// Seções da ficha no formato usado pelo e-mail (email-ficha-aprovacao.html)
function dadosFichaEmail(atec, fi) {
  const ap = atec.flow.aprovacao;
  const p = atec.flow.planejamento || {};
  const cot = cotacaoDoPlanejamento(atec);
  const op = (rotulo, opcoes, marcadas, risco) => ({ rotulo, opcoes, marcadas: [].concat(marcadas || []).filter(Boolean), risco });
  const tx = (rotulo, valor) => ({ rotulo, valor });
  const brl = (v) => (v != null && v !== "" ? fmtBRL(v) : "");
  const parte = (rotulo, v) => ({ rotulo, valor: brl(v), numero: Number(v) || 0 });
  const riscosAltos = (nivel) => FICHA.riscos.filter((r) => fi.risco[r] === nivel);
  const maiorRisco = ["Alto", "Médio", "Baixo"].find((n) => riscosAltos(n).length);
  const dentroPrazo = fi.garantia.dentroPrazo;
  return {
    numero: atec.Name,
    valor: fmtBRL(ap.valor),
    aprovador: ap.aprovador,
    faixa: ap.faixa,
    empreendimento: atec.Empreendimento,
    unidade: atec.Unidade,
    analista: atec.AnalistaResponsavel || fi.enviadaPor || "-",
    para: `${ap.aprovador} <${EMAIL_APROVADOR[ap.aprovador]}>`,
    enviadoEm: fmtDate(fi.enviadaEm || new Date().toISOString()),
    link: `${location.href.split("#")[0]}#/detalhe/${atec.id}`,
    logo: new URL("img/logo-opus-light.png", location.href).href,
    indicadores: [
      { rotulo: "Garantia", valor: dentroPrazo === "Sim" ? "Dentro do prazo" : dentroPrazo === "Não" ? "Fora do prazo" : "Não informado", detalhe: fi.prazoAplicavel, tom: dentroPrazo === "Sim" ? "ok" : dentroPrazo === "Não" ? "erro" : "neutro" },
      { rotulo: "Impacto", valor: [].concat(fi.impacto || []).join(", ") || "Não informado", tom: "neutro" },
      { rotulo: "Maior risco", valor: maiorRisco || "Não informado", detalhe: maiorRisco ? riscosAltos(maiorRisco).join(", ") : "", tom: { Alto: "erro", "Médio": "alerta", Baixo: "ok" }[maiorRisco] || "neutro" },
      { rotulo: "Parecer da Assistência Técnica", valor: fi.parecerAT || "Não informado", tom: fi.parecerAT === "Favorável" ? "ok" : fi.parecerAT ? "erro" : "neutro" }
    ],
    secoes: [
      { titulo: "Identificação da solicitação", colunas: 4, linhas: [
        tx("Nº ATEC", atec.Name), tx("Data abertura", fmtDia(atec.CreatedDate.slice(0, 10))), tx("Empreendimento", atec.Empreendimento),
        tx("Unidade", atec.Unidade), tx("Cliente", atec.Cliente), op("Origem", FICHA.origens, fi.origem),
        tx("Responsável pela tratativa", atec.AnalistaResponsavel), tx("Data da análise", fmtDia(fi.dataAnalise))
      ] },
      { titulo: "Resumo do caso", destaque: fi.resumo, linhas: [op("Impacto identificado", FICHA.impactos, fi.impacto)] },
      { titulo: "Análise de garantia Opus", linhas: [
        ...FICHA.garantia.map(([k, r]) => op(r, ["Sim", "Não"], fi.garantia[k])),
        tx("Prazo de garantia aplicável", fi.prazoAplicavel), tx("Fundamentação", fi.fundamentacao)
      ] },
      { titulo: "Casos fora da garantia — liberalidade", par: true, colunas: 1, linhas: [op("Motivo para atendimento", FICHA.motivosLiberalidade, fi.liberalidade), tx("Justificativa", fi.justificativa)] },
      { titulo: "Perfil do cliente", par: true, colunas: 1, linhas: [
        op("Qual o perfil do cliente?", FICHA.perfisCliente, fi.perfilCliente), op("Cliente tem mais de 1 unidade?", ["Sim", "Não"], fi.maisUnidades),
        tx("Em caso positivo, quantas unidades?", fi.maisUnidades === "Sim" ? fi.quantasUnidades : "")
      ] },
      { titulo: "Validação técnica da engenharia", linhas: [
        tx("Responsável técnico", fi.tecResponsavel), tx("Cargo", fi.tecCargo), tx("Diagnóstico técnico", fi.diagnostico), tx("Causa raiz identificada", fi.causaRaiz),
        tx("Solução técnica recomendada", fi.solucao), tx("Quem assume a responsabilidade técnica?", fi.responsabilidadeTecnica),
        ...FICHA.tecnica.map(([k, r, ops]) => op(r, ops, fi.tecnica[k]))
      ] },
      { titulo: "Orçamento", layout: "orcamento", colunas: 3, semPerguntas: true,
        composicao: [parte("Material", fi.orc.material), parte("Mão de obra", fi.orc.maoDeObra), parte("Equipamentos", fi.orc.equipamentos), parte("Outros", fi.orc.outros)],
        total: `${fmtBRL(ap.valor)}${p.valorNegociado != null ? " (negociado)" : ""}`,
        linhas: [
        tx("Quantidade de orçamentos", `${(atec.cotacoes || []).length}: ${(atec.cotacoes || []).map((c) => `${c.Name} ${fmtBRL(c.valorTotal)}`).join(" / ")}`),
        tx("Fornecedor escolhido", p.fornecedor), tx("Motivo da escolha", fi.motivoEscolha), op("Existe preço tabelado para esse serviço?", ["Sim", "Não"], fi.precoTabelado)
      ], tabela: cot ? { titulo: `Itens da cotação ${cot.Name}`, colunas: ["Item", "Fornecedor", "Qtd.", "Vlr. Unit.", "Vlr. Total"], numDesde: 2,
        linhas: cot.itens.map((i) => [i.descricao, i.fornecedor, String(i.quantidade), fmtBRL(i.valorUnitario), fmtBRL(i.valorTotalItem)]) } : null },
      { titulo: "Matriz de risco", layout: "faixas", linhas: FICHA.riscos.map((r) => op(r, FICHA.niveisRisco, fi.risco[r], true)) },
      { titulo: "Aprovações", layout: "faixas", linhas: [
        op("Assistência Técnica", FICHA.pareceres, fi.parecerAT), op("Engenharia", FICHA.engenharia, fi.engenharia),
        tx(ap.aprovador === ROLES.DIRETOR ? "Diretoria" : ap.aprovador, "Aguardando avaliação")
      ] }
    ]
  };
}

// Escolha múltipla em pílulas (checkbox) — altera o array recebido
function pilulasMultiplas(lista, marcadas, onChange) {
  const nome = nextId("multi");
  return el("div", { class: "choice-group" }, lista.map((op) => {
    const id = `${nome}-${op.replace(/\W+/g, "_")}`;
    const input = el("input", { type: "checkbox", id, value: op, class: "choice-pill-input" });
    if (marcadas.includes(op)) input.setAttribute("checked", "checked");
    input.addEventListener("change", () => {
      if (input.checked) marcadas.push(op);
      else marcadas.splice(marcadas.indexOf(op), 1);
      onChange();
    });
    return el("span", { class: "choice-pill-wrap" }, [input, el("label", { class: "choice-pill", for: id }, op)]);
  }));
}

function renderPaginaFicha(id) {
  const atec = getAtec(id);
  if (!atec) return paginaNaoEncontrada();
  const ap = atec.flow.aprovacao;
  const naFicha = atec.flow.macro === "aprovacao" && atec.flow.step === "ficha";
  const enviada = ap && ap.ficha;
  const topo = cabecalhoPaginaTermo(atec, "Ficha de aprovação", ["Preenchimento da ficha", "Enviada por e-mail"], naFicha ? 0 : enviada ? 1 : -1);

  let corpo;
  if (naFicha) corpo = renderFormularioFicha(atec);
  else if (enviada) {
    corpo = el("div", {}, [
      el("div", { class: "selo selo-success selo-bloco" }, `Ficha enviada por e-mail para ${ap.ficha.para} (${ap.ficha.email}) em ${fmtDate(ap.ficha.enviadaEm)}.`),
      el("iframe", { class: "email-preview email-preview--pagina", src: `email-ficha-aprovacao.html?v=${VERSAO_PROTOTIPO}#${encodeURIComponent(JSON.stringify(dadosFichaEmail(atec, ap.ficha)))}`, title: "E-mail da ficha de aprovação" }),
      botoes(botaoFecharAba())
    ]);
  } else {
    corpo = el("div", {}, [el("p", { class: "etapa-ajuda" }, `Esta ATEC não está aguardando a ficha de aprovação (etapa atual: ${etapaAtualTexto(atec)}).`), botoes(botaoFecharAba())]);
  }
  root.appendChild(el("div", { class: "vist-pagina" }, [topo, el("div", { class: "vist-corpo" }, [corpo])]));
}

function renderFormularioFicha(atec) {
  const ap = atec.flow.aprovacao;
  const p = atec.flow.planejamento || {};
  const cot = cotacaoDoPlanejamento(atec);
  const fi = fichaInicial(atec);
  const salvar = () => {
    try { executarAcao(atec.id, "salvarFicha", getCurrentRole(), fi); } catch (e) { /* bloqueado por perfil: não salva */ }
  };
  const simNao = (rotulo, obj, chave, ops = ["Sim", "Não"]) =>
    el("div", { class: "ficha-pergunta" }, [el("span", { class: "ficha-pergunta__rotulo" }, rotulo), sldsRadioButtonGroup({ options: ops, value: obj[chave] || "", onChange: (v) => { obj[chave] = v; salvar(); } })]);
  const texto = (rotulo, chave, { area = false, obrigatorio = false } = {}) => campo(rotulo,
    area ? sldsTextarea({ id: `ficha-${chave}`, value: fi[chave] || "", rows: 3, onInput: (v) => { fi[chave] = v; salvar(); } })
      : sldsInput({ id: `ficha-${chave}`, value: fi[chave] || "", onInput: (v) => { fi[chave] = v; salvar(); } }),
    { required: obrigatorio, full: area });
  const secao = (n, titulo, filhos) => el("section", { class: "ficha-secao" }, [
    el("h3", { class: "ficha-secao__titulo" }, [el("span", { class: "ficha-secao__num" }, String(n)), titulo]), ...filhos
  ]);
  const valorOrc = (rotulo, chave) => campo(rotulo, inputValor({ id: `ficha-orc-${chave}`, value: fi.orc[chave], onInput: (v) => { fi.orc[chave] = parseValor(v); salvar(); } }));
  const quantas = texto("Em caso positivo, quantas unidades?", "quantasUnidades");

  return stepShell(atec, `Ficha Corporativa de Aprovação — ${ap.aprovador}`, [
    el("p", { class: "etapa-ajuda" }, `Garantia | Assistência Técnica | Exceções. O que o sistema já sabe vem preenchido; complete o restante. Ao enviar, a ficha vai por e-mail para ${ap.aprovador} (${EMAIL_APROVADOR[ap.aprovador]}) e a ATEC fica aguardando a aprovação.`),
    secao(1, "Identificação da solicitação", [
      resumoLinhas([["Nº ATEC", atec.Name], ["Data abertura", fmtDia(atec.CreatedDate.slice(0, 10))], ["Empreendimento", atec.Empreendimento], ["Unidade", atec.Unidade], ["Cliente", atec.Cliente], ["Responsável pela tratativa", atec.AnalistaResponsavel]]),
      el("div", { class: "form-grid-slds" }, [
        campo("Origem:", sldsSelect({ id: "ficha-origem", options: FICHA.origens, value: fi.origem, onChange: (v) => { fi.origem = v; salvar(); } })),
        campo("Data da análise:", sldsInput({ id: "ficha-data", type: "date", value: fi.dataAnalise, onInput: (v) => { fi.dataAnalise = v; salvar(); } }))
      ])
    ]),
    secao(2, "Resumo do caso", [
      texto("Resumo:", "resumo", { area: true, obrigatorio: true }),
      el("div", { class: "ficha-pergunta" }, [el("span", { class: "ficha-pergunta__rotulo" }, "Impacto identificado"), pilulasMultiplas(FICHA.impactos, fi.impacto, salvar)])
    ]),
    secao(3, "Análise de garantia Opus", [
      ...FICHA.garantia.map(([k, r]) => simNao(r, fi.garantia, k)),
      el("div", { class: "form-grid-slds" }, [texto("Prazo de garantia aplicável:", "prazoAplicavel"), texto("Fundamentação:", "fundamentacao")])
    ]),
    secao(4, "Casos fora da garantia — liberalidade", [
      el("div", { class: "ficha-pergunta" }, [el("span", { class: "ficha-pergunta__rotulo" }, "Motivo para atendimento"), pilulasMultiplas(FICHA.motivosLiberalidade, fi.liberalidade, salvar)]),
      texto("Justificativa (obrigatória se o motivo não for NA):", "justificativa", { area: true })
    ]),
    secao(5, "Perfil do cliente", [
      el("div", { class: "ficha-pergunta" }, [el("span", { class: "ficha-pergunta__rotulo" }, "Qual o perfil do cliente?"), pilulasMultiplas(FICHA.perfisCliente, fi.perfilCliente, salvar)]),
      simNao("Cliente tem mais de 1 unidade?", fi, "maisUnidades"),
      quantas
    ]),
    secao(6, "Validação técnica da engenharia", [
      el("div", { class: "form-grid-slds" }, [texto("Responsável técnico:", "tecResponsavel"), texto("Cargo:", "tecCargo")]),
      texto("Diagnóstico técnico:", "diagnostico", { area: true, obrigatorio: true }),
      texto("Causa raiz identificada:", "causaRaiz", { area: true, obrigatorio: true }),
      texto("Solução técnica recomendada:", "solucao", { area: true, obrigatorio: true }),
      el("div", { class: "form-grid-slds" }, [texto("Quem assume a responsabilidade técnica?", "responsabilidadeTecnica")]),
      ...FICHA.tecnica.map(([k, r, ops]) => simNao(r, fi.tecnica, k, ops))
    ]),
    secao(7, "Orçamento", [
      el("div", { class: "form-grid-slds" }, [valorOrc("Material:", "material"), valorOrc("Mão de obra:", "maoDeObra"), valorOrc("Equipamentos:", "equipamentos"), valorOrc("Outros:", "outros")]),
      resumoLinhas([
        ["Total", `${fmtBRL(ap.valor)}${p.valorNegociado != null ? " (negociado com Suprimentos)" : ""}`],
        ["Quantidade de orçamentos", `${(atec.cotacoes || []).length}: ${(atec.cotacoes || []).map((c) => `${c.Name} ${fmtBRL(c.valorTotal)}`).join(" / ")}`],
        ["Fornecedor escolhido", p.fornecedor]
      ]),
      cot ? detalheCotacao(cot).lastChild : null,
      texto("Motivo da escolha:", "motivoEscolha", { area: true, obrigatorio: true }),
      simNao("Existe preço tabelado para esse serviço?", fi, "precoTabelado")
    ]),
    secao(8, "Matriz de risco", FICHA.riscos.map((r) => simNao(r, fi.risco, r, FICHA.niveisRisco))),
    secao(9, "Aprovações", [
      simNao("Parecer da Assistência Técnica", fi, "parecerAT", FICHA.pareceres),
      simNao("Engenharia", fi, "engenharia", FICHA.engenharia),
      resumoLinhas([[ap.aprovador === ROLES.DIRETOR ? "Diretoria" : ap.aprovador, "Aguardando avaliação (recebe esta ficha por e-mail)"]])
    ]),
    botoes(
      sldsButton("Pré-visualizar e-mail", { onClick: () => abrirPreviewEmail("email-ficha-aprovacao.html", dadosFichaEmail(atec, fi), "Prévia — e-mail da ficha de aprovação") }),
      sldsButton("Salvar rascunho", { onClick: () => { salvar(); showToast("Rascunho da ficha salvo."); } }),
      sldsButton("Enviar ficha para aprovação", { variant: "brand", onClick: () => agir(atec, "enviarFichaAprovacao", fi, `Ficha enviada por e-mail para ${ap.aprovador}.`) })
    )
  ]);
}

function renderAprovacaoReparo(atec) {
  const ap = atec.flow.aprovacao;
  const p = atec.flow.planejamento;
  const anteriores = HISTORICO_REPAROS_MOCK[`${atec.Item}|${atec.SubItem}`] || [];
  const media = anteriores.length ? anteriores.reduce((s, r) => s + r.valor, 0) / anteriores.length : null;

  const historico = el("div", { class: "aprov-historico" }, [
    el("div", {}, [
      el("h4", { class: "bloco-titulo" }, "Trilha de valores desta ATEC"),
      el("table", { class: "slds-table slds-table_bordered slds-table_cell-buffer mini-table" }, [
        el("tbody", {}, atec.flow.valores.map((v) => el("tr", {}, [el("td", {}, v.rotulo), el("td", { class: "num" }, fmtBRL(v.valor))])))
      ])
    ]),
    el("div", {}, [
      el("h4", { class: "bloco-titulo" }, `Reparos anteriores — ${atec.SubItem}`),
      anteriores.length
        ? el("table", { class: "slds-table slds-table_bordered slds-table_cell-buffer mini-table" }, [
          el("thead", {}, el("tr", {}, [el("th", {}, "ATEC"), el("th", {}, "Empreendimento"), el("th", {}, "Data"), el("th", {}, "Valor")])),
          el("tbody", {}, [
            ...anteriores.map((r) => el("tr", {}, [el("td", {}, r.atec), el("td", {}, r.empreendimento), el("td", {}, r.data), el("td", { class: "num" }, fmtBRL(r.valor))])),
            el("tr", { class: "linha-media" }, [el("td", { colspan: "3" }, "Média"), el("td", { class: "num" }, fmtBRL(media))])
          ])
        ])
        : el("p", { class: "etapa-ajuda" }, "Sem reparos anteriores deste Item/Sub Item.")
    ])
  ]);

  const bannerFicha = ap.ficha
    ? el("div", { class: "banner-email" }, [
      el("span", {}, `Ficha de aprovação enviada por e-mail para ${ap.ficha.para} (${ap.ficha.email}) em ${fmtDate(ap.ficha.enviadaEm)}.`),
      el("button", { type: "button", class: "slds-button slds-button_neutral", onclick: () => abrirPreviewEmail("email-ficha-aprovacao.html", dadosFichaEmail(atec, ap.ficha), "E-mail — Ficha de aprovação") }, "Ver ficha / e-mail")
    ])
    : null;

  return painelAprovacao(atec, {
    titulo: `Aprovação do reparo — aguardando ${ap.aprovador}`,
    linhas: [
      ["Cotação", (cotacaoDoPlanejamento(atec) || {}).Name],
      ["Fornecedor", p.fornecedor],
      ["Valor para aprovação", `${fmtBRL(ap.valor)}${p.valorNegociado != null ? " (negociado)" : ""}`],
      ["Alçada", `${ap.aprovador} (${ap.faixa})`],
      ["Período previsto", periodoPrevisto(atec)],
      ["Detalhamento", p.detalhamento]
    ],
    extra: el("div", {}, [bannerFicha, historico]),
    onDecidir: (aprovado, comentario) => agir(atec, "aprovarReparo", { aprovado, comentario }, aprovado ? "Reparo aprovado." : "Reparo reprovado — volta para Planejamento.")
  });
}

// ============================================================================
// Reparo: entrega do serviço com termo assinado pelo cliente (aba separada,
// mesmo modelo da vistoria em campo)
// ============================================================================
function urlPaginaEntrega(atec) {
  return `${location.href.split("#")[0]}#/entrega/${encodeURIComponent(atec.id)}`;
}

function ultimaRecusaEntrega(atec) {
  const vs = atec.flow.reparo.validacoes;
  const ult = vs[vs.length - 1];
  return ult && ult.resultado === "reprovado" ? ult : null;
}

function renderEntregaAtalho(atec) {
  const r = atec.flow.reparo;
  const e = r.entrega;
  const p = atec.flow.planejamento || {};
  const aguardandoAssinatura = atec.flow.step === "termo";
  const iniciada = e.dataInicio || e.dataConclusao || (e.servicoExecutado || "").trim() || (e.fotos || []).length;
  const recusa = ultimaRecusaEntrega(atec);
  return stepShell(atec, "Realização do reparo — entrega do serviço", [
    el("p", { class: "etapa-ajuda" }, "Quando o serviço terminar, registre a entrega numa página própria, aberta em outra aba: o analista informa o que foi executado e, ao final, o cliente confere e assina o termo de entrega do serviço."),
    recusa ? el("div", { class: "selo selo-error selo-bloco" }, `O cliente não aceitou a entrega anterior: ${recusa.motivo}${recusa.parecer ? ` · Parecer: ${recusa.parecer}` : ""}`) : null,
    resumoLinhas([
      ["Cotação", (cotacaoDoPlanejamento(atec) || {}).Name],
      ["Fornecedor", p.fornecedor],
      ["Período previsto", periodoPrevisto(atec)],
      ["Detalhamento", p.detalhamento]
    ]),
    aguardandoAssinatura
      ? el("div", { class: "selo selo-warning selo-bloco" }, "Entrega registrada. Aguardando a assinatura do cliente no termo de entrega.")
      : iniciada ? el("div", { class: "selo selo-info selo-bloco" }, "Registro da entrega em andamento (rascunho salvo).") : null,
    botoes(sldsButton(aguardandoAssinatura ? "Abrir termo para assinatura" : iniciada ? "Continuar registro da entrega" : "Registrar entrega do serviço", {
      variant: "brand",
      onClick: () => window.open(urlPaginaEntrega(atec), "_blank")
    }))
  ]);
}

// Página da entrega (aba separada): registro → assinatura do cliente → concluída
function renderPaginaEntrega(id) {
  const atec = getAtec(id);
  if (!atec) return paginaNaoEncontrada();
  const f = atec.flow;
  const r = f.reparo;
  const naEntrega = f.macro === "reparo" && (f.step === "acompanhar" || f.step === "termo");
  const passoAtual = naEntrega ? (f.step === "acompanhar" ? 0 : 1) : r && r.termo ? 2 : -1;
  const topo = cabecalhoPaginaTermo(atec, "Entrega do serviço", ["Registro da entrega", "Assinatura do cliente", "Concluída"], passoAtual);

  let corpo;
  if (naEntrega) {
    corpo = f.step === "acompanhar" ? renderRegistroEntrega(atec) : renderTermoEntrega(atec);
  } else if (r && r.termo) {
    corpo = el("div", {}, [
      el("div", { class: "selo selo-success selo-bloco" }, `Serviço entregue. Termo assinado por ${r.termo.nome} em ${fmtDate(r.termo.em)}.`),
      el("div", { class: "termo-folha" }, documentoTermoEntrega(atec, r.termo, r.termo)),
      botoes(sldsButton("Imprimir / salvar PDF", { onClick: () => imprimirTermoEntrega(atec) }), botaoFecharAba())
    ]);
  } else {
    const recusa = r && f.step === "analisarReprovacao" ? ultimaRecusaEntrega(atec) : null;
    corpo = el("div", {}, [
      recusa
        ? el("div", { class: "selo selo-error selo-bloco" }, `O cliente não aceitou o serviço: ${recusa.motivo}. A ATEC voltou para o analista analisar.`)
        : el("p", { class: "etapa-ajuda" }, `Esta ATEC não está na etapa de entrega do serviço (etapa atual: ${etapaAtualTexto(atec)}).`),
      botoes(botaoFecharAba())
    ]);
  }
  root.appendChild(el("div", { class: "vist-pagina" }, [topo, el("div", { class: "vist-corpo" }, [corpo])]));
}

function renderRegistroEntrega(atec) {
  const e = atec.flow.reparo.entrega;
  const p = atec.flow.planejamento || {};
  const draft = {
    dataInicio: e.dataInicio || valorCampoDetalhe(atec, "Data_Prevista_de_Inicio_do_Reparo") || "",
    dataConclusao: e.dataConclusao || "",
    executadoPor: e.executadoPor != null ? e.executadoPor : p.fornecedor || "",
    servicoExecutado: e.servicoExecutado != null ? e.servicoExecutado : p.detalhamento || "",
    observacoes: e.observacoes || "",
    fotos: [...(e.fotos || [])],
    anexos: [...(e.anexos || [])]
  };
  const salvar = () => {
    try { executarAcao(atec.id, "salvarEntrega", getCurrentRole(), draft); } catch (err) { /* bloqueado por perfil: não salva */ }
  };
  const fotos = seletorFotos("entrega-fotos", draft.fotos, salvar, "entrega");
  const recusa = ultimaRecusaEntrega(atec);

  return stepShell(atec, "Registro da entrega do serviço", [
    recusa ? el("div", { class: "selo selo-error selo-bloco" }, `Entrega anterior recusada pelo cliente: ${recusa.motivo}${recusa.parecer ? ` · Parecer: ${recusa.parecer}` : ""}`) : null,
    el("div", { class: "form-grid-slds" }, [
      campo("Data de início do serviço:", sldsInput({ id: "entrega-inicio", type: "date", value: draft.dataInicio, onInput: (val) => { draft.dataInicio = val; salvar(); } }), { required: true }),
      campo("Data de conclusão do serviço:", sldsInput({ id: "entrega-fim", type: "date", value: draft.dataConclusao, onInput: (val) => { draft.dataConclusao = val; salvar(); } }), { required: true }),
      campo("Executado por:", sldsInput({ id: "entrega-executor", value: draft.executadoPor, onInput: (val) => (draft.executadoPor = val) }), { required: true }),
      campo("Serviço executado:", sldsTextarea({ id: "entrega-servico", value: draft.servicoExecutado, rows: 3, onInput: (val) => (draft.servicoExecutado = val) }), { required: true, full: true }),
      campo("Observações:", sldsTextarea({ id: "entrega-obs", value: draft.observacoes, rows: 2, onInput: (val) => (draft.observacoes = val) }), { full: true })
    ]),
    el("h4", { class: "bloco-titulo slds-var-m-top_medium" }, "Evidências do serviço"),
    el("div", { class: "form-grid-slds" }, [
      fotos.campo,
      el("div", {}, [el("label", { class: "slds-form-element__label", for: "entrega-anexos" }, "Outros anexos (só o nome é guardado)"), seletorAnexos("entrega-anexos", draft.anexos, () => salvar())])
    ]),
    fotos.galeria,
    el("p", { class: "etapa-ajuda" }, "Ao concluir, o termo de entrega é gerado com as datas, o serviço executado, as observações e as fotos para o cliente conferir e assinar."),
    botoes(
      sldsButton("Salvar rascunho", { onClick: () => { salvar(); showToast("Rascunho da entrega salvo."); } }),
      sldsButton("Gerar termo de entrega", { variant: "brand", onClick: () => agir(atec, "registrarEntrega", draft, "Termo de entrega gerado.") })
    )
  ]);
}

// Documento que o cliente confere e assina na entrega do serviço
function documentoTermoEntrega(atec, c, termo, areaAssinatura = null) {
  const fotos = (atec.flow.reparo.entrega.fotos || []).slice(0, c.fotos);
  const cot = cotacaoDoPlanejamento(atec);
  return el("article", { class: "termo-doc" }, [
    cabecalhoDocumento(atec, "Termo de Entrega de Serviço"),
    resumoLinhas([
      ["Cliente", atec.Cliente],
      ["Empreendimento", atec.Empreendimento],
      ["Unidade", atec.Unidade],
      ["Item / Sub Item", `${atec.Item || "-"} / ${atec.SubItem || "-"}`],
      ["Ambiente", [atec.Ambiente, atec.SubAmbiente].filter(Boolean).join(" — ")],
      ["Solicitação", atec.Descricao],
      cot ? ["Cotação", cot.Name] : null,
      ["Executado por", c.executadoPor],
      ["Período de execução", `${fmtDia(c.dataInicio)} a ${fmtDia(c.dataConclusao)}`]
    ]),
    el("h3", { class: "termo-doc__secao" }, "Serviço executado"),
    el("p", { class: "termo-doc__texto" }, c.servicoExecutado || "-"),
    c.observacoes ? el("h3", { class: "termo-doc__secao" }, "Observações") : null,
    c.observacoes ? el("p", { class: "termo-doc__texto" }, c.observacoes) : null,
    fotos.length ? el("h3", { class: "termo-doc__secao" }, `Registro fotográfico (${fotos.length})`) : null,
    fotos.length ? el("div", { class: "termo-doc__fotos" }, fotos.map((f) => el("img", { src: f.dataUrl, alt: f.nome }))) : null,
    el("h3", { class: "termo-doc__secao" }, "Declaração"),
    el("p", { class: "termo-doc__texto" }, "Declaro que o serviço descrito acima foi executado em minha unidade, que conferi o resultado junto à equipe de Assistência Técnica e que o recebo nas condições registradas neste termo, na data desta assinatura."),
    termo ? blocoAssinado(termo) : areaAssinatura
  ]);
}

function renderTermoEntrega(atec) {
  const estado = { nome: "", assinatura: null };
  const recusa = { motivo: "" };
  const areaRecusa = el("div", { class: "recusa-entrega", hidden: "hidden" }, [
    campo("Por que o cliente não aceita o serviço?", sldsTextarea({ id: "entrega-recusa", rows: 3, onInput: (val) => (recusa.motivo = val) }), { required: true, full: true }),
    botoes(sldsButton("Registrar recusa do cliente", { variant: "destructive", onClick: () => agir(atec, "recusarEntrega", recusa, "Recusa registrada. A ATEC voltou para o analista.") }))
  ]);
  const doc = documentoTermoEntrega(atec, conteudoEntrega(atec.flow.reparo.entrega), null, areaAssinaturaCliente(atec, estado));

  return stepShell(atec, "Termo de entrega — assinatura do cliente", [
    el("p", { class: "etapa-ajuda" }, "Entregue o aparelho ao cliente para conferir o serviço e assinar. Se o cliente não aceitar, registre o motivo; para corrigir alguma informação, volte para o registro."),
    el("div", { class: "termo-folha" }, doc),
    botoes(
      sldsButton("Voltar e editar registro", { onClick: () => agir(atec, "voltarEntrega", {}) }),
      sldsButton("Cliente não aceita o serviço", { onClick: () => { areaRecusa.hidden = !areaRecusa.hidden; } }),
      sldsButton("Confirmar assinatura e concluir reparo", { variant: "brand", onClick: () => agir(atec, "assinarTermoEntrega", estado, "Termo de entrega assinado. Reparo concluído.") })
    ),
    areaRecusa
  ]);
}

function imprimirTermoEntrega(atec) {
  const termo = atec.flow.reparo.termo;
  imprimirDocumento(`Termo de entrega ${atec.Name}`, documentoTermoEntrega(atec, termo, termo));
}

// Área de assinatura desenhada (mouse/toque)
function padAssinatura(onChange) {
  const canvas = el("canvas", { class: "assinatura", width: "460", height: "150", "aria-label": "Área de assinatura" });
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#16325c";
  let desenhando = false;
  let vazio = true;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
  };
  canvas.addEventListener("pointerdown", (e) => { desenhando = true; canvas.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
  canvas.addEventListener("pointermove", (e) => { if (!desenhando) return; ctx.lineTo(...pos(e)); ctx.stroke(); vazio = false; });
  canvas.addEventListener("pointerup", () => { desenhando = false; if (!vazio) onChange(canvas.toDataURL("image/png")); });
  const limpar = el("button", { type: "button", class: "slds-button slds-button_neutral", onclick: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); vazio = true; onChange(null); } }, "Limpar assinatura");
  return el("div", { class: "assinatura-wrap" }, [canvas, limpar]);
}

function renderAnalisarReprovacao(atec) {
  const ultima = atec.flow.reparo.validacoes[atec.flow.reparo.validacoes.length - 1];
  const estado = { parecer: "" };
  return stepShell(atec, "Analisar reprovação do cliente", [
    resumoLinhas([["Motivo do cliente", ultima.motivo], ["Reprovado em", fmtDate(ultima.em)]]),
    campo("Parecer:", sldsTextarea({ id: "rep-parecer", rows: 3, onInput: (v) => (estado.parecer = v) }), { required: true, full: true }),
    el("p", { class: "etapa-ajuda" }, "Após o parecer, a ATEC volta para a realização do reparo: corrija o serviço e registre a entrega de novo para o cliente assinar."),
    botoes(sldsButton("Registrar parecer", { variant: "brand", onClick: () => agir(atec, "analisarReprovacao", estado, "Parecer registrado.") }))
  ]);
}

function renderFinalizarReparo(atec) {
  const estado = { obs: "" };
  const ultima = atec.flow.reparo.validacoes[atec.flow.reparo.validacoes.length - 1];
  return stepShell(atec, "Finalizar ATEC", [
    el("div", { class: "selo selo-success selo-bloco" }, `Cliente assinou o termo de entrega do serviço em ${fmtDate(ultima.em)}${ultima.nome ? ` (${ultima.nome})` : ""}.`),
    ultima.assinatura ? el("img", { class: "assinatura-img", src: ultima.assinatura, alt: "Assinatura do cliente" }) : null,
    atec.flow.reparo.termo ? botoes(sldsButton("Ver termo de entrega", { onClick: () => window.open(urlPaginaEntrega(atec), "_blank") })) : null,
    campo("Observação de encerramento (opcional):", sldsTextarea({ id: "fin-obs", rows: 2, onInput: (v) => (estado.obs = v) }), { full: true }),
    botoes(sldsButton("Finalizar ATEC", { variant: "brand", onClick: () => agir(atec, "finalizarAtec", estado, "ATEC finalizada.") }))
  ]);
}

function renderFinalizada(atec) {
  const r = atec.flow.reparo;
  return stepShell(atec, "ATEC finalizada", [
    resumoLinhas([["Valor aprovado", fmtBRL(atec.flow.aprovacao.valor)], ["Fornecedor", atec.flow.planejamento.fornecedor], ["Observação de encerramento", r.obsEncerramento]])
  ]);
}

function cabecalhoNegativa(atec) {
  const n = atec.flow.negativa;
  return resumoLinhas([["Origem", n.origem], ["Motivo", n.motivo], ["Data", fmtDate(n.data)]]);
}

function renderNegativaEscrever(atec) {
  const n = atec.flow.negativa;
  const estado = { texto: n.devolutiva || "" };
  const ultimaReprov = n.reprovacoes[n.reprovacoes.length - 1];
  return stepShell(atec, "Negativa — escrever devolutiva", [
    cabecalhoNegativa(atec),
    ultimaReprov ? el("div", { class: "selo selo-error selo-bloco" }, `Devolutiva reprovada por ${ultimaReprov.perfil}: ${ultimaReprov.comentario}`) : null,
    campo("Devolutiva para o cliente:", sldsTextarea({ id: "neg-texto", value: estado.texto, rows: 5, onInput: (v) => (estado.texto = v) }), { required: true, full: true }),
    el("p", { class: "etapa-ajuda" }, `Aprovação sequencial: ${APROVADORES_DEVOLUTIVA.join(" → ")}.`),
    botoes(sldsButton("Enviar para aprovação", { variant: "brand", onClick: () => agir(atec, "escreverDevolutiva", estado, "Devolutiva enviada para aprovação.") }))
  ]);
}

function trilhaAprovadores(n) {
  return el("ol", { class: "trilha-aprovadores" }, APROVADORES_DEVOLUTIVA.map((perfil) => {
    const feito = n.aprovacoes.some((a) => a.perfil === perfil);
    const atual = n.aprovadorAtual === perfil;
    return el("li", { class: feito ? "is-feito" : atual ? "is-atual" : "" }, `${feito ? "✓ " : ""}${perfil}`);
  }));
}

function renderNegativaAprovar(atec) {
  const n = atec.flow.negativa;
  return painelAprovacao(atec, {
    titulo: `Negativa — aprovação da devolutiva (${n.aprovadorAtual})`,
    linhas: [["Origem", n.origem], ["Motivo", n.motivo]],
    extra: el("div", {}, [trilhaAprovadores(n), el("blockquote", { class: "devolutiva" }, n.devolutiva)]),
    onDecidir: (aprovado, comentario) => agir(atec, "aprovarDevolutiva", { aprovado, comentario }, aprovado ? "Devolutiva aprovada." : "Devolutiva reprovada — volta para o Analista.")
  });
}

function dadosEmailDevolutiva(atec) {
  return { ...dadosEmail(atec), devolutiva: atec.flow.negativa.devolutiva, solicitante: atec.Solicitante || atec.Cliente || "Cliente" };
}

function renderNegativaFinalizar(atec) {
  const n = atec.flow.negativa;
  const estado = { obs: "" };
  return stepShell(atec, "Negativa — finalizar ATEC", [
    el("div", { class: "banner-email" }, [
      el("span", {}, `Devolutiva aprovada (${APROVADORES_DEVOLUTIVA.join(", ")}) e enviada ao cliente pelo sistema em ${fmtDate(n.enviadaEm)}.`),
      el("button", { type: "button", class: "slds-button slds-button_neutral", onclick: () => abrirPreviewEmail("email-devolutiva-negativa.html", dadosEmailDevolutiva(atec), "E-mail — Devolutiva ao cliente") }, "Ver e-mail")
    ]),
    cabecalhoNegativa(atec),
    campo("Observação de encerramento (opcional):", sldsTextarea({ id: "neg-fin-obs", rows: 2, onInput: (v) => (estado.obs = v) }), { full: true }),
    botoes(sldsButton("Finalizar ATEC", { variant: "brand", onClick: () => agir(atec, "finalizarNegativa", estado, "ATEC finalizada (Negativa).") }))
  ]);
}

function renderNegativaFinalizada(atec) {
  const n = atec.flow.negativa;
  return stepShell(atec, "ATEC finalizada — Negativa", [
    cabecalhoNegativa(atec),
    el("blockquote", { class: "devolutiva" }, n.devolutiva),
    botoes(el("button", { type: "button", class: "slds-button slds-button_neutral", onclick: () => abrirPreviewEmail("email-devolutiva-negativa.html", dadosEmailDevolutiva(atec), "E-mail — Devolutiva ao cliente") }, "Ver e-mail enviado"))
  ]);
}

// ============================================================================
// Checklists
// ============================================================================
// answers: { tabela:{}, aberta:{}, escolha:{}, lista:{} } — mutado in place; onChange persiste
function renderChecklist(checklist, answers, onChange) {
  const container = el("div", { class: "atec-checklist" }, [
    checklist.titulo ? el("h4", { class: "checklist-titulo" }, checklist.titulo) : null,
    checklist.subtitulo ? el("p", { class: "checklist-subtitulo" }, checklist.subtitulo) : null
  ]);

  checklist.blocos.forEach((bloco) => {
    const blocoNode = el("div", { class: "checklist-bloco" }, [el("h4", { class: "bloco-titulo" }, bloco.titulo)]);

    if (bloco.tipo === "tabela") {
      answers.tabela[bloco.titulo] = answers.tabela[bloco.titulo] || {};
      const respostas = answers.tabela[bloco.titulo];

      const table = el("table", { class: "slds-table slds-table_bordered slds-table_cell-buffer checklist-table" }, [
        el("thead", {}, el("tr", {}, [
          el("th", { scope: "col", style: "width:35%" }, "Item"),
          el("th", { scope: "col", style: "width:30%" }, "Resposta"),
          el("th", { scope: "col", style: "width:35%" }, "Observação")
        ])),
        el("tbody", {}, bloco.itens.map((item) => {
          respostas[item] = respostas[item] || { valor: "", observacao: "" };
          const grupo = sldsRadioButtonGroup({
            options: ["Sim", "Não"],
            value: respostas[item].valor,
            onChange: (v) => { respostas[item].valor = v; onChange(); }
          });
          const obsInput = sldsInput({
            id: `obs-${bloco.titulo}-${item}`.replace(/\s+/g, "_"),
            value: respostas[item].observacao,
            placeholder: "Observação",
            onInput: (v) => { respostas[item].observacao = v; onChange(); }
          });
          return el("tr", {}, [el("th", { scope: "row" }, item), el("td", {}, grupo), el("td", {}, obsInput)]);
        }))
      ]);
      blocoNode.appendChild(el("div", { class: "table-scroll" }, table));
    } else if (bloco.tipo === "aberta") {
      answers.aberta[bloco.titulo] = answers.aberta[bloco.titulo] || {};
      const respostas = answers.aberta[bloco.titulo];
      bloco.perguntas.forEach((pergunta, idx) => {
        respostas[pergunta] = respostas[pergunta] || "";
        const fieldId = `aberta-${bloco.titulo}-${idx}`.replace(/\s+/g, "_");
        blocoNode.appendChild(el("div", { class: "slds-var-m-bottom_small" }, [
          sldsFormField({
            label: pergunta, id: fieldId, full: true,
            control: sldsTextarea({ id: fieldId, value: respostas[pergunta], rows: 2, onInput: (v) => { respostas[pergunta] = v; onChange(); } })
          })
        ]));
      });
    } else if (bloco.tipo === "escolha") {
      blocoNode.appendChild(sldsRadioButtonGroup({
        options: bloco.opcoes,
        value: answers.escolha[bloco.titulo] || "",
        onChange: (v) => { answers.escolha[bloco.titulo] = v; onChange(); }
      }));
    } else if (bloco.tipo === "lista") {
      answers.lista[bloco.titulo] = answers.lista[bloco.titulo] || [];
      const marcados = answers.lista[bloco.titulo];
      bloco.itens.forEach((item, idx) => {
        blocoNode.appendChild(sldsCheckbox({
          id: `lista-${bloco.titulo}-${idx}`.replace(/\s+/g, "_"),
          label: item,
          checked: marcados.includes(item),
          onChange: (checked) => {
            const i = marcados.indexOf(item);
            if (checked && i < 0) marcados.push(item);
            if (!checked && i >= 0) marcados.splice(i, 1);
            onChange();
          }
        }));
      });
    }

    container.appendChild(blocoNode);
  });

  return container;
}

// Versão somente leitura (briefing na Triagem): accordion, uma seção por item
function renderChecklistLeitura(checklist, answers, titulo) {
  const a = answers && Object.keys(answers).length ? answers : { tabela: {}, aberta: {}, escolha: {}, lista: {} };
  const SEM_RESPOSTA = "Não respondido";
  const itens = checklist.blocos.map((bloco) => {
    let linhas = [];
    if (bloco.tipo === "tabela") {
      const r = a.tabela[bloco.titulo] || {};
      linhas = bloco.itens.map((item) => [item, r[item] && r[item].valor ? `${r[item].valor}${r[item].observacao ? ` — ${r[item].observacao}` : ""}` : SEM_RESPOSTA]);
    } else if (bloco.tipo === "aberta") {
      const r = a.aberta[bloco.titulo] || {};
      linhas = bloco.perguntas.map((p) => [p, r[p] || SEM_RESPOSTA]);
    } else if (bloco.tipo === "escolha") {
      linhas = [["Seleção", a.escolha[bloco.titulo] || SEM_RESPOSTA]];
    } else if (bloco.tipo === "lista") {
      linhas = [["Marcados", (a.lista[bloco.titulo] || []).join(", ") || "Nenhum"]];
    }
    const respondidas = linhas.filter(([, v]) => v !== SEM_RESPOSTA).length;
    return el("details", { class: "ck-acordeao__item" }, [
      el("summary", { class: "ck-acordeao__cabecalho" }, [
        el("span", { class: "ck-acordeao__titulo" }, bloco.titulo),
        el("span", { class: `ck-acordeao__contagem${respondidas === linhas.length ? " is-completo" : ""}` }, `${respondidas}/${linhas.length} respondidos`)
      ]),
      el("div", { class: "ck-acordeao__corpo" }, resumoLinhas(linhas))
    ]);
  });
  const abrirTodos = (aberto) => itens.forEach((d) => (d.open = aberto));
  return el("section", { class: "ck-acordeao checklist-leitura" }, [
    el("div", { class: "ck-acordeao__topo" }, [
      el("h4", { class: "ck-acordeao__rotulo" }, titulo),
      el("span", { class: "ck-acordeao__acoes" }, [
        el("button", { type: "button", class: "link-botao", onclick: () => abrirTodos(true) }, "Expandir tudo"),
        el("button", { type: "button", class: "link-botao", onclick: () => abrirTodos(false) }, "Recolher tudo")
      ])
    ]),
    ...itens
  ]);
}
