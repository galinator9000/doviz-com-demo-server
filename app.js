require('dotenv').config();
const express = require('express');
const app = express();

// Methods and objects related to our database operations
const {
    dbclient,
    initDatabaseConnection,
    closeDatabaseConnection,
    insertCurrencyRecord,
    getCurrencyValues
} = require("./db_queries");

app.use(express.static('public'));

app.get('/getCurrencyValues', async (req, res) => {
    res.send(await getCurrencyValues());
})

app.listen(
    process.env.PORT,
    async () => {
        console.log(`Express app is running on port ${process.env.PORT}!`);
        await initDatabaseConnection();
    }
);
