const { MongoClient } = require('mongodb')
const fs = require('node:fs')

// This script sets charging stations public or private
// Filter charging stations by id pattern

// Use case: simulate charging station for roaming tests
// charging stations are private by default
// set public = true

// Config
const config = JSON.parse(fs.readFileSync('scriptConfig.json', 'utf8'))

// Mongo Connection and Query
if (config?.mongoConnectionString) {
  MongoClient.connect(config.mongoConnectionString, async (_err, client) => {
    const db = client.db()

    for await (const tenantID of config.tenantIDs) {
      const response = await db
        .collection(`${tenantID}.chargingstations`)
        .updateMany({ _id: { $regex: config.idPattern } }, { $set: { public: config.publicFlag } })
      console.info(
        response.modifiedCount,
        `Charging Stations with id = %${config.idPattern}% updated. TenantID =`,
        tenantID
      )
    }
    client.close()
  })
}
