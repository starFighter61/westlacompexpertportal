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
    console.log('--- ensureGuest Check ---');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Request Path:', req.originalUrl);
    console.log('Session ID:', req.sessionID);
    // console.log('Session Data:', req.session); // Uncomment carefully - can be verbose
    console.log('Is Authenticated?:', req.isAuthenticated());
    console.log('User object:', req.user); // Will be undefined if not authenticated
    console.log('-------------------------');

    if (!req.isAuthenticated()) {
      console.log('ensureGuest: User is NOT authenticated. Proceeding...');
      return next();
    } else {
      console.log('ensureGuest: User IS authenticated. Redirecting to /dashboard...');
      res.redirect('/dashboard');
    }
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