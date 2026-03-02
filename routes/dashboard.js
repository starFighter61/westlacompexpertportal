const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureTechnician, ensureAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Service = require('../models/Service');
const Invoice = require('../models/Invoice');
const { Conversation } = require('../models/Message');
const Document = require('../models/Document');
const moment = require('moment-timezone');

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
    const timeframe = req.query.timeframe || 'all'; // Default to 'all'
    let startDate;
    let endDate = moment().tz('America/Los_Angeles').endOf('day').toDate();

    if (timeframe === 'year') {
      startDate = moment().tz('America/Los_Angeles').startOf('year').toDate();
    } else if (timeframe === 'month') {
      startDate = moment().tz('America/Los_Angeles').startOf('month').toDate();
    } else if (timeframe === 'week') {
      startDate = moment().tz('America/Los_Angeles').startOf('week').toDate();
    } // If 'all', startDate remains undefined

    // Build query filter
    const dateFilter = {};
    if (startDate) {
      dateFilter.createdAt = { $gte: startDate, $lte: endDate };
      // For invoices, we use issueDate or createdAt. Let's base stats on createdAt for consistency,
      // or issueDate since that's when it was actually billed. We'll use createdAt for users/services,
      // and issueDate for invoices.
    }

    const userDateFilter = startDate ? { createdAt: { $gte: startDate, $lte: endDate } } : {};
    const serviceDateFilter = startDate ? { createdAt: { $gte: startDate, $lte: endDate } } : {};
    const invoiceDateFilter = startDate ? { issueDate: { $gte: startDate, $lte: endDate } } : {};

    // Get user counts
    const clientCount = await User.countDocuments({ role: 'client', ...userDateFilter });
    const technicianCount = await User.countDocuments({ role: 'technician', ...userDateFilter });

    // Get service counts
    const serviceCount = await Service.countDocuments(serviceDateFilter);
    const completedServiceCount = await Service.countDocuments({ status: 'Completed', ...serviceDateFilter });

    // Get invoice stats
    const invoiceStats = await Invoice.aggregate([
      { $match: invoiceDateFilter },
      {
        $group: {
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
        }
      }
    ]);

    // Prepare chart data (Revenue over time)
    // For 'all' or 'year', group by month. For 'month' or 'week', group by day.
    let groupByFormat;
    let formatString;

    if (timeframe === 'year' || timeframe === 'all') {
      groupByFormat = "%Y-%m"; // Group by Year-Month
      formatString = 'MMM YYYY'; // e.g., Jan 2024
    } else {
      groupByFormat = "%Y-%m-%d"; // Group by Date
      formatString = 'MMM D'; // e.g., Jan 15
    }

    const revenuePipeline = [
      { $match: invoiceDateFilter },
      {
        $group: {
          _id: { $dateToString: { format: groupByFormat, date: "$issueDate", timezone: "America/Los_Angeles" } },
          revenue: { $sum: '$total' }
        }
      },
      { $sort: { _id: 1 } } // Sort by date ascending
    ];

    const chartRawData = await Invoice.aggregate(revenuePipeline);

    // Format chart data for frontend
    const chartLabels = [];
    const chartValues = [];

    chartRawData.forEach(item => {
      chartLabels.push(moment(item._id).format(formatString));
      chartValues.push(item.revenue);
    });

    // Yearly income breakdown (always shows all years, independent of timeframe filter)
    const yearlyIncome = await Invoice.aggregate([
      { $match: { status: 'Paid' } },
      {
        $group: {
          _id: { $year: { date: '$issueDate', timezone: 'America/Los_Angeles' } },
          totalIncome: { $sum: '$total' },
          invoiceCount: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    res.render('dashboard/admin', {
      clientCount,
      technicianCount,
      serviceCount,
      completedServiceCount,
      invoiceStats: invoiceStats[0] || { totalAmount: 0, paidAmount: 0, unpaidAmount: 0 },
      timeframe,
      chartData: JSON.stringify({ labels: chartLabels, values: chartValues }),
      yearlyIncome
    });
  } catch (err) {
    console.error('Error in GET /dashboard/admin:', err);
    res.render('error/500');
  }
});

module.exports = router;