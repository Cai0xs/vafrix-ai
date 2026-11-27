// backend/server.js

// 1. Rastreia se algum módulo interno ou biblioteca está chamando process.exit() silenciosamente
const originalExit = process.exit;
process.exit = function (code) {
  console.error(`\n[VAFRIX AI - ALERTA] process.exit(${code}) foi chamado! Stack trace:`);
  console.trace();
  return originalExit.call(process, code);
};

const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getDb } = require('./src/database/db');
const chatRoutes = require('./src/routes/chatRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

const frontendPath = path.resolve(__dirname, '../frontend');

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(frontendPath));

// 2. Captura erros e rejeições não tratadas sem derrubar o processo
process.on('uncaughtException', (err) => {
  console.error('[VAFRIX AI - ERRO NÃO CAPTURADO]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[VAFRIX AI - REJEIÇÃO NÃO TRATADA]:', reason);
});

// Executa SQL independentemente do driver/wrapper usado em getDb()
async function runSql(db, sql) {
  if (!db) throw new Error('Instância do banco não disponível.');

  if (typeof db.run === 'function' && db.run.length <= 1) {
    return await db.run(sql);
  }

  if (typeof db.exec === 'function' && db.exec.length <= 1) {
    return await db.exec(sql);
  }

  if (typeof db.run === 'function') {
    return await new Promise((resolve, reject) => {
      db.run(sql, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  throw new Error('Método de execução SQL não suportado pela instância do banco.');
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Servidor VAFRIX AI rodando perfeitamente!' });
});

// Rota para limpar todo o histórico de conversas e mensagens
app.delete('/api/conversations', async (req, res) => {
  try {
    const db = await getDb();

    try {
      await runSql(db, 'DELETE FROM messages');
    } catch (msgErr) {
      if (!String(msgErr?.message || '').toLowerCase().includes('no such table')) {
        throw msgErr;
      }
    }

    await runSql(db, 'DELETE FROM conversations');

    return res.json({ ok: true, cleared: true });
  } catch (err) {
    console.error('[VAFRIX AI] Erro ao limpar histórico:', err);
    return res.status(500).json({ error: 'Falha ao limpar histórico no banco de dados.' });
  }
});

app.use('/api', chatRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 3. Inicialização segura mantendo o Event Loop ativo
async function startServer() {
  try {
    const db = await getDb();

    const server = app.listen(PORT, () => {
      console.log(`[VAFRIX AI] Servidor iniciado na porta ${PORT}`);
      console.log(`[VAFRIX AI] Banco SQLite pronto em src/database/vafrix.sqlite`);
      console.log(`[VAFRIX AI] Frontend disponível em http://localhost:${PORT}`);
    });

    // Garante que o Event Loop do Node se mantenha ocupado e ativo
    setInterval(() => {}, 100000);
  } catch (err) {
    console.error('Falha ao inicializar o banco SQLite ou servidor:', err);
    process.exit(1);
  }
}

startServer();