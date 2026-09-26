const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.bmad-studio',
  '.idea',
  '.turbo',
  'target',
  'bin',
  'obj'
];

/**
 * Resolve o caminho absoluto dentro da raiz. Lança erro se tentar escapar do diretório raiz.
 * @param {string} root
 * @param {string} relPath
 * @returns {string}
 */
function resolveInside(root, relPath) {
  const absRoot = path.resolve(root);
  const absTarget = path.resolve(absRoot, relPath || '');
  const relative = path.relative(absRoot, absTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Caminho fora do projeto');
  }

  return absTarget;
}

/**
 * Converte um caminho absoluto para relativo à raiz, utilizando separador '/'.
 * @param {string} root
 * @param {string} absPath
 * @returns {string}
 */
function toRel(root, absPath) {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absPath);
  const rel = path.relative(absRoot, abs);
  return rel.split(path.sep).join('/');
}

/**
 * Verifica se um buffer contém bytes nulos (byte 0) nos primeiros 8 KB.
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isBinary(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  const len = Math.min(buffer.length, 8192);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Percorre recursivamente o diretório raiz, ignorando diretórios de IGNORED_DIRS e arquivos > 2 MB.
 * @param {string} root
 * @param {object} [opts]
 * @param {string} [opts.query]
 * @param {number} [opts.max=3000]
 * @returns {Promise<string[]>}
 */
async function walkFiles(root, opts = {}) {
  const absRoot = path.resolve(root);
  const max = typeof opts.max === 'number' ? opts.max : 3000;
  const queryLower = opts.query ? String(opts.query).toLowerCase() : null;

  const results = [];
  const ignoredSet = new Set(IGNORED_DIRS);
  const queue = [absRoot];

  while (queue.length > 0 && results.length < max) {
    const currentDir = queue.shift();
    let entries;
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (results.length >= max) break;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!ignoredSet.has(entry.name)) {
          queue.push(fullPath);
        }
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(fullPath);
          // Ignora arquivos maiores que 2 MB
          if (stat.size > 2 * 1024 * 1024) continue;

          const rel = toRel(absRoot, fullPath);
          if (queryLower) {
            if (rel.toLowerCase().includes(queryLower)) {
              results.push(rel);
            }
          } else {
            results.push(rel);
          }
        } catch {
          continue;
        }
      }
    }
  }

  return results;
}

/**
 * Pesquisa termo literal case-insensitive dentro dos arquivos fornecidos.
 * @param {string} root
 * @param {string[]} files
 * @param {string} query
 * @param {object} [opts]
 * @param {number} [opts.max=100]
 * @returns {Promise<Array<{ path: string, line: number, text: string }>>}
 */
async function searchInFiles(root, files, query, opts = {}) {
  if (!query || typeof query !== 'string' || !Array.isArray(files) || files.length === 0) {
    return [];
  }

  const absRoot = path.resolve(root);
  const max = typeof opts.max === 'number' ? opts.max : 100;
  const queryLower = query.toLowerCase();
  const results = [];

  for (const relPath of files) {
    if (results.length >= max) break;

    let abs;
    try {
      abs = resolveInside(absRoot, relPath);
    } catch {
      continue;
    }

    let handle;
    try {
      handle = await fs.promises.open(abs, 'r');
      const headBuffer = Buffer.alloc(8192);
      const { bytesRead } = await handle.read(headBuffer, 0, 8192, 0);
      await handle.close();
      handle = null;

      if (isBinary(headBuffer.subarray(0, bytesRead))) {
        continue;
      }

      const content = await fs.promises.readFile(abs, 'utf8');
      const lines = content.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(queryLower)) {
          results.push({
            path: toRel(absRoot, abs),
            line: i + 1,
            text: line.slice(0, 300)
          });
          if (results.length >= max) break;
        }
      }
    } catch {
      if (handle) {
        try { await handle.close(); } catch {}
      }
      continue;
    }
  }

  return results;
}

/**
 * Executa comando do Git no diretório informado com buffer de 20 MB.
 * Retorna string com stdout ou string vazia em caso de erro.
 * @param {string} cwd
 * @param {string[]} args
 * @returns {Promise<string>}
 */
function runGit(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve('');
      } else {
        resolve(stdout ? stdout.toString() : '');
      }
    });
  });
}

module.exports = {
  IGNORED_DIRS,
  resolveInside,
  toRel,
  isBinary,
  walkFiles,
  searchInFiles,
  runGit
};
