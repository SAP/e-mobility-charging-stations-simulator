# Maintenance scripts

## Driivz charger deletion

`deleteChargingStations.cjs` removes configured chargers through the Driivz REST lifecycle. It
does not delete simulator records directly from MongoDB.

1. Copy `scriptConfig-template.json` to the ignored `scriptConfig.json` file and configure
   `driivzDeletion`.
2. Run `node deleteChargingStations.cjs` from this directory.
3. Run the command again to resume chargers left pending by decommissioning, an API error, or a
   timeout.

The first successful run performs the profile, transaction, and reservation preflight and requests
decommissioning. It then exits with the charger pending. A later run polls until the profile reports
`DECOMMISSIONED` before patching configured connector EVSE data and deleting the charger.

Progress is written atomically to `deleteChargingStations.state.json` by default. Keep this file
between runs. Completed phases are not repeated, and an uncertain decommission request is reconciled
before retrying with its original timestamp.

Site and Property cleanup starts only after a profile read-back confirms that the charger is absent.
A Site is deleted only when its `chargerIds` array is empty. A Property is deleted only when its
`siteIds` array is empty and the read-back explicitly marks it as non-shared. Missing or ambiguous
sharing data preserves the Property.

The command exits with code `0` when every configured charger is complete, `2` when work remains
pending, and `1` for invalid configuration or an unrecoverable startup error. Per-charger API errors
are persisted as pending work for the next run.
