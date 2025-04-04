const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  technician: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deviceType: {
    type: String,
    required: true,
    enum: ['Laptop', 'Desktop', 'Phone', 'Tablet', 'Other']
  },
  deviceDetails: {
    brand: String,
    model: String,
    serialNumber: String
  },
  issueDescription: {
    type: String,
    required: true
  },
  issueType: [{
    type: String,
    enum: ['Hardware', 'Software', 'Virus/Malware', 'Data Recovery', 'Network', 'Upgrade', 'Maintenance', 'Other']
  }],
  status: {
    type: String,
    required: true,
    enum: ['New', 'Diagnosing', 'Awaiting Approval', 'In Progress', 'Ready for Pickup', 'Completed', 'Cancelled'],
    default: 'New'
  },
  estimatedCompletionDate: {
    type: Date
  },
  diagnosticFee: {
    type: Number,
    default: 0
  },
  estimatedCost: {
    type: Number
  },
  notes: [{
    text: {
      type: String,
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isPublic: {
      type: Boolean,
      default: true
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Service', ServiceSchema);