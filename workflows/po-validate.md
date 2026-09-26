---
id: po-validate
name: Validar documentos (checklist PO)
agent: po
icon: ✅
context: openFiles
output: docs/po-validation.md
inputLabel: Indique quais documentos validar (ex: PRD, Arquitetura, Front-end Spec) ou critérios específicos:
---

# Validação Documental e Checklist do Product Owner

## Objetivo
Auditar a integridade, completude e consistência cruzada de todos os artefatos de planejamento e solução do projeto (`docs/prd.md`, `docs/architecture.md`, `docs/front-end-spec.md`), sob a condução de Sarah (Product Owner). O objetivo é garantir que nenhum requisito essencial esteja vago, contraditório ou sem respaldo técnico antes que as histórias de usuário sejam criadas e entregues para implementação.

## Entrada do Usuário
{{input}}

## Passos do Agente (Sarah)
1. **Inspeção Documental:** Acesse os arquivos na pasta `docs/` e os arquivos abertos no workspace (`openFiles`).
2. **Aplicação do Checklist de Completude:** Avalie se cada seção mandatória dos documentos foi preenchida com substância real (sem placeholders, sem TODOs e sem frases evasivas).
3. **Auditoria de Rastreabilidade Cruzada:** Verifique se cada Requisito Funcional (FR) possui representação clara na Arquitetura e na Especificação de Front-End, e se todos os NFRs possuem estratégia de mitigação correspondente.
4. **Mapeamento de Incongruências:** Identifique contradições de escopo ou viabilidade entre o que o PRD pede e o que a Arquitetura define, citando `caminho:linha`.
5. **Avaliação para Sharding:** Avalie se a documentação precisa ser particionada em módulos menores para evitar sobrecarga cognitiva do time.
6. **Emissão do Veredito Formal:** Emita o status inequívoco (`APROVADO`, `AJUSTES NECESSÁRIOS` ou `REJEITADO`) no relatório consolidado em `docs/po-validation.md`.

## Perguntas de Elicitação (se faltarem informações)
- Há documentos adicionais ou acordos de escopo firmados fora do repositório que devem ser considerados?
- Existem restrições de data de entrega que justifiquem reduzir o escopo desta validação?
- Há dependências externas não documentadas que podem impedir a entrega das histórias?

---

## Esqueleto do Documento de Saída (`docs/po-validation.md`)

```markdown
# ✅ Relatório de Validação de Documentos e Checklist do PO

## 1. Metadados e Escopo da Auditoria
- **Data da Auditoria:** [Data atual]
- **Auditora:** Sarah (Product Owner)
- **Documentos Auditados:**
  - `docs/prd.md`
  - `docs/architecture.md`
  - `docs/front-end-spec.md`
- **Veredito Geral:** [APROVADO / AJUSTES NECESSÁRIOS / REJEITADO]

## 2. Checklist de Completude Documental
| Documento | Critério Obrigatório | Status | Observações / Lacunas |
|---|---|---|---|
| PRD | Metas de negócio quantificáveis (KPIs) | [OK / PENDENTE] | [Detalhe] |
| PRD | Requisitos Funcionais detalhados (FR1..) | [OK / PENDENTE] | [Detalhe] |
| PRD | Requisitos Não-Funcionais mensuráveis (NFR1..) | [OK / PENDENTE] | [Detalhe] |
| PRD | Delimitação de escopo (In Scope / Out of Scope) | [OK / PENDENTE] | [Detalhe] |
| Arquitetura | Diagrama visual da solução (Mermaid) | [OK / PENDENTE] | [Detalhe] |
| Arquitetura | Tabela de stack com justificativas sólidas | [OK / PENDENTE] | [Detalhe] |
| Arquitetura | Modelagem de dados e contratos de API | [OK / PENDENTE] | [Detalhe] |
| Arquitetura | Políticas de tratamento de erros e segurança | [OK / PENDENTE] | [Detalhe] |
| Front-End Spec | Design tokens e paleta semântica | [OK / PENDENTE] | [Detalhe] |
| Front-End Spec | Estados dos componentes (loading, erro, vazio) | [OK / PENDENTE] | [Detalhe] |
| Front-End Spec | Critérios de acessibilidade (WCAG 2.1 AA) | [OK / PENDENTE] | [Detalhe] |

## 3. Análise de Rastreabilidade e Coerência Cruzada
- **Alinhamento PRD ↔ Arquitetura:**
  - *Status:* [Alinhado / Divergente]
  - *Detalhes:* [Ex: O FR3 exige WebSocket, mas a arquitetura apenas previu endpoints REST]
- **Alinhamento PRD ↔ Front-End Spec:**
  - *Status:* [Alinhado / Divergente]
  - *Detalhes:* [Ex: O fluxo de aprovação de usuário não possui tela correspondente na UX]

## 4. Incongruências e Pontos de Atenção Críticos
- **[Apontamento 1 - Nome da Divergência]:**
  - *Ocorrência:* `docs/prd.md:45` vs. `docs/architecture.md:88`
  - *Descrição:* [Explicação clara do conflito]
  - *Ação Corretiva Exigida:* [Quem deve corrigir e qual a mudança esperada]

## 5. Estratégia de Sharding (Fatiamento de Backlog)
- **Módulo 1:** [Nome do subconjunto funcional] → Pronto para decomposição em histórias.
- **Módulo 2:** [Nome do subconjunto funcional] → Aguarda ajuste arquitetural prévio.

## 6. Próximos Passos e Liberação
- **Autorização para Histórias:** [SIM / NÃO - Condicionado às correções listadas]
- **Handoff Recomendado:**
  - Se aprovado: Bob (`sm`) para iniciar a criação das histórias em `docs/stories/`.
  - Se ajustes forem necessários: John (`pm`) ou Winston (`architect`) para sanar as divergências.
```
