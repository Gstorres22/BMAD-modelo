/**
 * BMAD Studio — Servidor HTTP
 * 
 * Cria e gerencia o servidor HTTP local para servir a UI estática e a API.
 * Configura headers de segurança, validação de token, roteamento para /api/*,
 * tipos MIME e tratamento de portas em uso (EADDRINUSE).
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { loadAgents } = require('./agents.js');
const { loadWorkflows } = require('./workflows.js');
const { createSettings } = require('./settings.js');
const { createStore } = require('./store.js');
const { createOrchestrator } = require('./orchestrator.js');
const api = require('./api.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/**
 * Tenta inicializar o servidor HTTP na porta informada com retentativas em caso de EADDRINUSE
 */
function listenWithRetry(serverFactory, host, startPort, maxRetries = 20) {
  return new Promise((resolve, reject) => {
    let currentPort = startPort;
    let attempts = 0;

    function tryBind() {
      const server = serverFactory(currentPort);

      const onError = (err) => {
        server.removeListener('listening', onListening);
        server.close();
        if (err.code === 'EADDRINUSE' && attempts < maxRetries) {
          attempts++;
          currentPort++;
          tryBind();
        } else {
          reject(err);
        }
      };

      const onListening = () => {
        server.removeListener('error', onError);
        resolve({ server, port: currentPort });
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(currentPort, host);
    }

    tryBind();
  });
}

/**
 * Inicializa o servidor HTTP do BMAD Studio
 * @param {object} options
 * @param {string} options.root - Caminho raiz do BMAD Studio
 * @param {object} options.env - Variáveis de ambiente parseadas do .env
 * @param {object} options.workspace - Instância do workspace (fs ou vscode)
 * @param {string} [options.host] - Host para bind (padrão: 127.0.0.1)
 * @param {number|string} [options.port] - Porta para bind (padrão: 4747)
 * @param {string} [options.token] - Token de autenticação
 * @returns {Promise<{ url: string, port: number, token: string, close: () => Promise<void> }>}
 */
async function startServer({ root, env = {}, workspace, host, port, token }) {
  const agentsDir = path.join(root, 'agents');
  const workflowsDir = path.join(root, 'workflows');
  const settingsFile = path.join(root, 'data', 'settings.json');
  const uiDir = path.join(root, 'ui');

  const h = host || env.BMAD_STUDIO_HOST || '127.0.0.1';
  const startPort = Number(port || env.BMAD_STUDIO_PORT || 4747);
  const tok = token || env.BMAD_STUDIO_TOKEN || crypto.randomBytes(16).toString('hex');

  const ctx = {
    env,
    workspace,
    token: tok,
    agents: [],
    workflows: [],
    settings: null,
    store: null,
    orchestrator: null,
    uiDir,
    reload() {
      ctx.agents = loadAgents(agentsDir);
      ctx.workflows = loadWorkflows(workflowsDir);
    }
  };

  // Carrega agentes e workflows inicialmente
  ctx.reload();

  // Inicializa configurações e store
  ctx.settings = createSettings({ file: settingsFile, env, agents: ctx.agents });
  ctx.store = createStore(workspace);

  // Inicializa orquestrador recebendo o próprio ctx
  ctx.orchestrator = createOrchestrator(ctx);

  let actualPort = startPort;

  const createHandler = (boundPort) => async (req, res) => {
    // Cabeçalhos de segurança em todas as respostas (sem X-Frame-Options para permitir iframe no VS Code)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    let parsedUrl;
    try {
      const hostHeader = req.headers.host || `${h}:${boundPort}`;
      parsedUrl = new URL(req.url, `http://${hostHeader}`);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'URL inválida' }));
      return;
    }

    const pathname = parsedUrl.pathname;

    // Roteamento de API
    if (pathname.startsWith('/api')) {
      // Validação de Host
      const reqHost = (req.headers.host || '').toLowerCase();
      const validHosts = [
        `${h}:${boundPort}`.toLowerCase(),
        `localhost:${boundPort}`.toLowerCase()
      ];
      if (boundPort === 80) {
        validHosts.push(h.toLowerCase(), 'localhost');
      }

      if (!validHosts.includes(reqHost)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Acesso proibido: Host inválido' }));
        return;
      }

      // Validação de Token
      const headerToken = req.headers['x-bmad-token'];
      const queryToken = parsedUrl.searchParams.get('token');
      if (headerToken !== ctx.token && queryToken !== ctx.token) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Não autorizado: token inválido' }));
        return;
      }

      // Encaminha para o router da API
      await api.handle(req, res, ctx);
      return;
    }

    // Servir arquivos estáticos da UI
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Método não permitido');
      return;
    }

    let relFile = pathname === '/' ? 'index.html' : pathname;
    if (relFile.startsWith('/ui/')) {
      relFile = relFile.slice(4);
    } else if (relFile.startsWith('/')) {
      relFile = relFile.slice(1);
    }
    if (!relFile) relFile = 'index.html';

    const safePath = path.normalize(relFile).replace(/^(\.\.[\/\\])+/, '');
    const absUiDir = path.resolve(uiDir);
    const absPath = path.resolve(absUiDir, safePath);

    // Proteção contra path traversal
    if (!absPath.startsWith(absUiDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Acesso proibido');
      return;
    }

    fs.stat(absPath, (err, stats) => {
      // 404 se não existir ou se for diretório (não listar diretórios)
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Não encontrado');
        return;
      }

      const ext = path.extname(absPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const readStream = fs.createReadStream(absPath);
      readStream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end();
      });
      readStream.pipe(res);
    });
  };

  const { server, port: boundPort } = await listenWithRetry(
    (portNum) => http.createServer(createHandler(portNum)),
    h,
    startPort,
    20
  );

  actualPort = boundPort;

  const url = `http://${h}:${actualPort}/?token=${tok}`;
  const close = () => new Promise((resolve) => server.close(() => resolve()));

  return {
    url,
    port: actualPort,
    token: tok,
    close
  };
}

module.exports = {
  startServer
};
