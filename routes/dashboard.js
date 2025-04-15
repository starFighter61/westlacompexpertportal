const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureTechnician, ensureAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Service = require('../models/Service');
const Invoice = require('../models/Invoice');
const { Conversation } = require('../models/Message');
const Document = require('../models/Document');

// @desc    Dashboard
// @route   GET /dashboard
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // For clients: show their services, invoices, and messages
    if (req.user.role === 'client') {
      const services = await Service.find({ client: req.user._id })
        .sort({ createdAt: 'desc' })
        .populate('technician', 'name')
        .lean();
      console.log('Client Services Fetched:', services ? services.length : 'null'); // Added log

      const invoices = await Invoice.find({ client: req.user._id })
        .sort({ createdAt: 'desc' })
        .populate('service', 'deviceType issueDescription')
        .lean();
      console.log('Client Invoices Fetched:', invoices ? invoices.length : 'null'); // Added log

      const conversations = await Conversation.find({
        participants: req.user._id
      })
        .sort({ updatedAt: 'desc' })
        .populate('lastMessage') // Populate lastMessage here
        .populate('service', 'deviceType')
        .lean();
      console.log('Client Conversations Fetched:', conversations ? conversations.length : 'null'); // Added log

      const documents = await Document.find({
        $or: [
          { client: req.user._id },
          { isPublic: true }
        ]
      })
        .sort({ createdAt: 'desc' })
        .populate('service', 'deviceType')
        .lean();
      console.log('Client Documents Fetched:', documents ? documents.length : 'null'); // Added log

      // Calculate unread messages from populated conversations
      let unreadCount = 0;
      if (conversations && conversations.length > 0) {
        unreadCount = conversations.filter(conv =>
          conv.lastMessage && // Check if lastMessage exists and is populated
          conv.lastMessage.readBy && // Check if readBy exists on the populated message
          !conv.lastMessage.readBy.some(reader => reader.user && reader.user.equals(req.user._id)) // Check if current user is NOT in readBy
        ).length;
      }
      console.log('Calculated Unread Count:', unreadCount); // Added log (Moved outside the if block)

      console.log('Attempting to render client dashboard...'); // Added log
      res.render('dashboard/client', {
        name: req.user.name,
        services,
        invoices,
        conversations,
        documents,
        unreadCount
      });
    }
    // For technicians and admins: show all services, recent invoices, and messages
    else if (req.user.role === 'technician') { // Explicitly check for technician
      const services = await Service.find({})
        .sort({ createdAt: 'desc' })
        .populate('client', 'name email')
        .populate('technician', 'name')
        .lean();

      const recentInvoices = await Invoice.find({})
        .sort({ createdAt: 'desc' })
        .limit(5)
        .populate('client', 'name')
        .populate('service', 'deviceType')
        .lean();

      const conversations = await Conversation.find({
        participants: req.user._id
      })
        .sort({ updatedAt: 'desc' })
        .populate('lastMessage')
        .populate('participants', 'name role')
        .populate('service', 'deviceType')
        .lean();

      // Count services by status
      const statusCounts = await Service.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);

      // Format status counts
      const statusStats = {};
      statusCounts.forEach(status => {
        statusStats[status._id] = status.count;
      });

      // Count unread messages (Technician - original logic might be okay here if needed, or adapt client logic)
      // For consistency, let's adapt the client logic for technicians too
      let unreadCount = 0;
       if (conversations && conversations.length > 0) {
        unreadCount = conversations.filter(conv =>
          conv.lastMessage &&
          conv.lastMessage.readBy &&
          !conv.lastMessage.readBy.some(reader => reader.user && reader.user.equals(req.user._id))
        ).length;
      }
      console.log('Technician Unread Count:', unreadCount);


      res.render('dashboard/technician', {
        name: req.user.name,
        role: req.user.role,
        services,
        recentInvoices,
        conversations,
        statusStats,
        unreadCount
      });
    } else if (req.user.role === 'admin') { // Add check for admin
      // Redirect admins to their dedicated dashboard route
      return res.redirect('/dashboard/admin');
    } else {
      // Fallback for any unexpected roles (optional, but good practice)
      console.error(`Unexpected user role encountered in /dashboard: ${req.user.role}`);
      req.flash('error_msg', 'An unexpected error occurred.');
      res.redirect('/login');
    }
  } catch (err) {
    console.error('Error in GET /dashboard:', err); // Added context to error log
    res.render('error/500');
  }
});

// @desc    User profile
// @route   GET /dashboard/profile
router.get('/profile', ensureAuthenticated, (req, res) => {
  res.render('dashboard/profile', {
    user: req.user
  });
});

// @desc    Update user profile
// @route   PUT /dashboard/profile
router.put('/profile', ensureAuthenticated, async (req, res) => {
  try {
    const { name, email, phone, street, city, state, zipCode } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        name,
        email,
        phone,
        address: {
          street,
          city,
          state,
          zipCode
        }
      },
      { new: true }
    );

    req.flash('success_msg', 'Profile updated successfully');
    res.redirect('/dashboard/profile');
  } catch (err) {
    console.error('Error updating profile:', err);
    req.flash('error_msg', 'Error updating profile');
    res.redirect('/dashboard/profile');
  }
});

// @desc    Admin dashboard
// @route   GET /dashboard/admin
router.get('/admin', ensureAdmin, async (req, res) => {
  try {
    // Get user counts
    const clientCount = await User.countDocuments({ role: 'client' });
    const technicianCount = await User.countDocuments({ role: 'technician' });

    // Get service counts
    const serviceCount = await Service.countDocuments();
    const completedServiceCount = await Service.countDocuments({ status: 'Completed' });

    // Get invoice stats
    const invoiceStats = await Invoice.aggregate([
      { $group: {
        _id: null,
        totalAmount: { $sum: '$total' },
        paidAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'Paid'] }, '$total', 0]
          }
        },
        unpaidAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'Unpaid'] }, '$total', 0]
          }
        }
      }}
    ]);

    res.render('dashboard/admin', {
      clientCount,
      technicianCount,
      serviceCount,
      completedServiceCount,
      invoiceStats: invoiceStats[0] || { totalAmount: 0, paidAmount: 0, unpaidAmount: 0 }
    });
  } catch (err) {
    console.error('Error in GET /dashboard/admin:', err);
    res.render('error/500');
  }
});

module.exports = router;