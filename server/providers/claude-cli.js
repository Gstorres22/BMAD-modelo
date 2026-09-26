const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { resolveCommand, spawnProcess } = require('./spawn.js');

const DEFAULT_MODELS = 'sonnet,opus,haiku,claude-opus-5-5,claude-sonnet-5,claude-fable-5-1';
const READONLY_TOOLS = 'Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git status:*)';
const EDIT_TOOLS = 'Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git status:*),Edit,Write,MultiEdit';

function parseModels(modelsStr) {
  return (modelsStr || DEFAULT_MODELS)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Verifica o status de disponibilidade do Claude CLI.
 * @param {object} env
 * @returns {Promise<{ available: boolean, detail: string, models: string[] }>}
 */
async function status(env) {
  const cmd = env?.CLAUDE_CLI_PATH || 'claude';
  const models = parseModels(env?.CLAUDE_CLI_MODELS);
  const resolved = resolveCommand(cmd);

  if (!resolved) {
    return {
      available: false,
      detail: 'Comando não encontrado no PATH',
      models
    };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);

  try {
    let stdoutText = '';
    let stderrText = '';

    const res = await spawnProcess(cmd, ['--version'], {
      signal: ac.signal,
      onStdoutLine: (line) => {
        stdoutText += line + '\n';
      },
      onStderr: (chunk) => {
        stderrText += chunk;
      },
      envVarName: 'CLAUDE_CLI_PATH'
    });

    clearTimeout(timer);

    const combined = (stdoutText || stderrText).trim();
    const firstLine = combined.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';

    return {
      available: res.code === 0,
      detail: firstLine || (res.code === 0 ? 'Disponível' : `Falha ao executar --version (código ${res.code})`),
      models
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      available: false,
      detail: err.message || 'Erro ao executar --version',
      models
    };
  }
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
  status,
  run
};
