/**
 * Catálogo de modelos — descoberto dinamicamente, nunca "chumbado" no código.
 *
 * - No início de cada sessão (subida do servidor) consulta cada provider (`listModels`) e grava
 *   nome + disponibilidade de todos os modelos em data/models.json.
 * - Durante o uso, falhas reais marcam indisponibilidade (cota esgotada com horário de retorno,
 *   autenticação, modelo não suportado) e sucessos reabilitam o modelo.
 * - A lista pode ser atualizada manualmente (POST /api/models/refresh).
 */

const fs = require('fs');
const path = require('path');

const LIST_TIMEOUT_MS = 90000;

/** "Resets in 166h38m34s" / "try again in 20s" → milissegundos. */
function parseResetMs(message) {
  const m = /(?:resets?|try again|retry)\s+in\s+((?:\d+\s*[dhms]\s*)+)/i.exec(message || '');
  if (!m) return null;
  let ms = 0;
  const unit = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  for (const [, n, u] of m[1].matchAll(/(\d+)\s*([dhms])/gi)) ms += Number(n) * unit[u.toLowerCase()];
  return ms || null;
}

/**
 * Classifica o erro de uma execução para decidir o que fica indisponível.
 * @returns {null | { scope: 'model'|'provider', kind: 'quota'|'auth'|'unsupported', reason: string, until: number|null }}
 */
function classifyError(message) {
  const msg = String(message || '');
  if (/cancelad/i.test(msg)) return null;

  // Falta de crédito/cobrança vale para a conta inteira, não para um modelo
  if (/insufficient_quota|exceeded your current quota|billing/i.test(msg)) {
    return { scope: 'provider', kind: 'quota', reason: 'Conta sem crédito/cota', until: null };
  }
  if (/quota|rate.?limit|resource.?exhausted|too many requests|\b429\b/i.test(msg)) {
    const resetMs = parseResetMs(msg);
    return {
      scope: 'model',
      kind: 'quota',
      reason: 'Cota/limite de uso atingido',
      until: resetMs ? Date.now() + resetMs : null
    };
  }
  if (/failed to authenticate|not logged in|oauth|unauthori[sz]ed|invalid.{0,20}api.?key|incorrect api key|\b401\b|OPENAI_API_KEY não/i.test(msg)) {
    return { scope: 'provider', kind: 'auth', reason: 'Falha de autenticação', until: null };
  }
  if (/model_not_found|model .{0,60}(does not exist|not found|not supported|unavailable)|unknown model|invalid model|not a chat model|only supported in v1\/responses/i.test(msg)) {
    return { scope: 'model', kind: 'unsupported', reason: 'Modelo não suportado por este provider', until: null };
  }
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {{ file: string, getEnv: () => object, providers: Record<string, any> }} opts
 */
function createModelCatalog({ file, getEnv, providers }) {
  /** @type {{ refreshedAt: string|null, providers: Record<string, any> }} */
  let state = { refreshedAt: null, providers: {} };
  let inflight = null;

  // Estado da sessão anterior: exibido enquanto a descoberta desta sessão roda
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved && typeof saved === 'object' && saved.providers) state = saved;
  } catch {
    // Primeiro uso ou arquivo corrompido: começa vazio
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
    } catch {
      // Falha ao gravar o cache não pode derrubar o servidor
    }
  }

  /** Marcas de cota expiram sozinhas quando o horário de retorno passa. */
  function expireMarks() {
    const now = Date.now();
    let changed = false;
    for (const prov of Object.values(state.providers)) {
      for (const m of prov.models || []) {
        if (!m.available && m.until && m.until <= now) {
          m.available = true;
          delete m.reason;
          delete m.kind;
          delete m.until;
          changed = true;
        }
      }
    }
    if (changed) persist();
  }

  async function discoverProvider(id, provider, previous) {
    const env = getEnv();
    let result;
    try {
      result = await Promise.race([
        provider.listModels(env),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo esgotado ao listar modelos')), LIST_TIMEOUT_MS))
      ]);
    } catch (err) {
      result = { available: false, detail: err.message || String(err), source: '', models: [] };
    }

    const prevModels = new Map(((previous && previous.models) || []).map((m) => [m.id, m]));
    const now = Date.now();
    const models = (result.models || []).map((m) => {
      const entry = { id: m.id, label: m.label || m.id, available: Boolean(result.available) };
      const prev = prevModels.get(m.id);
      // Cota com horário de retorno ainda no futuro sobrevive à nova listagem
      if (prev && prev.kind === 'quota' && prev.until && prev.until > now) {
        Object.assign(entry, { available: false, kind: prev.kind, reason: prev.reason, until: prev.until });
      }
      return entry;
    });
    // Modelos informados manualmente que já funcionaram continuam no catálogo
    for (const prev of prevModels.values()) {
      if (prev.manual && !models.some((m) => m.id === prev.id)) models.push(prev);
    }

    return {
      id,
      label: provider.label,
      available: Boolean(result.available),
      detail: result.detail || '',
      source: result.source || '',
      // false = a lista não cobre todos os ids aceitos (ex.: aliases do Claude CLI)
      exhaustive: result.exhaustive !== false,
      checkedAt: nowIso(),
      models
    };
  }

  /** Descobre todos os providers em paralelo. Chamadas concorrentes compartilham a mesma execução. */
  function refresh() {
    if (!inflight) {
      inflight = (async () => {
        const entries = await Promise.all(
          Object.entries(providers).map(([id, provider]) => discoverProvider(id, provider, state.providers[id]))
        );
        state = { refreshedAt: nowIso(), providers: Object.fromEntries(entries.map((p) => [p.id, p])) };
        persist();
      })().finally(() => {
        inflight = null;
      });
    }
    // O snapshot é tirado depois de liberar `inflight`, para sair com refreshing: false
    return inflight.then(() => snapshot());
  }

  function snapshot() {
    expireMarks();
    return {
      refreshedAt: state.refreshedAt,
      refreshing: Boolean(inflight),
      providers: Object.keys(providers).map((id) => {
        const p = state.providers[id];
        return p
          ? p
          : { id, label: providers[id].label, available: false, detail: 'Verificando…', source: '', checkedAt: null, models: [] };
      })
    };
  }

  /** Aguarda a descoberta em andamento (se houver) e devolve o catálogo. */
  async function whenReady() {
    if (inflight) await inflight.catch(() => {});
    return snapshot();
  }

  function findModel(providerId, modelId) {
    const prov = state.providers[providerId];
    if (!prov) return { prov: null, model: null };
    return { prov, model: (prov.models || []).find((m) => m.id === modelId) || null };
  }

  /**
   * Situação de um provider/modelo antes de executar.
   * @returns {{ available: boolean, known: boolean, reason?: string, until?: number }}
   */
  function check(providerId, modelId) {
    expireMarks();
    const { prov, model } = findModel(providerId, modelId);
    if (!prov) return { available: true, known: false };
    if (!prov.available) return { available: false, known: true, reason: prov.detail || 'Provider indisponível' };
    if (!model) return { available: true, known: false, unverified: prov.exhaustive === false };
    return model.available
      ? { available: true, known: true }
      : { available: false, known: true, reason: model.reason, until: model.until };
  }

  /** Registra o resultado de uma falha real de execução. Retorna a classificação aplicada (ou null). */
  function markFromError(providerId, modelId, message) {
    const cls = classifyError(message);
    if (!cls) return null;
    const { prov, model } = findModel(providerId, modelId);
    if (!prov) return cls;
    if (cls.scope === 'provider') {
      prov.available = false;
      prov.detail = `${cls.reason}: ${String(message).slice(0, 200)}`;
    } else if (model) {
      Object.assign(model, { available: false, kind: cls.kind, reason: cls.reason });
      if (cls.until) model.until = cls.until;
      else delete model.until;
    }
    persist();
    return cls;
  }

  /** Execução bem-sucedida: garante o modelo como disponível (e aprende modelos digitados à mão). */
  function markSuccess(providerId, modelId) {
    const prov = state.providers[providerId];
    if (!prov || !modelId) return;
    let changed = false;
    if (!prov.available) {
      prov.available = true;
      changed = true;
    }
    const model = (prov.models || []).find((m) => m.id === modelId);
    if (!model) {
      prov.models = [...(prov.models || []), { id: modelId, label: modelId, available: true, manual: true }];
      changed = true;
    } else if (!model.available) {
      model.available = true;
      delete model.reason;
      delete model.kind;
      delete model.until;
      changed = true;
    }
    if (changed) persist();
  }

  return { refresh, whenReady, snapshot, check, markFromError, markSuccess };
}

module.exports = { createModelCatalog, classifyError, parseResetMs };
