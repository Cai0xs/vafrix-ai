// backend/src/controllers/chatController.js
const { getDb } = require('../database/db');
const { generateVafrixStreamResponse } = require('../services/aiService');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function extractTextFromBuffer(file) {
  if (!file || !file.buffer) return '';
  const mime = file.mimetype;
  try {
    if (mime === 'application/pdf') {
      const data = await pdfParse(file.buffer);
      return data.text || '';
    }
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const res = await mammoth.extractRawText({ buffer: file.buffer });
      return res.value || '';
    }
    if (mime.startsWith('text/') || mime === 'application/json' || mime === 'text/csv') {
      return file.buffer.toString('utf-8');
    }
  } catch (err) {
    console.error('Erro ao extrair texto do anexo:', err);
  }
  return '';
}

async function listConversations(req, res) {
  try {
    const db = await getDb();
    const rows = await db.all(
      'SELECT id, title, mode, created_at, updated_at FROM conversations ORDER BY updated_at DESC, id DESC'
    );
    res.json({ conversations: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar conversas.' });
  }
}

async function deleteConversation(req, res) {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM messages WHERE conversation_id = ?', [id]);
    await db.run('DELETE FROM conversations WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir conversa.' });
  }
}

async function clearAllConversations(req, res) {
  try {
    const db = await getDb();
    await db.run('DELETE FROM messages');
    await db.run('DELETE FROM conversations');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao limpar histórico.' });
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
    res.status(500).json({ error: 'Erro ao carregar mensagens.' });
  }
}

async function sendMessage(req, res) {
  let conversationId = req.body?.conversationId;

  try {
    let { message = '', mode = 'chat', enableSearch = 'false' } = req.body || {};
    const searchActive = String(enableSearch) === 'true';

    let extractedDocText = '';
    let attachmentName = null;

    if (req.file) {
      attachmentName = req.file.originalname;
      if (!req.file.mimetype.startsWith('image/')) {
        extractedDocText = await extractTextFromBuffer(req.file);
      }
    }

    if (!message.trim() && !extractedDocText && !req.file) {
      return res.status(400).json({ error: 'Envie uma mensagem ou arquivo.' });
    }

    const db = await getDb();
    const parsedId = Number(conversationId);

    if (!conversationId || Number.isNaN(parsedId) || parsedId <= 0) {
      const title = String(message || attachmentName || 'Nova conversa').trim().slice(0, 60);
      const created = await db.run('INSERT INTO conversations (title, mode) VALUES (?, ?)', [title, mode]);
      conversationId = created.lastID;
    }

    const combinedPrompt = [
      message.trim(),
      extractedDocText
        ? `\n\n--- Conteúdo do Documento Anexado (${attachmentName}) ---\n${extractedDocText.slice(0, 20000)}`
        : '',
    ]
      .filter(Boolean)
      .join('');

    await db.run(
      'INSERT INTO messages (conversation_id, role, content, attachment_name) VALUES (?, ?, ?, ?)',
      [conversationId, 'user', combinedPrompt || '[Anexo enviado]', attachmentName]
    );

    const historyRows = await db.all(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 10',
      [conversationId]
    );
    const history = historyRows.reverse().slice(0, -1);

    let imagePart = null;
    if (req.file && req.file.mimetype.startsWith('image/')) {
      imagePart = {
        base64: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype,
      };
    }

    // Headers para Streaming HTTP (SSE / Chunked Response)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Conversation-Id', String(conversationId));

    const finalResponseText = await generateVafrixStreamResponse({
      history,
      prompt: combinedPrompt,
      mode,
      imagePart,
      enableSearch: searchActive,
      onChunk: (chunk) => {
        res.write(chunk);
      },
    });

    await db.run('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', [
      conversationId,
      'assistant',
      finalResponseText,
    ]);

    await db.run('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      conversationId,
    ]);

    res.end();
  } catch (err) {
    console.error('Erro no processamento:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao processar mensagem na IA.' });
    } else {
      res.write('\n\n[Erro no meio da transmissão da resposta]');
      res.end();
    }
  }
}

module.exports = {
  listConversations,
  deleteConversation,
  clearAllConversations,
  getMessages,
  sendMessage,
};