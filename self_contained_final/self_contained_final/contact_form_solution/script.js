// Update the script.js file to use the PHPMailer version
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.getElementById('contactForm');
    const statusDiv = document.getElementById('status');
    
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get form data
        const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            message: document.getElementById('message').value
        };
        
        // Display loading message
        statusDiv.textContent = 'Sending message...';
        statusDiv.className = 'status';
        statusDiv.style.display = 'block';
        
        // Send form data to server
        fetch('send_email_phpmailer.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Show success message
                statusDiv.textContent = 'Message sent successfully!';
                statusDiv.className = 'status success';
                
                // Reset form
                contactForm.reset();
            } else {
                // Show error message
                statusDiv.textContent = data.message || 'Failed to send message. Please try again.';
                statusDiv.className = 'status error';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            statusDiv.textContent = 'An error occurred. Please try again later.';
            statusDiv.className = 'status error';
        });
    });
});
