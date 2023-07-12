// Load .env
require('dotenv').config();

/// Import local functions
// Doviz.com queries
const { getCurrencyDataDaily } = require("./dovizcom-queries");
// Methods related to our database operations
const { insertCurrencyRecord } = require("./db_queries");
// Constants
const { MONGODB_URI, MONGODB_DB_NAME } = require("./consts");

// Import mongodb package
const { MongoClient, ServerApiVersion } = require('mongodb');

// Variable that will hold the mongodb client object
const dbclient = new MongoClient(
    MONGODB_URI, 
    {
        serverApi: {
            version: ServerApiVersion.v1
        }
    }
);

// Connects and tests the db connection
let initDatabaseConnection = async () => {
    try{
        await dbclient.connect();
        await dbclient.db(MONGODB_DB_NAME).command({ ping: 1 });
        console.log("[*] Database connection successful.");
    }catch(e){
        await dbclient.close();
        console.error(e);
    }
};

// Terminates the db connection
let closeDatabaseConnection = async () => {
    try{
        await dbclient.close();
    }catch(e){
        console.error(e);
    }
};

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
                        (record) => insertCurrencyRecord(dbclient, record, currency)
                    );
                    console.log(`[*] Inserting ${response.data.length} new records for the currency ${currency.code}...`);
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