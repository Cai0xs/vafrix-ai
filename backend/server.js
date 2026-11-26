// backend/server.js
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Servidor VAFRIX AI rodando perfeitamente!' });
});

app.use('/api', chatRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Inicializa o banco antes de ouvir requisições
getDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[VAFRIX AI] Servidor iniciado na porta ${PORT}`);
      console.log(`[VAFRIX AI] Banco SQLite pronto em src/database/vafrix.sqlite`);
      console.log(`[VAFRIX AI] Frontend disponível em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao inicializar o banco SQLite:', err);
    process.exit(1);
  });