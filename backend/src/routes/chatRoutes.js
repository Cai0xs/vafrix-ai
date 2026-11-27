// backend/src/routes/chatRoutes.js
const express = require('express');
const multer = require('multer');
const {
  listConversations,
  deleteConversation,
  clearAllConversations,
  getMessages,
  sendMessage,
} = require('../controllers/chatController');
const { generateImageFromPrompt } = require('../services/imageService');

const router = express.Router();

const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // Limite de 15MB por arquivo
});

// Conversas e histórico
router.get('/conversations', listConversations);
router.delete('/conversations', clearAllConversations);
router.delete('/conversations/:id', deleteConversation);
router.get('/conversations/:id/messages', getMessages);

// Chat principal (aceita imagem ou documento via campo 'image' do FormData)
router.post('/chat', upload.single('image'), sendMessage);

// Geração de imagens
router.post('/generate-image', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ error: 'Digite uma descrição para gerar a imagem.' });
    }

    const result = await generateImageFromPrompt(prompt);
    return res.json(result);
  } catch (err) {
    console.error('[VAFRIX Image] Erro ao gerar imagem:', err);
    return res.status(500).json({ error: err?.message || 'Falha ao gerar imagem.' });
  }
});

module.exports = router;