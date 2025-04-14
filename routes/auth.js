const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');
const { ensureGuest } = require('../middleware/auth');
const crypto = require('crypto'); // Added for token generation
const nodemailer = require('nodemailer');

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

// @desc    Show forgot password form
// @route   GET /auth/forgot-password
router.get('/forgot-password', ensureGuest, (req, res) => {
  res.render('forgot-password', {
    layout: 'auth'
  });
});

// @desc    Process forgot password form
// @route   POST /auth/forgot-password
router.post('/forgot-password', ensureGuest, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });

    if (!user) {
      // Don't reveal if the user doesn't exist
      req.flash('success_msg', 'If an account with that email exists, a password reset link has been sent.');
      return res.redirect('/login');
    }

    // Generate token
    const token = crypto.randomBytes(20).toString('hex');

    // Set token and expiration (e.g., 1 hour)
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour in milliseconds

    await user.save();

    // --- Email Sending Logic ---
    // IMPORTANT: Configure transport options securely using environment variables
    // You might need to install 'dotenv' (npm install dotenv) and require it at the top of your app (require('dotenv').config();)
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST, // e.g., 'smtp.gmail.com'
      port: parseInt(process.env.EMAIL_PORT || '587', 10), // e.g., 587 or 465
      secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports (like 587)
      auth: {
        user: process.env.EMAIL_USER, // Your email username (e.g., from Gmail)
        pass: process.env.EMAIL_PASS, // Your email password or app-specific password
      },
      // Optional: Add TLS options if needed, e.g., for self-signed certs
      // tls: {
      //   rejectUnauthorized: false
      // }
    });

    const resetURL = `http://${req.headers.host}/auth/reset-password/${token}`;

    const mailOptions = {
      from: `"West LA CompExpert Portal" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`, // sender address
      to: user.email, // list of receivers
      subject: 'Password Reset Request - West LA CompExpert Portal', // Subject line
      text: `You are receiving this because you (or someone else) have requested the reset of the password for your account on West LA CompExpert Portal.\n\nPlease click on the following link, or paste this into your browser to complete the process within one hour:\n\n${resetURL}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n`, // plain text body
      html: `<p>You are receiving this because you (or someone else) have requested the reset of the password for your account on West LA CompExpert Portal.</p><p>Please click on the following link, or paste this into your browser to complete the process within one hour:</p><p><a href="${resetURL}">${resetURL}</a></p><p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`, // html body
    };

    try {
      let info = await transporter.sendMail(mailOptions);
      console.log('Password reset email sent: %s', info.messageId);
    } catch (emailErr) {
      console.error('Error sending password reset email:', emailErr);
      // Keep the user experience consistent, but log the error server-side.
      // In production, you might want more robust error handling or alerting.
      req.flash('error_msg', 'Error sending password reset email. Please try again later or contact support.');
      return res.redirect('/auth/forgot-password'); // Redirect back if email fails
    }
    // --- End Email Sending Logic ---

    req.flash('success_msg', 'If an account with that email exists, a password reset link has been sent.');
    res.redirect('/login');
  } catch (err) {
    console.error('Forgot Password Error:', err);
    req.flash('error_msg', 'An error occurred. Please try again.');
    res.redirect('/auth/forgot-password');
  }
});

// @desc    Show reset password form
// @route   GET /auth/reset-password/:token
router.get('/reset-password/:token', ensureGuest, async (req, res) => {
  const resetToken = req.params.token;
  try {
    const user = await User.findOne({
      resetPasswordToken: resetToken,
      resetPasswordExpires: { $gt: Date.now() } // Check if token exists and hasn't expired
    });

    if (!user) {
      req.flash('error_msg', 'Password reset token is invalid or has expired.');
      return res.redirect('/auth/forgot-password');
    }

    // Token is valid, render the reset form
    res.render('reset-password', {
      layout: 'auth',
      token: resetToken
    });
  } catch (err) {
    console.error('Reset Password GET Error:', err);
    req.flash('error_msg', 'An error occurred.');
    res.redirect('/auth/forgot-password');
  }
});

// @desc    Process reset password form
// @route   POST /auth/reset-password/:token
router.post('/reset-password/:token', ensureGuest, async (req, res) => {
  const { password, password2 } = req.body;
  const resetToken = req.params.token;

  // Validation
  let errors = [];
  if (!password || !password2) {
    errors.push({ msg: 'Please enter both password fields.' });
  }
  if (password !== password2) {
    errors.push({ msg: 'Passwords do not match.' });
  }
  if (password.length < 6) {
    errors.push({ msg: 'Password must be at least 6 characters.' });
  }

  if (errors.length > 0) {
    // Join error messages for flashing
    const errorMessages = errors.map(e => e.msg).join('<br>');
    req.flash('error_msg', errorMessages);
    return res.redirect(`/auth/reset-password/${resetToken}`);
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: resetToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      req.flash('error_msg', 'Password reset token is invalid or has expired.');
      return res.redirect('/auth/forgot-password');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Clear the reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    req.flash('success_msg', 'Password has been reset successfully. You can now log in.');
    res.redirect('/login');

  } catch (err) {
    console.error('Reset Password POST Error:', err);
    req.flash('error_msg', 'An error occurred while resetting the password.');
    res.redirect(`/auth/reset-password/${resetToken}`);
  }
});

module.exports = router;