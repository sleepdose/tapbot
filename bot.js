const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

// Middleware for CORS
app.use(cors());

// Rate limiting middleware: limit each IP to 100 requests per windowMs
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

// Middleware for JSON body parsing
app.use(express.json());

// Input validation middleware
app.use((req, res, next) => {
    const { data } = req.body;
    if (!data || typeof data !== 'string') {
        return res.status(400).json({ error: 'Invalid input data' });
    }
    next();
});

// Example route
app.post('/api/bot', (req, res) => {
    const { data } = req.body;
    // Process the data...
    res.json({ success: true, message: 'Data processed successfully!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
