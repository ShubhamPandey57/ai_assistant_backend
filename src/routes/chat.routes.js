const express = require('express');
const Chat = require('../models/Chat');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/chats/:documentId
router.get('/:documentId', auth, async (req, res, next) => {
  try {
    const chat = await Chat.findOne({
      userId: req.user._id,
      documentId: req.params.documentId,
    });
    res.json({ messages: chat ? chat.messages : [] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/chats/:documentId — clear chat history
router.delete('/:documentId', auth, async (req, res, next) => {
  try {
    await Chat.findOneAndDelete({
      userId: req.user._id,
      documentId: req.params.documentId,
    });
    res.json({ message: 'Chat history cleared.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
