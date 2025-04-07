<?php
// Email sending script for contact form using PHPMailer

// Uncomment these lines when using Composer autoload
// require 'vendor/autoload.php';
// use PHPMailer\PHPMailer\PHPMailer;
// use PHPMailer\PHPMailer\Exception;

// If not using Composer, uncomment these lines and make sure the PHPMailer files are in the same directory
require 'PHPMailer/src/Exception.php';
require 'PHPMailer/src/PHPMailer.php';
require 'PHPMailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

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

// Create a new PHPMailer instance
$mail = new PHPMailer(true);

try {
    // Server settings
    // $mail->SMTPDebug = 2;                      // Enable verbose debug output (set to 0 in production)
    $mail->isSMTP();                              // Send using SMTP
    $mail->Host       = smtp.gmail.com;       // SMTP server - CHANGE THIS
    $mail->SMTPAuth   = true;                     // Enable SMTP authentication
    '$mail->Username   = 'dzivetz@gmail.com''; // SMTP username - CHANGE THIS
    '$mail->Password   = 'fuvg hjda atkj lxve'';          // SMTP password - CHANGE THIS
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS; // Enable TLS encryption
    $mail->Port       = 587;                      // TCP port to connect to (use 465 for SSL)

    // Recipients
    $mail->setFrom($email, $name);
    $mail->addAddress($recipient);                // Add a recipient
    $mail->addReplyTo($email, $name);

    // Content
    $mail->isHTML(true);                          // Set email format to HTML
    $mail->Subject = "New Contact Form Submission from $name";
    
    // Email body
    $mail->Body = "
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
    
    // Plain text version for non-HTML mail clients
    $mail->AltBody = "New Contact Form Submission\n\nName: $name\nEmail: $email\nPhone: $phone\nMessage: $message";

    // Send email
    $mail->send();
    
    $response['success'] = true;
    $response['message'] = 'Your message has been sent successfully!';
} catch (Exception $e) {
    $response['message'] = "Failed to send message. Error: {$mail->ErrorInfo}";
    
    // Log error for debugging (in a production environment, use proper logging)
    error_log("Failed to send email from contact form. Error: {$mail->ErrorInfo}");
}

// Return JSON response
echo json_encode($response);
?>
