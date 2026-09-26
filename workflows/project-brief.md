---
id: project-brief
name: Project Brief
agent: analyst
icon: 📊
context: 
output: docs/project-brief.md
inputLabel: Descreva a visão do projeto, público-alvo e problema de negócio (ou cole notas iniciais):
---

# Elaboração de Project Brief

## Objetivo
Estruturar o documento oficial de Project Brief do projeto (`docs/project-brief.md`), conduzido por Mary (Analista de Negócios). O documento sintetiza o contexto estratégico, a dor do mercado, a proposta de valor e os limites iniciais de escopo, servindo como o artefato de entrada fundamental para o planejamento detalhado conduzido pelo Product Manager (John).

## Entrada do Usuário
{{input}}

## Passos do Agente (Mary)
1. **Análise de Contexto e Viabilidade:** Examine a visão e as anotações fornecidas pelo usuário na entrada.
2. **Identificação da Dor Real:** Clarifique qual é a necessidade insatisfeita do usuário e por que as alternativas atuais falham.
3. **Mapeamento de Stakeholders e Personas:** Defina com exatidão quem são os usuários beneficiados e os decisores de compra.
4. **Delimitação Preliminar de Escopo:** Separe o núcleo essencial do produto (MVP) daquilo que é expansão futura.
5. **Definição de Métricas de Negócio:** Estabeleça indicadores-chave de desempenho (KPIs) objetivos para medir o sucesso.
6. **Compilação do Artefato Formal:** Gere o documento completo segundo o esqueleto oficial abaixo e recomende o handoff para John (`pm`).

## Perguntas de Elicitação (se faltarem dados essenciais)
- Qual é o problema mais agudo que o cliente enfrenta hoje sem esta solução?
- Como o usuário resolve esse problema atualmente (concorrentes diretos, planilhas, processos manuais)?
- Qual é o modelo de monetização ou retorno de valor esperado (SaaS, sob demanda, economia interna)?
- Existem restrições de tempo, conformidade regulatória (LGPD/GDPR) ou orçamentárias conhecidas?

---

## Esqueleto do Documento de Saída (`docs/project-brief.md`)

```markdown
# 📊 Project Brief: [Nome do Projeto]

## 1. Visão Geral do Projeto
- **Nome do Projeto:** [Nome provisório ou definitivo]
- **Patrocinador / Stakeholders:** [Quem demanda e financia o projeto]
- **Data do Brief:** [Data de criação]
- **Status:** Em Planejamento / Proposto

## 2. Problema de Negócio e Oportunidade
- **Contexto de Mercado:** [Cenário em que a oportunidade surge]
- **A Dor Central:** [Descrição da frustração, custo ou ineficiência que o cliente vivencia]
- **Custo da Inação:** [O que acontece se o cliente continuar sem essa solução]

## 3. Público-Alvo e Personas Principais
- **Persona Primária:** [Perfil demográfico, cargo/papel, principais responsabilidades e dores]
- **Persona Secundária:** [Usuários indiretos ou influenciadores]
- **Beneficiário Final:** [Quem colhe os frutos do uso da aplicação]

## 4. Proposta de Valor e Diferenciais
- **Declaração de Valor:** [Para [público-alvo] que [necessidade], o [produto] é uma [categoria] que [benefício principal]. Diferente de [alternativas], nossa solução [diferencial único].]
- **Pilares de Diferenciação:**
  1. [Pilar 1]: [Descrição do diferencial]
  2. [Pilar 2]: [Descrição do diferencial]

## 5. Escopo Preliminar
### No Escopo (In Scope - MVP)
- [Funcionalidade/Capacidade essencial 1]
- [Funcionalidade/Capacidade essencial 2]
- [Funcionalidade/Capacidade essencial 3]

### Fora do Escopo (Out of Scope - Futuro/Descartado)
- [Funcionalidade que NÃO entrará nesta versão 1]
- [Integração complexa postergada 2]

## 6. Riscos, Premissas e Dependências
- **Premissas Críticas:** [Suposições que consideramos verdadeiras sem prova imediata]
- **Riscos de Negócio:** [Fatores externos ou internos que podem comprometer a iniciativa e como mitigá-los]
- **Dependências Externas:** [Parcerias, aprovações legais ou fornecedores terceiros]

## 7. Métricas de Sucesso (KPIs e OKRs)
| Métrica / KPI | Situação Atual (Baseline) | Meta (3-6 meses) | Forma de Medição |
|---|---|---|---|
| [Ex: Taxa de Conversão] | [Atual ou N/A] | [Meta esperada] | [Ferramenta/Relatório] |
| [Ex: Tempo de Conclusão da Tarefa] | [Atual ou N/A] | [Meta esperada] | [Métricas de produto] |

## 8. Handoff e Próximos Passos
- **Próximo Especialista BMAD:** John (`pm`) para geração do PRD oficial (`docs/prd.md`).
- **Ações Imediatas:**
  1. Revisar o Project Brief com as partes interessadas.
  2. Disparar a criação do PRD e o alinhamento com UX (Sally).
```
