const fs = require('fs');
const path = require('path');
const os = require('os');
const common = require('./common.js');

/**
 * Cria uma instância de workspace baseada em sistema de arquivos local.
 * @param {object} options
 * @param {string[]} options.projects - Lista de caminhos absolutos dos projetos
 */
function createFsWorkspace(options = {}) {
  const rawProjects = Array.isArray(options.projects) && options.projects.length > 0
    ? options.projects
    : [process.cwd()];

  const projects = rawProjects.map(p => path.resolve(p));

  function getProjectPath(projectId) {
    const idx = parseInt(projectId, 10);
    if (isNaN(idx) || idx < 0 || idx >= projects.length) {
      throw new Error(`Projeto inválido ou não encontrado: ${projectId}`);
    }
    return projects[idx];
  }

  return {
    mode: 'fs',

    async listProjects() {
      return projects.map((projPath, idx) => ({
        id: String(idx),
        name: path.basename(projPath) || projPath,
        path: projPath
      }));
    },

    async listFiles(projectId, opts = {}) {
      const root = getProjectPath(projectId);
      const max = typeof opts.max === 'number' ? opts.max : 3000;
      return await common.walkFiles(root, { query: opts.query, max });
    },

    async readFile(projectId, relPath) {
      const root = getProjectPath(projectId);
      const abs = common.resolveInside(root, relPath);
      const stat = await fs.promises.stat(abs);
      const MAX_SIZE = 200 * 1024;
      const truncated = stat.size > MAX_SIZE;

      let content = '';
      if (stat.size <= MAX_SIZE) {
        content = await fs.promises.readFile(abs, 'utf8');
      } else {
        const handle = await fs.promises.open(abs, 'r');
        try {
          const buffer = Buffer.alloc(MAX_SIZE);
          const { bytesRead } = await handle.read(buffer, 0, MAX_SIZE, 0);
          content = buffer.toString('utf8', 0, bytesRead);
        } finally {
          await handle.close();
        }
      }

      return {
        path: common.toRel(root, abs),
        content,
        truncated
      };
    },

    async writeFile(projectId, relPath, content) {
      const root = getProjectPath(projectId);
      const abs = common.resolveInside(root, relPath);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, content !== undefined ? String(content) : '', 'utf8');
      return {
        path: common.toRel(root, abs)
      };
    },

    async searchText(projectId, query, opts = {}) {
      if (!query) return [];
      const root = getProjectPath(projectId);
      const max = typeof opts.max === 'number' ? opts.max : 100;
      const files = await common.walkFiles(root, { max: 5000 });
      return await common.searchInFiles(root, files, query, { max });
    },

    async getActiveEditor() {
      return null;
    },

    async getDiagnostics() {
      return [];
    },

    async getOpenFiles() {
      return [];
    },

    async gitDiff(projectId, opts = {}) {
      const root = getProjectPath(projectId);
      if (opts.staged) {
        return await common.runGit(root, ['diff', '--cached']);
      }

      let diff = await common.runGit(root, ['diff']);
      const untracked = await common.runGit(root, ['ls-files', '--others', '--exclude-standard']);

      if (untracked && untracked.trim()) {
        const untrackedSection = '### Arquivos novos não rastreados\n' + untracked.trim();
        diff = diff && diff.trim() ? diff.trim() + '\n\n' + untrackedSection : untrackedSection;
      }

      return diff || '';
    },

    async gitStatus(projectId) {
      const root = getProjectPath(projectId);
      return await common.runGit(root, ['status']);
    },

    async openFile(projectId, relPath, line) {
      let spawnModule;
      try {
        spawnModule = require('../providers/spawn.js');
      } catch {
        return false;
      }

      const { resolveCommand, spawnProcess } = spawnModule;
      const codeCmd = resolveCommand ? resolveCommand('code') : null;
      if (!codeCmd) return false;

      const root = getProjectPath(projectId);
      const abs = common.resolveInside(root, relPath);
      const target = line ? `${abs}:${line}` : abs;
      const args = ['-g', target];

      // Dispara o processo sem aguardar seu encerramento
      if (typeof spawnProcess === 'function') {
        spawnProcess(codeCmd, args, { cwd: root }).catch(() => {});
      }
      return true;
    },

    async showDiff(projectId, relPath, newContent) {
      let spawnModule;
      try {
        spawnModule = require('../providers/spawn.js');
      } catch {
        return false;
      }

      const { resolveCommand, spawnProcess } = spawnModule;
      const codeCmd = resolveCommand ? resolveCommand('code') : null;
      if (!codeCmd) return false;

      const root = getProjectPath(projectId);
      const abs = common.resolveInside(root, relPath);
      const diffDir = path.join(os.tmpdir(), 'bmad-studio-diff');
      await fs.promises.mkdir(diffDir, { recursive: true });

      const safeBase = path.basename(relPath).replace(/[^a-zA-Z0-9._-]/g, '_');
      const tmpFile = path.join(diffDir, `${Date.now()}-${safeBase}`);
      await fs.promises.writeFile(tmpFile, newContent || '', 'utf8');

      if (typeof spawnProcess === 'function') {
        spawnProcess(codeCmd, ['--diff', abs, tmpFile], { cwd: root }).catch(() => {});
      }
      return true;
    },

    async insertAtCursor() {
      return false;
    }
  };
}

module.exports = {
  createFsWorkspace
};
