const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/register
router.post('/register', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 400, message: errors.array()[0].msg });
    }

    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ status: 409, message: 'An account with this email already exists.' });
    }

    const user = await User.create({ name, email, password });
    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', [
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 400, message: errors.array()[0].msg });
    }

    const { email, adminId, password } = req.body;

    // Admin login — uses adminId
    if (adminId) {
      if (!adminId.trim()) {
        return res.status(400).json({ status: 400, message: 'Admin ID is required.' });
      }
      const admin = await User.findOne({ adminId, isAdmin: true }).select('+password');
      if (!admin || !(await admin.comparePassword(password))) {
        return res.status(401).json({ status: 401, message: 'Invalid admin credentials.' });
      }
      const token = generateToken(admin._id);
      return res.json({
        token,
        user: { id: admin._id, name: admin.name, adminId: admin.adminId, isAdmin: admin.isAdmin },
      });
    }

    // User login — uses email
    if (!email || !email.trim()) {
      return res.status(400).json({ status: 400, message: 'Email is required.' });
    }
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ status: 401, message: 'Invalid email or password.' });
    }
    const token = generateToken(user._id);
    return res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout (client-side token clear; returns success)
router.post('/logout', auth, (req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me — get current user info
router.get('/me', auth, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      createdAt: req.user.createdAt,
    },
  });
});

module.exports = router;
