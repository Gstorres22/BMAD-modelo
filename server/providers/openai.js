const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const MAX_TOOL_ITERATIONS = 12;

// Filtro por CAPACIDADE (não por nome de modelo): o provider usa /chat/completions com tools,
// então só entram famílias de chat. Ficam de fora mídia/áudio/embeddings/moderação, modelos
// só-Responses API (codex, *-pro), variantes de busca, completions legados e snapshots datados
// (o alias sem data já aponta para a versão atual).
const CHAT_FAMILY = /^(gpt-|o\d|chatgpt-|chat-latest$)/i;
const NOT_CHAT = /(image|audio|realtime|transcribe|tts|embedding|moderation|whisper|search|instruct|live|sora|codex|-pro\b)/i;
const DATED_SNAPSHOT = /-(\d{4}-\d{2}-\d{2}|\d{4})$/;

function isChatModel(id) {
  return CHAT_FAMILY.test(id) && !NOT_CHAT.test(id) && !DATED_SNAPSHOT.test(id);
}

/** Agrupa por família (gpt → série o → demais) e, dentro dela, do mais novo para o mais antigo. */
function compareModelIds(a, b) {
  const family = (id) => (/^gpt-/i.test(id) ? 0 : /^o\d/i.test(id) ? 1 : 2);
  return family(a) - family(b) || b.localeCompare(a, 'en', { numeric: true });
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
 * Descobre os modelos de chat disponíveis para a chave via GET {OPENAI_BASE_URL}/models.
 * @param {object} env
 * @returns {Promise<{ available: boolean, detail: string, source: string, models: Array<{id: string, label: string}> }>}
 */
async function listModels(env) {
  const apiKey = env?.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { available: false, detail: 'OPENAI_API_KEY ausente no .env', source: 'API /models', models: [] };
  }
  const baseUrl = (env?.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = res.status === 401 ? 'chave inválida ou revogada' : body?.error?.message || res.statusText;
    return { available: false, detail: `OpenAI ${res.status}: ${reason}`, source: 'API /models', models: [] };
  }

  const json = await res.json();
  const all = (json.data || []).map((m) => m.id);
  const models = all
    .filter(isChatModel)
    .sort(compareModelIds)
    .map((id) => ({ id, label: id }));

  return {
    available: models.length > 0,
    detail: `${models.length} modelos de chat (de ${all.length} na conta)`,
    source: 'API /models',
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

  const model = opts.model;
  if (!model) {
    throw new Error('Nenhum modelo OpenAI selecionado para este agente. Escolha um em ⚙ Modelos.');
  }

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
  listModels,
  run
};
