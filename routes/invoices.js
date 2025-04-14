const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureTechnician, ensureOwnerOrTechnician } = require('../middleware/auth');
const Invoice = require('../models/Invoice');
const Service = require('../models/Service');
const User = require('../models/User');
const moment = require('moment-timezone'); // Use moment-timezone
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
      invoice.formattedIssueDate = moment(invoice.issueDate).tz('America/Los_Angeles').format('MM/DD/YYYY');
      invoice.formattedDueDate = moment(invoice.dueDate).tz('America/Los_Angeles').format('MM/DD/YYYY');
      
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
    
    // Tax removed as per requirement
    
    // Calculate discount
    const discount = parseFloat(req.body.discount || 0);
    
    // Calculate total
    const total = parseFloat((subtotal - discount).toFixed(2));
    
    // Create new invoice
    const newInvoice = new Invoice({
      service: service._id,
      client: service.client,
      invoiceNumber,
      items,
      subtotal,
      // tax field removed from model
      discount,
      total,
      status: 'Unpaid',
      notes,
      dueDate,
      issueDate: Date.now()
    });
    
    console.log('--- Creating new invoice with data: ---'); // ADD LOGGING
    console.log('Service ID:', newInvoice.service);
    console.log('Client ID:', newInvoice.client);
    console.log('Invoice Number:', newInvoice.invoiceNumber);
    console.log('Items:', JSON.stringify(newInvoice.items, null, 2)); // Log items nicely
    console.log('Subtotal:', newInvoice.subtotal);
    console.log('Discount:', newInvoice.discount);
    console.log('Total:', newInvoice.total);
    console.log('Status:', newInvoice.status);
    console.log('Due Date:', newInvoice.dueDate);
    console.log('----------------------------------------'); // ADD LOGGING
    
    await newInvoice.save();
    
    // Update service status if it's not already completed
    if (service.status !== 'Completed') {
      service.status = 'Ready for Pickup';
      await service.save();
    }
    
    req.flash('success_msg', 'Invoice created successfully');
    res.redirect(`/invoices/${newInvoice._id}`);
  } catch (err) {
    console.error('--- ERROR creating invoice:', err); // ADD LOGGING
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
    invoice.formattedIssueDate = moment(invoice.issueDate).tz('America/Los_Angeles').format('MM/DD/YYYY');
    invoice.formattedDueDate = moment(invoice.dueDate).tz('America/Los_Angeles').format('MM/DD/YYYY');
    
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

  } catch (err) { // This catch belongs to POST /invoices/:id/pay
    console.error(err);
    req.flash('error_msg', 'Payment failed. Please try again or contact support.');
    res.redirect(`/invoices/${req.params.id}/pay`);
  }
}); // End of POST /invoices/:id/pay route

// @desc    Show printable invoice
// @route   GET /invoices/:id/print
router.get('/:id/print', ensureAuthenticated, ensureOwnerOrTechnician(Invoice), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('client', 'name email phone address') // Populate client details
      .populate('service', 'deviceType deviceDetails issueDescription') // Populate service details
      .lean();

    if (!invoice) {
      return res.render('error/404');
    }

    // Format dates
    invoice.formattedIssueDate = moment(invoice.issueDate).tz('America/Los_Angeles').format('MM/DD/YYYY');
    invoice.formattedDueDate = moment(invoice.dueDate).tz('America/Los_Angeles').format('MM/DD/YYYY');
    if (invoice.paymentDate) {
      invoice.formattedPaymentDate = moment(invoice.paymentDate).tz('America/Los_Angeles').format('MM/DD/YYYY');
    }

    // Render the print view using the print layout
    res.render('invoices/print', {
      layout: 'print', // Specify the print layout
      invoice
    });

  } catch (err) {
    console.error('--- ERROR generating printable invoice:', err);
    res.render('error/500');
  }
});

// @desc    Delete invoice
// @route   DELETE /invoices/:id
router.delete('/:id', ensureTechnician, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.render('error/404');
    }

    await Invoice.findByIdAndDelete(req.params.id);

    req.flash('success_msg', 'Invoice deleted successfully');
    res.redirect('/invoices');
  } catch (err) {
    console.error('--- ERROR deleting invoice:', err);
    res.render('error/500');
  }
});

module.exports = router;