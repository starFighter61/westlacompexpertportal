const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');
const { ensureGuest } = require('../middleware/auth');

// @desc    Process register form
// @route   POST /auth/register
router.post('/register', ensureGuest, async (req, res) => {
  try {
    const { name, email, password, password2, phone } = req.body;
    
    // Validation
    let errors = [];
    
    if (!name || !email || !password || !password2) {
      errors.push({ msg: 'Please fill in all required fields' });
    }
    
    if (password !== password2) {
      errors.push({ msg: 'Passwords do not match' });
    }
    
    if (password.length < 6) {
      errors.push({ msg: 'Password should be at least 6 characters' });
    }
    
    if (errors.length > 0) {
      return res.render('register', {
        layout: 'auth',
        errors,
        name,
        email,
        phone
      });
    }
    
    // Check if user exists
    const userExists = await User.findOne({ email: email });
    
    if (userExists) {
      errors.push({ msg: 'Email is already registered' });
      return res.render('register', {
        layout: 'auth',
        errors,
        name,
        email,
        phone
      });
    }
    
    // Create new user
    const newUser = new User({
      name,
      email,
      password,
      phone,
      role: 'client'
    });
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    newUser.password = await bcrypt.hash(password, salt);
    
    // Save user
    await newUser.save();
    
    req.flash('success_msg', 'You are now registered and can log in');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Process login form
// @route   POST /auth/login
router.post('/login', ensureGuest, (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
    failureFlash: true
  })(req, res, next);
});

// @desc    Logout user
// @route   GET /auth/logout
router.get('/logout', (req, res) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.flash('success_msg', 'You are logged out');
    res.redirect('/login');
  });
});

module.exports = router;