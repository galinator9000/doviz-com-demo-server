// Load .env
require('dotenv').config();

// Import express.js
const express = require('express');
const cors = require('cors');

/// Import local functions
// Doviz.com queries
const { getCurrencyDataDaily, checkDovizComAuth, updateDovizComAuth } = require("./dovizcom_queries");
// Methods and objects related to our database operations
const {
    dbclient,
    initDatabaseConnection,
    closeDatabaseConnection,
    insertCurrencyRecord,
    getCurrenciesToTrack,
    getCurrencyValues,
    getAllCurrencyCurrentValues
} = require("./db_queries");

// Synchronizes doviz.com data
const synchronizeExchangeData = async () => {
    // Get all the currencies from OUR database, it specifies which currencies to track on doviz.com
    const currencies = await getCurrenciesToTrack();

    // Query and process each currency data from doviz.com
    for(let cIdx=0; cIdx <= currencies.length-1; cIdx++){
        let currency = currencies[cIdx];

        let response = getCurrencyDataDaily(currency);
        if(response.error === true){
            console.error("[!] Doviz.com auth error, refreshing auth..");
            updateDovizComAuth();
            return false;
        }else{
            // Process the each record of the currency query
            response.data.forEach(
                (record) => insertCurrencyRecord(record, currency)
            );
            console.log(`[*] Entering ${response.data.length} records to the db for the currency ${currency.code}...`);
        }
    }

    console.error("[*] synchronizeExchangeData function run done.");
    return true;
};

// Build the web serving application and serve it
const app = express();

app.use(cors());

// API endpoints of our backend-side server application
app.get('/getAllCurrencyCurrentValues', async (req, res) => {
    res.send(await getAllCurrencyCurrentValues());
})
app.get('/getCurrencyValues', async (req, res) => {
    res.send(await getCurrencyValues());
})
app.get('/getCurrenciesToTrack', async (req, res) => {
    res.send(await getCurrenciesToTrack());
})
app.get('/synchronizeExchangeData', async (req, res) => {
    res.send(await synchronizeExchangeData());
})

app.listen(
    process.env.PORT,
    async () => {
        console.log(`Express app is running on port ${process.env.PORT}!`);
        await initDatabaseConnection();
        if(!checkDovizComAuth()){
            console.error("[!] Doviz.com auth failed, refreshing auth..");
            await updateDovizComAuth();
        }
    }
);
