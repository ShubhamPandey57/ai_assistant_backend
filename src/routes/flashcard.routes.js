const express = require('express');
const Flashcard = require('../models/Flashcard');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/flashcards/:documentId
router.get('/:documentId', auth, async (req, res, next) => {
  try {
    const flashcards = await Flashcard.find({
      userId: req.user._id,
      documentId: req.params.documentId,
    }).sort({ createdAt: 1 });
    res.json({ flashcards });
  } catch (err) {
    next(err);
  }
});

// PUT /api/flashcards/:id
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { question, answer } = req.body;
    const flashcard = await Flashcard.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { question, answer },
      { new: true, runValidators: true }
    );
    if (!flashcard) {
      return res.status(404).json({ status: 404, message: 'Flashcard not found.' });
    }
    res.json({ flashcard });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/flashcards/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const flashcard = await Flashcard.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!flashcard) {
      return res.status(404).json({ status: 404, message: 'Flashcard not found.' });
    }
    res.json({ message: 'Flashcard deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
