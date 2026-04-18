const express = require('express');
const User = require('../models/User');
const Document = require('../models/Document');
const Chat = require('../models/Chat');
const Flashcard = require('../models/Flashcard');
const Contact = require('../models/Contact');
const { auth, adminOnly } = require('../middleware/auth');
const fs = require('fs');

const router = express.Router();

// All admin routes require JWT + admin flag
router.use(auth, adminOnly);

// GET /api/admin/users — list all users
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const docCount = await Document.countDocuments({ userId: user._id });
        return { ...user.toObject(), documentCount: docCount };
      })
    );
    res.json({ users: usersWithStats });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id — delete user and all their data
router.delete('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ status: 404, message: 'User not found.' });

    // Delete all user's files
    const docs = await Document.find({ userId: user._id });
    for (const doc of docs) {
      if (fs.existsSync(doc.filepath)) fs.unlinkSync(doc.filepath);
    }

    await Document.deleteMany({ userId: user._id });
    await Chat.deleteMany({ userId: user._id });
    await Flashcard.deleteMany({ userId: user._id });
    await user.deleteOne();

    res.json({ message: 'User and all associated data deleted.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/documents — list all documents
router.get('/documents', async (req, res, next) => {
  try {
    const documents = await Document.find()
      .select('-extractedText')
      .populate('userId', 'name email')
      .sort({ uploadDate: -1 });
    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/documents/:id — delete any document
router.delete('/documents/:id', async (req, res, next) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) return res.status(404).json({ status: 404, message: 'Document not found.' });

    if (fs.existsSync(document.filepath)) fs.unlinkSync(document.filepath);
    await Chat.deleteMany({ documentId: document._id });
    await Flashcard.deleteMany({ documentId: document._id });
    await document.deleteOne();

    res.json({ message: 'Document deleted by admin.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/stats — usage statistics
router.get('/stats', async (req, res, next) => {
  try {
      const [totalUsers, totalDocuments, totalFlashcards, totalChats, totalContacts, pendingContacts] = await Promise.all([
      User.countDocuments(),
      Document.countDocuments(),
      Flashcard.countDocuments(),
      Chat.countDocuments(),
      Contact.countDocuments(),
      Contact.countDocuments({ status: 'pending' }),
    ]);

    const totalMessages = await Chat.aggregate([
      { $project: { messageCount: { $size: '$messages' } } },
      { $group: { _id: null, total: { $sum: '$messageCount' } } },
    ]);

    res.json({
      stats: {
        totalUsers,
        totalDocuments,
        totalFlashcards,
        totalAIQueries: totalMessages[0]?.total || 0,
        totalContacts,
        pendingContacts,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/flashcards — list all flashcards
router.get('/flashcards', async (req, res, next) => {
  try {
    const flashcards = await Flashcard.find()
      .populate('userId', 'name email')
      .populate('documentId', 'originalName')
      .sort({ createdAt: -1 });
    res.json({ flashcards });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/flashcards/:id — update a flashcard
router.put('/flashcards/:id', async (req, res, next) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ status: 400, message: 'Question and answer are required.' });
    }
    const flashcard = await Flashcard.findByIdAndUpdate(
      req.params.id,
      { $set: { question, answer } },
      { new: true, runValidators: true }
    ).populate('userId', 'name email').populate('documentId', 'originalName');
    
    if (!flashcard) return res.status(404).json({ status: 404, message: 'Flashcard not found.' });

    res.json({ flashcard });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/flashcards/:id — delete a flashcard
router.delete('/flashcards/:id', async (req, res, next) => {
  try {
    const flashcard = await Flashcard.findByIdAndDelete(req.params.id);
    if (!flashcard) return res.status(404).json({ status: 404, message: 'Flashcard not found.' });

    res.json({ message: 'Flashcard deleted by admin.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/contacts — list all contact queries
router.get('/contacts', async (req, res, next) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({ contacts });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/contacts/:id — reply or update status
router.patch('/contacts/:id', async (req, res, next) => {
  try {
    const { adminReply, status } = req.body;
    const update = {};
    if (adminReply !== undefined) {
      update.adminReply = adminReply;
      update.repliedAt = new Date();
      update.status = 'replied';
    } else if (status) {
      update.status = status;
    }

    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!contact) return res.status(404).json({ status: 404, message: 'Contact not found.' });
    res.json({ contact });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/contacts/:id — delete a contact query
router.delete('/contacts/:id', async (req, res, next) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) return res.status(404).json({ status: 404, message: 'Contact not found.' });
    res.json({ message: 'Contact record deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
