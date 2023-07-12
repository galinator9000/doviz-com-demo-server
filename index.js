// Load .env
require('dotenv').config();

/// Import local functions

// Doviz.com queries
const { getCurrencyDataDaily } = require("./dovizcom-queries");

// Methods and objects related to our database operations
const {
    dbclient,
    initDatabaseConnection,
    closeDatabaseConnection,
    insertCurrencyRecord
} = require("./db_queries");

// Constants
const { MONGODB_DB_NAME } = require("./consts");

// Synchronizes doviz.com data
let synchronizeDovizComData = async () => {
    // Get all the currencies from OUR database, it specifies which currencies to track on doviz.com
    const coll_currenciesToTrack = dbclient.db(MONGODB_DB_NAME).collection("CurrenciesToTrack");
    const currencies = await coll_currenciesToTrack.find({}).toArray();

    // Query and process each currency data from doviz.com
    await currencies.forEach(currency => {
        getCurrencyDataDaily(currency).then(
            async (response) => {
                if(response.error === true){
                    console.error("[!] Doviz.com auth error.");
                }else{
                    // Process the each record of the currency query
                    response.data.forEach(
                        (record) => insertCurrencyRecord(record, currency)
                    );
                    console.log(`[*] Entering ${response.data.length} records to the db for the currency ${currency.code}...`);
                }
            }
        )
    });
};

// Main entrypoint of the script
const main = async () => {
    // Construct the MongoDB client object
    await initDatabaseConnection();

    // Synchronize data doviz.com data
    await synchronizeDovizComData();

    // Close the database connection
    await closeDatabaseConnection();
}

main().catch(console.log);