const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const resolveCache = new Map();

/**
 * Normaliza e localiza um executável no sistema operacional.
 * @param {string} cmd Nome do comando ou caminho absoluto
 * @returns {string|null} Caminho completo do executável ou null se não encontrado
 */
function resolveCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') {
    return null;
  }

  if (resolveCache.has(cmd)) {
    return resolveCache.get(cmd);
  }

  const isWin = process.platform === 'win32';
  const pathext = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((e) => e.trim())
    .filter(Boolean);

  const checkFile = (filePath) => {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return false;
      if (!isWin) {
        fs.accessSync(filePath, fs.constants.X_OK);
      }
      return true;
    } catch {
      return false;
    }
  };

  // Se for caminho absoluto
  if (path.isAbsolute(cmd)) {
    if (checkFile(cmd)) {
      resolveCache.set(cmd, cmd);
      return cmd;
    }

    if (isWin) {
      for (const ext of pathext) {
        const withExt = cmd + ext;
        if (checkFile(withExt)) {
          resolveCache.set(cmd, withExt);
          return withExt;
        }
      }
    }

    resolveCache.set(cmd, null);
    return null;
  }

  // Busca nos diretórios do PATH
  const pathDirs = (process.env.PATH || '')
    .split(path.delimiter)
    .map((d) => d.trim())
    .filter(Boolean);

  for (const dir of pathDirs) {
    const directPath = path.join(dir, cmd);
    if (checkFile(directPath)) {
      resolveCache.set(cmd, directPath);
      return directPath;
    }

    if (isWin) {
      for (const ext of pathext) {
        const withExt = path.join(dir, cmd + ext);
        if (checkFile(withExt)) {
          resolveCache.set(cmd, withExt);
          return withExt;
        }
      }
    }
  }

  resolveCache.set(cmd, null);
  return null;
}

/**
 * Envolve um argumento em aspas duplas escapando aspas internas para execução no cmd/batch.
 * @param {string|any} arg
 * @returns {string}
 */
function quoteWinArg(arg) {
  const s = String(arg ?? '');
  return `"${s.replace(/"/g, '\\"')}"`;
}

/**
 * Encerra a árvore de processos de forma forçada.
 * @param {import('child_process').ChildProcess} child
 */
function killTree(child) {
  if (!child || !child.pid) return;

  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  } catch {
    try {
      child.kill();
    } catch {}
  }
}

/**
 * Spawna um processo controlando stdin, stdout por linhas, stderr e sinal de cancelamento.
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} opts
 * @returns {Promise<{ code: number, stderr: string }>}
 */
function spawnProcess(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const resolved = resolveCommand(cmd);
    if (!resolved) {
      const hint = opts.envVarName ? ` Ajuste ${opts.envVarName} no .env` : '';
      return reject(new Error(`Comando "${cmd}" não encontrado no PATH.${hint}`));
    }

    if (opts.signal?.aborted) {
      return reject(new Error('Cancelado pelo usuário'));
    }

    const ext = path.extname(resolved).toLowerCase();
    const isBatch = process.platform === 'win32' && (ext === '.cmd' || ext === '.bat');

    const spawnArgs = isBatch ? args.map(quoteWinArg) : args;
    // Valores vazios não sobrescrevem variáveis já existentes no sistema
    const extraEnv = Object.fromEntries(
      Object.entries(opts.env || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const spawnOpts = {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...extraEnv },
      windowsHide: true,
      shell: isBatch,
      stdio: ['pipe', 'pipe', 'pipe']
    };

    let child;
    try {
      child = spawn(resolved, spawnArgs, spawnOpts);
    } catch (err) {
      return reject(err);
    }

    let aborted = false;
    let abortListener = null;

    const cleanup = () => {
      if (opts.signal && abortListener) {
        opts.signal.removeEventListener('abort', abortListener);
        abortListener = null;
      }
    };

    if (opts.signal) {
      abortListener = () => {
        aborted = true;
        killTree(child);
        cleanup();
        reject(new Error('Cancelado pelo usuário'));
      };
      opts.signal.addEventListener('abort', abortListener, { once: true });
    }

    child.stdin.on('error', () => {});

    if (opts.stdinText != null) {
      child.stdin.write(opts.stdinText, 'utf8');
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    let stdoutRemainder = '';
    child.stdout.on('data', (chunk) => {
      stdoutRemainder += chunk.toString('utf8');
      const lines = stdoutRemainder.split('\n');
      stdoutRemainder = lines.pop();
      for (const line of lines) {
        if (opts.onStdoutLine) {
          opts.onStdoutLine(line.replace(/\r$/, ''));
        }
      }
    });

    let stderrAcc = '';
    child.stderr.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      stderrAcc += str;
      if (opts.onStderr) {
        opts.onStderr(str);
      }
    });

    child.on('error', (err) => {
      cleanup();
      if (aborted) return;
      reject(err);
    });

    child.on('close', (code) => {
      cleanup();
      if (aborted) return;

      if (stdoutRemainder && opts.onStdoutLine) {
        opts.onStdoutLine(stdoutRemainder.replace(/\r$/, ''));
        stdoutRemainder = '';
      }

      resolve({
        code: code ?? 0,
        stderr: stderrAcc
      });
    });
  });
}

/**
 * Executa um comando curto e captura stdout/stderr completos, com timeout.
 * Nunca rejeita por código de saída != 0 (quem chama decide); rejeita se o comando
 * não existir ou estourar o timeout.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: object, timeoutMs?: number, envVarName?: string }} [opts]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
async function runCommand(cmd, args = [], opts = {}) {
  const ac = new AbortController();
  const timeoutMs = opts.timeoutMs || 30000;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ac.abort(); }, timeoutMs);
  const out = [];
  try {
    const res = await spawnProcess(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      signal: ac.signal,
      envVarName: opts.envVarName,
      onStdoutLine: (line) => out.push(line)
    });
    return { code: res.code, stdout: out.join('\n'), stderr: res.stderr };
  } catch (err) {
    if (timedOut) throw new Error(`"${cmd} ${args.join(' ')}" não respondeu em ${Math.round(timeoutMs / 1000)} s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  resolveCommand,
  quoteWinArg,
  killTree,
  spawnProcess,
  runCommand
};
