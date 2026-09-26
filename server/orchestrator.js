/**
 * BMAD Studio — Orquestrador de Mensagens, Sessões e Workflows
 * 
 * Implementa a orquestração de chat, party (discussão em grupo),
 * workflows, sessões de CLI, system prompts e testes de providers.
 */

const { getProvider } = require('./providers/index.js');
const { buildContext } = require('./context.js');
const { renderWorkflow } = require('./workflows.js');

/**
 * Gera um ID único no formato: timestamp em base 36 + aleatório em base 36 (6 chars)
 */
function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Constrói o System Prompt completo para um agente:
 * 1. Persona completa do agente
 * 2. Regras do ambiente (projeto, caminho, permissões de edição, formato de arquivo:linha, pt-BR, markdown)
 * 3. Lista da equipe BMAD para suporte a handoff
 */
function buildSystemPrompt(agent, project, agentsList) {
  const parts = [];

  // Persona
  parts.push(agent.persona || `Você é ${agent.name}, ${agent.title}.`);

  // Regras do ambiente
  const canEdit = Boolean(agent.canEdit && agent.canEdit !== 'false');
  const permissionsText = canEdit
    ? 'Você TEM permissão para editar arquivos no projeto quando solicitado.'
    : 'Você está em modo SOMENTE LEITURA (não edite arquivos diretamente).';

  parts.push(`## Regras do Ambiente
- Projeto atual: ${project.name || 'Projeto'} (${project.path || ''})
- Permissões: ${permissionsText}
- Sempre referencie caminhos de arquivos relativos à raiz do projeto com barras normais (ex.: src/app.js) e linhas como \`caminho:linha\`.
- Responda sempre em português do Brasil (pt-BR).
- Use formatação Markdown clara e legível.`);

  // Lista da equipe BMAD
  if (Array.isArray(agentsList) && agentsList.length > 0) {
    const teamMembers = agentsList.map(a => {
      const desc = a.whenToUse ? ` — Quando acionar: ${a.whenToUse}` : '';
      return `- **${a.name}** (\`${a.id}\`), ${a.title || 'Agente'}${desc}`;
    }).join('\n');

    parts.push(`## Equipe BMAD
Você faz parte de uma equipe multidisciplinar. Quando o assunto fugir da sua especialidade ou for a próxima etapa de um fluxo, sugira ao usuário transferir ou envolver o colega apropriado:
${teamMembers}`);
  }

  return parts.join('\n\n');
}

/**
 * Constrói a transcrição de mensagens de uma conversa para o Party Mode
 */
function buildPartyTranscript(messages, agentsList) {
  const parts = [];
  for (const m of messages || []) {
    if (m.role === 'user') {
      parts.push(`**Usuário:**\n${m.content}`);
    } else if (m.role === 'agent') {
      if (!m.content && m.error) continue;
      const author = (agentsList || []).find(a => a.id === m.agentId);
      const authorName = author ? author.name : (m.agentId || 'Assistente');
      const authorTitle = author ? ` (${author.title})` : '';
      parts.push(`**${authorName}${authorTitle}:**\n${m.content}`);
    }
  }
  return parts.join('\n\n');
}

/**
 * Cria a instância do orquestrador
 * @param {object} ctx - Contexto global { env, workspace, store, settings, agents, workflows, reload }
 */
function createOrchestrator(ctx) {
  const contextObj = ctx || {};
  const getAgents = () => contextObj.agents || [];
  const getWorkflows = () => contextObj.workflows || [];

  /**
   * Executa o provider consultando o catálogo de modelos: falha rápido (com motivo) se o modelo
   * já é sabidamente indisponível e registra o resultado da execução (cota, auth, sucesso).
   */
  async function runWithCatalog(providerId, provider, model, runOpts, { skipCheck = false } = {}) {
    const catalog = contextObj.models;
    if (catalog && !skipCheck) {
      const st = catalog.check(providerId, model);
      if (!st.available) {
        const back = st.until ? ` — volta por volta de ${new Date(st.until).toLocaleString('pt-BR')}` : '';
        throw new Error(
          `Modelo "${model || 'padrão'}" (${providerId}) indisponível: ${st.reason || 'motivo desconhecido'}${back}. ` +
          'Troque o modelo do agente em ⚙ Modelos ou clique em "Atualizar lista".'
        );
      }
    }
    try {
      const result = await provider.run(runOpts);
      if (catalog) catalog.markSuccess(providerId, model);
      return result;
    } catch (err) {
      if (catalog) catalog.markFromError(providerId, model, err && err.message);
      throw err;
    }
  }

  /**
   * Envia uma mensagem em modo chat individual
   */
  async function sendMessage({ projectId, convId, text, context, agentId, workflowId, signal, emit = () => {} }) {
    if (signal?.aborted) {
      emit({ type: 'status', text: 'Cancelado' });
      return;
    }

    const conv = await contextObj.store.get(projectId, convId);
    if (!conv) {
      throw new Error(`Conversa '${convId}' não encontrada no projeto '${projectId}'`);
    }

    // Se houver workflowId, renderizar template e mesclar contextos do workflow
    let processedText = text;
    let effectiveContext = context;
    let workflowName = null;

    if (workflowId) {
      const wf = getWorkflows().find(w => w.id === workflowId);
      if (wf) {
        workflowName = wf.name;
        processedText = renderWorkflow(wf, text);
        if (!agentId && wf.agent) {
          agentId = wf.agent;
        }

        let wfContextKeys = [];
        if (Array.isArray(wf.context)) {
          wfContextKeys = wf.context;
        } else if (typeof wf.context === 'string') {
          wfContextKeys = wf.context.split(',').map(s => s.trim()).filter(Boolean);
        }

        const merged = (effectiveContext && typeof effectiveContext === 'object' && !effectiveContext.text)
          ? { ...effectiveContext }
          : {};
        for (const k of wfContextKeys) {
          merged[k] = true;
        }
        effectiveContext = merged;
      }
    }

    // Resolução de contexto
    let contextText = '';
    let contextLabels = [];
    if (effectiveContext) {
      if (typeof effectiveContext.text === 'string') {
        contextText = effectiveContext.text;
        contextLabels = Array.isArray(effectiveContext.labels) ? effectiveContext.labels : [];
      } else if (typeof effectiveContext === 'object') {
        try {
          const built = await buildContext(contextObj.workspace, projectId, effectiveContext);
          if (built) {
            contextText = built.text || '';
            contextLabels = Array.isArray(built.labels) ? built.labels : [];
          }
        } catch (e) {
          // Erro na construção de contexto não impede o envio da mensagem
        }
      }
    }

    // Identificação do agente
    const targetAgentId = agentId || (conv.agents && conv.agents[0]);
    if (!targetAgentId) {
      throw new Error('Nenhum agente especificado ou configurado na conversa');
    }

    const agent = getAgents().find(a => a.id === targetAgentId);
    if (!agent) {
      throw new Error(`Agente '${targetAgentId}' não encontrado`);
    }

    // Cria e persiste mensagem do usuário
    const userMessage = {
      id: createId(),
      role: 'user',
      // A bolha mostra o que o usuário digitou; o template do workflow vai só no prompt
      content: text || (workflowName ? `Executar workflow: ${workflowName}` : ''),
      workflow: workflowName || undefined,
      ts: Date.now(),
      context: contextLabels.length > 0 ? contextLabels : undefined
    };

    conv.messages = conv.messages || [];
    conv.messages.push(userMessage);

    // Título automático na primeira mensagem se ainda for "Nova conversa"
    if (!conv.title || conv.title === 'Nova conversa') {
      const clean = ((workflowName ? workflowName + ': ' : '') + (text || '')).replace(/\s+/g, ' ').trim();
      conv.title = clean.slice(0, 60) || 'Nova conversa';
    }

    await contextObj.store.save(projectId, conv);
    emit({ type: 'user', message: userMessage });

    if (signal?.aborted) {
      emit({ type: 'status', text: 'Cancelado' });
      return;
    }

    // Obter configuração do provider e model
    const agentSettings = contextObj.settings.get(targetAgentId);
    const providerId = agentSettings.provider;
    const model = agentSettings.model;

    const provider = getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider '${providerId}' não encontrado ou não suportado`);
    }

    // Sessão CLI reaproveitada se mesmo provider e model
    conv.providerSessions = conv.providerSessions || {};
    const existingSession = conv.providerSessions[targetAgentId];
    let sessionId = null;
    if (
      existingSession &&
      existingSession.provider === providerId &&
      existingSession.model === model &&
      existingSession.sessionId
    ) {
      sessionId = existingSession.sessionId;
    }

    // Obter dados do projeto
    const projects = await contextObj.workspace.listProjects();
    const project = projects.find(p => String(p.id) === String(projectId)) || { id: projectId, name: 'Projeto', path: '' };

    // Constrói system prompt
    const systemPrompt = buildSystemPrompt(agent, project, getAgents());

    // Histórico de mensagens anteriores (máx 30)
    const prevMsgs = conv.messages.slice(0, -1).slice(-30);

    let historyBlock = '';
    if (prevMsgs.length > 0) {
      const formattedHistory = prevMsgs.map(m => {
        if (m.role === 'user') {
          return `### Usuário\n${m.content}`;
        } else if (m.role === 'agent') {
          const author = getAgents().find(a => a.id === m.agentId);
          const authorHeader = author
            ? `### ${author.name} (${author.title})`
            : (m.agentId ? `### ${m.agentId}` : '### Assistente');
          return `${authorHeader}\n${m.content}`;
        } else {
          return `### Sistema\n${m.content}`;
        }
      });
      historyBlock = `## Histórico da conversa\n${formattedHistory.join('\n\n')}`;
    }

    let contextBlock = '';
    if (contextText && contextText.trim()) {
      contextBlock = `## Contexto do VS Code\n${contextText.trim()}`;
    }

    const userBlock = `## Mensagem atual do usuário\n${processedText}`;

    // Prompt para sessão nova (sem system prompt embutido)
    const promptParts = [];
    if (historyBlock) promptParts.push(historyBlock);
    if (contextBlock) promptParts.push(contextBlock);
    promptParts.push(userBlock);
    const fullPrompt = promptParts.join('\n\n');

    // Resume prompt para retomada de sessão existente: contexto (se houver) + mensagem atual
    const resumePrompt = contextBlock ? `${contextBlock}\n\n${processedText}` : processedText;

    // Messages para formato OpenAI
    const openAiMessages = [];
    for (const m of prevMsgs) {
      if (m.role === 'user') {
        openAiMessages.push({ role: 'user', content: m.content });
      } else if (m.role === 'agent') {
        let content = m.content || '';
        if (m.agentId !== targetAgentId) {
          const author = getAgents().find(a => a.id === m.agentId);
          const authorName = author ? author.name : (m.agentId || 'Assistente');
          content = `[${authorName}]: ${content}`;
        }
        openAiMessages.push({ role: 'assistant', content });
      }
    }
    openAiMessages.push({ role: 'user', content: resumePrompt });

    // Mensagem de início do agente
    const agentMessage = {
      id: createId(),
      role: 'agent',
      agentId: targetAgentId,
      content: '',
      ts: Date.now(),
      provider: providerId,
      model: model || undefined,
      tools: []
    };
    conv.messages.push(agentMessage);
    emit({ type: 'agent-start', message: agentMessage });
    emit({ type: 'status', messageId: agentMessage.id, text: `${agent.name} está pensando…` });

    try {
      const result = await runWithCatalog(providerId, provider, model, {
        env: contextObj.env,
        model,
        systemPrompt,
        prompt: fullPrompt,
        resumePrompt,
        sessionId,
        messages: openAiMessages,
        cwd: project.path || process.cwd(),
        canEdit: Boolean(agent.canEdit && agent.canEdit !== 'false'),
        workspace: contextObj.workspace,
        projectId,
        signal,
        onEvent: (ev) => {
          if (ev.type === 'delta') {
            agentMessage.content += ev.text;
            emit({ type: 'delta', messageId: agentMessage.id, text: ev.text });
          } else if (ev.type === 'tool') {
            agentMessage.tools = agentMessage.tools || [];
            agentMessage.tools.push({ name: ev.name, detail: ev.detail });
            emit({ type: 'tool', messageId: agentMessage.id, name: ev.name, detail: ev.detail });
          } else if (ev.type === 'status') {
            emit({ type: 'status', messageId: agentMessage.id, text: ev.text });
          }
        }
      });

      if (result && result.text && !agentMessage.content) {
        agentMessage.content = result.text;
      }

      if (result && result.sessionId) {
        conv.providerSessions[targetAgentId] = {
          provider: providerId,
          model,
          sessionId: result.sessionId
        };
      }
    } catch (err) {
      agentMessage.error = err.message || String(err);
      emit({ type: 'error', messageId: agentMessage.id, error: agentMessage.error });
    } finally {
      await contextObj.store.save(projectId, conv);
      emit({ type: 'agent-end', message: agentMessage });
    }
  }

  /**
   * Executa uma discussão em grupo (Party Mode)
   */
  async function runParty({
    projectId,
    convId,
    text,
    context,
    rounds = 1,
    moderator = 'bmad-master',
    synthesize = true,
    signal,
    emit = () => {}
  }) {
    if (signal?.aborted) {
      emit({ type: 'status', text: 'Cancelado' });
      return;
    }

    const conv = await contextObj.store.get(projectId, convId);
    if (!conv) {
      throw new Error(`Conversa '${convId}' não encontrada no projeto '${projectId}'`);
    }

    const agentIds = conv.agents || [];
    if (agentIds.length === 0) {
      throw new Error('Nenhum agente configurado para a discussão (party)');
    }

    // Resolução de contexto
    let contextText = '';
    let contextLabels = [];
    if (context) {
      if (typeof context.text === 'string') {
        contextText = context.text;
        contextLabels = Array.isArray(context.labels) ? context.labels : [];
      } else if (typeof context === 'object') {
        try {
          const built = await buildContext(contextObj.workspace, projectId, context);
          if (built) {
            contextText = built.text || '';
            contextLabels = Array.isArray(built.labels) ? built.labels : [];
          }
        } catch (e) {
          // Erro na construção de contexto não impede o envio da mensagem
        }
      }
    }

    // Salva mensagem do usuário uma única vez
    const userMessage = {
      id: createId(),
      role: 'user',
      content: text,
      ts: Date.now(),
      context: contextLabels.length > 0 ? contextLabels : undefined
    };

    conv.messages = conv.messages || [];
    conv.messages.push(userMessage);

    if (!conv.title || conv.title === 'Nova conversa') {
      const clean = text.replace(/\s+/g, ' ').trim();
      conv.title = clean.slice(0, 60) || 'Nova conversa';
    }

    await contextObj.store.save(projectId, conv);
    emit({ type: 'user', message: userMessage });

    const projects = await contextObj.workspace.listProjects();
    const project = projects.find(p => String(p.id) === String(projectId)) || { id: projectId, name: 'Projeto', path: '' };

    // Execução das rodadas da discussão
    for (let round = 1; round <= rounds; round++) {
      for (const agentId of agentIds) {
        if (signal?.aborted) {
          emit({ type: 'status', text: 'Cancelado' });
          return;
        }

        const agent = getAgents().find(a => a.id === agentId);
        if (!agent) {
          emit({ type: 'error', error: `Agente '${agentId}' não encontrado` });
          continue;
        }


        // Bloco de contexto: completo apenas na 1ª rodada
        let contextSection = '';
        if (contextText && contextText.trim()) {
          if (round === 1) {
            contextSection = `## Contexto do VS Code\n${contextText.trim()}`;
          } else {
            contextSection = `## Contexto do VS Code\n(contexto fornecido no início)`;
          }
        }

        const transcript = buildPartyTranscript(conv.messages, getAgents());

        const participants = agentIds
          .map(id => getAgents().find(a => a.id === id))
          .filter(a => a && a.id !== agent.id)
          .map(a => `${a.name} (${a.title})`);
        const turnInstructions = `## Instruções para o seu turno
- Fale estritamente em personagem como ${agent.name} (${agent.title}).
- Participantes desta discussão além de você: ${participants.join(', ') || 'nenhum'} e o usuário. Dirija-se a eles pelo nome; não fale com quem não está na discussão.
- Concorde ou discorde apresentando argumentos técnicos embasados na sua especialidade.
- Traga algo novo para a discussão sem apenas repetir o que já foi dito.
- Mantenha sua fala concisa e focada (máximo de 250 palavras).`;

        const promptSections = [
          `## Tópico da discussão\n${text}`
        ];
        if (contextSection) promptSections.push(contextSection);
        if (transcript) promptSections.push(`## Transcrição da discussão\n${transcript}`);
        promptSections.push(turnInstructions);

        const partyPrompt = promptSections.join('\n\n');

        const systemPrompt = buildSystemPrompt(agent, project, getAgents());
        const agentSettings = contextObj.settings.get(agentId);
        const providerId = agentSettings.provider;
        const model = agentSettings.model;

        const provider = getProvider(providerId);
        if (!provider) {
          emit({ type: 'error', error: `Provider '${providerId}' para agente '${agentId}' não encontrado` });
          continue;
        }

        const agentMessage = {
          id: createId(),
          role: 'agent',
          agentId,
          content: '',
          ts: Date.now(),
          provider: providerId,
          model: model || undefined,
          tools: []
        };
        conv.messages.push(agentMessage);
        emit({ type: 'agent-start', message: agentMessage });
        emit({ type: 'status', messageId: agentMessage.id, text: `Rodada ${round}/${rounds} — ${agent.name} está pensando…` });

        try {
          // Party não usa sessões CLI (sempre prompt completo)
          const result = await runWithCatalog(providerId, provider, model, {
            env: contextObj.env,
            model,
            systemPrompt,
            prompt: partyPrompt,
            resumePrompt: null,
            sessionId: null,
            messages: [{ role: 'user', content: partyPrompt }],
            cwd: project.path || process.cwd(),
            canEdit: Boolean(agent.canEdit && agent.canEdit !== 'false'),
            workspace: contextObj.workspace,
            projectId,
            signal,
            onEvent: (ev) => {
              if (ev.type === 'delta') {
                agentMessage.content += ev.text;
                emit({ type: 'delta', messageId: agentMessage.id, text: ev.text });
              } else if (ev.type === 'tool') {
                agentMessage.tools = agentMessage.tools || [];
                agentMessage.tools.push({ name: ev.name, detail: ev.detail });
                emit({ type: 'tool', messageId: agentMessage.id, name: ev.name, detail: ev.detail });
              } else if (ev.type === 'status') {
                emit({ type: 'status', messageId: agentMessage.id, text: ev.text });
              }
            }
          });

          if (result && result.text && !agentMessage.content) {
            agentMessage.content = result.text;
          }
        } catch (err) {
          agentMessage.error = err.message || String(err);
          emit({ type: 'error', messageId: agentMessage.id, error: agentMessage.error });
        } finally {
          await contextObj.store.save(projectId, conv);
          emit({ type: 'agent-end', message: agentMessage });
        }
      }
    }

    // Síntese do moderador
    if (synthesize) {
      if (signal?.aborted) {
        emit({ type: 'status', text: 'Cancelado' });
        return;
      }

      let modAgent = getAgents().find(a => a.id === moderator);
      if (!modAgent) {
        const fallbackId = (conv.agents && conv.agents[0]) || (getAgents()[0] && getAgents()[0].id);
        modAgent = getAgents().find(a => a.id === fallbackId);
      }

      if (modAgent) {
        const modAgentId = modAgent.id;

        const fullTranscript = buildPartyTranscript(conv.messages, getAgents());

        const synthInstructions = `## Instruções de Síntese
Você é o moderador desta discussão. Analise todas as contribuições da equipe e elabore uma síntese estruturada contendo:
- Consensos alcançados
- Divergências ou pontos de atenção em aberto
- Decisões tomadas ou recomendadas
- Próximos passos práticos, indicando o agente BMAD responsável por cada ação

Inicie sua resposta obrigatoriamente com o cabeçalho:
## Síntese da discussão`;

        const synthSections = [
          `## Tópico original da discussão\n${text}`
        ];
        if (contextText && contextText.trim()) {
          synthSections.push(`## Contexto do VS Code\n(contexto fornecido no início)`);
        }
        synthSections.push(`## Transcrição da discussão completa\n${fullTranscript}`);
        synthSections.push(synthInstructions);

        const synthPrompt = synthSections.join('\n\n');

        const systemPrompt = buildSystemPrompt(modAgent, project, getAgents());
        const agentSettings = contextObj.settings.get(modAgentId);
        const providerId = agentSettings.provider;
        const model = agentSettings.model;

        const provider = getProvider(providerId);
        if (!provider) {
          emit({ type: 'error', error: `Provider '${providerId}' para moderador não encontrado` });
          return;
        }

        const modMessage = {
          id: createId(),
          role: 'agent',
          agentId: modAgentId,
          content: '',
          ts: Date.now(),
          provider: providerId,
          model: model || undefined,
          tools: []
        };
        conv.messages.push(modMessage);
        emit({ type: 'agent-start', message: modMessage });
        emit({ type: 'status', messageId: modMessage.id, text: `Moderador (${modAgent.name}) elaborando a síntese…` });

        try {
          const result = await runWithCatalog(providerId, provider, model, {
            env: contextObj.env,
            model,
            systemPrompt,
            prompt: synthPrompt,
            resumePrompt: null,
            sessionId: null,
            messages: [{ role: 'user', content: synthPrompt }],
            cwd: project.path || process.cwd(),
            canEdit: Boolean(modAgent.canEdit && modAgent.canEdit !== 'false'),
            workspace: contextObj.workspace,
            projectId,
            signal,
            onEvent: (ev) => {
              if (ev.type === 'delta') {
                modMessage.content += ev.text;
                emit({ type: 'delta', messageId: modMessage.id, text: ev.text });
              } else if (ev.type === 'tool') {
                modMessage.tools = modMessage.tools || [];
                modMessage.tools.push({ name: ev.name, detail: ev.detail });
                emit({ type: 'tool', messageId: modMessage.id, name: ev.name, detail: ev.detail });
              } else if (ev.type === 'status') {
                emit({ type: 'status', messageId: modMessage.id, text: ev.text });
              }
            }
          });

          if (result && result.text && !modMessage.content) {
            modMessage.content = result.text;
          }

          if (modMessage.content && !modMessage.content.trim().startsWith('## Síntese da discussão')) {
            modMessage.content = `## Síntese da discussão\n\n${modMessage.content.trim()}`;
          }
        } catch (err) {
          modMessage.error = err.message || String(err);
          emit({ type: 'error', messageId: modMessage.id, error: modMessage.error });
        } finally {
          await contextObj.store.save(projectId, conv);
          emit({ type: 'agent-end', message: modMessage });
        }
      }
    }
  }

  /**
   * Testa a conectividade de um provider específico
   */
  async function testProvider({ provider, model, projectId, signal }) {
    try {
      const p = getProvider(provider);
      if (!p) {
        return { ok: false, error: `Provider '${provider}' não encontrado` };
      }

      let cwd = process.cwd();
      if (projectId && contextObj.workspace?.listProjects) {
        try {
          const projects = await contextObj.workspace.listProjects();
          const found = projects.find(pr => String(pr.id) === String(projectId));
          if (found && found.path) {
            cwd = found.path;
          }
        } catch (e) {
          // Fallback para process.cwd()
        }
      }

      const testExpected = `OK — ${provider}/${model || 'default'} funcionando.`;
      const prompt = `Responda apenas com: ${testExpected}`;
      const systemPrompt = 'Você é um assistente testando conectividade. Responda exatamente como instruído.';

      const result = await runWithCatalog(provider, p, model, {
        env: contextObj.env,
        model,
        systemPrompt,
        prompt,
        resumePrompt: null,
        sessionId: null,
        messages: [{ role: 'user', content: prompt }],
        cwd,
        canEdit: false,
        workspace: contextObj.workspace,
        projectId,
        signal,
        onEvent: () => {}
      }, { skipCheck: true }); // "Testar" sempre executa de verdade: é assim que se reverifica um modelo

      return {
        ok: true,
        text: (result && result.text) ? result.text.trim() : testExpected
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || String(err)
      };
    }
  }

  return {
    sendMessage,
    runParty,
    testProvider
  };
}

module.exports = {
  createOrchestrator
};
