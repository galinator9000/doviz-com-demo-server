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
const { getCurrencyDataDaily, getCurrencyDataLive, checkDovizComAuth, updateDovizComAuth } = require("./dovizcom_queries");
// Methods and objects related to our database operations
const {
    dbclient,
    initDatabaseConnection,
    closeDatabaseConnection,
    insertCurrencyRecord,
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
            dovizComSourceData.forEach(
                (record) => insertCurrencyRecord(record, currency)
            );
            console.log(`[*] Entering ${dovizComSourceData.length} records to the db for the currency ${currency.code}...`);
        }
    }

    console.error("[*] synchronizeExchangeData function run done.");
    return true;
};

// Build the web serving application and serve it
const app = express();

app.use(express.json());

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

// Setup the alert system through websocket
app.ws(
    "/",
    (ws, req) => {
        ws.on(
            "message",
            (msg) => {
                if(msg === "CHECK_USER_TRIGGERS"){
                    checkUserCurrencyAlerts().then((triggeredAlerts) => {
                        ws.send(JSON.stringify(triggeredAlerts));
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
        while(!checkDovizComAuth()){
            console.error("[!] Doviz.com auth failed, refreshing auth...");
            await updateDovizComAuth();
        };

        console.log("[+] Doviz.com auth valid!");
        await synchronizeExchangeData(getCurrencyDataDaily);

        // Set cron schedules.
        cron.schedule(
            "*/3 * * * *",
            () => synchronizeExchangeData(getCurrencyDataLive)
        );
    }
);
