const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./agents.js');

/**
 * Lê os arquivos .md do diretório e retorna lista de workflows.
 * Cada workflow possui { ...frontmatter, context: string[], template: string }.
 * @param {string} dir
 * @returns {Array<object>}
 */
function loadWorkflows(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }

  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const workflows = [];
  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    try {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const { data, body } = parseFrontmatter(content);
      const id = data.id || path.basename(file, '.md');

      let context = [];
      if (Array.isArray(data.context)) {
        context = data.context;
      } else if (typeof data.context === 'string') {
        context = data.context.split(',').map(s => s.trim()).filter(Boolean);
      }

      workflows.push({
        id,
        ...data,
        context,
        template: body
      });
    } catch {
      // Ignora arquivos corrompidos ou ilegíveis
    }
  }

  return workflows;
}

/**
 * Substitui todas as ocorrências de {{input}} no template do workflow pelo texto do usuário.
 * @param {object} wf
 * @param {string} input
 * @returns {string}
 */
function renderWorkflow(wf, input = '') {
  if (!wf || typeof wf.template !== 'string') {
    return input || '';
  }
  return wf.template.replace(/\{\{input\}\}/g, input !== undefined && input !== null ? String(input) : '');
}

module.exports = {
  loadWorkflows,
  renderWorkflow
};
