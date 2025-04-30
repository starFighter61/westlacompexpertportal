const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureTechnician, ensureOwnerOrTechnician } = require('../middleware/auth');
const Service = require('../models/Service');
const User = require('../models/User');
const Invoice = require('../models/Invoice'); // Import Invoice model

// @desc    Show all services
// @route   GET /services
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    let services;
    
    // If client, show only their services
    if (req.user.role === 'client') {
      services = await Service.find({ client: req.user._id })
        .populate('technician', 'name')
        .sort({ createdAt: 'desc' })
        .lean();
    } 
    // If technician or admin, show all services
    else {
      services = await Service.find({})
        .populate('client', 'name email')
        .populate('technician', 'name')
        .sort({ createdAt: 'desc' })
        .lean();
    }
    
    res.render('services/index', {
      services
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Show add service page
// @route   GET /services/add
router.get('/add', ensureAuthenticated, (req, res) => {
  res.render('services/add');
});

// @desc    Process add service form
// @route   POST /services/add
router.post('/add', ensureAuthenticated, async (req, res) => {
  try {
    const { deviceType, brand, model, serialNumber, issueDescription, issueType } = req.body;
    
    // Create new service
    console.log('Creating new service...'); // ADD LOGGING
    const newService = new Service({
      client: req.user._id,
      deviceType,
      deviceDetails: {
        brand,
        model,
        serialNumber
      },
      issueDescription,
      issueType: Array.isArray(issueType) ? issueType : [issueType],
      status: 'New'
    });
    console.log('New service created:', newService); // ADD LOGGING
    
    console.log('Saving new service...'); // ADD LOGGING
    await newService.save();
    
    req.flash('success_msg', 'Service request submitted successfully');
    res.redirect('/services');
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Show single service
// @route   GET /services/:id
router.get('/:id', ensureAuthenticated, ensureOwnerOrTechnician(Service), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('client', 'name email phone')
      .populate('technician', 'name')
      .lean();
    
    if (!service) {
      return res.render('error/404');
    }
    
    // Get technicians for assignment
    const technicians = await User.find({ role: { $in: ['technician', 'admin'] } })
      .select('name')
      .lean();
    
    res.render('services/show', {
      service,
      technicians,
      isOwner: req.user._id.toString() === service.client._id.toString(),
      isTechnician: req.user.role === 'technician' || req.user.role === 'admin'
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Update service
// @route   PUT /services/:id
router.put('/:id', ensureAuthenticated, ensureOwnerOrTechnician(Service), async (req, res) => {
  try {
    console.log('Updating service with id:', req.params.id); // ADD LOGGING
    const { status, technician, estimatedCompletionDate, estimatedCost, noteText } = req.body;
    console.log('Request body:', req.body); // ADD LOGGING
    
    const service = await Service.findById(req.params.id);
    console.log('Service found:', service); // ADD LOGGING
    
    if (!service) {
      console.log('Service not found'); // ADD LOGGING
      return res.render('error/404');
    }
    
    // Update service fields
    if (status) service.status = status;
    if (technician) service.technician = technician;
    if (estimatedCompletionDate) service.estimatedCompletionDate = estimatedCompletionDate;
    if (estimatedCost) service.estimatedCost = estimatedCost;
    console.log('Service updated:', service); // ADD LOGGING
    
    // Add note if provided
    if (noteText) {
      service.notes.push({
        text: noteText,
        createdBy: req.user._id,
        isPublic: req.body.isPublic === 'on'
      });
    }
    console.log('Notes added:', service.notes); // ADD LOGGING
    
    service.updatedAt = Date.now();
    console.log('UpdatedAt set:', service.updatedAt); // ADD LOGGING
    
    await service.save();
    console.log('Service saved:', service); // ADD LOGGING

    // Find and update associated invoice
    try {
      const invoice = await Invoice.findOne({ service: service._id });
      console.log('Invoice found:', invoice); // ADD LOGGING

      if (invoice) {
        console.log('Updating invoice with id:', invoice._id); // ADD LOGGING

        // Update or add item to invoice based on service details
        let estimatedCost = Number(service.estimatedCost) || 0; // Ensure it's a number
        if (isNaN(estimatedCost)) {
          estimatedCost = 0;
        }
        const existingItemIndex = invoice.items.findIndex(item => item.service && item.service.toString() === service._id.toString());

        if (existingItemIndex > -1) {
          // Update existing item
          invoice.items[existingItemIndex].description = service.issueDescription;
          invoice.items[existingItemIndex].unitPrice = estimatedCost;
          invoice.items[existingItemIndex].amount = estimatedCost;
          console.log('Existing invoice item updated:', invoice.items[existingItemIndex]); // ADD LOGGING
        } else {
          // Add new item
          invoice.items.push({
            description: service.issueDescription,
            quantity: 1,
            unitPrice: estimatedCost,
            amount: estimatedCost,
            service: service._id
          });
          console.log('New invoice item added:', invoice.items[invoice.items.length - 1]); // ADD LOGGING
        }

        // Recalculate subtotal and total
        invoice.subtotal = invoice.items.reduce((acc, item) => acc + item.amount, 0);
        invoice.total = invoice.subtotal - (invoice.discount || 0);
        console.log('Invoice subtotal:', invoice.subtotal); // ADD LOGGING
        console.log('Invoice total:', invoice.total); // ADD LOGGING

        await invoice.save();
        console.log('Invoice saved:', invoice); // ADD LOGGING
      }
    } catch (invoiceErr) {
      console.error('Error updating invoice:', invoiceErr);
    }

    req.flash('success_msg', 'Service updated successfully');
    res.redirect(`/services/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Delete service
// @route   DELETE /services/:id
router.delete('/:id', ensureTechnician, async (req, res) => {
  try {
    // Check if any invoices are associated with this service
    const associatedInvoices = await Invoice.find({ service: req.params.id });

    if (associatedInvoices.length > 0) {
      req.flash('error_msg', 'Cannot delete service with associated invoices. Please delete the invoices first.');
      return res.redirect(`/services/${req.params.id}`);
    }

    // If no invoices, proceed with deletion
    await Service.findByIdAndDelete(req.params.id);
    
    req.flash('success_msg', 'Service deleted successfully');
    res.redirect('/services');
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// @desc    Show services by status
// @route   GET /services/status/:status
router.get('/status/:status', ensureAuthenticated, async (req, res) => {
  try {
    const validStatuses = ['New', 'Diagnosing', 'Awaiting Approval', 'In Progress', 'Ready for Pickup', 'Completed', 'Cancelled'];
    
    if (!validStatuses.includes(req.params.status)) {
      return res.render('error/404');
    }
    
    let services;
    
    // If client, show only their services with the specified status
    if (req.user.role === 'client') {
      services = await Service.find({ 
        client: req.user._id,
        status: req.params.status
      })
        .populate('technician', 'name')
        .sort({ createdAt: 'desc' })
        .lean();
    } 
    // If technician or admin, show all services with the specified status
    else {
      services = await Service.find({ status: req.params.status })
        .populate('client', 'name email')
        .populate('technician', 'name')
        .sort({ createdAt: 'desc' })
        .lean();
    }
    
    res.render('services/index', {
      services,
      status: req.params.status
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

module.exports = router;