const DEFAULT_MODELS = 'gpt-5,gpt-5-mini,gpt-4.1';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const MAX_TOOL_ITERATIONS = 12;

function parseModels(modelsStr) {
  return (modelsStr || DEFAULT_MODELS)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Retorna definições de ferramentas a partir de server/tools.js se disponível.
 * @param {object} opts
 * @returns {Array<object>}
 */
function getToolsDefinitionsSafe(opts) {
  try {
    const toolsHelper = require('../tools.js');
    if (typeof toolsHelper.getToolDefinitions === 'function') {
      return toolsHelper.getToolDefinitions({ canEdit: opts.canEdit });
    }
  } catch {
    // Módulo de tools pode estar sendo carregado ou não existir ainda
  }
  return [];
}

/**
 * Verifica o status do provider OpenAI.
 * @param {object} env
 * @returns {Promise<{ available: boolean, detail: string, models: string[] }>}
 */
async function status(env) {
  const apiKey = env?.OPENAI_API_KEY?.trim();
  const models = parseModels(env?.OPENAI_MODELS);
  const available = Boolean(apiKey);

  return {
    available,
    detail: available ? 'Chave configurada' : 'OPENAI_API_KEY ausente no .env',
    models
  };
}

/**
 * Executa uma chamada à API de chat completions da OpenAI com suporte a streaming e tool calls.
 * @param {object} opts
 * @returns {Promise<{ text: string, usage?: object }>}
 */
async function run(opts = {}) {
  const apiKey = opts.env?.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada no .env');
  }

  const baseUrl = (opts.env?.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;

  const availableModels = parseModels(opts.env?.OPENAI_MODELS);
  const model = opts.model || availableModels[0] || 'gpt-5';

  const toolDefs = getToolsDefinitionsSafe(opts);

  let currentMessages = [];
  if (opts.systemPrompt) {
    currentMessages.push({ role: 'system', content: opts.systemPrompt });
  }

  if (Array.isArray(opts.messages) && opts.messages.length > 0) {
    currentMessages.push(...opts.messages);
  } else if (opts.prompt) {
    currentMessages.push({ role: 'user', content: opts.prompt });
  }

  let totalAccumulatedText = '';
  let lastUsage = undefined;
  let iteration = 0;

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;

    if (opts.signal?.aborted) {
      throw new Error('Cancelado pelo usuário');
    }

    const reqBody = {
      model,
      messages: currentMessages,
      stream: true,
      stream_options: { include_usage: true }
    };

    if (toolDefs && toolDefs.length > 0) {
      reqBody.tools = toolDefs;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(reqBody),
      signal: opts.signal
    });

    if (!res.ok) {
      let errMsg = '';
      try {
        const errText = await res.text();
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errText;
      } catch {
        errMsg = res.statusText || String(res.status);
      }
      throw new Error(`OpenAI ${res.status}: ${errMsg}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let sseBuffer = '';
    let turnText = '';
    let finishReason = null;
    const toolCallsMap = new Map();

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        sseBuffer += decoder.decode();
        break;
      }

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(':')) continue;

        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;

          let data;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (data.usage) {
            lastUsage = data.usage;
          }

          if (Array.isArray(data.choices) && data.choices.length > 0) {
            const choice = data.choices[0];
            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }

            const delta = choice.delta;
            if (delta) {
              if (delta.content) {
                turnText += delta.content;
                totalAccumulatedText += delta.content;
                opts.onEvent?.({ type: 'delta', text: delta.content });
              }

              if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallsMap.has(idx)) {
                    toolCallsMap.set(idx, {
                      id: tc.id || '',
                      type: tc.type || 'function',
                      function: {
                        name: tc.function?.name || '',
                        arguments: tc.function?.arguments || ''
                      }
                    });
                  } else {
                    const existing = toolCallsMap.get(idx);
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) {
                      existing.function.name += tc.function.name;
                    }
                    if (tc.function?.arguments) {
                      existing.function.arguments += tc.function.arguments;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (sseBuffer.trim()) {
      const line = sseBuffer.trim();
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6).trim();
        if (dataStr !== '[DONE]') {
          try {
            const data = JSON.parse(dataStr);
            if (data.usage) lastUsage = data.usage;
          } catch {}
        }
      }
    }

    if (finishReason === 'tool_calls' || toolCallsMap.size > 0) {
      const toolCallsArray = Array.from(toolCallsMap.values());

      currentMessages.push({
        role: 'assistant',
        content: turnText || null,
        tool_calls: toolCallsArray
      });

      const { executeTool } = require('../tools.js');

      for (const tc of toolCallsArray) {
        const name = tc.function.name;
        let parsedArgs = {};
        let parseOk = true;

        try {
          parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          parseOk = false;
        }

        let detail = '';
        if (parseOk && parsedArgs && typeof parsedArgs === 'object') {
          detail =
            parsedArgs.path ||
            parsedArgs.query ||
            parsedArgs.command ||
            JSON.stringify(parsedArgs);
        } else {
          detail = tc.function.arguments || '';
        }

        opts.onEvent?.({
          type: 'tool',
          name,
          detail: String(detail).slice(0, 120)
        });

        let toolResult = '';
        if (!parseOk) {
          toolResult = 'ERRO: argumentos inválidos';
        } else {
          try {
            toolResult = await executeTool(name, parsedArgs, {
              workspace: opts.workspace,
              projectId: opts.projectId,
              canEdit: opts.canEdit
            });
          } catch (err) {
            toolResult = `ERRO: ${err.message || 'Falha ao executar ferramenta'}`;
          }
        }

        currentMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: String(toolResult)
        });
      }
    } else {
      break;
    }
  }

  return {
    text: totalAccumulatedText,
    usage: lastUsage
  };
}

module.exports = {
  id: 'openai',
  label: 'OpenAI API',
  status,
  run
};
