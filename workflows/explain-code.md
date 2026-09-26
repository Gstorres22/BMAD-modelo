---
id: explain-code
name: Explicar código
agent: dev
icon: 💡
context: activeFile,selection
inputLabel: O que você gostaria de entender sobre este trecho de código ou arquivo?
---

# Explicação Didática e Técnica de Código

## Objetivo
Explicar em profundidade o funcionamento interno, arquitetura, fluxo lógico e nuances de implementação de um arquivo ativo (`activeFile`) ou trecho selecionado (`selection`), conduzida por James (Desenvolvedor Full Stack). A explicação visa proporcionar clareza cristalina tanto sobre a mecânica de execução passo a passo quanto sobre as motivações de design, dependências e efeitos colaterais.

## Entrada do Usuário
{{input}}

## Passos do Agente (James)
1. **Inspeção do Contexto Local:** Analise o arquivo ativo (`activeFile`), o trecho de código selecionado (`selection`) e a pergunta ou dúvida formulada pelo usuário.
2. **Identificação do Propósito Principal:** Explique em poucas palavras qual problema aquele código resolve no sistema.
3. **Mapeamento do Fluxo Passo a Passo:** Descreva a ordem de execução das instruções, condicionais, laços e chamadas assíncronas, citando sempre a localização exata no formato `caminho:linha`.
4. **Dissecação de Dados e Dependências:** Detalhe os tipos de parâmetros recebidos, estruturas de dados manipuladas, valores retornados e mutações de estado ou chamadas de I/O externas.
5. **Avaliação Crítica e Pontos de Atenção:** Destaque considerações de complexidade de tempo/espaço (Big-O), tratamento de exceções e armadilhas comuns para desenvolvedores que venham a alterar o trecho.
6. **Exemplos Concretos de Execução:** Forneça entradas de exemplo e o resultado correspondente processado pelo código.

## Perguntas de Elicitação (se a dúvida for genérica)
- O foco da explicação deve ser na lógica de negócio de alto nível ou na mecânica técnica de baixo nível?
- Há alguma preocupação específica com desempenho, concorrência ou consumo de memória neste trecho?
- Você planeja refatorar este código em seguida ou apenas entender seu comportamento atual?

---

## Estrutura da Resposta de Explicação

Ao explicar o código, formate a resposta no seguinte padrão:

```markdown
# 💡 Explicação de Código: [Nome do Arquivo ou Módulo]

## 1. Visão Geral e Propósito
- **Arquivo / Trecho:** `caminho/do/arquivo.js:linhaInicio-linhaFim`
- **Responsabilidade Principal:** [O que esta função, classe ou módulo faz no sistema]
- **Contexto Arquitetural:** [Como se conecta com os outros módulos do projeto]

## 2. Rastreamento Passo a Passo da Execução
1. **Inicialização (`caminho/do/arquivo.js:linha`):** [Explicação da entrada e validações prévias realizadas]
2. **Transformação Central (`caminho/do/arquivo.js:linha`):** [Como os dados são filtrados, agregados ou processados]
3. **Efeitos Colaterais / I/O (`caminho/do/arquivo.js:linha`):** [Chamadas de rede, escrita em disco, logs ou disparo de eventos]
4. **Retorno ou Resolução (`caminho/do/arquivo.js:linha`):** [Formato do objeto ou valor devolvido para quem chamou]

## 3. Estruturas de Dados e Algoritmos
- **Entradas:** [Descrição dos argumentos com tipos esperados]
- **Estruturas Utilizadas:** [Mapas, arrays, buffers, objetos literais e por que foram escolhidos]
- **Complexidade Estimada:** Tempo O(N) / Espaço O(1) [com justificativa técnica]

## 4. Pontos de Atenção e Tratamento de Exceções
- **Casos de Borda:** [Como o código reage a arrays vazios, nulos, strings longas ou timeouts]
- **Captura de Erros:** [Identificação de blocos try/catch e se o erro é propagado ou tratado graciosamente]

## 5. Exemplo Prático de Execução
```javascript
// Exemplo de chamada:
const resultado = funcaoExemplo({ id: "123", ativo: true });
console.log(resultado);
// Saída esperada:
// { status: "OK", processadoEm: 15 }
```

## 6. Próximos Passos Sugeridos
- Se houver necessidade de simplificar ou otimizar o código: executar `*refactor` com James (`dev`).
- Se houver suspeita de vulnerabilidade ou bug: acionar Quinn (`qa`) para análise de risco ou criar testes unitários via `*write-tests`.
```
