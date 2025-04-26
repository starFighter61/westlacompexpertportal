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
    const { status, technician, estimatedCompletionDate, estimatedCost, noteText } = req.body;
    
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.render('error/404');
    }
    
    // Update service fields
    if (status) service.status = status;
    if (technician) service.technician = technician;
    if (estimatedCompletionDate) service.estimatedCompletionDate = estimatedCompletionDate;
    if (estimatedCost) service.estimatedCost = estimatedCost;
    
    // Add note if provided
    if (noteText) {
      service.notes.push({
        text: noteText,
        createdBy: req.user._id,
        isPublic: req.body.isPublic === 'on'
      });
    }
    
    service.updatedAt = Date.now();
    
    await service.save();

    // Find and update associated invoice
    const invoice = await Invoice.findOne({ service: service._id });

    if (invoice) {
      // Update invoice items based on service details (example - adjust as needed)
      invoice.items = [{ description: service.issueDescription, quantity: 1, unitPrice: service.estimatedCost || 0, amount: service.estimatedCost || 0 }];
      invoice.subtotal = service.estimatedCost || 0;
      invoice.total = service.estimatedCost || 0;

      await invoice.save();
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