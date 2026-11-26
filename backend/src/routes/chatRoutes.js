// backend/src/routes/chatRoutes.js
const express = require('express');
const multer = require('multer');
const {
  listConversations,
  createConversation,
  getMessages,
  sendMessage,
  createReport,
  listReports,
} = require('../controllers/chatController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
});

router.get('/conversations', listConversations);
router.post('/conversations', createConversation);
router.get('/conversations/:id/messages', getMessages);
router.post('/chat', upload.single('image'), sendMessage);

router.get('/reports', listReports);
router.post('/reports', createReport);

module.exports = router;