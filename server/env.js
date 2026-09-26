const fs = require('fs');

/**
 * Faz o parse de variáveis de ambiente no formato KEY=VALUE.
 * Ignora comentários (#) e linhas vazias, aceita aspas "..." / '...', e prefixo opcional `export `.
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseEnv(text) {
  if (typeof text !== 'string') return {};
  const result = {};
  const lines = text.split(/\r?\n/);

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('export ')) {
      line = line.slice(7).trim();
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!key || key.startsWith('#')) continue;

    let val = line.slice(eqIndex + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)) {
      const quote = val[0];
      val = val.slice(1, -1);
      if (quote === '"') {
        val = val
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
    } else {
      const commentIndex = val.search(/\s+#/);
      if (commentIndex !== -1) {
        val = val.slice(0, commentIndex).trim();
      }
    }

    result[key] = val;
  }

  return result;
}

/**
 * Lê cada arquivo existente da lista (ignora ausentes), mescla na ordem e retorna o objeto.
 * NÃO altera process.env.
 * @param {string[]} filePaths
 * @returns {Record<string, string>}
 */
function loadEnv(filePaths) {
  const result = {};
  if (!Array.isArray(filePaths)) return result;

  for (const fp of filePaths) {
    if (!fp || typeof fp !== 'string') continue;
    try {
      if (fs.existsSync(fp)) {
        const content = fs.readFileSync(fp, 'utf8');
        const parsed = parseEnv(content);
        Object.assign(result, parsed);
      }
    } catch {
      // Ignora arquivos que não puderem ser lidos
    }
  }

  return result;
}

/**
 * Converte string separada por vírgulas em array de strings limpos.
 * Ex.: "a, b,c" -> ["a","b","c"]
 * @param {string} value
 * @param {string[]} [fallback=[]]
 * @returns {string[]}
 */
function list(value, fallback = []) {
  if (typeof value !== 'string') {
    return Array.isArray(fallback) ? [...fallback] : [];
  }
  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : (Array.isArray(fallback) ? [...fallback] : []);
}

module.exports = {
  parseEnv,
  loadEnv,
  list
};
