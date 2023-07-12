// Load .env
require('dotenv').config();

const fetch = require('node-fetch');

const DOVIZ_COM_HEADERS = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "Authorization": `Basic ${process.env.DOVIZCOM_AUTH}`,
    "X-Requested-With": "XMLHttpRequest"
};

// Gets the specified currency's data weekly
let getCurrencyDataWeekly = async (currency) => {
    const start = "1688504400";
    const end = "1689131833";

    // Build the weekly query url
    let query_url = (
        `https://www.doviz.com/api/v11/assets/${currency.code}/archive?` + new URLSearchParams({"start": start, "end": end})
    );

    // Get the response and return it
    let response = await fetch(query_url, {headers: DOVIZ_COM_HEADERS})
    return await response.json();
};

// Gets the specified currency's data daily
let getCurrencyDataDaily = async (currency) => {
    const limit = "60";

    // Build the daily query url
    let query_url = (
        `https://www.doviz.com/api/v11/assets/${currency.code}/daily?` + new URLSearchParams({"limit": limit})
    );

    // Get the response and return it
    let response = await fetch(query_url, {headers: DOVIZ_COM_HEADERS})
    return await response.json();
};

module.exports = {
    getCurrencyDataWeekly,
    getCurrencyDataDaily
}