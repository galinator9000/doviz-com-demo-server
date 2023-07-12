// Load .env
require('dotenv').config();

// Constants
const { MONGODB_URI, MONGODB_DB_NAME } = require("./consts");

const insertCurrencyRecord = async (dbclient, record, currency) => {
    const new_db_record = {
        "timestamp": new Date(record.update_date * 1000),
        "currency": currency.code,
        "value": record.close
    };

    // Reconnect with the db
    await dbclient.connect();

    // Get the collection
    const coll_currencyValues = dbclient.db(MONGODB_DB_NAME).collection("CurrencyValues");

    // Insert a new record
    const result = await coll_currencyValues.insertOne(new_db_record);

    console.log("[*] Inserted new record:", JSON.stringify(new_db_record));
};

module.exports = {
    insertCurrencyRecord
}