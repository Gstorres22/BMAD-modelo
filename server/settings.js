const fs = require('fs');
const path = require('path');

/**
 * Cria gerenciador de configurações de modelos/providers para os agentes.
 * Prioridade: valores salvos no arquivo > variáveis de ambiente específicas do agente >
 * frontmatter do agente (defaultProvider/defaultModel) > defaults globais (DEFAULT_PROVIDER/DEFAULT_MODEL).
 *
 * @param {object} options
 * @param {string} [options.file]
 * @param {Record<string, string>} [options.env]
 * @param {Array<object>} [options.agents]
 */
function createSettings({ file, env = {}, agents = [] } = {}) {
  let saved = { agents: {} };

  if (file && fs.existsSync(file)) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.agents === 'object' && parsed.agents !== null) {
        saved = parsed;
      }
    } catch {
      saved = { agents: {} };
    }
  }

  function getDefault(agentId) {
    const agent = Array.isArray(agents) ? agents.find(a => a.id === agentId) : null;
    const envPrefix = 'AGENT_' + String(agentId).toUpperCase().replace(/[-.]/g, '_');

    const provider = env[envPrefix + '_PROVIDER'] ||
                     (agent && (agent.defaultProvider || agent.provider)) ||
                     env.DEFAULT_PROVIDER ||
                     'agy-cli';

    const model = env[envPrefix + '_MODEL'] ||
                  (agent && (agent.defaultModel || agent.model)) ||
                  env.DEFAULT_MODEL ||
                  '';

    return { provider, model };
  }

  function get(agentId) {
    const defaults = getDefault(agentId);
    const custom = saved.agents && saved.agents[agentId];
    if (custom) {
      return {
        provider: custom.provider || defaults.provider,
        model: (custom.model !== undefined && custom.model !== null && custom.model !== '')
          ? custom.model
          : defaults.model
      };
    }
    return defaults;
  }

  function getAll() {
    const result = { agents: {} };
    const agentIds = new Set();

    if (Array.isArray(agents)) {
      for (const a of agents) {
        if (a && a.id) agentIds.add(a.id);
      }
    }

    if (saved.agents) {
      for (const id of Object.keys(saved.agents)) {
        agentIds.add(id);
      }
    }

    for (const id of agentIds) {
      result.agents[id] = get(id);
    }

    return result;
  }

  function set(agentId, { provider, model }) {
    if (!saved.agents) saved.agents = {};
    saved.agents[agentId] = { provider, model };

    if (file) {
      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(saved, null, 2), 'utf8');
    }
  }

  return {
    getAll,
    get,
    set
  };
}

module.exports = {
  createSettings
};
