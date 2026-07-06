/**
 * @file Shared network-related test constants derived from production defaults.
 * @description Single source of truth for the `ws://host:port` test URLs,
 *   built from `Constants.DEFAULT_UI_SERVER_HOST` /
 *   `Constants.DEFAULT_UI_SERVER_PORT` so a change to the production defaults
 *   propagates automatically to the tests. Two variants are exposed: the
 *   primary URL at the default port, and an alternate at the next port for
 *   tests that need two distinct URL fixtures (e.g. `supervisionUrls` arrays).
 */
import { Constants } from '../../src/utils/index.js'

const HOST = Constants.DEFAULT_UI_SERVER_HOST
const PORT = Constants.DEFAULT_UI_SERVER_PORT

export const TEST_SUPERVISION_URL = `ws://${HOST}:${PORT.toString()}`
export const TEST_SUPERVISION_URL_ALT_PORT = `ws://${HOST}:${(PORT + 1).toString()}`
