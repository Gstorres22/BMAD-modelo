const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { resolveRoot } = require('./server/paths.js');
const { loadEnv } = require('./server/env.js');
const { startServer } = require('./server/http.js');
const { createVsCodeWorkspace } = require('./server/workspace/vscode-workspace.js');

let serverInstance = null;
let serverUrl = null;
let currentPanel = null;
let statusBarItem = null;
let workspace = null;
let activeRoot = null;
let activeEnvFile = null;
let activeEnv = null;

function getWebviewHtml(externalUrl) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:* http://localhost:* https:; style-src 'unsafe-inline'; ">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BMAD Studio</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: var(--vscode-editor-background, #1e1e1e);
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
  </style>
</head>
<body>
  <iframe src="${externalUrl}" allow="clipboard-read; clipboard-write"></iframe>
</body>
</html>`;
}

async function updateWebviewPanel(panel) {
  if (!serverUrl) return;
  const externalUri = await vscode.env.asExternalUri(vscode.Uri.parse(serverUrl));
  // toString(true): sem isso o VS Code codifica "?token=x" como "?token%3Dx" e a UI perde o token
  panel.webview.html = getWebviewHtml(externalUri.toString(true));
}

async function stopServer() {
  if (serverInstance) {
    try {
      await serverInstance.close();
    } catch {
      // ignora erros de fechamento do servidor
    }
    serverInstance = null;
    serverUrl = null;
  }
}

async function initServer(context) {
  const config = vscode.workspace.getConfiguration('bmadStudio');
  const configEnvOverride = (config.get('envFile') || '').trim();

  const { root, envFile } = resolveRoot({
    extensionPath: context.extensionPath,
    override: configEnvOverride || undefined
  });

  activeRoot = root;
  activeEnvFile = envFile;
  activeEnv = loadEnv([envFile]);

  let port = config.get('port', 0);
  if (!port || port <= 0) {
    port = activeEnv.BMAD_STUDIO_PORT ? parseInt(activeEnv.BMAD_STUDIO_PORT, 10) : 4747;
    if (isNaN(port) || port <= 0) {
      port = 4747;
    }
  }

  const host = activeEnv.BMAD_STUDIO_HOST || '127.0.0.1';
  const token = activeEnv.BMAD_STUDIO_TOKEN || undefined;

  try {
    serverInstance = await startServer({
      root: activeRoot,
      env: activeEnv,
      workspace,
      host,
      port,
      token
    });

    serverUrl = serverInstance.url;

    if (statusBarItem) {
      statusBarItem.text = '$(hubot) BMAD';
      statusBarItem.tooltip = `BMAD Studio (${serverUrl})`;
      statusBarItem.show();
    }

    return serverInstance;
  } catch (err) {
    const errorMsg = `Erro ao iniciar o servidor BMAD Studio: ${err.message || err}`;
    vscode.window.showErrorMessage(errorMsg);
    throw err;
  }
}

async function restartServer(context) {
  await stopServer();
  try {
    await initServer(context);
    vscode.window.showInformationMessage(`Servidor BMAD Studio reiniciado em ${serverUrl}`);
    if (currentPanel) {
      await updateWebviewPanel(currentPanel);
    }
  } catch {
    // erro já reportado em initServer
  }
}

async function openStudio(context) {
  if (!serverInstance) {
    try {
      await initServer(context);
    } catch {
      return;
    }
  }

  const viewColumn = vscode.window.activeTextEditor
    ? vscode.ViewColumn.Beside
    : vscode.ViewColumn.Active;

  if (currentPanel) {
    currentPanel.reveal(viewColumn);
    await updateWebviewPanel(currentPanel);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'bmadStudio',
    'BMAD Studio',
    viewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  currentPanel.onDidDispose(() => {
    currentPanel = null;
  }, null, context.subscriptions);

  await updateWebviewPanel(currentPanel);
}

/**
 * Ativação da extensão VS Code
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  workspace = createVsCodeWorkspace(vscode);
  context.subscriptions.push(workspace);

  const config = vscode.workspace.getConfiguration('bmadStudio');
  const configEnvOverride = (config.get('envFile') || '').trim();

  const { root, envFile } = resolveRoot({
    extensionPath: context.extensionPath,
    override: configEnvOverride || undefined
  });

  activeRoot = root;
  activeEnvFile = envFile;
  activeEnv = loadEnv([envFile]);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(hubot) BMAD';
  statusBarItem.command = 'bmadStudio.open';
  statusBarItem.tooltip = 'BMAD Studio (clique para abrir)';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const autoStart = config.get('autoStart', true);
  if (autoStart) {
    try {
      await initServer(context);
    } catch {
      // erro tratado e exibido via showErrorMessage
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('bmadStudio.open', async () => {
      await openStudio(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bmadStudio.openBrowser', async () => {
      if (!serverInstance) {
        try {
          await initServer(context);
        } catch {
          return;
        }
      }
      if (serverUrl) {
        await vscode.env.openExternal(vscode.Uri.parse(serverUrl));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bmadStudio.restart', async () => {
      await restartServer(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bmadStudio.copyUrl', async () => {
      if (!serverInstance) {
        try {
          await initServer(context);
        } catch {
          return;
        }
      }
      if (serverUrl) {
        await vscode.env.clipboard.writeText(serverUrl);
        vscode.window.showInformationMessage(`URL do BMAD Studio copiada: ${serverUrl}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bmadStudio.openEnv', async () => {
      if (!activeEnvFile) {
        const { envFile: resolvedEnv } = resolveRoot({
          extensionPath: context.extensionPath,
          override: undefined
        });
        activeEnvFile = resolvedEnv;
      }

      if (!fs.existsSync(activeEnvFile)) {
        const possibleExamples = [
          path.join(activeRoot || context.extensionPath, '.env.example'),
          path.join(context.extensionPath, '.env.example')
        ];
        let copied = false;
        for (const exPath of possibleExamples) {
          if (fs.existsSync(exPath)) {
            try {
              const targetDir = path.dirname(activeEnvFile);
              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }
              fs.copyFileSync(exPath, activeEnvFile);
              copied = true;
              break;
            } catch {
              // tenta o próximo caminho
            }
          }
        }
        if (!copied) {
          try {
            const targetDir = path.dirname(activeEnvFile);
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            fs.writeFileSync(activeEnvFile, '# Configurações do BMAD Studio\n', 'utf8');
          } catch (writeErr) {
            vscode.window.showErrorMessage(`Não foi possível criar o arquivo .env: ${writeErr.message}`);
            return;
          }
        }
      }

      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(activeEnvFile));
        await vscode.window.showTextDocument(doc);
      } catch (openErr) {
        vscode.window.showErrorMessage(`Falha ao abrir arquivo .env: ${openErr.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('bmadStudio.askAboutSelection', async () => {
      vscode.window.showInformationMessage("Seleção enviada ao contexto — marque 'Seleção' no painel");
      await openStudio(context);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (
        activeEnvFile &&
        doc.uri &&
        doc.uri.scheme === 'file' &&
        path.resolve(doc.uri.fsPath) === path.resolve(activeEnvFile)
      ) {
        const action = await vscode.window.showInformationMessage(
          'Arquivo .env alterado. Deseja reiniciar o servidor BMAD Studio para aplicar as novas configurações?',
          'Reiniciar servidor',
          'Cancelar'
        );
        if (action === 'Reiniciar servidor') {
          await restartServer(context);
        }
      }
    })
  );
}

/**
 * Desativação da extensão
 */
async function deactivate() {
  await stopServer();
}

module.exports = {
  activate,
  deactivate
};
