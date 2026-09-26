/**
 * BMAD Studio — Endpoints da API REST e NDJSON Stream
 * 
 * Implementa todos os endpoints da API especificados no contrato de arquitetura,
 * incluindo validação de projeto, streaming NDJSON e tratamento de erros.
 */


/**
 * Envia uma resposta JSON padronizada
 */
function sendJson(res, statusCode, data) {
  if (res.writableEnded) return;
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(jsonStr),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(jsonStr);
}

/**
 * Lê o corpo da requisição como JSON com limite de 5 MB
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let totalSize = 0;
    const chunks = [];
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > MAX_SIZE) {
        const err = new Error('Corpo da requisição excede o limite de 5 MB');
        err.statusCode = 413;
        req.destroy(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        return resolve({});
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) {
        return resolve({});
      }
      try {
        const data = JSON.parse(text);
        resolve(data);
      } catch (e) {
        const err = new Error('JSON inválido');
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on('error', err => {
      if (!err.statusCode) err.statusCode = 400;
      reject(err);
    });
  });
}

/**
 * Valida se um projeto existe no workspace
 */
async function validateProject(workspace, pid) {
  if (!workspace || typeof workspace.listProjects !== 'function') {
    const err = new Error('Workspace inválido');
    err.statusCode = 500;
    throw err;
  }
  const projects = await workspace.listProjects();
  const proj = projects.find(p => String(p.id) === String(pid));
  if (!proj) {
    const err = new Error(`Projeto com id '${pid}' não encontrado`);
    err.statusCode = 404;
    throw err;
  }
  return proj;
}

/**
 * Roteia e trata requisições HTTP para /api/*
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {object} ctx
 */
async function handle(req, res, ctx) {
  try {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    let pathname = parsedUrl.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    const method = req.method ? req.method.toUpperCase() : 'GET';

    // 1. GET /api/bootstrap
    if (pathname === '/api/bootstrap') {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      if (typeof ctx.reload === 'function') {
        ctx.reload();
      }
      const projects = await ctx.workspace.listProjects();
      const settings = ctx.settings ? ctx.settings.getAll() : { agents: {} };
      // Snapshot imediato (pode ser o da sessão anterior enquanto a descoberta roda);
      // a UI busca /api/models em seguida para receber a lista desta sessão.
      const models = ctx.models.snapshot();
      sendJson(res, 200, {
        mode: ctx.workspace.mode,
        projects,
        agents: ctx.agents || [],
        workflows: ctx.workflows || [],
        settings,
        models,
        providers: models.providers
      });
      return;
    }

    // 2. GET /api/models — catálogo descoberto nesta sessão (aguarda a descoberta em andamento)
    //    GET /api/providers/status — mesmo conteúdo, só a lista de providers (compatibilidade)
    if (pathname === '/api/models' || pathname === '/api/providers/status') {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const models = await ctx.models.whenReady();
      sendJson(res, 200, pathname === '/api/models' ? models : models.providers);
      return;
    }

    // 2b. POST /api/models/refresh — redescobre todos os modelos agora
    if (pathname === '/api/models/refresh') {
      if (method !== 'POST') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const models = await ctx.models.refresh();
      sendJson(res, 200, models);
      return;
    }

    // 3. PUT /api/settings/agents/:agentId
    const matchSettingsAgent = pathname.match(/^\/api\/settings\/agents\/([^/]+)$/);
    if (matchSettingsAgent) {
      if (method !== 'PUT') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const agentId = decodeURIComponent(matchSettingsAgent[1]);
      const body = await readJsonBody(req);
      if (!ctx.settings) {
        throw new Error('Módulo de configurações não disponível');
      }
      ctx.settings.set(agentId, { provider: body.provider, model: body.model });
      sendJson(res, 200, { ok: true, settings: ctx.settings.getAll() });
      return;
    }

    // 4. POST /api/providers/test
    if (pathname === '/api/providers/test') {
      if (method !== 'POST') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const body = await readJsonBody(req);
      if (!body.provider) {
        sendJson(res, 400, { error: "Campo 'provider' é obrigatório" });
        return;
      }
      const result = await ctx.orchestrator.testProvider({
        provider: body.provider,
        model: body.model,
        projectId: body.projectId
      });
      sendJson(res, 200, result);
      return;
    }

    // 5 & 6. /api/projects/:pid/conversations
    const matchConversations = pathname.match(/^\/api\/projects\/([^/]+)\/conversations$/);
    if (matchConversations) {
      const pid = decodeURIComponent(matchConversations[1]);
      await validateProject(ctx.workspace, pid);

      if (method === 'GET') {
        const convs = await ctx.store.list(pid);
        sendJson(res, 200, convs);
        return;
      }

      if (method === 'POST') {
        const body = await readJsonBody(req);
        if (!body.mode || (body.mode !== 'chat' && body.mode !== 'party')) {
          sendJson(res, 400, { error: "Campo 'mode' inválido (deve ser 'chat' ou 'party')" });
          return;
        }
        if (!Array.isArray(body.agents) || body.agents.length === 0) {
          sendJson(res, 400, { error: "Campo 'agents' deve ser uma lista não vazia de IDs de agentes" });
          return;
        }
        const conv = await ctx.store.create(pid, {
          title: body.title,
          mode: body.mode,
          agents: body.agents
        });
        sendJson(res, 200, conv);
        return;
      }

      sendJson(res, 405, { error: 'Método não permitido' });
      return;
    }

    // 7 & 8. /api/projects/:pid/conversations/:cid
    const matchConvDetail = pathname.match(/^\/api\/projects\/([^/]+)\/conversations\/([^/]+)$/);
    if (matchConvDetail) {
      const pid = decodeURIComponent(matchConvDetail[1]);
      const cid = decodeURIComponent(matchConvDetail[2]);
      await validateProject(ctx.workspace, pid);

      if (method === 'GET') {
        const conv = await ctx.store.get(pid, cid);
        if (!conv) {
          sendJson(res, 404, { error: `Conversa '${cid}' não encontrada` });
          return;
        }
        sendJson(res, 200, conv);
        return;
      }

      if (method === 'DELETE') {
        await ctx.store.remove(pid, cid);
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 405, { error: 'Método não permitido' });
      return;
    }

    // 9. POST /api/projects/:pid/conversations/:cid/messages (Stream NDJSON)
    const matchMessages = pathname.match(/^\/api\/projects\/([^/]+)\/conversations\/([^/]+)\/messages$/);
    if (matchMessages) {
      if (method !== 'POST') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const pid = decodeURIComponent(matchMessages[1]);
      const cid = decodeURIComponent(matchMessages[2]);
      await validateProject(ctx.workspace, pid);

      const conv = await ctx.store.get(pid, cid);
      if (!conv) {
        sendJson(res, 404, { error: `Conversa '${cid}' não encontrada` });
        return;
      }

      const body = await readJsonBody(req);
      if (typeof body.text !== 'string') {
        sendJson(res, 400, { error: "Campo 'text' é obrigatório" });
        return;
      }

      // Inicia stream NDJSON
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      });

      let doneEmitted = false;
      const emit = ev => {
        if (res.writableEnded) return;
        if (ev && ev.type === 'done') {
          if (doneEmitted) return;
          doneEmitted = true;
        }
        res.write(JSON.stringify(ev) + '\n');
      };

      const controller = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) {
          controller.abort();
        }
      });

      try {
        if (conv.mode === 'party') {
          await ctx.orchestrator.runParty({
            projectId: pid,
            convId: cid,
            text: body.text,
            context: body.context,
            rounds: body.rounds ? Number(body.rounds) : 1,
            moderator: body.moderator || 'bmad-master',
            synthesize: body.synthesize !== false,
            signal: controller.signal,
            emit
          });
        } else {
          await ctx.orchestrator.sendMessage({
            projectId: pid,
            convId: cid,
            text: body.text,
            context: body.context,
            agentId: body.agentId,
            workflowId: body.workflowId,
            signal: controller.signal,
            emit
          });
        }
      } catch (err) {
        emit({ type: 'error', error: err.message || String(err) });
      } finally {
        emit({ type: 'done' });
        if (!res.writableEnded) {
          res.end();
        }
      }
      return;
    }

    // 10. GET /api/projects/:pid/files
    const matchFiles = pathname.match(/^\/api\/projects\/([^/]+)\/files$/);
    if (matchFiles) {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const pid = decodeURIComponent(matchFiles[1]);
      await validateProject(ctx.workspace, pid);
      const query = parsedUrl.searchParams.get('q') || '';
      const files = await ctx.workspace.listFiles(pid, { query });
      sendJson(res, 200, files);
      return;
    }

    // 11. GET /api/projects/:pid/file
    const matchFile = pathname.match(/^\/api\/projects\/([^/]+)\/file$/);
    if (matchFile) {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const pid = decodeURIComponent(matchFile[1]);
      await validateProject(ctx.workspace, pid);
      const filePath = parsedUrl.searchParams.get('path');
      if (!filePath) {
        sendJson(res, 400, { error: "Parâmetro 'path' é obrigatório" });
        return;
      }
      const fileResult = await ctx.workspace.readFile(pid, filePath);
      sendJson(res, 200, fileResult);
      return;
    }

    // 12. GET /api/projects/:pid/search
    const matchSearch = pathname.match(/^\/api\/projects\/([^/]+)\/search$/);
    if (matchSearch) {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const pid = decodeURIComponent(matchSearch[1]);
      await validateProject(ctx.workspace, pid);
      const query = parsedUrl.searchParams.get('q');
      if (!query) {
        sendJson(res, 400, { error: "Parâmetro 'q' é obrigatório" });
        return;
      }
      const results = await ctx.workspace.searchText(pid, query, {});
      sendJson(res, 200, results);
      return;
    }

    // 13. GET /api/projects/:pid/vscode
    const matchVsCode = pathname.match(/^\/api\/projects\/([^/]+)\/vscode$/);
    if (matchVsCode) {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const pid = decodeURIComponent(matchVsCode[1]);
      await validateProject(ctx.workspace, pid);

      const [rawEditor, diagnostics, openFiles, gitStatus] = await Promise.all([
        ctx.workspace.getActiveEditor ? ctx.workspace.getActiveEditor() : Promise.resolve(null),
        ctx.workspace.getDiagnostics ? ctx.workspace.getDiagnostics(pid) : Promise.resolve([]),
        ctx.workspace.getOpenFiles ? ctx.workspace.getOpenFiles(pid) : Promise.resolve([]),
        ctx.workspace.gitStatus ? ctx.workspace.gitStatus(pid) : Promise.resolve('')
      ]);

      let activeEditor = null;
      if (rawEditor && (!rawEditor.projectId || String(rawEditor.projectId) === String(pid))) {
        const sel = rawEditor.selection;
        activeEditor = {
          path: rawEditor.path,
          languageId: rawEditor.languageId,
          selection: sel ? {
            startLine: sel.startLine,
            endLine: sel.endLine,
            chars: (sel.text || '').length
          } : null
        };
      }

      sendJson(res, 200, {
        activeEditor,
        diagnostics: diagnostics || [],
        openFiles: openFiles || [],
        gitStatus: gitStatus || ''
      });
      return;
    }

    // 14. POST /api/projects/:pid/actions/open
    const matchActionOpen = pathname.match(/^\/api\/projects\/([^/]+)\/actions\/open$/);
    if (matchActionOpen) {
      if (method !== 'POST') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const pid = decodeURIComponent(matchActionOpen[1]);
      await validateProject(ctx.workspace, pid);
      const body = await readJsonBody(req);
      if (!body.path) {
        sendJson(res, 400, { error: "Campo 'path' é obrigatório" });
        return;
      }
      const ok = await ctx.workspace.openFile(pid, body.path, body.line);
      sendJson(res, 200, { ok: Boolean(ok) });
      return;
    }

    // 15. POST /api/projects/:pid/actions/save
    const matchActionSave = pathname.match(/^\/api\/projects\/([^/]+)\/actions\/save$/);
    if (matchActionSave) {
      if (method !== 'POST') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const pid = decodeURIComponent(matchActionSave[1]);
      await validateProject(ctx.workspace, pid);
      const body = await readJsonBody(req);
      if (!body.path) {
        sendJson(res, 400, { error: "Campo 'path' é obrigatório" });
        return;
      }
      const result = await ctx.workspace.writeFile(pid, body.path, body.content || '');
      sendJson(res, 200, { ok: true, path: result.path });
      return;
    }

    // 16. POST /api/projects/:pid/actions/diff
    const matchActionDiff = pathname.match(/^\/api\/projects\/([^/]+)\/actions\/diff$/);
    if (matchActionDiff) {
      if (method !== 'POST') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const pid = decodeURIComponent(matchActionDiff[1]);
      await validateProject(ctx.workspace, pid);
      const body = await readJsonBody(req);
      if (!body.path) {
        sendJson(res, 400, { error: "Campo 'path' é obrigatório" });
        return;
      }
      const ok = await ctx.workspace.showDiff(pid, body.path, body.content || '');
      sendJson(res, 200, { ok: Boolean(ok) });
      return;
    }

    // 17. POST /api/projects/:pid/actions/insert
    const matchActionInsert = pathname.match(/^\/api\/projects\/([^/]+)\/actions\/insert$/);
    if (matchActionInsert) {
      if (method !== 'POST') {
        sendJson(res, 405, { error: 'Método não permitido' });
        return;
      }
      const pid = decodeURIComponent(matchActionInsert[1]);
      await validateProject(ctx.workspace, pid);
      const body = await readJsonBody(req);
      const ok = await ctx.workspace.insertAtCursor(body.text || '');
      sendJson(res, 200, { ok: Boolean(ok) });
      return;
    }

    // Rota da API não encontrada
    sendJson(res, 404, { error: 'Rota não encontrada' });
  } catch (err) {
    const statusCode = err.statusCode || (err.message && err.message.includes('não encontrado') ? 404 : 500);
    sendJson(res, statusCode, { error: err.message || 'Erro interno do servidor' });
  }
}

module.exports = {
  handle
};
