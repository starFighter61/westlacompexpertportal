// Add any client-side JavaScript interactions here.
// For example, confirming deletions, handling dynamic forms, etc.

document.addEventListener('DOMContentLoaded', function() {
  // Example: Add confirmation to delete buttons
  const deleteForms = document.querySelectorAll('form[action*="?_method=DELETE"]');
  deleteForms.forEach(form => {
    form.addEventListener('submit', function(event) {
      if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
        event.preventDefault();
      }
    });
  });

  // Example: Initialize tooltips if using Bootstrap tooltips
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Add specific JS for invoice creation form (already included in add.hbs)
  // Add specific JS for Stripe payment form (already included in pay.hbs)
  // Add specific JS for message thread scrolling (already included in show.hbs)
});