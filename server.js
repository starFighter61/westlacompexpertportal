const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { engine } = require('express-handlebars');
const methodOverride = require('method-override');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const mongoose = require('mongoose');
const flash = require('connect-flash'); // Require connect-flash

// Load config
dotenv.config({ path: './config/.env' });

// Passport config
require('./config/passport')(passport);

const app = express();

// Body parser
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Method override
app.use(methodOverride('_method'));

// Handlebars Configuration
app.engine('.hbs', engine({
  defaultLayout: 'main',
  extname: '.hbs',
  helpers: require('./utils/helpers'),
  runtimeOptions: { // Add runtime options
    allowProtoPropertiesByDefault: true,
    allowProtoMethodsByDefault: true,
  },
}));
app.set('view engine', '.hbs');

// Sessions
app.use(session({
  secret: 'westla computer expert', // Consider moving this to .env
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));

// Flash middleware
app.use(flash()); // Use connect-flash middleware

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Set global variables (including flash messages)
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.success_msg = req.flash('success_msg'); // Make flash messages available
  res.locals.error_msg = req.flash('error_msg');     // Make flash messages available
  res.locals.error = req.flash('error');             // Passport specific error flash
  next();
});

// Static folder
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/services', require('./routes/services'));
app.use('/invoices', require('./routes/invoices'));
app.use('/messages', require('./routes/messages'));
app.use('/documents', require('./routes/documents'));

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;

// Force redeploy trigger
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})
.catch(err => {
  console.error('Failed to connect to MongoDB', err);
});