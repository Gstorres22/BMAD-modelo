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

// A descoberta de modelos/disponibilidade de cada provider (`listModels`) é orquestrada
// pelo catálogo em server/models.js.
module.exports = {
  providers,
  getProvider
};
