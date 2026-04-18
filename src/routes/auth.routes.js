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
  body('isAdmin').optional().isBoolean(),
  body('adminId').optional().trim(),

], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 400, message: errors.array()[0].msg });
    }

    const { name, email, password, isAdmin, adminId } = req.body;

    if (isAdmin) {
      if (!adminId) {
        return res.status(400).json({ status: 400, message: 'Admin ID is required.' });
      }
      
      const adminExists = await User.findOne({ adminId });
      if (adminExists) {
        return res.status(409).json({ status: 409, message: 'This Admin ID has already been registered.' });
      }
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ status: 409, message: 'An account with this email already exists.' });
    }

    const userData = { name, email, password };
    if (isAdmin) {
      userData.isAdmin = true;
      userData.adminId = adminId;
    }

    const user = await User.create(userData);
    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin, adminId: user.adminId },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').optional().isEmail().withMessage('Please provide a valid email'),
  body('adminId').optional().trim(),
  body('password').notEmpty().withMessage('Password is required'),

], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 400, message: errors.array()[0].msg });
    }

    const { email, adminId, password } = req.body;
    
    if (!email && !adminId) {
      return res.status(400).json({ status: 400, message: 'Email or Admin ID is required.' });
    }

    let user;
    if (adminId) {
      user = await User.findOne({ adminId }).select('+password');
    } else {
      user = await User.findOne({ email }).select('+password');
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ status: 401, message: 'Invalid credentials.' });
    }

    if (!adminId && user.isAdmin) {
      return res.status(403).json({ status: 403, message: 'Admins must log in via the Admin portal.' });
    }

    const token = generateToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin, adminId: user.adminId },
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
      isAdmin: req.user.isAdmin,
      createdAt: req.user.createdAt,
    },
  });
});

module.exports = router;
