const express = require('express');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// ── Google OAuth Strategy (only register if credentials are configured) ───────
const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

if (googleConfigured) {
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error('No email from Google'), null);

          let user = await User.findOne({ googleId: profile.id });
          if (!user) {
            user = await User.findOne({ email });
            if (user) {
              user.googleId = profile.id;
              user.avatar = user.avatar || profile.photos?.[0]?.value;
              await user.save();
            } else {
              user = await User.create({
                name: profile.displayName || email.split('@')[0],
                email,
                googleId: profile.id,
                avatar: profile.photos?.[0]?.value || null,
              });
            }
          }
          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
  console.log('✅ Google OAuth strategy registered');
} else {
  console.warn('⚠️  Google OAuth credentials not found in .env — /api/auth/google routes disabled');
}

// ── Google OAuth Routes ───────────────────────────────────────────────────────
const googleNotConfigured = (_req, res) =>
  res.status(501).json({ message: 'Google OAuth is not configured on this server.' });

// GET /api/auth/google — start OAuth flow
router.get(
  '/google',
  googleConfigured
    ? passport.authenticate('google', { scope: ['profile', 'email'], session: false })
    : googleNotConfigured
);

// GET /api/auth/google/callback — handle Google callback
if (googleConfigured) {
  router.get(
    '/google/callback',
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=google_failed`,
    }),
    (req, res) => {
      const token = generateToken(req.user._id);
      const user = JSON.stringify({
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        isAdmin: req.user.isAdmin,
      });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/auth/callback?token=${token}&user=${encodeURIComponent(user)}`);
    }
  );
}

// ── Standard Auth Routes ──────────────────────────────────────────────────────

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
      avatar: req.user.avatar,
      createdAt: req.user.createdAt,
    },
  });
});

module.exports = router;
