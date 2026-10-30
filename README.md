# Protótipo ATEC — Portal (fluxo em etapas)

Protótipo estático, sem Salesforce. Abra `index.html` no navegador. Os dados ficam no `localStorage` do navegador.

## Como usar

- **Atuando como** (canto superior direito): escolhe o perfil simulado. Cada etapa mostra o responsável e fica bloqueada para os outros perfis. O botão "Atuar como …" troca o perfil direto.
- **Carregar exemplos** cria 9 ATECs fictícias, cada uma numa etapa diferente (incluindo uma em Negativa e uma Finalizada).
- **Limpar dados de teste** apaga tudo.

## Fluxo

Abertura → Triagem → Vistoria → Investigação → Planejamento e Orçamento → Aprovação → Reparo → Finalizada. A Negativa pode começar na Análise Nível 02 ou na Investigação.

| Regra | Onde está |
|---|---|
| Etapas, perfis, alçadas e limites de valor | `data.js` (`MACRO_STAGES`, `ROLES`, `ALCADAS_*`, `LIMITE_*`) |
| Transições, validações e histórico | `store.js` (`ACOES`, `STEPS`) |
| Telas de cada subpasso | `app.js` (`render*`) |
| Exemplos | `seeds.js` |
| Modelos de e-mail | `email-devolutiva-negativa.html`, `email-ficha-aprovacao.html` (Ficha de aprovação: Supervisora ATEC e Diretor) |

Limites atuais:
- Orçamento **acima de R$ 10.000,00**: Suprimentos negocia antes da aprovação.
- Investigação: até R$ 2.000,00 Supervisora ATEC; R$ 2.000,01 a R$ 10.000,00 Head CRC; acima, Diretor. Custo zero dispensa a aprovação.
- Reparo (valor negociado, ou orçado se não houver negociação): até R$ 1.000,00 Especialista ATEC; até R$ 2.500,00 Supervisora ATEC; até R$ 5.000,00 Head CRC; acima, Diretor.

## Como cadastrar um novo checklist de abertura

Os checklists de abertura ficam em `CHECKLISTS_ABERTURA`, no fim de `data.js`. Cada entrada diz a quais Item/Sub Item se aplica (`"*"` = todos):

```js
const CHECKLIST_PINTURA_ABERTURA = {
  titulo: "CHECKLIST DE ABERTURA — PINTURA",
  subtitulo: "Complementa o Nível 1 para chamados de pintura",
  blocos: [
    { tipo: "tabela", titulo: "IDENTIFICAÇÃO", itens: ["Ambiente fotografado", "Área afetada medida"] },
    { tipo: "aberta", titulo: "HISTÓRICO", perguntas: ["Quando a mancha apareceu?"] },
    { tipo: "escolha", titulo: "CRITICIDADE", opcoes: ["Alta", "Média", "Baixa"] }
  ]
};

const CHECKLISTS_ABERTURA = [
  { id: "nivel1-geral", aplicaA: { item: "*", subItem: "*" }, checklist: CHECKLIST_NIVEL_1 },
  { id: "pintura", aplicaA: { item: "Pintura", subItem: "*" }, checklist: CHECKLIST_PINTURA_ABERTURA }
];
```

Vale sempre a entrada mais específica: Item + Sub Item, depois só Item, depois o padrão (`*`). Tipos de bloco aceitos: `tabela` (Sim/Não + observação), `aberta` (texto), `escolha` (uma opção) e `lista` (várias marcações).

Os checklists **técnicos** (preenchidos na Vistoria) ficam em `INVESTIGACAO_CHECKLISTS`, um por Item/Sub Item.
