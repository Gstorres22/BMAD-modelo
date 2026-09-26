---
id: test-design
name: Plano de testes
agent: qa
icon: 📐
context: activeFile,selection
output: docs/qa/test-design.md
inputLabel: Descreva a história/feature ou o código a ser testado (ou cole os critérios de aceite):
---

# Test Design — Estratégia e Cenários de Teste

## Objetivo
Produzir um plano de testes guiado por risco para a história, feature ou código informado, conduzido por Quinn
(QA / Test Architect). O plano define **o que** testar, **em qual nível** (unitário, integração, E2E), **com qual prioridade**
e **como rastrear** cada cenário até um critério de aceite.

## Entrada do Usuário
{{input}}

## Passos do Agente (Quinn)
1. **Entender o escopo:** leia a entrada, o arquivo ativo e a seleção. Se o projeto tiver testes, localize os existentes
   (ferramentas de leitura/busca) para seguir o framework e as convenções já usados.
2. **Perfil de risco:** para cada área, avalie Probabilidade (1–3) × Impacto (1–3) = Score (1–9). Score ≥ 6 é alto risco.
3. **Mapear critérios de aceite → cenários:** cada critério de aceite (AC) precisa de ao menos um cenário, no formato
   Dado / Quando / Então.
4. **Escolher o nível certo:** prefira o nível mais baixo que dê confiança real (unitário > integração > E2E). Evite duplicar
   o mesmo cenário em vários níveis sem motivo.
5. **Priorizar:** P0 (crítico, bloqueia release), P1 (importante), P2 (desejável), P3 (se sobrar tempo).
6. **Cobrir o que costuma escapar:** bordas (vazio, nulo, limites), erros e timeouts de dependências, concorrência,
   segurança (entrada maliciosa, autorização), requisitos não funcionais (performance, acessibilidade).
7. **Esboçar os testes P0:** escreva o código de exemplo dos testes P0 no framework do projeto, em blocos de código, para
   James (`dev`) aplicar.

## Perguntas de Elicitação (se faltar informação)
- Quais são os critérios de aceite oficiais da história?
- Qual framework de testes o projeto usa (ou devo propor um)?
- Há ambiente de integração/staging disponível para testes E2E?
- Existem requisitos não funcionais mensuráveis (latência, carga, acessibilidade)?

---

## Esqueleto do Documento de Saída (`docs/qa/test-design.md`)

```markdown
# 📐 Test Design — [Nome da história/feature]

- **Autor:** Quinn (QA / Test Architect)
- **Data:** [data]
- **Escopo:** [o que está dentro e fora do plano]

## 1. Resumo
- Total de cenários: [N] (Unitário: [n] · Integração: [n] · E2E: [n])
- Distribuição de prioridade: P0 [n] · P1 [n] · P2 [n] · P3 [n]
- Maiores riscos: [lista curta]

## 2. Perfil de Risco
| Área | Risco | Prob. (1–3) | Impacto (1–3) | Score | Mitigação |
|---|---|---|---|---|---|
| [área] | [descrição] | [p] | [i] | [p×i] | [teste/ação] |

## 3. Rastreabilidade (Critério de Aceite → Cenários)
| AC | Cenário | Nível | Prioridade |
|---|---|---|---|
| AC1 | [id do cenário] | Unitário | P0 |

## 4. Cenários de Teste
### [ID] — [Título]
- **Nível:** Unitário | Integração | E2E
- **Prioridade:** P0 | P1 | P2 | P3
- **Dado** [pré-condição] **Quando** [ação] **Então** [resultado esperado]
- **Dados de teste:** [...]

## 5. Bordas, Erros e Não Funcionais
- [ ] [cenário de borda]
- [ ] [falha de dependência / timeout]
- [ ] [segurança]
- [ ] [performance / acessibilidade]

## 6. Esboço dos Testes P0
[blocos de código no framework do projeto]

## 7. Próximos Passos
- James (`dev`): implementar os testes P0/P1 junto com a história (`*write-tests`).
- Quinn (`qa`): executar `*review-code` e emitir o gate após a implementação.
```
