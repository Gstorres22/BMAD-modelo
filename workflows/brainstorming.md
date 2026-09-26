---
id: brainstorming
name: Sessão de brainstorming
agent: brainstorming-coach
icon: 🧠
context: 
output: docs/brainstorming.md
inputLabel: Descreva o desafio, ideia ou problema a explorar:
---

# Sessão de Brainstorming e Ideação Criativa

## Objetivo
Facilitar uma sessão estruturada de ideação divergente e convergente conduzida por Carson (Brainstorming Coach). O objetivo é explorar múltiplas perspectivas inovadoras sobre o desafio proposto pelo usuário, desconstruir bloqueios mentais, gerar soluções originais e consolidar as melhores ideias em um documento de saída acionável (`docs/brainstorming.md`) pronto para a esteira BMAD.

## Entrada do Usuário
{{input}}

## Passos do Agente (Carson)
1. **Compreensão e Desconstrução do Desafio:** Analise o desafio fornecido na entrada. Se estiver vago, faça perguntas de elicitação antes de concluir, ou assuma premissas razoáveis declarando-as expressamente.
2. **Seleção de Técnicas Estruturadas de Ideação:** Aplique ativamente uma ou mais das seguintes técnicas consagradas do BMAD:
   - **SCAMPER:** Substituir, Combinar, Adaptar, Modificar/Ampliar, Propor outro uso, Eliminar, Reorganizar/Reverter.
   - **Seis Chapéus do Pensamento (Edward de Bono):** Branco (fatos/dados), Vermelho (emoções/intuição), Preto (riscos/crítica), Amarelo (otimismo/benefícios), Verde (criatividade/ideias novas), Azul (processo/síntese).
   - **What-If (Provocação Hipotética):** "E se não houvesse limitações de tempo?", "E se o usuário pudesse fazer isso em 1 segundo?", "E se a IA fizesse tudo autonomamente?".
   - **Mapa Mental Conceitual:** Ramificações visuais e hierárquicas a partir do problema central.
   - **Brainstorm Reverso:** "Como poderíamos falhar miseravelmente ou piorar ao máximo este problema?" para revelar vulnerabilidades e oportunidades ocultas.
   - **Primeiros Princípios:** Decompor a questão aos seus blocos mais fundamentais e reconstruir do zero.
3. **Geração Ampla de Ideias (Divergência):** Gere de 10 a 20 ideias variadas, encorajando conceitos ousados e fora da caixa.
4. **Agrupamento por Afinidade e Filtro (Convergência):** Organize as ideias em categorias lógicas e posicione-as em uma Matriz de Impacto vs. Complexidade/Esforço.
5. **Seleção do Top 3:** Detalhe profundamente as 3 soluções mais promissoras, com proposta de valor, viabilidade e diferenciais.
6. **Plano de Próximos Passos:** Indique o handoff ideal para Mary (`analyst`) ou John (`pm`).

## Perguntas de Elicitação (quando faltarem dados)
- Qual é o público-alvo primário impactado por este desafio?
- Existem restrições inegociáveis de tecnologia, prazo ou orçamento?
- Quais soluções já foram tentadas anteriormente e por que não foram suficientes?
- O que representaria um sucesso estrondoso para esta iniciativa em 3 a 6 meses?

---

## Esqueleto do Documento de Saída (`docs/brainstorming.md`)

```markdown
# 🧠 Relatório de Brainstorming e Ideação Criativa

## 1. Desafio Central e Contexto
- **Problema / Oportunidade:** [Descrição precisa da questão explorada]
- **Objetivo da Sessão:** [O que se pretende alcançar]
- **Público Impactado:** [Usuários ou stakeholders centrais]
- **Premissas Iniciais:** [Premissas adotadas durante a facilitação]

## 2. Metodologias e Técnicas Aplicadas
- [Técnica 1, ex: SCAMPER]: [Como foi explorada e principais provocações]
- [Técnica 2, ex: Seis Chapéus]: [Visão dos chapéus Verde, Preto e Amarelo]
- [Técnica 3, ex: What-If]: [Cenários hipotéticos analisados]

## 3. Registro de Ideias Geradas (Divergência)
### Categoria A: [Nome da Categoria]
1. **[Ideia 1]:** [Descrição concisa e valor pretendido]
2. **[Ideia 2]:** [Descrição concisa e valor pretendido]
3. **[Ideia 3]:** [Descrição concisa e valor pretendido]

### Categoria B: [Nome da Categoria]
4. **[Ideia 4]:** [Descrição concisa e valor pretendido]
5. **[Ideia 5]:** [Descrição concisa e valor pretendido]

## 4. Matriz de Priorização (Impacto vs. Complexidade)
| Ideia | Impacto (Alto/Médio/Baixo) | Esforço/Complexidade (Alto/Médio/Baixo) | Prioridade |
|---|---|---|---|
| [Ideia X] | Alto | Baixo | Quick Win (Imediata) |
| [Ideia Y] | Alto | Alto | Estratégica (Planejar) |
| [Ideia Z] | Médio | Baixo | Oportunidade Tática |

## 5. Top 3 Ideias Vencedoras Detalhadas
### 🥇 1. [Título da Ideia 1]
- **Conceito Central:** [Explicação aprofundada]
- **Por que venceu:** [Diferencial competitivo e valor gerado]
- **Riscos Principais:** [Pontos de atenção identificados]

### 🥈 2. [Título da Ideia 2]
- **Conceito Central:** [Explicação aprofundada]
- **Por que venceu:** [Diferencial competitivo e valor gerado]
- **Riscos Principais:** [Pontos de atenção identificados]

### 🥉 3. [Título da Ideia 3]
- **Conceito Central:** [Explicação aprofundada]
- **Por que venceu:** [Diferencial competitivo e valor gerado]
- **Riscos Principais:** [Pontos de atenção identificados]

## 6. Próximos Passos e Handoff no BMAD
- **Handoff Recomendado:** [Mary (Analyst) para criação do Project Brief ou John (PM) para elaboração do PRD]
- **Ações Imediatas:**
  1. Validar as premissas do Top 3 com stakeholders.
  2. Executar o workflow correspondente no BMAD Studio.
```
