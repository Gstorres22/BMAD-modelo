# BMAD Studio

O **BMAD Studio** é uma plataforma de desenvolvimento assistido por inteligência artificial baseada na metodologia **BMAD (Breakthrough Method for Agile AI-driven Development)**, integrada ao ambiente do **Visual Studio Code** e operável também em modo standalone no navegador.

Ele permite orquestrar múltiplos agentes especializados com personas e responsabilidades bem delineadas (Product Manager, Arquiteto, Desenvolvedor, QA, Segurança, UX, Orquestrador BMAD), além de conduzir discussões colaborativas em rodadas (**Party Mode**) e automatizar fluxos de engenharia de software com contexto integral do editor.

---

## 🏛️ Visão Geral e Arquitetura

O BMAD Studio adota uma arquitetura desacoplada e 100% orientada a padrões abertos em **JavaScript puro (Node.js >= 18)** sem dependências externas (`node_modules` de terceiros):

```
+-------------------------------------------------------------------------+
|                              VS Code IDE                                |
|                                                                         |
|  [Editor / Workspace]                [Extensão BMAD (extension.js)]    |
|   - Arquivo ativo & seleção           - Webview Panel (IFrame seguro)   |
|   - Diagnósticos & Abas abertas       - Status Bar "$(hubot) BMAD"      |
|   - Git status & Git diff             - Ações no editor / atalho        |
|            |                                    |                       |
+------------|------------------------------------|-----------------------+
             |                                    |
             |       HTTP Local (127.0.0.1:4747)  |
             +----------------->[ Servidor HTTP ]<+
                                [  server/http  ]
                                       |
                   +-------------------+-------------------+
                   |                   |                   |
            [ REST / NDJSON ]    [ Orquestrador ]    [ Workspace ]
              server/api.js        server/orchestrator (vscode ou fs)
                                       |
             +-------------------------+-------------------------+
             |                         |                         |
       [ Claude CLI ]             [ AGY CLI ]              [ OpenAI API ]
   (Anthropic Claude Code)   (Google Antigravity)      (POST /chat/completions)
```

---

## 📋 Pré-requisitos

1. **Node.js**: Versão 18.0.0 ou superior instalada e acessível no `PATH`.
2. **Visual Studio Code**: Versão 1.85.0 ou superior (para executar como extensão).
3. **Provedores de IA** (ao menos um configurado):
   - **Google Antigravity CLI (`agy`)**: Instalado e autenticado no sistema operacional (utilizado por padrão com modelos Gemini e Claude).
   - **Claude Code CLI (`claude`)**: Instalado e logado via terminal (`claude login`), ou com a variável `ANTHROPIC_API_KEY` configurada.
   - **OpenAI API**: Opcional, necessitando apenas da chave `OPENAI_API_KEY` caso deseje utilizar modelos GPT diretamente via API HTTP.

---

## ⚙️ Configuração do `.env`

Copie o arquivo de exemplo para inicializar a sua configuração:

```bash
cp .env.example .env
```

Principais parâmetros configuráveis no `.env`:

| Variável | Padrão | Descrição |
|---|---|---|
| `BMAD_STUDIO_HOST` | `127.0.0.1` | Host local de escuta (loopback seguro). |
| `BMAD_STUDIO_PORT` | `4747` | Porta HTTP do estúdio (tenta +1 até 20 portas caso ocupada). |
| `BMAD_STUDIO_TOKEN` | *(vazio)* | Token estático para autenticar chamadas à API. Se vazio, um token hexadecimal seguro é gerado a cada inicialização. |
| `DEFAULT_PROVIDER` | `agy-cli` | Provedor padrão (`agy-cli`, `claude-cli` ou `openai`). |
| `DEFAULT_MODEL` | `gemini-3.8-flash-high` | Modelo padrão para os agentes. |
| `CLAUDE_CLI_PATH` | `claude` | Comando ou caminho para o executável do Claude CLI. |
| `ANTHROPIC_API_KEY` | *(vazio)* | Se deixado em branco, utiliza a sessão ativa do `claude login`. |
| `AGY_CLI_PATH` | `agy` | Comando ou caminho para o executável do Antigravity CLI. |
| `OPENAI_API_KEY` | *(vazio)* | Chave de API da OpenAI (necessária apenas para o provedor `openai`). |

### Sobrescrita de Provedor/Modelo por Agente

É possível definir configurações específicas para cada agente através do padrão `AGENT_<ID>_PROVIDER` e `AGENT_<ID>_MODEL`:

```ini
AGENT_ARCHITECT_PROVIDER=claude-cli
AGENT_ARCHITECT_MODEL=sonnet

AGENT_DEV_PROVIDER=agy-cli
AGENT_DEV_MODEL=gemini-3.8-flash-high

AGENT_PM_PROVIDER=openai
AGENT_PM_MODEL=gpt-5
```

### Descoberta automática de modelos

Nenhuma lista de modelos é fixa no código ou no `.env`. A cada início de sessão, o BMAD Studio consulta cada provider e guarda o nome e a disponibilidade de todos os modelos em `data/models.json`:

| Provider | Como descobre | Disponibilidade |
|---|---|---|
| **Claude CLI** | API da Anthropic (se houver `ANTHROPIC_API_KEY`), senão os aliases do CLI (`sonnet`, `opus`, `haiku`). Outros ids válidos, como `claude-sonnet-5`, são validados e aprendidos no primeiro uso. | `claude auth status` |
| **AGY CLI** | `agy models` | lista retornada pelo CLI |
| **OpenAI** | `GET /models` com a sua chave, só os modelos de chat | lista retornada pela API |

Durante o uso, o catálogo se atualiza sozinho:
- **Cota esgotada:** o modelo fica indisponível até o horário de retorno informado pelo provider (ex.: "Resets in 165h").
- **Falha de autenticação:** o provider inteiro fica indisponível.
- **Execução bem-sucedida:** o modelo volta a ficar disponível.

Se um agente usa um modelo indisponível, a conversa falha na hora com o motivo, em vez de esperar o CLI. Em **⚙ Modelos**, o botão **↻ Atualizar lista** refaz a descoberta sem reiniciar o servidor.

---

## 🚀 Formas de Execução

Você pode executar e utilizar o BMAD Studio de três formas:

### 1. Depuração no VS Code (F5)
- Abra o diretório do projeto no VS Code.
- Pressione **F5** (ou acesse a aba *Executar e Depurar* e escolha **"Executar extensão BMAD Studio"**).
- Uma janela *Extension Development Host* será aberta com a extensão ativa. Pressione `Ctrl+Alt+B` para abrir o Studio.

### 2. Instalação Completa da Extensão (`install.ps1`)
Execute o script de automação para empacotar o arquivo `.vsix` e instalá-lo no seu VS Code local:

```powershell
.\scripts\install.ps1
```

O script irá:
1. Copiar `.env.example` para `.env` se ainda não existir;
2. Configurar o `.env-location` apontando para o seu `.env`;
3. Empacotar o `.vsix` da extensão via `@vscode/vsce`;
4. Instalar o pacote gerado diretamente no VS Code (`code --install-extension`).
5. Depois de instalar, recarregue a janela do VS Code (`Developer: Reload Window`) e utilize o atalho `Ctrl+Alt+B`.

### 3. Modo Standalone (`npm start`)
Para usar o BMAD Studio em qualquer navegador sem necessidade do VS Code aberto:

```bash
npm start
```
*(ou `node standalone.js [caminhoDaPastaDoProjeto] --open`)*

---

## 👥 Agentes BMAD e Workflows

### Agentes Especializados (`agents/*.md`)

| ID | Nome | Papel | Fase BMAD | Pode Editar Código? |
|---|---|---|---|---|
| `bmad-master` | Orquestrador | Moderação, facilitação de equipe e handoffs | Core | Não (leitura) |
| `pm` | Product Manager | Visão de produto, PRD, escopo e critérios de aceite | Planning | Não (leitura) |
| `architect` | Arquiteto | Arquitetura técnica, padrões, ADRs e diagramas | Solutioning | Não (leitura) |
| `ux` | UX Designer | Experiência, fluxos do usuário e design | Analysis | Não (leitura) |
| `dev` | Desenvolvedor | Implementação de código, refatoração e correções | Implementation | **Sim** (`canEdit: true`) |
| `qa` | QA Engineer | Testes, cenários de borda, cobertura e qualidade | Implementation | Não (leitura) |
| `security` | Seguranca | Modelagem de ameaças, vulnerabilidades e conformidade | Solutioning | Não (leitura) |

> [!IMPORTANT]
> **Controle estrito de permissões:** Somente o agente `dev` possui autorização para criar ou modificar arquivos diretamente no disco (`canEdit: true`). Todos os demais agentes têm acesso apenas de leitura ao código-fonte, garantindo que etapas de planejamento e arquitetura não realizem alterações prematuras sem validação humana.

### Workflows Automatizados (`workflows/*.md`)

Os workflows padronizam tarefas repetitivas injetando modelos prontos com o contexto relevante do VS Code:
- **Criar PRD**: O Product Manager analisa o brief e gera a especificação detalhada de requisitos.
- **Design de Arquitetura**: O Arquiteto projeta a estrutura de módulos, integrações e decisões técnicas.
- **Revisão de Código / Implementação**: Análise de diffs ou implementação de componentes guiada pelo Desenvolvedor.
- **Plano de Testes QA**: O QA gera matriz de testes unitários, de integração e testes e2e.

---

## 🎭 Party Mode (Discussão Multidisciplinar)

No **Party Mode**, você pode selecionar múltiplos agentes para discutir um problema em rodadas colaborativas.

1. **Rodadas sequenciais**: Em cada rodada, os agentes respondem em sequência, analisando os argumentos dos colegas anteriores e trazendo novos pontos de vista técnicos.
2. **Regras de convivência**: Os agentes falam em personagem, respeitam suas especialidades, dirigem-se aos colegas pelo nome e mantêm respostas focadas (até 250 palavras por turno).
3. **Síntese automática**: Ao término das rodadas, o moderador (`bmad-master`) compila uma síntese executiva contendo:
   - Pontos de consenso;
   - Divergências e trade-offs identificados;
   - Decisões consolidadas;
   - Próximos passos atribuídos nominalmente ao agente BMAD responsável.

---

## 🔍 Contexto Integrado do VS Code

O BMAD Studio lê em tempo real o estado de trabalho do seu VS Code para que você não precise copiar e colar trechos de código manualmente:

- **Arquivo ativo**: Conteúdo do arquivo atualmente em foco no editor.
- **Seleção de código**: Trecho exato selecionado no editor com número de linha inicial e final.
- **Diagnósticos**: Alertas e erros de compilação/linter (Problems) detectados pelo VS Code.
- **Abas abertas**: Lista de arquivos em edição rápida.
- **Git Diff & Status**: Alterações locais pendentes ou staged do repositório.
- **Ações diretas no editor**:
  - *Abrir arquivo*: Navega e destaca linhas específicas no editor.
  - *Diff interativo*: Exibe proposta de alteração em visão side-by-side nativa do VS Code.
  - *Inserir no cursor*: Aplica trechos de código propostos exatamente na posição do cursor ativo.

---

## 🛠️ Como Criar ou Editar Agentes e Workflows

Agentes e workflows são definidos em arquivos Markdown puros com frontmatter simples, sem necessidade de recompilar a extensão. O servidor recarrega as alterações em tempo real:

### Criando um Agente (`agents/meu-agente.md`)

```markdown
---
id: devops
name: Alex
title: Especialista em DevOps
icon: 🚀
phase: implementation
canEdit: false
order: 70
whenToUse: Infraestrutura, CI/CD, Docker, Kubernetes e deploy
---

Você é Alex, Especialista em DevOps no time BMAD.
Sua missão é garantir estabilidade, automação e observabilidade na infraestrutura.
```

### Criando um Workflow (`workflows/meu-workflow.md`)

```markdown
---
id: deploy-check
name: Checklist de Deploy
agent: devops
icon: 🚢
context: activeFile,diagnostics,gitStatus
output: docs/deploy-checklist.md
inputLabel: Qual versão ou ambiente você deseja validar?
---

Analise os arquivos e alterações atuais e elabore um checklist de validação para deploy da versão {{input}}.
```

---

## 📂 Estrutura de Diretórios

```
BMAD-modelo/
├── package.json                   # Manifesto da extensão VS Code
├── extension.js                   # Ponto de entrada da extensão VS Code
├── standalone.js                  # Servidor autônomo sem VS Code
├── .env.example                   # Modelo documentado de variáveis de ambiente
├── .gitignore                     # Configuração de arquivos ignorados no repositório
├── .vscodeignore                  # Configuração de exclusões no pacote VSIX
├── README.md                      # Documentação completa do projeto
├── agents/                        # Personas dos agentes BMAD (.md)
├── workflows/                     # Modelos de workflows BMAD (.md)
├── scripts/
│   └── install.ps1                # Script PowerShell de empacotamento e instalação
├── ui/                            # Interface gráfica web (HTML/CSS/JS puros)
├── server/
│   ├── env.js                     # Parser e carregador de variáveis .env
│   ├── paths.js                   # Resolução de diretórios e arquivos de configuração
│   ├── http.js                    # Servidor HTTP local nativo
│   ├── api.js                     # Handlers das rotas REST e stream NDJSON
│   ├── agents.js                  # Carregador de agentes e parse de frontmatter
│   ├── workflows.js               # Carregador e renderizador de workflows
│   ├── settings.js                # Gerenciador de configurações persistentes
│   ├── store.js                   # Armazenamento JSON de conversas do projeto
│   ├── context.js                 # Montador de blocos de contexto do editor
│   ├── orchestrator.js           # Orquestrador de turnos de chat e Party Mode
│   ├── tools.js                   # Definição e execução de tools para LLMs
│   ├── providers/                 # Adaptadores de provedores (Claude CLI, AGY CLI, OpenAI)
│   └── workspace/                 # Abstrações de workspace (VS Code e FS local)
│       ├── common.js              # Utilitários compartilhados de busca e git
│       ├── fs-workspace.js        # Implementação para modo standalone
│       └── vscode-workspace.js    # Implementação integrada à API do VS Code
└── .vscode/
    └── launch.json                # Configurações de execução e depuração
```

---

## 🔒 Segurança

O BMAD Studio foi projetado para rodar com segurança máxima no seu ambiente local:

1. **Loopback Estrito (`127.0.0.1`)**: O servidor aceita requisições unicamente da interface de loopback local, não se expondo a outras máquinas da rede local.
2. **Validação de Cabeçalho `Host`**: Todas as requisições à API têm o cabeçalho `Host` verificado contra `127.0.0.1` ou `localhost` para mitigar ataques de *DNS Rebinding*.
3. **Autenticação por Token**: Acesso à API REST e aos endpoints de stream requer validação de token individual (`X-BMAD-Token` ou parâmetro `?token=`).
4. **Isolamento de Webview (CSP)**: O painel webview do VS Code restringe a comunicação estritamente com o servidor de loopback sob *Content Security Policy* rígida.
5. **Prevenção de Path Traversal**: Todas as operações de leitura e escrita de arquivos são validadas contra o diretório raiz do projeto antes da execução.

---

## ❓ Solução de Problemas

### 1. "CLI não encontrado" (`claude` ou `agy`)
- Certifique-se de que o executável está instalado globalmente e presente no seu `PATH` de sistema.
- No Windows, se o executável for um script batch ou shim (ex.: `claude.cmd` ou `agy.cmd`), você pode especificar o caminho completo ou o nome exato no seu `.env`:
  ```ini
  CLAUDE_CLI_PATH=C:\Users\<usuario>\AppData\Roaming\npm\claude.cmd
  AGY_CLI_PATH=C:\Users\<usuario>\AppData\Local\Programs\Antigravity\agy.exe
  ```

### 2. "OAuth session expired" ou falhas de autenticação no Claude CLI
- Abra seu terminal e renove sua autenticação executando:
  ```bash
  claude login
  ```
- Teste a execução com um comando simples como `claude --version`.
- Alternativamente, configure uma chave estática na variável `ANTHROPIC_API_KEY` do arquivo `.env`.

### 3. Porta 4747 ocupada (`EADDRINUSE`)
- O servidor do BMAD Studio tenta automaticamente portas subsequentes (ex.: 4748, 4749, até +20 tentativas).
- Para fixar outra porta específica, ajuste `BMAD_STUDIO_PORT=5050` no `.env` ou configure `"bmadStudio.port": 5050` nas configurações do VS Code.

### 4. Recarregar Configurações do `.env`
- Ao editar e salvar o arquivo `.env` dentro do VS Code, uma notificação perguntará se deseja reiniciar o servidor.
- Você também pode acionar o comando **"BMAD: Reiniciar servidor"** na Command Palette (`Ctrl+Shift+P`).
