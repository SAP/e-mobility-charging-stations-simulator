#!/usr/bin/env node

const MongoClient = require('mongodb');
const fs = require('fs');

// This script deletes charging stations
// Filter charging stations by id pattern

// Use Case: ev-simulator creates thousands of charging stations, which are not longer needed.
// Delete these charging stations all at once

// Config
const config = JSON.parse(fs.readFileSync('scriptConfig.json', 'utf8'));

// Mongo Connection and Query
if (config && config.mongoConnectionString) {
  MongoClient.connect(config.mongoConnectionString, async function(err, client) {
    const db = client.db();

    for await (const tenantID of config.tenantIDs) {
      const response = await db.collection(tenantID + '.chargingstations').deleteMany(
        { _id: { '$regex': config.idPattern } }
      );
      console.log(response.deletedCount, `Charging Stations with id = %${config.idPattern}% deleted. TenantID =`, tenantID);
    }
    client.close();
  });
}
