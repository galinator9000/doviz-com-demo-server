// Load .env
require('dotenv').config();

// Import express.js
const express = require('express');
const cors = require('cors');

// Import websocket
const { WebSocketServer } = require('ws');

// Import cron for periodically syncing with doviz.com
const cron = require('node-cron');

/// Import local functions
// Doviz.com queries
const { getCurrencyDataDaily, getCurrencyDataLive, checkDovizComAuth, updateDovizComAuth } = require("./dovizcom_queries");
// Methods and objects related to our database operations
const {
    dbclient,
    initDatabaseConnection,
    closeDatabaseConnection,
    insertCurrencyRecords,
    getCurrenciesToTrack,
    getCurrencyValues,
    getAllCurrencyCurrentValues,
    checkUserCurrencyAlerts,
    getUserCurrencyAlerts,
    setUserCurrencyAlert,
    removeUserCurrencyAlert
} = require("./db_queries");

// Synchronizes doviz.com data
const synchronizeExchangeData = async (pullDovizComDataFn) => {
    // Get all the currencies from OUR database, it specifies which currencies to track on doviz.com
    const currencies = await getCurrenciesToTrack();

    // Query and process each currency data from doviz.com
    for(let cIdx=0; cIdx <= currencies.length-1; cIdx++){
        let currency = currencies[cIdx];

        let response = pullDovizComDataFn(currency);
        if(response.error === true){
            console.error("[!] Doviz.com auth error, refreshing auth..");

            // Re-run the sync function after renewing the auth token
            updateDovizComAuth().then((isAuthSuccessful) => {
                if(isAuthSuccessful){
                    synchronizeExchangeData(pullDovizComDataFn);
                }
            });
            return false;
        }else{
            let dovizComSourceData = response.data;
            dovizComSourceData = dovizComSourceData.filter((record) => {
                let now_timestamp = new Date().getTime() / 1000;
                let xhrsago_timestamp = (now_timestamp - (3600 * parseInt(process.env.DOVIZCOM_PULL_MAX_X_HOURS_OF_HISTORY)));
                
                if(record.update_date >= xhrsago_timestamp){
                    return true;
                }
                return false;
            });

            // Process the each record of the currency query
            console.log(`[*] Pulled number of ${dovizComSourceData.length} records from doviz.com for the currency ${currency.code}...`);
            await insertCurrencyRecords(dovizComSourceData, currency);
        }
    }

    console.log("[*] synchronizeExchangeData function run done.");
    return true;
};

// Build the web serving application and serve it
const app = express();

// Setup the alert system through websocket
const wss = new WebSocketServer({port: process.env.WS_PORT});

// Set the websocket connection functions.
wss.on('connection', (ws) => {
    // Trigger the user alert checking functionality here
    const triggerCheckingUserCurrencyAlerts = async () => {
        let triggeredAlerts = await checkUserCurrencyAlerts();
        if(triggeredAlerts.length > 0){
            ws.send(JSON.stringify(triggeredAlerts));
        }
    };

    // Set an interval for running triggerCheckingUserCurrencyAlerts periodically
    console.log("[*] WebSocket connected");
    let interval_triggerCheckingUserCurrencyAlerts = setInterval(
        triggerCheckingUserCurrencyAlerts,
        (parseInt(process.env.DOVIZCOM_PULL_LIVE_DATA_EVERY_XMINUTES) * 30 * 1000)
    );
    
    ws.on('close', () => {
        clearInterval(interval_triggerCheckingUserCurrencyAlerts);
        interval_triggerCheckingUserCurrencyAlerts = null;
        console.log("[*] Terminating the WebSocket connection");
    });
});

app.use(express.json());

// Add the extra middlewares.
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
    res.send(await synchronizeExchangeData(getCurrencyDataDaily));
})
app.get('/getUserCurrencyAlerts', async (req, res) => {
    res.send(await getUserCurrencyAlerts());
})
app.post('/setUserCurrencyAlert', async (req, res) => {
    res.send(await setUserCurrencyAlert(req.body));
})
app.post('/removeUserCurrencyAlert', async (req, res) => {
    res.send(await removeUserCurrencyAlert(req.body));
})

app.listen(
    process.env.PORT,
    async () => {
        console.log(`[*] Express app is running on port ${process.env.PORT}!`);
        await initDatabaseConnection();

        console.log("[*] Checking doviz.com auth...");
        while(!checkDovizComAuth()){
            console.error("[!] Doviz.com auth failed, refreshing auth...");
            await updateDovizComAuth();
        };

        console.log("[+] Doviz.com auth valid!");
        await synchronizeExchangeData(getCurrencyDataDaily);

        // Set cron schedules.
        cron.schedule(
            `*/${
                process.env.DOVIZCOM_PULL_LIVE_DATA_EVERY_XMINUTES
                ? process.env.DOVIZCOM_PULL_LIVE_DATA_EVERY_XMINUTES
                : '1'
            } * * * *`,
            () => synchronizeExchangeData(getCurrencyDataLive)
        );
    }
);
