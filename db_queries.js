// Load .env
require('dotenv').config();

// Constants
const { MONGODB_URI, MONGODB_DB_NAME } = require("./consts");

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

const insertCurrencyRecord = async (record, currency) => {
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

    // Reconnect with the db
    await dbclient.connect();

    // Get the collection
    const coll_currencyValues = dbclient.db(MONGODB_DB_NAME).collection("CurrencyValues");

    // Check if the record already exists or not
    if((await coll_currencyValues.countDocuments({"_id": db_id})) > 0){
        console.log("[*] Record already exists:", JSON.stringify(new_db_record));
    }else{
        // Insert the new record
        const result = await coll_currencyValues.insertOne(new_db_record);
        console.log("[*] Entered new record:", JSON.stringify(new_db_record));
    }
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
    let allCurrencyValues = await (coll_currencyValues.find({}).sort({timestamp: -1}).toArray());

    const coll_currenciesToTrack = dbclient.db(MONGODB_DB_NAME).collection("CurrenciesToTrack");
    let currencies = await (coll_currenciesToTrack.find({}).toArray());
    currencies = currencies.map(currency => {
        const currentCurrencyValues = allCurrencyValues.filter((record) => (currency.code === record.currency));
        // Return null if no value exist for the currency
        if(currentCurrencyValues.length === 0){
            return {
                ...currency,
                values: [],
                value: null,
                timestamp: null
            }
        }
        return {
            ...currency,
            values: currentCurrencyValues,
            value: currentCurrencyValues[0].value,
            timestamp: currentCurrencyValues[0].timestamp,
        };
    });

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
    let allCurrencyValues = await (coll_currencyValues.find({}).sort({timestamp: -1}).toArray());

    // Check the alert criteria from the other collection
    let allAlerts = allUserCurrencyAlerts.map((alert) => {
        // Get the currency records
        const currentCurrencyValues = allCurrencyValues.filter((record) => (alert.currencyCode === record.currency));
        let upToDateValueOfCurrency = currentCurrencyValues[0].value;
        let upToDateAvgValueOfCurrency = upToDateValueOfCurrency * 0.002
        let upToDateAvgHours = 5;

        // Determine if the alert is gonna be triggered
        alert.messages = [];
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

        console.log(newAlertData);

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

module.exports = {
    dbclient,
    initDatabaseConnection,
    closeDatabaseConnection,
    insertCurrencyRecord,
    getCurrencyValues,
    getCurrenciesToTrack,
    getAllCurrencyCurrentValues,
    checkUserCurrencyAlerts,
    getUserCurrencyAlerts,
    setUserCurrencyAlert
}