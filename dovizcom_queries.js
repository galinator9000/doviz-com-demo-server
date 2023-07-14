// Load .env
require('dotenv').config();
const moment = require('moment');
const fetch = require('sync-fetch');
const puppeteer = require('puppeteer-extra')
const {executablePath} = require('puppeteer')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

puppeteer.use(StealthPlugin());

let DOVIZ_COM_HEADERS = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "Authorization": `Basic ${process.env.DOVIZCOM_INIT_AUTH}`,
    "X-Requested-With": "XMLHttpRequest"
};

// Checks the doviz.com authorization token by making a little request
let checkDovizComAuth = () => {
    let test_query_url = `https://www.doviz.com/api/v11/assets/USD/daily?limit=60`;

    // Get the response and return it
    let testResponseJ = fetch(test_query_url, {headers: DOVIZ_COM_HEADERS}).json();
    return testResponseJ.error !== true;
};

// Updates the doviz.com authorization token by visiting the website
let updateDovizComAuth = async () => {
    // Launch puppeteer
    console.log("[*] Launching browser...");
    let ppBrowser = await puppeteer.launch({
        args: ["--no-sandbox"],
        executablePath: executablePath(),
        headless: "new"
    });
    let ppPage = (await ppBrowser.pages())[0];
    await ppPage.setRequestInterception(true);

    // Check if message sending process is executed
    let REQUEST_IS_MADE = false;
    let NEW_AUTH_TOKEN = null;
    ppPage.on(
        "request",
        async (interceptedRequest) => {
            // Check if API request has been made and received "OK" code
            if((await interceptedRequest.url().includes("doviz.com/api/v11/assets/EUR/daily"))){
                // Grab the Auth token from header
                if(interceptedRequest.headers() && interceptedRequest.headers().authorization){
                    REQUEST_IS_MADE = true;
                    NEW_AUTH_TOKEN = interceptedRequest.headers().authorization;
                }
            }

            // Let the request continue
            if (interceptedRequest.isInterceptResolutionHandled()) return;
            interceptedRequest.continue();
        }
    );

    // Go to the euro page, for capturing the auth token
    console.log("[*] Opening the page...");
    await ppPage.goto("https://kur.doviz.com/serbest-piyasa/euro");

    // Wait until request is processed
    while(true){
        if(REQUEST_IS_MADE) break;
        await ppPage.waitForTimeout(50);
    }

    if(NEW_AUTH_TOKEN != null){
        console.log(`[+] Successsfully grabbed the new auth token: ${NEW_AUTH_TOKEN}`);
        await ppPage.close();
        await ppBrowser.close();
        DOVIZ_COM_HEADERS.Authorization = NEW_AUTH_TOKEN;
        return true;
    }else{
        console.log("[x] Updating doviz.com auth token failed!");
        await ppPage.close();
        await ppBrowser.close();
        return false;
    }
};

// Gets the specified currency's data weekly
let getCurrencyDataWeekly = (currency) => {
    const end = moment().unix();
    const start = (end - (7*24*3600));

    // Build the weekly query url
    let query_url = (
        `https://www.doviz.com/api/v11/assets/${currency.code}/archive?` + new URLSearchParams({"start": start, "end": end})
    );

    // Get the response and return it
    let response = fetch(query_url, {headers: DOVIZ_COM_HEADERS});
    return response.json();
};

// Gets the specified currency's data daily
let getCurrencyDataDaily = (currency) => {
    // Build the query url
    let query_url = `https://www.doviz.com/api/v11/assets/${currency.code}/daily`;

    // Get the response and return it
    let response = fetch(query_url, {headers: DOVIZ_COM_HEADERS});
    return response.json();
};

// Gets the specified currency's data daily
let getCurrencyDataLastXHours = (currency, lastXHours) => {
    const end = moment().unix();
    const start = (end - (lastXHours*3600));

    // Build the weekly query url
    let query_url = (
        `https://www.doviz.com/api/v11/assets/${currency.code}/archive?` + new URLSearchParams({"start": start, "end": end})
    );
    // Get the response and return it
    let response = fetch(query_url, {headers: DOVIZ_COM_HEADERS});
    return response.json();
};

// Gets the specified currency's live records
let getCurrencyDataLive = (currency) => {
    const limit = process.env.DOVIZCOM_PULL_LIVE_RECENT_DATA_COUNT;

    // Build the query url
    let query_url = (
        `https://www.doviz.com/api/v11/assets/${currency.code}/daily?` + new URLSearchParams({"limit": limit})
    );

    // Get the response and return it
    let response = fetch(query_url, {headers: DOVIZ_COM_HEADERS});
    return response.json();
};

module.exports = {
    checkDovizComAuth,
    updateDovizComAuth,
    getCurrencyDataWeekly,
    getCurrencyDataDaily,
    getCurrencyDataLive
}