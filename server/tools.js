/**
 * Retorna as definições das ferramentas no formato esperado pela API de Function Calling da OpenAI.
 * @param {object} [opts]
 * @param {boolean} [opts.canEdit=false]
 * @returns {Array<object>}
 */
function getToolDefinitions({ canEdit } = {}) {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'list_files',
        description: 'Lista caminhos relativos dos arquivos do projeto, com opção de filtrar por texto no caminho (máximo 500 arquivos).',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Termo para filtrar caminhos de arquivo (opcional, busca substring case-insensitive).'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Lê o conteúdo textual de um arquivo do projeto (limite de 200 KB).',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Caminho relativo do arquivo a ser lido (ex.: src/index.js).'
            }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_text',
        description: 'Pesquisa ocorrências de um texto literal nos arquivos do projeto e retorna no formato caminho:linha: texto.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Texto literal a ser pesquisado (case-insensitive).'
            }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_diagnostics',
        description: 'Retorna a lista de diagnósticos, erros e alertas atuais do projeto.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'git_diff',
        description: 'Retorna as alterações de código (git diff) no repositório.',
        parameters: {
          type: 'object',
          properties: {
            staged: {
              type: 'boolean',
              description: 'Se true, traz apenas alterações em stage (--cached). Se false, traz alterações não staged e arquivos novos não rastreados.'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'git_status',
        description: 'Retorna o status atual do repositório Git do projeto.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    }
  ];

  if (canEdit) {
    tools.push({
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Cria ou sobrescreve um arquivo no projeto com o conteúdo fornecido.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Caminho relativo do arquivo (ex.: src/utils.js).'
            },
            content: {
              type: 'string',
              description: 'Conteúdo textual completo a ser gravado no arquivo.'
            }
          },
          required: ['path', 'content']
        }
      }
    });
  }

  return tools;
}

/**
 * Executa uma ferramenta com os argumentos passados.
 * Retorna resultado textual (máx 60 000 caracteres).
 * Em caso de erro, retorna string iniciando com "ERRO: ...".
 *
 * @param {string} name
 * @param {object|string} args
 * @param {object} context
 * @param {object} context.workspace
 * @param {string} context.projectId
 * @param {boolean} [context.canEdit]
 * @returns {Promise<string>}
 */
async function executeTool(name, args, { workspace, projectId, canEdit } = {}) {
  try {
    if (!workspace) {
      throw new Error('Workspace não disponível para execução da ferramenta');
    }

    let parsedArgs = args;
    if (typeof args === 'string') {
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        parsedArgs = {};
      }
    }
    parsedArgs = parsedArgs || {};

    let output = '';

    switch (name) {
      case 'list_files': {
        const query = parsedArgs.query ? String(parsedArgs.query) : undefined;
        const files = await workspace.listFiles(projectId, { query, max: 500 });
        const list = Array.isArray(files) ? files.slice(0, 500) : [];
        output = list.length > 0 ? list.join('\n') : 'Nenhum arquivo encontrado.';
        break;
      }

      case 'read_file': {
        if (!parsedArgs.path) {
          throw new Error('Parâmetro "path" é obrigatório');
        }
        const file = await workspace.readFile(projectId, parsedArgs.path);
        output = file.content;
        if (file.truncated) {
          output += '\n\n[... truncado: arquivo excede 200 KB]';
        }
        break;
      }

      case 'search_text': {
        if (!parsedArgs.query) {
          throw new Error('Parâmetro "query" é obrigatório');
        }
        const results = await workspace.searchText(projectId, parsedArgs.query, { max: 100 });
        if (!Array.isArray(results) || results.length === 0) {
          output = 'Nenhuma ocorrência encontrada.';
        } else {
          output = results.map(r => `${r.path}:${r.line}: ${r.text}`).join('\n');
        }
        break;
      }

      case 'get_diagnostics': {
        const diags = await workspace.getDiagnostics(projectId);
        if (!Array.isArray(diags) || diags.length === 0) {
          output = 'Nenhum diagnóstico encontrado.';
        } else {
          const limited = diags.slice(0, 200);
          output = limited.map(d => `${d.path}:${d.line || 1} [${d.severity || 'info'}] ${d.message}${d.source ? ` (${d.source})` : ''}`).join('\n');
        }
        break;
      }

      case 'git_diff': {
        const staged = Boolean(parsedArgs.staged);
        const diff = await workspace.gitDiff(projectId, { staged });
        output = diff && diff.trim() ? diff.trim() : 'Nenhuma alteração encontrada.';
        break;
      }

      case 'git_status': {
        const status = await workspace.gitStatus(projectId);
        output = status && status.trim() ? status.trim() : 'Nenhum status retornado.';
        break;
      }

      case 'write_file': {
        if (!canEdit) {
          throw new Error('Permissão negada: o agente atual não pode editar arquivos.');
        }
        if (!parsedArgs.path || parsedArgs.content === undefined) {
          throw new Error('Parâmetros "path" e "content" são obrigatórios');
        }
        const result = await workspace.writeFile(projectId, parsedArgs.path, parsedArgs.content);
        output = `Arquivo gravado com sucesso: ${result.path}`;
        break;
      }

      default:
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }

    const MAX_OUTPUT = 60000;
    if (output.length > MAX_OUTPUT) {
      output = output.slice(0, MAX_OUTPUT) + '\n\n[... truncado: resultado excede 60000 caracteres]';
    }

    return output;
  } catch (err) {
    return `ERRO: ${err.message || String(err)}`;
  }
}

module.exports = {
  getToolDefinitions,
  executeTool
};
