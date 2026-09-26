/**
 * Constrói o contexto a partir de dados do workspace para anexar aos prompts do modelo.
 * Formata os blocos no padrão <contexto tipo="..." caminho="...">...</contexto>.
 *
 * @param {object} workspace
 * @param {string} projectId
 * @param {object} request
 * @param {boolean} [request.activeFile]
 * @param {boolean} [request.selection]
 * @param {boolean} [request.diagnostics]
 * @param {boolean} [request.openFiles]
 * @param {boolean} [request.gitDiff]
 * @param {boolean} [request.gitStatus]
 * @param {string[]} [request.files]
 * @returns {Promise<{ text: string, labels: string[] }>}
 */
async function buildContext(workspace, projectId, request = {}) {
  const blocks = [];
  const labels = [];

  let activeEditor = null;
  if (request.activeFile || request.selection) {
    try {
      activeEditor = await workspace.getActiveEditor();
    } catch {
      activeEditor = null;
    }
  }

  // 1. Arquivo ativo
  if (request.activeFile && activeEditor && activeEditor.path) {
    let content = activeEditor.content;
    if (content === undefined || content === null) {
      try {
        const fileRes = await workspace.readFile(projectId, activeEditor.path);
        content = fileRes.content;
      } catch {
        content = null;
      }
    }

    if (content !== null && content !== undefined) {
      blocks.push(`<contexto tipo="arquivo_ativo" caminho="${activeEditor.path}">\n${content}\n</contexto>`);
      labels.push(`arquivo ativo ${activeEditor.path}`);
    }
  }

  // 2. Seleção
  if (request.selection && activeEditor && activeEditor.selection && activeEditor.selection.text && activeEditor.selection.text.trim()) {
    const sel = activeEditor.selection;
    let lines = '';
    if (sel.startLine && sel.endLine) {
      lines = `:${sel.startLine}-${sel.endLine}`;
    } else if (sel.startLine) {
      lines = `:${sel.startLine}`;
    }
    const pathWithLines = `${activeEditor.path || ''}${lines}`;
    blocks.push(`<contexto tipo="selecao" caminho="${pathWithLines}">\n${sel.text}\n</contexto>`);
    labels.push(`seleção ${pathWithLines}`);
  }

  // 3. Diagnósticos / Problemas
  if (request.diagnostics) {
    try {
      const diags = await workspace.getDiagnostics(projectId);
      if (Array.isArray(diags) && diags.length > 0) {
        const limited = diags.slice(0, 200);
        const text = limited.map(d => `${d.path}:${d.line || 1} [${d.severity || 'info'}] ${d.message}${d.source ? ` (${d.source})` : ''}`).join('\n');
        blocks.push(`<contexto tipo="problemas">\n${text}\n</contexto>`);
        labels.push(`problemas (${limited.length})`);
      }
    } catch {
      // Ignora erro ao obter diagnósticos
    }
  }

  // 4. Abas abertas
  if (request.openFiles) {
    try {
      const openFiles = await workspace.getOpenFiles(projectId);
      if (Array.isArray(openFiles) && openFiles.length > 0) {
        blocks.push(`<contexto tipo="abas_abertas">\n${openFiles.join('\n')}\n</contexto>`);
        labels.push(`abas abertas (${openFiles.length})`);
      }
    } catch {
      // Ignora erro ao obter abas abertas
    }
  }

  // 5. Git Diff
  if (request.gitDiff) {
    try {
      const diff = await workspace.gitDiff(projectId, { staged: false });
      if (diff && diff.trim()) {
        blocks.push(`<contexto tipo="git_diff">\n${diff.trim()}\n</contexto>`);
        labels.push('git diff');
      }
    } catch {
      // Ignora erro no git diff
    }
  }

  // 6. Git Status
  if (request.gitStatus) {
    try {
      const status = await workspace.gitStatus(projectId);
      if (status && status.trim()) {
        blocks.push(`<contexto tipo="git_status">\n${status.trim()}\n</contexto>`);
        labels.push('git status');
      }
    } catch {
      // Ignora erro no git status
    }
  }

  // 7. Arquivos anexados
  if (Array.isArray(request.files)) {
    for (const relPath of request.files) {
      if (!relPath || typeof relPath !== 'string') continue;
      try {
        const res = await workspace.readFile(projectId, relPath);
        if (res && res.content !== undefined) {
          const filePath = res.path || relPath;
          blocks.push(`<contexto tipo="arquivo" caminho="${filePath}">\n${res.content}\n</contexto>`);
          labels.push(filePath);
        }
      } catch {
        // Ignora arquivo que falhar ao ler
      }
    }
  }

  let fullText = blocks.join('\n\n');
  const MAX_CONTEXT_LENGTH = 120000;
  if (fullText.length > MAX_CONTEXT_LENGTH) {
    fullText = fullText.slice(0, MAX_CONTEXT_LENGTH) + '\n\n[... truncado]';
  }

  return {
    text: fullText,
    labels
  };
}

module.exports = {
  buildContext
};
