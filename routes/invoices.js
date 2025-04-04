const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureTechnician, ensureOwnerOrTechnician } = require('../middleware/auth');
const Invoice = require('../models/Invoice');
const Service = require('../models/Service');
const User = require('../models/User');
const moment = require('moment');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// @desc    Show all invoices
// @route   GET /invoices
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    let invoices;
    
    // If client, show only their invoices
    if (req.user.role === 'client') {
      invoices = await Invoice.find({ client: req.user._id })
        .populate('service', 'deviceType issueDescription')
        .sort({ createdAt: 'desc' })
        .lean();
    } 
    // If technician or admin, show all invoices
    else {
      invoices = await Invoice.find({})
        .populate('client', 'name email')
        .populate('service', 'deviceType issueDescription')
        .sort({ createdAt: 'desc' })
        .lean();
    }
    
    // Format dates and calculate totals
    let totalAmount = 0;
    let paidAmount = 0;
    let unpaidAmount = 0;
    
    invoices = invoices.map(invoice => {
      // Format dates
      invoice.formattedIssueDate = moment(invoice.issueDate).format('MM/DD/YYYY');
      invoice.formattedDueDate = moment(invoice.dueDate).format('MM/DD/YYYY');
      
      // Calculate totals
      totalAmount += invoice.total;
      if (invoice.status === 'Paid') {
        paidAmount += invoice.total;
      } else {
        unpaidAmount += invoice.total;
      }
      
      return invoice;
    });
    
    res.render('invoices/index', {
      invoices,
      totalAmount,
      paidAmount,
      unpaidAmount
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Show add invoice page
// @route   GET /invoices/add/:serviceId
router.get('/add/:serviceId', ensureTechnician, async (req, res) => {
  try {
    const service = await Service.findById(req.params.serviceId)
      .populate('client', 'name email')
      .lean();
    
    if (!service) {
      return res.render('error/404');
    }
    
    // Generate invoice number
    const invoiceCount = await Invoice.countDocuments();
    const invoiceNumber = `INV-${moment().format('YYYYMMDD')}-${(invoiceCount + 1).toString().padStart(4, '0')}`;
    
    res.render('invoices/add', {
      service,
      invoiceNumber,
      dueDate: moment().add(15, 'days').format('YYYY-MM-DD')
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Process add invoice form
// @route   POST /invoices/add/:serviceId
router.post('/add/:serviceId', ensureTechnician, async (req, res) => {
  try {
    const service = await Service.findById(req.params.serviceId);
    
    if (!service) {
      return res.render('error/404');
    }
    
    const { invoiceNumber, dueDate, notes } = req.body;
    
    // Process items
    const items = [];
    const descriptions = Array.isArray(req.body.description) ? req.body.description : [req.body.description];
    const quantities = Array.isArray(req.body.quantity) ? req.body.quantity : [req.body.quantity];
    const unitPrices = Array.isArray(req.body.unitPrice) ? req.body.unitPrice : [req.body.unitPrice];
    
    let subtotal = 0;
    
    for (let i = 0; i < descriptions.length; i++) {
      if (descriptions[i] && quantities[i] && unitPrices[i]) {
        const quantity = parseInt(quantities[i]);
        const unitPrice = parseFloat(unitPrices[i]);
        const amount = quantity * unitPrice;
        
        items.push({
          description: descriptions[i],
          quantity,
          unitPrice,
          amount
        });
        
        subtotal += amount;
      }
    }
    
    // Calculate tax (8.75% for Los Angeles)
    const taxRate = 0.0875;
    const tax = parseFloat((subtotal * taxRate).toFixed(2));
    
    // Calculate discount
    const discount = parseFloat(req.body.discount || 0);
    
    // Calculate total
    const total = parseFloat((subtotal + tax - discount).toFixed(2));
    
    // Create new invoice
    const newInvoice = new Invoice({
      service: service._id,
      client: service.client,
      invoiceNumber,
      items,
      subtotal,
      tax,
      discount,
      total,
      status: 'Unpaid',
      notes,
      dueDate,
      issueDate: Date.now()
    });
    
    await newInvoice.save();
    
    // Update service status if it's not already completed
    if (service.status !== 'Completed') {
      service.status = 'Ready for Pickup';
      await service.save();
    }
    
    req.flash('success_msg', 'Invoice created successfully');
    res.redirect(`/invoices/${newInvoice._id}`);
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Show single invoice
// @route   GET /invoices/:id
router.get('/:id', ensureAuthenticated, ensureOwnerOrTechnician(Invoice), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('client', 'name email phone address')
      .populate('service', 'deviceType deviceDetails issueDescription')
      .lean();
    
    if (!invoice) {
      return res.render('error/404');
    }
    
    // Format dates
    invoice.formattedIssueDate = moment(invoice.issueDate).format('MM/DD/YYYY');
    invoice.formattedDueDate = moment(invoice.dueDate).format('MM/DD/YYYY');
    
    // Check if invoice is overdue
    invoice.isOverdue = moment().isAfter(invoice.dueDate) && invoice.status === 'Unpaid';
    
    res.render('invoices/show', {
      invoice,
      isClient: req.user.role === 'client',
      isTechnician: req.user.role === 'technician' || req.user.role === 'admin'
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Update invoice status
// @route   PUT /invoices/:id/status
router.put('/:id/status', ensureTechnician, async (req, res) => {
  try {
    const { status } = req.body;
    
    const invoice = await Invoice.findById(req.params.id);
    
    if (!invoice) {
      return res.render('error/404');
    }
    
    invoice.status = status;
    
    if (status === 'Paid') {
      invoice.paymentDate = Date.now();
      invoice.paymentMethod = req.body.paymentMethod;
      invoice.paymentReference = req.body.paymentReference;
    }
    
    await invoice.save();
    
    req.flash('success_msg', 'Invoice status updated successfully');
    res.redirect(`/invoices/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Show payment page
// @route   GET /invoices/:id/pay
router.get('/:id/pay', ensureAuthenticated, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('client', 'name email')
      .populate('service', 'deviceType issueDescription')
      .lean();
    
    if (!invoice) {
      return res.render('error/404');
    }
    
    // Check if user is the client
    if (invoice.client._id.toString() !== req.user._id.toString()) {
      req.flash('error_msg', 'You are not authorized to pay this invoice');
      return res.redirect('/invoices');
    }
    
    // Check if invoice is already paid
    if (invoice.status === 'Paid') {
      req.flash('error_msg', 'This invoice has already been paid');
      return res.redirect(`/invoices/${req.params.id}`);
    }
    
    res.render('invoices/pay', {
      invoice,
      stripePublicKey: process.env.STRIPE_PUBLIC_KEY
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Process payment
// @route   POST /invoices/:id/pay
router.post('/:id/pay', ensureAuthenticated, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    
    if (!invoice) {
      return res.render('error/404');
    }
    
    // Check if user is the client
    if (invoice.client.toString() !== req.user._id.toString()) {
      req.flash('error_msg', 'You are not authorized to pay this invoice');
      return res.redirect('/invoices');
    }
    
    // Check if invoice is already paid
    if (invoice.status === 'Paid') {
      req.flash('error_msg', 'This invoice has already been paid');
      return res.redirect(`/invoices/${req.params.id}`);
    }
    
    const { stripeToken, paymentMethod } = req.body;
    
    // If using Stripe
    if (stripeToken && paymentMethod === 'Credit Card') {
      // Create a charge using Stripe
      const charge = await stripe.charges.create({
        amount: Math.round(invoice.total * 100), // Stripe requires amount in cents
        currency: 'usd',
        description: `Invoice ${invoice.invoiceNumber} for West LA Computer Expert`,
        source: stripeToken
      });
      
      // Update invoice
      invoice.status = 'Paid';
      invoice.paymentDate = Date.now();
      invoice.paymentMethod = 'Credit Card';
      invoice.paymentReference = charge.id;
      
      await invoice.save();
      
      req.flash('success_msg', 'Payment successful');
      return res.redirect(`/invoices/${req.params.id}`);
    }
    
    // For other payment methods (handled manually)
    req.flash('success_msg', 'Payment information received. Our team will process your payment shortly.');
    res.redirect(`/invoices/${req.params.id}`);
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Payment failed. Please try again or contact support.');
    res.redirect(`/invoices/${req.params.id}/pay`);
  }
});

module.exports = router;