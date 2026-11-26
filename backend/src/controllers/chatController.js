// backend/src/controllers/chatController.js
const { getDb } = require('../database/db');
const { generateVafrixResponse } = require('../services/aiService');

async function listConversations(req, res) {
  try {
    const db = await getDb();
    const rows = await db.all(
      'SELECT id, title, mode, created_at, updated_at FROM conversations ORDER BY updated_at DESC, id DESC'
    );
    res.json({ conversations: rows });
  } catch (err) {
    console.error('Erro ao listar conversas:', err);
    res.status(500).json({ error: 'Erro interno ao buscar histórico de conversas.' });
  }
}

async function createConversation(req, res) {
  try {
    const { title = 'Nova conversa', mode = 'chat' } = req.body || {};
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO conversations (title, mode) VALUES (?, ?)',
      [String(title).slice(0, 120), mode]
    );
    const conversation = await db.get(
      'SELECT id, title, mode, created_at, updated_at FROM conversations WHERE id = ?',
      [result.lastID]
    );
    res.status(201).json({ conversation });
  } catch (err) {
    console.error('Erro ao criar conversa:', err);
    res.status(500).json({ error: 'Erro interno ao criar conversa.' });
  }
}

async function getMessages(req, res) {
  try {
    const { id } = req.params;
    const db = await getDb();
    const messages = await db.all(
      'SELECT id, conversation_id, role, content, attachment_name, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC',
      [id]
    );
    res.json({ messages });
  } catch (err) {
    console.error('Erro ao buscar mensagens:', err);
    res.status(500).json({ error: 'Erro interno ao carregar mensagens.' });
  }
}

async function sendMessage(req, res) {
  let conversationId = req.body?.conversationId;

  try {
    let { message, mode = 'chat', fileText = '', attachmentName = null } = req.body || {};

    if ((!message || !String(message).trim()) && !fileText && !req.file) {
      return res.status(400).json({ error: 'Envie uma mensagem, arquivo ou imagem.' });
    }

    const db = await getDb();

    const parsedConvId = Number(conversationId);
    if (!conversationId || Number.isNaN(parsedConvId) || parsedConvId <= 0) {
      const autoTitle = String(message || attachmentName || 'Atendimento TI')
        .trim()
        .slice(0, 60) || 'Atendimento TI';
      const created = await db.run(
        'INSERT INTO conversations (title, mode) VALUES (?, ?)',
        [autoTitle, mode]
      );
      conversationId = created.lastID;
    } else {
      conversationId = parsedConvId;
      const existingConv = await db.get('SELECT id FROM conversations WHERE id = ?', [conversationId]);
      if (!existingConv) {
        const autoTitle = String(message || attachmentName || 'Atendimento TI')
          .trim()
          .slice(0, 60) || 'Atendimento TI';
        const created = await db.run(
          'INSERT INTO conversations (title, mode) VALUES (?, ?)',
          [autoTitle, mode]
        );
        conversationId = created.lastID;
      }
    }

    const combinedPrompt = [
      String(message || '').trim(),
      fileText
        ? `\n\n--- Conteúdo do arquivo anexado (${attachmentName || 'arquivo'}) ---\n${String(fileText).slice(0, 15000)}`
        : '',
    ]
      .filter(Boolean)
      .join('');

    const fileLabel = req.file ? req.file.originalname : attachmentName;

    await db.run(
      'INSERT INTO messages (conversation_id, role, content, attachment_name) VALUES (?, ?, ?, ?)',
      [conversationId, 'user', combinedPrompt || '[Anexo enviado]', fileLabel || null]
    );

    const historyRows = await db.all(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 12',
      [conversationId]
    );
    const history = historyRows.reverse().slice(0, -1);

    let imagePart = null;
    if (req.file && typeof req.file.mimetype === 'string' && req.file.mimetype.startsWith('image/')) {
      imagePart = {
        base64: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype,
      };
    }

    console.log('[VAFRIX AI] Processando mensagem na conversa:', conversationId, '| modo:', mode);

    const aiReply = await generateVafrixResponse({
      history,
      prompt: combinedPrompt || 'Analise a imagem enviada e aponte possíveis problemas ou configurações.',
      mode,
      imagePart,
    });

    const safeReply =
      typeof aiReply === 'string' && aiReply.trim()
        ? aiReply.trim()
        : 'Não foi possível gerar uma resposta para essa pergunta no momento.';

    await db.run(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [conversationId, 'assistant', safeReply]
    );

    await db.run(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, mode = ? WHERE id = ?',
      [mode, conversationId]
    );

    return res.json({
      conversationId: Number(conversationId),
      reply: safeReply,
      message: safeReply,
    });
  } catch (err) {
    console.error('Erro ao processar mensagem na VAFRIX AI:', err);
    const statusCode = err?.status === 429 || err?.error?.code === 429 ? 429 : 500;
    const friendlyMessage =
      statusCode === 429
        ? 'Limite de requisições atingido no momento. Aguarde alguns instantes ou tente novamente.'
        : err?.message || 'Erro ao comunicar com a inteligência artificial.';

    return res.status(statusCode).json({
      error: friendlyMessage,
      conversationId: conversationId ? Number(conversationId) : null,
    });
  }
}

async function createReport(req, res) {
  try {
    const {
      conversationId = null,
      title,
      equipment = '',
      problemDescription,
      diagnosis = '',
      procedures = '',
      result = '',
      recommendations = '',
    } = req.body || {};

    if (!title || !problemDescription) {
      return res.status(400).json({ error: 'Título e descrição do problema são obrigatórios.' });
    }

    const db = await getDb();
    const inserted = await db.run(
      `INSERT INTO reports
        (conversation_id, title, equipment, problem_description, diagnosis, procedures, result, recommendations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversationId,
        String(title).trim(),
        String(equipment).trim(),
        String(problemDescription).trim(),
        String(diagnosis).trim(),
        String(procedures).trim(),
        String(result).trim(),
        String(recommendations).trim(),
      ]
    );

    const report = await db.get('SELECT * FROM reports WHERE id = ?', [inserted.lastID]);
    res.status(201).json({ report });
  } catch (err) {
    console.error('Erro ao salvar relatório:', err);
    res.status(500).json({ error: 'Erro interno ao salvar relatório técnico.' });
  }
}

async function listReports(req, res) {
  try {
    const db = await getDb();
    const reports = await db.all('SELECT * FROM reports ORDER BY id DESC');
    res.json({ reports });
  } catch (err) {
    console.error('Erro ao listar relatórios:', err);
    res.status(500).json({ error: 'Erro interno ao carregar relatórios.' });
  }
}

module.exports = {
  listConversations,
  createConversation,
  getMessages,
  sendMessage,
  createReport,
  listReports,
};