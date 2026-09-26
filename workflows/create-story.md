---
id: create-story
name: Criar história de usuário
agent: sm
icon: 🗂️
context: 
output: docs/stories/1.1.story.md
inputLabel: Descreva a funcionalidade, épico relacionado e escopo da história:
---

# Criação de História de Usuário

## Objetivo
Estruturar uma história de usuário atômica, independente e totalmente executável (`docs/stories/X.Y.story.md`), conduzida por Bob (Scrum Master). A história é o contrato de trabalho direto para James (Desenvolvedor Full Stack) e Quinn (QA), contendo a declaração de valor, critérios de aceite em formato Given-When-Then, lista técnica de subtarefas, notas de desenvolvimento (Dev Notes), plano de testes, registro de alterações (Change Log) e áreas reservadas para registro do agente de desenvolvimento e resultados de QA.

## Entrada do Usuário
{{input}}

## Passos do Agente (Bob)
1. **Compreensão do Escopo e Épico:** Analise a entrada do usuário e o PRD (`docs/prd.md`) para situar a história no épico correto.
2. **Declaração Clássica da História:** Redija a frase no padrão consagrado: "Como [papel], quero [ação] para que [benefício de negócio]".
3. **Definição de Critérios de Aceite:** Formule cenários de aceitação inequívocos e testáveis utilizando o formato Dado-Quando-Então (Gherkin).
4. **Decomposição Técnica em Subtarefas:** Crie um checklist sequencial e atômico de tarefas de desenvolvimento com referências a arquivos prováveis.
5. **Redação das Dev Notes:** Forneça contexto técnico essencial do documento de arquitetura (`docs/architecture.md`), alertando sobre padrões, tratamento de erros e armadilhas a evitar.
6. **Planejamento de Testes:** Especifique os testes unitários e de integração que devem ser construídos para garantir que a história atinja a Definição de Pronto.
7. **Formatação do Artefato Oficial:** Gere o arquivo Markdown correspondente (ex.: `docs/stories/1.1.story.md`) e recomende o handoff para James (`dev`).

## Perguntas de Elicitação (se faltarem detalhes)
- Qual é o identificador e título do épico ao qual esta história pertence?
- Há restrições de compatibilidade ou dependências com outras histórias que ainda não foram finalizadas?
- Qual é o critério mais rigoroso de validação deste fluxo pelo usuário final?

---

## Esqueleto do Documento de Saída (`docs/stories/1.1.story.md`)

```markdown
# História 1.1: [Título Descritivo da História]

## 1. Status e Metadados
- **ID:** 1.1
- **Épico:** Épico [X] — [Nome do Épico]
- **Status:** Ready to Implement
- **Autor:** Bob (Scrum Master)
- **Data de Criação:** [AAAA-MM-DD]
- **Estimativa / Complexidade:** [Pequena / Média / Grande]

## 2. Declaração da História
**Como** [papel do usuário, ex: Desenvolvedor utilizando a ferramenta],  
**quero** [ação pretendida, ex: configurar provedores de IA pelo painel de configurações],  
**para que** [benefício alcançado, ex: eu possa alternar entre CLI e API sem editar arquivos manuais].

## 3. Critérios de Aceite (Acceptance Criteria)
### Cenário 1: [Fluxo Principal / Caminho Feliz]
- **Dado** que [condição prévia do sistema],
- **Quando** [o usuário executa a ação principal],
- **Então** [o resultado esperado deve acontecer com sucesso],
- **E** [efeito colateral verificado ou persistência confirmada].

### Cenário 2: [Validação de Erro / Caso Negativo]
- **Dado** que [condição inválida ou parâmetro ausente],
- **Quando** [a requisição é submetida],
- **Então** [o sistema deve rejeitar a operação retornando erro explicativo],
- **E** [o estado anterior do sistema deve permanecer inalterado].

### Cenário 3: [Caso de Borda / Concorrência]
- **Dado** que [...],
- **Quando** [...],
- **Então** [...].

## 4. Tarefas e Subtarefas de Implementação (Checklist Dev)
- [ ] **Tarefa 1:** Criar/ajustar a interface de dados e validações em `caminho/do/modulo.js`.
  - [ ] 1.1 Implementar validação dos campos obrigatórios.
  - [ ] 1.2 Tratar exceções com mensagens amigáveis em pt-BR.
- [ ] **Tarefa 2:** Implementar endpoint de API correspondente em `server/api.js`.
  - [ ] 2.1 Adicionar rota com verificação de autenticação/token.
  - [ ] 2.2 Integrar com o serviço de persistência.
- [ ] **Tarefa 3:** Atualizar camada de apresentação / UI em `ui/app.js`.
  - [ ] 3.1 Vincular eventos do formulário.
  - [ ] 3.2 Implementar estados visuais de loading e feedback de sucesso.

## 5. Dev Notes (Orientações Arquiteturais)
- **Padrões de Código:** Respeitar CommonJS puro, Node >= 18, zero dependências externas.
- **Arquivos Relevantes:**
  - `server/api.js:50` — Local para inclusão da rota REST.
  - `server/store.js:30` — Método de persistência a ser consumido.
- **Tratamento de Exceções:** Nunca deixar Promises rejeitadas sem captura (`unhandledRejection`).
- **Segurança:** Sanitizar entradas para prevenir injeção de parâmetros maliciosos.

## 6. Testes Automatizados Requeridos
- [ ] **Teste Unitário 1:** Testar a validação de parâmetros de entrada cobrindo casos válidos e inválidos.
- [ ] **Teste de Integração 2:** Validar a resposta do endpoint HTTP via requisição simulada e conferir persistência em disco.

## 7. Change Log (Histórico de Modificações)
| Data | Autor | Resumo da Alteração |
|---|---|---|
| [AAAA-MM-DD] | Bob (Scrum Master) | Criação da história inicial pronta para refinamento |

## 8. Dev Agent Record (Preenchido por James durante a implementação)
- **Agente Responsável:** James (Desenvolvedor Full Stack)
- **Status da Implementação:** [Not Started / In Progress / Completed]
- **Arquivos Criados/Modificados:**
  - `[caminho:linha]` — [descrição sumária da alteração]
- **Notas do Desenvolvedor:** [Observações técnicas sobre a solução adotada ou decisões de implementação]

## 9. QA Results (Preenchido por Quinn após validação)
- **Agente Revisor:** Quinn (QA / Test Architect)
- **Quality Gate:** [PASS / CONCERNS / FAIL / WAIVED]
- **Cobertura de Critérios de Aceite:** [100% / Parcial]
- **Apontamentos de QA:** [Link para `docs/qa/review.md` ou resumo dos testes executados]
```
