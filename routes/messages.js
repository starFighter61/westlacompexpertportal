const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const { Message, Conversation } = require('../models/Message');
const User = require('../models/User');
const Service = require('../models/Service');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const dir = './public/uploads/messages';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: function(req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt|zip/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: File type not supported!');
    }
  }
});

// @desc    Show all conversations
// @route   GET /messages
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id
    })
      .sort({ updatedAt: 'desc' })
      .populate('participants', 'name role')
      .populate('service', 'deviceType issueDescription')
      .populate('lastMessage')
      .lean();
    
    res.render('messages/index', {
      conversations
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Show new conversation form
// @route   GET /messages/new
router.get('/new', ensureAuthenticated, async (req, res) => {
  try {
    let users;
    let services;
    
    // If client, get technicians and their services
    if (req.user.role === 'client') {
      users = await User.find({ role: { $in: ['technician', 'admin'] } })
        .select('name role')
        .lean();
      
      services = await Service.find({ client: req.user._id })
        .select('deviceType issueDescription status')
        .lean();
    } 
    // If technician, get clients and all services
    else {
      users = await User.find({ role: 'client' })
        .select('name role')
        .lean();
      
      services = await Service.find({})
        .select('deviceType issueDescription client status')
        .populate('client', 'name')
        .lean();
    }
    
    res.render('messages/new', {
      users,
      services
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Create new conversation
// @route   POST /messages/new
router.post('/new', ensureAuthenticated, async (req, res) => {
  try {
    const { recipient, service, subject, message } = req.body;
    
    // Create new conversation
    const newConversation = new Conversation({
      participants: [req.user._id, recipient],
      service: service || null,
      subject
    });
    
    await newConversation.save();
    
    // Create first message
    const newMessage = new Message({
      conversation: newConversation._id,
      sender: req.user._id,
      content: message
    });
    
    await newMessage.save();
    
    // Update conversation with last message
    newConversation.lastMessage = newMessage._id;
    await newConversation.save();
    
    req.flash('success_msg', 'Message sent successfully');
    res.redirect(`/messages/${newConversation._id}`);
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Show single conversation
// @route   GET /messages/:id
router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user._id
    })
      .populate('participants', 'name role')
      .populate('service', 'deviceType issueDescription')
      .lean();
    
    if (!conversation) {
      return res.render('error/404');
    }
    
    // Get messages
    const messages = await Message.find({ conversation: req.params.id })
      .sort({ createdAt: 'asc' })
      .populate('sender', 'name role')
      .lean();
    
    // Mark messages as read
    await Message.updateMany(
      { 
        conversation: req.params.id,
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id }
      },
      { 
        $push: { 
          readBy: { 
            user: req.user._id,
            readAt: Date.now()
          } 
        } 
      }
    );
    
    res.render('messages/show', {
      conversation,
      messages,
      currentUser: req.user._id.toString()
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Send message in conversation
// @route   POST /messages/:id
router.post('/:id', ensureAuthenticated, upload.array('attachments', 5), async (req, res) => {
  try {
    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user._id
    });
    
    if (!conversation) {
      return res.render('error/404');
    }
    
    const { content } = req.body;
    
    // Process attachments
    const attachments = [];
    
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          filename: file.originalname,
          path: file.path.replace('public', ''),
          mimetype: file.mimetype,
          size: file.size
        });
      });
    }
    
    // Create new message
    const newMessage = new Message({
      conversation: conversation._id,
      sender: req.user._id,
      content,
      attachments
    });
    
    await newMessage.save();
    
    // Update conversation
    conversation.lastMessage = newMessage._id;
    conversation.updatedAt = Date.now();
    await conversation.save();
    
    res.redirect(`/messages/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Archive conversation
// @route   PUT /messages/:id/archive
router.put('/:id/archive', ensureAuthenticated, async (req, res) => {
  try {
    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user._id
    });
    
    if (!conversation) {
      return res.render('error/404');
    }
    
    conversation.isArchived = true;
    await conversation.save();
    
    req.flash('success_msg', 'Conversation archived successfully');
    res.redirect('/messages');
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Unarchive conversation
// @route   PUT /messages/:id/unarchive
router.put('/:id/unarchive', ensureAuthenticated, async (req, res) => {
  try {
    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user._id
    });
    
    if (!conversation) {
      return res.render('error/404');
    }
    
    conversation.isArchived = false;
    await conversation.save();
    
    req.flash('success_msg', 'Conversation unarchived successfully');
    res.redirect('/messages');
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

module.exports = router;