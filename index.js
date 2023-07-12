// Load .env
require('dotenv').config();

// Import local functions
const { getCurrencyDataWeekly, getCurrencyDataDaily } = require("./dovizcom-queries");

// Import mongodb package
const { MongoClient, ServerApiVersion } = require('mongodb');

// Build the URI that is required to connect to the mongodb cluster
const MONGODB_URI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_ADDRESS}/`;
const MONGODB_DB_NAME = "doviz-app";

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

    // Process each currency data
    currencies.forEach(async (currency) => {
        let cur_values = await getCurrencyDataDaily(currency);
        console.log(cur_values);
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