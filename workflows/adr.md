---
id: adr
name: Registrar decisão (ADR)
agent: architect
icon: 🧭
context: 
output: docs/adr/ADR-000-titulo.md
inputLabel: Descreva a decisão técnica a tomar, contexto e alternativas consideradas:
---

# Registro de Decisão Arquitetural (ADR)

## Objetivo
Formalizar uma decisão técnica de impacto estrutural no projeto utilizando o formato padronizado de Architecture Decision Record (ADR), facilitado por Winston (Arquiteto de Software). O documento gerado (`docs/adr/ADR-000-titulo.md`) preserva o contexto histórico, as opções avaliadas, os trade-offs envolvidos e as consequências futuras, garantindo que a equipe compreenda as motivações por trás das escolhas de engenharia.

## Entrada do Usuário
{{input}}

## Passos do Agente (Winston)
1. **Identificação do Dilema Técnico:** Analise a entrada do usuário para definir com clareza o problema técnico ou de arquitetura a ser resolvido.
2. **Contextualização e Forças:** Documente as restrições de tempo, recursos, compatibilidade e desempenho que influenciam a decisão.
3. **Avaliação de Opções e Alternativas:** Liste as alternativas viáveis além da opção proposta, analisando vantagens e desvantagens de cada uma.
4. **Declaração Clara da Decisão:** Formule a decisão de modo afirmativo, inequívoco e embasado em argumentos sólidos.
5. **Mapeamento de Consequências:** Liste as consequências positivas (ganhos obtidos) e as negativas (novos custos, restrições ou dívidas assumidas conscientemente).
6. **Formatação do Artefato:** Preencha o esqueleto da ADR numerando de acordo com o padrão do repositório (ex.: `ADR-001-escolha-do-runtime.md`) e salve em `docs/adr/`.

## Perguntas de Elicitação (se faltarem elementos)
- Por que a abordagem convencional ou atual se mostrou inadequada para este cenário?
- Quais são os principais impactos negativos ou riscos aceitos ao escolher esta alternativa?
- Há custos financeiros ou de licenciamento associados a esta decisão?
- Essa decisão pode ser revertida facilmente no futuro ou é uma decisão de porta de mão única (irreversível)?

---

## Esqueleto do Documento de Saída (`docs/adr/ADR-000-titulo.md`)

```markdown
# ADR-000: [Título Curto e Descritivo da Decisão]

## 1. Metadados
- **Status:** Proposto | Aceito | Rejeitado | Substituído por [ADR-XXX]
- **Data da Decisão:** [AAAA-MM-DD]
- **Autor / Proponente:** Winston (Arquiteto de Software) / [Nome do Autor]
- **Decisores / Aprovadores:** [Sarah (PO), John (PM), James (Dev)]

## 2. Contexto e Declaração do Problema
[Descreva o contexto do sistema, o problema técnico enfrentado e as forças motivadoras. Por exemplo: restrições de ambiente, requisitos de escalabilidade, limites de memória, custos operacionais ou necessidades de segurança.]

## 3. Decisão
Adotaremos [descreva com precisão a solução ou padrão escolhido].

### Justificativa Técnica
- [Argumento 1: Por que esta é a melhor opção dadas as forças apresentadas]
- [Argumento 2: Benefícios imediatos para a estabilidade e simplicidade do sistema]
- [Argumento 3: Alinhamento com os princípios do método BMAD]

## 4. Consequências
### Positivas (Ganhos)
- [Ganho 1, ex: Zero dependências externas npm simplifica segurança e auditoria]
- [Ganho 2, ex: Melhora significativa na velocidade de inicialização do processo]
- [Ganho 3, ex: Facilidade de manutenção por desenvolvedores futuros]

### Negativas / Trade-offs Aceitos
- [Custo 1, ex: Necessidade de implementar utilitários nativos em JavaScript puro]
- [Custo 2, ex: Menor disponibilidade de bibliotecas de terceiros pré-prontas]

## 5. Alternativas Consideradas e Descartadas
### Alternativa 1: [Nome da Alternativa]
- **Descrição:** [Como funcionaria]
- **Motivo do Descarte:** [Por que não foi escolhida, ex: introduzia dependência pesada de build ou aumentava a superfície de ataque]

### Alternativa 2: [Nome da Alternativa]
- **Descrição:** [Como funcionaria]
- **Motivo do Descarte:** [Por que não atendeu aos critérios de resiliência exigidos]

## 6. Validação e Acompanhamento
- **Critério de Validação:** [Como confirmaremos na prática que a decisão foi bem-sucedida, ex: testes automatizados sem erro e tempo de resposta < 100ms]
- **Revisão Futura:** [Condições sob as quais esta ADR deve ser reaberta e reavaliada]
```
