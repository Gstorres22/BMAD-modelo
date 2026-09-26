---
id: architecture-review
name: Revisar arquitetura do código
agent: architect
icon: 🔍
context: activeFile,openFiles,gitStatus
output: docs/architecture-review.md
inputLabel: Descreva o foco da revisão arquitetural ou módulos específicos a inspecionar:
---

# Revisão de Arquitetura do Código

## Objetivo
Conduzir uma auditoria estrutural e arquitetural rigorosa do código-fonte e das alterações em andamento (`docs/architecture-review.md`), facilitada por Winston (Arquiteto de Software). O objetivo é avaliar a conformidade do código implementado com as diretrizes do documento de arquitetura (`docs/architecture.md`), identificando acoplamentos indevidos, vazamentos de abstração, violações de segurança, gargalos de performance e dívidas técnicas latentes.

## Entrada do Usuário
{{input}}

## Passos do Agente (Winston)
1. **Inspeção do Contexto Operacional:** Analise o arquivo ativo (`activeFile`), os arquivos abertos (`openFiles`), o status do Git (`gitStatus`) e as instruções fornecidas pelo usuário.
2. **Avaliação de Conformidade Arquitetural:** Verifique se as novas implementações respeitam as fronteiras modulares, contratos de API e convenções da stack escolhida.
3. **Análise de Coesão e Acoplamento:** Identifique se há dependências circulares, responsabilidades infladas (God Objects) ou violações de encapsulamento.
4. **Auditoria de Resiliência e Segurança:** Examine o tratamento de erros, vazamento de recursos (memory leaks, file descriptors abertos), injeção e manipulação insegura de caminhos.
5. **Mapeamento de Dívida Técnica:** Documente pontos onde atalhos ou soluções temporárias comprometem a manutenibilidade a longo prazo.
6. **Emissão do Relatório com Referências Exatas:** Registre os apontamentos com citações precisas `caminho:linha` no documento oficial `docs/architecture-review.md`.

## Perguntas de Elicitação (se houver dúvidas específicas)
- Houve alguma mudança nas premissas originais de tráfego, concorrência ou volume de dados?
- Determinados módulos foram desenhados como protótipos provisórios ou devem estar prontos para produção?
- Existem restrições de desempenho ou memória em ambientes específicos que devemos considerar nesta revisão?

---

## Esqueleto do Documento de Saída (`docs/architecture-review.md`)

```markdown
# 🔍 Relatório de Revisão de Arquitetura: [Nome do Projeto / Módulo]

## 1. Sumário Executivo e Veredito Arquitetural
- **Data da Revisão:** [Data da inspeção]
- **Avaliador:** Winston (Arquiteto de Software)
- **Veredito Geral:** [CONFORME / CONFORME COM RESSALVAS / NÃO CONFORME]
- **Resumo Executivo:** [Síntese concisa da integridade estrutural do código avaliado e riscos imediatos]

## 2. Conformidade com os Princípios e Contratos Arquiteturais
| Princípio / Diretriz | Situação | Observações |
|---|---|---|
| Separação de Camadas (UI vs. Server vs. Workspace) | [OK / ALERTA / VIOLAÇÃO] | [Detalhes da observação] |
| Ausência de Dependências Externas (Zero NPM) | [OK / ALERTA / VIOLAÇÃO] | [Detalhes da observação] |
| Tratamento de Erros e Exceções | [OK / ALERTA / VIOLAÇÃO] | [Detalhes da observação] |
| Isolamento e Proteção contra Path Traversal | [OK / ALERTA / VIOLAÇÃO] | [Detalhes da observação] |

## 3. Análise de Acoplamento, Coesão e Modularidade
- **[Apontamento 1 - Nome do Módulo]:**
  - *Localização:* `caminho/do/arquivo.js:linha`
  - *Problema:* [Descrição do vazamento de responsabilidade ou acoplamento forte]
  - *Impacto:* [Dificuldade de teste, risco de quebra colateral]
  - *Recomendação:* [Como refatorar para desacoplar]

- **[Apontamento 2 - Nome do Módulo]:**
  - *Localização:* `caminho/do/arquivo.js:linha`
  - *Problema:* [...]
  - *Impacto:* [...]
  - *Recomendação:* [...]

## 4. Riscos de Escalabilidade, Latência e Concorrência
- **Gargalos Potenciais:** [Operações síncronas bloqueantes no Event Loop, leituras de disco repetidas, etc.]
- **Consumo de Memória:** [Acúmulo de buffers ou variáveis globais sem expiração]
- **Comportamento Concorrente:** [Condições de corrida ou acessos concorrentes a arquivos locais]

## 5. Resiliência e Tratamento de Exceções
- **Cenários de Falha Mal Tratados:** [Ex: O que acontece se o processo externo morrer repentinamente?]
- **Recuperação de Estado:** [O sistema se recupera de forma autônoma ou exige reinicialização forçada?]

## 6. Mapeamento de Dívida Técnica
| Módulo / Arquivo | Severidade (Alta/Média/Baixa) | Descrição do Débito | Esforço de Correção |
|---|---|---|---|
| `server/tools.js:45` | Média | Duplicação de lógica de validação | 2 horas |
| `src/app.js:120` | Baixa | Falta de tipagem defensiva em argumentos | 1 hora |

## 7. Plano de Ação e Recomendações Prioritárias
1. **Ação Imediata 1 (Bloqueante):** [Ação crítica recomendada para James implementar antes da entrega]
2. **Ação 2 (Curto Prazo):** [Refatoração recomendada para a próxima sprint]
3. **Handoff:** Encaminhar para James (`dev`) para correções via `*refactor` ou `*fix-bug`, e para Quinn (`qa`) para validação de testes.
```
