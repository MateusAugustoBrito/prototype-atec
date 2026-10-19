// Helpers para gerar markup real do SLDS (Salesforce Lightning Design System),
// o mesmo framework CSS usado por baixo dos componentes lightning-* do portal.

// Helper genérico de criação de elementos DOM (compartilhado por slds.js e app.js).
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.substring(2), value);
    } else if (value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === null || child === undefined) return;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  });
  return node;
}

const SLDS_ICONS_BASE =
  "https://unpkg.com/@salesforce-ux/design-system@2.264.1/assets/icons";

function sldsIcon(category, name, extraClass = "") {
  const svgNs = "http://www.w3.org/2000/svg";
  const xlinkNs = "http://www.w3.org/1999/xlink";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", `slds-icon slds-icon_x-small ${extraClass}`);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(svgNs, "use");
  use.setAttributeNS(xlinkNs, "xlink:href", `${SLDS_ICONS_BASE}/${category}-sprite/svg/symbols.svg#${name}`);
  svg.appendChild(use);
  return svg;
}

let sldsIdSeq = 0;
function nextId(prefix) {
  sldsIdSeq += 1;
  return `${prefix}-${sldsIdSeq}`;
}

function sldsButton(label, { variant = "neutral", onClick, disabled = false, extraClass = "" } = {}) {
  const btn = el("button", {
    class: `slds-button slds-button_${variant} ${extraClass}`,
    type: "button"
  }, label);
  if (disabled) btn.setAttribute("disabled", "disabled");
  if (onClick) btn.addEventListener("click", onClick);
  return btn;
}

function sldsFormField({ label, id, required = false, control, full = false }) {
  const labelEl = el("label", { class: "slds-form-element__label", for: id }, [
    required ? el("abbr", { class: "slds-required", title: "obrigatório" }, "*") : null,
    label
  ]);
  return el("div", { class: `slds-form-element ${full ? "slds-size_1-of-1" : ""}` }, [
    labelEl,
    el("div", { class: "slds-form-element__control" }, control)
  ]);
}

function sldsInput({ id, type = "text", value = "", placeholder = "", onInput, list }) {
  const input = el("input", {
    type,
    id,
    class: "slds-input",
    value,
    placeholder,
    list
  });
  if (onInput) input.addEventListener("input", (e) => onInput(e.target.value));
  return input;
}

function sldsTextarea({ id, value = "", onInput, rows = 3 }) {
  const textarea = el("textarea", { id, class: "slds-textarea", rows }, value);
  if (onInput) textarea.addEventListener("input", (e) => onInput(e.target.value));
  return textarea;
}

function sldsSelect({ id, options = [], value = "", placeholder = "Selecione...", onChange, disabled = false }) {
  const select = el("select", { id, class: "slds-select" }, [
    el("option", { value: "" }, placeholder),
    ...options.map((opt) => {
      const optEl = el("option", { value: opt }, opt);
      if (opt === value) optEl.setAttribute("selected", "selected");
      return optEl;
    })
  ]);
  if (disabled) select.setAttribute("disabled", "disabled");
  if (onChange) select.addEventListener("change", (e) => onChange(e.target.value));
  return select;
}

function sldsCheckbox({ id, label, checked = false, onChange }) {
  const input = el("input", { type: "checkbox", id, class: "choice-checkbox-input" });
  if (checked) input.setAttribute("checked", "checked");
  if (onChange) input.addEventListener("change", (e) => onChange(e.target.checked));

  return el("div", { class: "choice-checkbox-wrap" }, [
    input,
    el("label", { class: "choice-checkbox-label", for: id }, label)
  ]);
}

// Grupo de opções em formato "pill" — visual próprio (não depende dos seletores
// internos do SLDS para slds-radio_button-group, que não renderizam bem via CDN).
// Mantém <input type="radio"> real por baixo para acessibilidade/seleção única.
function sldsRadioButtonGroup({ label, options, value = "", onChange }) {
  const name = nextId("radio-group");
  const group = el("div", { class: "choice-group" }, options.map((opt) => {
    const id = `${name}-${opt.replace(/\s+/g, "_")}`;
    const input = el("input", { type: "radio", name, id, value: opt, class: "choice-pill-input" });
    if (opt === value) input.setAttribute("checked", "checked");
    if (onChange) {
      input.addEventListener("change", (e) => {
        if (e.target.checked) onChange(opt);
      });
    }
    return el("span", { class: "choice-pill-wrap" }, [
      input,
      el("label", { class: "choice-pill", for: id }, opt)
    ]);
  }));

  if (label) {
    return el("fieldset", { class: "slds-form-element" }, [
      el("legend", { class: "slds-form-element__label" }, label),
      el("div", { class: "slds-form-element__control" }, group)
    ]);
  }
  return group;
}

// stages: [{ key, label, estado }] — estado: completa | ativa | pendente |
// naoSeAplica (riscada) | negativa / negativaFinal (vermelha, slds-is-lost)
const PATH_ESTADOS = {
  completa: { classe: "slds-is-complete", texto: "Completa" },
  ativa: { classe: "slds-is-current slds-is-active", texto: "Etapa atual" },
  pendente: { classe: "slds-is-incomplete", texto: "Pendente" },
  naoSeAplica: { classe: "slds-is-incomplete path-nao-se-aplica", texto: "Não se aplica" },
  negativa: { classe: "slds-is-current slds-is-active slds-is-lost", texto: "Negativa em andamento" },
  negativaFinal: { classe: "slds-is-lost", texto: "Encerrada em Negativa" }
};

function sldsPath(stages) {
  const items = stages.map((stage) => {
    const estado = PATH_ESTADOS[stage.estado] || PATH_ESTADOS.pendente;
    const titulo = stage.estado === "naoSeAplica" ? `${stage.label} — não se aplica` : stage.label;

    return el("li", { class: `slds-path__item ${estado.classe}`, role: "presentation" }, [
      el("a", { class: "slds-path__link", role: "option", tabindex: "-1", title: titulo, "aria-selected": stage.estado === "ativa" ? "true" : "false" }, [
        el("span", { class: "slds-path__stage" }, [
          sldsIcon("utility", "check"),
          el("span", { class: "slds-assistive-text" }, estado.texto)
        ]),
        el("span", { class: "slds-path__title" }, stage.label)
      ])
    ]);
  });

  return el("div", { class: "slds-path" }, [
    el("div", { class: "slds-grid slds-path__track" }, [
      el("div", { class: "slds-grid slds-path__scroller-container" }, [
        el("div", { class: "slds-path__scroller" }, [
          el("div", { class: "slds-path__scroller_inner" }, [
            el("ul", { class: "slds-path__nav", role: "listbox", "aria-orientation": "horizontal" }, items)
          ])
        ])
      ])
    ])
  ]);
}

function sldsModal({ title, bodyNode, footerNode, onClose }) {
  const backdrop = el("div", { class: "slds-backdrop slds-backdrop_open" });
  const closeBtn = el("button", { class: "slds-button slds-button_icon slds-modal__close slds-button_icon-inverse", type: "button", title: "Fechar" }, [
    sldsIcon("utility", "close", "slds-button__icon slds-button__icon_large"),
    el("span", { class: "slds-assistive-text" }, "Fechar")
  ]);
  closeBtn.addEventListener("click", () => onClose());

  const section = el("section", { class: "slds-modal slds-fade-in-open slds-modal_medium", role: "dialog" }, [
    el("div", { class: "slds-modal__container" }, [
      el("header", { class: "slds-modal__header" }, [
        closeBtn,
        el("h2", { class: "slds-modal__title slds-hyphenate" }, title)
      ]),
      el("div", { class: "slds-modal__content slds-p-around_medium" }, bodyNode),
      el("footer", { class: "slds-modal__footer" }, footerNode)
    ])
  ]);

  return { section, backdrop };
}

// Abas reais do SLDS (slds-tabs_default). tabs: [{ label, content }]
function sldsTabs(tabs) {
  const navId = nextId("tabs");
  const links = [];
  const panels = [];

  const nav = el("ul", { class: "slds-tabs_default__nav", role: "tablist" });
  const contentWrapper = el("div", { class: "slds-tabs_default__content-wrapper" });

  tabs.forEach((tab, index) => {
    const tabId = `${navId}-${index}`;
    const isActive = index === 0;

    const link = el("a", {
      class: "slds-tabs_default__link",
      href: "#",
      role: "tab",
      tabindex: isActive ? "0" : "-1",
      "aria-selected": isActive ? "true" : "false",
      "aria-controls": tabId,
      id: `${tabId}__item`
    }, tab.label);

    const li = el("li", {
      class: `slds-tabs_default__item ${isActive ? "slds-is-active" : ""}`,
      title: tab.label,
      role: "presentation"
    }, link);

    const panel = el("div", {
      id: tabId,
      class: `slds-tabs_default__content ${isActive ? "slds-show" : "slds-hide"}`,
      role: "tabpanel",
      "aria-labelledby": `${tabId}__item`
    }, tab.content);

    link.addEventListener("click", (e) => {
      e.preventDefault();
      links.forEach((l, i) => {
        l.link.parentElement.classList.toggle("slds-is-active", i === index);
        l.link.setAttribute("aria-selected", i === index ? "true" : "false");
        l.link.setAttribute("tabindex", i === index ? "0" : "-1");
      });
      panels.forEach((p, i) => {
        p.classList.toggle("slds-show", i === index);
        p.classList.toggle("slds-hide", i !== index);
      });
    });

    links.push({ link });
    panels.push(panel);
    nav.appendChild(li);
    contentWrapper.appendChild(panel);
  });

  return el("div", { class: "slds-tabs_default" }, [nav, contentWrapper]);
}

// Campo somente-leitura no padrão visual real (.field-label / .field-value-container / .field-value)
function sldsFieldDisplay(label, value) {
  return el("div", { class: "slds-col slds-size_1-of-2 slds-medium-size_1-of-3 slds-large-size_1-of-4" }, [
    el("span", { class: "field-label" }, label),
    el("div", { class: "field-value-container" }, [
      el("span", { class: "field-value" }, value || "-")
    ])
  ]);
}

function sldsFieldsGrid(fields) {
  return el("div", { class: "slds-grid slds-wrap slds-gutters" }, fields.map(([label, value]) => sldsFieldDisplay(label, value)));
}
