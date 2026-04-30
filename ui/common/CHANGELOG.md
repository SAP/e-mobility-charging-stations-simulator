# Changelog

## [4.6.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ui-common@v4.5.1...ui-common@v4.6.0) (2026-04-30)


### 🚀 Features

* **ui-web:** add dracula, gruvbox-dark, rose-pine themes and fix surface hierarchy ([b3a6af7](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/b3a6af77aca2c5747771044be3bbdfd926093e52))
* **ui-web:** add teal-dark and teal-light themes and fix sap-horizon state colors ([7f21068](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/7f210688177e9e0ce2943fb5176c700e37bcf673))
* **ui-web:** implement runtime skin system with classic and modern skins ([#1815](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1815)) ([72aba1e](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/72aba1edf1957107024a043cbbd122fc0a4ee552))


### 🐞 Bug Fixes

* **deps:** update all non-major dependencies ([#1820](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1820)) ([52667c5](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/52667c5e1e2133b83d242d20bee90ca58657bd4a))
* **ui-web:** resolve WS race condition causing DISCONNECTED on modern skin ([e626ef8](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e626ef8a0f8ce4ac1010fc440a0c27dd225b4435))
* **ui:** make Authorize version-aware for OCPP 2.0.1 stations ([1d31a91](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/1d31a910211733b0deaf64d6c1398d3248d94b55)), closes [#1817](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1817)


### ✨ Polish

* **ui-common:** use ProcedureName enum instead of string literals in payload builders ([99a793f](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/99a793f304c8199339dab48b2492228e86d1dce0))

## [4.5.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ui-common@v4.5.0...ui-common@v4.5.1) (2026-04-28)

### 🐞 Bug Fixes

- **deps:** update all non-major dependencies ([#1809](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1809)) ([e0e14c1](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e0e14c14774c700617f52a0717097edf7bf2b940))

## [4.5.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ui-common@v4.4.0...ui-common@v4.5.0) (2026-04-22)

### 🚀 Features

- **cli:** display failure reasons in human-readable table output ([fbc4346](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/fbc4346d92ec7c2f2ba705f125468f0d631495cd))
- **common:** add browser WebSocket adapter ([fe53a6d](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/fe53a6d218647d4ac51cbc648f3484e68eb32ea0))
- **common:** add notification callback support to WebSocketClient ([a92b744](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a92b7442aa0c0e82bd0870c61d8069d9582a0a8d))
- **ui-server:** allow override of station identity and CSMS credentials in addChargingStations ([#1802](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1802)) ([f23ba15](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/f23ba158a146ac3a0aedd85195c16e4d4595acd9))
- **ui:** add CLI client and shared UI common library ([#1789](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1789)) ([94b898b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/94b898b618410975a64b9e39b076a3909391dbf6))
- **ui:** human-readable CLI output + shared type updates + --url collision fix ([ee80802](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/ee808028b2e94d69ad0f5647dec2f507cea15a3a))

### 🐞 Bug Fixes

- **cli:** make high-level OCPP commands version-aware ([#1801](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1801)) ([804dce7](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/804dce720fd281de52499510cba6d8cbb01fdf0d))
- **cli:** replace unsafe WebSocket double cast with typed adapter ([a5c1a4d](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a5c1a4d8b082acbb50521817221f9e1e80ca71e1))
- **common:** include Date in JsonPrimitive, restore Date fields ([758cbfa](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/758cbfa38651951565a0c152a0e9b8f82a2239d2))
- **common:** restore wsState type as numeric literal union ([30efe62](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/30efe6295ce8d26d1ec60c5791b2c2111978549d))
- **deps:** update all non-major dependencies ([#1792](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1792)) ([eeeb437](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/eeeb43740e3f30fd341a687019ba6606398467f7))
- enforce RFC 7617 colon-free username across all Basic Auth paths ([5c1f885](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/5c1f8850d9983d941187269741aee535841412c3))
- **ui-common:** forward close code/reason in mock WebSocket factory ([159977e](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/159977e62236e1b912537b0ea168e5fde81899f5))
- **ui:** use portable crypto API and async bootstrap pattern ([3c6f6f1](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/3c6f6f11211b476fe050cd54d5bb6829c7bdbfc1))
- **web:** copy workspace node_modules, harmonize browser adapter, add frozen-lockfile ([bbb04f4](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/bbb04f4d31c309e46ed02be961ee086bc1d921d1))
- **web:** prevent ghost events after server switch, fix CloseEvent type, improve error extraction ([12c1e9a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/12c1e9a4cd5cfa456576d672d7d4a681afe1b57a))

### ✨ Polish

- **cli:** audit fixes — validate timeoutMs, extract mock factory, add comments ([dfb70ff](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/dfb70ffb385fdcb52992e6dce6d99a1e95866544))
- **cli:** complete remaining audit items — validate status, extract helpers, add 8 test cases ([84444f7](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/84444f7c7efc01a367eea680d37c1657bde56bd1))
- **cli:** fix onerror ErrorEvent handling, DRY adapter types, simplify factory ([22decdd](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/22decddb6f6ed90972c26e7b320263aefdc2e5f0))
- **cli:** second-pass audit fixes — DRY table helper, remove slop, strengthen assertions ([c611414](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c61141439920995fd3cf9e4ab8a46629fda627fa))
- **common:** export browser adapter from barrel ([13df7a3](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/13df7a33f34324af18a8a6bfd5b5e7b0a4046ff8))
- **common:** portable btoa, eliminate UIClient duplication, fix Docker deps ([d63dd09](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/d63dd0933f9c3a96ca2ba613e904980dbca3f8bd))
- consolidate all types into ui-common — single import source ([9739ffe](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/9739ffe201bf3d5b0060ff038af83f515b7d6921))
- fix phantom errorMessage, merge imports, harmonize Docker configs ([18dc121](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/18dc1211f776e966b36417f47aa191c248dea183))
- **ui-common:** derive ClientConfig and AuthenticationConfig from Zod schemas ([2d81b7e](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/2d81b7ea4c293c833f87d56e05e24023d46efbd1))
- **ui-common:** derive UIServerConfigurationSection from Zod schema ([7d5e179](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/7d5e1796618aba914309a1b0aafd79546570c999))
- **ui-common:** generic WebSocket adapter factory with converter injection ([e6be841](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e6be8411376eca8624601b70323ae557cae797ed))
- **ui-common:** remove UIServerConfig alias, single canonical name ([7e50e41](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/7e50e4189e6f973eb7593ad1789b05b783a18cf3))
- **ui:** consolidate constants — remove timeout duplicate, centralize defaults ([42f6757](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/42f675715f5cb0c64601d90a49c2c06979671c60))
- **ui:** factorize shared code across ui packages ([c91d737](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c91d737117e050b08d68f25ae9b3217a574e6188))
- **ui:** global code quality pass ([01b9a6a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/01b9a6aed766a8421c17c8a23ca37646810414de))
- **ui:** move generic utilities to ui-common and add useFetchData composable ([93cacfb](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/93cacfb376c7856e85eb8607db8cd3edb8e160f2))
- **web:** eliminate type barrel — direct imports from ui-common and source modules ([dbf5731](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/dbf573181510a19edda0bf76aee6e8553a06c60e))

### 🧪 Tests

- add enum rejection tests and fix dynamic import in CLI test ([99014cb](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/99014cb1ccd1cef5eae6356a07cc22310619b820))
- **cli:** fix lifecycle test structure — single top-level describe ([7111081](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/711108181080309b92261431c50bce61eb08789b))
- **ui-common:** create shared mock WebSocket factory ([218548e](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/218548ea12104c24856c1598e7326a75d6c21fa0))
- **ui:** add tests for converters, websocket utils, and useFetchData ([df99c2e](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/df99c2e939c3584a1045d9751262fd289896948c))

### 📚 Documentation

- add ADR for config loading strategy and ClientConfig derivation ([ac9f430](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/ac9f4304e67f449b8cb00903325c9ce733fb067d))
- add monorepo structure to copilot instructions, clarify command scopes ([d7ef329](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/d7ef32996398570fd53ecd8850d25d4ad43995ff))
- **ui-common:** remove ADR section from README ([c6c99a1](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c6c99a1915eacee52a04431f87350efa9c64feda))
