require('dotenv').config();
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Hello World!'));

app.listen(process.env.PORT, () => console.log(`Express app is running on port ${process.env.PORT}!`));