const path = require('path');
const { exec } = require('child_process');
const { resolveRoot } = require('./server/paths.js');
const { loadEnv } = require('./server/env.js');
const { createFsWorkspace } = require('./server/workspace/fs-workspace.js');

async function main() {
  const rawArgs = process.argv.slice(2);
  const openBrowser = rawArgs.includes('--open');
  const projectArgs = rawArgs.filter(arg => arg !== '--open');

  let projectPaths = [];
  if (projectArgs.length > 0) {
    projectPaths = projectArgs;
  } else if (process.env.BMAD_WORKSPACE) {
    projectPaths = process.env.BMAD_WORKSPACE.split(',').map(p => p.trim()).filter(Boolean);
  }

  if (projectPaths.length === 0) {
    projectPaths = [process.cwd()];
  }

  const resolvedProjects = projectPaths.map(p => path.resolve(p));

  const { root, envFile } = resolveRoot({ extensionPath: __dirname });
  const env = loadEnv([envFile]);

  const workspace = createFsWorkspace({ projects: resolvedProjects });

  const { startServer } = require('./server/http.js');

  const host = env.BMAD_STUDIO_HOST || '127.0.0.1';
  const port = Number(env.BMAD_STUDIO_PORT) || 4747;
  const token = env.BMAD_STUDIO_TOKEN || undefined;

  const server = await startServer({
    root,
    env,
    workspace,
    host,
    port,
    token
  });

  // Imprime URL com token em destaque
  console.log('\n' + '='.repeat(60));
  console.log('   BMAD Studio iniciado');
  console.log('='.repeat(60));
  console.log(`   URL: \x1b[1m\x1b[36m${server.url}\x1b[0m`);
  if (server.token) {
    console.log(`   Token de acesso: \x1b[1m\x1b[33m${server.token}\x1b[0m`);
  }
  console.log('   Projetos carregados:');
  resolvedProjects.forEach((proj, idx) => {
    console.log(`     [${idx}] ${proj}`);
  });
  console.log('='.repeat(60));
  console.log('Pressione Ctrl+C para encerrar.\n');

  if (openBrowser) {
    let openCmd = '';
    if (process.platform === 'win32') {
      openCmd = `cmd /c start "" "${server.url}"`;
    } else if (process.platform === 'darwin') {
      openCmd = `open "${server.url}"`;
    } else {
      openCmd = `xdg-open "${server.url}"`;
    }
    exec(openCmd, (err) => {
      if (err) {
        console.error('Aviso: Não foi possível abrir o navegador:', err.message);
      }
    });
  }

  let shuttingDown = false;
  const handleShutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\nEncerrando BMAD Studio...');
    try {
      if (server && typeof server.close === 'function') {
        await server.close();
      }
    } catch (e) {
      console.error('Erro ao fechar servidor:', e.message);
    }
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
}

main().catch((err) => {
  console.error('Falha ao iniciar BMAD Studio:', err);
  process.exit(1);
});
