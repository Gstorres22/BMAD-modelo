const { resolveCommand, spawnProcess } = require('./spawn.js');

const DEFAULT_MODELS =
  'gemini-3.8-flash-high,gemini-3.8-flash-medium,gemini-3.1-pro-high,gemini-3.1-pro-low,claude-opus-4-6-thinking,claude-sonnet-4-6';

function parseModels(modelsStr) {
  return (modelsStr || DEFAULT_MODELS)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Verifica o status de disponibilidade do AGY CLI.
 * @param {object} env
 * @returns {Promise<{ available: boolean, detail: string, models: string[] }>}
 */
async function status(env) {
  const cmd = env?.AGY_CLI_PATH || 'agy';
  const models = parseModels(env?.AGY_CLI_MODELS);
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
      envVarName: 'AGY_CLI_PATH'
    });

    clearTimeout(timer);

    const combined = (stdoutText + '\n' + stderrText).trim();
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
 * Executa uma interação com o AGY CLI no modo streaming.
 * @param {object} opts
 * @returns {Promise<{ text: string, sessionId?: string, usage?: object }>}
 */
async function run(opts = {}) {
  const cmd = opts.env?.AGY_CLI_PATH || 'agy';

  const args = [
    '--print=',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json'
  ];

  if (opts.model) {
    args.push('--model', opts.model);
  }

  if (opts.sessionId) {
    args.push('--conversation', opts.sessionId);
  }

  if (opts.canEdit) {
    args.push('--mode', 'accept-edits');
  }

  const extraArgsStr = opts.env?.AGY_CLI_EXTRA_ARGS || '';
  const extraArgs = extraArgsStr.split(/\s+/).filter(Boolean);
  if (extraArgs.length > 0) {
    args.push(...extraArgs);
  }

  let userText = '';
  if (opts.sessionId) {
    userText = opts.resumePrompt || opts.prompt || '';
  } else {
    userText = opts.systemPrompt
      ? `${opts.systemPrompt}\n\n${opts.prompt || ''}`
      : (opts.prompt || '');
  }

  const stdinText = JSON.stringify({
    event: 'user',
    message: { content: userText }
  }) + '\n';

  let returnedSessionId = null;
  let resultObj = null;
  let accumulatedDeltas = '';
  const seenStepIndices = new Set();
  const nonJsonLines = [];

  const onStdoutLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      nonJsonLines.push(trimmed);
      return;
    }

    if (obj.event === 'init') {
      if (obj.conversation_id) {
        returnedSessionId = obj.conversation_id;
      }
    } else if (obj.event === 'step_update') {
      const su = obj.step_update;
      if (!su) return;

      if (su.step_type === 'agent_response' && su.text_delta) {
        accumulatedDeltas += su.text_delta;
        opts.onEvent?.({ type: 'delta', text: su.text_delta });
      } else if (su.step_type === 'tool' && su.state === 'ACTIVE') {
        const stepIdx = obj.step_index !== undefined ? obj.step_index : su.step_index;
        const stepKey = stepIdx !== undefined
          ? String(stepIdx)
          : `${su.tool_name}:${JSON.stringify(su.tool_info || {})}`;

        if (!seenStepIndices.has(stepKey)) {
          seenStepIndices.add(stepKey);

          let detail = '';
          const params = su.tool_info?.parameters;
          if (params && typeof params === 'object') {
            for (const val of Object.values(params)) {
              if (typeof val === 'string') {
                detail = val;
                break;
              }
            }
          }

          opts.onEvent?.({
            type: 'tool',
            name: su.tool_name || 'tool',
            detail: String(detail).slice(0, 120)
          });
        }
      }
    } else if (obj.event === 'result') {
      resultObj = obj.result || obj;
      if (resultObj.conversation_id) {
        returnedSessionId = resultObj.conversation_id;
      }
    }
  };

  // Repassa só as credenciais relevantes ao AGY (nunca o .env inteiro)
  const childEnv = {};
  for (const key of ['GEMINI_API_KEY', 'GOOGLE_API_KEY']) {
    if (opts.env?.[key]) childEnv[key] = opts.env[key];
  }

  const res = await spawnProcess(cmd, args, {
    cwd: opts.cwd,
    env: childEnv,
    stdinText,
    signal: opts.signal,
    onStdoutLine,
    envVarName: 'AGY_CLI_PATH'
  });

  if (resultObj?.status === 'ERROR') {
    throw new Error(resultObj.error || 'Erro reportado pelo AGY CLI');
  }

  if (!resultObj) {
    const combinedStderr = (res.stderr + '\n' + nonJsonLines.join('\n')).trim();
    const errSnippet = combinedStderr.slice(-2000);
    throw new Error(errSnippet || `O CLI AGY terminou sem resposta (código ${res.code})`);
  }

  if (!accumulatedDeltas && resultObj.response) {
    accumulatedDeltas = resultObj.response;
    opts.onEvent?.({ type: 'delta', text: accumulatedDeltas });
  }

  const finalText = accumulatedDeltas || resultObj.response || '';

  return {
    text: finalText,
    sessionId: returnedSessionId || opts.sessionId,
    usage: resultObj.usage || undefined
  };
}

module.exports = {
  id: 'agy-cli',
  label: 'AGY CLI (Antigravity)',
  status,
  run
};
