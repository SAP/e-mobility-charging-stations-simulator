# Changelog

## [4.5.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/cli@v4.5.0...cli@v4.5.1) (2026-04-28)


### 🐞 Bug Fixes

* **deps:** update all non-major dependencies ([#1809](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1809)) ([e0e14c1](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e0e14c14774c700617f52a0717097edf7bf2b940))

## [4.5.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/cli@v4.4.0...cli@v4.5.0) (2026-04-22)

### 🚀 Features

- **cli:** display failure reasons in human-readable table output ([fbc4346](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/fbc4346d92ec7c2f2ba705f125468f0d631495cd))
- **cli:** expose station identity overrides and CSMS credentials ([e93c0ae](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e93c0aee3d488fb814ea32567325cb8d983e14fe))
- **ui-cli:** add custom JSON payload option for OCPP and transaction commands ([331705d](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/331705d19e0f1541720cb72ffe83c0f405cb8bb8))
- **ui-cli:** add registration and connector columns to station list, fix command semantics ([bcb21a5](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/bcb21a59907b2ab0841956fe2c50f8bd2be8619a))
- **ui-cli:** short hash prefix matching, human output formatters, embedded agent skill ([dd8e416](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/dd8e4161d8629cae2020a5ff451b1539f83b29db))
- **ui:** add CLI client and shared UI common library ([#1789](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1789)) ([94b898b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/94b898b618410975a64b9e39b076a3909391dbf6))
- **ui:** human-readable CLI output + shared type updates + --url collision fix ([ee80802](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/ee808028b2e94d69ad0f5647dec2f507cea15a3a))

### 🐞 Bug Fixes

- **cli:** make high-level OCPP commands version-aware ([#1801](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1801)) ([804dce7](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/804dce720fd281de52499510cba6d8cbb01fdf0d))
- **cli:** replace unsafe WebSocket double cast with typed adapter ([a5c1a4d](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a5c1a4d8b082acbb50521817221f9e1e80ca71e1))
- **cli:** replace unsafe WebSocket double cast with typed adapter ([96d7557](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/96d75572c995508ddde814b8f5ffea134c29b7b7))
- **cli:** validate connect timeout budget — reject NaN/0/negative before race ([99fc323](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/99fc323675d2cab228ea5d83064365bd75842166))
- **deps:** update all non-major dependencies ([#1792](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1792)) ([eeeb437](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/eeeb43740e3f30fd341a687019ba6606398467f7))
- **deps:** update all non-major dependencies ([#1807](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1807)) ([87099e8](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/87099e81af13f3ec514e8d69ecfd1aa09b42c224))
- **deps:** update dependency ora to v9 ([#1793](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1793)) ([d4ad3f5](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/d4ad3f5e9da0f6c5befd25250e81b6f446d4da06))
- **ui-cli:** resolve --url option collision between global and supervision ([49ec520](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/49ec5204d5e209108922057a05de6fbb3f705859))

### ✨ Polish

- **cli:** audit fixes — validate timeoutMs, extract mock factory, add comments ([dfb70ff](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/dfb70ffb385fdcb52992e6dce6d99a1e95866544))
- **cli:** complete remaining audit items — validate status, extract helpers, add 8 test cases ([84444f7](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/84444f7c7efc01a367eea680d37c1657bde56bd1))
- **cli:** extract extractErrorMessage utility ([a0ba4b5](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a0ba4b54c0ffe51408cd2e638231225c86510fae))
- **cli:** fix onerror ErrorEvent handling, DRY adapter types, simplify factory ([22decdd](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/22decddb6f6ed90972c26e7b320263aefdc2e5f0))
- **cli:** second-pass audit fixes — DRY table helper, remove slop, strengthen assertions ([c611414](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c61141439920995fd3cf9e4ab8a46629fda627fa))
- **ui-cli:** move StationListPayload to shared types, add resolution error context ([0c6cfa9](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/0c6cfa9ac228910848194b1936ac077208617483))
- **ui-common:** derive UIServerConfigurationSection from Zod schema ([7d5e179](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/7d5e1796618aba914309a1b0aafd79546570c999))
- **ui-common:** generic WebSocket adapter factory with converter injection ([e6be841](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e6be8411376eca8624601b70323ae557cae797ed))
- **ui-common:** remove UIServerConfig alias, single canonical name ([7e50e41](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/7e50e4189e6f973eb7593ad1789b05b783a18cf3))
- **ui:** consolidate constants — remove timeout duplicate, centralize defaults ([42f6757](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/42f675715f5cb0c64601d90a49c2c06979671c60))
- **ui:** factorize shared code across ui packages ([c91d737](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c91d737117e050b08d68f25ae9b3217a574e6188))
- **ui:** global code quality pass ([01b9a6a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/01b9a6aed766a8421c17c8a23ca37646810414de))
- **ui:** second-pass factorization audit implementation ([5f58e56](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/5f58e5604c968bad180ba01dd110521cdb9c6c86))

### 🧪 Tests

- add enum rejection tests and fix dynamic import in CLI test ([99014cb](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/99014cb1ccd1cef5eae6356a07cc22310619b820))
- **cli:** fix lifecycle test structure — single top-level describe ([7111081](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/711108181080309b92261431c50bce61eb08789b))

### 📚 Documentation

- **cli:** update embedded SKILL.md with identity and credential options ([5954e3c](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/5954e3c13a79c0761eae7d084bc9b2ee9144fd9a))
