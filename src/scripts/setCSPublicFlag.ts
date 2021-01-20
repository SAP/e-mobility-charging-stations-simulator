var MongoClient = require('mongodb');
var fs = require('fs');

// This script sets charging stations public or private
// Filter charging stations by id pattern

// Use case: simulate charging station for roaming tests
// charging stations are private by default
// set public = true

// Config
var config = JSON.parse(fs.readFileSync('scriptConfig.json', 'utf8'));

// Mongo Connection and Query
if (config && config.mongoConnectionString) {
  MongoClient.connect(config.mongoConnectionString, {
    useUnifiedTopology: true,
    useNewUrlParser: true
    }, async function(err, client) {
    const db = client.db('evse');

    for await (const tenantID of config.tenantIDs) {
      let response = await db.collection(tenantID + '.chargingstations').updateMany(
        { _id: {'$regex': config.idPattern} },
        { $set: { public : config.publicFlag } }
      );
      console.log(response.modifiedCount, `Charging Stations with id = %${config.idPattern}% updated. TenantID =`, tenantID);
    }
    client.close();
  });
}
