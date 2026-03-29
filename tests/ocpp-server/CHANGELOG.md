# Changelog

## [4.0.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v4.0.0...ocpp-server@v4.0.1) (2026-03-29)

### 🧹 Chores

- **ocpp-server:** Synchronize simulator-ui-ocpp-server versions

## [4.0.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v3.4.0...ocpp-server@v4.0.0) (2026-03-28)

### 🐞 Bug Fixes

- **deps:** update all non-major dependencies ([#1759](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1759)) ([5a31d2b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/5a31d2b232a9d002b741c1f61ee8afe72e9bd363))

## [3.4.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v3.3.0...ocpp-server@v3.4.0) (2026-03-26)

### 🚀 Features

- **ocpp-server:** add graceful shutdown with signal handling ([b542c81](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/b542c817e5f0aeb6be041ce81b3ee46ca3fe0dc4))
- **ocpp-server:** enhance OCPP 2.0.1 mock server for comprehensive E2E testing ([#1752](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1752)) ([aee410a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/aee410a1a6f7819b33ae4ff4f2ed27ceb548202e))

### 🐞 Bug Fixes

- add OCPP 2.0 DataTransfer outgoing support and B03 boot retry in Rejected state ([044bd64](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/044bd64305aee79aecbcc8a41ab892717680ea97))
- prevent shutdown timeout with promiseWithTimeout helper ([32384c4](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/32384c4cce3aa958c5d2e4f771e4ef15812f55d1))

### ✨ Polish

- **ocpp-server:** audit-driven test improvements ([08325b0](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/08325b09d13f38caf769bf20ef255f01cf9d687a))
- **ocpp-server:** harmonize shutdown tests with project conventions ([f3b4d70](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/f3b4d70f110134f0b32cccfc439e0876fceae38d))

### 🧪 Tests

- **ocpp-server:** add graceful shutdown tests covering signal handling ([619a3c7](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/619a3c7e020d5dc737b7b487f4708b8c29fdc511))

## [3.3.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v3.2.1...ocpp-server@v3.3.0) (2026-03-24)

### 🧹 Chores

- **ocpp-server:** Synchronize simulator-ui-ocpp-server versions

## [3.2.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v3.2.0...ocpp-server@v3.2.1) (2026-03-22)

### 🐞 Bug Fixes

- **deps:** update all non-major dependencies ([#1742](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1742)) ([60a10a7](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/60a10a795c1382285beab3020e01ad6ee3db6c3c))

## [3.2.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v3.1.2...ocpp-server@v3.2.0) (2026-03-21)

### 🚀 Features

- **ui:** add OCPP 2.0.x command support to Web UI ([#1734](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1734)) ([4aeb171](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/4aeb171dbb5cd2f9122452c1e45759e843d6ddb1))

### 🐞 Bug Fixes

- **deps:** update all non-major dependencies ([#1739](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1739)) ([3f56c2b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/3f56c2b2c080386026855ecb3c27b1a1f877dfa6))

### 🧪 Tests

- **ocpp-server:** add coverage threshold (fail_under=83%) ([fbf8af3](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/fbf8af354d8da3483e1b334c05601c10b7e029e7))

### 📚 Documentation

- **ocpp-server:** add typecheck and test_coverage to README and reorder dev sections ([d6b1466](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/d6b14669baad1e0d86136e60d877122ae61b93f1))

## [3.1.2](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v3.1.1...ocpp-server@v3.1.2) (2026-03-17)

### 🐞 Bug Fixes

- **ocpp-server:** update to websockets 16.x API (request.headers, request.path) ([9ea92a4](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/9ea92a4d4e0910b0f1d5431ccbc88807d6cf8674))

## [3.1.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v3.1.0...ocpp-server@v3.1.1) (2026-03-16)

### 🧹 Chores

- **ocpp-server:** Synchronize simulator-ui-ocpp-server versions

## [3.1.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v3.0.0...ocpp-server@v3.1.0) (2026-03-15)

### 🚀 Features

- **ocpp-server:** add error handling, configurable params, async tests, and Python 3.14+ compat ([87dd8a8](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/87dd8a85cf076059df34f0fc7e56a4dff9a56004))
- **ocpp-server:** overhaul OCPP 2.0.1 mock server with full command coverage ([00fd54b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/00fd54b4fd02b00a2bb65ab782b49b58ce144a34))

### 🐞 Bug Fixes

- **ocpp-server:** add suppress=False to all call() invocations and widen randint range ([2eacf4c](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/2eacf4c804a6b3bae9a7bd540c6f7940c40fc443))
- **ocpp-server:** extract CP ID from last URL segment and scope ChargePoints to instance ([bd42284](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/bd42284738659d575ac2a423c4f9af57e4580a6b))
- **ocpp-server:** share charge_points set across connections and harden test quality ([f2143a6](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/f2143a66e95692dbd659077be5cfa4a66dce3fe6))
- **ocpp-server:** use MagicMock for sync method in test to fix RuntimeWarning ([db3170b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/db3170b4a315252247ccf978e2a6ea3e9e54a829))

### ✨ Polish

- **ocpp-server:** deduplicate outgoing commands, harden timer, expand test coverage ([e4336e0](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e4336e067d893f86026d7faa1bf574e31ab10efe))
- **ocpp-server:** introduce AuthMode, AuthConfig and ServerConfig typed dataclasses ([a4393c7](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a4393c7879f03bba75a386f428cf02cbe9521187))
- **ocpp-server:** parametrize failure-path tests to eliminate duplication ([4ce2ca8](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/4ce2ca8670779be6062091ffb61b7513073f938a))

### 🧪 Tests

- **ocpp-server:** add behavioral tests for all outgoing commands ([737e11a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/737e11ab71105e46bb7cba7e6e454d3f6baa4674))
- **ocpp-server:** add connection lifecycle and command scheduling tests ([ce44bb8](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/ce44bb8914bc734b230b0855344d4f5b9a2bd2a5))
- **ocpp-server:** add Timer class test coverage ([d3f6b7b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/d3f6b7bb1dbd87768b1843e6166634bb63afdf77))
- **ocpp-server:** centralize constants, strengthen assertions, add auth modes, trim meta-tests ([593fa76](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/593fa76522675b80bbb5cf7505864927ede2a377))

### 📚 Documentation

- **ocpp-server:** restructure README with logical section hierarchy ([2287dc0](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/2287dc087ffb396b487c2cdecb011938c4506d52))

## [3.0.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.4.0...ocpp-server@v3.0.0) (2026-03-06)

### 🧹 Chores

- **ocpp-server:** Synchronize simulator-ui-ocpp-server versions

## [2.4.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.3.1...ocpp-server@v2.4.0) (2026-02-24)

### 🚀 Features

- **ocpp2:** add TransactionEvent command support ([#1607](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1607)) ([369acbe](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/369acbe1b0f32ace25990d76535a7beeb5d7358e))

## [2.3.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.3.0...ocpp-server@v2.3.1) (2026-02-13)

### 🧹 Chores

- **ocpp-server:** Synchronize simulator-ui-ocpp-server versions

## [2.3.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.2.1...ocpp-server@v2.3.0) (2026-02-12)

### 🧹 Chores

- **ocpp-server:** Synchronize simulator-ui-ocpp-server versions

## [2.2.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.2.0...ocpp-server@v2.2.1) (2026-01-13)

### 🧹 Chores

- **ocpp-server:** Synchronize simulator-ui-ocpp-server versions

## [2.2.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.1.0...ocpp-server@v2.2.0) (2026-01-08)

### 🚀 Features

- **ocpp2:** add GetVariables command support ([#1568](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1568)) ([18de0ff](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/18de0ff107847f9a4fbcd1d085324b6cb4e8032b))
- **ocpp2:** implement GetBaseReport and NotifyReport commands ([#1556](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1556)) ([b892fed](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/b892fed2c4832896332639b3e7a31bc0bc904e3c))

### 📚 Documentation

- refine OCPP server documentation ([86aea59](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/86aea59a29f8b60b5b4c3a40a493c0ee1f16154a))

### 🤖 Automation

- **deps-dev:** bump ruff from 0.13.2 to 0.13.3 in /tests/ocpp-server in the regular group ([a2cf693](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a2cf693ce706ee966b4389f600a06c18dc595bb5))
- **deps-dev:** bump ruff from 0.14.0 to 0.14.1 in /tests/ocpp-server in the regular group ([#1565](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1565)) ([5d3f626](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/5d3f626c8e9d2a2ce5c93819d6cd790fdcf5ab55))
- **deps-dev:** bump ruff from 0.14.2 to 0.14.3 in /tests/ocpp-server in the regular group ([01c1710](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/01c17105c03f69b145a24bcfb119d299f70f8174))
- **deps-dev:** bump ruff from 0.14.3 to 0.14.4 in /tests/ocpp-server in the regular group ([ab6ecbd](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/ab6ecbdd2ca8ea88c69d2be2260b5a0cbda594a2))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([33850a5](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/33850a56a088e1d6ee2305ae766d02dc7c43ebf7))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([d4cea7a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/d4cea7ad7b044f5d4a3091fef2b0f4e4e45d8021))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([876d15f](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/876d15fdef869de97e9cd35078173db3b5f125d7))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([4b0c642](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/4b0c642efbd533bcc607ac33b8e46ad56db9ef77))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1481](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1481)) ([35462e1](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/35462e1c098ba22f1c00aecbe440eef267364976))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1490](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1490)) ([fd006ff](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/fd006ff43daf84c37123e1bedcb81a9d99faa646))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1506](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1506)) ([4a4ed4e](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/4a4ed4e4d5da2ec76b7867f1159b0aa9f4d49fe5))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1517](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1517)) ([06c641a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/06c641afb531f5989544fe7dbf14d2550438bbc2))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1524](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1524)) ([ce6b720](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/ce6b72046c2829e2a105f82252547ce32f3ec163))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1555](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1555)) ([2811d30](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/2811d30172087713fe5a5544df6d358d16f9f5db))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1575](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1575)) ([6927eb4](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/6927eb42fb71bc492572afc02075ad4a1ffc967e))

## [2.1.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.10...ocpp-server@v2.1.0) (2025-07-24)

### 🤖 Automation

- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1457](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1457)) ([92949a8](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/92949a84e9a48ebdd9d0d1cb2b199f9677e605f8))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1466](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1466)) ([f75f394](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/f75f39447476897c7d570fd89e96137d1753959e))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1471](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1471)) ([6c70cfa](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/6c70cfa28ec0234c5c096d0cb8f7806f31638adf))
- **deps:** bump ocpp in /tests/ocpp-server in the regular group ([#1469](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1469)) ([01f2d5d](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/01f2d5d98a6e66ec49679d3a18062e95181f2197))

## [2.0.10](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.9...ocpp-server@v2.0.10) (2025-07-03)

### 🧹 Chores

- **ocpp-server:** Synchronize simulator-ui-ocpp-server versions

## [2.0.9](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.8...ocpp-server@v2.0.9) (2025-06-27)

### 🤖 Automation

- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1442](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1442)) ([9dc2344](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/9dc23444c551a9ea448544061efdc6febdca8ad9))

## [2.0.8](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.7...ocpp-server@v2.0.8) (2025-05-27)

### 🤖 Automation

- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1412](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1412)) ([74d8348](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/74d8348d64f562a1c4cd74bea36955d83638949c))

## [2.0.7](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.6...ocpp-server@v2.0.7) (2025-04-30)

### 🤖 Automation

- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1383](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1383)) ([4acd8d4](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/4acd8d4bf78b7a685421e1d8c1bf71fbd65c32ef))

## [2.0.6](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.5...ocpp-server@v2.0.6) (2025-04-08)

### 🧹 Chores

- **ocpp-server:** Synchronize simulator-ui-ocpp-server versions

## [2.0.5](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.4...ocpp-server@v2.0.5) (2025-04-08)

### 🤖 Automation

- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([3bae471](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/3bae4711f84a10a63f196be92081d2644124dce0))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([3327a60](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/3327a6085b4540edead4e9b90bb173e346604016))

## [2.0.4](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.3...ocpp-server@v2.0.4) (2025-04-01)

### 🤖 Automation

- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([0346f5a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/0346f5aeb832aca457ef033f58fcfd166e91ae28))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1356](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1356)) ([16323a6](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/16323a6c2d07a70195fe4ee921fc3315b0b68d16))

## [2.0.3](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.2...ocpp-server@v2.0.3) (2025-03-17)

### 🐞 Bug Fixes

- port OCPP 2 server code to ocpp version 2 library ([5dd0043](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/5dd0043f62de284dfdfcd055d891240a696851a3))

### 🤖 Automation

- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([1240d3f](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/1240d3f44065f961c318a66cd212a43774d2f3c6))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([69ef17b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/69ef17ba78fa0e4587d9a8f4ccb8e0aabd4a788b))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([b07fdee](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/b07fdeec628dbee2767118c53f2f39cc718391fc))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([8d44b04](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/8d44b04c638837d9661094906ee0fc762aec84e6))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([c45323e](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c45323e528911f5ab21c52245f7471d4ea4d3dad))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([a00d711](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a00d7116df445153f740568d95a808a94150657f))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([70d6e16](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/70d6e160690f0cd24c37adf5fd227c9b96b26e9e))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1265](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1265)) ([c16a083](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c16a08374580fbe02b9797909b559ad18241c7a1))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1272](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1272)) ([724426b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/724426b6062a2515eaa4b96747d672cd93f4421f))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1277](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1277)) ([00c442c](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/00c442c3e5e5b09307ae59cd82a9ce76483674b3))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1283](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1283)) ([4079d7d](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/4079d7d927671d601ebfc1d24cd3ec3010b94606))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1304](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1304)) ([a2975d2](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a2975d23712aa2a609e356087963f901da8b2cc6))
- **deps:** bump ocpp from 2.0.0rc3 to 2.0.0rc4 in /tests/ocpp-server ([#1266](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1266)) ([ef6b26b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/ef6b26b096bb3c6faea89a3c62346e510d81861d))
- **deps:** bump ocpp from 2.0.0rc4 to 2.0.0 in /tests/ocpp-server ([#1268](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1268)) ([6f05e7a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/6f05e7a9c51a7a271f5a3a6867a823cf53383d5d))
- **deps:** bump websockets from 14.2 to 15.0 in /tests/ocpp-server ([6ad66a2](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/6ad66a2dd098c3e767a2ff82c363355319af4725))
- **deps:** bump websockets in /tests/ocpp-server in the regular group ([caf7b3c](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/caf7b3c912da328c15e76b063448150f407a5555))
- **deps:** bump websockets in /tests/ocpp-server in the regular group ([#1289](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1289)) ([30f283d](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/30f283dd68a2262d62ad69c380b93af7a05d5672))

## [2.0.2](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.1...ocpp-server@v2.0.2) (2024-12-23)

### 🤖 Automation

- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1236](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1236)) ([5fa6474](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/5fa6474bb36abdbb4eaff8fce0946b037ae3943d))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1247](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1247)) ([7113dc0](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/7113dc0799591f7bb8707e7130275a01f338d126))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1252](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1252)) ([7832605](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/78326059f0d364515aab8e67297b0af8e6b27e6d))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1257](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1257)) ([8f3ff89](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/8f3ff8960c98a62154a20aa4799cee85fe922817))
- **deps-dev:** bump taskipy in /tests/ocpp-server in the regular group ([#1229](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1229)) ([957a50e](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/957a50ec72f20059c9118c022fc774c6cb83b87b))
- **deps:** bump ocpp from 2.0.0rc2 to 2.0.0rc3 in /tests/ocpp-server ([#1248](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1248)) ([45c31e7](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/45c31e715047edf8eb5aeb5e0bb098902a252bf4))

## [2.0.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v2.0.0...ocpp-server@v2.0.1) (2024-11-22)

### 🤖 Automation

- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([6c99ee6](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/6c99ee6a02a4c98147c2f47b085faef12d850a73))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1201](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1201)) ([8a80af2](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/8a80af287e23d31f24fde579f0db6b68405f3091))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1213](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1213)) ([89e4a23](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/89e4a238ab0be07503d933dcb62ae3688497c123))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1224](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1224)) ([c047fe5](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c047fe50eca6da3b32136bd4ce8b8a99346bc8db))
- **deps:** bump websockets from 13.1 to 14.0 in /tests/ocpp-server ([#1214](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1214)) ([cfafab3](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/cfafab382b0379a6f38a215c69908917e31de434))
- **deps:** bump websockets in /tests/ocpp-server in the regular group ([#1218](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1218)) ([9e1c610](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/9e1c6101dbeaa175122a8810bc3c94521b49da61))

## [2.0.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v1.5.2...ocpp-server@v2.0.0) (2024-10-23)

### 🤖 Automation

- **deps-dev:** bump taskipy in /tests/ocpp-server in the regular group ([#1199](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1199)) ([cd41213](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/cd41213f50caaf842c4cc078ce5907adba68c05b))

## [1.5.2](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v1.5.1...ocpp-server@v1.5.2) (2024-10-21)

### 🐞 Bug Fixes

- fix server task ([63bdd06](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/63bdd06f6a605d56e31dfc2787b259d190dea56c))

### 🤖 Automation

- **deps-dev:** bump ruff from 0.5.5 to 0.5.6 in /tests/ocpp-server ([#1121](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1121)) ([600d4c1](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/600d4c16c67c6c91c97368aa59931faa86ccfc23))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([05d3347](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/05d3347e16f1a64531c1f9a8020f5196634d7062))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([5522407](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/5522407ca7c53f5eb5c92f066bba27502959afc0))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1133](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1133)) ([e5ea15f](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e5ea15fc2a6ca7679c9eefdb5a3f56163341ea07))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1141](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1141)) ([0f729d5](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/0f729d55a33898e17bc7eae9c6789e5460e9ec29))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1142](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1142)) ([815ddf2](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/815ddf2b89991ca7450c5edbb43cd34fd0c5655a))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1149](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1149)) ([e62f5d8](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e62f5d862ff66ba33559c3852d63df159359a0e1))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1169](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1169)) ([a5e2da5](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a5e2da5d5e46970afadc6d4933d997830bbd7b42))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1174](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1174)) ([5e1baef](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/5e1baef5574abfe01f8891acc97ad87c9e98018b))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1186](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1186)) ([2442336](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/2442336b709ce2848b26f7210bb9d22cff12dc39))
- **deps-dev:** bump ruff in /tests/ocpp-server in the regular group ([#1194](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1194)) ([8641c87](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/8641c876f7bca338bfa81546298917576a7503c2))
- **deps:** bump the regular group in /tests/ocpp-server with 2 updates ([#1154](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1154)) ([1632cc4](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/1632cc430da54a1ca9511f1ebe261ac6a260ac4a))
- **deps:** bump the regular group in /tests/ocpp-server with 2 updates ([#1175](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1175)) ([455167a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/455167a9345be3811196083fbb54c3db22be62c7))
- **deps:** bump websockets in /tests/ocpp-server in the major group ([ebea5db](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/ebea5dbf6b4b042cb481ef7a7d0686c2d56ea1f4))

## [1.5.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v1.5.0...ocpp-server@v1.5.1) (2024-07-30)

### 🤖 Automation

- **deps-dev:** bump ruff from 0.5.4 to 0.5.5 in /tests/ocpp-server ([#1109](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1109)) ([ed9eed8](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/ed9eed87bba1bee5b0a7cb06d96a5ad40a2278eb))

## [1.5.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v1.4.2...ocpp-server@v1.5.0) (2024-07-25)

### 🤖 Automation

- **deps-dev:** bump ruff from 0.5.2 to 0.5.3 in /tests/ocpp-server ([#1094](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1094)) ([be27d4e](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/be27d4eacbbc58857c7c8a3caac51383f920b2f9))

## [1.4.2](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v1.4.1...ocpp-server@v1.4.2) (2024-07-06)

### 🤖 Automation

- **deps-dev:** bump ruff from 0.5.0 to 0.5.1 in /tests/ocpp-server ([b6f8b09](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/b6f8b09baf035ba075a837cb9199e821b2deb6fa))

## [1.4.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server@v1.4.0...ocpp-server@v1.4.1) (2024-07-05)

### 🧹 Chores

- **ocpp-server:** Synchronize simulator-ui-ocpp-server versions

## [1.4.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ocpp-server-v1.3.7...ocpp-server@v1.4.0) (2024-07-04)

### 🐞 Fixes

- **ocpp-server:** randomize GetBaseReport request id ([8fe113d](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/8fe113d7ae764df93daaa7a69c6fe810b6703587))
