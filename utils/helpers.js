const moment = require('moment-timezone'); // Use moment-timezone

module.exports = {
  // Format date
  formatDate: function(date, format, tz = 'America/Los_Angeles') {
    const momentDate = moment(date); // Create moment object first
    if (!date || !momentDate.isValid()) { // Check if date exists and is valid
      return 'N/A'; // Return placeholder if invalid or missing
    }
    // If valid, convert to the specified timezone before formatting
    return momentDate.tz(tz).format(format);
  },

  // Truncate text
  truncate: function(str, len) {
    if (str.length > len && str.length > 0) {
      let new_str = str + ' ';
      new_str = str.substr(0, len);
      new_str = str.substr(0, new_str.lastIndexOf(' '));
      new_str = new_str.length > 0 ? new_str : str.substr(0, len);
      return new_str + '...';
    }
    return str;
  },

  // Strip HTML tags
  stripTags: function(input) {
    return input.replace(/<(?:.|\n)*?>/gm, '');
  },

  // Format currency
  formatCurrency: function(number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(number);
  },

  // Select option
  select: function(selected, options) {
    return options
      .fn(this)
      .replace(
        new RegExp(' value="' + selected + '"'),
        '$& selected="selected"'
      )
      .replace(
        new RegExp('>' + selected + '</option>'),
        ' selected="selected"$&'
      );
  },

  // If equals
  ifEquals: function(arg1, arg2, options) {
    return arg1 == arg2 ? options.fn(this) : options.inverse(this);
  },

  // If not equals
  ifNotEquals: function(arg1, arg2, options) {
    return arg1 != arg2 ? options.fn(this) : options.inverse(this);
  },

  // If in array
  ifInArray: function(array, value, options) {
    if (!array) return options.inverse(this);
    return array.includes(value) ? options.fn(this) : options.inverse(this);
  },

  // If user is owner
  ifUserIsOwner: function(resourceUserId, userId, options) {
    return resourceUserId == userId ? options.fn(this) : options.inverse(this);
  },

  // If user is technician or admin
  ifUserIsTechnician: function(userRole, options) {
    return (userRole === 'technician' || userRole === 'admin') ? options.fn(this) : options.inverse(this);
  },

  // If user is admin
  ifUserIsAdmin: function(userRole, options) {
    return userRole === 'admin' ? options.fn(this) : options.inverse(this);
  },

  // If user is client
  ifUserIsClient: function(userRole, options) { // Added this helper
    return userRole === 'client' ? options.fn(this) : options.inverse(this);
  },

  // Get file icon based on mimetype
  getFileIcon: function(mimetype) {
    if (mimetype.includes('image')) {
      return 'fa-file-image';
    } else if (mimetype.includes('pdf')) {
      return 'fa-file-pdf';
    } else if (mimetype.includes('word') || mimetype.includes('document')) {
      return 'fa-file-word';
    } else if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) {
      return 'fa-file-excel';
    } else if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) {
      return 'fa-file-powerpoint';
    } else if (mimetype.includes('zip') || mimetype.includes('compressed')) {
      return 'fa-file-archive';
    } else if (mimetype.includes('text')) {
      return 'fa-file-alt';
    } else {
      return 'fa-file';
    }
  },

  // Format file size
  formatFileSize: function(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // Calculate days remaining until due date
  daysRemaining: function(dueDate) {
    const now = moment();
    const due = moment(dueDate);
    return due.diff(now, 'days');
  },

  // Check if date is past
  isPast: function(date, options) {
    return moment().isAfter(date) ? options.fn(this) : options.inverse(this);
  },

  // Add two numbers
  add: function(a, b) {
    return a + b;
  },

  // Subtract two numbers
  subtract: function(a, b) {
    return a - b;
  },

  // Multiply two numbers
  multiply: function(a, b) {
    return a * b;
  },

  // Divide two numbers
  divide: function(a, b) {
    return a / b;
  },

  // Format number to fixed decimal places
  toFixed: function(number, digits) {
    if (typeof number !== 'number') {
      return number; // Return original value if not a number
    }
    return number.toFixed(digits);
  }
};