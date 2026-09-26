const claudeCli = require('./claude-cli.js');
const agyCli = require('./agy-cli.js');
const openai = require('./openai.js');

const providers = {
  'claude-cli': claudeCli,
  'agy-cli': agyCli,
  openai: openai
};

/**
 * Retorna uma instância de provider pelo identificador.
 * @param {string} id Identificador do provider ('claude-cli' | 'agy-cli' | 'openai')
 * @returns {object} Provider correspondente
 */
function getProvider(id) {
  const provider = providers[id];
  if (!provider) {
    throw new Error(`Provider desconhecido: ${id}`);
  }
  return provider;
}

/**
 * Executa a checagem de status de todos os providers em paralelo sem nunca rejeitar.
 * @param {object} env Objeto de variáveis de ambiente (.env)
 * @returns {Promise<Array<{ id: string, label: string, available: boolean, detail: string, models: string[] }>>}
 */
async function statusAll(env) {
  const providerList = Object.values(providers);

  const results = await Promise.all(
    providerList.map(async (provider) => {
      try {
        const s = await provider.status(env);
        return {
          id: provider.id,
          label: provider.label,
          available: Boolean(s.available),
          detail: s.detail || '',
          models: Array.isArray(s.models) ? s.models : []
        };
      } catch (err) {
        return {
          id: provider.id,
          label: provider.label,
          available: false,
          detail: err?.message || 'Erro ao verificar status',
          models: []
        };
      }
    })
  );

  return results;
}

module.exports = {
  providers,
  getProvider,
  statusAll
};
