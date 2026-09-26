---
id: market-research
name: Pesquisa de mercado e concorrência
agent: analyst
icon: 🔎
context: 
output: docs/market-research.md
inputLabel: Informe o nicho de mercado, concorrentes diretos ou solução pretendida:
---

# Pesquisa de Mercado e Análise Competitiva

## Objetivo
Conduzir um levantamento aprofundado de mercado e inteligência competitiva com Mary (Analista de Negócios). O propósito é mapear as tendências do setor, dissecar os concorrentes existentes, identificar vulnerabilidades e lacunas de mercado, e posicionar o produto com vantagens estratégicas e diferenciais competitivos claros em `docs/market-research.md`.

## Entrada do Usuário
{{input}}

## Passos do Agente (Mary)
1. **Definição do Espaço de Mercado:** Categorize o setor, tamanho aproximado e dinâmica de crescimento.
2. **Mapeamento de Competidores:** Identifique e classifique os principais concorrentes diretos, indiretos e alternativas substitutas.
3. **Análise de Recursos e Matriz de Paridade:** Compare funcionalidades-chave, modelo de preços, pontos fortes e pontos fracos de cada concorrente.
4. **Construção da Análise SWOT:** Sintetize as Forças (Strengths), Fraquezas (Weaknesses), Oportunidades (Opportunities) e Ameaças (Threats).
5. **Identificação de "Oceanos Azuis":** Descubra necessidades latentes negligenciadas pelos players dominantes.
6. **Recomendações Estratégicas:** Formule diretrizes claras para alimentar o Project Brief e o PRD.

## Perguntas de Elicitação (se faltarem dados)
- Quem são os concorrentes que os clientes mais citam ao rejeitar soluções similares?
- Qual é a faixa de preço praticada pelas soluções atuais no mercado?
- O mercado está em expansão rápida, consolidado ou em declínio?
- Quais são os principais motivos de insatisfação dos usuários com as ferramentas vigentes (reclamações em fóruns, avaliações, canais de suporte)?

---

## Esqueleto do Documento de Saída (`docs/market-research.md`)

```markdown
# 🔎 Pesquisa de Mercado e Inteligência Competitiva

## 1. Visão Geral do Mercado e Tendências
- **Segmento de Atuação:** [Definição do setor / nicho]
- **Tamanho e Maturidade do Mercado:** [Mercado emergente, em crescimento acelerado ou consolidado]
- **Macro-Tendências Tecnológicas e de Negócio:**
  - [Tendência 1, ex: Automação por IA generativa]
  - [Tendência 2, ex: Pressão por segurança e privacidade de dados]
  - [Tendência 3, ex: Preferência por soluções sem atrito de instalação]

## 2. Análise Competitiva Detalhada
### Matriz de Comparação de Recursos
| Concorrente | Tipo (Direto/Indireto) | Preço / Modelo | Forças Principais | Fraquezas Notáveis |
|---|---|---|---|---|
| [Concorrente A] | Direto | SaaS por assento | Marca forte, amplo suporte | Interface datada, preço elevado |
| [Concorrente B] | Direto | Freemium | Fácil adesão inicial | Pouca robustez técnica |
| [Concorrente C] | Indireto | Planilhas manuais | Custo zero aparente | Risco de erro humano, sem escala |

### Diferenciais Competitivos da Nossa Solução
- [Vantagem Competitiva 1]: [Por que somos melhores neste ponto específico]
- [Vantagem Competitiva 2]: [Por que somos melhores neste ponto específico]

## 3. Matriz SWOT Estratégica
| Forças (Internas) | Fraquezas (Internas) |
|---|---|
| • [Força 1, ex: Arquitetura ágil e moderna]<br>• [Força 2, ex: Foco em nicho desassistido] | • [Fraqueza 1, ex: Marca ainda desconhecida]<br>• [Fraqueza 2, ex: Base de usuários inicial zero] |

| Oportunidades (Externas) | Ameaças (Externas) |
|---|---|
| • [Oportunidade 1, ex: Insatisfação com preços dos líderes]<br>• [Oportunidade 2, ex: Novas regulações] | • [Ameaça 1, ex: Grandes players lançarem cópia rápida]<br>• [Ameaça 2, ex: Resistência à mudança cultural] |

## 4. Lacunas de Mercado e Oportunidades Inexploradas
- **Lacuna 1:** [Demanda de usuário não atendida pelos concorrentes]
- **Lacuna 2:** [Fricção de usabilidade comum nas ferramentas existentes que podemos eliminar]

## 5. Fatores Críticos de Sucesso e Barreiras de Entrada
- **Barreiras de Entrada a Superar:** [Custos de troca (switching cost), rede de parceiros]
- **Fatores Críticos de Sucesso:** [O que o nosso produto NÃO pode errar sob hipótese alguma]

## 6. Recomendações Estratégicas para o Produto
- **Posicionamento de Mercado Recomendado:** [Como nos comunicaremos no mercado]
- **Funcionalidades Inegociáveis no MVP:** [O que precisamos ter no dia 1 para competir]
- **Próximos Passos BMAD:** Mary (`analyst`) para consolidar o `docs/project-brief.md` ou John (`pm`) para o `docs/prd.md`.
```
