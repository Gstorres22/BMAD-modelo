const fs = require('fs');
const path = require('path');

/**
 * Cria a store de persistência de conversas do BMAD Studio.
 * Salva as conversas em <projeto>/.bmad-studio/conversations/<id>.json.
 * @param {object} workspace
 */
function createStore(workspace) {
  function validateConvId(id) {
    if (!id || typeof id !== 'string' || !/^[a-z0-9]+$/.test(id)) {
      throw new Error(`ID de conversa inválido: ${id}`);
    }
  }

  async function getProjectDir(projectId) {
    const projects = await workspace.listProjects();
    const p = projects.find(item => String(item.id) === String(projectId));
    if (!p) {
      throw new Error(`Projeto não encontrado: ${projectId}`);
    }
    return p.path;
  }

  function getConversationsDir(projectPath) {
    return path.join(projectPath, '.bmad-studio', 'conversations');
  }

  async function list(projectId) {
    const projectPath = await getProjectDir(projectId);
    const convDir = getConversationsDir(projectPath);

    if (!fs.existsSync(convDir)) {
      return [];
    }

    let files;
    try {
      files = await fs.promises.readdir(convDir);
    } catch {
      return [];
    }

    const items = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const baseName = path.basename(file, '.json');
      if (!/^[a-z0-9]+$/.test(baseName)) continue;

      const filePath = path.join(convDir, file);
      try {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          items.push({
            id: data.id || baseName,
            title: data.title || 'Conversa sem título',
            mode: data.mode === 'party' ? 'party' : 'chat',
            agents: Array.isArray(data.agents) ? data.agents : [],
            updatedAt: data.updatedAt || data.createdAt || 0
          });
        }
      } catch {
        // Ignora arquivos corrompidos
      }
    }

    items.sort((a, b) => {
      const timeA = typeof a.updatedAt === 'number' ? a.updatedAt : new Date(a.updatedAt).getTime() || 0;
      const timeB = typeof b.updatedAt === 'number' ? b.updatedAt : new Date(b.updatedAt).getTime() || 0;
      return timeB - timeA;
    });

    return items;
  }

  async function get(projectId, convId) {
    validateConvId(convId);
    const projectPath = await getProjectDir(projectId);
    const convDir = getConversationsDir(projectPath);
    const filePath = path.join(convDir, `${convId}.json`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Conversa não encontrada: ${convId}`);
    }

    const raw = await fs.promises.readFile(filePath, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Conversa corrompida: ${convId}`);
    }

    return {
      id: data.id || convId,
      title: data.title || 'Conversa sem título',
      mode: data.mode === 'party' ? 'party' : 'chat',
      agents: Array.isArray(data.agents) ? data.agents : [],
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      providerSessions: data.providerSessions || {},
      messages: Array.isArray(data.messages) ? data.messages : []
    };
  }

  async function create(projectId, { title, mode = 'chat', agents = [] } = {}) {
    const projectPath = await getProjectDir(projectId);
    const convDir = getConversationsDir(projectPath);
    await fs.promises.mkdir(convDir, { recursive: true });

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const now = Date.now();

    const conv = {
      id,
      title: title || 'Nova conversa',
      mode: mode === 'party' ? 'party' : 'chat',
      agents: Array.isArray(agents) ? agents : [],
      createdAt: now,
      updatedAt: now,
      providerSessions: {},
      messages: []
    };

    const filePath = path.join(convDir, `${id}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(conv, null, 2), 'utf8');
    return conv;
  }

  async function save(projectId, conv) {
    if (!conv || !conv.id) {
      throw new Error('Conversa inválida para salvar');
    }
    validateConvId(conv.id);

    const projectPath = await getProjectDir(projectId);
    const convDir = getConversationsDir(projectPath);
    await fs.promises.mkdir(convDir, { recursive: true });

    conv.updatedAt = Date.now();
    const filePath = path.join(convDir, `${conv.id}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(conv, null, 2), 'utf8');
  }

  async function remove(projectId, convId) {
    validateConvId(convId);
    const projectPath = await getProjectDir(projectId);
    const convDir = getConversationsDir(projectPath);
    const filePath = path.join(convDir, `${convId}.json`);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  return {
    list,
    get,
    create,
    save,
    remove
  };
}

module.exports = {
  createStore
};
