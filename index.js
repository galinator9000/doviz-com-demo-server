// Load .env
require('dotenv').config();

// Import express.js
const express = require('express');
const cors = require('cors');

// Import websocket for exprewss
var expressWs = require('express-ws');

// Import cron for periodically syncing with doviz.com
const cron = require('node-cron');

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
    getAllCurrencyCurrentValues,
    checkUserCurrencyAlerts
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

// Add the extra middlewares.
expressWs(app);
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

// Setup the alert system through websocket
app.ws(
    "/",
    (ws, req) => {
        ws.on(
            "message",
            (msg) => {
                if(msg === "CHECK_USER_TRIGGERS"){
                    checkUserCurrencyAlerts().then(triggeredAlerts => {
                        ws.send(triggeredAlerts);
                    })
                }
            }
        );
    }
);

app.listen(
    process.env.PORT,
    async () => {
        console.log(`[*] Express app is running on port ${process.env.PORT}!`);
        await initDatabaseConnection();

        console.log("[*] Checking doviz.com auth...");
        if(!checkDovizComAuth()){
            console.error("[!] Doviz.com auth failed, refreshing auth...");
            await updateDovizComAuth();
        }else{
            console.log("[+] Doviz.com auth valid!");
        }
    }
);

// Set cron schedules.
cron.schedule(
    "*/15 * * * *",
    synchronizeExchangeData
);
