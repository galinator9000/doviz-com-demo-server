// Load .env
require('dotenv').config();

// Constants
const { MONGODB_URI, MONGODB_DB_NAME } = require("./consts");
const { sumArray } = require("./utils");

var md5 = require('md5');

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

const insertCurrencyRecords = async (newRecords, currency) => {
    // Reconnect with the db
    await dbclient.connect();

    // Get the collection
    const coll_currencyValues = dbclient.db(MONGODB_DB_NAME).collection("CurrencyValues");
    const existingDbRecords = await coll_currencyValues.find({currency: currency.code}).toArray();
    const existingDbRecordIDs = existingDbRecords.map(db_record => db_record._id);

    // Add the db_id and data object that is going to be sent to the insertOne function, to the given each "newRecords" object
    newRecords = newRecords.map((record) => {
        const db_id = md5(JSON.stringify({
            "timestamp": record.update_date,
            "currency": currency.code,
            "value": record.close
        }));
        const new_db_record = {
            "_id": db_id,
            "timestamp": new Date(record.update_date * 1000),
            "currency": currency.code,
            "value": record.close
        };

        return {
            ...record,
            new_db_record: new_db_record
        };
    });

    // Check if the id's for matching the records, find the existing and missing records.
    const checkIfExistsOnDb = (record) => {
        return existingDbRecordIDs.includes(record.new_db_record._id);
    };
    let final_existingRecords = newRecords.filter(checkIfExistsOnDb);
    let final_newRecords = newRecords.filter((record) => !checkIfExistsOnDb(record));
    console.log(`[*] Number of ${final_existingRecords.length} already exists for the currency ${currency.code}; adding ${final_newRecords.length} records!`);

    // Insert the new records to the database
    final_newRecords = final_newRecords.map(record => record.new_db_record);
    return await coll_currencyValues.insertMany(final_newRecords);
};

// Gets the given currency's current values held in DB
const getCurrencyValues = async (currencyCode) => {
    // Reconnect with the db
    await dbclient.connect();

    // Get the collection
    const coll_currencyValues = dbclient.db(MONGODB_DB_NAME).collection("CurrencyValues");
    const result = await coll_currencyValues.find(
        (
            currencyCode
            ? {"currency": currencyCode}
            : {}
        )
    ).toArray();
    return result;
};

// Gets the given currency's current values held in DB
const getCurrenciesToTrack = async (currencyCode) => {
    // Reconnect with the db
    await dbclient.connect();

    // Get the collection
    const coll_currenciesToTrack = dbclient.db(MONGODB_DB_NAME).collection("CurrenciesToTrack");
    const result = await coll_currenciesToTrack.find({}).toArray();
    return result;
};

// Gets the given currency's current values held in DB, dashboard format
const getAllCurrencyCurrentValues = async () => {
    // Reconnect with the db
    await dbclient.connect();

    // Get the collections
    const coll_currencyValues = dbclient.db(MONGODB_DB_NAME).collection("CurrencyValues");

    const coll_currenciesToTrack = dbclient.db(MONGODB_DB_NAME).collection("CurrenciesToTrack");
    let currencies = await (coll_currenciesToTrack.find({}).toArray());
    currencies = await Promise.all(currencies.map(async (currency) => {
        const currentCurrencyValues = await (coll_currencyValues.find(
            {
                currency: currency.code
            },
            {
                sort: {timestamp: -1},
                limit: 1
            }
        ).toArray());

        // Return null if no value exist for the currency
        if(currentCurrencyValues.length === 0){
            return {
                ...currency,
                value: null,
                timestamp: null
            }
        }
        return {
            ...currency,
            value: currentCurrencyValues[0].value,
            timestamp: currentCurrencyValues[0].timestamp,
        };
    }));

    return currencies;
};

// Check the user currency alerts, if they do match the criteria, return true.
const checkUserCurrencyAlerts = async () => {
    console.log("[*] Checking currency alert triggers...");
    
    // Reconnect with the db
    await dbclient.connect();

    // Get the collections
    const coll_userCurrencyAlerts = dbclient.db(MONGODB_DB_NAME).collection("UserCurrencyAlerts");
    let allUserCurrencyAlerts = await (coll_userCurrencyAlerts.find({}).toArray());

    const coll_currencyValues = dbclient.db(MONGODB_DB_NAME).collection("CurrencyValues");
    let now_timestamp = new Date();
    let hrsago_timestamp = new Date(now_timestamp.getTime() - (3600 * parseInt(process.env.CALCULATE_LAST_AVERAGE_HOURS) * 1000));

    let allCurrencyValues = await (coll_currencyValues.find({
        timestamp: {
            $gte: hrsago_timestamp,
            $lt: now_timestamp
        }
    }).sort({timestamp: -1}).toArray());

    // Check the alert criteria from the other collection
    let allAlerts = allUserCurrencyAlerts.map((alert) => {
        alert.messages = [];
        alert.isTriggered = false;

        // Skip the alert if it's already sent to the user
        if(alert.isSentToUser) return alert;

        // Get the currency records
        const currentCurrencyValues = allCurrencyValues.filter((record) => (alert.currencyCode === record.currency));

        if(currentCurrencyValues.length === 0) return alert;

        let upToDateValueOfCurrency = currentCurrencyValues[0].value;
        let leastUpToDateTimestamp = new Date(currentCurrencyValues[currentCurrencyValues.length-1].timestamp).getTime();

        // Calculate the average value of current currency's records
        let sumOfLastRecords = sumArray(currentCurrencyValues.map(x => x.value));
        let upToDateAvgValueOfCurrency = (sumOfLastRecords / currentCurrencyValues.length)
        let upToDateAvgHours = ((now_timestamp.getTime() - leastUpToDateTimestamp) / (3600 * 1000)).toFixed(2);
        
        // Determine if the alert is gonna be triggered
        if(alert.alertType === "exceed"){
            if(upToDateValueOfCurrency > (alert.alertValue)){
                alert.isTriggered = true;
                alert.messages.push(
                    `${alert.currencyCode} dövizi, belirlediğiniz ${alert.alertValue.toFixed(2)} sınırını ${upToDateValueOfCurrency.toFixed(2)} olarak geçti!`
                );
            }
            if(upToDateValueOfCurrency > (alert.alertValue * 1.10)){
                alert.isTriggered = true;
                alert.messages.push(
                    `${alert.currencyCode} dövizi, belirlediğiniz ${alert.alertValue.toFixed(2)} limitini %${
                        (((upToDateValueOfCurrency/alert.alertValue)-1)*100).toFixed(2)
                    } geçerek ${upToDateValueOfCurrency.toFixed(2)} oldu!`
                );
            }
            if(upToDateValueOfCurrency > (upToDateAvgValueOfCurrency * 1.10)){
                alert.isTriggered = true;
                alert.messages.push(
                    `${alert.currencyCode} dövizi, son ${upToDateAvgHours} saat ortalaması olan ${upToDateAvgValueOfCurrency.toFixed(2)} değerinin %${
                        (((upToDateValueOfCurrency/upToDateAvgValueOfCurrency)-1)*100).toFixed(2)
                    } üstünde!`
                );
            }
        }

        // Update the alert's database record as "sent to user"
        if(process.env.SEND_USER_TRIGGERS_ONLY_ONCE === "true" && alert.isTriggered){
            coll_userCurrencyAlerts.updateOne(
                {"_id": alert._id},
                {$set: {
                    isSentToUser: true
                }},
                {upsert: false}
            );
        }

        return alert;
    });

    // Filter the non-null values
    let triggeredAlerts = allAlerts.filter(x => x.isTriggered);
    if(triggeredAlerts.length > 0){
        console.log("[*] Triggered alerts:");
        console.log(triggeredAlerts);
    }else{
        console.log("[*] No alerts triggered.");
    }
    return triggeredAlerts;
}

const getUserCurrencyAlerts = async () => {
    // Reconnect with the db
    await dbclient.connect();

    // Get the collections
    const coll_userCurrencyAlerts = dbclient.db(MONGODB_DB_NAME).collection("UserCurrencyAlerts");
    let allUserCurrencyAlerts = await (coll_userCurrencyAlerts.find({}).toArray());

    return allUserCurrencyAlerts
};

const setUserCurrencyAlert = async (newAlertData) => {
    try{
        // Reconnect with the db
        await dbclient.connect();

        // Get the collections
        const coll_userCurrencyAlerts = dbclient.db(MONGODB_DB_NAME).collection("UserCurrencyAlerts");

        // "Upsert" the new records
        await coll_userCurrencyAlerts.updateOne(
            {
                "currencyCode": newAlertData.currencyCode,
                "alertType": newAlertData.alertType
            },
            {$set: newAlertData},
            {upsert: true}
        );

        return true;
    }catch(e){
        return false;
    }
};

const removeUserCurrencyAlert = async (removeAlertData) => {
    try{
        // Reconnect with the db
        await dbclient.connect();

        // Get the collections
        const coll_userCurrencyAlerts = dbclient.db(MONGODB_DB_NAME).collection("UserCurrencyAlerts");

        // Remove the specified records
        await coll_userCurrencyAlerts.deleteMany(
            {
                "currencyCode": removeAlertData.currencyCode,
                "alertType": removeAlertData.alertType
            }
        );

        return true;
    }catch(e){
        return false;
    }
};

module.exports = {
    dbclient,
    initDatabaseConnection,
    closeDatabaseConnection,
    insertCurrencyRecords,
    getCurrencyValues,
    getCurrenciesToTrack,
    getAllCurrencyCurrentValues,
    checkUserCurrencyAlerts,
    getUserCurrencyAlerts,
    setUserCurrencyAlert,
    removeUserCurrencyAlert
}