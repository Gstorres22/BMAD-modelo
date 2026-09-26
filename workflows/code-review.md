---
id: code-review
name: Revisão de código
agent: qa
icon: 🧪
context: selection,gitDiff,diagnostics
output: docs/qa/review.md
inputLabel: Indique o foco da revisão de código (ex: cobertura, segurança, performance, regressões):
---

# Revisão de Código e Quality Gate

## Objetivo
Realizar uma revisão técnica e de confiabilidade profunda do código selecionado ou das alterações recentes (`docs/qa/review.md`), conduzida por Quinn (QA / Test Architect). A revisão examina aderência a boas práticas, robustez contra falhas silenciosas, segurança de execução, concorrência, conformidade com os critérios de aceite e emite o parecer oficial do Quality Gate (`PASS`, `CONCERNS`, `FAIL` ou `WAIVED`).

## Entrada do Usuário
{{input}}

## Passos do Agente (Quinn)
1. **Inspeção do Contexto de Mudanças:** Analise a seleção de código (`selection`), as alterações no controle de versão (`gitDiff`), os diagnósticos do compilador/linter (`diagnostics`) e as diretrizes informadas na entrada.
2. **Avaliação Holística de Qualidade:**
   - **Correção Lógica:** O código atende plenamente ao comportamento pretendido sem efeitos colaterais indesejados?
   - **Tratamento de Exceções:** Todos os caminhos de erro previsíveis são capturados e tratados de forma informativa?
   - **Segurança e Sanitização:** Há risco de vazamento de credenciais, path traversal ou injeção de comandos?
   - **Performance e Recursos:** Há vazamento de memória, loops infinitos potenciais ou operações síncronas bloqueantes?
3. **Mapeamento de Achados por Severidade:** Categorize os defeitos e oportunidades de melhoria em Crítico (Blocker), Alto (Major), Médio (Minor) ou Baixo/Sugestão, citando sempre `caminho:linha`.
4. **Mapeamento de Riscos e Testes Faltantes:** Identifique cenários de borda que não possuem cobertura de teste automatizado.
5. **Decisão do Quality Gate:** Emita formalmente um dos quatro status:
   - `PASS`: Código aprovado para merge/produção sem ressalvas impeditivas.
   - `CONCERNS`: Aprovado com ressalvas não-bloqueantes que devem ser endereçadas em curto prazo.
   - `FAIL`: Bloqueado. Contém defeitos críticos, falhas de segurança ou violação dos critérios de aceite.
   - `WAIVED`: Exceção concedida formalmente por decisão explícita de produto/negócio.
6. **Compilação do Relatório:** Salve a auditoria completa em `docs/qa/review.md` e direcione o handoff para James (`dev`) ou Sarah (`po`).

## Perguntas de Elicitação (se houver dúvidas de escopo)
- Qual é o nível de tolerância a riscos desta entrega (ambiente de homologação interna vs. produção crítica)?
- Há dependências externas simuladas (mocks) ou as integrações são reais?
- Existe algum requisito não-funcional de tempo de resposta específico para estas operações?

---

## Esqueleto do Documento de Saída (`docs/qa/review.md`)

```markdown
# 🧪 Relatório de Revisão de Código e Quality Gate

## 1. Resumo da Inspeção e Veredito
- **Data da Revisão:** [Data atual]
- **Revisor:** Quinn (QA / Test Architect)
- **Quality Gate:** [PASS / CONCERNS / FAIL / WAIVED]
- **Arquivos Inspecionados:** [Lista dos arquivos avaliados no gitDiff / selection]
- **Diagnósticos Encontrados:** [Total de erros, avisos ou limpo]
- **Resumo Executivo:** [Parecer conciso sobre a estabilidade e qualidade do código revisado]

## 2. Achados por Severidade
### 🔴 Crítico (Bloqueante para Merge/Release)
- **[Título do Problema Crítico]:**
  - *Localização:* `caminho/do/arquivo.js:linha`
  - *Descrição:* [O que está quebrado ou vulnerável]
  - *Impacto:* [Falha de segurança, quebra em tempo de execução, perda de dados]
  - *Sugestão de Correção:* [Trecho de código ou orientação técnica precisa]

### 🟠 Alto (Correção Fortemente Recomendada)
- **[Título do Problema Alto]:**
  - *Localização:* `caminho/do/arquivo.js:linha`
  - *Descrição:* [Problema de lógica ou vazamento de recursos]
  - *Impacto:* [Degradação de performance ou comportamento inconsistente em cenários adversos]
  - *Sugestão de Correção:* [...]

### 🟡 Médio (Melhoria de Manutenibilidade / Boas Práticas)
- **[Título da Oportunidade Média]:**
  - *Localização:* `caminho/do/arquivo.js:linha`
  - *Descrição:* [Falta de validação defensiva ou duplicação de lógica]
  - *Sugestão de Correção:* [...]

### 🔵 Baixo / Sugestão de Estilo
- **[Sugestão]:**
  - *Localização:* `caminho/do/arquivo.js:linha`
  - *Descrição:* [Nome de variável mais semântico, comentário de clarificação]

## 3. Riscos e Efeitos Colaterais Mapeados
- **Risco 1:** [Impacto potencial em outros módulos que dependem deste componente]
- **Risco 2:** [Possível regressão em fluxos existentes no sistema]

## 4. Testes Faltantes e Cenários de Borda Não Cobertos
- [ ] **Cenário de Borda 1:** [Ex: O que acontece quando o payload de entrada é vazio ou nulo?]
- [ ] **Cenário de Borda 2:** [Ex: Como o sistema se comporta quando a conexão com o provedor cai no meio do stream?]
- [ ] **Teste de Carga / Limite:** [Ex: Comportamento quando o arquivo atinge o limite máximo de 200 KB]

## 5. Recomendações e Próximos Passos
- **Se Quality Gate = FAIL:** Devolver imediatamente para James (`dev`) corrigir os itens críticos com o comando `*fix-bug`.
- **Se Quality Gate = PASS:** Notificar Sarah (`po`) para aceite final da história e Paige (`tech-writer`) para atualização da documentação técnica.
```
