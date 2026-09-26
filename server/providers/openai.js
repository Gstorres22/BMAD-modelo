const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const MAX_TOOL_ITERATIONS = 12;

// Filtro por CAPACIDADE (não por nome de modelo): os agentes conversam com texto + tools, então
// só entram famílias de chat. Ficam de fora mídia/áudio/embeddings/moderação, variantes de busca,
// completions legados, snapshots datados (o alias sem data já aponta para a versão atual) e as
// variantes especializadas codex/*-pro (agente de código e raciocínio longo/caro).
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
 * Executa um agente na OpenAI com streaming e ferramentas do workspace.
 *
 * Usa a Responses API (/v1/responses) por padrão: é a única que aceita function tools junto com
 * raciocínio nos modelos novos (gpt-5.6+, gpt-6…; em /chat/completions eles exigem
 * reasoning_effort 'none'). Endpoints compatíveis de terceiros (OPENAI_BASE_URL fora da OpenAI)
 * costumam ter só /chat/completions, então o modo 'auto' usa esse caminho para eles.
 * OPENAI_API_MODE=auto|responses|chat força o modo.
 * @param {object} opts
 * @returns {Promise<{ text: string, usage?: object }>}
 */
async function run(opts = {}) {
  const apiKey = opts.env?.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada no .env');
  }
  if (!opts.model) {
    throw new Error('Nenhum modelo OpenAI selecionado para este agente. Escolha um em ⚙ Modelos.');
  }
  const baseUrl = (opts.env?.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const ctx = { apiKey, baseUrl, model: opts.model, toolDefs: getToolsDefinitionsSafe(opts) };

  return resolveApiMode(opts.env, baseUrl) === 'chat'
    ? runChatCompletions(opts, ctx)
    : runResponses(opts, ctx);
}

function resolveApiMode(env, baseUrl) {
  const mode = String(env?.OPENAI_API_MODE || 'auto').trim().toLowerCase();
  if (mode === 'responses' || mode === 'chat') return mode;
  let host = '';
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    host = '';
  }
  return host === 'api.openai.com' ? 'responses' : 'chat';
}

async function postJson(url, apiKey, body, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    let errMsg = '';
    try {
      const errText = await res.text();
      try {
        errMsg = JSON.parse(errText).error?.message || errText;
      } catch {
        errMsg = errText;
      }
    } catch {
      errMsg = res.statusText || String(res.status);
    }
    throw new Error(`OpenAI ${res.status}: ${errMsg}`);
  }
  return res;
}

/** Lê um corpo SSE e chama onEvent(eventName, data) para cada bloco "event:/data:". */
async function readSse(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let eventName = null;
  let dataLines = [];

  const dispatch = () => {
    if (dataLines.length === 0) {
      eventName = null;
      return;
    }
    const dataStr = dataLines.join('\n');
    const name = eventName;
    eventName = null;
    dataLines = [];
    if (dataStr === '[DONE]') return;
    let data;
    try {
      data = JSON.parse(dataStr);
    } catch {
      return;
    }
    onEvent(name || data.type || '', data);
  };

  const handleLine = (rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    if (line === '') {
      dispatch();
    } else if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const l of lines) handleLine(l);
  }
  buffer += decoder.decode();
  if (buffer) handleLine(buffer);
  dispatch();
}

/** Executa uma ferramenta pedida pelo modelo, emitindo o evento 'tool'. Retorna a saída em texto. */
async function executeToolCall(name, argsJson, opts) {
  let parsedArgs = {};
  let parseOk = true;
  try {
    parsedArgs = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    parseOk = false;
  }

  const detail = parseOk && parsedArgs && typeof parsedArgs === 'object'
    ? parsedArgs.path || parsedArgs.query || parsedArgs.command || JSON.stringify(parsedArgs)
    : argsJson || '';
  opts.onEvent?.({ type: 'tool', name, detail: String(detail).slice(0, 120) });

  if (!parseOk) return 'ERRO: argumentos inválidos';
  try {
    const { executeTool } = require('../tools.js');
    return String(await executeTool(name, parsedArgs, {
      workspace: opts.workspace,
      projectId: opts.projectId,
      canEdit: opts.canEdit
    }));
  } catch (err) {
    return `ERRO: ${err.message || 'Falha ao executar ferramenta'}`;
  }
}

/** Separa o texto de turnos diferentes (texto → ferramenta → texto). */
function turnSeparator(accumulated) {
  if (!accumulated || accumulated.endsWith('\n\n')) return '';
  return accumulated.endsWith('\n') ? '\n' : '\n\n';
}

// --- Responses API --------------------------------------------------------------------------

function toResponsesInput(opts) {
  if (Array.isArray(opts.messages) && opts.messages.length > 0) {
    return opts.messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m) => ({ role: m.role, content: String(m.content) }));
  }
  return opts.prompt ? [{ role: 'user', content: String(opts.prompt) }] : [];
}

async function runResponses(opts, ctx) {
  const endpoint = `${ctx.baseUrl}/responses`;
  const tools = (ctx.toolDefs || []).map((t) => ({
    type: 'function',
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
    strict: false // os schemas têm parâmetros opcionais; strict exigiria todos em "required"
  }));

  let input = toResponsesInput(opts);
  let text = '';
  let usage;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (opts.signal?.aborted) throw new Error('Cancelado pelo usuário');

    const body = {
      model: ctx.model,
      input,
      stream: true,
      // Nada fica guardado na OpenAI; o raciocínio volta criptografado para manter o fio entre as chamadas de ferramenta
      store: false,
      include: ['reasoning.encrypted_content']
    };
    if (opts.systemPrompt) body.instructions = opts.systemPrompt;
    if (tools.length > 0) body.tools = tools;

    const res = await postJson(endpoint, ctx.apiKey, body, opts.signal);

    let finalResponse = null;
    let streamError = null;
    let startedTurnText = false;

    await readSse(res, (type, data) => {
      if (type === 'response.output_text.delta' && data.delta) {
        if (!startedTurnText) {
          const sep = turnSeparator(text);
          if (sep) {
            text += sep;
            opts.onEvent?.({ type: 'delta', text: sep });
          }
          startedTurnText = true;
        }
        text += data.delta;
        opts.onEvent?.({ type: 'delta', text: data.delta });
      } else if (type === 'response.completed' || type === 'response.incomplete') {
        finalResponse = data.response;
      } else if (type === 'response.failed') {
        streamError = data.response?.error?.message || 'a resposta falhou';
      } else if (type === 'error') {
        streamError = data.message || data.error?.message || 'erro no streaming';
      }
    });

    if (streamError) throw new Error(`OpenAI: ${streamError}`);
    if (!finalResponse) throw new Error('OpenAI: o streaming terminou sem a resposta final');
    if (finalResponse.usage) usage = finalResponse.usage;

    const output = Array.isArray(finalResponse.output) ? finalResponse.output : [];
    const calls = output.filter((item) => item.type === 'function_call');
    if (calls.length === 0) break;

    // Devolve a saída inteira (inclui o raciocínio criptografado) + o resultado de cada ferramenta
    input = input.concat(output);
    for (const call of calls) {
      const result = await executeToolCall(call.name, call.arguments, opts);
      input.push({ type: 'function_call_output', call_id: call.call_id, output: result });
    }
  }

  return { text, usage };
}

// --- Chat Completions (endpoints compatíveis de terceiros) ------------------------------------

async function runChatCompletions(opts, ctx) {
  const endpoint = `${ctx.baseUrl}/chat/completions`;
  const messages = [];
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
  if (Array.isArray(opts.messages) && opts.messages.length > 0) messages.push(...opts.messages);
  else if (opts.prompt) messages.push({ role: 'user', content: opts.prompt });

  let text = '';
  let usage;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (opts.signal?.aborted) throw new Error('Cancelado pelo usuário');

    const body = { model: ctx.model, messages, stream: true, stream_options: { include_usage: true } };
    if (ctx.toolDefs && ctx.toolDefs.length > 0) body.tools = ctx.toolDefs;

    const res = await postJson(endpoint, ctx.apiKey, body, opts.signal);

    let turnText = '';
    const toolCalls = new Map();

    await readSse(res, (_type, data) => {
      if (data.usage) usage = data.usage;
      const delta = Array.isArray(data.choices) && data.choices[0] ? data.choices[0].delta : null;
      if (!delta) return;
      if (delta.content) {
        if (!turnText) {
          const sep = turnSeparator(text);
          if (sep) {
            text += sep;
            opts.onEvent?.({ type: 'delta', text: sep });
          }
        }
        turnText += delta.content;
        text += delta.content;
        opts.onEvent?.({ type: 'delta', text: delta.content });
      }
      for (const tc of delta.tool_calls || []) {
        const idx = tc.index ?? 0;
        const cur = toolCalls.get(idx) || { id: '', type: 'function', function: { name: '', arguments: '' } };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.function.name += tc.function.name;
        if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
        toolCalls.set(idx, cur);
      }
    });

    if (toolCalls.size === 0) break;

    const calls = Array.from(toolCalls.values());
    messages.push({ role: 'assistant', content: turnText || null, tool_calls: calls });
    for (const tc of calls) {
      const result = await executeToolCall(tc.function.name, tc.function.arguments, opts);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }

  return { text, usage };
}

module.exports = {
  id: 'openai',
  label: 'OpenAI API',
  listModels,
  run
};
