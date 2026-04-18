const express = require('express');
const Document = require('../models/Document');
const Chat = require('../models/Chat');
const Flashcard = require('../models/Flashcard');
const { auth } = require('../middleware/auth');
const aiService = require('../services/ai.service');

const router = express.Router();

// Helper: check if extracted text is usable (not empty, not a placeholder-only message)
const hasUsableText = (text) => {
  if (!text || text.trim().length < 20) return false;
  // Allow placeholder messages to still pass to AI (it can explain the situation)
  return true;
};

// POST /api/ai/ask
router.post('/ask', auth, async (req, res, next) => {
  try {
    const { documentId, question, history = [] } = req.body;
    if (!documentId || !question) {
      return res.status(400).json({ status: 400, message: 'documentId and question are required.' });
    }

    const document = await Document.findOne({ _id: documentId, userId: req.user._id });
    if (!document) {
      return res.status(404).json({ status: 404, message: 'Document not found.' });
    }
    if (!hasUsableText(document.extractedText)) {
      return res.status(400).json({
        status: 400,
        message: 'This document has no readable text. It may be image-based, password-protected, or empty. Please upload a different file.',
      });
    }

    const answer = await aiService.askQuestion(document.extractedText, question, history);

    // Save to chat history
    let chat = await Chat.findOne({ userId: req.user._id, documentId });
    if (!chat) {
      chat = new Chat({ userId: req.user._id, documentId, messages: [] });
    }
    chat.messages.push({ role: 'user', content: question });
    chat.messages.push({ role: 'assistant', content: answer });
    await chat.save();

    res.json({ answer, documentId });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/summarize
router.post('/summarize', auth, async (req, res, next) => {
  try {
    const { documentId, format = 'bullets' } = req.body;
    if (!documentId) {
      return res.status(400).json({ status: 400, message: 'documentId is required.' });
    }

    const validFormats = ['bullets', 'paragraph', 'detailed'];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ status: 400, message: `Invalid format. Choose: ${validFormats.join(', ')}` });
    }

    const document = await Document.findOne({ _id: documentId, userId: req.user._id });
    if (!document) {
      return res.status(404).json({ status: 404, message: 'Document not found.' });
    }
    if (!hasUsableText(document.extractedText)) {
      return res.status(400).json({
        status: 400,
        message: 'This document has no readable text to summarize.',
      });
    }

    const summary = await aiService.summarize(document.extractedText, format);
    res.json({ summary, format, documentId });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/flashcards
router.post('/flashcards', auth, async (req, res, next) => {
  try {
    const { documentId } = req.body;
    if (!documentId) {
      return res.status(400).json({ status: 400, message: 'documentId is required.' });
    }

    const document = await Document.findOne({ _id: documentId, userId: req.user._id });
    if (!document) {
      return res.status(404).json({ status: 404, message: 'Document not found.' });
    }
    if (!hasUsableText(document.extractedText)) {
      return res.status(400).json({
        status: 400,
        message: 'This document has no readable text to generate flashcards from.',
      });
    }

    const generated = await aiService.generateFlashcards(document.extractedText);

    const flashcards = await Flashcard.insertMany(
      generated.map(card => ({
        userId: req.user._id,
        documentId,
        question: card.question,
        answer: card.answer,
      }))
    );

    res.status(201).json({ flashcards, count: flashcards.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
