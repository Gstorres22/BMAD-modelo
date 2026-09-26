const { resolveCommand, spawnProcess, runCommand } = require('./spawn.js');

/**
 * Descobre os modelos disponíveis consultando o próprio AGY (`agy models`).
 * Saída do CLI: uma linha por modelo, "<id>\t<rótulo>".
 * @param {object} env
 * @returns {Promise<{ available: boolean, detail: string, source: string, models: Array<{id: string, label: string}> }>}
 */
async function listModels(env) {
  const cmd = env?.AGY_CLI_PATH || 'agy';
  if (!resolveCommand(cmd)) {
    return { available: false, detail: `Comando "${cmd}" não encontrado no PATH (AGY_CLI_PATH)`, source: 'agy models', models: [] };
  }

  const [version, listing] = await Promise.all([
    runCommand(cmd, ['--version'], { timeoutMs: 15000, envVarName: 'AGY_CLI_PATH' }).catch(() => null),
    runCommand(cmd, ['models'], { timeoutMs: 60000, envVarName: 'AGY_CLI_PATH' })
  ]);

  const versionText = version ? (version.stdout + '\n' + version.stderr).trim().split('\n')[0].trim() : '';
  const models = listing.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, ...rest] = line.split('\t');
      return { id: id.trim(), label: rest.join(' ').trim() || id.trim() };
    })
    // Descarta linhas que não são ids de modelo (mensagens de progresso/erro do CLI)
    .filter((m) => /^[a-z0-9][\w.:-]*$/i.test(m.id));

  if (listing.code !== 0 || models.length === 0) {
    const err = (listing.stderr || listing.stdout).trim().split('\n').filter((l) => !/fetching/i.test(l)).pop();
    return {
      available: false,
      detail: err || `"agy models" não retornou modelos (código ${listing.code}). Verifique o login do Antigravity.`,
      source: 'agy models',
      models
    };
  }

  return {
    available: true,
    detail: [versionText && `v${versionText.replace(/^v/i, '')}`, `${models.length} modelos`].filter(Boolean).join(' · '),
    source: 'agy models',
    models
  };
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
  listModels,
  run
};
