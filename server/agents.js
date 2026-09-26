const fs = require('fs');
const path = require('path');

/**
 * Faz o parse simples de frontmatter (---\n ... \n---) e corpo de arquivo markdown.
 * Converte 'true'/'false' em booleanos e dígitos em números.
 * @param {string} text
 * @returns {{ data: Record<string, any>, body: string }}
 */
function parseFrontmatter(text) {
  if (typeof text !== 'string') {
    return { data: {}, body: '' };
  }

  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: text.trim() };
  }

  const rawYaml = match[1];
  const body = match[2].trim();
  const data = {};

  const lines = rawYaml.split(/\r?\n/);
  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let val = line.slice(colonIndex + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)) {
      val = val.slice(1, -1);
    } else {
      const commentIndex = val.search(/\s+#/);
      if (commentIndex !== -1) {
        val = val.slice(0, commentIndex).trim();
      }
    }

    if (val === 'true') {
      data[key] = true;
    } else if (val === 'false') {
      data[key] = false;
    } else if (val === 'null') {
      data[key] = null;
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      data[key] = Number(val);
    } else {
      data[key] = val;
    }
  }

  return { data, body };
}

/**
 * Lê os arquivos .md do diretório e retorna lista de agentes ordenada pelo campo `order`.
 * @param {string} dir
 * @returns {Array<object>}
 */
function loadAgents(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }

  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const agents = [];
  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    try {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const { data, body } = parseFrontmatter(content);
      const id = data.id || path.basename(file, '.md');

      agents.push({
        id,
        ...data,
        persona: body
      });
    } catch {
      // Ignora arquivos com erro de leitura
    }
  }

  agents.sort((a, b) => {
    const orderA = typeof a.order === 'number' ? a.order : 999;
    const orderB = typeof b.order === 'number' ? b.order : 999;
    return orderA - orderB;
  });

  return agents;
}

module.exports = {
  loadAgents,
  parseFrontmatter
};
