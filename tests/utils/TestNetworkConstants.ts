/**
 * @file Shared network-related test constants derived from production defaults.
 * @description Single source of truth for `ws://host:port` test URLs, built from
 *   `Constants.DEFAULT_UI_SERVER_HOST` / `Constants.DEFAULT_UI_SERVER_PORT` so a
 *   change to the production defaults propagates automatically to the tests.
 */
import { Constants } from '../../src/utils/index.js'

export const TEST_SUPERVISION_URL = `ws://${Constants.DEFAULT_UI_SERVER_HOST}:${Constants.DEFAULT_UI_SERVER_PORT.toString()}`
