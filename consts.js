// Load .env
require('dotenv').config();

// Build the URI that is required to connect to the mongodb cluster
const MONGODB_URI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_ADDRESS}/`;
const MONGODB_DB_NAME = "doviz-app";

module.exports = {
    MONGODB_URI,
    MONGODB_DB_NAME
}