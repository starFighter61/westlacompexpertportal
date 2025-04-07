<?php
// Email sending script for contact form

// Set headers to handle CORS and JSON
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Get the form data from the request
$json = file_get_contents('php://input');
$data = json_decode($json, true);

// Initialize response array
$response = [
    'success' => false,
    'message' => ''
];

// Validate form data
if (
    !isset($data['name']) || empty($data['name']) ||
    !isset($data['email']) || empty($data['email']) ||
    !isset($data['phone']) || empty($data['phone']) ||
    !isset($data['message']) || empty($data['message'])
) {
    $response['message'] = 'Please fill in all required fields.';
    echo json_encode($response);
    exit;
}

// Sanitize form data
$name = filter_var($data['name'], FILTER_SANITIZE_STRING);
$email = filter_var($data['email'], FILTER_SANITIZE_EMAIL);
$phone = filter_var($data['phone'], FILTER_SANITIZE_STRING);
$message = filter_var($data['message'], FILTER_SANITIZE_STRING);
$recipient = 'support@westlcomputerexpert.tech'; // Hardcoded recipient email

// Validate email
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $response['message'] = 'Please enter a valid email address.';
    echo json_encode($response);
    exit;
}

// Set email headers
$subject = "New Contact Form Submission from $name";
$headers = "From: $email" . "\r\n";
$headers .= "Reply-To: $email" . "\r\n";
$headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";
$headers .= "MIME-Version: 1.0" . "\r\n";
$headers .= "Content-Type: text/html; charset=UTF-8" . "\r\n";

// Compose email body
$email_body = "
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        h2 {
            color: #f0883e;
        }
        .field {
            margin-bottom: 15px;
        }
        .label {
            font-weight: bold;
        }
        .value {
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class='container'>
        <h2>New Contact Form Submission</h2>
        <div class='field'>
            <div class='label'>Name:</div>
            <div class='value'>$name</div>
        </div>
        <div class='field'>
            <div class='label'>Email:</div>
            <div class='value'>$email</div>
        </div>
        <div class='field'>
            <div class='label'>Phone:</div>
            <div class='value'>$phone</div>
        </div>
        <div class='field'>
            <div class='label'>Message:</div>
            <div class='value'>$message</div>
        </div>
    </div>
</body>
</html>
";

// Send email
$mail_sent = mail($recipient, $subject, $email_body, $headers);

// Check if email was sent successfully
if ($mail_sent) {
    $response['success'] = true;
    $response['message'] = 'Your message has been sent successfully!';
} else {
    $response['message'] = 'Failed to send message. Please try again later.';
    
    // Log error for debugging (in a production environment, use proper logging)
    error_log("Failed to send email from contact form. From: $email, To: $recipient");
}

// Return JSON response
echo json_encode($response);
?>
