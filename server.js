const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('./'));

app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working!' });
});

app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    res.json({ id: userId, name: 'Test User', coins: 1000 });
});

app.post('/api/save', express.json(), (req, res) => {
    console.log('Data received:', req.body);
    res.json({ success: true, message: 'Data saved' });
});

app.use((req, res) => {
    res.status(404).send('Not Found');
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});