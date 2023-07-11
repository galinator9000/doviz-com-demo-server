require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const MONGODB_URI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_ADDRESS}/`;

const client = new MongoClient(
    MONGODB_URI, 
    {
        serverApi: {
            version: ServerApiVersion.v1
        }
    }
);

async function listDatabases(client){
    databasesList = await client.db().admin().listDatabases();
 
    console.log("Databases:");
    databasesList.databases.forEach(db => console.log(` - ${db.name}`));
};

(async () => {
    try {
        await client.connect();
        await client.db("doviz-app").command({ ping: 1 });
        await listDatabases(client);
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        await client.close();
    }
})();
