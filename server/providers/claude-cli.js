const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { resolveCommand, spawnProcess, runCommand } = require('./spawn.js');

const READONLY_TOOLS = 'Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git status:*)';
const EDIT_TOOLS = 'Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git status:*),Edit,Write,MultiEdit';

// Aliases que o próprio Claude CLI resolve para a versão mais recente de cada família,
// conforme a assinatura logada. Usados quando não há ANTHROPIC_API_KEY para listar via API.
const CLI_ALIASES = [
  { id: 'sonnet', label: 'Sonnet (alias do CLI → versão mais recente)' },
  { id: 'opus', label: 'Opus (alias do CLI → versão mais recente)' },
  { id: 'haiku', label: 'Haiku (alias do CLI → versão mais recente)' }
];

/** Lista os modelos da conta via API da Anthropic (requer ANTHROPIC_API_KEY). */
async function fetchApiModels(apiKey) {
  const models = [];
  let afterId = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL('https://api.anthropic.com/v1/models');
    url.searchParams.set('limit', '1000');
    if (afterId) url.searchParams.set('after_id', afterId);
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`API da Anthropic ${res.status}: ${body?.error?.message || res.statusText}`);
    }
    const json = await res.json();
    for (const m of json.data || []) models.push({ id: m.id, label: m.display_name || m.id });
    if (!json.has_more || !json.last_id) break;
    afterId = json.last_id;
  }
  return models;
}

/**
 * Descobre disponibilidade e modelos do Claude CLI.
 * - Disponibilidade: `claude auth status` (login) ou ANTHROPIC_API_KEY.
 * - Modelos: API da Anthropic quando há ANTHROPIC_API_KEY; senão, os aliases do CLI.
 * @param {object} env
 * `exhaustive: false` quando só há aliases: outros ids válidos do CLI (ex.: claude-sonnet-5) não aparecem na
 * lista e são validados no primeiro uso.
 * @returns {Promise<{ available: boolean, detail: string, source: string, exhaustive: boolean, models: Array<{id: string, label: string}> }>}
 */
async function listModels(env) {
  const cmd = env?.CLAUDE_CLI_PATH || 'claude';
  if (!resolveCommand(cmd)) {
    return { available: false, detail: `Comando "${cmd}" não encontrado no PATH (CLAUDE_CLI_PATH)`, source: 'cli', exhaustive: false, models: [] };
  }

  const apiKey = env?.ANTHROPIC_API_KEY;
  const [version, auth] = await Promise.all([
    runCommand(cmd, ['--version'], { timeoutMs: 15000, envVarName: 'CLAUDE_CLI_PATH' }).catch(() => null),
    runCommand(cmd, ['auth', 'status'], { timeoutMs: 20000, envVarName: 'CLAUDE_CLI_PATH' }).catch(() => null)
  ]);

  const versionText = version ? version.stdout.trim().split('\n')[0].trim() : '';
  let authInfo = null;
  try {
    authInfo = auth ? JSON.parse(auth.stdout) : null;
  } catch {
    authInfo = null;
  }
  const loggedIn = Boolean(apiKey) || Boolean(authInfo && authInfo.loggedIn);
  const authText = apiKey
    ? 'ANTHROPIC_API_KEY'
    : authInfo && authInfo.loggedIn
      ? `logado (${[authInfo.authMethod, authInfo.subscriptionType].filter(Boolean).join(', ')})`
      : 'não logado — rode `claude login`';

  let models = CLI_ALIASES;
  let source = 'aliases do CLI';
  let exhaustive = false;
  let apiError = null;
  if (apiKey) {
    try {
      models = await fetchApiModels(apiKey);
      source = 'API da Anthropic';
      exhaustive = true;
    } catch (err) {
      apiError = err.message;
    }
  }

  return {
    available: loggedIn,
    detail: [versionText, authText, apiError].filter(Boolean).join(' · '),
    source,
    exhaustive,
    models
  };
}

/**
 * Executa uma interação com o Claude CLI no modo streaming.
 * @param {object} opts
 * @returns {Promise<{ text: string, sessionId?: string, usage?: object }>}
 */
async function run(opts = {}) {
  const cmd = opts.env?.CLAUDE_CLI_PATH || 'claude';
  const tmpFile = path.join(
    os.tmpdir(),
    `bmad-studio-${crypto.randomBytes(8).toString('hex')}.md`
  );

  await fs.promises.writeFile(tmpFile, opts.systemPrompt || '', 'utf8');

  try {
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages'
    ];

    if (opts.model) {
      args.push('--model', opts.model);
    }

    args.push('--append-system-prompt-file', tmpFile);

    if (opts.sessionId) {
      args.push('--resume', opts.sessionId);
    }

    const allowedTools = opts.canEdit ? EDIT_TOOLS : READONLY_TOOLS;
    args.push('--allowedTools', allowedTools);

    if (opts.canEdit) {
      args.push('--permission-mode', 'acceptEdits');
    }

    const stdinText = opts.sessionId
      ? (opts.resumePrompt || opts.prompt || '')
      : (opts.prompt || '');

    const childEnv = {};
    if (opts.env?.ANTHROPIC_API_KEY) {
      childEnv.ANTHROPIC_API_KEY = opts.env.ANTHROPIC_API_KEY;
    }

    let returnedSessionId = null;
    let resultObj = null;
    let accumulatedDeltas = '';
    let hadStreamEvents = false;
    const seenToolIds = new Set();

    const onStdoutLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return;
      }

      if (parsed.type === 'system' && parsed.subtype === 'init') {
        if (parsed.session_id) {
          returnedSessionId = parsed.session_id;
        }
      } else if (parsed.type === 'stream_event') {
        const ev = parsed.event;
        // Separa blocos de texto de turnos diferentes (texto → ferramenta → texto)
        if (ev?.type === 'content_block_start' && ev?.content_block?.type === 'text' &&
            accumulatedDeltas && !accumulatedDeltas.endsWith('\n\n')) {
          const sep = accumulatedDeltas.endsWith('\n') ? '\n' : '\n\n';
          accumulatedDeltas += sep;
          opts.onEvent?.({ type: 'delta', text: sep });
        }
        if (ev?.type === 'content_block_delta' && ev?.delta?.type === 'text_delta') {
          const deltaText = ev.delta.text || '';
          if (deltaText) {
            hadStreamEvents = true;
            accumulatedDeltas += deltaText;
            opts.onEvent?.({ type: 'delta', text: deltaText });
          }
        }
      } else if (parsed.type === 'assistant') {
        const content = parsed.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              const toolId = block.id;
              if (!toolId || !seenToolIds.has(toolId)) {
                if (toolId) {
                  seenToolIds.add(toolId);
                }

                let detail = '';
                if (block.input) {
                  if (typeof block.input === 'string') {
                    detail = block.input;
                  } else {
                    detail =
                      block.input.file_path ||
                      block.input.path ||
                      block.input.pattern ||
                      block.input.command ||
                      JSON.stringify(block.input);
                  }
                }

                opts.onEvent?.({
                  type: 'tool',
                  name: block.name || 'tool',
                  detail: String(detail).slice(0, 120)
                });
              }
            } else if (block.type === 'text') {
              if (!hadStreamEvents && block.text) {
                accumulatedDeltas += block.text;
                opts.onEvent?.({ type: 'delta', text: block.text });
              }
            }
          }
        }
      } else if (parsed.type === 'result') {
        resultObj = parsed;
        if (parsed.session_id) {
          returnedSessionId = parsed.session_id;
        }
      }
    };

    const res = await spawnProcess(cmd, args, {
      cwd: opts.cwd,
      env: childEnv,
      stdinText,
      signal: opts.signal,
      onStdoutLine,
      envVarName: 'CLAUDE_CLI_PATH'
    });

    if (resultObj?.is_error) {
      throw new Error(resultObj.result || 'Erro reportado pelo Claude CLI');
    }

    if (!resultObj) {
      const errSnippet = (res.stderr || '').trim().slice(-2000);
      throw new Error(errSnippet || `O CLI Claude terminou sem resposta (código ${res.code})`);
    }

    if (!accumulatedDeltas && resultObj.result) {
      accumulatedDeltas = resultObj.result;
      opts.onEvent?.({ type: 'delta', text: accumulatedDeltas });
    }

    const finalText = accumulatedDeltas || resultObj.result || '';

    return {
      text: finalText,
      sessionId: returnedSessionId || opts.sessionId,
      usage: resultObj.usage || undefined
    };
  } finally {
    await fs.promises.unlink(tmpFile).catch(() => {});
  }
}

module.exports = {
  id: 'claude-cli',
  label: 'Claude CLI',
  listModels,
  run
};
