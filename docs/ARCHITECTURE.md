# BMAD Studio — Contrato de Arquitetura

> Documento-fonte para quem implementa qualquer módulo. **Siga as interfaces exatamente**: vários módulos são
> escritos em paralelo por pessoas/agentes diferentes e só se encaixam se os contratos forem respeitados.

## Regras gerais

- **JavaScript puro, CommonJS (`require`/`module.exports`), Node >= 18. ZERO dependências npm.** Sem TypeScript, sem build, sem bundler.
- Front-end: HTML/CSS/JS vanilla, **sem CDN**, sem frameworks.
- Textos de interface e prompts em **português do Brasil**. Identificadores de código em inglês.
- Caminhos de arquivo trocados entre módulos/API são **relativos à raiz do projeto, com `/`** (ex.: `src/app.js`).
- Toda função de I/O é `async`. Erros são lançados como `Error` com mensagem legível em pt-BR.
- Nunca logar segredos (API keys).

## Layout

```
package.json            manifesto da extensão VS Code
extension.js            ativação da extensão (usa server/ + workspace/vscode-workspace.js)
standalone.js           `node standalone.js [pastaDoProjeto]` → servidor sem VS Code (workspace/fs-workspace.js)
.env / .env.example     configuração (ver seção .env)
agents/*.md             personas BMAD
workflows/*.md          workflows BMAD
ui/                     index.html, styles.css, app.js, markdown.js
data/                   settings.json (gerado; no .gitignore)
server/
  env.js  paths.js  http.js  api.js  agents.js  workflows.js  settings.js  store.js
  context.js  orchestrator.js  tools.js
  providers/  index.js  spawn.js  claude-cli.js  agy-cli.js  openai.js
  workspace/  common.js  fs-workspace.js  vscode-workspace.js
```

## server/env.js
```js
parseEnv(text) -> object                // KEY=VALUE, ignora # comentários e linhas vazias, aceita aspas "..." / '...', `export ` opcional
loadEnv(filePaths: string[]) -> object  // lê cada arquivo existente (ignora os ausentes), mescla na ordem; NÃO altera process.env
list(value, fallback=[]) -> string[]    // "a, b,c" -> ["a","b","c"] (trim, remove vazios)
```

## server/paths.js
```js
resolveRoot({ extensionPath, override }) -> { root, envFile }
```
`envFile`: `override` (config `bmadStudio.envFile`) → caminho gravado em `<extensionPath>/.env-location` → `<extensionPath>/.env`.
`root` (onde ficam `agents/`, `workflows/`, `ui/`, `data/`): a primeira candidata que contém `ui/index.html` e `agents/`, na ordem
`dirname(override)` → `dirname(.env-location)` → `extensionPath`. Um `.env` guardado fora do repositório não muda a raiz.

## Workspace (interface) — `server/workspace/*`

Implementações: `fs-workspace.js` (`createFsWorkspace({ projects: [absPath...] })`) e
`vscode-workspace.js` (`createVsCodeWorkspace(vscode)`). Ambas retornam um objeto com **exatamente** estes métodos:

```js
mode                                   // 'fs' | 'vscode'
async listProjects() -> [{ id, name, path }]   // id = índice em string ("0","1",...) ; path absoluto
async listFiles(projectId, { query?, max=3000 }) -> string[]       // relativos; query = substring case-insensitive no caminho
async readFile(projectId, relPath) -> { path, content, truncated } // máx 200 KB; vscode: usa buffer não salvo se aberto
async writeFile(projectId, relPath, content) -> { path }           // cria diretórios
async searchText(projectId, query, { max=100 }) -> [{ path, line, text }]  // literal, case-insensitive; line 1-based
async getActiveEditor() -> null | { projectId, path, languageId, content, selection: null | { text, startLine, endLine } }
async getDiagnostics(projectId) -> [{ path, line, severity: 'error'|'warning'|'info', message, source }]
async getOpenFiles(projectId) -> string[]
async gitDiff(projectId, { staged=false }) -> string                // '' se não for repo git
async gitStatus(projectId) -> string
async openFile(projectId, relPath, line?) -> boolean
async showDiff(projectId, relPath, newContent) -> boolean
async insertAtCursor(text) -> boolean
```

- Todo `relPath` passa por `common.resolveInside(root, relPath)`, que lança erro se escapar da raiz (path traversal).
- Diretórios ignorados em listagem/busca: `common.IGNORED_DIRS`.
- `fs-workspace`: `getActiveEditor` → `null`; `getDiagnostics` → `[]`; `getOpenFiles` → `[]`; `openFile` → roda `code -g "<abs>:<line>"`
  (via `providers/spawn.js`), retorna `true` se o comando iniciou; `showDiff` → grava `newContent` em arquivo temporário e roda
  `code --diff <abs> <tmp>`; `insertAtCursor` → `false`.

### server/workspace/common.js
```js
IGNORED_DIRS = ['node_modules','.git','dist','build','out','.next','.nuxt','coverage','.venv','venv','__pycache__','.bmad-studio','.idea','.turbo','target','bin','obj']
resolveInside(root, relPath) -> absPath             // lança Error('Caminho fora do projeto') se escapar
toRel(root, absPath) -> string                       // com '/'
async walkFiles(root, { query, max }) -> string[]    // recursivo, ignora IGNORED_DIRS e arquivos > 2 MB
async searchInFiles(root, files: string[], query, { max }) -> [{path,line,text}]  // pula binários (byte 0 nos 8 KB iniciais); text cortado em 300 chars
async runGit(cwd, args: string[]) -> string          // child_process.execFile('git', args, {cwd, maxBuffer: 20MB}); '' em erro
isBinary(buffer) -> boolean
```

## Agentes — `agents/*.md` e `server/agents.js`

Arquivo:
```
---
id: architect
name: Winston
title: Arquiteto de Software
icon: 🏗️
phase: solutioning            # analysis | planning | solutioning | implementation | core
canEdit: false
order: 60
whenToUse: Arquitetura de sistemas, decisões técnicas, ADRs, revisão de arquitetura
---
<corpo markdown = persona completa: identidade, estilo, princípios, comandos *>
```
Frontmatter = linhas `chave: valor` simples (sem YAML aninhado). `true/false` e números convertidos.

```js
loadAgents(dir) -> Agent[]    // ordenado por order; Agent = { ...frontmatter, persona: <corpo> }
parseFrontmatter(text) -> { data, body }   // exportado; reutilizado por workflows.js
```

## Workflows — `workflows/*.md` e `server/workflows.js`
```
---
id: prd
name: Criar PRD
agent: pm
icon: 📋
context: activeFile,selection      # subconjunto de: activeFile,selection,diagnostics,openFiles,gitDiff,gitStatus
output: docs/prd.md                # opcional: caminho sugerido para "Salvar"
inputLabel: Descreva o produto/feature (ou cole o project brief)
---
<template markdown; {{input}} é substituído pelo texto do usuário>
```
```js
loadWorkflows(dir) -> Workflow[]   // Workflow = { ...frontmatter, context: string[], template }
renderWorkflow(wf, input) -> string
```

## Settings — `server/settings.js`
```js
createSettings({ file, env, agents }) -> {
  getAll() -> { agents: { [agentId]: { provider, model } } },
  get(agentId) -> { provider, model },
  set(agentId, { provider, model }) -> void,   // persiste em `file` (JSON, cria diretório)
}
```
Default de cada agente: `AGENT_<ID_MAIUSCULO_COM_HIFEN_VIRANDO_UNDERSCORE>_PROVIDER/_MODEL` do .env → `defaultProvider/defaultModel`
do frontmatter → `DEFAULT_PROVIDER` / `DEFAULT_MODEL`. Valores salvos no arquivo têm prioridade sobre defaults.

## Store de conversas — `server/store.js`
Conversas salvas em `<projeto>/.bmad-studio/conversations/<id>.json`.
```js
createStore(workspace) -> {
  async list(projectId) -> [{ id, title, mode, agents, updatedAt }]   // ordem: updatedAt desc
  async get(projectId, convId) -> Conversation
  async create(projectId, { title, mode, agents }) -> Conversation
  async save(projectId, conv) -> void        // atualiza updatedAt
  async remove(projectId, convId) -> void
}
Conversation = {
  id, title, mode: 'chat'|'party', agents: string[], createdAt, updatedAt,
  providerSessions: { [agentId]: { provider, model, sessionId } },
  messages: Message[]
}
Message = { id, role: 'user'|'agent'|'system', agentId?, content, ts, provider?, model?, tools?: [{name, detail}], error?: string, context?: string[] }
```
IDs: `Date.now().toString(36) + Math.random().toString(36).slice(2,8)`. Store usa `fs` direto no caminho do projeto (via `workspace.listProjects()`).

## Contexto — `server/context.js`
```js
async buildContext(workspace, projectId, request) -> { text, labels: string[] }
// request = { activeFile?, selection?, diagnostics?, openFiles?, gitDiff?, gitStatus?, files?: string[] }
```
Gera blocos `<contexto tipo="..." caminho="...">...</contexto>` (arquivo ativo, seleção com linhas, problemas, abas abertas,
git diff, git status, cada arquivo anexado). Limite total ~120 000 caracteres (corta com aviso `[... truncado]`).
`labels` = rótulos curtos para a UI (ex.: `"seleção src/a.js:10-20"`, `"git diff"`).

## Providers — `server/providers/*`

Cada provider exporta:
```js
{
  id: 'claude-cli' | 'agy-cli' | 'openai',
  label: 'Claude CLI' | 'AGY CLI (Antigravity)' | 'OpenAI API',
  async listModels(env) -> { available, detail, source, exhaustive?: boolean, models: [{ id, label }] },
  async run(opts) -> { text, sessionId?: string, usage?: object }
}
opts = {
  env,                 // objeto do .env
  model,               // string (pode ser vazio → provider usa o default do CLI)
  systemPrompt,        // persona + regras (string)
  prompt,              // prompt COMPLETO para sessão nova (já contém transcrição/contexto quando necessário)
  resumePrompt,        // apenas a nova mensagem do usuário (+contexto), usado quando sessionId existe
  sessionId,           // string | null — sessão anterior do CLI para retomar
  messages,            // [{ role: 'user'|'assistant', content }] histórico completo (usado pela OpenAI)
  cwd,                 // raiz absoluta do projeto
  canEdit,             // boolean — agente pode editar arquivos?
  workspace, projectId,// para tools (OpenAI)
  signal,              // AbortSignal — ao abortar, matar o processo / abortar fetch
  onEvent,             // (ev) => void ; ev = { type:'delta', text } | { type:'tool', name, detail } | { type:'status', text }
}
```
Regras: sempre emitir `delta` com texto incremental; ao final resolver com `text` completo. Em erro, lançar `Error` com
mensagem útil (incluindo stderr/`result` de erro do CLI, ex.: "Failed to authenticate..."). Se não houver sessão CLI, o
provider usa `prompt`; se houver `sessionId`, usa `resumePrompt` e retoma.

`providers/index.js`: `{ providers: {id: provider}, getProvider(id) }`.

## Catálogo de modelos — `server/models.js`
Nenhuma lista de modelos é fixa no código ou no .env. `createModelCatalog({ file, getEnv, providers })`:
- **Descoberta** no início de cada sessão (subida do servidor): chama `listModels` de todos os providers em paralelo e
  grava nome + disponibilidade em `data/models.json` (o bootstrap responde na hora com o snapshot anterior).
  - Claude CLI: disponibilidade por `claude auth status`; modelos pela API da Anthropic se houver `ANTHROPIC_API_KEY`
    (lista exaustiva), senão os aliases do CLI (`exhaustive: false` — outros ids são validados no primeiro uso).
  - AGY CLI: `agy models` (linhas `id	Rótulo`).
  - OpenAI: `GET /models`, filtrado por capacidade de chat (sem mídia/áudio/embeddings/Responses-only/snapshots datados).
- **Em execução** (orquestrador → `runWithCatalog`): antes de rodar, `check()` falha rápido se o modelo está
  sabidamente indisponível; depois, `markFromError()` classifica o erro (cota com horário de retorno, auth → provider,
  modelo não suportado) e `markSuccess()` reabilita/aprende o modelo. Marcas de cota expiram sozinhas e sobrevivem a
  novas descobertas enquanto o horário de retorno não chega.
- API: `GET /api/models` (aguarda a descoberta em andamento), `POST /api/models/refresh`.

### providers/spawn.js
```js
resolveCommand(cmd) -> string|null     // procura no PATH (Windows: PATHEXT .exe/.cmd/.bat); aceita caminho absoluto
spawnProcess(cmd, args, { cwd, env, stdinText, signal, onStdoutLine, onStderr }) -> Promise<{ code, stderr }>
```
- Windows: `.exe` → `spawn` direto (sem shell). `.cmd/.bat` → `spawn` com `shell: true` e cada arg citado com aspas duplas
  (escapando `"`). Texto do usuário NUNCA vai em argumento: vai por `stdinText`.
- `stdinText` escrito em UTF-8 **sem BOM**, depois `stdin.end()`.
- stdout lido linha a linha (buffer por `\n`) → `onStdoutLine(line)`.
- `signal` abortado → `child.kill()` (Windows: `taskkill /pid <pid> /T /F`).
- `windowsHide: true`.

### claude-cli.js (formato real verificado)
Comando: `<CLAUDE_CLI_PATH> -p --output-format stream-json --verbose --include-partial-messages
[--model M] --append-system-prompt-file <tmpfile> [--resume <sessionId>] --allowedTools <lista> [--permission-mode acceptEdits]`
- Prompt via **stdin**. System prompt gravado em arquivo temporário (`os.tmpdir()`), apagado no fim.
- Tools leitura: `Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git status:*)`. Se `canEdit`: + `Edit,Write,MultiEdit` e `--permission-mode acceptEdits`.
- `env`: herda `process.env`; se `ANTHROPIC_API_KEY` no .env não vazio, repassa.
- Linhas JSON:
  - `{"type":"system","subtype":"init","session_id":...}` → guardar sessionId.
  - `{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}}` → `delta`.
  - `{"type":"assistant","message":{"content":[{type:"text",text}|{type:"tool_use",name,input}]}}` → para cada `tool_use` emitir
    `tool` (detail = input.file_path || input.pattern || input.command || JSON curto). Se NÃO houve stream_event de texto
    (partial desativado), emitir o `text` desses blocos como `delta`.
  - `{"type":"result","is_error":bool,"result":"...","session_id":...}` → fim; se `is_error` lançar Error(result).
- listModels(): ver "Catálogo de modelos".

### agy-cli.js (formato real verificado)
Comando: `<AGY_CLI_PATH> --print= --input-format stream-json --output-format stream-json [--model M] [--conversation <id>]
[--mode accept-edits se canEdit] [AGY_CLI_EXTRA_ARGS separados por espaço]`
- stdin: UMA linha `{"event":"user","message":{"content":"<texto>"}}\n` e fechar stdin. **Sem BOM.**
- agy não tem flag de system prompt → para sessão nova, texto = `systemPrompt + "\n\n" + prompt`; ao retomar = `resumePrompt`.
- Linhas JSON (campo `event`):
  - `{"event":"init","conversation_id":"..."}` → sessionId.
  - `{"event":"step_update","step_update":{"step_type":"agent_response","text_delta":"..."}}` → `delta` (quando `text_delta` existir).
  - `{"event":"step_update","step_update":{"step_type":"tool","state":"ACTIVE","tool_name":"...","tool_info":{"parameters":{...}}}}` → `tool`
    (detail = primeiro valor string dos parameters, cortado em 120 chars). Emitir só uma vez por `step_index`.
  - `{"event":"result","result":{"status":"SUCCESS"|"ERROR","response":"...","error":"...","conversation_id":"..."}}` → fim;
    status ERROR → lançar Error(error).
  - Linhas não-JSON (ex.: `error: ...`, `warning: ...`) → acumular como stderr.
- listModels(): ver "Catálogo de modelos".

### openai.js
- Modo por `OPENAI_API_MODE` (auto | responses | chat). **auto** = Responses API quando `OPENAI_BASE_URL` é a OpenAI oficial,
  Chat Completions para endpoints compatíveis de terceiros.
- **Responses API** (`POST {base}/responses`): `instructions` = systemPrompt, `input` = histórico, tools no formato
  `{ type:'function', name, description, parameters, strict:false }`, `stream:true`, `store:false` e
  `include:['reasoning.encrypted_content']`. Deltas de `response.output_text.delta`; ao `response.completed`, se houver
  itens `function_call`, reenvia a saída inteira (com o raciocínio criptografado) + `function_call_output` e repete
  (máx 12 iterações). Motivo: nos modelos novos (gpt-5.6+, gpt-6…) `/chat/completions` recusa function tools com
  raciocínio ativo ("Function tools with reasoning_effort are not supported…").
- **Chat Completions** (`POST {base}/chat/completions`): `messages` com system + histórico, acumula `delta.tool_calls` por
  index, executa as tools e repete.
- Não enviar `temperature` (modelos gpt-5 rejeitam).
- Sem `OPENAI_API_KEY` → lançar `Error('OPENAI_API_KEY não configurada no .env')`.
- listModels(): ver "Catálogo de modelos".

## Tools (OpenAI) — `server/tools.js`
```js
getToolDefinitions({ canEdit }) -> [...]   // formato OpenAI { type:'function', function:{ name, description, parameters } }
async executeTool(name, args, { workspace, projectId, canEdit }) -> string   // resultado textual (máx 60 000 chars); erro → "ERRO: ..."
```
Tools: `list_files{query?}`, `read_file{path}`, `search_text{query}`, `get_diagnostics{}`, `git_diff{staged?}`, `git_status{}`,
e se `canEdit`: `write_file{path, content}`.

## Orquestrador — `server/orchestrator.js`
```js
createOrchestrator({ env, workspace, store, settings, agents, workflows, providers }) -> {
  async sendMessage({ projectId, convId, text, context, agentId?, workflowId?, signal, emit }),
  async runParty({ projectId, convId, text, context, rounds=1, moderator='bmad-master', synthesize=true, signal, emit }),
  async testProvider({ provider, model, projectId, signal }) -> { ok, text, error? }
}
emit(ev): 
  { type:'user', message }                              // mensagem do usuário salva
  { type:'agent-start', message }                       // mensagem do agente criada (content '')
  { type:'delta', messageId, text }
  { type:'tool', messageId, name, detail }
  { type:'status', messageId?, text }
  { type:'agent-end', message }                         // mensagem final salva
  { type:'error', messageId?, error }
  { type:'done' }
```
- **Chat** (`mode:'chat'`): responde `agentId || conv.agents[0]`. Se `workflowId`, o texto do usuário vira
  `renderWorkflow(wf, text)` e os toggles de contexto do workflow são somados ao `context`.
- **Party** (`mode:'party'`): `rounds` rodadas; em cada rodada cada agente de `conv.agents` responde em sequência vendo a
  transcrição da discussão até ali (inclusive falas da rodada atual). Instrução: falar em personagem, dirigir-se aos colegas
  pelo nome, concordar/discordar com argumentos, trazer algo novo, ≤ 250 palavras. Ao fim, se `synthesize`, o `moderator`
  gera síntese: consensos, divergências, decisões, próximos passos (com o agente BMAD responsável por cada um).
  Party não usa sessões de CLI (sempre `prompt` completo).
- **System prompt** = persona do agente + bloco de regras do ambiente (projeto, caminho, permissões: "somente leitura" ou
  "pode editar", referenciar código como `caminho:linha`, responder em pt-BR, usar markdown) + lista da equipe BMAD
  (id, nome, título, whenToUse) para poder sugerir handoff.
- **Histórico no `prompt`** (sessão nova): últimas 30 mensagens como `### Usuário` / `### <Nome> (<Título>)` + contexto + a nova mensagem.
- **Sessão CLI** reaproveitada só se `providerSessions[agentId]` tiver mesmo provider e model; senão sessão nova.
- Persistir a conversa após cada mensagem do agente. Título da conversa = primeiros 60 chars da 1ª mensagem se ainda for "Nova conversa".
- Em erro do provider: `message.error = err.message`, emitir `error`, continuar (party segue para o próximo agente).

## HTTP — `server/http.js`
```js
async startServer({ root, env, workspace, host, port, token }) -> { url, port, token, close() }
```
- Monta agents/workflows/settings/store/providers/orchestrator e chama `api.handle(req, res, ctx)`.
- `host` default `127.0.0.1`, `port` default 4747; se `EADDRINUSE`, tenta +1 até 20 vezes.
- `token` default: `BMAD_STUDIO_TOKEN` ou `crypto.randomBytes(16).toString('hex')`. `url` = `http://127.0.0.1:<port>/?token=<token>`.
- Estáticos: `GET /` e `/ui/*` servem `root/ui` (content-type correto, sem listar diretório, sem traversal). Estáticos NÃO exigem token.
- `/api/*` exige header `X-BMAD-Token` == token (ou `?token=`), senão 401. Checa `Host` ∈ {`127.0.0.1:<port>`, `localhost:<port>`} senão 403.
- Recarrega agents/workflows a cada `GET /api/bootstrap` (para edição ao vivo dos .md).

## API — `server/api.js`
JSON em request/response. Erro → `{ error: "mensagem" }` com status 4xx/5xx.

| Método | Rota | Corpo / Query | Resposta |
|---|---|---|---|
| GET | `/api/bootstrap` | | `{ mode, projects, agents, workflows, settings, providers }` (agents sem `persona` completa? — **inclui** `persona`) |
| GET | `/api/models` | | `{ refreshedAt, refreshing, providers: [{ id, label, available, detail, source, exhaustive, models: [{ id, label, available, reason?, until? }] }] }` |
| POST | `/api/models/refresh` | | catálogo redescoberto |
| GET | `/api/providers/status` | | só `providers` do catálogo (compatibilidade) |
| PUT | `/api/settings/agents/:agentId` | `{ provider, model }` | `{ ok: true, settings }` |
| POST | `/api/providers/test` | `{ provider, model, projectId }` | `{ ok, text?, error? }` |
| GET | `/api/projects/:pid/conversations` | | `[...]` |
| POST | `/api/projects/:pid/conversations` | `{ title?, mode, agents }` | `Conversation` |
| GET | `/api/projects/:pid/conversations/:cid` | | `Conversation` |
| DELETE | `/api/projects/:pid/conversations/:cid` | | `{ ok: true }` |
| POST | `/api/projects/:pid/conversations/:cid/messages` | `{ text, context, agentId?, workflowId?, rounds?, synthesize? }` | **stream NDJSON** de eventos do orquestrador (`Content-Type: application/x-ndjson`); party quando `conv.mode==='party'` |
| GET | `/api/projects/:pid/files` | `?q=` | `string[]` |
| GET | `/api/projects/:pid/file` | `?path=` | `{ path, content, truncated }` |
| GET | `/api/projects/:pid/search` | `?q=` | `[{path,line,text}]` |
| GET | `/api/projects/:pid/vscode` | | `{ activeEditor, diagnostics, openFiles, gitStatus }` (activeEditor sem `content`, só path/languageId/selection resumida) |
| POST | `/api/projects/:pid/actions/open` | `{ path, line? }` | `{ ok }` |
| POST | `/api/projects/:pid/actions/save` | `{ path, content }` | `{ ok, path }` |
| POST | `/api/projects/:pid/actions/diff` | `{ path, content }` | `{ ok }` |
| POST | `/api/projects/:pid/actions/insert` | `{ text }` | `{ ok }` |

Stream: se o cliente desconectar (`req.on('close')` antes do fim), abortar o `AbortController` passado ao orquestrador.

## .env
```
BMAD_STUDIO_HOST=127.0.0.1
BMAD_STUDIO_PORT=4747
BMAD_STUDIO_TOKEN=
DEFAULT_PROVIDER=agy-cli
DEFAULT_MODEL=gemini-3.8-flash-high
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
CLAUDE_CLI_PATH=claude
ANTHROPIC_API_KEY=
AGY_CLI_PATH=agy
AGY_CLI_EXTRA_ARGS=
# AGENT_<ID>_PROVIDER / AGENT_<ID>_MODEL (ex.: AGENT_ARCHITECT_PROVIDER=claude-cli)
```
