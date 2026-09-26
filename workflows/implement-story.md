---
id: implement-story
name: Implementar história
agent: dev
icon: 🛠️
context: activeFile,diagnostics
inputLabel: Cole a história de usuário (docs/stories/*.story.md) ou descreva a tarefa de implementação:
---

# Implementação de História de Usuário

## Objetivo
Guiar a implementação técnica completa e rigorosa de uma história de usuário ou tarefa de código, conduzida por James (Desenvolvedor Full Stack). O agente analisa os critérios de aceitação, lê as notas de desenvolvimento (Dev Notes), respeita as convenções de arquitetura existentes e implementa ou edita os arquivos do repositório com código funcional, testado, sem TODOs e sem placeholders.

## Entrada do Usuário
{{input}}

## Passos do Agente (James)
1. **Inspeção da História e Contexto Atual:** Analise os critérios de aceitação, tarefas técnicas e Dev Notes contidos na história fornecida na entrada, cruzando com o arquivo ativo (`activeFile`) e eventuais diagnósticos de linter (`diagnostics`).
2. **Planejamento da Intervenção:** Mapeie exatamente quais arquivos precisam ser criados ou alterados, identificando as linhas de inserção no padrão `caminho:linha`.
3. **Execução Técnica Rigorosa:**
   - Se o usuário solicitou explicitamente edição de arquivos no workspace: aplique as alterações necessárias no código e documente com clareza o que foi modificado e o porquê.
   - Caso contrário: forneça os blocos de código completos e funcionais prontos para que o usuário copie e cole nos respectivos arquivos.
   - Garanta zero código especulativo, zero `TODO`, zero reticências ou simulações inconclusas. Trate erros e rejeições de promises defensivamente.
4. **Criação de Testes Automatizados:** Implemente os testes correspondentes para cobrir os critérios de aceite estabelecidos na história.
5. **Atualização do Dev Agent Record:** Atualize (ou forneça o texto de atualização) da seção `## 8. Dev Agent Record` da história, registrando status, arquivos modificados e observações relevantes.
6. **Encaminhamento para Quality Gate:** Recomende a execução da revisão de código por Quinn (`qa`) através do workflow `code-review`.

## Perguntas de Elicitação (se faltarem detalhes para codificação)
- O código deve ser aplicado diretamente nos arquivos do projeto neste momento?
- Há restrições adicionais de bibliotecas nativas ou versões do Node.js além das contratuais?
- Algum arquivo dependente possui alterações locais não salvas que possam gerar conflitos?

---

## Estrutura da Resposta de Implementação

Ao concluir a implementação da história, apresente a resposta no seguinte formato:

```markdown
# 🛠️ Implementação da História [ID da História]

## 1. Resumo da Implementação
- **História Atendida:** [ID e Título da História]
- **Status:** Implementado com Sucesso / Pronto para Validação de QA
- **Visão Geral:** [Breve explicação de como os critérios de aceite foram atendidos no código]

## 2. Arquivos Modificados e Criados
| Arquivo | Ação (Criado/Modificado) | Linhas / Função Principal |
|---|---|---|
| `server/api.js` | Modificado | Linhas 120-145: Novo endpoint de persistência |
| `test/api.test.js` | Criado | Cobertura de cenários felizes e de erro |

## 3. Detalhamento do Código e Alterações
[Apresentação dos blocos de código completos, com comentários técnicos explicativos sobre lógica de exceções, validações defensivas e padrões adotados]

## 4. Testes Implementados e Resultados de Validação
- **Testes Unitários:** [Descrição dos testes criados e asserções validadas]
- **Instruções de Execução:** [Como o usuário ou o agente de testes pode executar a verificação]

## 5. Atualização da História (Dev Agent Record)
```markdown
## 8. Dev Agent Record
- **Agente Responsável:** James (Desenvolvedor Full Stack)
- **Status da Implementação:** Completed
- **Arquivos Criados/Modificados:**
  - `server/api.js:120` — Implementação da rota REST com validação
  - `test/api.test.js:1` — Suíte de testes unitários do endpoint
- **Notas do Desenvolvedor:** Implementado respeitando CommonJS puro, Node >= 18 e tratamento de erro 400/500 em português.
```

## 6. Handoff e Próximos Passos
- Acionar Quinn (`qa`) para execução do workflow de revisão de código (`code-review`) e emissão do parecer do Quality Gate.
```
