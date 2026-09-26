const fs = require('fs');
const path = require('path');

/**
 * Resolve a raiz de recursos (agents/, workflows/, ui/, data/) e o arquivo .env.
 *
 * .env (prioridade):
 * 1. `override` explícito (config `bmadStudio.envFile`).
 * 2. Caminho gravado em `<extensionPath>/.env-location` (gerado por scripts/install.ps1).
 * 3. `<extensionPath>/.env`.
 *
 * Raiz: a primeira candidata que contém `ui/index.html` e `agents/`, na ordem
 * dirname(override) → dirname(.env-location) → extensionPath. Assim um .env guardado em
 * outra pasta não "leva junto" a raiz, e a instalação via vsix usa os agentes do repositório.
 *
 * @param {object} [opts]
 * @param {string} [opts.extensionPath]
 * @param {string} [opts.override]
 * @returns {{ root: string, envFile: string }}
 */
function resolveRoot(opts = {}) {
  const extensionPath = opts.extensionPath ? path.resolve(opts.extensionPath) : process.cwd();
  const overrideEnv = opts.override ? path.resolve(opts.override) : null;

  let locationEnv = null;
  const locationFile = path.join(extensionPath, '.env-location');
  if (fs.existsSync(locationFile)) {
    try {
      const loc = fs.readFileSync(locationFile, 'utf8').replace(/^﻿/, '').trim();
      if (loc) locationEnv = path.resolve(loc);
    } catch {
      // Falha ao ler .env-location: ignora
    }
  }

  const envFile = overrideEnv || locationEnv || path.join(extensionPath, '.env');

  const isResourceRoot = (dir) =>
    fs.existsSync(path.join(dir, 'ui', 'index.html')) && fs.existsSync(path.join(dir, 'agents'));

  const candidates = [overrideEnv, locationEnv]
    .filter(Boolean)
    .map((f) => path.dirname(f))
    .concat(extensionPath);
  const root = candidates.find(isResourceRoot) || extensionPath;

  return { root, envFile };
}

module.exports = {
  resolveRoot
};
