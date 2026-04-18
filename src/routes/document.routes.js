const express = require('express');
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const Chat = require('../models/Chat');
const Flashcard = require('../models/Flashcard');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { extractText } = require('../services/pdf.service');

const router = express.Router();

const MAX_DOCS_PER_USER = 5;

// POST /api/documents/upload
router.post('/upload', auth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 400, message: 'No file uploaded.' });
    }

    // Enforce 5-document limit
    const docCount = await Document.countDocuments({ userId: req.user._id });
    if (docCount >= MAX_DOCS_PER_USER) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        status: 400,
        message: `You have reached the maximum of ${MAX_DOCS_PER_USER} documents. Delete a document to upload more.`,
      });
    }

    // Extract text
    let extractedText = '';
    try {
      extractedText = await extractText(req.file.path, req.file.mimetype);
    } catch (extractErr) {
      console.error('Text extraction error:', extractErr.message);
      extractedText = '';
    }

    const document = await Document.create({
      userId: req.user._id,
      originalName: req.file.originalname,
      filename: req.file.filename,
      filepath: path.resolve(req.file.path), // store absolute path for reliability
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      extractedText,
    });

    res.status(201).json({ document });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
});

// GET /api/documents
router.get('/', auth, async (req, res, next) => {
  try {
    const documents = await Document.find({ userId: req.user._id })
      .select('-extractedText')
      .sort({ uploadDate: -1 });
    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id }).select('-extractedText');
    if (!document) {
      return res.status(404).json({ status: 404, message: 'Document not found.' });
    }
    res.json({ document });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) {
      return res.status(404).json({ status: 404, message: 'Document not found.' });
    }

    // Delete file from disk (try both stored path and resolved path)
    const absPath = path.resolve(document.filepath);
    try {
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch (fileErr) {
      console.warn('Could not delete file from disk:', fileErr.message);
    }

    // Delete related chats and flashcards
    await Chat.deleteMany({ documentId: document._id });
    await Flashcard.deleteMany({ documentId: document._id });
    await document.deleteOne();

    res.json({ message: 'Document deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/documents/:id/reextract — re-attempt text extraction on existing doc
router.post('/:id/reextract', auth, async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) {
      return res.status(404).json({ status: 404, message: 'Document not found.' });
    }
    const absPath = path.resolve(document.filepath);
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ status: 404, message: 'File no longer exists on server.' });
    }
    const extractedText = await extractText(absPath, document.fileType);
    document.extractedText = extractedText;
    await document.save();
    res.json({ message: 'Text re-extracted successfully.', length: extractedText.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/file — serve file securely (owner-only)
router.get('/:id/file', auth, async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) {
      return res.status(404).json({ status: 404, message: 'Document not found.' });
    }

    if (!fs.existsSync(document.filepath)) {
      return res.status(404).json({ status: 404, message: 'File not found on server.' });
    }

    res.setHeader('Content-Type', document.fileType);
    res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);
    res.sendFile(path.resolve(document.filepath));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
