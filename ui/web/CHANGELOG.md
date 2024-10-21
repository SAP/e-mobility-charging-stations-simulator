# Changelog

## [1.5.2](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/webui@v1.5.1...webui@v1.5.2) (2024-10-21)

### 🐞 Bug Fixes

- silence TS strict null check errors ([df60841](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/df60841b5f33a375830f6c8865bedaa9a54da65e))

### ✨ Polish

- cleanup blank lines ([b1421bc](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/b1421bc351387bb5efd738f0be8cfd5ab94a4426))
- **deps-dev:** remove unused deps ([fd855c1](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/fd855c1b97eb0eb50caba0f766c94b2cea4ff5e0))
- display transaction id in UI ([99fb669](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/99fb669336a4182fa6932a1e1b1c0eb2fad834aa))
- **docker:** rename start.sh to run.sh ([baf8b16](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/baf8b16408ca3209ec4b9b8b07e1a9b026761444))
- separate out dashboard docker image ([20fb109](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/20fb10949dc2553d7695be1aab02bf84a8ddab98)), closes [#1040](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1040)
- switch to eslint-plugin-perfectionist ([0749233](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/0749233f25516e4c73ee8dbcea8c4ad6b8a506bb))
- turn on `noImplicitOverride` in TS configuration ([6375d3c](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/6375d3cdd7f42a6e125976df194f4fe689d24113))
- use ENTRYPOINT syntax in docker files ([989108f](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/989108f63bd531f04b28e65c8b499c9dbf5bbed0))

### 🧪 Tests

- add checkStationInfoConnectorStatus() test ([dd81d27](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/dd81d27d043073971f29ec761261489f16c66541))

### 🤖 Automation

- **deps-dev:** bump @types/node from 22.0.3 to 22.1.0 ([#1120](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1120)) ([c11dc2a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c11dc2a0aca044ee03dc565dfaff7342b4ce039a))
- **deps-dev:** bump @vitest/coverage-v8 from 2.0.4 to 2.0.5 ([#1117](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1117)) ([4ee8259](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/4ee82592a066961b6877858ed29a825bfd480acf))
- **deps-dev:** bump jsdom from 24.1.1 to 25.0.0 in the major group ([#1152](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1152)) ([bb7aeb1](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/bb7aeb1e64f53b1b3af1b1b33c405bb13310578c))
- **deps-dev:** bump the regular group with 2 updates ([cc3e26b](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/cc3e26b41348dffd62937a9b44e4b22d963beebc))
- **deps-dev:** bump the regular group with 2 updates ([#1156](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1156)) ([d366869](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/d36686932f284482ecfd095387a717b92ce64b5a))
- **deps-dev:** bump the regular group with 2 updates ([#1183](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1183)) ([9de6af7](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/9de6af7490dc616d685c474b0d54c19c53fb15cd))
- **deps-dev:** bump the regular group with 3 updates ([#1167](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1167)) ([fcca987](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/fcca98745121549db537d9ce588e38900c8f0e0d))
- **deps-dev:** bump vitest from 2.0.4 to 2.0.5 ([#1116](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1116)) ([e454b55](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e454b5538856316f8492463262186a24e02e2925))
- **deps:** bump the regular group across 1 directory with 12 updates ([#1140](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1140)) ([89e8682](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/89e8682d8e1b3936bd17af7eca0142f9ad695b7f))
- **deps:** bump the regular group across 1 directory with 4 updates ([58e990c](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/58e990c7169a44eaa5ee14029119713ce92f5033))
- **deps:** bump the regular group with 10 updates ([#1153](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1153)) ([48bd33f](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/48bd33f9432231b9551d65ceb5cd14b937e5cff1))
- **deps:** bump the regular group with 2 updates ([#1129](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1129)) ([d9f951c](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/d9f951c258d12765106548688672b8413716fb16))
- **deps:** bump the regular group with 2 updates ([#1143](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1143)) ([f883a83](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/f883a83f647b54a7b625e19972e94224f768c50b))
- **deps:** bump the regular group with 2 updates ([#1155](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1155)) ([c02ea07](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c02ea0790b61c5b29c353ff1297fa5e3fe5538da))
- **deps:** bump the regular group with 2 updates ([#1165](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1165)) ([e1fb067](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e1fb067c6a2d00106c5bf7ec0707d5374fdca464))
- **deps:** bump the regular group with 2 updates ([#1189](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1189)) ([d626254](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/d626254db881732a6478258428fd37da26c4cabb))
- **deps:** bump the regular group with 3 updates ([#1151](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1151)) ([271426f](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/271426fb72220de7969c8200067f51793a5502a7))
- **deps:** bump the regular group with 3 updates ([#1170](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1170)) ([fb89e15](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/fb89e155dbfd8be508fa42a08fc44dad925bd7ad))
- **deps:** bump the regular group with 4 updates ([#1157](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1157)) ([35fbcd3](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/35fbcd383c244ae746b45c031abac4b6cbadf001))
- **deps:** bump the regular group with 4 updates ([#1166](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1166)) ([2f2d625](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/2f2d625b102d7211e5311c8367690bd03ce8087a))
- **deps:** bump the regular group with 4 updates ([#1173](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1173)) ([b07a57e](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/b07a57e8de27faf8008b26e94f78978cc1b58ff4))
- **deps:** bump the regular group with 5 updates ([#1191](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1191)) ([c9a4d44](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/c9a4d44f8a45e92a7b5dd755c0b811c85f5c2f6e))
- **deps:** bump the regular group with 6 updates ([#1163](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1163)) ([e6ea62c](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e6ea62c8b4c1ba8c99c8502a9df24709f46e19cf))
- **deps:** bump the regular group with 7 updates ([f5d5fe0](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/f5d5fe0e8449c8c1ecd560cdaea66757d4cb6168))
- **deps:** bump the regular group with 7 updates ([#1130](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1130)) ([4f1d887](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/4f1d8877c57dd59ec6b862c5caee613532e0873a))
- **deps:** bump the regular group with 7 updates ([#1158](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1158)) ([4809da4](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/4809da42ba62306e05652e685aba604bc66ec179))
- **deps:** bump the regular group with 7 updates ([#1168](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1168)) ([2336b18](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/2336b18a25e03b086d23fd7c99753ac9201eee6e))
- **deps:** bump the regular group with 9 updates ([#1137](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1137)) ([eede99d](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/eede99da5f4df39204a48daf6caf8463c1048be6))
- **deps:** bump vue from 3.4.36 to 3.4.37 in the regular group ([#1132](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1132)) ([1e755e0](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/1e755e07ca8925d906b4b83a9a430d4d4dc4b31d))
- **deps:** bump vue from 3.5.1 to 3.5.2 in the regular group ([54e7c79](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/54e7c7947381865de499ddff816d007399942040))
- **deps:** bump vue from 3.5.10 to 3.5.11 in the regular group ([#1184](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1184)) ([b216885](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/b216885bc638297def6a91f530813a4ab078dc5c))
- **docker:** fix dashboard auto config paths ([abba1ad](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/abba1ad8aec06b4c1783adc6893c09ce108f08a3))
- **sonar:** refine sonar-project.properties files ([216a56a](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/216a56a2a3c4548eb9fdb3a67793e653b4f8bbf3))

## [1.5.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/webui@v1.5.0...webui@v1.5.1) (2024-07-30)

### 🧹 Chores

- **webui:** Synchronize simulator-ui-ocpp-server versions

## [1.5.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/webui@v1.4.2...webui@v1.5.0) (2024-07-25)

### 🤖 Automation

- **deps-dev:** bump @types/node from 20.14.11 to 20.14.12 ([#1106](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1106)) ([fb46a87](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/fb46a877f5c2b880759b9e70a08092510a7cb473))
- **deps-dev:** bump @vitejs/plugin-vue from 5.0.5 to 5.1.0 ([#1105](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1105)) ([d36c4c8](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/d36c4c840ab5ac7a9c7fe6abbd2ae01844cb981e))
- **deps-dev:** bump @vitest/coverage-v8 from 2.0.1 to 2.0.2 ([bbdb386](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/bbdb3861ed14ea52669231e5d372add76c50d65e))
- **deps-dev:** bump rimraf from 5.0.8 to 6.0.0 ([207408c](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/207408cf661a7b8a1d35f8a9aa5ff02104fcd8ba))
- **deps-dev:** bump typescript-eslint from 7.16.0 to 7.16.1 ([a60a99d](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a60a99dce05328466e9a631ba83a9d527f3b4548))
- **deps-dev:** bump vitest from 2.0.1 to 2.0.2 ([#1082](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1082)) ([f3d0d30](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/f3d0d30346974ec0e979d53d8a761ce254ba8bb0))
- **deps:** bump vue from 3.4.33 to 3.4.34 ([#1107](https://github.com/SAP/e-mobility-charging-stations-simulator/issues/1107)) ([0bfef14](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/0bfef1423a926bd6054a25934957148d1d2fb4b0))

## [1.4.2](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/webui-v1.4.1...webui@v1.4.2) (2024-07-06)

### 🧹 Chores

- **webui:** Synchronize simulator-ui-ocpp-server versions

## [1.4.1](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ui@v1.4.0...ui@v1.4.1) (2024-07-05)

### 🐞 Fixes

- **ci:** fix release branches creation ([f727f02](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/f727f029cb974cffb38a2c569173730b6b808e3f))

## [1.4.0](https://github.com/SAP/e-mobility-charging-stations-simulator/compare/ui-v1.3.7...ui@v1.4.0) (2024-07-04)

### 🤖 Automation

- bump volta node version ([abc5de8](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/abc5de857ea9e4a27f83d1c2fe60b4618775a540))
- **deps-dev:** apply updates ([e92bd99](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/e92bd991d1f0c43442dd20d7b5e34fd30f9bb136))
- **deps-dev:** apply updates ([a33e3b4](https://github.com/SAP/e-mobility-charging-stations-simulator/commit/a33e3b4129757990b84af075cf9b678506937afb))
