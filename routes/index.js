const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureGuest } = require('../middleware/auth');

// @desc    Landing page
// @route   GET /
router.get('/', ensureGuest, (req, res) => {
  res.render('landing', {
    layout: 'landing'
  });
});

// @desc    Login page
// @route   GET /login
router.get('/login', ensureGuest, (req, res) => {
  res.render('login', {
    layout: 'auth'
  });
});

// @desc    Register page
// @route   GET /register
router.get('/register', ensureGuest, (req, res) => {
  res.render('register', {
    layout: 'auth'
  });
});

// @desc    About page
// @route   GET /about
router.get('/about', (req, res) => {
  res.render('about', {
    layout: req.isAuthenticated() ? 'main' : 'landing'
  });
});

// @desc    Contact page
// @route   GET /contact
router.get('/contact', (req, res) => {
  res.render('contact', {
    layout: req.isAuthenticated() ? 'main' : 'landing'
  });
});

// @desc    Services page
// @route   GET /services-offered
router.get('/services-offered', (req, res) => {
  res.render('services-offered', {
    layout: req.isAuthenticated() ? 'main' : 'landing'
  });
});

// @desc    Privacy policy page
// @route   GET /privacy-policy
router.get('/privacy-policy', (req, res) => {
  res.render('privacy-policy', {
    layout: req.isAuthenticated() ? 'main' : 'landing'
  });
});

// @desc    Terms of service page
// @route   GET /terms-of-service
router.get('/terms-of-service', (req, res) => {
  res.render('terms-of-service', {
    layout: req.isAuthenticated() ? 'main' : 'landing'
  });
});

module.exports = router;