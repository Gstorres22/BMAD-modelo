/**
 * BMAD Studio - Single Page Application
 * Pure vanilla JavaScript, zero dependencies.
 * Consumes the BMAD Studio Orchestrator and Workspace REST/NDJSON APIs.
 */

(function () {
  'use strict';

  // --- Helpers ---
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatRelativeTime(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 45) return 'agora há pouco';
    if (diffSec < 3600) return 'há ' + Math.floor(diffSec / 60) + ' min';
    if (diffSec < 86400) return 'há ' + Math.floor(diffSec / 3600) + ' h';
    if (diffSec < 172800) return 'ontem';
    if (diffSec < 604800) return 'há ' + Math.floor(diffSec / 86400) + ' d';

    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function abbreviateProvider(providerId) {
    if (!providerId) return '';
    switch (providerId) {
      case 'claude-cli': return 'Claude';
      case 'agy-cli': return 'AGY';
      case 'openai': return 'OpenAI';
      default: return providerId;
    }
  }

  function showToast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' toast-' + type : '');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3000);
  }

  // --- Central State ---
  const state = {
    token: '',
    mode: 'fs', // 'fs' | 'vscode'
    projects: [],
    currentProjectId: null,
    conversations: [],
    currentConvId: null,
    currentConversation: null,
    agents: [],
    workflows: [],
    settings: { agents: {} },
    providers: [],
    providerModels: {}, // { providerId: [{ id, label, available, reason?, until? }] }
    catalog: null,
    selectedWorkflowId: null,
    replyAsAgentId: null,
    isStreaming: false,
    abortController: null,
    contextToggles: {
      activeFile: true,
      selection: true,
      diagnostics: true,
      openFiles: false,
      gitDiff: false,
      gitStatus: true
    },
    attachedFiles: [],
    theme: 'dark',
    renderThrottleTimer: null,
    pollTimer: null
  };

  // --- Token Management ---
  function initToken() {
    try {
      // vscode.env.openExternal pode entregar a query codificada ("?token%3D..."): normaliza antes de ler
      const rawSearch = window.location.search.replace(/token%3D/i, 'token=');
      const urlParams = new URLSearchParams(rawSearch);
      const urlToken = urlParams.get('token');
      if (urlToken) {
        state.token = urlToken;
        try {
          sessionStorage.setItem('bmad_token', urlToken);
        } catch (e) {
          console.warn('sessionStorage inacessível:', e);
        }
        // Remove token from URL for security and cleanliness
        urlParams.delete('token');
        const newSearch = urlParams.toString() ? '?' + urlParams.toString() : '';
        const newUrl = window.location.pathname + newSearch + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
        return;
      }
    } catch (e) {
      console.warn('Erro ao ler token da URL:', e);
    }

    try {
      state.token = sessionStorage.getItem('bmad_token') || '';
    } catch (e) {
      state.token = '';
    }
  }

  function showAuthError() {
    const screen = document.getElementById('auth-error-screen');
    if (screen) {
      screen.classList.add('visible');
    }
  }

  // --- API Helper ---
  async function api(path, options) {
    const opts = options || {};
    const headers = opts.headers || {};

    if (state.token) {
      headers['X-BMAD-Token'] = state.token;
    }
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    opts.headers = headers;

    let response;
    try {
      response = await fetch(path, opts);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new Error('Falha de conexão com o servidor BMAD: ' + err.message);
    }

    if (response.status === 401) {
      showAuthError();
      throw new Error('Token inválido ou não autorizado (401)');
    }

    if (!response.ok) {
      let errorMsg = 'Erro na requisição (' + response.status + ')';
      try {
        const errorJson = await response.json();
        if (errorJson && errorJson.error) {
          errorMsg = errorJson.error;
        }
      } catch (_) {}
      throw new Error(errorMsg);
    }

    // Return JSON if application/json, otherwise response directly
    const contentType = response.headers.get('content-type') || '';
    if (contentType.indexOf('application/json') !== -1) {
      return await response.json();
    }
    return response;
  }

  // --- Theme Management ---
  function initTheme() {
    let savedTheme = 'dark';
    try {
      savedTheme = localStorage.getItem('bmad_theme');
    } catch (_) {}

    if (!savedTheme) {
      savedTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    setTheme(savedTheme);

    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', function () {
        const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
      });
    }
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('bmad_theme', theme);
    } catch (_) {}
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? '🌓' : '☀️';
    }
  }

  // --- Context Toggles Management ---
  function initContextToggles() {
    try {
      const saved = localStorage.getItem('bmad_context_toggles');
      if (saved) {
        const parsed = JSON.parse(saved);
        state.contextToggles = Object.assign(state.contextToggles, parsed);
      }
    } catch (_) {}

    const toggleIds = [
      { id: 'toggle-active-file', key: 'activeFile' },
      { id: 'toggle-selection', key: 'selection' },
      { id: 'toggle-diagnostics', key: 'diagnostics' },
      { id: 'toggle-open-files', key: 'openFiles' },
      { id: 'toggle-git-diff', key: 'gitDiff' },
      { id: 'toggle-git-status', key: 'gitStatus' }
    ];

    toggleIds.forEach(function (item) {
      const el = document.getElementById(item.id);
      if (el) {
        el.checked = !!state.contextToggles[item.key];
        el.addEventListener('change', function () {
          state.contextToggles[item.key] = el.checked;
          try {
            localStorage.setItem('bmad_context_toggles', JSON.stringify(state.contextToggles));
          } catch (_) {}
        });
      }
    });
  }

  // --- Bootstrap App ---
  async function bootstrapApp() {
    initToken();
    initTheme();
    initContextToggles();
    setupEventListeners();

    try {
      const data = await api('/api/bootstrap');
      state.mode = data.mode || 'fs';
      state.projects = data.projects || [];
      state.agents = data.agents || [];
      state.workflows = data.workflows || [];
      state.settings = data.settings || { agents: {} };

      // Update mode badge
      const isVsCode = state.mode === 'vscode';
      const modeLabel = isVsCode ? 'VS Code' : 'Standalone';
      const modeBadge = document.getElementById('mode-badge');
      const mobileModeBadge = document.getElementById('mobile-mode-badge');
      if (modeBadge) modeBadge.textContent = modeLabel;
      if (mobileModeBadge) mobileModeBadge.textContent = modeLabel;

      // Populate project selector
      renderProjectSelect();

      // Catálogo de modelos: snapshot imediato e, em seguida, a descoberta desta sessão
      applyCatalog(data.models);
      loadModelCatalog();

      // Render Team
      renderTeamSection();

      // Select initial project
      if (state.projects.length > 0) {
        state.currentProjectId = state.projects[0].id;
        const projectSelect = document.getElementById('project-select');
        if (projectSelect) projectSelect.value = state.currentProjectId;
        await loadConversations(state.currentProjectId);
      }

      // Start live polling for VS Code context
      startVsCodePolling();

    } catch (err) {
      console.error('Erro ao inicializar BMAD Studio:', err);
      showToast('Erro ao carregar sistema: ' + err.message, 'danger');
    }
  }

  function renderProjectSelect() {
    const select = document.getElementById('project-select');
    if (!select) return;
    select.innerHTML = '';

    if (state.projects.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nenhum projeto';
      select.appendChild(opt);
      return;
    }

    state.projects.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });

    select.addEventListener('change', async function () {
      state.currentProjectId = select.value;
      state.currentConvId = null;
      state.currentConversation = null;
      state.attachedFiles = [];
      renderAttachedFiles();
      await loadConversations(state.currentProjectId);
      pollVsCodeContext();
    });
  }

  // --- Catálogo de modelos (descoberto pelo servidor a cada início de sessão) ---
  function applyCatalog(catalog) {
    if (!catalog || !Array.isArray(catalog.providers)) return;
    state.catalog = catalog;
    state.providers = catalog.providers;
    state.providerModels = {};
    catalog.providers.forEach(function (prov) {
      state.providerModels[prov.id] = prov.models || [];
    });
  }

  function isSettingsModalOpen() {
    const modal = document.getElementById('modal-settings');
    return Boolean(modal && modal.classList.contains('open'));
  }

  function renderCatalogViews() {
    renderTeamSection();
    if (isSettingsModalOpen()) {
      renderProviderStatusCards();
      renderAgentSettingsTable();
      setupBulkApplyAction();
    }
  }

  // Busca o catálogo desta sessão (o servidor aguarda a descoberta em andamento)
  async function loadModelCatalog() {
    try {
      applyCatalog(await api('/api/models'));
      renderCatalogViews();
    } catch (e) {
      console.warn('Erro ao carregar catálogo de modelos:', e);
    }
  }

  async function refreshModelCatalog() {
    const btn = document.getElementById('btn-refresh-models');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '↻ Atualizando…';
    }
    try {
      applyCatalog(await api('/api/models/refresh', { method: 'POST' }));
      renderCatalogViews();
      showToast('Lista de modelos atualizada', 'success');
    } catch (err) {
      showToast('Erro ao atualizar modelos: ' + err.message, 'danger');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '↻ Atualizar lista';
      }
    }
  }

  function formatUntil(ts) {
    if (!ts) return '';
    const ms = ts - Date.now();
    if (ms <= 0) return '';
    const h = Math.floor(ms / 3600000);
    const d = Math.floor(h / 24);
    const text = d > 0 ? d + 'd ' + (h % 24) + 'h' : h > 0 ? h + 'h ' + Math.floor((ms % 3600000) / 60000) + 'min' : Math.ceil(ms / 60000) + 'min';
    return 'volta em ' + text;
  }

  /** Situação de um provider/modelo segundo o catálogo. */
  function getModelStatus(providerId, modelId) {
    const prov = (state.providers || []).find(function (p) { return p.id === providerId; });
    if (!prov) return { known: false, available: true };
    if (!prov.available) return { known: true, available: false, reason: prov.detail || 'Provider indisponível' };
    const model = (prov.models || []).find(function (m) { return m.id === modelId; });
    if (!model) {
      // Lista parcial (aliases do Claude CLI): ids fora dela são válidos até prova em contrário
      return prov.exhaustive === false
        ? { known: false, available: true, unverified: true }
        : { known: false, available: false, reason: 'Modelo não encontrado na lista desta sessão' };
    }
    if (model.available) return { known: true, available: true };
    return { known: true, available: false, reason: [model.reason, formatUntil(model.until)].filter(Boolean).join(' — ') };
  }

  function fillProviderSelect(select, currentProvider) {
    if (!select) return;
    select.innerHTML = '';
    (state.providers || []).forEach(function (prov) {
      const opt = document.createElement('option');
      opt.value = prov.id;
      opt.textContent = (prov.label || prov.id) + (prov.available ? '' : ' (indisponível)');
      select.appendChild(opt);
    });
    if (currentProvider) select.value = currentProvider;
  }

  /** Preenche um <select> com os modelos descobertos do provider (indisponíveis ficam marcados). */
  function fillModelSelect(select, providerId, currentModel) {
    if (!select) return;
    select.innerHTML = '';
    const models = state.providerModels[providerId] || [];
    const prov = (state.providers || []).find(function (p) { return p.id === providerId; });
    const partialList = Boolean(prov && prov.exhaustive === false);

    if (currentModel && !models.some(function (m) { return m.id === currentModel; })) {
      const opt = document.createElement('option');
      opt.value = currentModel;
      opt.textContent = partialList
        ? currentModel + ' (não verificado — validado no primeiro uso)'
        : '⚠ ' + currentModel + ' (não listado nesta sessão)';
      select.appendChild(opt);
    }
    if (models.length === 0 && !currentModel) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(nenhum modelo encontrado)';
      select.appendChild(opt);
    }
    models.forEach(function (m) {
      const opt = document.createElement('option');
      opt.value = m.id;
      let text = m.label && m.label !== m.id ? m.id + ' — ' + m.label : m.id;
      if (m.manual && m.available) text += ' (✓ verificado no uso)';
      if (!m.available) {
        text = '⚠ ' + text + ' — ' + ([m.reason || 'indisponível', formatUntil(m.until)].filter(Boolean).join(', '));
      }
      opt.textContent = text;
      select.appendChild(opt);
    });
    if (currentModel) select.value = currentModel;
  }

  // --- Team BMAD Section ---
  const PHASE_NAMES = {
    'core': 'Núcleo',
    'analysis': '1 · Análise',
    'planning': '2 · Planejamento',
    'solutioning': '3 · Solução',
    'implementation': '4 · Implementação'
  };

  const PHASE_ORDER = ['core', 'analysis', 'planning', 'solutioning', 'implementation'];

  function renderTeamSection() {
    const container = document.getElementById('team-container');
    if (!container) return;
    container.innerHTML = '';

    const groups = {};
    PHASE_ORDER.forEach(function (ph) {
      groups[ph] = [];
    });

    state.agents.forEach(function (ag) {
      const ph = ag.phase || 'core';
      if (!groups[ph]) groups[ph] = [];
      groups[ph].push(ag);
    });

    PHASE_ORDER.forEach(function (ph) {
      const list = groups[ph];
      if (!list || list.length === 0) return;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'phase-group';

      const headerDiv = document.createElement('div');
      headerDiv.className = 'phase-header';
      headerDiv.textContent = PHASE_NAMES[ph] || ph;
      groupDiv.appendChild(headerDiv);

      list.forEach(function (agent) {
        const agentItem = document.createElement('div');
        agentItem.className = 'agent-item';
        agentItem.setAttribute('data-agent-id', agent.id);

        const currentSetting = (state.settings.agents && state.settings.agents[agent.id]) || {};
        const prov = currentSetting.provider || agent.defaultProvider || 'agy-cli';
        const model = currentSetting.model || agent.defaultModel || 'padrão';
        const provAbbr = abbreviateProvider(prov);
        const modelStatus = getModelStatus(prov, currentSetting.model || agent.defaultModel || '');
        const badgeClass = 'agent-model-badge' + (modelStatus.available ? '' : ' is-unavailable');
        const badgeTitle = prov + ' · ' + model + (modelStatus.available ? '' : ' — indisponível: ' + (modelStatus.reason || ''));

        const lockIcon = agent.canEdit ? '✏️' : '🔒';
        const lockTitle = agent.canEdit ? 'Pode editar arquivos' : 'Somente leitura';

        agentItem.innerHTML = [
          '<div class="agent-icon">' + (agent.icon || '🤖') + '</div>',
          '<div class="agent-info">',
          '  <div class="agent-name-row">',
          '    <span class="agent-name">' + escapeHtml(agent.name) + '</span>',
          '    <span class="agent-lock" title="' + lockTitle + '">' + lockIcon + '</span>',
          '  </div>',
          '  <div style="display:flex; justify-content:space-between; align-items:center;">',
          '    <span class="agent-title">' + escapeHtml(agent.title || '') + '</span>',
          '    <span class="' + badgeClass + '" title="' + escapeHtml(badgeTitle) + '">' + (modelStatus.available ? '' : '⚠ ') + escapeHtml(provAbbr) + ' · ' + escapeHtml(model) + '</span>',
          '  </div>',
          '</div>'
        ].join('');

        agentItem.addEventListener('click', function () {
          handleAgentClick(agent);
        });

        groupDiv.appendChild(agentItem);
      });

      container.appendChild(groupDiv);
    });
  }

  async function handleAgentClick(agent) {
    if (!state.currentProjectId) return;

    // Check if an existing 1-on-1 chat conversation exists with this agent
    const existing = state.conversations.find(function (c) {
      return c.mode === 'chat' && c.agents && c.agents.length === 1 && c.agents[0] === agent.id;
    });

    if (existing) {
      await selectConversation(existing.id);
    } else {
      // Create new chat conversation
      try {
        const conv = await api('/api/projects/' + state.currentProjectId + '/conversations', {
          method: 'POST',
          body: {
            title: 'Conversa com ' + agent.name,
            mode: 'chat',
            agents: [agent.id]
          }
        });
        await loadConversations(state.currentProjectId);
        await selectConversation(conv.id);
      } catch (err) {
        showToast('Erro ao criar conversa: ' + err.message, 'danger');
      }
    }
  }

  // --- Conversations Management ---
  async function loadConversations(projectId) {
    if (!projectId) return;
    try {
      const convs = await api('/api/projects/' + projectId + '/conversations');
      state.conversations = convs || [];
      renderConversationList();

      // If active conversation is not set or not in list, select the latest one
      if (state.conversations.length > 0) {
        if (!state.currentConvId || !state.conversations.some(function (c) { return c.id === state.currentConvId; })) {
          await selectConversation(state.conversations[0].id);
        }
      } else {
        state.currentConvId = null;
        state.currentConversation = null;
        renderConversationView();
      }
    } catch (err) {
      console.error('Erro ao listar conversas:', err);
    }
  }

  function renderConversationList() {
    const list = document.getElementById('conversation-list');
    if (!list) return;
    list.innerHTML = '';

    if (state.conversations.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'padding: 8px; font-size: 11px; color: var(--text-muted); text-align: center;';
      emptyMsg.textContent = 'Nenhuma conversa ainda';
      list.appendChild(emptyMsg);
      return;
    }

    state.conversations.forEach(function (conv) {
      const item = document.createElement('div');
      item.className = 'conv-item' + (conv.id === state.currentConvId ? ' active' : '');
      item.setAttribute('data-conv-id', conv.id);

      // Icons of participating agents
      let iconsHtml = '';
      if (conv.agents && conv.agents.length > 0) {
        conv.agents.slice(0, 3).forEach(function (aid) {
          const ag = state.agents.find(function (a) { return a.id === aid; });
          iconsHtml += '<span>' + (ag ? ag.icon : '🤖') + '</span>';
        });
      } else {
        iconsHtml = '<span>💬</span>';
      }

      const relTime = formatRelativeTime(conv.updatedAt || conv.createdAt);

      item.innerHTML = [
        '<div class="conv-icons">' + iconsHtml + '</div>',
        '<div class="conv-details">',
        '  <div class="conv-title" title="' + escapeHtml(conv.title) + '">' + escapeHtml(conv.title) + '</div>',
        '  <div class="conv-meta">',
        '    <span>' + (conv.mode === 'party' ? 'Party' : 'Chat') + '</span>',
        '    <span>•</span>',
        '    <span>' + relTime + '</span>',
        '  </div>',
        '</div>',
        '<button type="button" class="conv-delete-btn" title="Excluir conversa" aria-label="Excluir conversa">🗑️</button>'
      ].join('');

      item.addEventListener('click', function (e) {
        if (e.target.closest('.conv-delete-btn')) return;
        selectConversation(conv.id);
      });

      const delBtn = item.querySelector('.conv-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          deleteConversation(conv.id);
        });
      }

      list.appendChild(item);
    });
  }

  async function selectConversation(convId) {
    if (!state.currentProjectId || !convId) return;
    try {
      const conv = await api('/api/projects/' + state.currentProjectId + '/conversations/' + convId);
      state.currentConvId = conv.id;
      state.currentConversation = conv;
      state.selectedWorkflowId = null;

      // Update active highlight in conversation list
      renderConversationList();

      // Render conversation UI
      renderConversationView();

      // Close mobile drawer if open
      closeDrawers();
    } catch (err) {
      showToast('Erro ao abrir conversa: ' + err.message, 'danger');
    }
  }

  async function deleteConversation(convId) {
    if (!confirm('Deseja realmente excluir esta conversa?')) return;
    try {
      await api('/api/projects/' + state.currentProjectId + '/conversations/' + convId, {
        method: 'DELETE'
      });
      showToast('Conversa excluída');
      if (state.currentConvId === convId) {
        state.currentConvId = null;
        state.currentConversation = null;
      }
      await loadConversations(state.currentProjectId);
    } catch (err) {
      showToast('Erro ao excluir: ' + err.message, 'danger');
    }
  }

  // --- Conversation View Rendering ---
  function renderConversationView() {
    const conv = state.currentConversation;
    const chatTitle = document.getElementById('chat-title');
    const chatParticipants = document.getElementById('chat-participants');
    const chatModeBadge = document.getElementById('chat-mode-badge');
    const partyControls = document.getElementById('party-controls');
    const emptyState = document.getElementById('empty-state');
    const messagesList = document.getElementById('messages-list');
    const replyAsContainer = document.getElementById('reply-as-container');
    const replyAsSelect = document.getElementById('reply-as-select');
    const composerInput = document.getElementById('composer-input');

    if (!conv) {
      if (chatTitle) chatTitle.textContent = 'Nenhuma conversa selecionada';
      if (chatParticipants) chatParticipants.innerHTML = '';
      if (chatModeBadge) chatModeBadge.textContent = '-';
      if (partyControls) partyControls.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      if (messagesList) messagesList.innerHTML = '';
      if (replyAsContainer) replyAsContainer.style.display = 'none';
      renderWorkflowBar([]);
      return;
    }

    // Header info
    if (chatTitle) chatTitle.textContent = conv.title || 'Conversa';
    if (chatModeBadge) {
      chatModeBadge.textContent = conv.mode === 'party' ? 'Party Mode' : 'Chat';
      chatModeBadge.className = 'badge ' + (conv.mode === 'party' ? 'badge-success' : 'badge-accent');
    }

    // Participant avatars
    if (chatParticipants) {
      chatParticipants.innerHTML = '';
      (conv.agents || []).forEach(function (aid) {
        const ag = state.agents.find(function (a) { return a.id === aid; });
        const avatar = document.createElement('div');
        avatar.className = 'participant-avatar';
        avatar.title = ag ? ag.name + ' (' + (ag.title || '') + ')' : aid;
        avatar.textContent = ag ? ag.icon : '🤖';
        chatParticipants.appendChild(avatar);
      });
    }

    // Party Controls visibility
    if (partyControls) {
      partyControls.style.display = conv.mode === 'party' ? 'flex' : 'none';
    }

    // "Responder como" select for Chat with >1 agent
    if (replyAsContainer && replyAsSelect) {
      if (conv.mode === 'chat' && conv.agents && conv.agents.length > 1) {
        replyAsContainer.style.display = 'flex';
        replyAsSelect.innerHTML = '';
        conv.agents.forEach(function (aid) {
          const ag = state.agents.find(function (a) { return a.id === aid; });
          const opt = document.createElement('option');
          opt.value = aid;
          opt.textContent = ag ? ag.name : aid;
          replyAsSelect.appendChild(opt);
        });
        state.replyAsAgentId = replyAsSelect.value;
      } else {
        replyAsContainer.style.display = 'none';
        state.replyAsAgentId = (conv.agents && conv.agents[0]) || null;
      }
    }

    // Render Workflows
    renderWorkflowBar(conv.agents || []);

    // Empty state vs Message list
    const messages = conv.messages || [];
    if (messages.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      if (messagesList) messagesList.innerHTML = '';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      renderMessagesList(messages);
      scrollToBottom();
    }

    // Reset textarea placeholder
    if (composerInput) {
      composerInput.placeholder = 'Digite uma mensagem... (Enter envia, Shift+Enter nova linha)';
    }
  }

  // --- Workflows Bar ---
  function renderWorkflowBar(convAgents) {
    const bar = document.getElementById('workflow-bar');
    if (!bar) return;
    bar.innerHTML = '';

    const matchingWorkflows = state.workflows.filter(function (wf) {
      return convAgents.indexOf(wf.agent) !== -1;
    });

    if (matchingWorkflows.length === 0) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';
    matchingWorkflows.forEach(function (wf) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'workflow-chip' + (state.selectedWorkflowId === wf.id ? ' active' : '');
      chip.setAttribute('data-workflow-id', wf.id);
      chip.innerHTML = '<span>' + (wf.icon || '📋') + '</span><span>' + escapeHtml(wf.name) + '</span>';

      chip.addEventListener('click', function () {
        toggleWorkflow(wf);
      });

      bar.appendChild(chip);
    });
  }

  function toggleWorkflow(wf) {
    const input = document.getElementById('composer-input');
    if (state.selectedWorkflowId === wf.id) {
      // Deselect
      state.selectedWorkflowId = null;
      if (input) input.placeholder = 'Digite uma mensagem... (Enter envia, Shift+Enter nova linha)';
    } else {
      // Select
      state.selectedWorkflowId = wf.id;
      if (input) input.placeholder = wf.inputLabel || ('Preencha o input para o workflow "' + wf.name + '"...');
      if (input) input.focus();
    }
    renderWorkflowBar(state.currentConversation ? state.currentConversation.agents || [] : []);
  }

  // --- Messages List Rendering ---
  function renderMessagesList(messages) {
    const container = document.getElementById('messages-list');
    if (!container) return;
    container.innerHTML = '';

    messages.forEach(function (msg) {
      const el = createMessageElement(msg);
      container.appendChild(el);
    });
  }

  function createMessageElement(msg) {
    const row = document.createElement('div');
    row.className = 'message-row ' + (msg.role === 'user' ? 'user' : 'agent');
    row.id = 'msg-' + msg.id;

    if (msg.role === 'user') {
      const wrap = document.createElement('div');
      wrap.className = 'user-bubble-wrap';

      // Context chips
      if (msg.context && msg.context.length > 0) {
        const chipsDiv = document.createElement('div');
        chipsDiv.className = 'context-chips';
        msg.context.forEach(function (lbl) {
          const c = document.createElement('span');
          c.className = 'context-chip';
          c.textContent = lbl;
          chipsDiv.appendChild(c);
        });
        wrap.appendChild(chipsDiv);
      }

      const bubble = document.createElement('div');
      bubble.className = 'user-bubble';
      bubble.textContent = msg.content;
      wrap.appendChild(bubble);

      row.appendChild(wrap);
    } else {
      // Agent message
      const ag = state.agents.find(function (a) { return a.id === msg.agentId; }) || {
        name: msg.agentId || 'Agente BMAD',
        title: 'Assistente',
        icon: '🤖'
      };

      const prov = msg.provider || 'AI';
      const model = msg.model || '';
      const provAbbr = abbreviateProvider(prov);
      const badgeText = model ? provAbbr + ' · ' + model : provAbbr;

      const bubble = document.createElement('div');
      bubble.className = 'agent-bubble';

      // Header
      const header = document.createElement('div');
      header.className = 'agent-header';
      header.innerHTML = [
        '<div class="agent-header-left">',
        '  <span class="agent-avatar">' + (ag.icon || '🤖') + '</span>',
        '  <div>',
        '    <span class="agent-meta-name">' + escapeHtml(ag.name) + '</span>',
        '    <span class="agent-meta-title"> · ' + escapeHtml(ag.title || '') + '</span>',
        '  </div>',
        '  <span class="badge" style="font-size: 10px;">' + escapeHtml(badgeText) + '</span>',
        '</div>',
        '<div class="agent-header-actions">',
        '  <button type="button" class="btn btn-secondary btn-sm btn-msg-copy" title="Copiar resposta">Copiar</button>',
        '  <button type="button" class="btn btn-secondary btn-sm btn-msg-save" title="Salvar em arquivo">Salvar como…</button>',
        '</div>'
      ].join('');
      bubble.appendChild(header);

      // Markdown body
      const body = document.createElement('div');
      body.className = 'message-body';
      const renderedHtml = window.renderMarkdown ? window.renderMarkdown(msg.content || '') : escapeHtml(msg.content || '');
      body.innerHTML = renderedHtml;
      bubble.appendChild(body);

      // Tools used accordion
      if (msg.tools && msg.tools.length > 0) {
        const toolsDetails = renderToolsDetails(msg.tools);
        bubble.appendChild(toolsDetails);
      }

      // Error banner
      if (msg.error) {
        const errDiv = document.createElement('div');
        errDiv.className = 'message-error';
        errDiv.innerHTML = '<span>⚠️</span><span>' + escapeHtml(msg.error) + '</span>';
        bubble.appendChild(errDiv);
      }

      // Copy & Save handlers
      const btnCopy = header.querySelector('.btn-msg-copy');
      if (btnCopy) {
        btnCopy.addEventListener('click', function () {
          copyToClipboard(msg.content);
        });
      }

      const btnSave = header.querySelector('.btn-msg-save');
      if (btnSave) {
        btnSave.addEventListener('click', function () {
          saveAgentMessageToFile(msg);
        });
      }

      row.appendChild(bubble);
    }

    return row;
  }

  function renderToolsDetails(tools) {
    const details = document.createElement('details');
    details.className = 'tools-details';
    const summary = document.createElement('summary');
    summary.textContent = '🔧 ' + tools.length + ' ferramenta' + (tools.length > 1 ? 's usadas' : ' usada');
    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.className = 'tools-list';
    tools.forEach(function (t) {
      const li = document.createElement('li');
      li.className = 'tools-item';
      li.innerHTML = '<strong>' + escapeHtml(t.name) + '</strong>: ' + escapeHtml(t.detail || '');
      ul.appendChild(li);
    });
    details.appendChild(ul);
    return details;
  }

  async function saveAgentMessageToFile(msg) {
    if (!state.currentProjectId) return;

    // Suggest path based on workflow or default docs/<agent>-<date>.md
    let suggestedPath = '';
    if (state.selectedWorkflowId) {
      const wf = state.workflows.find(function (w) { return w.id === state.selectedWorkflowId; });
      if (wf && wf.output) {
        suggestedPath = wf.output;
      }
    }
    if (!suggestedPath) {
      const dateStr = new Date().toISOString().slice(0, 10);
      const agId = msg.agentId || 'agente';
      suggestedPath = 'docs/' + agId + '-' + dateStr + '.md';
    }

    const path = prompt('Salvar resposta em:', suggestedPath);
    if (!path) return;

    try {
      const res = await api('/api/projects/' + state.currentProjectId + '/actions/save', {
        method: 'POST',
        body: { path: path.trim(), content: msg.content }
      });
      showToast('Arquivo salvo: ' + res.path, 'success');
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'danger');
    }
  }

  function copyViaTextarea(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copyToClipboard(text) {
    const done = function (ok) {
      showToast(ok ? 'Copiado para a área de transferência!' : 'Não foi possível copiar', ok ? undefined : 'danger');
    };
    if (!navigator.clipboard) {
      done(copyViaTextarea(text));
      return;
    }
    // No iframe do webview do VS Code a Clipboard API pode ser negada: cai no fallback
    navigator.clipboard.writeText(text).then(function () {
      done(true);
    }).catch(function () {
      done(copyViaTextarea(text));
    });
  }

  // --- Auto-scroll helper ---
  function isNearBottom() {
    const el = document.getElementById('chat-messages');
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function scrollToBottom(force) {
    const el = document.getElementById('chat-messages');
    if (!el) return;
    if (force || isNearBottom()) {
      el.scrollTop = el.scrollHeight;
    }
  }

  // --- Sending Message & Streaming Reader ---
  async function sendMessage() {
    if (state.isStreaming) {
      // Stop button clicked
      if (state.abortController) {
        state.abortController.abort();
      }
      return;
    }

    const input = document.getElementById('composer-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    if (!state.currentProjectId || !state.currentConvId) {
      showToast('Nenhuma conversa selecionada.', 'danger');
      return;
    }

    const conv = state.currentConversation;
    if (!conv) return;

    // Build context
    const contextPayload = Object.assign({}, state.contextToggles, {
      files: state.attachedFiles.slice()
    });

    // Prepare body
    const body = {
      text: text,
      context: contextPayload
    };

    if (conv.mode === 'party') {
      const roundsInput = document.getElementById('party-rounds');
      const synthCheck = document.getElementById('party-synthesize');
      body.rounds = roundsInput ? Math.max(1, Math.min(5, parseInt(roundsInput.value, 10) || 1)) : 1;
      body.synthesize = synthCheck ? synthCheck.checked : true;
    } else {
      // Chat mode
      if (state.selectedWorkflowId) {
        const wf = state.workflows.find(function (w) { return w.id === state.selectedWorkflowId; });
        if (wf) {
          body.workflowId = wf.id;
          body.agentId = wf.agent;
        }
      } else if (conv.agents && conv.agents.length > 1) {
        const replyAsSelect = document.getElementById('reply-as-select');
        body.agentId = (replyAsSelect && replyAsSelect.value) || conv.agents[0];
      } else if (conv.agents && conv.agents.length === 1) {
        body.agentId = conv.agents[0];
      }
    }

    // Reset input
    input.value = '';
    input.style.height = 'auto';

    // Deselect workflow after sending
    if (state.selectedWorkflowId) {
      state.selectedWorkflowId = null;
      input.placeholder = 'Digite uma mensagem... (Enter envia, Shift+Enter nova linha)';
      renderWorkflowBar(conv.agents || []);
    }

    // Set streaming state
    state.isStreaming = true;
    state.abortController = new AbortController();
    updateSendButtonState(true);

    const streamUrl = '/api/projects/' + state.currentProjectId + '/conversations/' + state.currentConvId + '/messages';

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (state.token) {
        headers['X-BMAD-Token'] = state.token;
      }

      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: state.abortController.signal
      });

      if (response.status === 401) {
        showAuthError();
        throw new Error('Token inválido');
      }

      if (!response.ok) {
        let errText = 'Erro ao enviar mensagem (' + response.status + ')';
        try {
          const errJson = await response.json();
          if (errJson && errJson.error) errText = errJson.error;
        } catch (_) {}
        throw new Error(errText);
      }

      // Hide empty state if visible
      const emptyState = document.getElementById('empty-state');
      if (emptyState) emptyState.style.display = 'none';

      // Read NDJSON stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;

        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep last partial line

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          try {
            const event = JSON.parse(line);
            handleStreamEvent(event);
          } catch (e) {
            console.warn('Erro ao processar linha do stream:', e, line);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer.trim());
          handleStreamEvent(event);
        } catch (_) {}
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        showToast('Geração interrompida pelo usuário.');
      } else {
        showToast('Erro no streaming: ' + err.message, 'danger');
      }
    } finally {
      state.isStreaming = false;
      state.abortController = null;
      updateSendButtonState(false);
      removeStreamingIndicators();
      // Reload conversation list to show updated title and time
      loadConversations(state.currentProjectId);
    }
  }

  function updateSendButtonState(isStreaming) {
    const btn = document.getElementById('btn-send');
    const label = document.getElementById('btn-send-label');
    if (!btn || !label) return;

    if (isStreaming) {
      btn.classList.add('streaming');
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-danger');
      label.textContent = 'Parar';
      btn.title = 'Parar geração';
    } else {
      btn.classList.remove('streaming');
      btn.classList.remove('btn-danger');
      btn.classList.add('btn-primary');
      label.textContent = 'Enviar';
      btn.title = 'Enviar mensagem';
    }
  }

  // --- Handling Orchestrator Stream Events ---
  let activeStreamingMessageId = null;
  let activeStreamingBubble = null;
  let activeStreamingBody = null;
  let activeStreamingCursor = null;
  let activeStreamingStatusEl = null;

  function handleStreamEvent(ev) {
    const list = document.getElementById('messages-list');
    if (!list) return;

    switch (ev.type) {
      case 'user': {
        // User message saved
        if (state.currentConversation) {
          state.currentConversation.messages.push(ev.message);
        }
        const userEl = createMessageElement(ev.message);
        list.appendChild(userEl);
        scrollToBottom(true);
        break;
      }

      case 'agent-start': {
        // Start of a new agent response
        activeStreamingMessageId = ev.message.id;
        if (state.currentConversation) {
          state.currentConversation.messages.push(ev.message);
        }

        const agentRow = createMessageElement(ev.message);
        list.appendChild(agentRow);

        activeStreamingBubble = agentRow.querySelector('.agent-bubble');
        activeStreamingBody = agentRow.querySelector('.message-body');

        // Append blinking cursor
        activeStreamingCursor = document.createElement('span');
        activeStreamingCursor.className = 'streaming-cursor';
        if (activeStreamingBody) {
          activeStreamingBody.appendChild(activeStreamingCursor);
        }

        scrollToBottom(true);
        break;
      }

      case 'delta': {
        if (!state.currentConversation) return;
        const msg = state.currentConversation.messages.find(function (m) {
          return m.id === ev.messageId;
        });
        if (msg) {
          msg.content = (msg.content || '') + ev.text;
          scheduleMarkdownRender(msg);
        }
        // O texto começou a chegar: some o "está pensando…"
        if (activeStreamingStatusEl) {
          activeStreamingStatusEl.remove();
          activeStreamingStatusEl = null;
        }
        break;
      }

      case 'tool': {
        if (!state.currentConversation) return;
        const msg = state.currentConversation.messages.find(function (m) {
          return m.id === ev.messageId;
        });
        if (msg) {
          if (!msg.tools) msg.tools = [];
          msg.tools.push({ name: ev.name, detail: ev.detail });

          // Update or add live tools accordion
          if (activeStreamingBubble) {
            let details = activeStreamingBubble.querySelector('.tools-details');
            if (!details) {
              details = renderToolsDetails(msg.tools);
              activeStreamingBubble.appendChild(details);
            } else {
              const summary = details.querySelector('summary');
              if (summary) {
                summary.textContent = '🔧 ' + msg.tools.length + ' ferramenta' + (msg.tools.length > 1 ? 's usadas' : ' usada');
              }
              const ul = details.querySelector('.tools-list');
              if (ul) {
                const li = document.createElement('li');
                li.className = 'tools-item';
                li.innerHTML = '<strong>' + escapeHtml(ev.name) + '</strong>: ' + escapeHtml(ev.detail || '');
                ul.appendChild(li);
              }
            }
          }
        }
        break;
      }

      case 'status': {
        if (activeStreamingBubble) {
          if (!activeStreamingStatusEl) {
            activeStreamingStatusEl = document.createElement('div');
            activeStreamingStatusEl.className = 'streaming-status';
            activeStreamingBubble.appendChild(activeStreamingStatusEl);
          }
          activeStreamingStatusEl.innerHTML = '<em>' + escapeHtml(ev.text) + '</em>';
          scrollToBottom();
        }
        break;
      }

      case 'agent-end': {
        if (!state.currentConversation) return;
        // Replace with final message
        const idx = state.currentConversation.messages.findIndex(function (m) {
          return m.id === ev.message.id;
        });
        if (idx !== -1) {
          state.currentConversation.messages[idx] = ev.message;
        }

        const row = document.getElementById('msg-' + ev.message.id);
        if (row) {
          const newRow = createMessageElement(ev.message);
          row.parentNode.replaceChild(newRow, row);
        }

        activeStreamingMessageId = null;
        activeStreamingBubble = null;
        activeStreamingBody = null;
        activeStreamingCursor = null;
        activeStreamingStatusEl = null;

        scrollToBottom();
        break;
      }

      case 'error': {
        if (activeStreamingBubble) {
          const errBox = document.createElement('div');
          errBox.className = 'message-error';
          errBox.innerHTML = '<span>⚠️</span><span>' + escapeHtml(ev.error || 'Erro na execução') + '</span>';
          activeStreamingBubble.appendChild(errBox);
        } else {
          showToast('Erro: ' + (ev.error || 'Erro desconhecido'), 'danger');
        }
        scrollToBottom();
        break;
      }

      case 'done': {
        removeStreamingIndicators();
        // A execução pode ter mudado a disponibilidade (cota, autenticação, modelo aprendido)
        loadModelCatalog();
        break;
      }
    }
  }

  function scheduleMarkdownRender(msg) {
    if (state.renderThrottleTimer) return;

    state.renderThrottleTimer = setTimeout(function () {
      state.renderThrottleTimer = null;
      if (activeStreamingBody) {
        const rendered = window.renderMarkdown ? window.renderMarkdown(msg.content || '') : escapeHtml(msg.content || '');
        activeStreamingBody.innerHTML = rendered;
        if (activeStreamingCursor) {
          activeStreamingBody.appendChild(activeStreamingCursor);
        }
      }
      scrollToBottom();
    }, 50);
  }

  function removeStreamingIndicators() {
    if (activeStreamingCursor && activeStreamingCursor.parentNode) {
      activeStreamingCursor.parentNode.removeChild(activeStreamingCursor);
    }
    if (activeStreamingStatusEl && activeStreamingStatusEl.parentNode) {
      activeStreamingStatusEl.parentNode.removeChild(activeStreamingStatusEl);
    }
    activeStreamingCursor = null;
    activeStreamingStatusEl = null;
  }

  // --- Right Panel: VS Code Live Context Polling ---
  function startVsCodePolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(function () {
      if (!document.hidden && state.currentProjectId) {
        pollVsCodeContext();
      }
    }, 3000);
    pollVsCodeContext();
  }

  async function pollVsCodeContext() {
    if (!state.currentProjectId) return;
    try {
      const data = await api('/api/projects/' + state.currentProjectId + '/vscode');

      // Active Editor & Selection
      const activeFileEl = document.getElementById('status-active-file');
      const selectionEl = document.getElementById('status-selection');
      if (data.activeEditor) {
        if (activeFileEl) {
          activeFileEl.textContent = data.activeEditor.path;
          activeFileEl.title = data.activeEditor.path;
        }
        if (selectionEl) {
          if (data.activeEditor.selection) {
            const sel = data.activeEditor.selection;
            const selText = 'L' + sel.startLine + '-' + sel.endLine;
            selectionEl.textContent = selText;
            selectionEl.title = selText;
          } else {
            selectionEl.textContent = 'Nenhuma';
          }
        }
      } else {
        if (activeFileEl) activeFileEl.textContent = 'Nenhum';
        if (selectionEl) selectionEl.textContent = 'Nenhuma';
      }

      // Diagnostics
      const diagEl = document.getElementById('status-diagnostics');
      if (diagEl) {
        const diags = data.diagnostics || [];
        const errors = diags.filter(function (d) { return d.severity === 'error'; }).length;
        const warnings = diags.filter(function (d) { return d.severity === 'warning'; }).length;
        if (errors === 0 && warnings === 0) {
          diagEl.textContent = diags.length > 0 ? diags.length + ' info' : '0';
        } else {
          diagEl.textContent = errors + ' err, ' + warnings + ' avisos';
        }
      }

      // Open Tabs
      const tabsEl = document.getElementById('status-open-tabs');
      if (tabsEl) {
        const openFiles = data.openFiles || [];
        tabsEl.textContent = openFiles.length + ' aba' + (openFiles.length === 1 ? '' : 's');
      }

      // Git Status
      const gitEl = document.getElementById('status-git-status');
      if (gitEl) {
        const gitStatus = (data.gitStatus || '').trim();
        if (!gitStatus) {
          gitEl.textContent = 'Limpo';
        } else {
          const lines = gitStatus.split('\n').filter(Boolean);
          gitEl.textContent = lines.length + ' arquivo' + (lines.length > 1 ? 's modif.' : ' modif.');
          gitEl.title = gitStatus;
        }
      }
    } catch (_) {
      // Ignore background polling errors
    }
  }

  // --- Attached Files & Code Search ---
  let fileSearchDebounce = null;

  function initFileSearch() {
    const input = document.getElementById('file-search-input');
    const resultsContainer = document.getElementById('file-search-results');
    if (!input || !resultsContainer) return;

    input.addEventListener('input', function () {
      clearTimeout(fileSearchDebounce);
      const q = input.value.trim();
      if (!q) {
        resultsContainer.innerHTML = '';
        return;
      }
      fileSearchDebounce = setTimeout(async function () {
        if (!state.currentProjectId) return;
        try {
          const files = await api('/api/projects/' + state.currentProjectId + '/files?q=' + encodeURIComponent(q));
          resultsContainer.innerHTML = '';
          if (files.length === 0) {
            resultsContainer.innerHTML = '<div style="padding:6px; font-size:11px; color:var(--text-muted);">Nenhum arquivo encontrado</div>';
            return;
          }
          files.slice(0, 20).forEach(function (f) {
            const item = document.createElement('div');
            item.className = 'search-item';
            item.textContent = f;
            item.addEventListener('click', function () {
              attachFile(f);
              input.value = '';
              resultsContainer.innerHTML = '';
            });
            resultsContainer.appendChild(item);
          });
        } catch (e) {
          console.warn('Erro na busca de arquivos:', e);
        }
      }, 250);
    });
  }

  function attachFile(path) {
    if (state.attachedFiles.indexOf(path) !== -1) {
      showToast('Arquivo já anexado');
      return;
    }
    state.attachedFiles.push(path);
    renderAttachedFiles();
  }

  function renderAttachedFiles() {
    const list = document.getElementById('attached-files-list');
    if (!list) return;
    list.innerHTML = '';

    state.attachedFiles.forEach(function (filePath, index) {
      const chip = document.createElement('div');
      chip.className = 'attached-chip';

      chip.innerHTML = [
        '<span class="attached-chip-path" title="' + escapeHtml(filePath) + '">' + escapeHtml(filePath) + '</span>',
        '<div class="attached-chip-actions">',
        '  <button type="button" class="chip-btn btn-view" title="Visualizar conteúdo" aria-label="Visualizar">👁</button>',
        '  <button type="button" class="chip-btn btn-remove" title="Remover anexo" aria-label="Remover">×</button>',
        '</div>'
      ].join('');

      chip.querySelector('.btn-view').addEventListener('click', function () {
        openFileViewerModal(filePath);
      });

      chip.querySelector('.btn-remove').addEventListener('click', function () {
        state.attachedFiles.splice(index, 1);
        renderAttachedFiles();
      });

      list.appendChild(chip);
    });
  }

  async function openFileViewerModal(filePath) {
    if (!state.currentProjectId) return;
    try {
      const data = await api('/api/projects/' + state.currentProjectId + '/file?path=' + encodeURIComponent(filePath));
      const modal = document.getElementById('modal-view-file');
      const titleEl = document.getElementById('modal-view-file-title');
      const contentEl = document.getElementById('file-view-content');
      const truncBadge = document.getElementById('file-view-truncated-badge');
      const btnOpenVscode = document.getElementById('btn-file-view-open-vscode');

      if (titleEl) titleEl.textContent = data.path;
      if (contentEl) contentEl.textContent = data.content;
      if (truncBadge) truncBadge.style.display = data.truncated ? 'inline-flex' : 'none';

      if (btnOpenVscode) {
        btnOpenVscode.onclick = async function () {
          try {
            await api('/api/projects/' + state.currentProjectId + '/actions/open', {
              method: 'POST',
              body: { path: data.path }
            });
            showToast('Arquivo aberto no editor');
          } catch (e) {
            showToast('Erro ao abrir: ' + e.message, 'danger');
          }
        };
      }

      openModal(modal);
    } catch (err) {
      showToast('Erro ao ler arquivo: ' + err.message, 'danger');
    }
  }

  function initCodeSearch() {
    const input = document.getElementById('code-search-input');
    const btn = document.getElementById('btn-code-search');
    const resultsContainer = document.getElementById('code-search-results');
    if (!input || !btn || !resultsContainer) return;

    async function doSearch() {
      const q = input.value.trim();
      if (!q || !state.currentProjectId) return;
      resultsContainer.innerHTML = '<div style="padding:6px; font-size:11px; color:var(--text-muted);">Buscando...</div>';

      try {
        const results = await api('/api/projects/' + state.currentProjectId + '/search?q=' + encodeURIComponent(q));
        resultsContainer.innerHTML = '';
        if (results.length === 0) {
          resultsContainer.innerHTML = '<div style="padding:6px; font-size:11px; color:var(--text-muted);">Nenhum resultado encontrado</div>';
          return;
        }

        results.forEach(function (res) {
          const item = document.createElement('div');
          item.className = 'search-item';
          item.title = res.path + ':' + res.line + '\n' + res.text;
          item.innerHTML = '<strong>' + escapeHtml(res.path) + ':' + res.line + '</strong> <span style="opacity:0.7;">' + escapeHtml(res.text) + '</span>';

          item.addEventListener('click', async function () {
            try {
              await api('/api/projects/' + state.currentProjectId + '/actions/open', {
                method: 'POST',
                body: { path: res.path, line: res.line }
              });
              showToast('Arquivo aberto na linha ' + res.line);
            } catch (e) {
              showToast('Erro ao abrir: ' + e.message, 'danger');
            }
          });

          resultsContainer.appendChild(item);
        });
      } catch (err) {
        resultsContainer.innerHTML = '<div style="padding:6px; font-size:11px; color:var(--danger);">Erro: ' + escapeHtml(err.message) + '</div>';
      }
    }

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
    });
  }

  // --- Modals Management ---
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('open');
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('open');
  }

  function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          closeModal(overlay);
        }
      });
    });

    document.querySelectorAll('.btn-close-modal').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const modal = btn.closest('.modal-overlay');
        if (modal) closeModal(modal);
      });
    });

    // "+ Conversa" Modal
    const btnNewConv = document.getElementById('btn-new-conv');
    const modalNewConv = document.getElementById('modal-new-conv');
    if (btnNewConv && modalNewConv) {
      btnNewConv.addEventListener('click', function () {
        openNewConvModal();
      });
    }

    // "⚙ Modelos" Modal
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const modalSettings = document.getElementById('modal-settings');
    if (btnOpenSettings && modalSettings) {
      btnOpenSettings.addEventListener('click', function () {
        openSettingsModal();
      });
    }
  }

  function openNewConvModal() {
    const modal = document.getElementById('modal-new-conv');
    const chatTab = document.getElementById('tab-mode-chat');
    const partyTab = document.getElementById('tab-mode-party');
    const chatSection = document.getElementById('chat-mode-selection');
    const partySection = document.getElementById('party-mode-selection');
    const chatAgentList = document.getElementById('new-conv-agent-list');
    const partyCheckboxes = document.getElementById('party-agent-checkboxes');
    const partyTitleInput = document.getElementById('party-title-input');
    const submitBtn = document.getElementById('btn-submit-new-conv');

    let currentTab = 'chat';
    let selectedChatAgentId = state.agents.length > 0 ? state.agents[0].id : null;

    function renderTabs() {
      chatTab.className = 'modal-tab-btn' + (currentTab === 'chat' ? ' active' : '');
      partyTab.className = 'modal-tab-btn' + (currentTab === 'party' ? ' active' : '');
      chatSection.style.display = currentTab === 'chat' ? 'block' : 'none';
      partySection.style.display = currentTab === 'party' ? 'block' : 'none';
    }

    chatTab.onclick = function () { currentTab = 'chat'; renderTabs(); };
    partyTab.onclick = function () { currentTab = 'party'; renderTabs(); };
    renderTabs();

    // Render single agent selection list
    if (chatAgentList) {
      chatAgentList.innerHTML = '';
      state.agents.forEach(function (ag) {
        const item = document.createElement('div');
        item.className = 'agent-item';
        item.style.border = '1px solid var(--border-subtle)';
        if (ag.id === selectedChatAgentId) {
          item.style.borderColor = 'var(--accent)';
          item.style.backgroundColor = 'var(--accent-subtle)';
        }

        item.innerHTML = [
          '<div class="agent-icon">' + (ag.icon || '🤖') + '</div>',
          '<div class="agent-info">',
          '  <div class="agent-name">' + escapeHtml(ag.name) + '</div>',
          '  <div class="agent-title">' + escapeHtml(ag.title || '') + '</div>',
          '</div>'
        ].join('');

        item.addEventListener('click', function () {
          selectedChatAgentId = ag.id;
          Array.from(chatAgentList.children).forEach(function (c) {
            c.style.borderColor = 'var(--border-subtle)';
            c.style.backgroundColor = 'transparent';
          });
          item.style.borderColor = 'var(--accent)';
          item.style.backgroundColor = 'var(--accent-subtle)';
        });

        chatAgentList.appendChild(item);
      });
    }

    // Render party agent checkboxes
    if (partyCheckboxes) {
      partyCheckboxes.innerHTML = '';
      state.agents.forEach(function (ag) {
        const label = document.createElement('label');
        label.className = 'toggle-label';
        label.style.padding = '6px';
        label.style.borderRadius = 'var(--radius-sm)';
        label.style.backgroundColor = 'var(--bg-card)';

        label.innerHTML = [
          '<input type="checkbox" value="' + ag.id + '">',
          '<span>' + (ag.icon || '🤖') + ' ' + escapeHtml(ag.name) + '</span>'
        ].join('');

        partyCheckboxes.appendChild(label);
      });
    }

    if (partyTitleInput) partyTitleInput.value = '';

    submitBtn.onclick = async function () {
      if (!state.currentProjectId) return;
      try {
        if (currentTab === 'chat') {
          if (!selectedChatAgentId) {
            showToast('Selecione um agente', 'danger');
            return;
          }
          const ag = state.agents.find(function (a) { return a.id === selectedChatAgentId; });
          const conv = await api('/api/projects/' + state.currentProjectId + '/conversations', {
            method: 'POST',
            body: {
              title: 'Conversa com ' + (ag ? ag.name : selectedChatAgentId),
              mode: 'chat',
              agents: [selectedChatAgentId]
            }
          });
          closeModal(modal);
          await loadConversations(state.currentProjectId);
          await selectConversation(conv.id);
        } else {
          // Party mode
          const selected = [];
          partyCheckboxes.querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) {
            selected.push(cb.value);
          });
          if (selected.length < 2) {
            showToast('Selecione pelo menos 2 agentes para o Party Mode', 'danger');
            return;
          }
          const customTitle = partyTitleInput.value.trim() || 'Discussão em equipe';
          const conv = await api('/api/projects/' + state.currentProjectId + '/conversations', {
            method: 'POST',
            body: {
              title: customTitle,
              mode: 'party',
              agents: selected
            }
          });
          closeModal(modal);
          await loadConversations(state.currentProjectId);
          await selectConversation(conv.id);
        }
      } catch (err) {
        showToast('Erro ao criar conversa: ' + err.message, 'danger');
      }
    };

    openModal(modal);
  }

  async function openSettingsModal() {
    const modal = document.getElementById('modal-settings');
    const btnRefresh = document.getElementById('btn-refresh-models');
    if (btnRefresh) btnRefresh.onclick = refreshModelCatalog;
    // Abre já com o que se sabe; se a descoberta ainda estiver rodando, re-renderiza ao terminar
    renderProviderStatusCards();
    renderAgentSettingsTable();
    setupBulkApplyAction();
    openModal(modal);
    if (!state.catalog || state.catalog.refreshing) loadModelCatalog();
  }

  function renderProviderStatusCards() {
    const container = document.getElementById('provider-status-list');
    if (!container) return;
    container.innerHTML = '';

    const refreshedEl = document.getElementById('catalog-refreshed-at');
    if (refreshedEl) {
      const cat = state.catalog || {};
      refreshedEl.textContent = cat.refreshing
        ? 'Descobrindo modelos desta sessão…'
        : cat.refreshedAt
          ? 'Modelos descobertos em ' + new Date(cat.refreshedAt).toLocaleString('pt-BR')
          : 'Modelos ainda não descobertos';
    }

    state.providers.forEach(function (prov) {
      const card = document.createElement('div');
      card.className = 'provider-card';

      const isAvail = !!prov.available;
      const statusBadge = isAvail
        ? '<span class="badge badge-success">✓ Disponível</span>'
        : '<span class="badge badge-danger">✗ Indisponível</span>';
      const models = prov.models || [];
      const unavailable = models.filter(function (m) { return !m.available; }).length;
      const countText = models.length + ' modelo' + (models.length === 1 ? '' : 's') +
        (unavailable ? ' · ' + unavailable + ' indisponíve' + (unavailable === 1 ? 'l' : 'is') : '') +
        (prov.source ? ' · via ' + prov.source : '');

      card.innerHTML = [
        '<div class="provider-card-header">',
        '  <span class="provider-card-title">' + escapeHtml(prov.label || prov.id) + '</span>',
        '  ' + statusBadge,
        '</div>',
        '<div class="provider-card-detail">' + escapeHtml(prov.detail || '') + '</div>',
        '<div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">' + escapeHtml(countText) + '</div>'
      ].join('');

      container.appendChild(card);
    });
  }

  function setupBulkApplyAction() {
    const provSelect = document.getElementById('bulk-provider-select');
    const modelSelect = document.getElementById('bulk-model-select');
    const btnApply = document.getElementById('btn-bulk-apply');

    if (provSelect) {
      const previous = provSelect.value;
      fillProviderSelect(provSelect, previous);
      fillModelSelect(modelSelect, provSelect.value, '');
      provSelect.onchange = function () {
        fillModelSelect(modelSelect, provSelect.value, '');
      };
    }

    if (btnApply) {
      btnApply.onclick = async function () {
        const provider = provSelect.value;
        const model = modelSelect.value.trim();
        if (!model) {
          showToast('Informe o modelo para aplicar a todos', 'danger');
          return;
        }

        btnApply.disabled = true;
        btnApply.textContent = 'Aplicando...';

        try {
          for (let i = 0; i < state.agents.length; i++) {
            const ag = state.agents[i];
            await api('/api/settings/agents/' + ag.id, {
              method: 'PUT',
              body: { provider: provider, model: model }
            });
            if (!state.settings.agents) state.settings.agents = {};
            state.settings.agents[ag.id] = { provider: provider, model: model };
          }
          showToast('Configurações salvas para todos os agentes!', 'success');
          renderAgentSettingsTable();
          renderTeamSection();
        } catch (err) {
          showToast('Erro ao aplicar configurações: ' + err.message, 'danger');
        } finally {
          btnApply.disabled = false;
          btnApply.textContent = 'Aplicar';
        }
      };
    }
  }

  function renderAgentSettingsTable() {
    const tbody = document.getElementById('settings-agents-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    state.agents.forEach(function (agent) {
      const tr = document.createElement('tr');
      const curSetting = (state.settings.agents && state.settings.agents[agent.id]) || {};
      const curProv = curSetting.provider || agent.defaultProvider || ((state.providers[0] || {}).id || '');
      const curModel = curSetting.model || agent.defaultModel || '';

      tr.innerHTML = [
        '<td>',
        '  <div class="settings-agent-cell">',
        '    <span>' + (agent.icon || '🤖') + '</span>',
        '    <div>',
        '      <div style="font-weight:600;">' + escapeHtml(agent.name) + '</div>',
        '      <div style="font-size:11px; color:var(--text-muted);">' + escapeHtml(agent.title || '') + '</div>',
        '    </div>',
        '  </div>',
        '</td>',
        '<td>',
        '  <select class="settings-prov-select" data-agent-id="' + agent.id + '" aria-label="Provider de ' + escapeHtml(agent.name) + '"></select>',
        '</td>',
        '<td>',
        '  <select class="settings-model-input model-select" data-agent-id="' + agent.id + '" aria-label="Modelo de ' + escapeHtml(agent.name) + '"></select>',
        '</td>',
        '<td style="text-align:center;">',
        '  <button type="button" class="btn btn-secondary btn-sm btn-test-provider" data-agent-id="' + agent.id + '">Testar</button>',
        '  <div class="test-result-inline" style="font-size:11px; margin-top:2px;"></div>',
        '</td>'
      ].join('');

      // Auto-save on change
      const provSelect = tr.querySelector('.settings-prov-select');
      const modelInput = tr.querySelector('.settings-model-input');
      fillProviderSelect(provSelect, curProv);
      fillModelSelect(modelInput, curProv, curModel);

      async function saveRowSettings() {
        const prov = provSelect.value;
        const mod = modelInput.value.trim();
        try {
          await api('/api/settings/agents/' + agent.id, {
            method: 'PUT',
            body: { provider: prov, model: mod }
          });
          if (!state.settings.agents) state.settings.agents = {};
          state.settings.agents[agent.id] = { provider: prov, model: mod };
          renderTeamSection();
        } catch (err) {
          showToast('Erro ao salvar configuração de ' + agent.name + ': ' + err.message, 'danger');
        }
      }

      provSelect.addEventListener('change', function () {
        // Troca de provider: seleciona o primeiro modelo disponível dele
        const firstAvailable = (state.providerModels[provSelect.value] || []).find(function (m) { return m.available; });
        fillModelSelect(modelInput, provSelect.value, firstAvailable ? firstAvailable.id : '');
        saveRowSettings();
      });

      modelInput.addEventListener('change', function () {
        saveRowSettings();
      });

      // Test button
      const btnTest = tr.querySelector('.btn-test-provider');
      const resultDiv = tr.querySelector('.test-result-inline');
      btnTest.addEventListener('click', async function () {
        btnTest.disabled = true;
        resultDiv.innerHTML = '<span style="color:var(--text-muted);">Testando...</span>';

        try {
          const res = await api('/api/providers/test', {
            method: 'POST',
            body: {
              provider: provSelect.value,
              model: modelInput.value.trim(),
              projectId: state.currentProjectId
            }
          });
          if (res.ok) {
            resultDiv.innerHTML = '<span style="color:var(--success);">✓ Sucesso</span>';
          } else {
            const errText = res.error || 'Erro';
            resultDiv.innerHTML = '<span style="color:var(--danger);" title="' + escapeHtml(errText) + '">✗ ' +
              escapeHtml(errText.length > 60 ? errText.slice(0, 60) + '…' : errText) + '</span>';
          }
          // O teste reverifica o modelo: atualiza o catálogo sem apagar o resultado desta linha
          try {
            applyCatalog(await api('/api/models'));
            renderTeamSection();
            renderProviderStatusCards();
            fillModelSelect(modelInput, provSelect.value, modelInput.value);
          } catch (e) {
            console.warn('Erro ao atualizar catálogo após teste:', e);
          }
        } catch (err) {
          resultDiv.innerHTML = '<span style="color:var(--danger);" title="' + escapeHtml(err.message) + '">✗ Erro</span>';
        } finally {
          btnTest.disabled = false;
        }
      });

      tbody.appendChild(tr);
    });
  }

  // --- Quick Action Buttons on Empty State ---
  function initQuickActions() {
    document.querySelectorAll('.quick-btn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const action = btn.getAttribute('data-action');
        if (!state.currentProjectId) return;

        try {
          if (action === 'brainstorm') {
            // Carson (analyst)
            const carson = state.agents.find(function (a) {
              return a.id === 'analyst' || a.id === 'carson' || (a.name && a.name.toLowerCase().indexOf('carson') !== -1);
            }) || state.agents[0];

            if (carson) handleAgentClick(carson);

          } else if (action === 'architecture') {
            // Party: Winston, James, Quinn
            const winston = state.agents.find(function (a) { return a.id === 'architect' || (a.name && a.name.indexOf('Winston') !== -1); });
            const james = state.agents.find(function (a) { return a.id === 'dev' || (a.name && a.name.indexOf('James') !== -1); });
            const quinn = state.agents.find(function (a) { return a.id === 'qa' || a.id === 'tester' || (a.name && a.name.indexOf('Quinn') !== -1); });

            const partyAgents = [winston, james, quinn].filter(Boolean).map(function (a) { return a.id; });
            if (partyAgents.length < 2) {
              partyAgents.push(state.agents[0].id);
              if (state.agents[1]) partyAgents.push(state.agents[1].id);
            }

            const conv = await api('/api/projects/' + state.currentProjectId + '/conversations', {
              method: 'POST',
              body: {
                title: 'Discussão de Arquitetura',
                mode: 'party',
                agents: partyAgents
              }
            });
            await loadConversations(state.currentProjectId);
            await selectConversation(conv.id);

          } else if (action === 'review') {
            // Quinn (tester/qa)
            const quinn = state.agents.find(function (a) {
              return a.id === 'qa' || a.id === 'tester' || (a.name && a.name.indexOf('Quinn') !== -1);
            }) || state.agents[0];

            if (quinn) handleAgentClick(quinn);

          } else if (action === 'prd') {
            // John (pm)
            const john = state.agents.find(function (a) {
              return a.id === 'pm' || (a.name && a.name.indexOf('John') !== -1);
            }) || state.agents[0];

            if (john) {
              const conv = await api('/api/projects/' + state.currentProjectId + '/conversations', {
                method: 'POST',
                body: {
                  title: 'Criar PRD com ' + john.name,
                  mode: 'chat',
                  agents: [john.id]
                }
              });
              await loadConversations(state.currentProjectId);
              await selectConversation(conv.id);

              // Auto-select PRD workflow if exists
              const prdWorkflow = state.workflows.find(function (w) { return w.id === 'prd'; });
              if (prdWorkflow) {
                toggleWorkflow(prdWorkflow);
              }
            }
          }
        } catch (err) {
          showToast('Erro ao iniciar fluxo: ' + err.message, 'danger');
        }
      });
    });
  }

  // --- Code Blocks & Delegated Events ---
  function initCodeBlockActions() {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    messagesContainer.addEventListener('click', async function (e) {
      // 1. File links <a class="file-link">
      const fileLink = e.target.closest('.file-link');
      if (fileLink) {
        e.preventDefault();
        const path = fileLink.getAttribute('data-path');
        const lineAttr = fileLink.getAttribute('data-line');
        const line = lineAttr ? parseInt(lineAttr, 10) : undefined;
        if (path && state.currentProjectId) {
          try {
            await api('/api/projects/' + state.currentProjectId + '/actions/open', {
              method: 'POST',
              body: { path: path, line: line }
            });
            showToast('Arquivo aberto no editor' + (line ? ' (linha ' + line + ')' : ''));
          } catch (err) {
            showToast('Erro ao abrir arquivo: ' + err.message, 'danger');
          }
        }
        return;
      }

      // 2. Code Block buttons
      const codeBtn = e.target.closest('.code-btn');
      if (!codeBtn) return;

      const codeBlock = codeBtn.closest('.code-block');
      if (!codeBlock) return;

      const codeEl = codeBlock.querySelector('code');
      const codeText = codeEl ? codeEl.innerText : '';

      if (codeBtn.classList.contains('btn-code-copy')) {
        copyToClipboard(codeText);
      } else if (codeBtn.classList.contains('btn-code-insert')) {
        if (!state.currentProjectId) return;
        try {
          await api('/api/projects/' + state.currentProjectId + '/actions/insert', {
            method: 'POST',
            body: { text: codeText }
          });
          showToast('Código inserido no cursor!', 'success');
        } catch (err) {
          showToast('Erro ao inserir: ' + err.message, 'danger');
        }
      } else if (codeBtn.classList.contains('btn-code-diff')) {
        if (!state.currentProjectId) return;
        const targetPath = prompt('Caminho do arquivo no projeto para comparar (Diff):', '');
        if (!targetPath) return;
        try {
          await api('/api/projects/' + state.currentProjectId + '/actions/diff', {
            method: 'POST',
            body: { path: targetPath.trim(), content: codeText }
          });
          showToast('Comparação de diff aberta no editor');
        } catch (err) {
          showToast('Erro no diff: ' + err.message, 'danger');
        }
      } else if (codeBtn.classList.contains('btn-code-save')) {
        if (!state.currentProjectId) return;
        const targetPath = prompt('Caminho do arquivo para salvar o código:', '');
        if (!targetPath) return;
        try {
          const res = await api('/api/projects/' + state.currentProjectId + '/actions/save', {
            method: 'POST',
            body: { path: targetPath.trim(), content: codeText }
          });
          showToast('Arquivo salvo: ' + res.path, 'success');
        } catch (err) {
          showToast('Erro ao salvar: ' + err.message, 'danger');
        }
      }
    });
  }

  // --- Drawers & Responsive Panel Controls ---
  function closeDrawers() {
    const leftSidebar = document.getElementById('sidebar-left');
    const rightPanel = document.getElementById('panel-right');
    const backdrop = document.getElementById('drawer-backdrop');

    if (leftSidebar) leftSidebar.classList.remove('drawer-open');
    if (rightPanel) rightPanel.classList.remove('drawer-open');
    if (backdrop) backdrop.classList.remove('active');
  }

  function initResponsiveDrawers() {
    const btnMobileMenu = document.getElementById('btn-mobile-menu');
    const btnMobileContext = document.getElementById('btn-mobile-context');
    const backdrop = document.getElementById('drawer-backdrop');
    const leftSidebar = document.getElementById('sidebar-left');
    const rightPanel = document.getElementById('panel-right');
    const btnCollapsePanel = document.getElementById('btn-collapse-panel');
    const btnDesktopTogglePanel = document.getElementById('btn-desktop-toggle-panel');

    if (btnMobileMenu && leftSidebar && backdrop) {
      btnMobileMenu.addEventListener('click', function () {
        leftSidebar.classList.toggle('drawer-open');
        backdrop.classList.toggle('active', leftSidebar.classList.contains('drawer-open'));
      });
    }

    if (btnMobileContext && rightPanel && backdrop) {
      btnMobileContext.addEventListener('click', function () {
        rightPanel.classList.toggle('drawer-open');
        backdrop.classList.toggle('active', rightPanel.classList.contains('drawer-open'));
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', function () {
        closeDrawers();
      });
    }

    // Desktop collapse toggle
    if (btnCollapsePanel && rightPanel) {
      btnCollapsePanel.addEventListener('click', function () {
        rightPanel.classList.add('collapsed');
      });
    }

    if (btnDesktopTogglePanel && rightPanel) {
      btnDesktopTogglePanel.addEventListener('click', function () {
        rightPanel.classList.toggle('collapsed');
      });
    }
  }

  // --- Auto-expanding Textarea & Keyboard handling ---
  function initComposer() {
    const input = document.getElementById('composer-input');
    const btnSend = document.getElementById('btn-send');
    if (!input || !btnSend) return;

    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    btnSend.addEventListener('click', function () {
      sendMessage();
    });
  }

  // --- Attach all event listeners ---
  function setupEventListeners() {
    initResponsiveDrawers();
    initComposer();
    initFileSearch();
    initCodeSearch();
    initModals();
    initQuickActions();
    initCodeBlockActions();
  }

  // Initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
  } else {
    bootstrapApp();
  }

})();
