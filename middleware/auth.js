module.exports = {
  // Ensure user is authenticated
  ensureAuthenticated: function(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    req.flash('error_msg', 'Please log in to access this resource');
    res.redirect('/login');
  },
  
  // Ensure user is a guest (not authenticated)
  ensureGuest: function(req, res, next) {
    if (!req.isAuthenticated()) {
      return next();
    }
    res.redirect('/dashboard');
  },
  
  // Ensure user is a technician or admin
  ensureTechnician: function(req, res, next) {
    if (req.isAuthenticated() && (req.user.role === 'technician' || req.user.role === 'admin')) {
      return next();
    }
    req.flash('error_msg', 'You do not have permission to access this resource');
    res.redirect('/dashboard');
  },
  
  // Ensure user is an admin
  ensureAdmin: function(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
      return next();
    }
    req.flash('error_msg', 'You do not have permission to access this resource');
    res.redirect('/dashboard');
  },
  
  // Ensure user is the owner of the resource or a technician/admin
  ensureOwnerOrTechnician: function(model) {
    return async function(req, res, next) {
      try {
        const resource = await model.findById(req.params.id);
        
        if (!resource) {
          req.flash('error_msg', 'Resource not found');
          return res.redirect('back');
        }
        
        if (
          (resource.client && resource.client.toString() === req.user._id.toString()) ||
          req.user.role === 'technician' ||
          req.user.role === 'admin'
        ) {
          return next();
        }
        
        req.flash('error_msg', 'You do not have permission to access this resource');
        res.redirect('/dashboard');
      } catch (err) {
        console.error(err);
        res.render('error/500');
      }
    };
  }
};