const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureTechnician } = require('../middleware/auth');
const Document = require('../models/Document');
const User = require('../models/User');
const Service = require('../models/Service');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const dir = './public/uploads/documents';
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: function(req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt|zip|ppt|pptx/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: File type not supported!');
    }
  }
});

// @desc    Show all documents
// @route   GET /documents
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    let documents;
    
    // If client, show only their documents and public documents
    if (req.user.role === 'client') {
      documents = await Document.find({
        $or: [
          { client: req.user._id },
          { isPublic: true }
        ]
      })
        .populate('service', 'deviceType issueDescription')
        .populate('owner', 'name role')
        .sort({ createdAt: 'desc' })
        .lean();
    } 
    // If technician or admin, show all documents
    else {
      documents = await Document.find({})
        .populate('client', 'name email')
        .populate('service', 'deviceType issueDescription')
        .populate('owner', 'name role')
        .sort({ createdAt: 'desc' })
        .lean();
    }
    
    res.render('documents/index', {
      documents,
      isTechnician: req.user.role === 'technician' || req.user.role === 'admin'
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Show upload document form
// @route   GET /documents/upload
router.get('/upload', ensureAuthenticated, async (req, res) => {
  try {
    let services;
    let clients;
    
    // If client, get only their services
    if (req.user.role === 'client') {
      services = await Service.find({ client: req.user._id })
        .select('deviceType issueDescription status')
        .lean();
    } 
    // If technician or admin, get all services and clients
    else {
      services = await Service.find({})
        .select('deviceType issueDescription client status')
        .populate('client', 'name')
        .lean();
      
      clients = await User.find({ role: 'client' })
        .select('name email')
        .lean();
    }
    
    res.render('documents/upload', {
      services,
      clients,
      isTechnician: req.user.role === 'technician' || req.user.role === 'admin'
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Process upload document form
// @route   POST /documents/upload
router.post('/upload', ensureAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      req.flash('error_msg', 'Please upload a file');
      return res.redirect('/documents/upload');
    }
    
    const { name, description, category, service, client, isPublic } = req.body;
    
    // Create new document
    const newDocument = new Document({
      name,
      description,
      filename: req.file.originalname,
      path: req.file.path.replace('public', ''),
      mimetype: req.file.mimetype,
      size: req.file.size,
      category,
      owner: req.user._id,
      service: service || null,
      client: client || null,
      isPublic: isPublic === 'on'
    });
    
    await newDocument.save();
    
    req.flash('success_msg', 'Document uploaded successfully');
    res.redirect('/documents');
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Show single document
// @route   GET /documents/:id
router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate('owner', 'name role')
      .populate('client', 'name email')
      .populate('service', 'deviceType issueDescription')
      .populate('sharedWith.user', 'name role')
      .lean();
    
    if (!document) {
      return res.render('error/404');
    }
    
    // Check if user has access to document
    const isOwner = document.owner._id.toString() === req.user._id.toString();
    const isClient = document.client && document.client._id.toString() === req.user._id.toString();
    const isSharedWith = document.sharedWith.some(share => share.user._id.toString() === req.user._id.toString());
    const isTechnician = req.user.role === 'technician' || req.user.role === 'admin';
    
    if (!isOwner && !isClient && !isSharedWith && !document.isPublic && !isTechnician) {
      req.flash('error_msg', 'You do not have permission to access this document');
      return res.redirect('/documents');
    }
    
    // Get users for sharing
    let users = [];
    if (isOwner || isTechnician) {
      users = await User.find({ _id: { $ne: req.user._id } })
        .select('name role')
        .lean();
    }
    
    res.render('documents/show', {
      document,
      users,
      isOwner,
      isTechnician
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Download document
// @route   GET /documents/:id/download
router.get('/:id/download', ensureAuthenticated, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    
    if (!document) {
      return res.render('error/404');
    }
    
    // Check if user has access to document
    const isOwner = document.owner.toString() === req.user._id.toString();
    const isClient = document.client && document.client.toString() === req.user._id.toString();
    const isSharedWith = document.sharedWith.some(share => share.user.toString() === req.user._id.toString());
    const isTechnician = req.user.role === 'technician' || req.user.role === 'admin';
    
    if (!isOwner && !isClient && !isSharedWith && !document.isPublic && !isTechnician) {
      req.flash('error_msg', 'You do not have permission to download this document');
      return res.redirect('/documents');
    }
    
    const filePath = path.join(__dirname, '../public', document.path);
    res.download(filePath, document.filename);
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Share document
// @route   POST /documents/:id/share
router.post('/:id/share', ensureAuthenticated, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    
    if (!document) {
      return res.render('error/404');
    }
    
    // Check if user is owner or technician
    const isOwner = document.owner.toString() === req.user._id.toString();
    const isTechnician = req.user.role === 'technician' || req.user.role === 'admin';
    
    if (!isOwner && !isTechnician) {
      req.flash('error_msg', 'You do not have permission to share this document');
      return res.redirect('/documents');
    }
    
    const { user, permission } = req.body;
    
    // Check if already shared with user
    const alreadyShared = document.sharedWith.some(share => share.user.toString() === user);
    
    if (alreadyShared) {
      // Update permission
      await Document.updateOne(
        { _id: req.params.id, 'sharedWith.user': user },
        { $set: { 'sharedWith.$.permission': permission } }
      );
    } else {
      // Add new share
      document.sharedWith.push({
        user,
        permission,
        sharedAt: Date.now()
      });
      
      await document.save();
    }
    
    req.flash('success_msg', 'Document shared successfully');
    res.redirect(`/documents/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Delete document
// @route   DELETE /documents/:id
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    
    if (!document) {
      return res.render('error/404');
    }
    
    // Check if user is owner or technician
    const isOwner = document.owner.toString() === req.user._id.toString();
    const isTechnician = req.user.role === 'technician' || req.user.role === 'admin';
    
    if (!isOwner && !isTechnician) {
      req.flash('error_msg', 'You do not have permission to delete this document');
      return res.redirect('/documents');
    }
    
    // Delete file from filesystem
    const filePath = path.join(__dirname, '../public', document.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete document from database
    await document.remove();
    
    req.flash('success_msg', 'Document deleted successfully');
    res.redirect('/documents');
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

module.exports = router;