// Required modules
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

// Middleware for CORS
app.use(cors({ origin: 'https://your-allowed-origin.com' })); // Adjust accordingly

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Middleware to parse JSON in requests
app.use(express.json());

// Function to validate input
function validateInput(data) {
  // Implement your validation logic here
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid input');
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Securely handle Telegram token validation
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // Use environment variable for security
app.post('/webhook', (req, res) => {
  try {
    validateInput(req.body);
    if (req.body.token !== TELEGRAM_TOKEN) {
      return res.status(403).send('Forbidden');
    }
    // handle the incoming update from Telegram
    res.status(200).send('Webhook received');
  } catch (error) {
    res.status(400).send(error.message);
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
