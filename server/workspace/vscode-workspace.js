const path = require('path');
const os = require('os');
const fs = require('fs');
const { IGNORED_DIRS, resolveInside, toRel, searchInFiles, runGit } = require('./common.js');

/**
 * Cria a implementação da interface Workspace para o ambiente VS Code.
 * @param {typeof import('vscode')} vscode
 */
function createVsCodeWorkspace(vscode) {
  let lastActiveTextEditor = null;

  // Só rastreia arquivos de disco que pertencem a uma pasta do workspace
  // (ignora o webview, painéis de output e os arquivos temporários de diff)
  const isProjectEditor = (editor) =>
    Boolean(
      editor &&
      editor.document &&
      editor.document.uri &&
      editor.document.uri.scheme === 'file' &&
      vscode.workspace.getWorkspaceFolder(editor.document.uri)
    );

  if (isProjectEditor(vscode.window.activeTextEditor)) {
    lastActiveTextEditor = vscode.window.activeTextEditor;
  }

  const subscriptions = [];

  subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (isProjectEditor(editor)) {
        lastActiveTextEditor = editor;
      }
    })
  );

  subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (isProjectEditor(event.textEditor)) {
        lastActiveTextEditor = event.textEditor;
      }
    })
  );

  function dispose() {
    while (subscriptions.length > 0) {
      const sub = subscriptions.pop();
      if (sub && typeof sub.dispose === 'function') {
        try {
          sub.dispose();
        } catch {
          // ignora erros de descarte
        }
      }
    }
  }

  function getProjectFolder(projectId) {
    const folders = vscode.workspace.workspaceFolders || [];
    const idx = Number(projectId);
    if (isNaN(idx) || idx < 0 || idx >= folders.length) {
      throw new Error(`Projeto com id "${projectId}" não encontrado`);
    }
    return folders[idx];
  }

  async function listProjects() {
    const folders = vscode.workspace.workspaceFolders || [];
    return folders.map((folder, index) => ({
      id: String(index),
      name: folder.name,
      path: folder.uri.fsPath
    }));
  }

  async function listFiles(projectId, { query = '', max = 3000 } = {}) {
    const folder = getProjectFolder(projectId);
    const pattern = new vscode.RelativePattern(folder, '**/*');
    const exclude = '**/{' + IGNORED_DIRS.join(',') + '}/**';
    const uris = await vscode.workspace.findFiles(pattern, exclude, max);

    let files = uris.map(u => toRel(folder.uri.fsPath, u.fsPath));

    if (query && typeof query === 'string') {
      const q = query.toLowerCase();
      files = files.filter(f => f.toLowerCase().includes(q));
    }

    files.sort((a, b) => a.localeCompare(b));
    if (files.length > max) {
      files = files.slice(0, max);
    }
    return files;
  }

  async function readFile(projectId, relPath) {
    const folder = getProjectFolder(projectId);
    const absPath = resolveInside(folder.uri.fsPath, relPath);
    const MAX_BYTES = 200 * 1024;

    // Se houver TextDocument aberto para o arquivo, usar getText() (inclui alterações não salvas)
    const normalizedAbs = path.resolve(absPath);
    const openDoc = (vscode.workspace.textDocuments || []).find(doc => {
      return (
        doc.uri &&
        doc.uri.scheme === 'file' &&
        path.resolve(doc.uri.fsPath) === normalizedAbs
      );
    });

    if (openDoc) {
      const fullText = openDoc.getText();
      const buf = Buffer.from(fullText, 'utf8');
      if (buf.length > MAX_BYTES) {
        return {
          path: relPath,
          content: buf.subarray(0, MAX_BYTES).toString('utf8'),
          truncated: true
        };
      }
      return {
        path: relPath,
        content: fullText,
        truncated: false
      };
    }

    // Senão vscode.workspace.fs.readFile
    const fileBytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absPath));
    if (fileBytes.byteLength > MAX_BYTES) {
      const sliced = Buffer.from(fileBytes.buffer, fileBytes.byteOffset, MAX_BYTES);
      return {
        path: relPath,
        content: sliced.toString('utf8'),
        truncated: true
      };
    }
    const content = Buffer.from(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength).toString('utf8');
    return {
      path: relPath,
      content,
      truncated: false
    };
  }

  async function writeFile(projectId, relPath, content) {
    const folder = getProjectFolder(projectId);
    const absPath = resolveInside(folder.uri.fsPath, relPath);
    const dirUri = vscode.Uri.file(path.dirname(absPath));
    await vscode.workspace.fs.createDirectory(dirUri);

    const fileUri = vscode.Uri.file(absPath);
    const data = Buffer.from(content, 'utf8');
    await vscode.workspace.fs.writeFile(fileUri, data);

    try {
      await vscode.window.showTextDocument(fileUri, { preview: true, preserveFocus: true });
    } catch {
      // ignora falhas ao abrir preview
    }

    return { path: relPath };
  }

  async function searchText(projectId, query, { max = 100 } = {}) {
    const folder = getProjectFolder(projectId);
    const files = await listFiles(projectId, { max: 3000 });
    return await searchInFiles(folder.uri.fsPath, files, query, { max });
  }

  async function getActiveEditor() {
    if (!lastActiveTextEditor || !lastActiveTextEditor.document) {
      return null;
    }
    const doc = lastActiveTextEditor.document;
    if (doc.isClosed || !doc.uri || doc.uri.scheme !== 'file') {
      return null;
    }

    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!folder) {
      return null;
    }

    const projectId = String(folder.index);
    const relPath = toRel(folder.uri.fsPath, doc.uri.fsPath);
    const languageId = doc.languageId;

    let content = doc.getText();
    const MAX_BYTES = 200 * 1024;
    const buf = Buffer.from(content, 'utf8');
    if (buf.length > MAX_BYTES) {
      content = buf.subarray(0, MAX_BYTES).toString('utf8');
    }

    let selection = null;
    if (lastActiveTextEditor.selection && !lastActiveTextEditor.selection.isEmpty) {
      const sel = lastActiveTextEditor.selection;
      selection = {
        text: doc.getText(sel),
        startLine: sel.start.line + 1,
        endLine: sel.end.line + 1
      };
    }

    return {
      projectId,
      path: relPath,
      languageId,
      content,
      selection
    };
  }

  async function getDiagnostics(projectId) {
    const folder = getProjectFolder(projectId);
    const rootPath = folder.uri.fsPath;
    const allDiagnostics = vscode.languages.getDiagnostics();
    const results = [];

    for (const [uri, diags] of allDiagnostics) {
      if (!uri || uri.scheme !== 'file') continue;
      const filePath = uri.fsPath;
      try {
        const rel = toRel(rootPath, filePath);
        const resolved = resolveInside(rootPath, rel);
        if (path.resolve(resolved) !== path.resolve(filePath)) continue;

        for (const diag of diags) {
          let severity = 'info';
          if (diag.severity === 0) {
            severity = 'error';
          } else if (diag.severity === 1) {
            severity = 'warning';
          } else {
            severity = 'info';
          }

          results.push({
            path: rel,
            line: (diag.range && diag.range.start ? diag.range.start.line : 0) + 1,
            severity,
            message: diag.message || '',
            source: diag.source || ''
          });
        }
      } catch {
        // Arquivo fora da pasta do projeto
        continue;
      }
    }

    return results;
  }

  async function getOpenFiles(projectId) {
    const folder = getProjectFolder(projectId);
    const rootPath = folder.uri.fsPath;
    const openSet = new Set();

    const tabGroups = (vscode.window.tabGroups && vscode.window.tabGroups.all) ? vscode.window.tabGroups.all : [];
    for (const group of tabGroups) {
      for (const tab of group.tabs || []) {
        if (
          tab.input &&
          vscode.TabInputText &&
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri &&
          tab.input.uri.scheme === 'file'
        ) {
          try {
            const rel = toRel(rootPath, tab.input.uri.fsPath);
            const resolved = resolveInside(rootPath, rel);
            if (path.resolve(resolved) === path.resolve(tab.input.uri.fsPath)) {
              openSet.add(rel);
            }
          } catch {
            // Arquivo não pertence a esta pasta do projeto
          }
        }
      }
    }

    return Array.from(openSet);
  }

  async function gitDiff(projectId, { staged = false } = {}) {
    const folder = getProjectFolder(projectId);
    const args = staged ? ['diff', '--cached'] : ['diff'];
    return await runGit(folder.uri.fsPath, args);
  }

  async function gitStatus(projectId) {
    const folder = getProjectFolder(projectId);
    return await runGit(folder.uri.fsPath, ['status', '--short', '--branch']);
  }

  async function openFile(projectId, relPath, line) {
    try {
      const folder = getProjectFolder(projectId);
      const absPath = resolveInside(folder.uri.fsPath, relPath);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
      let selection;
      if (line !== undefined && line !== null && !isNaN(Number(line))) {
        const lineIndex = Math.max(0, Number(line) - 1);
        const pos = new vscode.Position(lineIndex, 0);
        selection = new vscode.Range(pos, pos);
      }
      const editor = await vscode.window.showTextDocument(doc, {
        preserveFocus: false,
        viewColumn: vscode.ViewColumn.One,
        selection
      });
      if (selection) {
        editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
      }
      return true;
    } catch {
      return false;
    }
  }

  async function showDiff(projectId, relPath, newContent) {
    try {
      const folder = getProjectFolder(projectId);
      const absPath = resolveInside(folder.uri.fsPath, relPath);
      const fileName = path.basename(absPath);
      const tempDir = path.join(os.tmpdir(), 'bmad-studio-diff');
      await fs.promises.mkdir(tempDir, { recursive: true });

      const tempFilePath = path.join(tempDir, fileName);
      await fs.promises.writeFile(tempFilePath, newContent, 'utf8');

      // Arquivo novo proposto pelo agente: compara contra um original vazio
      let originalUri = vscode.Uri.file(absPath);
      if (!fs.existsSync(absPath)) {
        const emptyPath = path.join(tempDir, `(novo) ${fileName}`);
        await fs.promises.writeFile(emptyPath, '', 'utf8');
        originalUri = vscode.Uri.file(emptyPath);
      }
      const tempUri = vscode.Uri.file(tempFilePath);
      const title = `${fileName} ↔ proposta do agente`;

      await vscode.commands.executeCommand('vscode.diff', originalUri, tempUri, title);
      return true;
    } catch {
      return false;
    }
  }

  async function insertAtCursor(text) {
    try {
      if (!lastActiveTextEditor || !lastActiveTextEditor.document) {
        return false;
      }
      const editor = await vscode.window.showTextDocument(
        lastActiveTextEditor.document,
        lastActiveTextEditor.viewColumn || vscode.ViewColumn.One
      );
      const success = await editor.edit(editBuilder => {
        editBuilder.replace(editor.selection, text);
      });
      return Boolean(success);
    } catch {
      return false;
    }
  }

  return {
    mode: 'vscode',
    listProjects,
    listFiles,
    readFile,
    writeFile,
    searchText,
    getActiveEditor,
    getDiagnostics,
    getOpenFiles,
    gitDiff,
    gitStatus,
    openFile,
    showDiff,
    insertAtCursor,
    dispose
  };
}

module.exports = { createVsCodeWorkspace };
