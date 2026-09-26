---
id: prd
name: Criar PRD
agent: pm
icon: 📋
context: 
output: docs/prd.md
inputLabel: Descreva o produto/feature (ou cole o Project Brief):
---

# Criação de Product Requirements Document (PRD)

## Objetivo
Estruturar o Product Requirements Document oficial (`docs/prd.md`) conduzido por John (Product Manager). O PRD é a fonte única da verdade para escopo de produto, estabelecendo metas de negócio, requisitos funcionais detalhados (FR1, FR2...), requisitos não-funcionais (NFR1, NFR2...), objetivos de interface, premissas técnicas e decomposição em épicos e histórias com critérios de aceite claros.

## Entrada do Usuário
{{input}}

## Passos do Agente (John)
1. **Absorção de Contexto:** Analise o material de entrada fornecido pelo usuário (Project Brief, notas ou ideias).
2. **Definição de Metas e Limites:** Estabeleça os objetivos estratégicos e os critérios de sucesso mensuráveis, cravando as fronteiras de In Scope e Out of Scope.
3. **Elaboração dos Requisitos Funcionais (FRs):** Detalhe cada capacidade do sistema numerada sequencialmente (`FR1`, `FR2`, ...), explicitando entradas, comportamentos esperados e saídas.
4. **Especificação de Requisitos Não-Funcionais (NFRs):** Defina metas claras de performance, disponibilidade, segurança e escalabilidade (`NFR1`, `NFR2`, ...).
5. **Alinhamento de UI/UX e Premissas Técnicas:** Documente as diretrizes essenciais de experiência do usuário e as restrições arquiteturais a serem respeitadas.
6. **Estruturação de Épicos e Histórias:** Decomponha o escopo em épicos coerentes, listando histórias preliminares com critérios de aceitação no formato Dado-Quando-Então.
7. **Compilação do Documento:** Gere o artefato Markdown completo em `docs/prd.md` e recomende o handoff para Sally (`ux-expert`) e Winston (`architect`).

## Perguntas de Elicitação (se houver ambiguidades)
- Quais são os principais casos de uso ou jornadas que o usuário final deve conseguir concluir?
- Quais volumes de dados ou acessos simultâneos são esperados no primeiro ano de operação?
- Há integrações obrigatórias com sistemas legados ou provedores externos específicos?
- O que deliberadamente decidimos NÃO construir nesta primeira versão do produto?

---

## Esqueleto do Documento de Saída (`docs/prd.md`)

```markdown
# 📋 Product Requirements Document (PRD): [Nome do Produto/Feature]

## 1. Metas e Contexto
- **Visão Geral:** [Resumo executivo do produto, problema a ser resolvido e valor entregue]
- **Objetivos de Negócio:**
  - [Objetivo 1, ex: Reduzir em 50% o tempo gasto na criação de especificações técnicas]
  - [Objetivo 2, ex: Atingir 95% de satisfação dos usuários nos primeiros 90 dias]
- **Métricas de Sucesso (KPIs):**
  - [Métrica 1]: [Meta quantitativa e método de acompanhamento]
  - [Métrica 2]: [Meta quantitativa e método de acompanhamento]
- **Limites de Escopo:**
  - **In Scope (MVP):** [Lista explícita de recursos e capacidades incluídas]
  - **Out of Scope:** [Lista explícita de recursos descartados ou postergados]

## 2. Requisitos Funcionais (FR)
- **FR1 — [Título da Funcionalidade 1]:**
  - *Descrição:* O sistema deve permitir que [ator] realize [ação], de modo que [resultado].
  - *Entradas:* [Dados ou eventos que disparam o fluxo]
  - *Comportamento:* [Regras de negócio, transformações e validações]
  - *Saídas:* [Retornos de sistema, mensagens ou persistência de dados]
- **FR2 — [Título da Funcionalidade 2]:**
  - *Descrição:* O sistema deve fornecer [capacidade].
  - *Entradas:* [...]
  - *Comportamento:* [...]
  - *Saídas:* [...]
- **FR3 — [Título da Funcionalidade 3]:**
  - *Descrição:* [...]

## 3. Requisitos Não-Funcionais (NFR)
- **NFR1 — Performance e Latência:** O tempo de resposta para operações comuns não deve exceder [X ms], com carregamento de página em até [Y s].
- **NFR2 — Segurança e Privacidade:** Dados sensíveis devem ser protegidos em trânsito e em repouso. Autenticação e autorização estritas segundo as melhores práticas.
- **NFR3 — Disponibilidade e Resiliência:** O sistema deve operar com disponibilidade mínima de [99.X%], com recuperação graciosa de falhas.
- **NFR4 — Escalabilidade:** O sistema deve suportar até [N] requisições simultâneas sem degradação perceptível.
- **NFR5 — Usabilidade e Acessibilidade:** Conformidade com padrões WCAG 2.1 nível AA e operação fluida por teclado.

## 4. Objetivos de UI e Experiência do Usuário
- **Diretriz de Design:** [Interface limpa, moderna, minimalista e com baixa carga cognitiva]
- **Jornadas Críticas de Usuário:**
  - *Jornada 1:* [Passo a passo da interação principal do usuário]
  - *Jornada 2:* [Passo a passo do fluxo de configuração ou consulta]
- **Estados Obrigatórios de Interface:** Toda tela deve tratar explicitamente os estados: Carregando (Loading), Sucesso, Vazio (Empty State) e Erro.

## 5. Premissas Técnicas e Restrições
- **Ambiente Operacional:** [Navegadores suportados, sistemas operacionais, requisitos de runtime]
- **Restrições Tecnológicas:** [Tecnologias obrigatórias ou proibidas, como zero dependências externas ou JavaScript vanilla]
- **Interoperabilidade:** [APIs, formatos de arquivo (JSON/Markdown) e padrões de exportação]

## 6. Épicos e Histórias de Usuário
### Épico 1: [Nome do Épico 1]
- **Valor do Épico:** [Por que este épico é necessário]
- **História 1.1: [Título da História]**
  - *Como* [papel do usuário], *quero* [ação pretendida] *para que* [benefício alcançado].
  - *Critérios de Aceite:*
    - **Cenário 1:** Dado [condição prévia], quando [ação], então [resultado esperado].
    - **Cenário 2:** Dado [condição de erro], quando [ação inválida], então [mensagem amigável de erro].
- **História 1.2: [Título da História]**
  - *Como* [...], *quero* [...] *para que* [...].
  - *Critérios de Aceite:* [...]

### Épico 2: [Nome do Épico 2]
- **História 2.1: [Título da História]**
  - *Como* [...], *quero* [...] *para que* [...].
  - *Critérios de Aceite:* [...]

## 7. Handoff e Próximos Passos
- **Design de Experiência:** Sally (`ux-expert`) para criação da especificação de front-end (`docs/front-end-spec.md`).
- **Arquitetura Técnica:** Winston (`architect`) para elaboração do documento de arquitetura (`docs/architecture.md`).
- **Validação de Negócio e Sharding:** Sarah (`po`) para conferência e refinamento.
```
