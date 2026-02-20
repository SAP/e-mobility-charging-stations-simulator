# OCPP

OCPP 2.0.1 Edition 3

Errata 2025-09

# Table of Contents

Disclaimer 1

Scope 2

Terminology and Conventions 2

0. Part 0 3

1. Part 1 4  
   1.1. Page 9 - (2025-01) - 3.4. Monitoring. 4
2. Part 2 5  
   2.1. Page 5 - (2025-01) - Updated limitations on BasicAuthPassword to increase security. 5  
   2.2. Page 14 - (2025-04) - Section 2.7. ISO 15118 support - Alligned ISO 15118 timeout table with updated version in OCPP 2.1  
   2.3. Page 15 - (2025-01) - Improved text FR.04  
   2.4. Page 19 - (2025-01) - Removed requirement A00.FR.003 as the precondition never occurs 6  
   2.5. Page 19/41 - (2025-01) - Allow downgrading security profile from 3 to 2. 7  
   2.6. Page 26 - (2025-01) - 1.3.7. TLS with Client Side Certificates Profile - Requirements 9  
   2.7.Page 28-(2025-01)-CertificateHierarchy 9  
   2.8. Page 31 - (2025-01) - A02/A03 - Updated error handling 10  
   2.9. Page 34 - (2025-01) - Disallow client certificates future validity date 10  
   2.10. Page 58/60 - (2025-01) - Missing requirement information about omitting the value for WriteOnly variables 13  
   2.11. Page 63 - (2025-09) - B09.FR.02/04/05 - Added optional reasonCode 14  
   2.12. Page 64 - (2025-09) - B09.FR.31/31 - Improved definition 14  
   2.13. Page 66 - (2025-04) - B10.FR.03/04/10 - Migrate to new NetworkConnectionProfile. 15  
   2.14. Page 67 - (2025-06) - B11 - Clarify meaning of OnIdle for Reset 16  
   2.15. Page 69 - (2025-01) - B11 - Reset without Ongoing Transaction - Requirements 16  
   2.16. Page 73 - (2025-01) - B12 - Reset with Ongoing Transaction - Requirements 16  
   2.17. Page 77 - (2025-01) - 1.6 Relationship between authorization and transaction. 17  
   2.18. Page 80 - (2025-01) - C01 - EV Driver Authorization using RFID - Requirements. 18  
   2.19. Page 80 - (2025-01) - C01 - EV Driver Authorization using RFID - Requirements. 18  
   2.20. Page 99 - (2025-01) - C09- Authorization by Groupld - Requirements 18  
   2.21. Page 101 - (2025-01) - Updated requirements related to clarify the relation between AuthCacheLifeTime and cacheExpiryDateTime 18  
   2.22. Page 113 - (2025-01) - C16 - Stop Transaction with a Master Pass - Requirements 19  
   2.23. Page 129 - (2025-01) - Updated sequence diagram E01 S5 20  
   2.24. Page 151 - (2025-02) - E06.FR.05 for DataSigned as TxStopPoint is invalid 20  
   2.25. Page 152 - (2025-01) - E07 - Improved scenario description names 20  
   2.26. Page 154 - (2025-01) - E07 - Transaction locally stopped by IdToken 21  
   2.27. Page 155 - (2025-09) - E07.FR.07 - Improved precondition 22  
   2.28. Page 198 - (2025-01) - G01 - Status Notification - Requirements 22  
   2.29. Page 197 - (2025-01) - G01 - Status Notification - State transition overview for connecting/disconnecting 23  
   2.30. Page 208 - (2025-01) - H. Reservation - Introduction. 23  
   2.31. Page 213 - (2025-02) - H02 - Added missing requirements 23  
   2.32. Page 214/215 - (2025-01) - Improved use case scenario descriptions and added S3 25  
   2.33. Page 226 - (2025-01) - I06.FR.02 Improved requirement text. 28  
   2.34. Page 231 - (2025-01) - Updated section Multiple Locations/Phases 29  
   2.35. Page 243 - (2025-01) - Improved section on external Smart Charging Control Signals 29  
   2.36. Page 248 - (2025-01) - 3.7 Avoiding Phase Conflicts 30  
   2.37. Page 275 - (2025-06) - Updated remark of K11 31  
   2.38. Page 251 - (2025-06) - Updated note of K01.FR.05 31  
   2.39. Page 251 - (2025-06) - Add cross-references to K01.FR.06 and K01.FR.39 31  
   2.40. Page 254 - (2025-06) - K01.FR.50 requirement is a SHALL 32  
   2.41. Page 257 - (2025-06) - K02 Updated remark of use case about merging profiles 33  
   2.42. Page 282 - (2025-01) - K15 - ISO 15118-2 Charging with load leveling - Requirements 33  
   2.43. Page 282 - (2025-09) - K15.FR.20 is not part of OCPP 2.0.1 [1061]. 34  
   2.44. Page 286 - (2025-01) - K16 - Renegotiation initiated by CSMS - Requirements 34  
   2.45. Page 284 - (2025-09) - K15 Added rule for composite schedules in case of multiple charging schedules [1002] .34  
   2.45.1.K15-ISO15118-2. 34  
   2.46. Page 259/260 - (2025-01) - K03 - Updated use case description and sequence diagram 35

2.47. Page 274/275/276/277 - (2025-01) - K11/K12 - Updated use case descriptions and sequence diagrams 37  
2.48. Page 278/279 - (2025-01) - K13 - Updated requirement preconditions. 39  
2.49. Page 279 - (2025-01) - K14 - Updated use case scenario description. 40  
2.50. Page 284 - (2025-09) - K16 use case description update 40  
2.50.1. Page 285 41  
2.51. Page 292 - (2025-01) - Use case L01 - Added clarification to step 3 about when to start downloading the firmware . . . . . . 41  
2.52. Page 306 - (2025-01) - M. ISO 15118 Certificate Management 41  
2.53. Page 308 - (2025-01) - Update introduction sequence diagram ISO 15118 42  
2.54. Page 330 - (2025-01) - N03 Set Monitoring Base: Improved text of Remark 44  
2.55. Page 331 - (2025-01) - N03.FR.04: text improvement 44  
2.56. Page 350 - (2025-02) - 001 - Added missing requirements 44  
2.57. Page 446 - (2025-01) - ActiveNetworkProfile is incorrectly marked as optional 45  
2.58. Page 327 - (2025-09) - N01.FR.12 - Improved definition 45  
2.59. Page 328 - (2025-09) - N02: changed empty to absent. 45  
2.60. Page 453 - (2025-01) - References to monitorValue changed to value [354] 46  
2.61. Page 454 - (2025-01) - N04.FR.06 Improved limit definition of thresholds [353] 46  
2.62. Page 456 - (2025-02) - New configuration variable to allow TLS wildcard certificates. 46  
2.63. Page 458 - (2025-01) - Added optional variable to allow the Charging Station to report its supported idTokenTypes.... 47  
2.64. Page 462 - (2025-01) - Added note to EnergyTransfer description as TxStartPoint 47  
2.65. Page 467 - (2025-09) - Error in description of Associated data interval variables [1043] 47  
2.65.1. AlignedDataInterval 47  
2.65.2. AlignedDataTxEndInterval 48  
2.66. Page 476 - (2025-01) - Added Connector component to AvailabilityState referenced variable 48  
3. Part 3 49  
4. Part 4 50  
4.1. Page 6 - (2025-01) - 3.1.1. The connection URL 50  
4.2. Page 7-(2025-01)-3.1.2.OCPP version 50  
4.3. Page 8-(2025-01)-3.3.WebSocket Compression 50  
4.4. Page 10 - (2025-01) - 4.1.3. The message type 50  
4.5. Page 10 - (2025-01) - 4.1.3. The message type 50  
4.6. Page 10-(2024-09)-4.1.4.Message ID 51  
4.7. Page 13-(2025-01)-4.2.3.CALLERROR.. 51  
4.8. Page 15-(2025-01)-5.Connection. 51  
4.9. TLS fragment length 51  
4.10. Page 15 - (2025-01) - 5.3. WebSocket Ping in relation to OCPP Heartbeat. 52  
4.11. Page 15 - (2025-01) - 5 Connection - Added section about TLS fragment length 52  
4.12. Page 16 - (2025-04) - 5.3 Reconnecting - reset backoff wait timer 52  
4.13. Page 18 - (2025-02) - 6.3 Connection loss - Allow Local Controller to keep connection open 52  
5. Part 5 54  
5.1. General - (2025-02) - Renamed OCTT to Test System 54  
5.2. Page 7-48 - (2025-09) - Add additional support for different types of Charging Stations 54  
5.3. Page 7 - (2025-02) - Changed definition of C-01 Support for offline authorization of transactions. 54  
5.4. Page 9 - (2024-11) - Optional feature list for charging station - Change name R-3 55  
5.5. Page 9 - (2025-02) - Optional feature list for charging station - Added AQ-10 to make TC_N_48_CS conditional . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .  
5.6. Page 9/11/27/48/52 - (2025-02) - Removed feature ISO-3, added additional question AQ-11 55  
5.7. Page 9/10 - (2025-06) - Optional feature list for charging station & CSMS - Add optional feature for Security Profile 1 . . . . 56  
5.8. Page 13 - (2025-09) - Added TC_B_14_CS (as optional) to the Core profile 57  
5.9. Page 13 - (2025-02) - Updated Id's of the additional questions of CSMSs in the appendix 57  
5.10. Page 15 - (2025-04) - Addition of new testcase for CSMS to test WebSocket Subprotocol negotiation 57  
5.11. Page 17/33 - (2025-02) - Test Cases Local Authorization List Management & Authorization Cache - Update conditions.. . 57  
5.12. Page 19 - (2024-09) - TC_E_04_CS Updated condition for test case to exclude it for MacAddress and ISO 15118 PnC . . . 61  
5.13. Page 22 - (2024-09) - TC_E_17_CS Updated condition for test case to correctly specify the applicable TxStopPoint combinations 61  
5.14. Page 33 - (2025-06) - Fixed incorrect feature no reference 62  
5.15. Page 39 - (2025-02) - TC_N_48_CS Made conditional 62  
5.16. Page 40 - (2024-11) - TC_H_13_CS Updated invalid condition for test case 62  
5.17. Page 42 - (2025-02) - Removed TC_O_15_CS from certification program 63  
5.18. Test Cases Advanced User Interface 63  
5.19. Page 42 - (2025-06) - Make optional feature R-1 available for Charging Stations 63
5.20. Page 44 - (2025-02) - Removed TC_A_13_CS and TC_A_13_CSMS from certification program 64  
5.21. Page 48 - (2024-06) - Added additional questions to appendix 64  
5.22. Page 48 - (2025-02) - Updated Id's of the additional questions for CSMSs in the appendix. 64  
5.23. Page 48 - (2025-04) - Duplicate AQ-11 id 65

6. Part 6 66

6.1. General 66

6.1.1. Page XX - (2024-11) - All testcases - Updated table structure of all testcases 66  
6.1.2. Page XX - (2025-02) - Renamed OCTT to Test System 66

6.2. Charging Station 66

6.2.1. Page 4 - (2025-02) - TC_A_01_CS - Updated old identifierString reference in description. 66  
6.2.2. Page 7 - (2024-11) - TC_A_05_CS - Successfully reconnecting after every failed connection attempt 66  
6.2.3. Page 7-(2025-02)-TC_A_05_CS 67  
6.2.4. Page 7 - (2025-04) - TC_A_05_CS - Updated before steps to take into account the AllowCSMSTLSWildcards variable 68  
6.2.5. Page 20 - (2025-02) - TC_A_23_CS - CSMS returns a CertificateSigned message for each request 68  
6.2.6. Page 22 - (2024-09) - TC_A_19_CS - Fixed references to ConfigurationSlot [O20-4762]. 69  
6.2.7. Page 22 - (2025-06) - TC_A_19_CS - Added steps to validate the Charging Station does not downgrade back to security profile 1. 70  
6.2.8. Page 24 - (2025-02) - TC_A_20_CS - Testcase did not take into account that the used configuration slot could already be set. 72  
6.2.9. Page 24 - (2025-04) - TC_A_20_CS - SetNetworkConnectionProfile is allowed to be rejected . 73  
6.2.10. Page 25 - (2025-02) - TC_A_21_CS. 73  
6.2.11.Page 26-(2025-02)-TC_A_22_CS. 74  
6.2.12. Page 51 - (2025-02) - TC_B_16_CS - Correctly validate result of reading WriteOnly component variables. 74  
6.2.13. Page 56 - (2024-09) - TC_B_20_CS - Added check on omitting evseld [4390] 75  
6.2.14. Page 57 - (2024-09) - TC_B_21_CS - Added check on omitting evseld [4390] 75  
6.2.15. Page 58 - (2024-09) - TC_B_22_CS - Added check on omitting evseld [4390] 76  
6.2.16. Page 63 - (2025-02) - Changed reset to Immediate 76  
6.2.17. Page 72-81 - (2025-04) - TC_B_45_CS & TC_B_46_CS & TC_B_47_CS & TC_B_49_CS & TC_B_50_CS & TC_A_19_CS - Clarified NetworkProfile configurationSlot usage 76  
6.2.18. Page 72-81 - (2025-06) - TC_B_45_CS & TC_B_46_CS & TC_A_19_CS - ResetRequest will always be sent by the Test System to ensure the Charging Station switches NetworkProfile 80  
6.2.19. Page 85 - (2025-04) - TC_B_53_CS - Check if all required values are provided. 81  
6.2.20. Page 89 - (2025-02) - Add setting of NetworkProfileConnectionAttempts 81  
6.2.21. Page 89/621 - (2025-04) - Addition of new testcase for CSMS to test WebSocket Subprotocol negotiation . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .  
6.2.22. Page 117/141 - (2025-02) - Added remote support for Authorization Cache & Local Authorization List testcases . . 82  
6.2.23. Page 101 - (2025-04) - TC_C_14_CS - Fixing invalid component variable reference 83  
6.2.24. Page 102 - (2025-04) - TC_C_15_CS - Fixing invalid component variable reference 84  
6.2.25. Page 104-(2025-04)-TC_C_16_CS-Fixing invalid component variable reference 84  
6.2.26. Page 105 - (2025-04) - TC_C_17_CS - Fixing invalid component variable reference 84  
6.2.27. Page 108 - (2025-04) - TC_C_18_CS - Fixing invalid component variable reference 84  
6.2.28. Page 120 - (2025-04) - TC_C_34_CS - Making use of the Deauthorized reusable state. 84  
6.2.29. Page 128 - (2025-04) - TC_C_41_CS - Fixing invalid component variable reference 85  
6.2.30. Page 134 - (2025-04) - TC_C_44_CS - Fixing invalid component variable reference 85  
6.2.31. Page 137 - (2025-04) - TC_C_46_CS - Fixing invalid component variable reference 85  
6.2.32. Page 138 - (2024-09) - TC_C_47_CS - StoppedReason must be validated in Ended event [O20-4467] 85  
6.2.33. Page 145 - (2025-04) - TC_C_25_CS - Fixing invalid component variable reference 86  
6.2.34. Page 146 - (2024-11) - TC_C_26_CS - Allow StatusNotification status = Occupied. 86  
6.2.35. Page 147-153-(2025-04)-TC_C_50_CS,TC_C_51_CS,TC_C_52_CS,TC_C_53_CS,TC_C_54_CS,TC_C_55_CS - Always re-install V2G certificates 87  
6.2.36. Page 147-(2025-02)-TC_C_50_CS 87  
6.2.37. Page 148-(2025-02)-TC_C_51_CS 88  
6.2.38. Page 149-(2025-02)-TC_C_52_CS 88  
6.2.39. Page 150-(2025-02)-TC_C_53_CS 89  
6.2.40. Page 151 - (2024-09) - TC_C_54_CS - removed reusable state IdTokenCached [O20-3510] 90  
6.2.41. Page 151-(2025-02)-TC_C_54_CS 90  
6.2.42. Page 153-(2024-09)-TC_C_55_CS-removed reusable state IdTokenCached [O20-3510] 91  
6.2.43. Page 153-(2025-02)-TC_C_55_CS 91  
6.2.44. Page 165/169 - (2025-02) - TC_E_01_CS/TC_E_09_CS/TC_E_10_CS/TC_E_12_CS/TC_E_13_CS - Extended the

testcases until the Charging Station start charging 92  
6.2.45. Page 174 - (2025-04) - TC_E_17_CS - Aligned configuration before steps with updated prerequisites. 93  
6.2.46. Page 174 - (2024-09) - TC_E_17_CS - Updated prerequisite for test case to correctly specify the applicable TxStopPoint combinations. 94  
6.2.47. Page 176-(2024-11)-TC_E_39_CS-MissingStatusNotificationRequest/NotifyEventRequest. 94  
6.2.48. Page 182 - (2025-04) - TC_E_52_CS - Testcase is not able to determine the authorization is refused in case TxStartPoint is not Authorized. 95  
6.2.49. Page 185 - (2024-09) - TC_E_35_CS - StoppedReason must be validated in Ended event [O20-4467] 95  
6.2.50. Page 188 - (2025-02) - TC_E_22_CS - Stop transaction options - EnergyTransfer stopped - will end transaction . . . . . . 96  
6.2.51. Page 189 - (2025-06) - TC_E_14_CS - StoppedReason validation too strict for remote 96  
6.2.52. Page 199 - (2025-04) - TC_E_27_CS - Remove manual action between step 4/5. 97  
6.2.53. Page 204 - (2025-02) - TC_E_31_CS - Add steps for when running the testcase in Remote mode 97  
6.2.54. Page 214 - (2024-06) TC_E_43_CS Move reusable state TransactionEventsInQueueEnded to Before [768] 98  
6.2.55. Page 217 - (2025-04) - TC_E_46_CS - Testcase updated to use the specialized Authorized15118 reusable state . . . 99  
6.2.56. Page 221 - (2024-06) TC_F_04_CS Made mandatory in part 5, but prerequisite in part 6 was not updated .99  
6.2.57. Page 221 - (2025-02) TC_F_04_CS Prerequisite only if supported. 100  
6.2.58. Page 295 - (2024-09) - TC_J_XX_CS Meter Values 100  
6.2.59. Page 236 - (2025-02) - TC_F_19_CS - The testcase ends while the firmware update is still ongoing . 100  
6.2.60. Page 272 - (2025-02) - TC_H_08_CS Reserve an unspecified EVSE - Accepted 101  
6.2.61. Page 279/280 - (2025-06) - TC_H_15_CS & TC_H_16_CS can only be executed when the connector type of the Charging Station is part of the connectorEnumType. 102  
6.2.62. Page 282 - (2025-02) - TC_H_17_CS - made more explicit on what to validate 102  
6.2.63. Page 297 - (2025-02) - TC_J_02_CS Clock-aligned Meter Values - reporting multiple phases. 104  
6.2.64. Page 297 - (2024-09) - TC_J_02_CS Clock-aligned Meter Values 104  
6.2.65. Page 306 - (2024-06) - TC_J_10_CS - Remove reference to non-existing requirements [4697] 105  
6.2.66. Page 318 - (2025-04) TC_K_09_CS: Removed validFrom/To from test. 105  
6.2.67. Page 343 - (2025-04) TC_K_23_CS: Removed validFrom/To from test. 106  
6.2.68. Page 337 - (2025-04) TC_K_28_CS: Removed validFrom/To from test. 106  
6.2.69. Page 345 - (2025-02) TC_K_XX_CS: Use realistic values for composite schedules 107  
6.2.70. Page 345 - (2024-06) TC_K_35_CS Get Charging Profile - Evseld > 0 + chargingProfilePurpose [773] 108  
6.2.71. Page 352 - (2025-04) - TC_K_39_CS - Validation of scheduleStart 108  
6.2.72. Page 353 - (2025-04) - TC_K_40_CS: startSchedule improvements 109  
6.2.73. Page 355 - (2025-04) - TC_K_41_CS: startSchedule improvement 111  
6.2.74. Page 354/355 - (2025-02) - TC_K_40_CS & TC_K_41_CS - Updated composite schedule validation 112  
6.2.75. Page 355 - (2025-04) - TC_K_41_CS: Added missing EnergyTransferStarted reusable state. 114  
6.2.76. Page 359 - (2025-04) - TC_K_53_CS: Added missing validations. 115  
6.2.77. Page 360 - (2025-02) - TC_K_54_CS: EVConnected must be before Authorization 116  
6.2.78. Page 362 - (2025-02) - TC_K_56_CS: EVConnected must be before Authorization 117  
6.2.79. Page 364 - (2025-02) - TC_K_57_CS: EVConnected must be before Authorization 117  
6.2.80. Page 362 - (2024-09) - TC_K_56_CS Removed expecting triggerReason=ChargingRateChanged [776] 117  
6.2.81. Page 366-(2025-02)-TC_K_58_CS 118  
6.2.82. Page 384 - TC_L_10_CS - Allow Download/InstallationFailed upon AcceptedCanceled 118  
6.2.83. Page 387 - TC_L_06_CS - SecurityEventNotification and FirmwareStatusNotification can be sent in any order.... 119  
6.2.84. Page 422 - (2025-02) - TC_M_15_CS - V2GCertificateChain is not installed before being retrieved . 120  
6.2.85. Page 430 - (2025-06) - TC_M_24_CS - A GetCertificateStatusRequest is also sent for the subCAs 120  
6.2.86. Page 436 - (2025-02) - TC_N_01_CS - Made used component variable configurable 121  
6.2.87. Page 455 - (2025-02) - TC_N_12_CS - Updating test case for using configuration variables 121  
6.2.88. Page 456 - (2025-02) - TC_N_13_CS - Updating test case for using more specific configuration variables. 123  
6.2.89. Page 463 - (2025-02) TC_N_20_CS - Updating test case for using more specific configuration variables. 125  
6.2.90. Page 468 - (2024-06) TC_N_23_CS Offline Notification - OfflineMonitoringEventQueuingSeverity set higher than severityLevel of the monitor [772]. 128  
6.2.91. Page 470 - (2024-09) - TC_N_24_CS - Referring to incorrect use case and requirements [O20-4793] 129  
6.2.92. Page 492 - (2025-02) - TC_N_39_CS - Test case now searches suitable variables to do test with .130  
6.2.93. Page 472 - (2024-12) - TC_N_26_CS - Made test case more explicit and more time before ending . 132  
6.2.94. Page 470 - (2024-12) - TC_N_24_CS - Test case now searches suitable variable to do test with 133  
6.2.95. Page 470 - (2025-02) - TC_N_24_CS - Updating test case for using more specific configuration variables. 135  
6.2.96. Page 482 - (2025-02) - TC_N_63_CS - Clear Customer Information - add manual action to stop session 136  
6.2.97. Page 487 - (2025-04) - TC_N_36_CS - LogStatusNotification(AcceptedCanceled) allowed before GetLogResponse. 137

6.2.98. Page 482 - (2025-04) - TC_N_63_CS - Added missing reusable state EnergyTransferStarted at before steps . . . . . . 138  
6.2.99. Page 493 - (2024-09) - TC_N_41_CS - Set Variable Monitoring - Return to FactoryDefault. 139  
6.2.100. Page 482 - (2024-09) - TC_N_63_CS - Clear Customer Information - Clear and report - customerCertificate....... 139  
6.2.101. Page 482 - (2025-02) - TC_N_63_CS - Added missing configuration state and authorize explicit using Plug and Charge (PnC). 140  
6.2.102. Page 493 - (2024-09) - TC_N_41_CS - Set Variable Monitoring - Return to FactoryDefault. 141  
6.2.103. Page 493 - (2025-02) - TC_N_41_CS - Made less dependent on test case configuration variables, enables predefines monitors 141  
6.2.104. Page 495 - (2024-11) - TC_N_43_CS - Remove incorrect tool validation StatusInfo 145  
6.2.105. Page 495 - (2025-02) - TC_N_43_CS - Updating test case for using more specific configuration variables . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .  
6.2.106. Page 497 - (2025-02) - TC_N_45_CS - Updating test case for using more specific configuration variables . . . . . . 148  
6.2.107. Page 501 - (2025-02) - TC_N_51_CS - Updating test case for using more specific configuration variables . . . . . . . 150  
6.2.108. Page 503 - (2025-02) - TC_N_52_CS - Updating test case for using more specific configuration variables . . . . . . . 152  
6.2.109. Page 504 - (2025-02) - TC_N_53_CS - Updating test case for using more specific configuration variables . . . . . . . 154  
6.2.110. Page 505 - (2025-02) - TC_N_56_CS - Made test case configurable using configuration variables 155  
6.2.111. Page 506 - (2025-06) - TC_O_XX_CS - Updated configurations 156  
6.2.112. Page 520 - (2025-02) - TC_O_15_CS - Test case removed 160  
6.2.113. Page 530 - (2025-02) - TC_O_28_CS - Transaction id should be specified for DisplayMessage 160  
6.2.114. Page 533 - (2025-02) - TC_O_32_CS - Made notes about display behaviour more explicit. 160  
6.2.115. Page 544 - (2025-02) - TC_O_39_CS - Wait for StatusNotificationRequest or NotifyEventRequest. 161  
6.2.116. Page 555 - (2024-11) - Remove StatusNotificationRequest from Authorized reusable state Main B steps. 164  
6.2.117. Page 560 - (2025-04) - Reusable states StopAuthorized & Deauthorized. 164  
6.2.118.Deauthorized 166  
6.2.119. Page 566 - (2025-02) - Reusable state RenegotiateChargingLimits 166  
6.2.120. Page 573/151 - (2025-04) - Removed Main steps B from IdTokenCached reusable state and added IdTokenCached15118 167  
6.2.121. Page 574 - (2025-04) - IdTokenLocalAuthList memory state - set Enable to true if implemented 169  
6.2.122. Page 575 - (2024-09) - Reusable state RenewChargingStationCertificate expects a reconnection [784]. 169  
6.2.123. Page 575 - (2025-02) - Reusable state RenewChargingStationCertificate must not do a Reset [5281] . 170

6.3.CSMS 172

6.3.1. Page 593 - (2025-04) - TC_A_11_CSMS - Added post scenario validation for clarification. 172  
6.3.2. Page 593 - (2024-09) - TC_A_11_CSMS - Reconnect using new client certificate 172  
6.3.3. Page 596 - (2024-09) - TC_A_14_CSMS - Update Charging Station Certificate by request of CSMS - Invalid certificate 172  
6.3.4. Page 597 - (2025-04) - TC_A_19_CSMS - Added main steps and clarified tool validations 173  
6.3.5. Page 597 - (2024-09) - TC_A_19_CSMS - Added additional information regarding the use of the client certificates . 174  
6.3.6. Page 597 - (2024-09) - TC_A_19_CSMS - Removed validation of OcppCsmsUrl [O20-4355] 175  
6.3.7. Page 637 - (2024-11) - TC_C_50_CSMS - Changed reference to configured valid idToken to a specific eMAID idToken. 175  
6.3.8. Page 639 - (2024-09) - TC_C_52_CSMS - TC does not use <Configured contract_certificates> 176  
6.3.9. Page 639 - (2025-02) - TC_C_52_CSMS - Certificate needs at least one subCA 176  
6.3.10. Page 640 - (2025-04) - TC_D_01_CSMS - Missing tool validation that the idTokenInfo must be provided for all list entries. 177  
6.3.11. Page 712 - (2024-09) - TC_I_01_CSMS - Show EV Driver running total cost 177  
6.3.12. Page 715 - (2025-02) - TC_I_02_CSMS - Added explicit information about CSMS tariff configuration and sending in needed metervalues 178  
6.3.13. Page 726-760 - (2025-04) - TC_K_XX_CSMS - Improved tool validations to be sure valid Charging Profiles are used 179  
6.3.14. Page 728 - (2024-09) - TC_K_03_CSMS - Not requiring validFrom/To fields in charging profile [O20-4592] and chargingProfileKind must be Absolute [O20-4591]. 186  
6.3.15. Page 733 - (2024-09) - TC_K_10_CSMS - Not requiring validFrom/To fields in charging profile [O20-4592] . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .  
6.3.16. Page 734 - (2024-09) - TC_K_15_CSMS - Not requiring validFrom/To fields in charging profile [O20-4592] . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .  
6.3.17. Page 752 - (2025-06) - TC_K_53_CSMS - Validate that the CSMS let's the Charging Station charging, according to the negotiated limits. 188  
6.3.18.Page 753-(2024-09)-TC_K_55_CSMS,TC_K_57_CSMS,TC_K_58_CSMS,TC_K_59_CSMS Removed triggerReason $=$ ChargingRateChanged [776] 188  
6.3.19. Page 760 - (2024-11) - TC_K_70_CSMS - Updated tool validation chargingProfiles and added preparation step. . . 188  
6.3.20. Page 805/806 - (2025-06) - TC_N_01_CSMS & TC_N_02_CSMS - omit filter fields that are not tested 189  
6.3.21. Page 806 - (2025-06) - TC_N_02_CSMS - component and variable instance need to be omitted 190

6.3.22. Page 824 - (2025-04) - TC_N_62_CSMS - Check only single identifier is provided. 190  
6.3.23. Page 830 - (2024-11) - TC_N_46_CSMS - Updated tool validation sendLocalListRequest 191  
6.3.24. Page 830 - (2025-02) - TC_N_46_CSMS - Aligning configuration variable usage. 191  
6.3.25. Page 854 - (2025-02) - TC_O_27_CSMS - Fixing validations to be more specific for test case 193  
6.3.26. Page 855 - (2025-02) - TC_O_28_CSMS - Fixing validations to be more specific for test case 193

# Disclaimer

Copyright © 2010 - 2025 Open Charge Alliance. All rights reserved.

This document is made available under the _Creative Commons Attribution-NoDerivatives 4.0 International Public License_ (https://creativecommons.org/licenses/by-nd/4.0/legalcode).

Version History

<table><tr><td>Version</td><td>Date</td><td>Description</td></tr><tr><td>2025-09</td><td>2025-09-30</td><td>Includes errata for Part 1, 2, 4, 5 and 6 of OCPP 2.0.1 Edition 3.</td></tr><tr><td>2025-06</td><td>2025-07-08</td><td>Includes errata for Part 2, 5 and 6 of OCPP 2.0.1 Edition 3.</td></tr><tr><td>2025-04</td><td>2025-04-30</td><td>Includes errata for Part 2, 5 and 6 of OCPP 2.0.1 Edition 3.</td></tr><tr><td>2025-02</td><td>2025-03-06</td><td>Includes errata for Part 2, 5 and 6 of OCPP 2.0.1 Edition 3.</td></tr><tr><td>2025-01</td><td>2025-01-23</td><td>Includes errata for Part 1-4 of OCPP 2.0.1 Edition 3</td></tr><tr><td>2024-11</td><td>2024-11-14</td><td>Includes errata for Part 5 and Part 6 of OCPP 2.0.1 Edition 3</td></tr><tr><td>2024-09</td><td>2024-09-25</td><td>Includes errata for Part 4, Part 5 and Part 6 of OCPP 2.0.1 Edition 3</td></tr><tr><td>2024-06</td><td>2024-06-27</td><td>Includes errata for Part 5 and Part 6.</td></tr></table>

# Scope

This document contains errata on the OCPP 2.0.1 documentation. These errata have to be read as an addition to the release of OCPP 2.0.1 Edition 3.

The errata do not affect any schemas of OCPP messages. Certain errata do contain changes to requirements or even new requirements, but only in cases where a requirement contains an obvious error and would not or could not be implemented literally. New requirements are only added when they were already implicitly there. These changes have been discussed in or were proposed by the Technology Working Group of the Open Charge Alliance.

The appendices of the OCPP specification can be updated without requiring a new OCPP release. This mainly concerns the components and variables of the OCPP device model, which can be extended with new components or variables, as long as they are optional.

# Terminology and Conventions

Bold: when needed to clarify differences, bold text might be used.

The errata entries are sorted by page number of the affected section of the specification document. When an errata entry affects multiple parts of the specification, then the various changes are grouped together with subsections referring to the pages affected by those changes.

This is version 2025-09 of the errata. The errata of this version are marked with "(2025-09)" in the section title.

In some cases the issue number by which it was reported, is added in square brackets at the end of the section title, e.g. "[349]". For retrieval of the issue in the issue tracking system prefix the number with "OCPP20M", like "[OCPP20M-349]".

# 0. Part 0

Currently no new errata for OCPP 2.0.1 Edition 3 part 0.

# 1. Part 1

# 1.1. Page 9 - (2025-01) - 3.4. Monitoring

The first sub-bullit is further clarified that it refers to the absolute difference:

<table><tr><td></td><td>Description</td></tr><tr><td>Old</td><td>When thedataType of the variable is integer or decimal, this value represents the difference to be reached to trigger the monitor.</td></tr><tr><td>New</td><td>When thedataType of the variable is integer or decimal, this value represents the absolute difference to be reached to trigger the monitor.</td></tr></table>

# 2. Part 2

# 2.1. Page 5 - (2025-01) - Updated limitations on BasicAuthPassword to increase security

A "passwordString" should not be limited to any set of symbols as this limits its security greatly. There is also no reason for limiting the password size.

Table 1. Primitive Datatypes

<table><tr><td>Datatype</td><td>Description</td></tr><tr><td>passwordString</td><td>This is a UTF-8 encoded case-sensitive string. that can only contain characters from the following character set: &quot;a-z&quot;, &quot;A-Z&quot;, &quot;0-9&quot; or any of the following limited set of symbols: * - - : + | @ -</td></tr></table>

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Old text</td><td>A00.FR.205</td><td></td><td>The password SHALL be stored in the BasicAuthPassword configuration variable. It SHALL be a randomly chosen passwordString with a sufficiently high entropy, consisting of minimum 16 and maximum 40 characters (alpha-numeric characters and the special characters allowed by passwordString). The password SHALL be sent as a UTF-8 encoded string (NOT encoded into octet string or base64).</td></tr><tr><td>New text</td><td>A00.FR.205</td><td></td><td>The password SHALL be stored in the BasicAuthPassword configuration variable. It SHALL be a randomly chosen passwordString with a sufficiently high entropy, consisting of minimum 16 and a maximum as defined by the maxLimit of configuration variable BasicAuthPassword , which must be at least 40 characters and at most 64. The password SHALL be sent as a UTF-8 encoded string (NOT encoded into octet string or base64).</td></tr><tr><td>Old text</td><td>A00.FR.304</td><td>A00.FR.302</td><td>The password SHALL be stored in the BasicAuthPassword Configuration Variable. It SHALL be a randomly chosen passwordString with a sufficiently high entropy, consisting of minimum 16 and maximum 40 characters (alpha-numeric characters and the special characters allowed by passwordString). The password SHALL be sent as a UTF-8 encoded string (NOT encoded into octet string or base64). (Same as A00.FR.205)</td></tr><tr><td>New text</td><td>A00.FR.304</td><td>A00.FR.302</td><td>The password SHALL be stored in the BasicAuthPassword Configuration Variable. It SHALL be a randomly chosen passwordString with a sufficiently high entropy, consisting of minimum 16 and a maximum as defined by the maxLimit of configuration variable BasicAuthPassword , which must be at least 40 characters and at most 64. The password SHALL be sent as a UTF-8 encoded string (NOT encoded into octet string or base64). (Same as A00.FR.205)</td></tr></table>

# BasicAuthPassword

The basic authentication password is used for HTTP Basic Authentication. The configuration value is write-only, so that it cannot be accidentally stored in plaintext by the CSMS when it reads out all configuration values.

<table><tr><td>Required</td><td colspan="3">no</td></tr><tr><td>Component</td><td>componentName</td><td colspan="2">SecurityCtrlr</td></tr><tr><td rowspan="4">Variable</td><td>variableName</td><td colspan="2">BasicAuthPassword</td></tr><tr><td>variableAttributes</td><td>mutability</td><td>WriteOnly</td></tr><tr><td rowspan="2">variableCharacteristics</td><td>dataType</td><td>string</td></tr><tr><td>maxLimit</td><td>At least 40, at most 64.</td></tr><tr><td>Description</td><td>The basic authentication password is used for HTTP Basic Authentication. The password SHALL be a randomly chosen passwordString with a sufficiently high entropy, consisting of minimum 16 and a maximum as defined by the maxLimit of BasicAuthPassword , which must be at least 40 characters and at most 64. The password SHALL be sent as a UTF-8 encoded string (NOT encoded into octet string or base64). This configuration variable is write-only, so that it cannot be accidentally stored in plaintext by the CSMS when it reads out all configuration variables. This configuration variable is required unless only "security profile 3 - TLS with client side certificates" is implemented.</td></tr></table>

# 2.2. Page 14 - (2025-04) - Section 2.7. ISO 15118 support - Alligned ISO 15118 timeout table with updated version in OCPP 2.1

For reference, the current timing constraints for ISO 15118-2:2014 are:

Table 2. ISO 15118-2 Timing constrains

<table><tr><td>Timeout</td><td>Default</td></tr><tr><td>Sequence Timeouts</td><td>60 seconds</td></tr><tr><td>Sequence Performance Timeouts</td><td>40 seconds</td></tr><tr><td>PaymentDetailsReq/Res</td><td>4.5 seconds</td></tr><tr><td>AuthorizationReq/Res</td><td>1.5 seconds</td></tr><tr><td>CertificateUpdateReq/Res</td><td>4.5 seconds</td></tr><tr><td>CertificateInstallationReq/Res</td><td>4.5 seconds</td></tr></table>

# 2.3. Page 15 - (2025-01) - Improved text FR.04

The requirement did not take into account the pending status and should refer to the applicable use cases B02 and B03.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old text</td><td>FR.04</td><td>When the CSMS did not accept the BootNotificationRequest from the Charging Station AND The Charging Station sends a message other than BootNotificationRequest</td><td>The CSMS SHALL respond with a RPC Framework: CALLERROR:SecurityError.</td><td></td></tr><tr><td>New text</td><td>FR.04</td><td>When the CSMS rejected the BootNotificationRequest from the Charging Station AND The Charging Station sends a message other than BootNotificationRequest</td><td>The CSMS SHALL respond with a RPC Framework: CALLERROR:SecurityError.</td><td>See use cases B0 2 and B03 for details.</td></tr></table>

# 2.4. Page 19 - (2025-01) - Removed requirement A00.FR.003 as the precondition never occurs

Requirement A00.FR.003 describes a precondition that never occurs in which the CSMS connects to the Charging Station. The requirement is therefore removed.

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>A00.FR.003</td><td>If the CSMS tries to connect with a different profile than the Charging Station is using</td><td>The Charging Station SHALL terminate the connection.</td></tr></table>

# 2.5. Page 19/41 - (2025-01) - Allow downgrading security profile from 3 to 2

For migration purposes a Charging Station implementer has now the option for their Charging Stations to allow downgrading the security profile from 3 to 2, because not all CSMSs support security profile 3. ENCS was consulted to identify if this would pose any security risks. This was not the case as security profile 2 still uses TLS, which provides sufficient security.

Table 3. A05 - Upgrade Charging Station Security Profile

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Upgrade Charging Station Security Profile</td></tr><tr><td>2</td><td>ID</td><td>A05</td></tr><tr><td></td><td>Functional block</td><td>A. Security</td></tr><tr><td>3</td><td>Objective(s)</td><td>The CSO wants to increase change the security of the OCPP connection between CSMS and a Charging Station.</td></tr><tr><td>4</td><td>Description</td><td>Use case when migrating from OCPP 1.6 without security profiles to OCPP 2.0.1. Before migrating to a security profile, the prerequisites, like installed certificates or password, need to be configured.</td></tr><tr><td></td><td>Actors</td><td>CSMS, Charging Station</td></tr><tr><td></td><td>Scenario description</td><td>1. The CSMS sets a new value for the NetworkConfigurationPriority Configuration Variable via SetVariablesRequest, such that the NetworkConnectionProfile for the new (higher) security profile becomes first in the list and the existing connection profile becomes second in the list.
2. The Charging Station responds with a SetVariablesResponse with status Accepted
3. The CSMS sends a ResetRequest(OnIdle)
4. The Charging Station reboots and connects via the new primary NetworkConnectionProfile</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>The CSO ensures that a NetworkConnectionProfile has been set using (higher) an allowed security profile AND that the prerequisite(s) for going to a higher the new security profile are met before sending the command to change to a higher the new security profile.</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>The Charging Station was successfully upgraded to a higher new security profile.</td></tr><tr><td>7</td><td>Error handling</td><td>n/a</td></tr><tr><td>8</td><td>Remark(s)</td><td>For security reasons it is by default not allowed to revert to a lower Security Profile using OCPP.
Only when the variable AllowSecurityProfileDowngrade is implemented and is set to true, it is allowed to downgrade from profile 3 to profile 2. Even in that case, it is not allowed to revert from profile 2 or profile 3 to security profile 1 using OCPP.</td></tr></table>

Changed A00 requirement:

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Old text</td><td>A00.FR.005</td><td></td><td>Lowering the security profile that is used, to a less secure profile, is for security reasons, not part of the OCPP specification, and MUST be done through another method, not via OCPP. OCPP messages SHALL NOT be used for this (e.g. SetVariablesRequest or DataTransferRequest).</td></tr><tr><td>New text</td><td>A00.FR.005</td><td></td><td>Lowering the security profile that is used, to a less secure profile, is for security reasons, not recommended.The Charging Station SHALL only allow to lower the security profile if the variable AllowSecurityProfileDowngrade is implemented and set to true . In that case, the Charging Station SHALL only allow to downgrade from profile 3 to profile 2. The Charging Station SHALL NOT allow to downgrade from profile 2 or profile 3 to profile 1 using the OCPP protocol.</td></tr></table>

Added A05 requirements:

Changed/added B09 requirements:

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>New requirement</td><td>A05.FR.08</td><td>The variableAllowSecurityProfileDowngrade is implemented and set to true ANDThe currently active‘SecurityProfile&#x27; is 3 ANDThe Charging Station receives SetVariablesRequest for NetworkConfigurationPriority containing profile slots for NetworkConnectionProfiles with a &#x27;securityProfile&#x27; value equal to 2.</td><td>The Charging Station SHALL respond with SetVariablesResponse (Accepted)</td></tr><tr><td>New requirement</td><td>A05.FR.09</td><td>The variableAllowSecurityProfileDowngrade is implemented and set to true ANDThe currently active‘SecurityProfile&#x27; is higher than 1 ANDThe Charging Station receives SetVariablesRequest for NetworkConfigurationPriority containing profile slots for NetworkConnectionProfiles with a &#x27;securityProfile&#x27; value equal to 1.</td><td>The Charging Station SHALL respond with SetVariablesResponse (Rejected)</td></tr><tr><td>New requirement</td><td>A05.FR.10</td><td>The variableAllowSecurityProfileDowngrade is not implemented or implemented and set to false ANDThe Charging Station receives SetVariablesRequest for NetworkConfigurationPriority containing profile slots for NetworkConnectionProfiles with a &#x27;securityProfile&#x27; value lower than the currently active security profile</td><td>The Charging Station SHALL respond with SetVariablesResponse (Rejected)</td></tr></table>

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Old text</td><td>B09.FR.04</td><td>On receipt of the SetNetworkProfileRequest AND the NetworkConnectionProfile contains a lower securityProfile than stored at the configuration variable SecurityProfile</td><td>The Charging Station SHALL respond by sending a SetNetworkProfileResponse message, with status Rejected</td></tr><tr><td>New text</td><td>B09.FR.04</td><td>The variable AllowSecurityProfileDowngrade is not implemented or implemented and set to false AND The Charging Station receives a SetNetworkProfileRequest AND the NetworkConnectionProfile contains a lower securityProfile than the currently active security profile</td><td>The Charging Station SHALL respond by sending a SetNetworkProfileResponse message, with status Rejected</td></tr><tr><td rowspan="2">New requirement</td><td rowspan="2">B09.FR.31</td><td>The variable
AllowSecurityProfileDowngrade is implemented and set to true</td><td rowspan="2">The Charging Station SHALL respond with SetVariablesResponse (Accepted)</td></tr><tr><td>AND
The currently active
'SecurityProfile' is 3 AND
The Charging Station receives a 
SetNetworkProfileRequest AND 
the NetworkConnectionProfile 
contains a securityProfile with a 
value of 2.</td></tr><tr><td rowspan="3">New requirement</td><td rowspan="3">B09.FR.32</td><td>The variable
AllowSecurityProfileDowngrade is implemented and set to true</td><td rowspan="3">The Charging Station SHALL respond with 
SetVariablesResponse (Rejected)</td></tr><tr><td>AND
The currently active
'SecurityProfile' is higher than 1</td></tr><tr><td>AND
The Charging Station receives a 
SetNetworkProfileRequest AND 
the NetworkConnectionProfile 
contains a securityProfile with a 
value of 1.</td></tr></table>

Added referenced variable:

AllowSecurityProfileDowngrade

<table><tr><td>Required</td><td colspan="3">no</td></tr><tr><td>Component</td><td>componentName</td><td colspan="2">SecurityCtrlr</td></tr><tr><td rowspan="3">Variable</td><td>ijklname</td><td colspan="2">AllowSecurityProfileDowngrade</td></tr><tr><td>ijklattributes</td><td>mutability</td><td>ReadWrite/ReadOnly</td></tr><tr><td>ijklcharacteristics</td><td>dataType</td><td>boolean</td></tr><tr><td>Description</td><td colspan="3">If this variable is implemented and set to true, then the Charging Station allows downgrading the security profile from 3 to 2.
For security reasons it is not allowed to revert from profile 2 or profile 3 to security profile 1 using OCPP.</td></tr></table>

# 2.6. Page 26 - (2025-01) - 1.3.7. TLS with Client Side Certificates Profile - Requirements

A new requirement is added to support A00.FR.429:

New requirement

Table 4. Security Profile 3 - TLS with Client Side Certificates - Requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>A00.FR.430</td><td>If the Charging Station certificate has expired</td><td>The Charging Station SHOULD still attempt to establish a connection with the CSMS and leave the decision to accept the connection up to the CSMS.</td></tr></table>

# 2.7. Page 28 - (2025-01) - Certificate Hierarchy

A note has been added to the specification to warn OCPP implementers about the potential risks involved with the installation of CA bundles.

# 2.8. Page 31 - (2025-01) - A02/A03 - Updated error handling

NOT RECOMMENDED in the error handling is confusing as there is already a requirement that explicitly states that the Charging Station SHALL retry after "CertSigningWaitMinimum".

<table><tr><td>7</td><td>Error handling</td><td>The CSMS accepts the CSR request from the Charging Station, before forwarding it to the CA. But when the CA cannot be reached, or rejects the CSR, the Charging Station will never be known. The CSMS may do some checks on the CSR, but cannot do all the checks that a CA does, and it does not prevent connection timeout to the CA. When something like this goes wrong, either the CA is offline or the CSR send by the Charging Station is not correct, according to the CA. In both cases this is something an operator at the CSO needs to be notified of. The operator then needs to investigate the issue. When resolved, the operator can re-run A02. It is NOT RECOMMENDED to let the Charging Station retry when the certificate is not send within X minutes or hours. When the CSR is incorrect, that will not be resolved automatically. It is possible that only a new firmware will fix this.</td></tr></table>

# 2.9. Page 34 - (2025-01) - Disallow client certificates future validity date

Currently the specification is unclear on whether accepting client certificates with a future validity date is intended behavior. If it would be allowed behavior, several problems were identified. For example, there would be no way for the CSMS to manage these (ghost) client certificates using OCPP. ENCS was consulted if there would be any security risks when not allowing accepting client certificates with a future validity date. ENCS identified no security risks, therefore it was decided to not allow accepting client certificates with a future validity date. In addition clarifications have been made to describe how to handle non-happy flow scenarios in which the Charging Station is unable to successfully connect using the new client certificate in combination with the NetworkConnectionProfile mechanism described at use case B10.

Changed/added A02 requirements:

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old text</td><td>A02.FR.06</td><td></td><td>The Charging Station SHALL verify the validity of the signed certificate in the CertificateSignedRequest message, checking at least the period when the certificate is valid, the properties in Certificate Properties, and that it is part of the Charging Station Operator certificate hierarchy as described in Certificate Hierarchy.</td><td></td></tr><tr><td>New text</td><td>A02.FR.06</td><td></td><td>The Charging Station SHALL verify the validity of the signed certificate in the CertificateSignedRequest message, checking that the current date (at the time of the update) is within the certificate&#x27;s validity period, the properties in Certificate Properties, and that it is part of the Charging Station Operator certificate hierarchy as described in Certificate Hierarchy.</td><td>When providing a newly signed client certificate with a start period that equals the current time, the CSMS should take into account that there might be a slight discrepancy in the time between the Charging Station and CSMS. This could cause the Charging Station to reject the new certificate, because in case a small time difference exists, the validity period might (just) be in the future for the device.</td></tr><tr><td>Old text</td><td>A02.FR.08</td><td></td><td>The Charging Station SHALL switch to the new certificate as soon as the current date and time is after the &#x27;Not valid before&#x27; field in the certificate (e.g. by closing the websocket and TLS connection and reconnecting with the new certificate).</td><td></td></tr></table>

Changed/added A03 requirements:

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>New text</td><td>A02.FR.08</td><td>If the certificate is valid.</td><td>The Charging Station SHALL respond to the CertificateSignedRequest with status Accepted AND the Charging Station SHALL switch to the new certificate by reconnecting the websocket and TLS connection.</td><td></td></tr><tr><td>Old text</td><td>A02.FR.09</td><td>If the Charging Station contains more than one valid certificate of the ChargingStationCertificat e type.</td><td>The Charging Station SHALL use the newest certificate, as measured by the start of the validity period.</td><td></td></tr><tr><td>New text</td><td>A02.FR.09</td><td></td><td>&lt;Requirement removed&gt;</td><td></td></tr><tr><td>Old text</td><td>A02.FR.10</td><td>A02.FR.09 AND When the Charging Station has validated that the new certificate works</td><td>The Charging Station MAY discard the old certificate. It is RECOMMENDED to store old certificates for one month, as fallback.</td><td></td></tr><tr><td>New text</td><td>A02.FR.10</td><td>(A02.FR.08 OR A02.FR.28) AND The Charging Station successfully connected to the CSMS using either one of the certificates.</td><td>The Charging Station SHALL discard the client certificate that is NOT in use.</td><td>This is to prevent having multiple client certificates installed at the Charging Station, which the CSMS is unable to manage.</td></tr><tr><td>New requirement</td><td>A02.FR.28</td><td>A02.FR.08 AND the charging station was not able to successfully connect to any of the configured entries of NetworkConfigurati onPriority using the new certificate AND The Charging Station supports either one or both reconnection mechanisms described at requirements; B10.FR.07 and B10.FR.08.</td><td>The Charging Station SHALL for the reconnection mechanism described at B10.FR.07 fallback to the old client certificate AND for the reconnection mechanism described at B10.FR.08 alternate between using the old and new client certificate after all NetworkConfigurationPriority entries.</td><td>As described by requirement B10.FR.09, the Charging Station SHOULD NOT stop trying to reconnect to the CSMS. This is to prevent the Charging Station from becoming a stranded asset.</td></tr><tr><td>New requirement</td><td>A02.FR.29</td><td>A02.FR.10 AND The Charging Station discarded the new client certificate.</td><td>The Charging Station SHOULD send a SecurityEventNotification DiscardedRenewedClientCertificate to the CSMS.</td><td>Otherwise the CSMS is not aware that the Charging Station discarded the new client certificate and the CSMS should again trigger a client certificate renewal.</td></tr></table>

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old text</td><td>A03.FR.06</td><td></td><td>The Charging Station SHALL verify the validity of the signed certificate in the CertificateSignedRequest message, checking at least the period when the certificate is valid, the properties in Certificate Properties, and that it is part of the Charging Station Operator certificate hierarchy as described in Certificate Hierarchy. (Same as A02.FR.06)</td><td></td></tr><tr><td>New text</td><td>A03.FR.06</td><td></td><td>The Charging Station SHALL verify the validity of the signed certificate in the CertificateSignedRequest message, checking that the current date (at the time of the update) is within the certificate's validity period, the properties in Certificate Properties, and that it is part of the Charging Station Operator certificate hierarchy as described in Certificate Hierarchy. (Same as A02.FR.06)</td><td>When providing a newly signed client certificate with a start period that equals the current time, the CSMS should take into account that there might be a slight discrepancy in the time between the Charging Station and CSMS. This could cause the Charging Station to reject the new certificate, because in case a small time difference exists, the validity period might (just) be in the future for the device.</td></tr><tr><td>Old text</td><td>A03.FR.08</td><td></td><td>The Charging Station SHALL switch to the new certificate as soon as the current date and time is after the 'Not valid before' field in the certificate (e.g. by closing the websocket and TLS connection and reconnecting with the new certificate). (Same as A02.FR.08)</td><td></td></tr><tr><td>New text</td><td>A03.FR.08</td><td>If the certificate is valid.</td><td>The Charging Station SHALL respond to the CertificateSignedRequest with status Accepted AND the Charging Station SHALL switch to the new certificate by reconnecting the websocket and TLS connection. (Same as A02.FR.08)</td><td></td></tr><tr><td>Old text</td><td>A03.FR.09</td><td>If the Charging Station contains more than one valid certificate of the ChargingStationCertificate type.</td><td>The Charging Station SHALL use the newest certificate, as measured by the start of the validity period. (Same as A02.FR.09)</td><td></td></tr><tr><td>New text</td><td>A03.FR.09</td><td></td><td>&lt;Requirement removed&gt;</td><td></td></tr><tr><td>Old text</td><td>A03.FR.10</td><td>A03.FR09 AND When the Charging Station has validated that the new certificate works</td><td>The Charging Station MAY discard the old certificate. It is RECOMMENDED to store old certificates for one month, as fallback. (Same as A02.FR.10)</td><td></td></tr><tr><td>New text</td><td>A03.FR.10</td><td>(A03.FR.08 OR A03.FR.24) AND The Charging Station successfully connected to the CSMS using either one of the certificates.</td><td>The Charging Station SHALL discard the client certificate that is NOT in use. (Same as A02.FR.10)</td><td>This is to prevent having multiple client certificates installed at the Charging Station, which the CSMS is unable to manage.</td></tr><tr><td>New requirement</td><td>A03.FR.24</td><td>A03.FR.08 AND the charging station was not able to successfully connect to any of the configured entries of NetworkConfigurati onPriority using the new certificate AND The Charging Station supports either one or both reconnection mechanisms described at requirements; B10.FR.07 and B10.FR.08.</td><td>The Charging Station SHALL for the reconnection mechanism described at B10.FR.07 fallback to the old client certificate AND for the reconnection mechanism described at B10.FR.08 alternate between using the old and new client certificate after all NetworkConfigurationPriority entries. (Same as A02.FR.28)</td><td>As described by requirement B10.FR.09, the Charging Station SHOULD NOT stop trying to reconnect to the CSMS. This is to prevent the Charging Station from becoming a stranded asset.</td></tr><tr><td>New requirement</td><td>A03.FR.25</td><td>A03.FR.10 AND The Charging Station discarded the new client certificate.</td><td>The Charging Station SHOULD send a SecurityEventNotification DiscardedRenewedClientCertificate to the CSMS. (Same as A02.FR.29)</td><td>Otherwise the CSMS is not aware that the Charging Station discarded the new client certificate and the CSMS may need to trigger a new client certificate renewal.</td></tr></table>

Changed/added B10 requirements:

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old text</td><td>B10.FR.07</td><td>B10.FR.03 AND 
All 
NetworkProfileConn 
ctionAttempts for 
every entry of 
NetworkConfigurati 
onPriority failed.</td><td>The Charging Station SHOULD fallback and start 
&#x27;reconnecting&#x27; to the NetworkConnectionProfile for 
which the last successful connection was made.</td><td>&#x27;reconnecting&#x27; in this 
requirement, refers to the 
reconnection mechanism 
described at section 5.3. 
Reconnecting from &quot;Part 
4 - JSON over 
WebSockets 
implementation guide&quot;.</td></tr><tr><td>New text</td><td>B10.FR.07</td><td>B10.FR.09</td><td>The Charging Station SHOULD fallback and start 
&#x27;reconnecting&#x27; to the NetworkConnectionProfile for 
which the last successful connection was made.</td><td>&#x27;reconnecting&#x27; in this 
requirement, refers to the 
reconnection mechanism 
described at section 5.3. 
Reconnecting from &quot;Part 
4 - JSON over 
WebSockets 
implementation guide&quot;.</td></tr><tr><td>New requirement</td><td>B10.FR.08</td><td>B10.FR.09</td><td>The Charging Station SHOULD restart connecting 
with all configured entries of the 
NetworkConfigurationPriority</td><td></td></tr><tr><td>New requirement</td><td>B10.FR.09</td><td>B10.FR.03 AND 
All 
NetworkProfileConn 
ctionAttempts for 
every entry of 
NetworkConfigurati 
onPriority failed.</td><td>The Charging Station SHOULD NOT stop trying to 
reconnect to the CSMS. The Charging Station 
SHOULD implement either one or both reconnecting 
mechanisms described at requirements; B10.FR.07 
and B10.FR.08.</td><td>This is to prevent the 
Charging Station from 
becoming a stranded 
asset.</td></tr></table>

# 2.10. Page 58/60 - (2025-01) - Missing requirement information about omitting the value for WriteOnly variables

The specification does describe already that the value for WriteOnly variables need to be omitted, however this information is not part of a requirement yet.

Changed B07 requirement:

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old text</td><td>B07.FR.03</td><td>B07.FR.01</td><td>The Charging Station SHALL send the requested information via one or more NotifyReportRequest messages to the CSMS.</td><td>It is good practice to send the report data in as few messages as possible in order to limit data overhead.</td></tr><tr><td>New text</td><td>B07.FR.03</td><td>B07.FR.01</td><td>The Charging Station SHALL send the requested information, excluding the value of WriteOnly variables, via one or more NotifyReportRequest messages to the CSMS.</td><td>It is good practice to send the report data in as few messages as possible in order to limit data overhead.</td></tr></table>

Changed B08 requirement:

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Old text</td><td>B08.FR.03</td><td>B08.FR.01</td><td>The Charging Station SHALL send the requested information via one or more NotifyReportRequest messages to the CSMS.</td></tr><tr><td>New text</td><td>B08.FR.03</td><td>B08.FR.01</td><td>The Charging Station SHALL send the requested information, excluding the value of WriteOnly variables, via one or more NotifyReportRequest messages to the CSMS.</td></tr></table>

# 2.11. Page 63 - (2025-09) - B09.FR.02/04/05 - Added optional reasonCode

A mention of adding an optional reasonCode when a SetNetworkProfileRequest is rejected, has been added.

Changed requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>B09.FR.02</td><td>On receipt of the SetNetworkProfileRequest</td><td>The Charging Station SHALL validate the content. If the content is invalid, the Charging Station SHALL respond by sending a SetNetworkProfileResponse message, with status Rejected and optional statusInforeasonCode = &quot;InvalidNetworkConf&quot;</td><td>Matches B09.FR.34 for NetworkConfiguration.</td></tr><tr><td>B09.FR.04</td><td>The variable AllowSecurityProfileDowngrade is not implemented or implemented and set to false AND the Charging Station receives a SetNetworkProfileRequest AND the NetworkConnectionProfile contains a lower securityProfile than the currently active security profile</td><td>The Charging Station SHALL respond by sending a SetNetworkProfileResponse message, with status Rejected and optional statusInforeasonCode = &quot;NoSecurityDowngrade&quot;</td><td>Matches B09.FR.35 for NetworkConfiguration.</td></tr><tr><td>B09.FR.05</td><td>When the value of configurationSlot in SetNetworkProfileRequest does not match an entry in valuesList of NetworkConfigurationPriority</td><td>The Charging Station SHALL respond by sending a SetNetworkProfileResponse message with status Rejected with optional statusInforeasonCode = &quot;InvalidConfSlot&quot;</td><td></td></tr></table>

# 2.12. Page 64 - (2025-09) - B09.FR.31/31 - Improved definition

Requirement B09.FR.31 has been rephrased to reject downgrading from any security profile to profile 1, rather than allowing a downgrade from 3 to 2 and disallowing from 2 to 1. As a result B09.FR.32 has now been removed.

Changed requirements

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>B09.FR.31</td><td>The variableAllowSecurityProfileDowngrade isimplemented and set to true ANDThe currently active‘SecurityProfile' is 3 ANDThe Charging Station receives aSetNetworkProfileRequest ANDthe NetworkConnectionProfilecontains a securityProfile with a value of 2.</td><td>The Charging Station SHALL respond with SetVariablesResponse(Accepted)</td><td></td></tr><tr><td>New</td><td>B09.FR.31</td><td>The variableAllowSecurityProfileDowngrade isimplemented and set to true AND the currently active 'SecurityProfile' is higher than 1 AND the Charging Station receives a SetNetworkProfileRequest with a NetworkConnectionProfile with securityProfile = 1</td><td>The Charging Station SHALL respond with SetNetworkProfileResponse with statusRejected and optional statusInforeasonCode = "NoSecurityDowngrade"</td><td></td></tr><tr><td>Delete</td><td>B09.FR.32</td><td>The variableAllowSecurityProfileDowngrade isimplemented and set to true AND The currently active 'SecurityProfile' is higher than 1 AND The Charging Station receives a SetNetworkProfileRequest AND the NetworkConnectionProfile contains a securityProfile with a value of 1.</td><td>The Charging Station SHALL respond with SetVariablesResponse(Rejected)</td><td></td></tr></table>

# 2.13. Page 66 - (2025-04) - B10.FR.03/04/10 - Migrate to new NetworkConnectionProfile

Changed requirements

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>B10.FR.03</td><td>B10.FR.04 AND When connecting fails</td><td>The Charging Station SHALL make the number of attempts as configured in NetworkProfileConnectionAttempts per entry of NetworkConfigurationPriority.</td><td></td></tr><tr><td>New</td><td>B10.FR.03</td><td>After a reboot OR When connection to CSMS is lost</td><td>The Charging Station SHALL make the number of attempts as configured in NetworkProfileConnectionAttempts per entry of NetworkConfigurationPriority.</td><td></td></tr><tr><td>Old</td><td>B10.FR.04</td><td>B10.FR.01 OR B09.FR.01 AND After a reboot</td><td>The Charging Station SHALL begin connecting to the first entry of NetworkConfigurationPriority</td><td>Same as A05.FR.05</td></tr><tr><td>New</td><td>B10.FR.04</td><td>(B10.FR.01 OR B09.FR.01) AND After a reboot</td><td>The Charging Station SHALL begin connecting to the first entry of NetworkConfigurationPriority</td><td>Same as A05.FR.05</td></tr></table>

The following requirement is added to make explicit that a BootNotification must be sent, or else Charging Station might connect to a new CSMS without it, in which case CSMS would respond with a CALLERROR(SecurityEvent).

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>B10.FR.10 (new)</td><td>B10.FR.03 AND Charging Station successfully connected after having switched to a different NetworkConnectionProfile</td><td>Charging Station SHALL send a BootNotificationRequest to CSMS to reestablish its registration status, even if it has not rebooted since last being accepted by any CSMS.</td><td>Charging Station does not need to check whether the CSMS it connected to, is actually one that it has not connected to before.</td></tr></table>

# 2.14. Page 67 - (2025-06) - B11 - Clarify meaning of OnIdle for Reset

The "idle state" is defined in Terminology as: "In both use cases and sequence diagrams, Idle status is referred as the state in which a Charging Station is not performing any use case related tasks. Condition during which the equipment can promptly provide a primary function but is not doing so." This is a broader concept, than having an active transaction. A remark is added to the use case to explain that.

The sentence about persistent states and ResetResponse did not belong in Remarks section.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Reset - Without Ongoing Transaction</td></tr><tr><td>...</td><td>...</td><td></td></tr><tr><td>8</td><td>Remark(s)</td><td>Persistent states: for example, EVSE set to Unavailable SHALL persist. 
+ [line-through]#The Charging Station responds with ResetResponse. 
OnIdle refers to the &quot;idle state&quot; of a charging station. This is when the Charging Station is not performing any use case related tasks that might interfere with a reset process. The most obvious case is being involved in an active transaction, but there are other conditions when the Charging Station is not idle, for example, when a firmware update process is ongoing, a log file is uploaded to CSMS, a reservation is pending or a cable is still locked in the Charging Station.</td></tr></table>

# 2.15. Page 69 - (2025-01) - B11 - Reset without Ongoing Transaction - Requirements

The definition of B11.FR.06 has been improved:

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Old text</td><td>B11.FR.06</td><td>B11.FR.01ANDFor example there is a firmware update ongoing that cannot be interrupted.</td><td>The Charging Station SHALL respond with a status Rejected.</td></tr><tr><td>New text</td><td>B11.FR.06</td><td>B11.FR.01ANDCharging Station is at this moment not able to perform a reset</td><td>The Charging Station SHALL respond with a status Rejected.</td></tr></table>

# 2.16. Page 73 - (2025-01) - B12 - Reset with Ongoing Transaction - Requirements

The requirement B12.FR.04, 08 and added B12.FR.10 have been improved:

At the (2025-04) version, the old text requirement definitions have been corrected, because they already contained the revision instead of the original text from the edition 3 specification. In addition, requirement B12.FR.10 was newly added to edition 3, not updated.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Old text (Corrected in 2025-04)</td><td>B12.FR.04</td><td>If no evseld is supplied AND If any transaction is in progress and an Immediate Reset is received.</td><td>The Charging Station SHALL attempt to terminate any transaction in progress and send a TransactionRequest(eventType = Ended) message before performing a reboot.</td></tr><tr><td>New text</td><td>B12.FR.04</td><td>If no evseld is supplied AND If any transaction is in progress and an Immediate Reset is received.</td><td>The Charging Station SHALL attempt to terminate any transaction in progress and send a TransactionRequest(eventType = Ended) message with triggerReason = ResetCommand and transactionInfo.stoppedReason = ImmediateReset for each terminated transaction before performing a reboot.</td></tr><tr><td>Old text (Corrected in 2025-04)</td><td>B12.FR.08</td><td>If an evseld is supplied AND If a transaction is in progress on the EVSE and an Immediate Reset is received.</td><td>The Charging Station SHALL attempt to terminate the transaction in progress on the EVSE and send a TransactionEventRequest (eventType = Ended) message before performing a reset.</td></tr><tr><td>New text</td><td>B12.FR.08</td><td>If an evseld is supplied AND If a transaction is in progress on the EVSE and an Immediate Reset is received.</td><td>The Charging Station SHALL attempt to terminate the transaction in progress on the EVSE and send a TransactionEventRequest (eventType = Ended) message with triggerReason = ResetCommand and transactionInfo.stoppedReason = ImmediateReset before resetting the EVSE.</td></tr><tr><td>Added (Corrected in 2025-04)</td><td>B12.FR.10</td><td>B12.FR.02 AND Charging Station is at this moment not able to perform an Immediate reset for a reason other than the fact that a transaction is in progress</td><td>The Charging Station SHALL return a ResetResponse Rejected</td></tr></table>

# 2.17. Page 77 - (2025-01) - 1.6 Relationship between authorization and transaction

A new section has been added after 1.5 Unknown Offline Authorization

This section is informative.

The purpose of authorization is twofold. It ensures in the first place, that energy is only offered to a known user (represented by the idToken), which is essential for billing. In the second place, it ensures that only the user who was authorized in the first place (or a member of the same group of users) is allowed to unplug the cable. This is an important safeguard against cable theft in situations where the charging station does not have a fixed cable and the user brings its own charging cable.

Authorization and the duration of the authorization period are not strictly tied to a transaction: it is possible to have transactions without explicit authorization, e.g. in the case of a charging station that can be started with a push button. In that case one could say that there is a permanent authorization for anyone to charge.

The start of the authorization period:

- can take place before a transaction is started (e.g. when a cable is not yet connected), or
- can cause a transaction to be started (e.g. when authorization is defined as the start of a transaction by setting TxStartPoint = Authorized), or
- can happen after a transaction has already started (e.g. when connection of the cable is defined as the start of a transaction by setting TxStartPoint = EVConnected).

(See chapter E.1.1 "Flexible transaction start/stop" for a description of transaction start and stop points.)

In any case, authorization (or authorization period) ends when the same idToken is presented again for authorization, or when the transaction ends. This means that ending of the authorization period:

- can happen during a transaction without ending the transaction (e.g. when idToken is presented again, but TxStopPoint = EVConnected), or
- can cause the transaction to end (e.g. when idToken is presented again and TxStopPoint = Authorized), or
- can be caused by the end of the transaction (e.g. when idToken is not presented for authorization, but the cable is disconnected and TxStopPoint = EVConnected). or
- can be caused by cable plug-out if no transaction was started.

A Charging Station defines when authorization starts (i.e. upon receiving theauthorizeResponse, or when authorizing locally via authorization cache or local authorization list) and when authorization ends (i.e. when idToken is presented a second time, or when the transaction ends). Charging Station notifies CSMS about this, as follows:

- If authorization occurs before start of the transaction, Charging Station tells CSMS that authorization has taken place, by including the idToken in the first TransactionEventRequest of the transaction.
- If authorization occurs within a transaction or at the start of a transaction, Charging Station reports this by including the idToken in TransactionEventRequest together with a triggerReason = Authorized.

# 2.18. Page 80 - (2025-01) - C01 - EV Driver Authorization using RFID - Requirements

A requirement has been added to define when two idTokens are considered equal:

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>C01.FR.25</td><td></td><td>Two [idtokentype] elements are considered to be equal when they have the same value for the fields idToken.idToken and idToken.type</td><td>additionalInfo is not taken into account when comparing. See C01.FR.02, C01.FR.03, C01.FR.05 for idToken requirements where idTokens are compared.</td></tr></table>

# 2.19. Page 80 - (2025-01) - C01 - EV Driver Authorization using RFID - Requirements

A requirement has been added to make explicit that authorization ends after EVConnectionTimeout:

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>C01.FR.26</td><td>When an idToken has been authorized and the EV Driver does not plug in the charging cable before the timeout set by the Configuration Variable: EVConnectionTimeOut</td><td>Charging Station SHALL end the authorization of idToken</td><td>See also E03.FR.05 and F02.FR.07/08 for additional behavior in case a transaction had already been started.</td></tr></table>

# 2.20. Page 99 - (2025-01) - C09- Authorization by Groupld - Requirements

A GroupIdToken is controlled by CSMS. This should be reflected in the type.

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>C09.FR.13</td><td></td><td>The field idToken.type of a GroupIdToken SHOULD be Central</td></tr></table>

# 2.21. Page 101 - (2025-01) - Updated requirements related to clarify the relation between AuthCacheLifeTime and cacheExpiryDateTime

The OCPP specification already describes the relation between AuthCacheLifeTime and cacheExpiryDateTime at section 1.3 Authorization Cache, however the requirements are missing this information.

Changed C10 requirements:

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old text</td><td>C10.FR.10</td><td>When the validity of an Authorization Cache entry expires.</td><td>The Authorization Cache entry SHALL be removed from the cache or changed to Expired.</td><td></td></tr><tr><td>New text</td><td>C10.FR.10</td><td>NOT C10.FR.13 AND when more than AuthCacheLifeTime seconds have passed since idTokenInfo was last updated</td><td>The Authorization Cache entry SHALL be removed from the cache or changed to Expired.</td><td>A cacheExpirationDateTime in the past will prevent an idToken from being stored in the authorization cache, or remove it from authorization cache if it was already present. This is used e.g. for prepaid accounts that should not be kept in authorization cache.</td></tr><tr><td>Old text</td><td>C10.FR.13</td><td>When IdTokenInfoType contains a value for cacheExpiryDateTime</td><td>The time a token is considered to be present in the cache is determined by cacheExpiryDateTime. This variable indicates the date and time after which a token expires in the Authorization Cache.</td><td>This expiry of the cache is not the same as the expiration date that is set for the IdToken (e.g. RFID card expiry date).</td></tr><tr><td>New text</td><td>C10.FR.13</td><td>When IdTokenInfoType contains a value for cacheExpiryDateTime and current time is greater than idTokenInfo.cacheExpiry DateTime</td><td>The Authorization Cache entry SHALL be removed from the cache or changed to Expired.</td><td>This expiry of the cache is not the same as the expiration date that is set for the IdToken (e.g. RFID card expiry date).</td></tr></table>

# 2.22. Page 113 - (2025-01) - C16 - Stop Transaction with a Master Pass - Requirements

Requirements about actual stopping of transactions have been added/updated:

Updated requirement

Table 5. C16 - Stop Transaction with a Master Pass - Requirements

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Old text</td><td>C16.FR.01</td><td>User presents an IdToken that has a groupId equal to MasterPassGroupId AND The Charging Station has a UI with input capabilities.</td><td>The Charging Station SHALL &quot;show&quot; the Master Pass UI to let user select which transaction to stop.</td></tr><tr><td>New text</td><td>C16.FR.01</td><td>User presents an IdToken that has a groupId equal to MasterPassGroupId AND The Charging Station has a UI with input capabilities.</td><td>The Charging Station SHALL &quot;show&quot; the Master Pass UI to let user select which transaction to stop.</td></tr><tr><td>Old text</td><td>C16.FR.02</td><td>User presents an IdToken that has a groupId equal to MasterPassGroupId AND the Charging Station does NOT have a UI.</td><td>The Charging Station SHALL stop all ongoing transactions as described in use case E07.</td></tr><tr><td>New text</td><td>C16.FR.02</td><td>User presents an IdToken that has a groupId equal to MasterPassGroupId AND the Charging Station does NOT have a UI.</td><td>The Charging Station SHALL stop all ongoing transactions as described in use case E07.</td></tr></table>

New requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>C16.FR.07</td><td>C16.FR.01 OR C16.FR.02</td><td>Charging Station SHALL stop the transaction as described in use case E07.</td></tr><tr><td>C16.FR.07</td><td>C16.FR.07</td><td>Charging Station SHALL set transactionInfo.stoppedReason = MasterPass in TransactionRequest with eventType = Ended.</td></tr></table>

# 2.23. Page 129 - (2025-01) - Updated sequence diagram E01 S5

After all added clarifications on the PowerPathClosed TxStartPoint the corresponding sequence diagram was not updated to reflect this.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/49b71fd36df910d62ff89dda30649d598c0bf953b04f695401c5ceed348c9338.jpg)  
Figure 43. Sequence Diagram: Start Transaction options - PowerPathClosed

# 2.24. Page 151 - (2025-02) - E06.FR.05 for DataSigned as TxStopPoint is invalid

DataSigned cannot be used as a TxStopPoint. This requirement is therefore invalid and confusing when present.

Deleted requirement

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Delete</td><td>E06.FR.05</td><td>TxStopPoint contains: DataSigned AND Charging Station can no longer retrieve signed meter values.</td><td>The Charging Station SHALL stop the transaction and send a TransactionRequest (eventType = Ended) to the CSMS.</td></tr></table>

# 2.25. Page 152 - (2025-01) - E07 - Improved scenario description names

The use case did not clearly indicate when the scenario and the alternative scenario are applicable.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Transaction locally stopped by IdToken</td></tr><tr><td>2</td><td>ID</td><td>E07</td></tr><tr><td>3</td><td>Objective(s)</td><td>The EV Driver wants to stop an ongoing transaction, by locally presenting his IdToken.</td></tr><tr><td>4</td><td>Description</td><td>This use case covers how the EV Driver can stop a transaction when he wants to leave the charging station.</td></tr><tr><td></td><td>Actors</td><td>Charging Station, CSMS, EV Driver</td></tr><tr><td></td><td>Scenario descriptionReportingStopAuthorized withend of transaction</td><td>TxStopPoint = Authorized (or PowerPathClosed)1. The EV Driver presents IdToken a second time to end charging.2. The Charging Station stops the energy transfer and if the cable is not permanently attached, the Charging Station unlocks the cable.3. The Charging Station sends a TransactionRequest (eventType = Ended) with triggerReason = StopAuthorized and stoppedReason = Local.4. The CSMS responds with a TransactionResponse.</td></tr><tr><td></td><td>Alternative scenario(s)ReportingStopAuthorized inUpdate event first, thenend transaction</td><td>TxStopPoint = Authorized (or PowerPathClosed)1. The EV Driver presents IdToken a second time to end charging.2. The Charging Station sends a TransactionRequest (eventType = Updated) with triggerReason = StopAuthorized3. The CSMS responds with a TransactionResponse.4. The Charging Station stops the energy transfer and if the cable is not permanently attached, the Charging Station unlocks the cable.5. The Charging Station sends a TransactionRequest (eventType = Ended) with triggerReason = ChargingStateChanged, transactionInfo.chargingState = EVConnected6. The CSMS responds with a TransactionResponse.</td></tr><tr><td colspan="3">...</td></tr></table>

# 2.26. Page 154 - (2025-01) - E07 - Transaction locally stopped by IdToken

Sequence diagram Fig. 55 is updated to fix an error.

The fourth TransactionEventRequest needs to have: triggerReason = ChargingStateChanged, chargingState = EVConnected

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/26ce3a86d922277be925c2c07f947c3a9b5fbe1436db93d7537ea569fe963eca.jpg)  
Figure 55. Sequence Diagram: Transaction locally stopped by IdToken with TransactionEventRequest reported strictly by TxStopPoint configuration

# 2.27. Page 155 - (2025-09) - E07.FR.07 - Improved precondition

The precondition of E07.FR.07 was written as text, but it is more precise to refer another requirement.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>E07.FR.07</td><td>As part of the normal transaction termination.</td><td>The Charging Station SHALL unlock the cable (if not permanently attached).</td><td></td></tr><tr><td>New</td><td>E07.FR.07</td><td>E07.FR.02</td><td>The Charging Station SHALL unlock the cable (if not permanently attached).</td><td></td></tr></table>

# 2.28. Page 198 - (2025-01) - G01 - Status Notification - Requirements

A requirement is added to make explicit that a plug-in on reserved connector does not automatically change status to Occupied.

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>G01.FR.09</td><td>The connector is Reserved when an EV is connecting AND
( No IdToken is presented OR
EV driver presents an IdToken not matching the reservation )</td><td>Connector status SHALL not change.</td></tr></table>

# 2.29. Page 197 - (2025-01) - G01 - Status Notification - State transition overview for connecting/disconnecting

The following text from the table has to be removed:

<table><tr><td>Initial</td><td>Cable plugin</td><td>Cable unplug</td></tr><tr><td>Available</td><td>→ Occupied</td><td>-</td></tr><tr><td>Occupied</td><td>-</td><td>→ Available
(→ Unavailable, if scheduled to become Unavailable)</td></tr><tr><td>Reserved</td><td>(→ Occupied, only if authorized for reserved IdToken)</td><td>-</td></tr><tr><td>Unavailable</td><td>-</td><td>-</td></tr><tr><td>Faulted</td><td>-</td><td>-</td></tr></table>

# 2.30. Page 208 - (2025-01) - H. Reservation - Introduction

The Introduction text has been updated:"

<table><tr><td>Old text</td><td>This Functional Block describes the reservation functionality of OCPP. The reservation functionality enables an EV Driver to make a reservation of a Charging Station/EVSE, ensuring an available Connector at a Charging Station when he arrives.
With Charging Stations not being abundantly available, and EVs having limited range, EV Drivers plan their trips from Charging Station to Charging Station. They need to know for sure they can use a Charging Station they plan to go to. They don&#x27;t like it when another EV Driver has started using the Charging Station in the time they were traveling to the Charging Station.
For the EV Driver it is useful to be able to reserve a specific Type of Connector, or, when the EV Driver has no preference, an unspecified EVSE at a Charging Station. So he knows for sure he can charge at the Charging Station when he arrives.</td></tr><tr><td>New text</td><td>This Functional Block describes the reservation functionality of OCPP. The reservation functionality enables an EV Driver to reserve an EVSE at a Charging Station until a certain time in order to ensure that this EVSE cannot be occupied by another user.
OCPP allows to reserve a specific EVSE at a Charging Station or a specific connector type. The EV Driver can also reserve an unspecified EVSE, in which case the Charging Station will make sure that at least one EVSE remains available for the EV Driver.
Only available EVSEs can be reserved, since a Charging Station cannot know in advance when an occupied EVSE will become available again. This makes it impossible to guarantee a reservation for an EVSE that is currently occupied.
NOTE: A CSMS would still be able to support the reservation functionality for occupied EVSEs by delaying the sending of the reservation message to the Charging Station until the EVSE becomes available, but there is no guarantee that it is available in time.</td></tr></table>

# 2.31. Page 213 - (2025-02) - H02 - Added missing requirements

Added missing requirements explicitly specifying behaviour of Charging Station when a reservation is cancelled.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td colspan="3">[...]</td></tr><tr><td></td><td>Scenario description</td><td>1. EV Driver asks the CSMS to cancel a reservation.
2. To cancel a reservation, the CSMS sends CancelReservationRequest to the Charging Station.
3. If the Charging Station has a reservation matching the reservationId in the request PDU, it returns the status Accepted.
4. If a specific EVSE was reserved for this reservation, the Charging Station sends StatusNotificationRequest with the status Available or a NotifyEventRequest with AvailabilityState set to Available for all the Connectors of that EVSE.
5. If needed, the Charging Station sends StatusNotificationRequest with the status Available or a NotifyEventRequest with AvailabilityState set to Available for all the Connectors of EVSEs that became available.
6. The CSMS responds with StatusNotificationResponse or NotifyEventResponse to the Charging Station.
7. The reservation is canceled.</td></tr><tr><td colspan="3">[...]</td></tr></table>

Removed details from sequence diagram

Old:

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/59db4de445d1a910ddbecf848db5d70d0b9f0951f2cc19c74f324e84dc67e961.jpg)

Sequence Diagram: Cancel Reservation

New:

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/7b41ffee99a53a74a0bf40219d0d13493383b1f49912da39bfd7a830d02ccb47.jpg)

Sequence Diagram: Cancel Reservation

New requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>H02.FR.03</td><td>H02.FR.02 AND
If a specific EVSE was reserved for this reservation</td><td>The Charging Station SHALL allow charging again on this EVSE.</td></tr><tr><td>H02.FR.04</td><td>H02.FR.03</td><td>The Charging Station SHALL send a StatusNotificationRequest with status Available or a NotifyEventRequest with AvailabilityState set to Available to the CSMS for each connector, notifying the CSMS that all the connectors of this EVSE are available again for any EV Driver.</td></tr><tr><td>H02.FR.05</td><td>H02.FR.02 AND If no specific EVSE was reserved for this reservation</td><td>The Charging Station SHALL allow charging on all EVSE which were not reserved explicitly.</td></tr><tr><td>H02.FR.06</td><td>H01.FR.05 AND before cancelling the reservation the amount of EVSEs reserved was equal to the amount of reservations</td><td>The Charging Station SHALL send for all connectors of all EVSEs which were not reserved explicitly: - a NotifyEventRequest with component = "Connector", variable = "AvailabilityState", trigger = "Delta", actual/Value = "Available", OR - a StatusNotificationRequest with connectorStatus = Available.</td></tr></table>

# 2.32. Page 214/215 - (2025-01) - Improved use case scenario descriptions and added S3

The scenario descriptions have been updated to better explain the actual claiming of a reservation and have been clearly divided based on the configured TxStartPoint(s). In addition, A S3 has been added: 'Use an EVSE when Charging Station has a reservation for idToken, but connector status is Available.' This happens when reservation is for an unspecified EVSE and multiple EVSEs are available.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Use a reserved EVSE</td></tr><tr><td>2</td><td>ID</td><td>H03</td></tr><tr><td>3</td><td>Objective(s)</td><td>Use a reserved EVSE</td></tr><tr><td>4</td><td>Description</td><td>This use cases covers how a reserved EVSE can be used based on IdToken and GroupIdToken information.</td></tr><tr><td></td><td>Actors</td><td>Charging Station, CSMS, EV Driver</td></tr><tr><td>S1</td><td>Scenario objective</td><td>Use an EVSE with connector status Reserved, that is reserved for this IdToken</td></tr><tr><td></td><td>Scenario description</td><td>TxStartPoint = "Authorized"; IdToken presented first
1. The EV Driver presents an IdTokenType at the Charging Station that is the same as the reservation's IdTokenType.
2. Charging Station matches IdTokenType with the reservation.
3. Connector status becomes Available, since reservation has now been consumed.
4. Charging Station optionally authorizes the IdTokenType via an InvalidateRequest.
5. If authorization accepted, or authorization step was skipped:
a. Charging Station starts a transaction as in E03 - Start Transaction - IdToken First.
b. Connector status will become Occupied when cable is connected.</td></tr><tr><td></td><td>Scenario description #2</td><td>TxStartPoint = "EVConnected"; Cable plugged in first
1. The EV Driver connects the cable.
2. Charging Station starts a transaction, but EVSE connector status remains Reserved.
3. The EV Driver presents an IdTokenType at the Charging Station that is the same as the reservation's IdTokenType
4. Charging Station matches IdTokenType with the reservation
5. Connector status becomes Occupied, since reservation has now been consumed
6. Charging Station optionally authorizes the IdTokenType via an InvalidateRequest
7. If authorization accepted, or authorization step was skipped:
a. Charging Station starts a transaction as in E02 - Start Transaction - Cable Plugin First</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>EVSE has been reserved for IdToken and connector status is Reserved.</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>n/a</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/6689400ee97cbabd8b08be5bff693fe6d89ba728a7526b6ce93a5e602b32b429.jpg)  
Figure 82. Sequence Diagram: Use a reserved EVSE with IdToken

<table><tr><td>S2</td><td>Scenario objective</td><td>Use an EVSE with connector status Reserved, that is reserved for this GroupIdToken</td></tr><tr><td></td><td>Scenario description</td><td>TxStartPoint = "Authorized"; IdToken presented first
1. The EV Driver presents an IdTokenType at the Charging Station that is not the same as the reservation's IdTokenType, but the reservation contains a groupIdToken.
2. Charging Station authorizes the IdTokenType via anauthorizeRequest, Local Authorization List or Authorization Cache, and checks if the groupldToken of the IdTokenType matches with the reservation.
3. If groupldTokens match:
  a. Connector status becomes Available, since reservation has now been consumed.
  b. Charging Station starts a transaction as in E03 - Start Transaction - IdToken First
  c. Connector status will become Occupied when cable is connected</td></tr><tr><td></td><td>Scenario description #2</td><td>TxStartPoint = "EVConnected", Cable plugged in first
1. The EV Driver connects the cable.
2. Charging Station starts a transaction, but connector status remains Reserved.
3. The EV Driver presents an IdTokenType at the Charging Station that is not the same as the reservation's IdTokenType, but the reservation contains a groupldToken.
4. Charging Station authorizes the IdTokenType via anauthorizeRequest, Local Authorization List or Authorization Cache, and checks if the groupldToken of the IdTokenType matches with the reservation.
5. If groupldTokens match:
  a. Connector status becomes Occupied, since reservation has now been consumed.
  b. Charging Station starts a transaction as in E02 - Start Transaction - Cable Plugin First</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>EVSE has been reserved for GroupldToken. EVSE connectorStatus = Reserved.</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>n/a</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/da1dda67db7d8a1a7b9a2e5bdcbe414656602fecc110d81b600344f7ce789666.jpg)  
Figure 83. Sequence Diagram: Use a reserved EVSE with GroupId

<table><tr><td>S3</td><td>Scenario objective</td><td>Use an EVSE when Charging Station has a reservation for idToken, but connector status is Available. This happens when reservation is for an unspecified EVSE and multiple EVSEs are available.</td></tr><tr><td></td><td>Scenario description</td><td>TxStartPoint = &quot;Authorized&quot;; IdToken presented first + Identical to scenario S1 above.</td></tr><tr><td></td><td>Scenario description #2</td><td>TxStartPoint = &quot;EVConnected&quot;; Cable plugged in first
1. The EV Driver connects the cable
2. Charging Station reports connector status as occupied
3. Charging Station starts a transaction
4. The EV Driver presents an IdTokenType at the Charging Station that is the same as the reservation&#x27;s IdTokenType
5. Charging Station matches IdTokenType with the reservation
6. Charging Station optionally authorizes the IdTokenType via an InvalidateRequest
7. If authorization accepted, or authorization step was skipped:
a. Charging Station starts a transaction as in E02 - Start Transaction - Cable Plugin First</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>Unspecified EVSE has been reserved for idToken. EVSE connector status is Available.</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>n/a</td></tr></table>

Added note:

<table><tr><td>7</td><td>Error handling</td><td>n/a</td></tr><tr><td>8</td><td>Remark(s)</td><td>It is RECOMMENDED to validate the Identifier with an InvalidateRequest after reception of ReserveNowRequest and before the start of the transaction.
If an idToken is presented that does not match the reservation (and groupldTokens do not match either), then this idToken is not authorized to charge.
If TxStartPoint = Authorized or PowerPathClosed then a transaction would not be started in this case.
If TxStartPoint = EVConnected or ParkingBayOccupancy then a transaction would be started by cable plug-in or occupancy of parking bay, but charging would not start. Assuming a TxStopPoint of EVConnected the transaction would be ended at cable plug-out.</td></tr></table>

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old text</td><td>H03.FR.09</td><td>When an idToken or groupldToken is presented that matches a reservation</td><td>Charging Station SHALL consider the reservation to be used (consumed)</td><td></td></tr><tr><td>New text</td><td>H03.FR.09</td><td>When an idToken or groupldToken is presented that matches a reservation</td><td>Charging Station SHALL consider the reservation to be used (consumed)</td><td>The (group)IdToken can be presented locally at a card reader, but can also be part of a RequestStartTransaction.</td></tr></table>

# 2.33. Page 226 - (2025-01) - I06.FR.02 Improved requirement text

<table><tr><td>Old</td><td>I06.FR.02</td><td>I06.FR.01 AND
When there is updated tariff information available.</td><td>The CSMS SHALL respond with a TransactionResponse message to the Charging Station, containing the updated tariff information in the PersonalMessage field.</td></tr><tr><td>New</td><td>I06.FR.02</td><td>I06.FR.01 AND
When there is updated tariff information available.</td><td>The CSMS SHALL respond with a TransactionResponse message to the Charging Station, containing the updated tariff information in the updatedPersonalMessage field.</td></tr></table>

# 2.34. Page 231 - (2025-01) - Updated section Multiple Locations/Phases

The section now specifies the 'relevant' configuration variables that apply.

<table><tr><td>Old</td><td>When a Charging Station can measure the same measurand on multiple locations or phases, all possible locations and/or phases SHALL be reported when configured in one of the relevant Configuration Variables.</td></tr><tr><td>New</td><td>When a Charging Station has measurands configured in SampledDataTxStarted/Updated/EndedMeasurands and/or AlignedDataMeasurands / AlignedDataTxEndedMeasurands , that can be measured on multiple locations or phases, then all possible locations and/or phases SHALL be reported.</td></tr></table>

# 2.35. Page 243 - (2025-01) - Improved section on external Smart Charging Control Signals

To be inline with the EMS scenario additions to OCPP 2.1, this section also has been improved for OCPP 2.0.1.

Old text:

The OCPP protocol is originally developed for communication between a CSMS and one or more Charging Stations. As described in the above, this means that a Charging Station Operator (CSO) CSMS controls a Charging Station and, based on the charging limits of both the EV and the Charging Station, the CSO determines how fast the EV is charged. However, in some situations / applications of OCPP enabled Charging Stations, these are not the only 2 factors that determine the charging speed. Other inputs that determine charging speed could be DSO signals (e.g. via IEC 61850 [IEC61850-7-420], IEC 60870 [IEC60870-5-104], DNP3 [DNP3] or OpenADR [OPENADR]) or signals from a Building / Home Energy Management System. Although these signals are out of scope for OCPP, it seems clear from an OCPP perspective that the CSMS is to be informed of changes in charging by external signals. However, this also leads to a number of questions, such as how to deal with conflicting signals. The figure below presents an example setup with an Energy Management System, where the external signals are visualized both in a setup with direct communication to the Charging Station as well as a multiple Charging Station setup using a Local Controller:

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/c45354b292341555dca95dda06467504901fb2d7f6e08708b5f0d4d5d80591ca.jpg)  
Figure 97. External Smart Charging

New text:

The OCPP protocol is developed for communication between a CSMS and one or more Charging Stations. As described in the above, this means that a CSMS of a Charging Station Operator (CSO) controls a Charging Station and, based on the charging limits of both the EV and the Charging Station, the CSO controls how fast the EV is charged. In some situations there are other factors that might control charging power: A DSO can send signals to change charging power (e.g. via IEC 61850 [IEC61850-7-420], IEC 60870 [IEC60870-5-104], DNP3 [DNP3] or OpenADR [OPENADR]), or a Home Energy Management System or a smart meter may be in place to limit charging power.

An external actor can connect to a Charging Station with any protocol that is supported by the Charging Station for this purpose, like Modbus, EEBUS, and even OCPP. This control signal can be a single limit value or a schedule. In both cases Charging Station will represent the limit internally as a charging profile of purpose ChargingStationExternalConstraints.

A CSMS may need to be informed of changes in charging rate as a result of external signals. OCPP provides a NotifyChargingLimitRequest message to report such changes.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/e109925e95a9d7cef1ec787b618e0cf187b8be4c2652146a9fb0f38fa580f045.jpg)  
EMS control directly to Charging Stations

# 2.36. Page 248 - (2025-01) - 3.7 Avoiding Phase Conflicts

The following paragraph about Avoiding Phase Conflicts has been added:

In the situation where a ChargingStationMaxProfile or a ChargingStationExternalConstraints define a value for numberPhases or phaseToUse, then a possible conflict might arise if such values are also specified in a TxDefaultProfile or TxProfile. The following rules apply in that case:

# numberPhases

The lowest value for a schedule period of all applicable profiles is used for the composite schedule period. If ChargingStationMaxProfile has numberPhases = 3 and TxProfile has numberPhases = 1, then the value 1 is used. The same applies to the reverse situation.

# phaseToUse

When there is a conflicting value of phaseToUse between the schedule periods of applicable profiles, then there is no way to create a composite schedule period. For example, a CSMS should not submit a charging profile of purpose

ChargingStationMaxProfile for phaseToUse = 1 and then a TxProfile for phaseToUse = 3, because the charging station will not know which value has preference. Therefore, a SetChargingProfileRequest that causes such a conflict will have to be rejected.

When a relative TxProfile is being used and different phases occur in various schedule periods, then it may become difficult to detect if and where such a phase conflict occurs. A charging station should only accept a

SetChargingProfileRequest when it can be certain, that there is a no risk of a phase conflict. This means, that when the charging station is not able to verify that no phase conflict occurs in any schedule period (which can happen when the TxProfile is received for a transaction, but charging has not yet started, so that start time of the first schedule period is not known), that it cannot accept a charging profile if any of the schedule periods contains a value for phaseToUse that differs from the value used in the ChargingStationMaxProfile or ChargingStationExternalConstraints.

NOTE

A value of phaseToUse may only be used when numberOfPhases = 1.

# 2.37. Page 275 - (2025-06) - Updated remark of K11

Added sentence to Remarks a new charging profile for an update of external limit can use the same charging profile id.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>...</td><td>...</td><td>...</td></tr><tr><td>8</td><td>Remarks</td><td>[...]If the external limit is represented by an Absolute or RelativeChargingStationExternalConstraints charging profile, then every update of the external limit requires (K11.FR.06) that the existingChargingStationExternalConstraints charging profile is replaced by a new one. This one can use the samechargingProfile.id, however.</td></tr></table>

# 2.38. Page 251 - (2025-06) - Updated note of K01.FR.05

Note suggested that ChargingStationExternalConstraints cannot be replaced at all. Updated note to clarify that a ChargingStationExternalConstraints cannot be replaced by CSMS.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>K01.FR.05</td><td>When a SetChargingProfileRequest with an already known ChargingProfile.id is received AND the existing ChargingProfile does NOT have chargingProfilePurpose = ChargingStationExternalConstraints</td><td>The Charging Station SHALL replace the existing ChargingProfile with the one specified.</td><td>ChargingStationExternalConstraints profile cannot be replaced.</td></tr><tr><td>New</td><td>K01.FR.05</td><td>When a SetChargingProfileRequest with an already known ChargingProfile.id is received AND the existing ChargingProfile does NOT have chargingProfilePurpose = ChargingStationExternalConstraints</td><td>The Charging Station SHALL replace the existing ChargingProfile with the one specified.</td><td>ChargingStationExternalConstraints profile cannot be replaced by CSMS.</td></tr></table>

# 2.39. Page 251 - (2025-06) - Add cross-references to K01.FR.06 and K01.FR.39

Requirement K01.FR.06 and K01.FR.39 are similar, but located far apart in the table. It is convenient to add a cross-reference between both.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>K01.FR.06</td><td>When chargingProfilePurpose is NOT TxProfile</td><td>The CSMS SHALL NOT send a ChargingProfile with a stackLevel - chargingProfilePurpose - evsId combination that already exists in another ChargingProfile (with different id) on the Charging Station and has an overlapping validity period.</td><td>This is to ensure that no two charging profiles with same stack level and purpose can be valid at the same time.</td></tr><tr><td>New</td><td>K01.FR.06</td><td>When chargingProfilePurpose is NOT TxProfile</td><td>The CSMS SHALL NOT send a ChargingProfile with a stackLevel - chargingProfilePurpose - evseld combination that already exists in another ChargingProfile (with different id) on the Charging Station and has an overlapping validity period.</td><td>This is to ensure that no two charging profiles with same stack level and purpose can be valid at the same time. 
(See also K01.FR.39)</td></tr><tr><td>Old</td><td>K01.FR.39</td><td>When chargingProfilePurpose is TxProfile</td><td>The CSMS SHALL NOT send a ChargingProfile with a stackLevel - transactionId combination that already exists in another ChargingProfile (with different id) with purpose TxProfile.</td><td>This is to ensure that no two charging profiles with same stack level and purpose can be valid at the same time.</td></tr><tr><td>New</td><td>K01.FR.39</td><td>When chargingProfilePurpose is TxProfile</td><td>The CSMS SHALL NOT send a ChargingProfile with a stackLevel - transactionId combination that already exists in another ChargingProfile (with different id) with purpose TxProfile.</td><td>This is to ensure that no two charging profiles with same stack level and purpose can be valid at the same time. 
(See also K01.FR.06)</td></tr></table>

# 2.40. Page 254 - (2025-06) - K01.FR.50 requirement is a SHALL

Physics determines how to convert power to current. This cannot be a "should" requirement, but is a SHALL.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>K01.FR.49</td><td>When a SetChargingProfileRequest without a value for numberPhases is received AND the EVSE is of type AC</td><td>The Charging Station SHALL assume numberPhases = 3 as a default value.</td><td></td></tr><tr><td>New</td><td>K01.FR.49</td><td>When a SetChargingProfileRequest without a value for numberPhases is received AND the EVSE is of type AC</td><td>The Charging Station SHALL assume numberPhases = 3 as a default value.</td><td>Regions with a single phase network should always provide numberPhases = 1, otherwise 3 phases will be assumed.</td></tr><tr><td>Old</td><td>K01.FR.50</td><td>When a SetChargingProfileRequest with a chargingRateUnit = W is received AND The ChargingSchedule is used for AC charging</td><td>The Charging Station SHOULD calculate the phase current limit via: Current per phase = Power / (Line Voltage * Number of Phases).</td><td>The "Line Voltage" used in the calculation is not the measured voltage, but the set voltage for the area (for example, 230 or 110 V). The "Number of Phases" is the numberPhases from the ChargingSchedulePeriod. It is usually more convenient to use chargingRateUnit = A for AC charging.</td></tr><tr><td>New</td><td>K01.FR.50</td><td>When a SetChargingProfileRequest with a chargingRateUnit = W is received AND The charging profile is used for AC charging</td><td>The Charging Station SHALL calculate the phase current limit via: Current per phase = limit / (Line Voltage * numberPhases), in which limit and numberPhases are the values from the ChargingSchedulePeriod.</td><td>The "Line Voltage" used in the calculation is not the measured voltage, but the set voltage for the area (for example, 230 or 110 V). . The limit and numberPhases are the values from the ChargingSchedulePeriod. When numberPhases is not specified, a value of 3 is assumed (see K01.FR.49). It is usually more convenient to use chargingRateUnit = A for AC charging, since in that case the limit does not change depending on number of phases in use.</td></tr></table>

# 2.41. Page 257 - (2025-06) - K02 Updated remark of use case about merging profiles

The description of merging profiles in the remark was not complete. It has been updated to refer to the appropriate requirement.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>...</td><td>...</td><td>...</td></tr><tr><td>8</td><td>Remark(s)</td><td>[...]The final schedule constraints that apply to a transaction are determined by merging the profiles with purposes ChargingStationMaxProfile with the profile TxProfile or TxDefaultProfile in case no profile of purpose TxProfile is provided. Zero or more of the following ChargingProfile purposes MAY have been previously received from the CSMS: ChargingStationMaxProfile or TxDefaultProfile, as described in requirement SC.01 in Chapter 4. Smart Charging Signals to a Charging Station from Multiple Actors. [...]</td></tr></table>

# 2.42. Page 282 - (2025-01) - K15 - ISO 15118-2 Charging with load leveling - Requirements

Note: This erratum has been superseded by erratum: Page 282 - (2025-09) - K15.FR.20 is not part of OCPP 2.0.1 [1061]

Added recommendation for timestamp when offline:

New/Updatedrequirements

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Changed</td><td>K15.FR.01</td><td>When the Charging Station receives charging needs from the EV</td><td>The Charging Station SHALL send a NotifyEVChargingNeedsRequest to the CSMS.</td><td>See also K15.FR.20</td></tr><tr><td>New</td><td>K15.FR.20</td><td>K15.FR.01 AND Charging Station is offline</td><td>Charging Station SHOULD add timestamp to the NotifyEVChargingNeedsRequest with the time when charging needs were received from EV</td><td>This will tell CSMS how old this data is, if it was not immediately sent because of an offline period.</td></tr><tr><td>New</td><td>K15.FR.21</td><td>K15.FR.10</td><td>Charging Station SHOULD set selectedScheduleTupleId to the Id of the chargingSchedule that EV selected from the provided ChargingProfile(s).</td><td></td></tr></table>

# 2.43. Page 282 - (2025-09) - K15.FR.20 is not part of OCPP 2.0.1 [1061]

Note: This erratum supersedes erratum: Page 282 - (2025-01) - K15 - ISO 15118-2 Charging with load leveling - Requirements

The above-mentioned requirement about K15.FR.20 as a new requirement in OCPP 2.0.1 is wrong. K15.FR.20 does not apply to OCPP 2.0.1, because the timestamp field was only added in OCPP 2.1.

Delete requirement

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Delete</td><td>K15.FR.20</td><td>K15.FR.01 AND Charging Station is offline</td><td>Charging Station SHOULD add timestamp to the NotifyEVChargingNeedsRequest with the time when charging needs were received from EV</td><td>This will tell CSMS how old this data is, if it was not immediately sent because of an offline period.</td></tr></table>

# 2.44. Page 286 - (2025-01) - K16 - Renegotiation initiated by CSMS - Requirements

The following requirement was added:

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirements</td><td>NOTE</td></tr><tr><td>K16.FR.14</td><td>K16.FR.05</td><td>Charging Station SHOULD set selectedScheduleTupleId to the Id of the chargingSchedule that EV selected from the provided ChargingProfileType(s).</td><td></td></tr></table>

# 2.45. Page 284 - (2025-09) - K15 Added rule for composite schedules in case of multiple charging schedules [1002]

In the theoretical situation that 2 TxProfiles are submitted with different stack levels and multiple charging schedules (which can only be the case for an ISO 15118 session) and, because of different durations of these schedules, parts of each of these schedules will be valid at one point or another, then how is the composite schedule calculated? It is not $3 \times 3$ composite schedules (all possible combinations), but only 3 composite schedules, because schedule #1 is always combined with schedule #1, #2 with #2 and #3 with #3. Other chargingProfilePurposes, like ChargingStationMaxProfile need also to be taken into account when calculating the composite schedule.

A new requirement is added to define this behavior.

# 2.45.1. K15 - ISO 15118-2

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>K15.FR.22</td><td>When calculating CompositeSchedule(s) to create a SAScheduleList for ISO 15118-2 to send to EV AND multiple ChargingProfileTypes of chargingProfilePurpose = TxProfile with different stackLevels are valid AND some or all these ChargingProfileTypes have more than one chargingSchedule</td><td>Charging Station SHALL create up to three CompositeSchedules as defined in K08.FR.04, by combining the first chargingSchedule with the first chargingSchedule of other stack levels, the second with second (if existing), the third with the third (if existing), based on their order in the ChargingProfileTypes.</td><td>This is about a corner case when multiple TxProfiles with different stack levels and multiple charging schedules have been sent to the Charging Station.</td></tr></table>

# 2.46. Page 259/260 - (2025-01) - K03 - Updated use case description and sequence diagram

The use case description and sequence diagram have been updated to provide more information on how local load-balancing can be performed. (Requirements for K03 have not changed).

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Local Smart Charging</td></tr><tr><td>2</td><td>ID</td><td>K03</td></tr><tr><td>3</td><td>Objective(s)</td><td>To illustrate the process of local load-balancing by a Local Cluster.</td></tr><tr><td>4</td><td>Description</td><td>This use case is an example of how local load-balancing can be performed. It does not imply that other approaches would not be correct. The process has been simplified for clarity and should not be regarded as prescriptive.A Local Controller is configured with a value for maximum current for the total cluster by CSMS via a charging profile of type ChargingStationMaxProfile to the Local Controller, or an EMS may have set a ChargingStationExternalConstraints charging profile.The Local Controller divides the maximum current among the active transactions. Whenever a transaction starts or finishes, the Local Controller will update the charging profiles of the remaining transactions to divide the maximum current equally.For simplicity's sake, this use case does not differentiate on departure time or state of charge of vehicles, nor does it take the actual energy consumption of vehicles into account.</td></tr><tr><td></td><td>Actors</td><td>Charging Station (CS01, CS02), Local Controller (LC), CSMS</td></tr><tr><td></td><td>Scenario description</td><td>Assume no transactions are active in the local cluster and the maximum current for the local cluster has been configured to be 100 A. The charging stations all have a TxDefaultProfile that allows a current of only 6 A, so that vehicles cannot immediately start charging at full power before the LC had the chance to set a charging profile.1. A transaction starts on charging station CS01. It sends a TransactionEventRequest(Started) to LC.2. LC is configured to do local load-balancing (i.e. its SmartChargingCtrl.Enabled = true), so it registers the transaction id TX1 of the transaction that has been started on CS01, before forwarding the message on the websocket for CS01 towards CSMS.3. LC sends a SetChargingProfileRequest to CS01 with chargingProfilePurpose = TxProfile, chargingProfileKind = Relative, transactionId = TX1 and a chargingSchedule with a chargingRateUnit = A that contains one chargingSchedulePeriod with a limit of 94 A, so that the entire quota is available to this transaction minus the TxDefaultProfile amount for new transactions.4. Another transaction starts on charging station CS02. It sends a TransactionEventRequest(Started) to LC.5. LC registers the new transaction id TX2 and forwards the message on the websocket for CS02 to CSMS.6. LC divides the available quota by allowing each transaction a maximum of 47 A.7. LC sends a SetChargingProfile message to CS01 that updates the existing TxProfile and sets the limit to 47 A.8. LC sends new SetChargingProfile to CS02 with chargingProfilePurpose = TxProfile, chargingProfileKind = Relative, transactionId = TX2 and a chargingSchedule with a chargingRateUnit = A that contains one chargingSchedulePeriod with a limit of 47 A.9. The transaction of CS01 finishes. It sends a TransactionEventRequest(Ended) to LC.10. LC registers that transaction TX1 on CS01 has finished and forwards the message on the websocket for CS01 to CSMS.11. LC now allows the maximum to TX2. It sends a SetChargingProfile message to CS02 that updates the existing TxProfile and sets the limit to 94 A. (Note, that the TxProfile for TX1 on CS01 has automatically ceased to exist upon termination of the transaction.)</td></tr><tr><td>5</td><td>Prerequisites</td><td>The LC has been configured with a fixed maximum current level.The SmartChargingCtrl component of Local Controller has been Enabled, which will trigger the Local Controller to read and interpret TransactionEventRequest messages from connected Charging Stations.</td></tr><tr><td>6</td><td>Post conditions</td><td></td></tr><tr><td>7</td><td>Error Handling</td><td></td></tr><tr><td>8</td><td>Remarks</td><td>As described in Part 1, a Local Controller replicates all web sockets from Charging Stations in the cluster towards CSMS, and forwards messages from Charging Station to CSMS on the appropriate web socket (and vice versa). This allows the Local Controller to read messages, such as a TransactionEventRequest message, from the Charging Station.The Local Controller for local smart charging can be implemented in different ways, for example: as a separate physical component or as part of a "master" Charging Station controlling a number of other Charging Stations. The Local Controller MAY or MAY NOT have any EVSEs of its own.The limits on Charging Stations in a Local Smart Charging group can either be pre-configured in the Local Controller in one way or another, or they can be set by the CSMS. The Local Controller contains the logic to distribute this capacity among the connected EVSEs by adjusting their limits as needed.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/68ca4c2d04570935ee7d28363400cd0a1f76b53d8c4447f95be90fd7af61f1d9.jpg)  
Local Controller performing local load-balancing

# 2.47. Page 274/275/276/277 - (2025-01) - K11/K12 - Updated use case descriptions and sequence diagrams

The use case descriptions and sequence diagrams have been updated to describe the more likely scenario of a smart meter or EMS as external actor.

# K11 - Set / Update External Charging Limit With Ongoing Transaction

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Set / Update External Charging Limit With Ongoing Transaction</td></tr><tr><td>2</td><td>ID</td><td>K11</td></tr><tr><td>3</td><td>Objective(s)</td><td>To inform the CSMS of a charging schedule or charging limit imposed by an External Control System on the Charging Station with ongoing transaction(s).</td></tr><tr><td>4</td><td>Description</td><td>An External Control System sends a charging limit/schedule to a Charging Station. This limit is sent to the CSMS. The External Control System can be a DSO, but also a smart meter or a home energy management system. The interface between External Control System and Charging Station is not specified. It can be any protocol that is supported by Charging Station for this purpose, even OCPP.</td></tr><tr><td></td><td>Actors</td><td>External Control System, Charging Station, CSMS</td></tr><tr><td></td><td>Scenario description</td><td>1. External control system sends charging limit/schedule to Charging Station.
2. Optional: Charging Station calculates new charging schedule.
3. Charging Station adjusts the charging speed of the ongoing transaction(s).
4. If the charging limit changed by more than: LimitChangeSignificance, the Charging Station sends a NotifyChargingLimitRequest message to CSMS with optionally the set charging limit/schedule.
5. The CSMS responds with NotifyChargingLimitResponse to the Charging Station.
6. If the charging rate changes by more than: LimitChangeSignificance, the Charging Station sends a TransactionEventRequest message to inform the CSMS.
7. The CSMS responds with TransactionEventResponse to the Charging Station.</td></tr><tr><td>5</td><td>Prerequisites</td><td>Charging Station is not in error state.
The external system can set/clear a charging limit/schedule on the Charging Station via a direct connection to the Charging Station.</td></tr><tr><td colspan="3">...</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/a2eed487c0d4e2bb5d5fbf6e3a6c908ed6477384700b9eff02e3f3423f8538c3.jpg)  
Sequence diagram of the use case "Setting / Updating External Charging Limit with Ongoing Transaction"

# K12 - Set / Update External Charging Limit Without Ongoing Transaction

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Set / Update External Charging Limit Without Ongoing Transaction</td></tr><tr><td>2</td><td>ID</td><td>K12</td></tr><tr><td>3</td><td>Objective(s)</td><td>To inform the CSMS of a charging schedule or charging limit imposed by an external system on the Charging Station for new transactions or on the grid connection.</td></tr><tr><td>4</td><td>Description</td><td>To inform the CSMS of a charging schedule or charging limit imposed by an external system on the Charging Station for new transactions or on the grid connection. The External Control System can be a DSO, but also a smart meter or a home energy management system. The interface between External Control System and Charging Station is not specified. It can be any protocol that is supported by Charging Station for this purpose, even OCPP.</td></tr><tr><td></td><td>Actors</td><td>External Control System, Charging Station, CSMS</td></tr><tr><td></td><td>Scenario description</td><td>1. External Control System sends a charging limit to Charging Station (not during a transaction).2. Optional: Charging Station calculates new charging schedule.3. Charging Station adjusts the charging speed.4. If the charging limit changed by more than: LimitChangeSignificance, the Charging Station sends a NotifyChargingLimitRequest message to CSMS with optionally the set charging limit/schedule.5. The CSMS responds with a NotifyChargingLimitResponse to the Charging Station.</td></tr><tr><td>5</td><td>Prerequisites</td><td>Charging Station is not in error state.The external system can set/clear a charging limit/schedule on the Charging Station via a direct connection to the Charging Station.</td></tr><tr><td colspan="3">...</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/cfe202d18f71b8f01ecd7ac071fb80ff665f563ddaa1fe30eae533902c1764f9.jpg)

Sequence diagram of the use case "Set / Update External Charging Limit Without Ongoing Transaction"

# 2.48. Page 278/279 - (2025-01) - K13 - Updated requirement preconditions

Moved precondition "transaction is ongoing" from K13.FR.01 to K13.FR.03.

Changed K13 requirements:

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirements</td></tr><tr><td>Old text</td><td>K13.FR.01</td><td>A transaction is ongoing AND External charging limit is released/removed</td><td>The Charging Station SHALL NOT limit charging anymore based on the previously received limit.</td></tr><tr><td>New text</td><td>K13.FR.01</td><td>External charging limit is released/removed</td><td>The Charging Station SHALL NOT limit charging anymore based on the previously received limit.</td></tr><tr><td>Old text</td><td>K13.FR.03</td><td>K13.FR.01 AND Charging rate changed by more than: LimitChangeSignificance</td><td>The Charging Station SHALL send a TransactionEventRequest message to the CSMS with trigger = ChargingRateChanged.</td></tr><tr><td>New text</td><td>K13.FR.03</td><td>K13.FR.01 AND A transaction is ongoing AND Charging rate changed by more than: LimitChangeSignificance</td><td>The Charging Station SHALL send a TransactionRequest message to the CSMS with trigger = ChargingRateChanged.</td></tr></table>

# 2.49. Page 279 - (2025-01) - K14 - Updated use case scenario description

Improved scenario step description 5 and 7.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Handle external charging limit with a local controller</td></tr><tr><td>2</td><td>ID</td><td>K14</td></tr><tr><td>3</td><td>Objective(s)</td><td>To adjust the charging limits according to the External Control System requirements.</td></tr><tr><td>4</td><td>Description</td><td>An external control system sends a charging limit to the Local Controller. The Local Controller notifies the CSMS, calculates the new charging schedules and sends a SetChargingProfileRequest messages to all Charging Stations for which the charging profile has changed.</td></tr><tr><td></td><td>Actors</td><td>External control system, Local Controller, Charging Station, CSMS</td></tr><tr><td></td><td>Scenario description</td><td>1. External control system sends a charging limit/schedule to Local Controller.
2. Local Controller sends a NotifyChargingLimitRequest message to the CSMS.
3. Local Controller calculates new Charging Profiles for all connected Charging Stations.
4. Local Controller sends a SetChargingProfileRequest message to all Charging Stations for which the charging profile has changed.
5. External control releases a charging limit/schedule to Local Controller.
6. Local Controller sends a ClearedChargingLimitRequest message to the CSMS.
7. Local Controller clears Charging Profiles for all connected Charging Stations.
8. Local Controller sends a ClearChargingProfileRequest messages to all affected Charging Stations.</td></tr><tr><td colspan="3">...</td></tr></table>

# 2.50. Page 284 - (2025-09) - K16 use case description update

The use case description refers to SetChargingProfile in step 7, but that is too restricting. It is the composite schedule that is provided to EV.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>...</td><td>...</td><td>...</td></tr><tr><td></td><td>Scenario description</td><td>1 CSMS sends a SetChargingProfileRequest to the Charging Station.
2 Charging Station responds with a SetChargingProfileResponse to the CSMS.
3 When EV sends the next CurrentDemandReq (for DC) or ChargingStatusReq (for AC), the Charging Station will respond with evseNotification = ReNegotiation.
4 EV sends a PowerDeliveryReq with chargeProgress = ReNegotiate to confirm this.
5 Charging Station responds with a PowerDeliveryRes.
6 EV sends a ChargeParameterDiscoveryReq.
7 Charging Station responds with a ChargeParameterDiscoveryRes with an SAScheduleList that contains the composite schedule(s) for the EVSE ChargingSchedule data from the SetChargingProfileRequest.
8 EV sends a PowerDeliveryReq with chargeProgress = Start (with an optional charging profile) to confirm this.
9 Charging Station responds with PowerDeliveryRes and, if charging was suspended at start of the renegotiation, will resume power delivery.
10 If EV provided a charging profile in the previous step, then Charging Station will send a NotifyEVChargingScheduleRequest to the CSMS.</td></tr></table>

# 2.50.1. Page 285

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirements</td><td>NOTE</td></tr><tr><td>Old</td><td>K16.FR.02</td><td>K16.FR.01</td><td>Charging Station SHALL initiate schedule renegotiation with EV.</td><td>In ISO 15118 this is done by replying with EVSENotification=ReNegotiation to a CurrentDemandReq (for DC) or ChargingStatusReq (for AC) message.</td></tr><tr><td>New</td><td>K16.FR.02</td><td>When the composite schedule for the EVSE changes</td><td>Charging Station SHALL initiate schedule renegotiation with EV.</td><td>This can be caused by a Set/ClearChargingProfileRequest or a change in ChargingStationExternalConstraints/Local Generation charging profiles. In ISO 15118 this is done by replying with EVSENotification=ReNegotiation to a CurrentDemandReq (for DC) or ChargingStatusReq (for AC) message.</td></tr><tr><td>Old</td><td>K16.FR.03</td><td>K16.FR.02</td><td>Charging Station SHALL provide the ChargingSchedule data to the EV.</td><td>In ISO 15118 this is done in the ChargeParameterDiscoverRes message.</td></tr><tr><td>New</td><td>K16.FR.03</td><td>K16.FR.02</td><td>Charging Station SHALL provide the composite schedule(s) ChargingSchedule data to the EV.</td><td>In ISO 15118 this is done in the ChargeParameterDiscoverRes message.</td></tr></table>

# 2.51. Page 292 - (2025-01) - Use case L01 - Added clarification to step 3 about when to start downloading the firmware

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Secure Firmware Update</td></tr><tr><td>2</td><td>ID</td><td>L01</td></tr><tr><td>3</td><td>Objective(s)</td><td>Download and install a Secure firmware update.</td></tr><tr><td>4</td><td>Description</td><td>Illustrate how a Charging Station processes a Secure firmware update.</td></tr><tr><td></td><td>Actors</td><td>CSMS, Charging Station</td></tr><tr><td></td><td>Scenario description</td><td>1. The CSMS sends an UpdateFirmwareRequest message that contains the location of the firmware, the time after which it should be retrieved, and information on how many times the Charging Station should retry downloading the firmware.
2. The Charging Station verifies the validity of the certificate against the Manufacturer root certificate.
3. If the certificate is valid AND the retrieveDateTime has passed, the Charging Station starts downloading the firmware, and sends a FirmwareStatusNotificationRequest with status Downloading.
If the certificate is not valid or could not be verified, the Charging Station aborts the firmware update process and sends a UpdateFirmwareResponse with status InvalidCertificate and a SecurityEventNotificationRequest with the security event InvalidFirmwareSigningCertificate (See part 2 appendices for the full list of security events).
...</td></tr></table>

# 2.52. Page 306 - (2025-01) - M. ISO 15118 Certificate Management

The functional block ISO 15118 Certificate Management is renamed to Certificate Management since this also contains certificate management of non-ISO 15118 related certificates.

# 2.53. Page 308 - (2025-01) - Update introduction sequence diagram ISO 15118

Not all ISO 15118 message sequences were complete, so the sequence diagram has been updated to show a more complete version of the message flow.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/e2af90f711035a275105a710b5e47c5a66a3aaf402d9a8f4b56b5ac01f15761b.jpg)  
Figure 122. Sequence with Authorization and Scheduling with ISO 15118-2

# 2.54. Page 330 - (2025-01) - N03 Set Monitoring Base: Improved text of Remark

<table><tr><td>Old</td><td>8</td><td>Remark(s)</td><td>Upon receipt of a SetMonitoringBaseRequest for HardWiredOnly or FactoryDefault the Charging Station will discard of any previously configured custom monitors and will activate the monitoring settings that are related to given MonitoringBase.For a MonitoringBase = All the Charging Station will activate all pre-configured monitors and leave previously configured custom monitors intact. This includes the custom monitors that were created when changing an existing pre-configured monitor.When the set of pre-configured monitors for All and FactoryDefault is the same, then the difference between the two is, that with FactoryDefault all custom monitors are deleted before the factory default pre-configured monitors are restored.</td></tr><tr><td>New</td><td>8</td><td>Remark(s)</td><td>Upon receipt of a SetMonitoringBaseRequest for:monitoringBase = HardWiredOnly: the Charging Station will deactivate all pre-configured monitors and remove any previously configured custom monitors. Only the HardWiredMonitor monitors remain-monitoringBase = FactoryDefault: the Charging Station will (re)activate all PreconfiguredMonitor monitors and remove all custom monitors-monitoringBase = All: the Charging Station will activate all pre-configured monitors and leave previously configured CustomMonitor monitors intact. This includes the custom monitors that were created when changing an existing pre-configured monitor.</td></tr></table>

# 2.55. Page 331 - (2025-01) - N03.FR.04: text improvement

Improved requirement text for N03.FR.04.

<table><tr><td>Old</td><td>N03.FR.04</td><td>N03.FR.01 AND
When the Charging Station received a setMonitoringBaseRequest with monitoringBase FactoryDefault</td><td>Then the Charging Station SHALL delete all custom monitors (including overruled pre-configured monitors) and activate the default monitoring settings as recommended by the manufacturer.</td></tr><tr><td>New</td><td>N03.FR.04</td><td>N03.FR.01 AND
When the Charging Station received a setMonitoringBaseRequest with monitoringBase FactoryDefault</td><td>Then the Charging Station SHALL delete all custom monitors (including overruled pre-configured monitors) and activate the pre-configured monitors of the Charging Station.</td></tr></table>

# Page 434 - MonitoringBaseEnumType description update

The description has been updated to be better aligned with the use case.

<table><tr><td>Value</td><td>Description</td></tr><tr><td>All</td><td>Activate all pre-configured monitors while leaving custom monitors intact, including those that overrule a pre-configured monitor.</td></tr><tr><td>FactoryDefault</td><td>(Re)activate the default monitoring settings has recommended by the manufacturer. This is a subset of all pre-configured monitors of Charging Station and remove all custom monitors.</td></tr><tr><td>HardWiredOnly</td><td>Removes all custom monitors and disables all pre-configured monitors.</td></tr></table>

# 2.56. Page 350 - (2025-02) - 001 - Added missing requirements

Added missing requirements explicitly specifying behaviour of Charging Station it contains one or more displays.

New requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td colspan="3">Multiple Display support</td></tr><tr><td>001.FR.20</td><td>When Charging Station has multiple displays AND Charging Station receives a [setdisplaymessagerequest] without a display element in its MessageInfoType</td><td>Charging Station SHOULD use the message for the main display(s)</td></tr><tr><td>001.FR.21</td><td>When receiving a GetBaseReportRequest AND Charging Station has one or more displays</td><td>Charging Station SHOULD include in the report a Display component for every display it contains.</td></tr><tr><td>001.FR.22</td><td>When Charging Station receives a [setdisplaymessagerequest] with Display element referencing an unknown Display in its MessageInfoType</td><td>Charging Station SHOULD respond with a [setdisplaymessageresponse] with status = Rejected.</td></tr><tr><td>001.FR.23</td><td>When Charging Station receives a [setdisplaymessagerequest] with Display element referencing a known Display in its MessageInfoType</td><td>Charging Station SHOULD use the message only for the specified display.</td></tr></table>

# 2.57. Page 446 - (2025-01) - ActiveNetworkProfile is incorrectly marked as optional

The referenced variable OCPPCommCtrlActiveNetworkProfile is incorrectly marked as optional. As the description states this variable needs to be implemented when the Charging Station supports the NetworkConnectionProfile use cases B09/B10. These use cases are an integral part of the Core of OCPP. In addition, all other NetworkConnectionProfile related referenced variables are already required; OCPPCommCtrl.NetworkConfigurationPriority and OCPPCommCtrl.NetworkProfileConnectionAttempts. Therefore, OCPPCommCtrl.ActiveNetworkProfile should also be marked as required.

ActiveNetworkProfile

<table><tr><td>Required</td><td colspan="3">yes</td></tr><tr><td>Component</td><td>componentName</td><td colspan="2">OCPPCommCtrlr</td></tr><tr><td rowspan="3">Variable</td><td>variableName</td><td colspan="2">ActiveNetworkProfile</td></tr><tr><td>variableAttributes</td><td>mutability</td><td>ReadOnly</td></tr><tr><td>variableCharacteristics</td><td>dataType</td><td>integer</td></tr><tr><td>Description</td><td colspan="3">This variable indicates the NetworkConnectionProfile configuration slot the Charging Station currently uses for its connection with the CSMS.</td></tr></table>

# 2.58. Page 327 - (2025-09) - N01.FR.12 - Improved definition

Updated requirement definition to clarify the AcceptedCanceled status.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Old</td><td>N01.FR.12</td><td>When a Charging Station is assembling or uploading the log file AND the Charging Station receives a new GetLogRequest</td><td>The Charging Station SHOULD cancel the ongoing log file upload AND respond with status AcceptedCanceled.</td></tr><tr><td>New</td><td>N01.FR.12</td><td>When a Charging Station is assembling or uploading the log file AND the Charging Station receives a new GetLogRequest</td><td>The Charging Station SHOULD cancel the ongoing log file upload AND respond GetLogResponse with status AcceptedCanceled.</td></tr></table>

# 2.59. Page 328 - (2025-09) - N02: changed empty to absent.

A number of requirements previously stated "empty" when they should have indicated "absent." For example, the phrases referring to monitoringCriteria and componentVariables being "empty" are incorrect. These arrays cannot be empty; they must be absent

# 2.60. Page 453 - (2025-01) - References to monitorValue changed to value [354]

The specification in N Diagnostics consistently refers to a variable monitorValue, but this variable is called value in JSON schemas.

All occurrences of monitorValue in N Diagnostics have been changed to value.

# 2.61. Page 454 - (2025-01) - N04.FR.06 Improved limit definition of thresholds [353]

The requirement has been defined more exact, because limits for upper and lower differ slightly.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>N04.FR.06</td><td>When the Charging Station receives a SetVariableMonitoringRequest with monitor type UpperThreshold or LowerThreshold AND the monitorValue is lower or higher than the range of the given Variable</td><td>The Charging Station SHALL set the attributeStatus field in the corresponding SetMonitoringResult to: Rejected.</td><td>More information can be provided in the optional statusInfo element.</td></tr><tr><td>New</td><td>N04.FR.06</td><td>When the Charging Station receives a SetVariableMonitoringRequest with (monitor type = UpperThreshold AND monitorValue &lt; minLimit OR monitorValue &gt; maxLimit) OR (monitor type = LowerThreshold AND monitorValue &lt; minLimit OR monitorValue &gt; maxLimit)</td><td>The Charging Station SHALL set the attributeStatus field in the corresponding SetMonitoringResult to: Rejected.</td><td>minLimit and maxLimit refer to the [cmn_variablecharacteristictype] for the [cmn_variabletype]. Be aware that setting a UpperThreshold to the maxLimit or setting a LowerThreshold to the minLimit will result in a monitor that will never trigger. More information on the reason of rejection can be provided in the optional statusInfo element.</td></tr></table>

# 2.62. Page 456 - (2025-02) - New configuration variable to allow TLS wildcard certificates

New configuration key

# AllowCSMSTLSWildcards

<table><tr><td>Required</td><td colspan="3">no</td></tr><tr><td>Component</td><td>componentName</td><td colspan="2">SecurityCtrlr</td></tr><tr><td rowspan="3">Variable</td><td>名字</td><td colspan="2">AllowCSMSTLSWildcards</td></tr><tr><td>attributes</td><td>mutability</td><td>ReadWrite</td></tr><tr><td>characteristics</td><td>dataType</td><td>boolean</td></tr></table>

<table><tr><td>Description</td><td>This variable allows a Charging Station to support non-compliant OCPP behavior and connect to a CSMS that uses a wildcard TLS server certificate for the OCPP connection.
If this variable is present it SHALL be ReadWrite. If this variable is not implemented or has value false, the OCPP-compliant behavior is that a Charging Station rejects a connection from a CSMS that presents a wildcard certificate.
It is highly RECOMMENDED to not allow wildcard certificates.</td></tr></table>

# 2.63. Page 458 - (2025-01) - Added optional variable to allow the Charging Station to report its supported idTokenTypes

Currently there is no method for the Charging Station to report which idTokenTypes it supports. This would be very useful for a CSMS to know and will improve the automated onboarding of Charging Stations.

# SupportedIdTokentypes

<table><tr><td>Required</td><td colspan="3">no</td></tr><tr><td>Component</td><td>componentName</td><td colspan="2">AuthCtrlr</td></tr><tr><td rowspan="4">Variable</td><td>variableName</td><td colspan="2">SupportedIdTokenTypes</td></tr><tr><td>variableAttributes</td><td>mutability</td><td>ReadOnly</td></tr><tr><td rowspan="2">variableCharacteristics</td><td>dataType</td><td>MemberList</td></tr><tr><td>valuesList</td><td>List of IdTokenEnumType.</td></tr><tr><td>Description</td><td colspan="3">The subset of the list of supported IdTokenTypes as defined by IdTokenEnumtype, that is supported by the Charging Station.</td></tr></table>

# 2.64. Page 462 - (2025-01) - Added note to EnergyTransfer description as TxStartPoint

A note has been added to the description of the EnergyTransfer TxStartPoint to warn for potential skews of the values of the energy meter readings associated with start of the transaction.

<table><tr><td>Value</td><td>Description</td></tr><tr><td rowspan="2">EnergyTransfer</td><td>Energy is being transferred between EV and EVSE.</td></tr><tr><td>Note: Since energy needs to start flowing first to cause the transaction to be started, there is a small time gap (order of milliseconds) between the start of energy transfer and start of transaction. Depending on the implementation this may potentially skew the value of the energy meter reading associated with start of the transaction. Use PowerPathClosed as TxStartPoint to avoid this situation.</td></tr></table>

# 2.65. Page 467 - (2025-09) - Error in description of AssociatedData interval variables [1043]

The Interval and TxEndInterval variables of AssociatedDataCtrl mention an incorrect time and duration format (ISO8601) that is not supported by OCPP.

# 2.65.1.AlignedDataInterval

<table><tr><td>...</td><td>...</td></tr><tr><td>Description</td><td>Size (in seconds) of the clock-aligned data interval, intended to be transmitted in the MeterValuesRequest or TransactionEventRequest message. This is the size (in seconds) of the set of evenly spaced aggregation intervals per day, starting at 00:00:00 (midnight). For example, a value of 900 (15 minutes) indicates that every day should be broken into 96 15-minute intervals.
When clock-aligned data is being transmitted, the interval in question is identified by the start time and (optional) duration interval value, represented according to the ISO8601 standard.
A value of "0" (numeric zero), by convention, is to be interpreted to mean that no clock-aligned data should be transmitted.</td></tr></table>

# 2.65.2.AlignedDataTxEndedInterval

<table><tr><td>...</td><td>...</td></tr><tr><td>Description</td><td>Size (in seconds) of the clock-aligned data interval, intended to be transmitted in the TransactionRequest (eventType = Ended) message. This is the size (in seconds) of the set of evenly spaced aggregation intervals per day, starting at 00:00:00 (midnight). For example, a value of 900 (15 minutes) indicates that every day should be broken into 96 15-minute intervals.
When clock-aligned data is being collected, the interval in question is identified by the start time and (optional) duration interval value, represented according to the ISO8601 standard. All intervals are transmitted (if so enabled) at the end of the transaction in 1 TransactionRequest (eventType = Ended) message.
This is not a recommended practice, since the size of the message can become very large.</td></tr></table>

# 2.66. Page 476 - (2025-01) - Added Connector component to AvailabilityState referenced variable

It was already possible to report the AvailabilityState of the Connector component, however the definition was missing at this table.

# AvailabilityState

<table><tr><td>Required</td><td colspan="3">yes</td></tr><tr><td rowspan="4">Components</td><td rowspan="3">componentName</td><td colspan="2">ChargingStation</td></tr><tr><td colspan="2">EVSE</td></tr><tr><td colspan="2">Connector</td></tr><tr><td>evse</td><td colspan="2">* (for EVSE and Connector)</td></tr><tr><td rowspan="4">Variable</td><td>variableName</td><td colspan="2">AvailabilityState</td></tr><tr><td>variableAttributes</td><td>mutability</td><td>ReadOnly</td></tr><tr><td rowspan="2">variableCharacteristics</td><td>dataType</td><td>optionList</td></tr><tr><td>valuesList</td><td>Available, Occupied, Reserved, Unavailable, Faulted</td></tr><tr><td>Description</td><td colspan="3">This variable reports current availability state for the ChargingStation, EVSE and Connector. When this variable reports the Connector AvailabilityState, it replicates the connectorStatus values as would be reported by the StatusNotification messages.
An EVSE or Connector component is addressed on its own tier. So, EVSE #1 is addressed as component EVSE on tier evse.id = 1, and EVSE #1, Connector #1 is addressed as component Connector on tier evse.id = 1, evseconnectorId = 1.</td></tr></table>

# 3. Part 3

Currently no new errata for OCPP 2.0.1 part 3.

# 4. Part 4

# 4.1. Page 6 - (2025-01) - 3.1.1. The connection URL

The following clarifying text was added:

<table><tr><td>Old text</td><td>[...] percent-encoded [...]</td></tr><tr><td>New text</td><td>[...] percent-encoded / URL encoded [...]</td></tr></table>

# 4.2. Page 7 - (2025-01) - 3.1.2. OCPP version

The following text has been rewritten for clarity:

<table><tr><td>Old text</td><td>The OCPP version should not be part of the OCPP-J endpoint URL string if you want to select the OCPP version to use via the websocket protocol negotiation mechanism, as explained in Server Response.</td></tr><tr><td>New text</td><td>If the OCPP version is part of the OCPP-J endpoint URL it SHALL not determine the OCPP version to use, because the OCPP version is selected via the websocket protocol negotiation mechanism, as explained in section 3.3 [server-response].</td></tr></table>

# 4.3. Page 8 - (2025-01) - 3.3. WebSocket Compression

The following text was duplicate. The duplication has been removed and the text has been clarified:

<table><tr><td>Old text</td><td>OCPP Requires the CSMS (and Local Controller) to support RFC 7692, WebSocket compression is seen as a relative simple way to reduce mobile data usage. For a Charging Station this is not a hard requirement, as this might be more complex to implement on an embedded platform, but as this is seen as efficient solution to reduce mobile data usage, it is RECOMMENDED to be implemented on a Charging Station that uses a mobile data connection. 
OCPP Requires the CSMS (and Local Controller) to support RFC 7692, WebSocket compression is seen as a relative simple way to reduce mobile data usage. For a Charging Station this is not a hard requirement, as this might be more complex to implement on an embedded platform, but as this is seen as efficient solution to reduce mobile data usage, it is RECOMMENDED to be implemented on a Charging Station that uses a mobile data connection.</td></tr><tr><td>New text</td><td>The CSMS (and Local Controller) SHALL support RFC 7692, WebSocket compression, which is a relative simple way to reduce mobile data usage. For a Charging Station this is not a hard requirement, as this might be more complex to implement on an embedded platform. It is RECOMMENDED to be implemented on a Charging Station, because it is an efficient solution to reduce mobile data usage.</td></tr></table>

# 4.4. Page 10 - (2025-01) - 4.1.3. The message type

OLD: |CALL |2 | Request message |CALLRESULT |3 | Response message

New:

|CALL |2 | Request message, i.e. messages ending in "Request" |CALLRESULT |3 | Response message, i.e. message ending in "Response"

# 4.5. Page 10 - (2025-01) - 4.1.3. The message type

Refer to 'system', instead of 'server'.

<table><tr><td>Old text</td><td>When a server receives a message with a Message Type Number not in this list, it SHALL ignore the message payload. Each message type may have additional required fields.</td></tr><tr><td>New text</td><td>When a system receives a message with a Message Type Number not in this list, it SHALL ignore the message payload. Each message type may have additional required fields.</td></tr></table>

# 4.6. Page 10 - (2024-09) - 4.1.4. Message ID

Change the following text in paragraph 4.1.4:

<table><tr><td>Old text</td><td>The message ID serves to identify a request. A message ID for any CALL message MUST be different from all message IDs previously used by the same sender for any other CALL messages on any WebSocket connection using the same unique Charging Station identifier. This also applies to retries of messages.</td></tr><tr><td>New text</td><td>The message ID serves to identify a request. A message ID for any CALL message MUST be different from all message IDs previously used by the same sender for any other CALL messages on any WebSocket connection using the same unique Charging Station identifier. The message ID for a retracted message (e.g. when no response was received within timeout) MAY be identical to the message ID of the original message.</td></tr></table>

# 4.7. Page 13 - (2025-01) - 4.2.3. CALLERROR

In the example, the ErrorDescription text has been updated:

<table><tr><td>Old text</td><td>&quot;SetDisplayMessageRequest not implemented&quot;</td></tr><tr><td>New text</td><td>&quot;SetDisplayMessageRequest not supported&quot;</td></tr></table>

# 4.8. Page 15 - (2025-01) - 5. Connection

The following clarifying text has been added related to the TLS fragment length:

# 4.9. TLS fragment length

TLS involves sending "Records" between peers. Records can be of type "Handshake", "Alert", "ChangeCipherSpec", "Heartbeat" or "Application". OCPP messages are sent in Application records. The payload contains a "fragment" of the application data. The record layer fragments information blocks into TLS plaintext records carrying data in chunks of 2^14 bytes (16kB) or less.

TLS peers need to maintain an input and an output buffer to store an entire fragment of $16\mathrm{~kB}$ . For a low resource device it is a large cost to allocate $32\mathrm{~kB}$ for the TLS connection.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/35ba1bd8fb8263df3faa8bf28b7bd4f49f5171cf3e7d5f6d74281f8e3df91a1f.jpg)  
Peers allocating standard 16 kB TLS buffers

A TLS extension is defined in TLS Extensions RFC6066 Section 4, that allows the client to ask for a different maximum fragment length than the default $16\mathrm{kB}$ . A client can ask for a maximum fragment length of $0.5\mathrm{kB}, 1\mathrm{kB}, 2\mathrm{kB}$ or $4\mathrm{kB}$ . This TLS extension is, however, not widely supported and native managed cloud TLS termination services typically don't support this.

A resource-constrained Charging Station SHOULD try to negotiate a smaller TLS maximum fragment size, and if that is not accepted by the peer, then Charging Station MAY unilaterally decide to allocate less memory to its TLS output buffer. A TLS maximum fragment length of $2\mathrm{kB}$ is suggested based on data collection during certification tests, which shows that $99\%$ of the messages fit in a $2\mathrm{kB}$ buffer.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/684faf12-48da-4943-b2a6-f29c6a0202aa/0d1fe7e2451b11d463f8958d12659ef5013cdc349873146c356cffa41083cf93.jpg)  
Charging Station allocating a 2 kB TLS output buffer

# 4.10. Page 15 - (2025-01) - 5.3. WebSocket Ping in relation to OCPP Heartbeat

The following clarifying text was added:

New text

A Heartbeat message checks connectivity end-to-end, whereas a WebSocket ping/pong only checks from point-to-point. This makes a difference in an extended network topology with a Local Controller between Charging Station and CSMS.

# 4.11. Page 15 - (2025-01) - 5 Connection - Added section about TLS fragment length

As a result of the discussions at the OCPP lite taskgroup, a section has been added providing guidance on implementing TLS fragment negotiation.

# 4.12. Page 16 - (2025-04) - 5.3 Reconnecting - reset backoff wait timer

The RetryBackOffWaitMinimum timer is to be used the first time it tries to connect. A sentence has been added to below paragraph to make it explicit that it needs to be reset after successful connection.

The first reconnection attempts SHALL be after a back-off time of: RetryBackOffWaitMinimum seconds, plus a random value with a maximum of RetryBackOffRandomRange seconds. After every failed reconnection attempt the Charging Station SHALL double the previous back-off time, with a maximum of RetryBackOffRepeatTimes, adding a new random value with a maximum of RetryBackOffRandomRange seconds to every reconnection attempt. After RetryBackOffRepeatTimes reconnection attempts, the Charging Station SHALL keep reconnecting with the last back-off time, not increasing it any further. After a successful connection the backoff wait timer SHALL be reset to RetryBackOffWaitMinimum seconds.

# 4.13. Page 18 - (2025-02) - 6.3 Connection loss - Allow Local Controller to keep connection open

The sentence in this section was too strict about requiring a Local Controller to always close the connection with its charging stations when the connection with CSMS is lost. The sentence has been updated in order to allow for Local Controller implementations that are able to manage the local charging stations locally (for a limited time) when the connection with CSMS is down.

Old text

Whenever one or more WebSocket connections between CSMS and the Local Controller are lost, the Local Controller SHALL close all corresponding WebSocket to the Charging Stations that are connected to it.

<table><tr><td>New text</td><td>Whenever one or more WebSocket connections between CSMS and the Local Controller are lost, the Local Controller SHALL close all corresponding WebSocket to the Charging Stations that are connected to it, unless the Local Controller is capable of responding to Charging Station requests, and forwards transaction-related requests to the CSMS once the connection is restored.</td></tr></table>

# 5. Part 5

# 5.1. General - (2025-02) - Renamed OCTT to Test System

Updated (2025-04)

In the entire document, the term A few references to "OCTT" have been replaced by "Test System" (mostly "OCTT Id" has been replaced by "TC id").

# 5.2. Page 7-48 - (2025-09) - Add additional support for different types of Charging Stations

Added support for additional different types of Charging Stations:

- Wireless inductive Charging Stations

。For this a product subtype Wireless Charging Station has been added.

- Charging Stations with different connectorTypes (like sType1) without (automatic) mechanized locking mechanisms

. For this an additional question has been added: AQ-18: Does your Charging Station have at least one connector with an (automatic) mechanized locking mechanism on Charging Station side? (this is always true for connectorTypes; sType2 and sType3)

- Charging Stations with a RFID reader to start a transaction and a stop button to stop the transaction.

For this new stop local authorization methods C-70, C-71, C-72 and C-75 have been added, which makes it possible to have different authorization methods for the start and for the stop.

As a result of above additions/updates, many testcase conditions have been updated to incorporate them accordingly.

# 5.3. Page 7 - (2025-02) - Changed definition of C-01 Support for offline authorization of transactions

The current definition is does not take into account the supported local authorization methods in relation to the features to locally store Tokens.

<table><tr><td>Old</td><td>C-01</td><td>Support for offline authorization of transactions</td><td>Optional. 
Supporting this feature depends on whether at least one of the following is supported; 
- Certification Profile: Local Authorization List Management 
- C-02: Support for allowing offline authorization for unknown ids 
- C-49: Authorization Cache (AuthCacheEnabled)</td></tr><tr><td>New</td><td>C-01</td><td>Support for offline authorization of transactions</td><td>Conditional. 
Supporting this feature depends on whether at least one of the following feature combinations is supported; 
- Certification Profile: Local Authorization List Management AND at least one of the following local authorization options; C-30 or C-31 or C-32 or C-34. 
- C-02: Support for allowing offline authorization for unknown ids AND at least one of the following local authorization options; C-30 or C-31 or C-32 or C-33 or C-34. 
- C-49: Authorization Cache AND at least one of the following local authorization options; C-30 or C-31 or C-32 or C-34. 
- C-35: Local Authorization - NoAuthorization (Because there is no authorization, no local authorization mechanism is needed.)</td></tr></table>

# 5.4. Page 9 - (2024-11) - Optional feature list for charging station - Change name R-3

The specified name of feature R-3 is not correct. It should reflect the ability to disable reservations.

<table><tr><td>Old</td><td>R-3</td><td>Reservation support (ReservationEnabled)</td><td>Configuration Variable for H01</td></tr><tr><td>New</td><td>R-3</td><td>Support for disabling Reservations (ReservationEnabled)</td><td>Configuration Variable for H01</td></tr></table>

# 5.5. Page 9 - (2025-02) - Optional feature list for charging station - Added AQ-10 to make TC_N_48_CS conditional

Added AQ-10 to make TC_N_48_CS conditional.

<table><tr><td>Id</td><td>Additional questions for lab testing</td></tr><tr><td>AQ-10</td><td>Does your Charging Station support setting a Delta monitor on the WriteOnly component(variable SecurityCtrl.BasicAuthPassword?</td></tr></table>

# 5.6. Page 9/11/27/48/52 - (2025-02) - Removed feature ISO-3, added additional question AQ-11

# Page 9 - Optional feature list for charging station

<table><tr><td></td><td colspan="3">ISO 15118 support</td></tr><tr><td>Removed</td><td>ISO-3</td><td>Combined charging station Certificate (for both OCPP and ISO 15118)</td><td>Optional</td></tr></table>

Page 11 - Optional feature list for CSMS

<table><tr><td></td><td colspan="3">ISO 15118 support</td></tr><tr><td>Removed</td><td>ISO-3</td><td>Combined charging station certificate (for both OCPP and ISO 15118)</td><td>Optional</td></tr></table>

Page 27 - Test Cases Core

<table><tr><td></td><td></td><td>Trigger message</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>Old</td><td>TC_F_27</td><td>NotImplemented</td><td>C</td><td>M</td><td>For CS: can only be done when SignCombinedCertificate is notimplemented</td><td>NOT ISO-3</td><td></td></tr><tr><td>New</td><td>TC_F_27</td><td>NotImplemented</td><td>C</td><td>M</td><td>For CS: can only be done when SignCombinedCertificate is notimplemented</td><td>NOT AQ-11</td><td></td></tr></table>

Page 48 - Questions for Charging Stations

<table><tr><td></td><td>Id</td><td>Additional questions for lab testing</td></tr><tr><td>Added</td><td>AQ-11</td><td>Does your Charging Station support a combined charging station Certificate (for both OCPP and ISO 15118)</td></tr></table>

Page 52 - Appendix C: Features vs. OCPP use cases

<table><tr><td></td><td>Id</td><td>Feature</td><td>Related use cases</td></tr><tr><td></td><td colspan="3">ISO 15118 support</td></tr><tr><td>Removed</td><td>ISO-3</td><td>Combined charging station certificate (for both OCPP and ISO 15118)</td><td>A02/A03</td></tr></table>

# 5.7. Page 9/10 - (2025-06) - Optional feature list for charging station & CSMS - Add optional feature for Security Profile 1

Security profile 1 has become optional for Core certification.

<table><tr><td>Added</td><td>C-61</td><td colspan="4">Security Profile 1 - Unsecured Transport with Basic Authentication</td><td colspan="2">Optional</td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>TC_A_20</td><td>No valid CSMSRootCertificate installed</td><td>C</td><td></td><td>If the last CSMSRootCertificate can be removed and Security Profile 1 is supported.</td><td>AQ-1 and C-61</td><td>Can the last CSMSRootCertificate be removed? 
Security Profile 1 - Unsecured 
Transport with Basic 
Authentication</td><td></td></tr></table>

# 5.8. Page 13 - (2025-09) - Added TC_B_14_CS (as optional) to the Core profile

TC_B_14_CS was already a mandatory part of the Advanced Device Management profile, however it should also be possible to support the Summary inventory as part of the Core profile. Therefore, it will be added as an optional part of the Core profile.

<table><tr><td>Added to Core</td><td>TC_B_14</td><td>SummaryInventory</td><td>C</td><td></td><td></td><td>C-56</td><td></td></tr></table>

# 5.9. Page 13 - (2025-02) - Updated Id's of the additional questions of CSMSs in the appendix

The following Id's of additional questions for CSMSs have been updated:

<table><tr><td>Old</td><td>TC_B_30</td><td>Pending/Rejected - SecurityError</td><td>M</td><td>C</td><td>For CSMS: if CSMS can be configured to first respond to a BootNotificationRequest with status Pending or Rejected</td><td>C-44 or NOT AQ-6</td><td>BootNotification Pending or Does the CSMS reject unknown Charging Stations during websocket connection setup?</td></tr><tr><td>New</td><td>TC_B_30</td><td>Pending/Rejected - SecurityError</td><td>M</td><td>C</td><td>For CSMS: if CSMS can be configured to first respond to a BootNotificationRequest with status Pending or Rejected</td><td>C-44 or NOT AQ-16</td><td>BootNotification Pending or Does the CSMS reject unknown Charging Stations during websocket connection setup?</td></tr><tr><td>Old</td><td>TC_B_31</td><td>Pending/Rejected - TriggerMessage</td><td></td><td>C</td><td>For CSMS: if CSMS can be configured to first respond to a BootNotificationRequest with status Pending or Rejected</td><td>C-44 or NOT AQ-6</td><td>BootNotification Pending or Does the CSMS reject unknown Charging Stations during websocket connection setup?</td></tr><tr><td>New</td><td>TC_B_31</td><td>Pending/Rejected - TriggerMessage</td><td></td><td>C</td><td>For CSMS: if CSMS can be configured to first respond to a BootNotificationRequest with status Pending or Rejected</td><td>C-44 or NOT AQ-16</td><td>BootNotification Pending or Does the CSMS reject unknown Charging Stations during websocket connection setup?</td></tr></table>

# 5.10. Page 15 - (2025-04) - Addition of new testcase for CSMS to test WebSocket Subprotocol negotiation

New

TC_B_58

WebSocket Subprotocol negotiation

M

# 5.11. Page 17/33 - (2025-02) - Test Cases Local Authorization List Management & Authorization Cache - Update conditions

Testcases marked as mandatory have conditions that are not applicable and should be removed. The CWG decided that online local authorization list and authorization cache testcase can also be tested with remote authorization. In addition, local auth method C-34 MacAddress has been added to the offline conditions as possible method to use.

Authorization Cache

<table><tr><td></td><td>Store Authorization Data in the Authorization Cache</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>TC_C_32</td><td>Persistent over reboot</td><td>C</td><td></td><td>If the Charging Station has an authorization cache, then it must support this use case</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_33</td><td>Update onauthorizeResponse</td><td>C</td><td></td><td>If the Charging Station has an authorization cache, then it must support this use case</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_34</td><td>Update on TransactionResponse</td><td>C</td><td></td><td>If the Charging Station has an authorization cache, then it must support this use case</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_36</td><td>AuthCacheCtrl.LocalPreAuthorize = false</td><td>C</td><td></td><td>If the Charging Station has an authorization cache and AuthCacheEnabled is implemented</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_46</td><td>AuthCacheLifeTime</td><td>C</td><td></td><td>If the Charging Station has an authorization cache and supports to set a lifetime for its entries.</td><td>C-49 and C-53</td><td>Authorization Cache &amp; AuthCacheLifeTime</td></tr><tr><td></td><td>Clear Authorization Data in Authorization Cache</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>TC_C_37</td><td>Accepted</td><td>C</td><td>M</td><td>If the Charging Station has an authorization cache, then it must support this use case</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_38</td><td>Rejected</td><td>C</td><td>M</td><td>If the Charging Station has an authorization cache and AuthCacheEnabled is implemented</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td></td><td>Authorization by GroupId</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>TC_C_41</td><td>Success with Authorization Cache</td><td>C</td><td></td><td>For CS:- The Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34- If the Charging Station has an authorization cache.</td><td>C-49 and (C-30 or C-31 or C-32 or C-34)</td><td>Authorization Cache</td></tr><tr><td>TC_C_44</td><td>Invalid status with Authorization Cache</td><td>C</td><td></td><td>For CS:- The Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34- If the Charging Station has an authorization cache.</td><td>C-49 and (C-30 or C-31 or C-32 or C-34)</td><td>Authorization Cache</td></tr><tr><td></td><td>Authorization through authorization cache</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>TC_C_08</td><td>Accepted</td><td>C</td><td>M</td><td>If the Charging Station has an authorization cache</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_09</td><td>Invalid &amp; Not Accepted</td><td>C</td><td></td><td>If the Charging Station has an authorization cache</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_12</td><td>Invalid &amp; Accepted</td><td>C</td><td></td><td>If the Charging Station has an authorization cache</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_10</td><td>Blocked</td><td>C</td><td></td><td>If the Charging Station has an authorization cache</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_11</td><td>Expired</td><td>C</td><td></td><td>If the Charging Station has an authorization cache</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_13</td><td>Accepted but cable not connected yet.</td><td>C</td><td></td><td>If the Charging Station has an authorization cache</td><td>C-49</td><td>Authorization Cache</td></tr><tr><td>TC_C_15</td><td>StopTxOnInvalidld = false, MaxEnergyOnInvalidld &gt; 0</td><td>C</td><td></td><td>If the Charging Station has an authorization cache AND the Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34If MaxEnergyOnInvalidld is implemented.</td><td>C-49 and C-03 and (C-30 or C-31 or C-32 or C-34)</td><td>Authorization Cache &amp; MaxEnergyOnInvalidld</td></tr><tr><td>TC_C_16</td><td>StopTxOnInvalidld = true</td><td>C</td><td></td><td>If the Charging Station has an authorization cache AND the Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34</td><td>C-49 and (C-30 or C-31 or C-32 or C-34)</td><td>Authorization Cache</td></tr><tr><td>TC_C_17</td><td>StopTxOnInvalidld = false</td><td>C</td><td></td><td>If the Charging Station has an authorization cache AND the Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34</td><td>C-49 and (C-30 or C-31 or C-32 or C-34)</td><td>Authorization Cache</td></tr><tr><td>TC_C_18</td><td>StopTxOnInvalidld = true, MaxEnergyOnInvalidld &gt; 0</td><td>C</td><td></td><td>If the Charging Station has an authorization cache AND the Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34If MaxEnergyOnInvalidld is implemented.</td><td>C-49 and C-03 and (C-30 or C-31 or C-32 or C-34)</td><td>AuthorizationCache &amp; MaxEnergyOnInvalidld</td></tr><tr><td>TC_C_20</td><td>Invalid</td><td></td><td>M</td><td></td><td></td><td></td></tr><tr><td>TC_C_57</td><td>AuthCacheDisablePostAuthorize</td><td>C</td><td></td><td>If the Charging Station supports the option for disabling remote authorization for cached invalid Tokens AND has an authorization cache</td><td>C-59 and C-49</td><td></td></tr><tr><td></td><td>Local start transaction - Authorization first</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td>....</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>TC_E_52</td><td>DisableRemoteAuthorization</td><td>C</td><td></td><td>If the Charging Station supports the option for disabling remote authorization and The Charging Station supports at least one of the following local start authorization options C-30, C-31, C-32, C-34 and Either Authorization Cache or Local Authorization List is supported.</td><td>C-58 and (C-30 or C-31 or C-32 or C-34) and (C-49 or Local Authorization List Managem ent)</td><td>Local Authorization - using RFID ISO14443 / RFID ISO15693 / KeyCode / MacAddress &amp; Authorization Cache &amp; Local Authorization List.</td></tr><tr><td></td><td>....</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td>Offline Behaviour</td><td></td><td></td><td></td><td></td><td></td></tr></table>

Local Authorization List Management

<table><tr><td></td><td>Store Authorization Data in the Authorization Cache</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>TC_E_45</td><td>Stop transaction during offline period - Same GroupId</td><td>C</td><td></td><td>For CS: the Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34 and Local Authorization List or Authorization Cache</td><td>(C-30 or C-31 or C-32 or C-34) AND (Local Authorization List Management or C-49)</td><td>Local Authorization - using RFID ISO14443 / RFID ISO15693 / KeyCode / MacAddress and Local Authorization List or Authorization Cache</td></tr></table>

<table><tr><td colspan="5"></td><td colspan="2">Related features</td></tr><tr><td>TC Id</td><td>OCPP Compliance Testing Tool scenario</td><td>Conf. Test for Charging Station</td><td>Conf. test for CSMS</td><td>Condition / remark</td><td>Feature no.</td><td>Feature</td></tr><tr><td></td><td>Offline authorization through local authorization list</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>TC_C_21</td><td>Accepted</td><td>C</td><td></td><td>The Charging Station must support at least one of the following local start authorization options: C-30, C-31, C-32, C-34</td><td>C-30 or C-31 or C-32 or C-34</td><td></td></tr><tr><td>TC_C_22</td><td>Invalid</td><td>C</td><td></td><td>The Charging Station must support at least one of the following local start authorization options: C-30, C-31, C-32, C-34</td><td>C-30 or C-31 or C-32 or C-34</td><td></td></tr><tr><td>TC_C_23</td><td>Blocked</td><td>C</td><td></td><td>The Charging Station must support at least one of the following local start authorization options: C-30, C-31, C-32, C-34</td><td>C-30 or C-31 or C-32 or C-34</td><td></td></tr><tr><td>TC_C_24</td><td>Expired</td><td>C</td><td></td><td>The Charging Station must support at least one of the following local start authorization options: C-30, C-31, C-32, C-34</td><td>C-30 or C-31 or C-32 or C-34</td><td></td></tr><tr><td>TC_C_25</td><td>Local Authorization List &gt; Authorization Cache</td><td>C</td><td></td><td>The Charging Station must support at least one of the following local start authorization options: C-30, C-31, C-32, C-34</td><td>C-30 or C-31 or C-32 or C-34</td><td></td></tr><tr><td></td><td>Online authorization through local authorization list</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>TC_C_27</td><td>Accepted</td><td>M</td><td></td><td>&lt;Removed&gt;</td><td>&lt;Removed&gt;</td><td></td></tr><tr><td>TC_C_28</td><td>Invalid &amp; Not Accepted</td><td>M</td><td></td><td>&lt;Removed&gt;</td><td>&lt;Removed&gt;</td><td></td></tr><tr><td>TC_C_31</td><td>Invalid &amp; Accepted</td><td>M</td><td></td><td>&lt;Removed&gt;</td><td>&lt;Removed&gt;</td><td></td></tr><tr><td>TC_C_29</td><td>Blocked</td><td>M</td><td></td><td>&lt;Removed&gt;</td><td>&lt;Removed&gt;</td><td></td></tr><tr><td>TC_C_30</td><td>Expired</td><td>M</td><td></td><td>&lt;Removed&gt;</td><td>&lt;Removed&gt;</td><td></td></tr><tr><td>TC_C_58</td><td>LocalAuthListDisablePostAuthorize</td><td>C</td><td></td><td>The Charging Station supports the option for disabling remote authorization for invalid idTokens stored at the Local Authorization List.</td><td>LA-3</td><td></td></tr><tr><td></td><td>Authorization by GroupId</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>TC_C_40</td><td>Success with Local Authorization List</td><td>C</td><td>M</td><td>For CS:- The Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34</td><td>C-30 or C-31 or C-32 or C-34</td><td></td></tr><tr><td>TC_C_43</td><td>Invalid status with Local Authorization List</td><td>C</td><td>M</td><td>For CS:- The Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34</td><td>C-30 or C-31 or C-32 or C-34</td><td></td></tr></table>

# 5.12. Page 19 - (2024-09) - TC_E_04_CS Updated condition for test case to exclude it for MacAddress and ISO 15118 PnPc

This test case cannot be performed with the local authorization option MacAddress or ISO 15118 PnC.

<table><tr><td></td><td></td><td>Local start transaction - Authorization first</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>Old</td><td>TC_E_04</td><td>Success</td><td>C</td><td>M</td><td>Applicable if one or more of the local start authorization options is implemented.</td><td>C-30 - C-35 or ISO 15118 support</td><td>Authorization options for local start</td></tr><tr><td>New</td><td>TC_E_04</td><td>Success</td><td>C</td><td>M</td><td>Applicable if one or more of the local start authorization options is implemented.</td><td>(C-30 or C-31 or C-32 or C-33 or C-35)</td><td>Authorization options for local start</td></tr></table>

# 5.13. Page 22 - (2024-09) - TC_E_17_CS Updated condition for test case to correctly specify the applicable TxStopPoint combinations

This testcase allows for a limited set of TxStopPoint combinations, otherwise it is not applicable.

<table><tr><td></td><td></td><td>Local start transaction - Authorization first</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>Old</td><td>TC_E_17</td><td>Deauthorized - EV side disconnect</td><td>C</td><td>M</td><td>-TxStopPoint can either be ReadOnly with a subset of the values or have a valueList of supported values, that contains a subset. This testcase is applicable if the value Authorized or PowerPathClosed is a supported value.
- StopTxOnEVSideDisconnect needs to ReadWrite or ReadOnly with value true</td><td>(C-10.2 or C-10.3) and C-06.2 and AQ-9</td><td>Supported Transaction Stop points</td></tr><tr><td>New</td><td>TC_E_17</td><td>Deauthorized - EV side disconnect</td><td>C</td><td>M</td><td>This testcase is applicable if the value Authorized is a supported value for TxStopPoint AND EVConnected, PowerPathClosed and EnergyTransfer must not be set as TxStopPoint AND StopTxOnEVSideDisconnect true must be a supported value.</td><td>C-10.2 and C-06.2 and AQ-9 and NOT (NOT C-52 AND (10.1 OR C-10.3 OR 10.4))</td><td>Supported Transaction Stop points</td></tr></table>

# 5.14. Page 33 - (2025-06) - Fixed incorrect feature no reference

TC_A_21 referred to AQ-1, instead of AQ-3. This has been fixed.

<table><tr><td>TC_A_21</td><td>No valid ChargingStationCertificate installed</td><td>C</td><td></td><td>If the last ChargingStationCertificate can be removed (Via other means than OCPP).</td><td>AQ-3</td><td></td></tr></table>

# 5.15. Page 39 - (2025-02) - TC_N_48_CS Made conditional

This test case is only applicable if the Charging Station supports Delta monitoring on the SecurityCtrl.BasicAuthPassword component variable.

<table><tr><td>Old</td><td>TC_N_48</td><td>Variable monitoring on write only</td><td>M</td><td></td><td></td><td></td><td></td></tr><tr><td>New</td><td>TC_N_48</td><td>Variable monitoring on write only</td><td>C</td><td></td><td>CS: if the CS supports Delta monitoring on the SecurityCtrl.BasicAuthPassword</td><td>AQ-10</td><td></td></tr></table>

# 5.16. Page 40 - (2024-11) - TC_H_13_CS Updated invalid condition for test case

The condition should have been reversed.

<table><tr><td>Old</td><td>TC_H_13</td><td>Rejected</td><td>C</td><td></td><td>Depending on configuration variable
ReservationNonSpecificEVSE</td><td>R-2</td><td>Support reservations of unspecified EVSE</td></tr><tr><td>New</td><td>TC_H_13</td><td>Rejected</td><td>C</td><td></td><td>Depending on the Charging Station not supporting the configuration variable ReservationNonSpecificEVSE</td><td>NOT R-2</td><td>Support reservations of unspecified EVSE</td></tr></table>

# 5.17. Page 42 - (2025-02) - Removed TC_O_15_CS from certification program

# 5.18. Test Cases Advanced User Interface

<table><tr><td></td><td colspan="5"></td><td colspan="2">Related features</td></tr><tr><td>Removed</td><td>TC_O_15</td><td>Language preference of the EV Driver</td><td>M</td><td></td><td></td><td></td><td></td></tr></table>

# 5.19. Page 42 - (2025-06) - Make optional feature R-1 available for Charging Stations

The ConnectorEnumType list does not contain all connectorTypes. At OCPP 2.1 this enum has been changed to a string and can be extended, however this is not possible for OCPP 2.0.1. Therefore the reservation of connectorType testcases will not work for connectorTypes that are not part of the enum. It is not a major issue, because the CSMS can always reserve a specific EVSE based on the connectorTypes specified at the device model.

<table><tr><td></td><td colspan="5"></td><td colspan="2">Related features</td></tr><tr><td>Old</td><td>TC_H_15</td><td>Success</td><td>C</td><td>C</td><td></td><td>CSMS: R-1CS: R-2</td><td>For CSMS: Supportreservations of connectorType, For CS: Support forreservation of unspecifiedEVSE</td></tr><tr><td>New</td><td>TC_H_15</td><td>Success</td><td>C</td><td>C</td><td></td><td>R-1</td><td>Support reservations ofconnectorType</td></tr><tr><td>Old</td><td>TC_H_16</td><td>Amount of available connectors of a type equals theamount of reservations</td><td>C</td><td></td><td></td><td>R-2</td><td>Support for reservation ofunspecified EVSE</td></tr><tr><td>New</td><td>TC_H_16</td><td>Amount of available connectors of a type equals theamount of reservations</td><td>C</td><td></td><td></td><td>R-1</td><td>Support reservations ofconnectorType</td></tr></table>

Added for Charging Station:

<table><tr><td>Added</td><td>R-1</td><td>Support reservations of connectorType</td><td>Conditional.
Supporting this feature depends on whether at least one connectorType is supported that is part of the ConnectorEnumType list from part 2 specification.</td></tr></table>

# 5.20. Page 44 - (2025-02) - Removed TC_A_13_CS and TC_A_13_CSMS from certification program

# Test Cases ISO 15118 Support

<table><tr><td></td><td colspan="5"></td><td colspan="2">Related features</td></tr><tr><td>Removed</td><td>TC_A_13</td><td>Success - Combined Certificate</td><td>C</td><td>C</td><td>If Combined Charging Station Certificate is supported.</td><td>ISO-3</td><td>Combined Charging Station Certificate</td></tr></table>

# 5.21. Page 48 - (2024-06) - Added additional questions to appendix

Note: This erratum is extended by erratum: Page 48 - (2025-02) - Updated ld's of the additional questions for CSMSs in the appendix

The following additional questions are added for CSMSs:

<table><tr><td>Id</td><td>Additional questions for lab testing</td></tr><tr><td>AQ-3</td><td>Does your CSMS support Absolute values for the following Charging Profiles:</td></tr><tr><td>AQ-3.1</td><td>TxDefaultProfile</td></tr><tr><td>AQ-3.2</td><td>ChargingStationMaxProfile</td></tr><tr><td>AQ-4</td><td>Does your CSMS support Recurring values for the following Charging Profiles:</td></tr><tr><td>AQ-4.1</td><td>TxDefaultProfile</td></tr><tr><td>AQ-4.2</td><td>ChargingStationMaxProfile</td></tr></table>

# 5.22. Page 48 - (2025-02) - Updated Id's of the additional questions for CSMSs in the appendix

Note: This erratum extends erratum: Page 48 - (2024-06) - Added additional questions to appendix

Note: This erratum is extended by erratum: Page 48 - (2025-04) - Duplicate AQ-11 id

The following Id's of additional questions for CSMSs have been updated:

<table><tr><td>Old Id</td><td>New Id</td></tr><tr><td>AQ-1</td><td>AQ-11</td></tr><tr><td>AQ-2</td><td>AQ-12</td></tr><tr><td>AQ-3.1</td><td>AQ-13.1</td></tr><tr><td>AQ-3.2</td><td>AQ-13.2</td></tr><tr><td>AQ-4</td><td>AQ-14</td></tr><tr><td>AQ-4.1</td><td>AQ-14.1</td></tr><tr><td>AQ-4.2</td><td>AQ-14.2</td></tr><tr><td>AQ-6</td><td>AQ-16</td></tr></table>

# 5.23. Page 48 - (2025-04) - Duplicate AQ-11 id

Note: This erratum extends erratum: Page 48 - (2025-02) - Updated Id's of the additional questions for CSMSs in the appendix

At the 2025-02 errata sheet release, both for Charging Station and CSMS an additional question was added with id AQ-11, but these should be kept unique. The following Id's of additional questions for CSMSs have been updated:

<table><tr><td>Old Id</td><td>New Id</td></tr><tr><td>AQ-11</td><td>AQ-17</td></tr></table>

# 6. Part 6

# 6.1. General

# 6.1.1. Page XX - (2024-11) - All testcases - Updated table structure of all testcases

The table structure of all testcases have been updated. This has been done for multiple reasons:

- It improves readability by providing more space for the main steps.
- It decreases the chance of testcase tables being broken, resulting in missing steps at the bottom of a testcase.
- It makes it easier for the Technical Editors to update testcases.

# 6.1.2. Page XX - (2025-02) - Renamed OCTT to Test System

In the entire document, the term "OCTT" has been replaced by "Test System".

# 6.2. Charging Station

# 6.2.1. Page 4 - (2025-02) - TC_A_01_CS - Updated old identifierString reference in description

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:
[...]</td></tr><tr><td>- BasicAuthPassword may only contain alpha-numeric characters and the special characters allowed by identifierString.</td></tr><tr><td>- BasicAuthPassword may only contain alpha-numeric characters and the special characters allowed by passwordString.</td></tr><tr><td>Post scenario validations:
N/a</td></tr></table>

# 6.2.2. Page 7 - (2024-11) - TC_A_05_CS - Successfully reconnecting after every failed connection attempt

It is needed to reconnect after every (intended) failed connection, otherwise the retryBackoffTime may double itself several time, resulting in a very large number that may exceed the configured timeouts.

Table 6. Test Case Id: TC_A_05_CS

<table><tr><td>Test case name</td><td>TLS - server-side certificate - Invalid certificate</td></tr><tr><td>Test case Id</td><td>TC_A_05_CS</td></tr><tr><td>Use case Id(s)</td><td>A00</td></tr><tr><td>Requirement(s)</td><td>A00.FR.309,A00.FR.310,A00.FR.311,A00.FR.412,A00.FR.413,A00.FR.414</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>The CSMS uses a server-side certificate to identify itself to the Charging Station, when using security profile 2 or 3.</td></tr><tr><td>Purpose</td><td>To verify whether the Charging Station is able to terminate the connection when the received server certificate is invalid.</td></tr><tr><td>Prerequisite(s)</td><td>- The charging station supports security profile 2 and/or 3
- The active NetworkConnectionProfile uses either security profile 2 OR 3.
&lt;Removed&gt;</td></tr><tr><td>Test case name</td><td colspan="2">TLS - server-side certificate - Invalid certificate</td></tr><tr><td rowspan="3">Before(Preparations)</td><td colspan="2">Configuration State:OCPPCommCtrlt.NetworkConfigurationPriority only contains &lt;Value from ActiveNetworkProfile&gt;</td></tr><tr><td colspan="2">Memory State:N/a</td></tr><tr><td colspan="2">Reusable State(s):N/a</td></tr><tr><td rowspan="9">Main(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. The OCTT aborts the connection with the Charging Station.</td></tr><tr><td>2. The Charging Station initiates a TLS handshake and sends a Client Hello to the OCTT.</td><td>3. The OCTT responds with a Server HelloWith a &lt;Configured valid server certificate&gt;Note(s):- The OCTT will use this as an indication of the time it takes the Charging Station to reconnect.</td></tr><tr><td colspan="2">4. The OCTT aborts the connection with the Charging Station.</td></tr><tr><td>5. The Charging Station initiates a TLS handshake and sends a Client Hello to the OCTT.</td><td>6. The OCTT responds with a Server HelloWith a &lt;Configured invalid server certificate&gt;</td></tr><tr><td>7. The Charging Station deems the server certificate invalid and terminates the connection.</td><td></td></tr><tr><td colspan="2">Note: The OCTT will wait two times the measured reconnection time from step 3, before switching the server certificate back to the valid server certificate. The reason for this is that the OCTT is not always able to detect a failed connection attempt.</td></tr><tr><td>8. The Charging Station initiates a TLS handshake and sends a Client Hello to the OCTT.</td><td>9. The OCTT responds with a Server HelloWith a &lt;Configured valid server certificate&gt;Note(s):- The OCTT will accept the connection to prevent doubling of the RetryBackOffWaitMinimum.</td></tr><tr><td>10 The Charging Station sends aSecurityEventNotificationRequest</td><td>11 The OCTT responds with aSecurityEventNotificationResponse</td></tr><tr><td></td><td colspan="2">Note(s):- Steps 4 to 11 are repeated per configured invalid server certificate.- In case default certificates are being used, the OCTT will use three different invalid server certificates; "Not signed by installed Root certificate", "Expired", "CommonName that does not equal the FQDN of the server".- In case custom certificates are being used, the OCTT will loop through all certificates configured at the 'CSMS Keystore Invalid'.</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">* Step 11:Message: SecurityEventNotificationRequest-type must be InvalidCsmsCertificate</td></tr><tr><td colspan="2">Post scenario validations:N/a</td></tr></table>

# 6.2.3. Page 7 - (2025-02) - TC_A_05_CS

Before (Preparations)

<table><tr><td>Configuration State: 
OCPPCommCtrlr.NetworkProfileConnectionAttempts is 3 
OCPPCommCtrlr.NetworkConfigurationPriority only contains &lt;Value from ActiveNetworkProfile&gt;</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>5. The Charging Station initiates a TLS handshake and sends a Client Hello to the Test System.</td><td>6. The Test System responds with a Server Hello With-a&lt;Configured invalid server certificate&gt;With a &lt;Generated invalid server certificate&gt;</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>10 The Charging Station sends a SecurityEventNotificationRequest</td><td>11 The Test System responds with a SecurityEventNotificationResponse</td></tr><tr><td>Note(s): 
-Steps 4 to 11 are repeated per configured invalid server certificate. 
-In case default certificates are being used, the Test System will use three different invalid server certificates; 
&quot;Not signed by installed Root certificate&quot;, &quot;Expired&quot;, &quot;CommonName that does not equal the FQDN of the server&quot;. 
-In case custom certificates are being used, the Test System will loop through all certificates configured at the &#x27;CSMS Keystore Invalid&#x27;. 
The Test System will loop through steps 4 to 11 for a set of generated invalid certificates; 
&quot;Expired&quot;, &quot;Future validity date&quot;, &quot;Not signed by installed CSMS Root certificate&quot;, &quot;CommonName that does not equal the FQDN of the server&quot;, &quot;CommonName containing a wildcard hostname matching the FQDN&quot;.</td><td></td></tr></table>

# 6.2.4. Page 7 - (2025-04) - TC_A_05_CS - Updated before steps to take into account the AllowCSMSTLSWildcard variables

<table><tr><td>Test case name</td><td>TLS - server-side certificate - Invalid certificate</td></tr><tr><td>Test case Id</td><td>TC_A_05_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
OCPPCommCtrl.NetworkProfileConnectionAttempts is 3 
OCPPCommCtrl.NetworkConfigurationPriority only contains &lt;Value from ActiveNetworkProfile&gt; 
SecurityCtrl.AllowCSMSTLSWildcards is false (If implemented)</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

# 6.2.5. Page 20 - (2025-02) - TC_A_23_CS - CSMS returns a CertificateSigned message for each request

TC_A_23_CS: Update Charging Station Certificate by request of CSMS - CertificateSignedRequest Timeout

<table><tr><td>Test case name</td><td>Update Charging Station Certificate by request of CSMS - CertificateSignedRequest Timeout</td></tr><tr><td>Test case Id</td><td>TC_A_23_CS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Purpose</td><td>To verify if the Charging Station is able to send a new signCertificateRequest when it did not receive a certificateSignedRequest after the configured timeout. CSMS will after a delay send a CertificateSignedRequest for each SignCertificateRequest that it has accepted.</td></tr><tr><td>...</td><td>...</td></tr></table>

# Before (Preparations)

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>12. The Charging Station responds with a CertificateSignedResponse</td><td>11. The Test System sends a CertificateSignedRequest With certificateChain &lt;Certificate generated from the received CSR from step 3 and signed by the provided CSMS Root certificate&gt; certificateType ChargingStationCertificate</td></tr><tr><td>14. The Charging Station responds with a CertificateSignedResponse</td><td>13. The Test System sends a CertificateSignedRequest With certificateChain &lt;Certificate generated from the received CSR from step 6 and signed by the provided CSMS Root certificate&gt; certificateType ChargingStationCertificate</td></tr><tr><td>16. The Charging Station responds with a CertificateSignedResponse</td><td>15. The Test System sends a CertificateSignedRequest With certificateChain &lt;Certificate generated from the received CSR from step 9 and signed by the provided CSMS Root certificate&gt; certificateType ChargingStationCertificate</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>...</td></tr><tr><td>* Step 12, 14, 16: 
Message: CertificateSignedResponse 
- status must be Accepted or Rejected</td></tr><tr><td>Post scenario validations: 
Note: It does not matter whether Charging Station accepts first or last or all certificates. 
At least one CertificateSignedResponse must have status Accepted</td></tr></table>

# 6.2.6. Page 22 - (2024-09) - TC_A_19_CS - Fixed references to ConfigurationSlot [O20-4762]

<table><tr><td>Test case name</td><td>Upgrade Charging Station Security Profile - Accepted</td></tr><tr><td>Test case Id</td><td>TC_A_19_CS</td></tr><tr><td colspan="2"></td></tr></table>

<table><tr><td>Test case name</td><td colspan="2">Upgrade Charging Station Security Profile - Accepted</td></tr><tr><td rowspan="4">Main(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The OCTT sends a SetNetworkProfileRequest with configurationSlot is &lt;Configured configurationSlot&gt; or &lt;Configured configurationSlot2&gt; depending on which one is already in use -connectionData.messageTimeout &lt;Configured messageTimeout&gt; -connectionData.ocppCsmsUrl &lt;Configured ocppCsmsUrl&gt; -connectionData.ocpplInterface &lt;Configured ocplInterface&gt; -connectionData.ocppVersion OCPP20 -connectionData.securityProfile &lt;Configured securityProfile + 1&gt;</td></tr><tr><td>4. The Charging Station responds with a SetVariablesResponse</td><td>3. The OCTT sends a SetVariablesRequest with variable.name is &quot;NetworkConfigurationPriority&quot; component.name is &quot;OCPPCommCtrl&quot; attributeValue is &quot;&lt;Configured configurationSlot2&gt;,&lt;Configured configurationSlot&gt;&quot;</td></tr><tr><td>...</td><td>...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">* Step 2: 
Message SetNetworkProfileResponse 
- status Accepted 
* Step 4: 
Message SetVariablesResponse 
- setVariableResult[0].attributeStatus Accepted OR RebootRequired 
* Step 6: 
Message ResetResponse 
- status Accepted 
* Step 11: 
Message GetVariablesResponse 
- getVariableResult[0].attributeValue &lt;Configured securityProfile + 1&gt; 
* Step 13: 
Message GetVariablesResponse 
- getVariableResult[0].attributeValue Does not contain the configurationSlot with the previous (lower) security profile</td></tr><tr><td colspan="2">Post scenario validations: 
- N/a</td></tr></table>

# 6.2.7. Page 22 - (2025-06) - TC_A_19_CS - Added steps to validate the Charging Station does not downgrade back to security profile 1.

Added steps to validate the Charging Station does not downgrade back to security profile 1 after having upgraded to security profile 2.

<table><tr><td>Test case name</td><td colspan="2">Upgrade Charging Station Security Profile - Accepted</td></tr><tr><td>Test case Id</td><td colspan="2">TC_A_19_CS</td></tr><tr><td colspan="3">...</td></tr><tr><td colspan="3"></td></tr><tr><td colspan="3">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td colspan="2">CSMS</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The Test System sends a SetNetworkProfileRequest with configurationSlot is &lt;Configured configurationSlot&gt; or &lt;Configured configurationSlot2&gt; depending on which one is already in use -connectionData.messageTimeout &lt;Configured messageTimeout&gt; -connectionData.ocppCsmsUrl &lt;Configured ocppCsmsUrl&gt; -connectionData.ocpptInterface &lt;Configured ocpptInterface&gt; -connectionData.ocppVersion OCPP20 -connectionData.securityProfile &lt;Configured securityProfile + 1&gt; Note(s): -The Test System checks the ActiveNetworkProfile variable to see which slot is currently active. -The Test System prevents overwriting the NetworkProfile at the active slot, as this is not recommended.</td></tr><tr><td>4. The Charging Station responds with a SetVariablesResponse</td><td>3. The Test System sends a SetVariablesRequest with variable.name is &quot;NetworkConfigurationPriority&quot; component.name is &quot;OCPPCommCtrl&quot; attributeValue is &lt;configurationSlot set at Step 1, the other configured configurationSlot&gt;</td></tr><tr><td>6. The Charging Station responds with a ResetResponse</td><td>5. The Test System sends a ResetRequest with type OnIdle</td></tr><tr><td></td><td>7. The Test System restarts the WebSocket server using &lt;Configured securityProfile + 1&gt;</td></tr><tr><td>8. The Charging Station reconnects to the Test System using &lt;Configured securityProfile + 1&gt;</td><td>9. The Test System accepts the connection attempt.</td></tr><tr><td colspan="2">10. Execute Reusable State Booted</td></tr><tr><td>12. The Charging Station responds with GetVariablesResponse</td><td>11. Test System sends GetVariablesRequest with: -variable.name = &quot;SecurityProfile&quot; -component.name = &quot;SecurityCtrl&quot;</td></tr><tr><td>14. The Charging Station responds with GetVariablesResponse</td><td>13. Test System sends GetVariablesRequest with: -variable.name = &quot;NetworkConfigurationPriority&quot; -component.name = &quot;OCPPCommCtrl&quot;</td></tr><tr><td colspan="2">The following steps are only executed when this testcase is upgrading from Security Profile 1 to Security Profile 2.</td></tr><tr><td>16. The Charging Station does NOT reconnect to the Test System using Security Profile 1.</td><td>15. The Test System closes the connection and restarts the WebSocket server using Security profile 1 and waits the &lt;Configured long operation timeout&gt;.</td></tr><tr><td>18. The Charging Station reconnects to the Test System using Security Profile 2.</td><td>17. The Test System restarts the WebSocket server using Security Profile 2.</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
Message SetNetworkProfileResponse
- status Accepted
* Step 4: 
Message SetVariablesResponse
- setVariableResult[0].attributeStatus Accepted OR RebootRequired
* Step 6: 
Message ResetResponse
- status Accepted
* Step 12: 
Message GetVariablesResponse
- getVariableResult[0].attributeValue &lt;Configured securityProfile + 1&gt; 
* Step 14: 
Message GetVariablesResponse
- getVariableResult[0].attributeValue Does not contain the configurationSlot with the previous (lower) security profile</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

# 6.2.8. Page 24 - (2025-02) - TC_A_20_CS - Testcase did not take into account that the used configuration slot could already be set

The testcase did not take into account that the NetworkConnectionProfile slot updated during the main steps, might already be set at the OCPPCommCtrl.NetworkConfigurationPriority. This would cause setting the networkConnectionProfile to be rejected already.

<table><tr><td>Test case name</td><td>Upgrade Charging Station Security Profile - No valid CSMSRootCertificate installed</td></tr><tr><td>Test case Id</td><td>TC_A_20_CS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- The Test System connectionData configuration for SUT Charging Station only allows for ip addresses the Test System is able to bind.
- The Charging Station supports at least 2 security profiles, one of which is security profile 1.
- The Charging Station does not have a valid CSMSRootCertificate installed.
- The first Test System connectionData configuration slot must be configured for security profile 1.
- The second Test System connectionData configuration slot must be configured for security profile 2 or 3.
- The Charging Station is connected using security profile 1.
- When starting this testcase the Test System will start another WebSocket server for the secondconnectionData slot.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
OCPPCommCtrlr.NetworkConfigurationPriority is &lt;ActiveNetworkProfile slot&gt; (All others are removed)</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The Test System sends a SetNetworkProfileRequest with - configurationSlot is &lt;Configured configurationSlot 2&gt; or &lt;Configured configurationSlot&gt; (the one currently not used for the active connection)
- connectionData.messageTimeout &lt;Configured messageTimeout2&gt;
- connectionData.ocppCsmsUrl &lt;ocppCsmsUrl that is not currently active&gt;
- connectionData.ocpptInterface &lt;Configured ocpptInterface2&gt;
- connectionData.ocppVersion OCPP20
- connectionData.securityProfile &lt;Configured securityProfile2&gt;</td></tr><tr><td>4. The Charging Station responds with a SetVariablesResponse</td><td>3. The Test System sends a SetVariablesRequest with variable.name is "NetworkConfigurationPriority"
component.name is "OCPPCommCtrlr"
attributeValue is &lt;configurationSlot set at step 1&gt;,&lt;previous configurationSlot&gt;</td></tr></table>

# 6.2.9. Page 24 - (2025-04) - TC_A_20_CS - SetNetworkConnectionProfile is allowed to be rejected

<table><tr><td>Test case name</td><td>Upgrade Charging Station Security Profile - No valid CSMSRootCertificate installed</td></tr><tr><td>Test case Id</td><td>TC_A_20_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
Message SetNetworkProfileResponse
- status Accepted or Rejected
* Step 4: 
Message SetVariablesResponse
- setVariableResult[0].attributeStatus Rejected</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

# 6.2.10. Page 25 - (2025-02) - TC_A_21_CS

# TC_A_21_CS: Upgrade Charging Station Security Profile - No valid ChargingStationCertificate installed

<table><tr><td>Test case name</td><td>Upgrade Charging Station Security Profile - No valid ChargingStationCertificate installed</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Description</td><td>The CSMS is able to change the connectionData at the Charging Station. By doing this it is able to upgrade the connection to a security profile 3.</td></tr><tr><td>Purpose</td><td>To verify if the Charging Station is able to reject upgrading to a security profile 3 when it does not have a valid ChargingStationCertificate installed.</td></tr><tr><td>Prerequisite(s)</td><td>- The Test System connectionData configuration for SUT Charging Station only allows for ip addresses the Test System is able to bind.
- The Charging Station support at least 2 security profiles.
- The Charging Station does not have a valid ChargingStationCertificate installed.
- The Charging Station has a valid CSMSRootCertificate installed.
- The second Test System connectionData configuration slot must be configured for security profile 3.
- When starting this testcase the Test System will start another webSocket server for the second connectionData slot.</td></tr><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The Test System sends a SetNetworkProfileRequest with - configurationSlot is &lt;Configured configurationSlot&gt; or &lt;Configured configurationSlot&gt; depending on which one is already in use - connectionData.messageTimeout &lt;Configured messageTimeout2&gt; - connectionData.ocppCsmsUrl &lt;ocppCsmsUrl that is not currently active&gt; - connectionData.ocpplInterface &lt;Configured ocplInterface2&gt; - connectionData.ocppVersion OCPP20 - connectionData.securityProfile &lt;Configured.securityProfile2&gt; 3</td></tr></table>

# 6.2.11. Page 26 - (2025-02) - TC_A_22_CS

# TC_A_22_CS: Upgrade Charging Station Security Profile - Downgrade security profile - Rejected

<table><tr><td>Test case name</td><td>Upgrade Charging Station Security Profile - Downgrade security profile - Rejected</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>Description</td><td>The CSMS is able to change the connectionData at the Charging Station. It tries to downgrade the connection to a lower security profile 1.</td></tr><tr><td>Purpose</td><td>To verify if the Charging Station is able to reject downgrading to a lower security profile than the currently active security profile.1.</td></tr><tr><td>Prerequisite(s)</td><td>- The Test System connectionData configuration for SUT Charging Station only allows for ip addresses the Test System is able to bind.
- The Charging Station supports security profile 2 and/or 3.
- The second Test System connectionData configuration slot must be configured for a security profile lower than the first Test System connectionData configuration slot.
- The Charging Station has a connection using security profile 2 or 3.
- When starting this testcase the Test System will start another webSocket server for the second connectionData slot.</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The Test System sends a SetNetworkProfileRequest with: -configurationSlot is &lt;ConfiguredConfigurationSlot&gt; or &lt;Configured configurationSlot&gt; depending on which one is already in use - configurationSlot is &lt;Configured configurationSlot&gt; or &lt;Configured configurationSlot2&gt; depending on which one is already in use - connectionData.messageTimeout &lt;Configured messageTimeout2&gt; - connectionData.ocppCsmsUrl &lt;ocppCsmsUrl that is not currently active&gt; - connectionData.ocpptInterface &lt;Configured ocpptInterface2&gt; - connectionData.ocppVersion OCPP20 -connectionData.securityProfile &lt;Configured-securityProfile2&gt; -connectionData.securityProfile 1</td></tr></table>

# 6.2.12. Page 51 - (2025-02) - TC_B_16_CS - Correctly validate result of reading WriteOnly component variables

<table><tr><td>Test case name</td><td>Get Custom Report - with component criteria</td></tr><tr><td>Test case Id</td><td>TC_B_16_CS</td></tr><tr><td>Use case Id(s)</td><td>B08</td></tr><tr><td>Requirement(s)</td><td>B08.FR.01, B08.FR.03, B08.FR.04, B08.FR.07, B08.FR.09, B089.FR.10, B08.FR.12, B08.FR.13, B08.FR.14, B06.FR.09</td></tr><tr><td colspan="2">[...]</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>[...]</td></tr><tr><td>* Step 6: 
Message: GetVariablesResponse with: 
For component variables where NotifyReportRequest.reportData variableAttribute.mutability from step 3 is not WriteOnly 
- attributeStatus = Accepted 
- attributeValue = true 
For component variables where NotifyReportRequest.reportData variableAttribute.mutability from step 3 is WriteOnly 
- attributeStatus = Rejected 
- attributeValue = &lt;omitted&gt;</td></tr><tr><td>[...]</td></tr></table>

# 6.2.13. Page 56 - (2024-09) - TC_B_20_CS - Added check on omitting evseld [4390]

<table><tr><td>Test case name</td><td colspan="2">Reset Charging Station - Without ongoing transaction - OnIdle</td></tr><tr><td>Test case Id</td><td colspan="2">TC_B_20_CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">* Step 1:
Message ResetRequest
- evseld must be omitted
* Step 4:
Message BootNotificationResponse
- status Accepted</td></tr><tr><td colspan="2">Post scenario validations:
- N/a</td></tr></table>

# 6.2.14. Page 57 - (2024-09) - TC_B_21_CS - Added check on omitting evseld [4390]

<table><tr><td>Test case name</td><td colspan="2">Reset Charging Station - With Ongoing Transaction - OnIdle</td></tr><tr><td>Test case Id</td><td colspan="2">TC_B_21_CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">* Step 1:
Message ResetRequest
- type OnIdle
- evseld must be omitted
* Step 8:
Message BootNotificationResponse
- status Accepted</td></tr><tr><td colspan="2">Post scenario validations:
- N/a</td></tr></table>

# 6.2.15. Page 58 - (2024-09) - TC_B_22_CS - Added check on omitting evseld [4390]

<table><tr><td>Test case name</td><td colspan="2">Reset Charging Station - With Ongoing Transaction - Immediate</td></tr><tr><td>Test case Id</td><td colspan="2">TC_B_22_CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">* Step 1:
Message ResetRequest
- type Immediate
- evseld is omitted
* Step 6:
Message BootNotificationResponse
- status Accepted</td></tr><tr><td colspan="2">Post scenario validations:
- N/a</td></tr></table>

# 6.2.16. Page 63 - (2025-02) - Changed reset to Immediate

The reset in step #1 has been changed to "Immediate", because having a reservation pending is not an "idle" situation. As a result a Charging Station would respond with status "Scheduled" instead of resetting.

<table><tr><td>Test case name</td><td>Reset Charging Station - Reserved persists reset</td></tr><tr><td>Test case Id</td><td>TC_B_24_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a ResetResponse</td><td>1. The Test System sends a ResetRequest with type Immediate</td></tr><tr><td colspan="2">...</td></tr></table>

# 6.2.17. Page 72-81 - (2025-04) - TC_B_45_CS & TC_B_46_CS & TC_B_47_CS & TC_B_49_CS & TC_B_50_CS & TC_A_19_CS - Clarified NetworkProfile configurationSlot usage

The Test system has two endpoints it is able to switch between. Depending on which one is active at the start of the testcase, it makes the SUT switch to the other endpoint.

<table><tr><td>Test case name</td><td>Migrate to new ConnectionProfile - Success - Same CSMS Root</td></tr><tr><td>Test case Id</td><td>TC_B_45_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The Test System sends a SetNetworkProfileRequest with configurationSlot is &lt;Configured configurationSlot&gt; or &lt;Configured configurationSlot2&gt; depending on which one is already in use - connectionData.messageTimeout &lt;Configured messageTimeout&gt; or &lt;Configured messageTimeout2&gt; - connectionData.ocppCsmsUrl &lt;ocppCsmsUrl that is not currently active&gt; - connectionData.ocpplInterface &lt;Configured ocplInterface&gt; or &lt;Configured ocplInterface2&gt; - connectionData.ocppVersion OCPP20 - connectionData.securityProfile &lt;Configured securityProfile&gt; or &lt;Configured securityProfile2&gt; Note(s): - The Test System checks the ActiveNetworkProfile variable to see which slot is currently active. - The Test System prevents overwriting the NetworkProfile at the active slot, as this is not recommended.</td></tr><tr><td>4. The Charging Station responds with a SetVariablesResponse</td><td>3. The Test System sends a SetVariablesRequest with variable.name is "NetworkConfigurationPriority" component.name is "OCPPCommCtrl" attributeValue is &lt;configurationSlot set at Step 1, the other configured configurationSlot&gt;</td></tr><tr><td colspan="2">...</td></tr><tr><td colspan="2">7. Execute Reusable State Booted</td></tr><tr><td colspan="2">Note(s): - The Charging Station connects to the slot configured at step 1.</td></tr></table>

<table><tr><td>Test case name</td><td>Migrate to new ConnectionProfile - Failback mechanism - Same CSMS Root</td></tr><tr><td>Test case Id</td><td>TC_B_46_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The Test System sends a SetNetworkProfileRequest with configurationSlot is &lt;Configured configurationSlot&gt; or &lt;Configured configurationSlot2&gt; depending on which one is already in use
- connectionData.messageTimeout &lt;Configured messageTimeout&gt; or &lt;Configured messageTimeout2&gt;
- connectionData.ocppCsmsUrl &lt;ocppCsmsUrl that is not currently active&gt;
- connectionData.ocpplInterface &lt;Configured ocplInterface&gt; or &lt;Configured ocplInterface2&gt;
- connectionData.ocppVersion OCPP20
- connectionData.securityProfile &lt;Configured securityProfile&gt; or &lt;Configured securityProfile2&gt;</td></tr><tr><td></td><td>Note(s):
- The Test System checks the ActiveNetworkProfile variable to see which slot is currently active.
- The Test System prevents overwriting the NetworkProfile at the active slot, as this is not recommended.</td></tr><tr><td>4. The Charging Station responds with a SetVariablesResponse</td><td>3. The Test System sends a SetVariablesRequest with variable.name is "NetworkConfigurationPriority" component.name is "OCPPCommCtrl" attributeValue is &lt;configurationSlot set at Step 1, the other configured configurationSlot&gt;</td></tr><tr><td colspan="2">...</td></tr><tr><td colspan="2">9. Execute Reusable State Booted Note(s): - The Charging Station connects to the second slot configured at the NetworkConfigurationPriority at step 3.</td></tr></table>

<table><tr><td>Test case name</td><td>Migrate to new ConnectionProfile - Fallback after NetworkProfileConnectionAttempts per NetworkConfigurationPriority failed - New CSMS Root - New CSMS</td></tr><tr><td>Test case Id</td><td>TC_B_47_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td rowspan="2">2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The Test System sends a SetNetworkProfileRequest with configurationSlot is &lt;Configured configurationSlot&gt; or &lt;Configured configurationSlot2&gt; depending on which one is already in use
- connectionData.messageTimeout &lt;Configured messageTimeout&gt; or &lt;Configured messageTimeout2&gt;
- connectionData.ocppCsmsUrl &lt;ocppCsmsUrl that is not currently active&gt;
- connectionData.ocpplInterface &lt;Configured ocppInterface&gt; or &lt;Configured ocppInterface2&gt;
- connectionData.ocppVersion OCPP20
- connectionData.securityProfile &lt;Configured securityProfile&gt; or &lt;Configured securityProfile2&gt;</td></tr><tr><td>Note(s):
- The Test System checks the ActiveNetworkProfile variable to see which slot is currently active.
- The Test System prevents overwriting the NetworkProfile at the active slot, as this is not recommended.</td></tr><tr><td>4. The Charging Station responds with a SetVariablesResponse</td><td>3. The Test System sends a SetVariablesRequest with variable.name is &quot;NetworkConfigurationPriority&quot; component.name is &quot;OCPPCommCtrl&quot;
attributeValue is &lt;configurationSlot set at Step 1, the other configured configurationSlot&gt;</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Test case name</td><td>Migrate to new ConnectionProfile - Failback after NetworkProfileConnectionAttempts per NetworkConfigurationPriority failed - Same CSMS Root</td></tr><tr><td>Test case Id</td><td>TC_B_49_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The Test System sends a SetNetworkProfileRequest with configurationSlot is &lt;Configured configurationSlot&gt; or &lt;Configured configurationSlot2&gt; depending on which one is already in use - connectionData.messageTimeout &lt;Configured messageTimeout&gt; or &lt;Configured messageTimeout2&gt; - connectionData.ocppCsmsUrl &lt;ocppCsmsUrl that is not currently active&gt; - connectionData.ocpplInterface &lt;Configured ocplInterface&gt; or &lt;Configured ocplInterface2&gt; - connectionData.ocppVersion OCPP20 - connectionData.securityProfile &lt;Configured securityProfile&gt; or &lt;Configured securityProfile2&gt; Note(s): - The Test System checks the ActiveNetworkProfile variable to see which slot is currently active. - The Test System prevents overwriting the NetworkProfile at the active slot, as this is not recommended.</td></tr><tr><td>4. The Charging Station responds with a SetVariablesResponse</td><td>3. The Test System sends a SetVariablesRequest with variable.name is "NetworkConfigurationPriority" component.name is "OCPPCommCtrl" attributeValue is &lt;configurationSlot set at Step 1, the other configured configurationSlot&gt;</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Test case name</td><td>Migrate to new ConnectionProfile - Success - New CSMS Root - New CSMS</td></tr><tr><td>Test case Id</td><td>TC_B_50_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The Test System sends a SetNetworkProfileRequest with configurationSlot is &lt;Configured configurationSlot&gt; or &lt;Configured configurationSlot2&gt; depending on which one is already in use - connectionData.messageTimeout &lt;Configured messageTimeout&gt; or &lt;Configured messageTimeout2&gt; - connectionData.ocppCsmsUrl &lt;ocppCsmsUrl that is not currently active&gt; - connectionData.ocpplInterface &lt;Configured ocplInterface&gt; or &lt;Configured ocplInterface2&gt; - connectionData.ocppVersion OCPP20 - connectionData.securityProfile &lt;Configured securityProfile&gt; or &lt;Configured securityProfile2&gt; Note(s): - The Test System checks the ActiveNetworkProfile variable to see which slot is currently active. - The Test System prevents overwriting the NetworkProfile at the active slot, as this is not recommended.</td></tr><tr><td>4. The Charging Station responds with a SetVariablesResponse</td><td>3. The Test System sends a SetVariablesRequest with variable.name is "NetworkConfigurationPriority" component.name is "OCPPCommCtrl" attributeValue is &lt;configurationSlot set at Step 1, the other configured configurationSlot&gt;</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Test case name</td><td>Upgrade Charging Station Security Profile - Accepted</td></tr><tr><td>Test case Id</td><td>TC_A_19_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetNetworkProfileResponse</td><td>1. The Test System sends a SetNetworkProfileRequest with configurationSlot is &lt;Configured configurationSlot&gt; or &lt;Configured configurationSlot2&gt; depending on which one is already in use - connectionData.messageTimeout &lt;Configured messageTimeout&gt; - connectionData.ocppCsmsUrl &lt;Configured ocppCsmsUrl&gt; - connectionData.ocpptInterface &lt;Configured ocpptInterface&gt; - connectionData.ocppVersion OCPP20 - connectionData.securityProfile &lt;Configured securityProfile + 1&gt; Note(s): - The Test System checks the ActiveNetworkProfile variable to see which slot is currently active. - The Test System prevents overwriting the NetworkProfile at the active slot, as this is not recommended.</td></tr><tr><td>4. The Charging Station responds with a SetVariablesResponse</td><td>3. The Test System sends a SetVariablesRequest with variable.name is &quot;NetworkConfigurationPriority&quot; component.name is &quot;OCPPCommCtrl&quot; attributeValue is &lt;configurationSlot set at Step 1, the other configured configurationSlot&gt;</td></tr><tr><td colspan="2">...</td></tr></table>

# 6.2.18. Page 72-81 - (2025-06) - TC_B_45_CS & TC_B_46_CS & TC_A_19_CS - ResetRequest will always be sent by the Test System to ensure the Charging Station switches NetworkProfile

ResetRequest will always be sent by the Test System to ensure the Charging Station switches NetworkProfile.

<table><tr><td>Test case Id</td><td>TC_B_45_CS / C_B_46_CS / TC_A_19_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td rowspan="2">6. The Charging Station responds with a ResetResponse</td><td>5. The Test System sends a ResetRequest with type Idle</td></tr><tr><td>Note(s): 
- This step will only be executed when the status RebootRequired is returned at step 4, or if the charging does not automatically reboot.</td></tr><tr><td colspan="2">...</td></tr></table>

# 6.2.19. Page 85 - (2025-04) - TC_B_53_CS - Check if all required values are provided

The testcase currently does not explicitly describe that the value fields for standardized component_variables should not be omitted (with EVSE.Power as an exception. For this only the maxLimit is required). These are optional at the JSON schema, because they are allowed to omit in case of WriteOnly variables.

<table><tr><td>Test case name</td><td colspan="2">Get Base Report - Test mandatory DM variables via FullInventory</td></tr><tr><td>Test case Id</td><td colspan="2">TC_B_53_CS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">...</td></tr><tr><td colspan="2">Post scenario validations:
The Test System checks that all implemented standardized components / variables are implemented correctly according to the OCPP specification:
- The components / variables that are required according to the OCPP specification are implemented.
- For each component/variable, where variableCharacteristics.dataType is set to OptionList, SequenceList or MemberList, the variableCharacteristics.valuesList is not omitted or empty.
- For each component/variable, where variableCharacteristics.dataType is OptionList, SequenceList or MemberList, the variableAttribute.value is allowed based on the values in the provided variableCharacteristics.valuesList.
- For variables with mutability set to WriteOnly the variableAttribute.value is omitted in the NotifyReportRequest.
- For variables with mutability NOT set to WriteOnly the variableAttribute.value is NOT omitted in the NotifyReportRequest. There is one exception to this rule and that is for EVSE.Power. This variable only has a maxLimit .</td></tr></table>

# 6.2.20. Page 89 - (2025-02) - Add setting of NetworkProfileConnectionAttempts

TC_B_57_CS: Network Reconnection - After connection loss

<table><tr><td>Test case name</td><td>Network Reconnection - After connection loss</td></tr><tr><td>Test case Id</td><td>TC_B_57_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>OCPPCommCtrletworkProfileConnectionAttempts is 3</td></tr><tr><td>OCPPCommCtrl.RetryBackOffRepeatTimes is 2</td></tr><tr><td>OCPPCommCtrl.RetryBackOffRandomRange is 0</td></tr><tr><td>OCPPCommCtrl.RetryBackOffWaitMinimum is &lt;Configured RetryBackOffWaitMinimum&gt;</td></tr><tr><td>Memory State:
N/a</td></tr><tr><td>Reusable State(s):
N/a</td></tr></table>

# 6.2.21. Page 89/621 - (2025-04) - Addition of new testcase for CSMS to test WebSocket Subprotocol negotiation

TC_B_58_CSMS: WebSocket Subprotocol negotiation

<table><tr><td>Test case name</td><td>WebSocket Subprotocol validation</td></tr><tr><td>Test case Id</td><td>TC_B_58_CSMS</td></tr><tr><td>Use case Id(s)</td><td>Part 4 - JSON over WebSockets implementation guide</td></tr><tr><td>Requirement(s)</td><td>Section 3.1.2. OCPP version</td></tr><tr><td>System under test</td><td>CSMS</td></tr><tr><td>Description</td><td>OCPP-J imposes extra constraints on the WebSocket subprotocol, detailed in the following section 3.1.2.</td></tr><tr><td>Purpose</td><td>To verify whether the CSMS is able to select a supported OCPP version, when also a different unsupported version is supported by the Charging Station and relays this selection via the Sec-Websocket-Protocol header.</td></tr><tr><td>Prerequisite(s)</td><td>N/a</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>1. The Test System disconnects the WebSocket connection and reconnects by sending a HTTP upgrade request with the header;Sec-WebSocket-Protocol: ocpp0.1</td><td>2. The CSMS rejects the connection attempt and does NOT upgrade the connection to a WebSocket connection.</td></tr><tr><td>3. The Test System disconnects the WebSocket connection and reconnects by sending a HTTP upgrade request with the header;Sec-WebSocket-Protocol: ocpp0.1,ocpp&lt;SelectedOCPP version&gt;</td><td>4. The CSMS accepts the connection attempt and upgrades the connection to a WebSocket connection.</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 4: The authorization header of the HTTP upgrade response must contain the header Sec-WebSocket-Protocol, and it must comply to the following:- The header is formatted as follows; Sec-WebSocket-Protocol: ocpp&lt;Selected OCPP version&gt;</td></tr><tr><td>Post scenario validations:N/a</td></tr></table>

# 6.2.22. Page 117/141 - (2025-02) - Added remote support for Authorization Cache & Local Authorization List testcases

The CWG decided that online local authorization list and authorization cache testcase can also be tested with remote authorization.

<table><tr><td>...</td><td>...</td></tr><tr><td>Test case Id</td><td>TC_C_08_CS, TC_C_09_CS, TC_C_10_CS, TC_C_11_CS, TC_C_12_CS, TC_C_13_CS, TC_C_33_CS, TC_C_34_CS, TC_C_36_CS, TC_C_37_CS, TC_C_38_CS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>-AuthCacheCtrl.Available is implemented with value true
The Charging Station has an authorization cache AND
the Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34 OR supports at least one of the following remote start authorization options: C-36, C-37</td></tr></table>

<table><tr><td>...</td><td>...</td></tr><tr><td>Test case Id</td><td>TC_C_57_CS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>-AuthCacheCtrl.Available is implemented with-value true
-AuthCacheCtrl_DISABLEPostAuthorize is implemented
AuthCacheCtrl_DISABLEPostAuthorize is implemented AND
The Charging Station has an authorization cache AND
the Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34 OR supports at least one of the following remote start authorization options: C-36, C-37</td></tr></table>

<table><tr><td>...</td><td>...</td></tr><tr><td>Test case Id</td><td>TC_C_27_CS, TC_C_28_CS, TC_C_29_CS, TC_C_30_CS, TC_C_31_CS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- LocalAuthListCtrl.LocalAuthListAvailable is implemented with value true AND
- The Charging Station must support an authorization method other than NoAuthorization or Central</td></tr></table>

<table><tr><td>...</td><td>...</td></tr><tr><td>Test case Id</td><td>TC_C_58_CS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- LocalAuthListCtrlr.Available is implemented with value true
- LocalAuthListCtrlrDISABLEPostAuthorize is implemented AND
- The Charging Station must support an authorization method other than NoAuthorization or Central</td></tr></table>

<table><tr><td>...</td><td>...</td></tr><tr><td>Test case Id</td><td>TC_C_32_CS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>-The Charging Station supports the Authorization Cache feature
-Authorization cache is stored in the non-volatile memory.
The Charging Station has an authorization cache AND
Authorization cache is stored in the non-volatile memory AND
the Charging Station supports at least one of the following local start authorization options: C-30, C-31, C-32, C-34 OR supports at least one of the following remote start authorization options: C-36, C-37</td></tr></table>

<table><tr><td>Main (Test scenario)</td></tr><tr><td>Main steps have been updated to use the Reusable State Authorized based on the configured scenario Local or Remote.</td></tr><tr><td>...</td></tr></table>

# 6.2.23. Page 101 - (2025-04) - TC_C_14_CS - Fixing invalid component variable reference

<table><tr><td>Test case name</td><td>Authorization through authorization cache - GroupID equal to MasterPassGroupId.</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>AuthCacheCtrl.AuthCacheAvailable AuthCacheCtrl.Available is implemented with value true
The Charging station supports MasterPass feature.
The Charging Station supports authorization methods other than NoAuthorization</td></tr></table>

# 6.2.24. Page 102 - (2025-04) - TC_C_15_CS - Fixing invalid component variable reference

<table><tr><td>Test case name</td><td>Authorization through authorization cache - StopTxOnInvalidId = false, MaxEnergyOnInvalidId &gt; 0</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- AuthCacheCtrl.AuthCacheAvailable AuthCacheCtrl.Available is implemented with value true
- The Charging Station has MaxEnergyOnInvalidId implemented
- At least one of the following must be supported; Local auth list, auth cache, StartTxUnknownIds.
- The Charging Station supports authorization methods other than NoAuthorization</td></tr></table>

# 6.2.25. Page 104 - (2025-04) - TC_C_16_CS - Fixing invalid component variable reference

<table><tr><td>Test case name</td><td>Authorization through authorization cache - StopTxOnInvalidId = true</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- AuthCacheCtrl.AuthCacheAvailable AuthCacheCtrl.Available is implemented with value true
- At least one of the following must be supported; Local auth list, auth cache, StartTxUnknownIds.
- The Charging Station supports authorization methods other than NoAuthorization</td></tr></table>

# 6.2.26. Page 105 - (2025-04) - TC_C_17_CS - Fixing invalid component variable reference

<table><tr><td>Test case name</td><td>Authorization through authorization cache - StopTxOnInvalidId = false</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- AuthCacheCtrl.AuthCacheAvailable AuthCacheCtrl.Available is implemented with value true
- At least one of the following must be supported; Local auth list, auth cache, StartTxUnknownIds.
- The Charging Station supports authorization methods other than NoAuthorization</td></tr></table>

# 6.2.27. Page 108 - (2025-04) - TC_C_18_CS - Fixing invalid component variable reference

<table><tr><td>Test case name</td><td>Authorization through authorization cache - StopTxOnInvalidId = true, MaxEnergyOnInvalidId &gt; 0</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- AuthCacheCtrl.AuthCacheAvailable AuthCacheCtrl.Available is implemented with value true
- The Charging Station has MaxEnergyOnInvalidId implemented.
- At least one of the following must be supported; Local auth list, auth cache, StartTxUnknownIds.
- The Charging Station supports authorization methods other than NoAuthorization</td></tr></table>

# 6.2.28. Page 120 - (2025-04) - TC_C_34_CS - Making use of the Deauthorized reusable state

<table><tr><td>Test case name</td><td>Store Authorization Data in the Authorization Cache - Update on TransactionResponse</td></tr><tr><td>Test case Id</td><td>TC_C_34_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>AuthCacheEnabled is true (If implemented)</td></tr><tr><td>LocalPreauthorize is true</td></tr><tr><td>LocalAuthListEnabled is true</td></tr><tr><td>StopTxOnInvalidId is true</td></tr><tr><td>MaxEnergyOnInvalidId is 0</td></tr><tr><td>Memory State:
IdTokenCached for &lt;Configured valid IdToken fields&gt;</td></tr><tr><td>Reusable State(s):
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State Authorized (Cached idToken, idTokenInfo.status invalid)</td></tr><tr><td colspan="2">2. Execute Reusable State Deauthorized</td></tr><tr><td colspan="2">3. Execute Reusable State EVDisconnected</td></tr><tr><td colspan="2">4. Execute Reusable State ParkingBayUnoccupied</td></tr><tr><td colspan="2">5. Execute Reusable State ParkingBayOccupied</td></tr><tr><td colspan="2">6. Execute Reusable State Authorized (idTokenInfo.status invalid)</td></tr></table>

# 6.2.29. Page 128 - (2025-04) - TC_C_41_CS - Fixing invalid component variable reference

<table><tr><td>Test case name</td><td>Authorization by Groupld - Success with Authorization Cache</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- AuthCacheCtrlAuthCacheAvailable AuthCacheCtrl.Available is implemented with value true
- The Charging Station supports authorization methods other than NoAuthorization</td></tr></table>

# 6.2.30. Page 134 - (2025-04) - TC_C_44_CS - Fixing invalid component variable reference

<table><tr><td>Test case name</td><td>Authorization by Groupld - Invalid status with Authorization Cache</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- AuthCacheCtrlAuthCacheAvailable AuthCacheCtrl.Available is implemented with value true
- The Charging Station supports authorization methods other than NoAuthorization</td></tr></table>

# 6.2.31. Page 137 - (2025-04) - TC_C_46_CS - Fixing invalid component variable reference

<table><tr><td>Test case name</td><td>Store Authorization Data in the Authorization Cache - AuthCacheLifeTime</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- AuthCacheCtrl.AuthCacheAvailable AuthCacheCtrl.Available is implemented with value true
- Configuration variable AuthCacheLifeTime is implemented</td></tr></table>

# 6.2.32. Page 138 - (2024-09) - TC_C_47_CS - StoppedReason must be validated in Ended event [O20-4467]

<table><tr><td>Test case name</td><td colspan="2">Stop Transaction with a Master Pass - With UI - All transactions</td></tr><tr><td>Test case Id</td><td colspan="2">TC_C_47_CS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Test case name</td><td>Stop Transaction with a Master Pass - With UI - All transactions</td></tr><tr><td rowspan="2">Tool validations</td><td>* Step 1: 
MessageauthorizeRequest 
-idToken.idToken &lt;Configured masterpass_idtoken_idtoken&gt; 
-idToken.type &lt;Configured masterpass_idtoken_type&gt; 
* Step 3: 
Message TransactionEventRequest 
- transactionInfo.stoppedReason MasterPass (in last TransactionEventRequest) 
-idToken omit or 
-idToken.idToken &lt;Configured masterpass_idtoken_idtoken&gt; and 
-idToken.type &lt;Configured masterpass_idtoken_type&gt; (once per stopped transaction) 
-eventType Ended (in last TransactionEventRequest)</td></tr><tr><td>Post scenario validations: 
-N/a</td></tr></table>

# 6.2.33. Page 145 - (2025-04) - TC_C_25_CS - Fixing invalid component variable reference

<table><tr><td>Test case name</td><td>Offline authorization through local authorization list - Local Authorization List &gt; Authorization Cache</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Prerequisite(s)</td><td>- LocalAuthListCtrl.LocalAuthListAvailable is implemented with value true
- AuthCacheCtrl.AuthCacheAvailable AuthCacheCtrl.Available is implemented with value true
- OfflineTxForUnknownIdEnabled is implemented.
- The Charging Station supports authorization methods other than NoAuthorization</td></tr></table>

# 6.2.34. Page 146 - (2024-11) - TC_C_26_CS - Allow StatusNotification status = Occupied

The connector status change should be reported after the connection is restored. The Charging Station should be allowed to report StatusNotificationRequest status = Occupied (or NotifyEventRequest).

<table><tr><td>Test case name</td><td colspan="2">Set Variable Monitoring - Periodic event</td></tr><tr><td>Test case Id</td><td colspan="2">TC_C_26_CS</td></tr><tr><td>Use case Id(s)</td><td colspan="2">C15 &amp; C13</td></tr><tr><td>Requirement(s)</td><td colspan="2">C15.FR.02,C15.FR.06,C15.FR.08,C13.FR.04</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="7">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>1. The Charging Station notifies the CSMS about the current state of all connectors.</td><td>2. The OCTT responds accordingly.</td></tr><tr><td>...</td><td>...</td></tr><tr><td colspan="2">3. Execute Reusable State StopAuthorized</td></tr><tr><td colspan="2">4. Execute Reusable State EVConnectedPostSession</td></tr><tr><td colspan="2">5. Execute Reusable State EVDisconnected</td></tr><tr><td>Test case name</td><td>Set Variable Monitoring - Periodic event</td></tr><tr><td rowspan="2">Tool validations</td><td>* Step 1: 
Message: StatusNotificationRequest 
- connectorStatus must be Occupied 
Message: NotifyEventRequest 
- eventData[0].trigger must be Delta 
- eventData[0].actualValue must be Occupied 
- eventData[0].component.name must be Connector 
- eventData[0].variable.name must be AvailabilityState 
...</td></tr><tr><td>Post scenario validations: 
N/A</td></tr></table>

# 6.2.35. Page 147-153 - (2025-04) - TC_C_50_CS, TC_C_51_CS, TC_C_52_CS, TC_C_53_CS, TC_C_54_CS, TC_C_55_CS - Always re-install V2G certificates

Note: This erratum revises erratum: Page 147 - (2025-02) - TC_C_50_CS and the related errata below

It is not possible to detect whether all expected certificates are installed, when reusing the SubCAs. Therefore the Test System always re-installs the V2G certificates.

<table><tr><td>Before (Preparations)</td></tr><tr><td>Memory State:</td></tr><tr><td>CertificateInstalled for certificateType V2GRootCertificate</td></tr><tr><td>CertificateInstalled for certificateType MORootCertificate</td></tr><tr><td>RenewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificates.certificateType = V2GCertificateChain)</td></tr></table>

# 6.2.36. Page 147 - (2025-02) - TC_C_50_CS

Note: This erratum and the related errata below are revised by erratum: Page 147-153 - (2025-04) - TC_C_50_CS, TC_C_51_CS, TC_C_52_CS, TC_C_53_CS, TC_C_54_CS, TC_C_55_CS - Always re-install V2G certificates

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>TxCtrl.RxStartPoint contains one or more of PowerPathClosed, Authorized, EVConnected, ParkingBayOccupancy</td></tr><tr><td>AuthCtrl.AuthEnabled is true (If implemented AND ReadWrite)</td></tr><tr><td>AuthCtrl.DisableRemoteAuthorization is false (If implemented)</td></tr><tr><td>For the ISO15118Ctrl of the EVSE used in the PnC transaction:</td></tr><tr><td>ISO15118Ctrl.CentralContractValidationAllowed is false</td></tr><tr><td>ISO15118Ctrl.ContractCertificateInstallationEnabled is true</td></tr><tr><td>ISO15118Ctrl.V2GCertificateInstallationEnabled is true</td></tr><tr><td>ISO15118Ctrl.PnCEnowled is true</td></tr><tr><td>ISO15118Ctrl.Seeold is configured seeold</td></tr><tr><td>ISO15118Ctrl.CountryName is NL</td></tr><tr><td>ISO15118Ctrl.OrganizationName is configured vendorId</td></tr><tr><td>Memory State:</td></tr><tr><td>CertificatesInstalled for certificateType V2GRootCertificate</td></tr><tr><td>CertificatesInstalled for certificateType MORootCertificate</td></tr><tr><td>RenewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificates.certificateType = V2GCertificateChain)</td></tr><tr><td>Reusable State(s):</td></tr><tr><td>State is EVConnectedPreSession</td></tr><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>3. The Charging Station sends a TransactionEventRequest Note(s): - This step needs to be executed when TxStartPoint contains Authorized OR the transaction already started. So in the case TxStartPoint contains ParkingBayOccupancy or (EVConnected, in the case this testcase was initiated from state EVConnectedPreSession.)</td><td>4. The Test System responds with a TransactionEventResponse With idTokenInfo.status Accepted</td></tr><tr><td colspan="2">5. Execute Reusable State EnergyTransferStarted</td></tr></table>

# 6.2.37. Page 148 - (2025-02) - TC_C_51_CS

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>TxCtrl.TxStartPoint contains one or more of PowerPathClosed, Authorized, EVConnected, ParkingBayOccupancy</td></tr><tr><td>AuthCtrl.AuthEnabled is true (If implemented AND ReadWrite)</td></tr><tr><td>AuthCtrl.DisableRemoteAuthorization is false (If implemented)</td></tr><tr><td>For the ISO15118Ctrl of the EVSE used in the PnC transaction:</td></tr><tr><td>ISO15118Ctrl.CentralContractValidationAllowed is false</td></tr><tr><td>ISO15118Ctrl.PnCEnabled is true</td></tr><tr><td>Memory State:</td></tr><tr><td>CertificateInstalled for certificateType V2GRootCertificate</td></tr><tr><td>CertificateInstalled for certificateType MORootCertificate</td></tr><tr><td>RenewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificates.certificateType = V2GCertificateChain)</td></tr><tr><td>Reusable State(s):</td></tr><tr><td>State is EVConnectedPreSession</td></tr></table>

# 6.2.38. Page 149 - (2025-02) - TC_C_52_CS

# TC_C_52_CS: Authorization using Contract Certificates 15118 - Online - Central contract certificate validation - Accepted

<table><tr><td>Test case name</td><td>Authorization using Contract Certificates 15118 - Online - Central contract certificate validation - Accepted</td></tr><tr><td>Test case Id</td><td>TC_C_52_CS</td></tr><tr><td>Use case Id(s)</td><td>C07</td></tr><tr><td>Requirement(s)</td><td>C07.FR.01,C07.FR.02,C07.FR.06</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>The Charging Station is able to authorize with contract certificates when it supports ISO 15118.</td></tr><tr><td>Purpose</td><td>To verify if the Charging Station is able to authorize, while not being able to locally validate the contract certificate and then send it to the CSMS.</td></tr><tr><td>Prerequisite(s)</td><td>- The V2G/MO Root certificate that is needed to validate the EV Contract certificate must NOT be installed at the Charging Station.- The Charging Station supports central contract validation.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>TxCtrl.RxStartPoint contains one or more of PowerPathClosed, Authorized, EVConnected, ParkingBayOccupancy</td></tr><tr><td>AuthCtrl.AuthEnabled is true (If implemented AND ReadWrite)</td></tr><tr><td>AuthCtrl.DisableRemoteAuthorization is false (If implemented)</td></tr><tr><td>For the ISO15118Ctrl of the EVSE used for the PnC transaction:</td></tr><tr><td>ISO15118Ctrl.CentralContractValidationAllowed is true</td></tr><tr><td>ISO15118Ctrl.ContractCertificateInstallationEnabled is true</td></tr><tr><td>ISO15118Ctrl.V2GCertificateInstallationEnabled is true</td></tr><tr><td>ISO15118Ctrl.PnCEnowled is true</td></tr><tr><td>ISO15118Ctrl.Seeold is configured seeeld</td></tr><tr><td>ISO15118Ctrl.CountryName is NL</td></tr><tr><td>ISO15118Ctrl.OrganizationName is configured vendorId</td></tr><tr><td>Memory State:</td></tr><tr><td>N/a- CertificateInstalled for certificateType V2GRootCertificate</td></tr><tr><td>RenewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificates.certificateType = V2GCertificateChain)</td></tr><tr><td>Reusable State(s):</td></tr><tr><td>State is EVConnectedPreSession</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>3. The Charging Station sends a TransactionEventRequest Note(s): - This step needs to be executed when TxStartPoint contains Authorized OR the transaction already started. So in the case TxStartPoint contains ParkingBayOccupancy or (EVConnected, in the case this testcase was initiated from state EVConnectedPreSession.)</td><td>4. The Test System responds with a TransactionEventResponse With idTokenInfo.status Accepted</td></tr><tr><td colspan="2">5. Execute Reusable State EnergyTransferStarted</td></tr></table>

# 6.2.39. Page 150 - (2025-02) - TC_C_53_CS

TC_C_53_CS: Authorization using Contract Certificates 15118 - Online - Central contract validation fails

<table><tr><td>Test case name</td><td>Authorization using Contract Certificates 15118 - Online - Central contract validation fails</td></tr><tr><td>Test case Id</td><td>TC_C_53_CS</td></tr><tr><td>Use case Id(s)</td><td>C07</td></tr><tr><td>Requirement(s)</td><td>N/a</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>The Charging Station is able to authorize with contract certificates when it supports ISO 15118.</td></tr><tr><td>Purpose</td><td>To verify if the Charging Station is able to handle an invalid contract certificate.</td></tr><tr><td>Prerequisite(s)</td><td>- The V2G/MO Root certificate that is needed to validate the EV Contract certificate must NOT be installed at the Charging Station.
- The Charging Station supports central contract validation.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>TxCtrl.RxStartPoint contains one or more of PowerPathClosed, Authorized, EVConnected, ParkingBayOccupancy</td></tr><tr><td>AuthCtrl.AuthEnabled is true (If implemented AND ReadWrite)</td></tr><tr><td>AuthCtrl.DisableRemoteAuthorization is false (If implemented)</td></tr><tr><td>For the ISO15118Ctrl of the EVSE involved in the PnC transaction:</td></tr><tr><td>ISO15118Ctrl.CentralContractValidationAllowed is true</td></tr><tr><td>ISO15118Ctrl.PnCEnabled is true</td></tr><tr><td>Memory State:</td></tr><tr><td>N/a - CertificateInstalled for certificateType V2GRootCertificate</td></tr><tr><td>RenewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificates.certificateType = V2GCertificateChain)</td></tr><tr><td>Reusable State(s):</td></tr><tr><td>State is EVConnectedPreSession</td></tr></table>

# 6.2.40. Page 151 - (2024-09) - TC_C_54_CS - removed reusable state IdTokenCached [O20-3510]

<table><tr><td>Test case name</td><td colspan="2">Authorization using Contract Certificates 15118 - Offline - ContractValidationOffline is true</td></tr><tr><td>Test case Id</td><td colspan="2">TC_C_54_CS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="4">Before 
(Preparations)</td><td colspan="2">Configuration State:</td></tr><tr><td colspan="2">...</td></tr><tr><td colspan="2">Memory State: CertificateInstalled for certificateType V2GRootCertificate CertificateInstalled for certificateType MORootCertificate IdTokenCached for &lt;Configured valid IdToken fields&gt; (If implemented) IdTokenLocalAuthList for &lt;Configured valid IdToken fields&gt; (If implemented)</td></tr><tr><td colspan="2">Reusable State(s): N/a</td></tr><tr><td rowspan="2">Main 
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td colspan="3">...</td></tr></table>

# 6.2.41. Page 151 - (2025-02) - TC_C_54_CS

<table><tr><td>Test case name</td><td>Authorization using Contract Certificates 15118 - Offline - ContractValidationOffline is true</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>Description</td><td>The Charging Station is able to authorize with contract certificates when it supports ISO 15118. for an EMAID that exists in authorization cache or local authorization list, while offline.</td></tr><tr><td colspan="2">[...]</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>[...]</td></tr><tr><td>Memory State: CertificateInstalled for certificateType V2GRootCertificate CertificateInstalled for certificateType MORootCertificate RenewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificates.certificateType = V2GCertificateChain ) IdTokenCached for &lt;Configured valid IdToken fields&gt; (If implemented) IdTokenLocalAuthList for &lt;Configured valid IdToken fields&gt; (If implemented)</td></tr><tr><td>Reusable State(s): N/a</td></tr><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>5. The Charging Station sends a TransactionEventRequest Note(s): - This step needs to be executed when TxStartPoint contains EVConnected OR the transaction already started -So in the case TxStartPoint contains ParkingBayOccupancy (in the case TxStartPoint contains ParkingBayOccupancy_)</td><td>6. The Test System responds with a TransactionEventResponse</td></tr><tr><td>7. The Charging Station sends a TransactionEventRequest Note(s): - This step needs to be executed when TxStartPoint contains Authorized OR the transaction already started. So in the case TxStartPoint contains ParkingBayOccupancy or EVConnected.</td><td>8. The Test System responds with a TransactionEventResponse With idTokenInfo.status Accepted</td></tr><tr><td colspan="2">9. Execute Reusable State EnergyTransferStarted</td></tr></table>

# 6.2.42. Page 153 - (2024-09) - TC_C_55_CS - removed reusable state IdTokenCached [O20-3510]

<table><tr><td>Test case name</td><td colspan="2">Authorization using Contract Certificates 15118 - Offline - ContractValidationOffline is false</td></tr><tr><td>Test case Id</td><td colspan="2">TC_C_55_CS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="6">Before
(Preparations)</td><td colspan="2">Configuration State:
...</td></tr><tr><td colspan="2">Memory State:
CertificateInstalled for certificateType V2GRootCertificate</td></tr><tr><td colspan="2">CertificateInstalled for certificateType MORootCertificate</td></tr><tr><td colspan="2">IdTokenCached for &lt;Configured valid IdToken fields&gt; (If implemented)</td></tr><tr><td colspan="2">IdTokenLocalAuthList for &lt;Configured valid IdToken fields&gt; (If implemented)</td></tr><tr><td colspan="2">Reusable State(s):
N/a</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td colspan="3">...</td></tr></table>

# 6.2.43. Page 153 - (2025-02) - TC_C_55_CS

<table><tr><td>Test case name</td><td>Authorization using Contract Certificates 15118 - Offline - ContractValidationOffline is false</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>Description</td><td>The Charging Station is able to authorize with contract certificates when it supports ISO 15118. The Charging Station will not authorize with contract certificates when offline.</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>TxCtrl.TxStartPoint contains one or more of PowerPathClosed, Authorized, EVConnected, ParkingBayOccupancy</td></tr><tr><td>AuthCtrl.AuthEnabled is true (If implemented AND ReadWrite)</td></tr><tr><td>AuthCacheCtrl.Enabled is true OR LocalAuthListCtrl.Enabled is true</td></tr><tr><td>OfflineTxForUnknownIdEnabled is true (If implemented)</td></tr><tr><td>OfflineTxForUnknownIdEnabled is false (If implemented)</td></tr><tr><td>OfflineThreshold is &lt;Configured RetryBackOffWaitMinimum_duration&gt; + 60.0</td></tr><tr><td>RetryBackOffWaitMinimum is &lt;Configured RetryBackOffWaitMinimum_duration&gt;</td></tr><tr><td>RetryBackOffRandomRange is 0</td></tr><tr><td>Note:</td></tr><tr><td>&lt;Configured RetryBackOffWaitMinimum_duration should be long enough to execute manual tasks&gt;</td></tr><tr><td>For the ISO15118Ctrlr of the EVSE involved in the PnC transaction:</td></tr><tr><td>ISO15118Ctrlr ContractValidationOffline is false</td></tr><tr><td>ISO15118Ctrlr.PnCEnabled is true</td></tr><tr><td>Memory State:</td></tr><tr><td>CertificatesInstalled for certificateType V2GRootCertificate</td></tr><tr><td>CertificatesInstalled for certificateType MORootCertificate</td></tr><tr><td>RnewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificates.certificateType = V2GCertificateChain)</td></tr><tr><td>IdTokenCached for &lt;Configured valid IdToken fields&gt; (If implemented)</td></tr><tr><td>IdTokenLocalAuthList for &lt;Configured valid IdToken fields&gt; (If implemented)</td></tr><tr><td>Reusable State(s):</td></tr><tr><td>N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>5. The Charging Station sends a TransactionEventRequest Note(s): - This step needs to be executed when TxStartPoint contains EVConnected OR the transaction already started -So in the case TxStartPoint contains ParkingBayOccupancy (in the case TxStartPoint contains ParkingBayOccupancy_)</td><td>6. The Test System responds with a TransactionEventResponse</td></tr><tr><td colspan="2">[...]</td></tr></table>

# 6.2.44. Page 165/169 - (2025-02) -

# TC_E_01_CS/TC_E_09_CS/TC_E_10_CS/TC_E_12_CS/TC_E_13_CS - Extended the testcases until the Charging Station start charging

This is needed to test the TransactionEventRequest with eventType Updated messages, while specific TxStartPoints are configured.

<table><tr><td>Test case name</td><td>Start transaction options - PowerPathClosed</td></tr><tr><td>Test case Id</td><td>TC_E_01_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State EVConnectedPreSession</td></tr><tr><td colspan="2">2. Execute Reusable State EnergyTransferStarted</td></tr><tr><td>Test case name</td><td>Start transaction options - EVConnected</td></tr><tr><td>Test case Id</td><td>TC_E_09_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State EVConnectedPreSession</td></tr><tr><td colspan="2">2. Execute Reusable State Authorized</td></tr><tr><td colspan="2">3. Execute Reusable State EnergyTransferStarted</td></tr></table>

<table><tr><td>Test case name</td><td>Start transaction options - Authorized - Local</td></tr><tr><td>Test case Id</td><td>TC_E_10_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State Authorized (Local)</td></tr><tr><td colspan="2">2. Execute Reusable State EVConnectedPreSession</td></tr><tr><td colspan="2">3. Execute Reusable State EnergyTransferStarted</td></tr></table>

<table><tr><td>Test case name</td><td>Start transaction options - ParkingBayOccupied</td></tr><tr><td>Test case Id</td><td>TC_E_12_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State ParkingBayOccupied</td></tr><tr><td colspan="2">2. Execute Reusable State Authorized</td></tr><tr><td colspan="2">3. Execute Reusable State EVConnectedPreSession</td></tr><tr><td colspan="2">4. Execute Reusable State EnergyTransferStarted</td></tr></table>

<table><tr><td>Test case name</td><td>Start transaction options - Authorized - Remote</td></tr><tr><td>Test case Id</td><td>TC_E_13_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State Authorized (Remote)</td></tr><tr><td colspan="2">2. Execute Reusable State EVConnectedPreSession</td></tr><tr><td colspan="2">3. Execute Reusable State EnergyTransferStarted</td></tr></table>

# 6.2.45. Page 174 - (2025-04) - TC_E_17_CS - Aligned configuration before steps with updated prerequisites

Note: This erratum extends erratum: Page 174 - (2024-09) - TC_E_17_CS - Updated prerequisite for test case to correctly specify the applicable TxStopPoint combinations

The prerequisite was updated, but the before configuration steps were not aligned with this change.

<table><tr><td>Test case name</td><td>Stop transaction options - Deauthorized - EV side disconnect</td></tr><tr><td>Test case Id</td><td>TC_E_17_CS</td></tr><tr><td colspan="2">...</td></tr><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>If the mutability of TxStopPoint is ReadWrite then TxStopPoint contains PowerPathClosed AND/OR Authorized</td></tr><tr><td>StopTxOnEVSideDisconnect is true</td></tr><tr><td>UnlockOnEVSideDisconnect is false</td></tr><tr><td>AuthCtrl.AuthEnabled is true (If implemented AND ReadWrite)</td></tr><tr><td>AuthCtrl_DISABLERemoteAuthorization is false (If implemented)</td></tr></table>

# 6.2.46. Page 174 - (2024-09) - TC_E_17_CS - Updated prerequisite for test case to correctly specify the applicable TxStopPoint combinations

Note: This erratum is extended by erratum: Page 174 - (2025-04) - TC_E_17_CS - Aligned configuration before steps with updated prerequisites

This testcase allows for a limited set of TxStopPoint combinations, otherwise it is not applicable.

<table><tr><td>Test case name</td><td>Stop transaction options - Deauthorized - EV side disconnect</td></tr><tr><td>Test case Id</td><td>TC_E_17_CS</td></tr><tr><td colspan="2">...</td></tr><tr><td>Old: Prerequisite(s)</td><td>- The Charging Station does NOT have the following configuration; The mutability of TxStopPoint is ReadOnly AND the value Authorized OR PowerPathClosed is NOT set OR (EnergyTransfer OR DataSigned OR EVConnected is set). 
- If the mutability of TxStopPoint is _ReadWrite, then the value Authorized OR PowerPathClosed must be supported.</td></tr><tr><td>New: Prerequisite(s)</td><td>This testcase is applicable if the value Authorized is a supported value for TxStopPoint AND EVConnected, PowerPathClosed and EnergyTransfer must not be set as TxStopPoint AND StopTxOnEVSideDisconnect true must be a supported value.</td></tr></table>

# 6.2.47. Page 176 - (2024-11) - TC_E_39_CS - Missing StatusNotificationRequest/NotifyEventRequest

<table><tr><td>Test case name</td><td colspan="2">Stop transaction options - Deauthorized - timeout</td></tr><tr><td>Test case Id</td><td colspan="2">TC_E_39_CS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="6">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td colspan="2">Manual Action: Connect the EV and EVSE on EV side.</td></tr><tr><td colspan="2">Manual Action: Connect the EV and EVSE on EVSE side.</td></tr><tr><td>3. The Charging Station notifies the CSMS about the status change of the connector.</td><td>4. The OCTT responds accordingly.</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Test case name</td><td>Stop transaction options - Deauthorized - timeout</td></tr><tr><td rowspan="2">Tool validations</td><td>* Step 1: 
Message: TransactionRequest 
- triggerReason must be EVConnectTimeout 
- eventType must be Updated if TxStartPoint is ParkingBayOccupancy, else Ended 
- transactionInfo.stoppedReason must be Timeout 
* Step 3: 
Message: StatusNotificationRequest 
- connectorStatus must be Occupied 
Message: NotifyEventRequest 
- eventData[0].trigger must be Delta 
- eventData[0].actualValue must be Occupied 
- eventData[0].component.name must be Connector 
- eventData[0].variable.name must be AvailabilityState 
* Step 5: 
Message: TransactionEventRequest 
- triggerReason can only be CablePluggedIn 
- transactionInfo.chagringState should not be Charging 
- eventType must be Updated if TxStartPoint is ParkingBayOccupancy, else Ended</td></tr><tr><td>Post scenario validations: 
N/a</td></tr></table>

# 6.2.48. Page 182 - (2025-04) - TC_E_52_CS - Testcase is not able to determine the authorization is refused in case TxStartPoint is not Authorized

The testcase is not able to verify the authorization is refused when the TxStartPoint is not Authorized. Therefore the testcase is extended to also plugin the cable to determine whether the authorization was actually refused.

<table><tr><td>Test case name</td><td>Local start transaction - Authorization first - DisableRemoteAuthorization</td></tr><tr><td>Test case Id</td><td>TC_E_52_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Manual Action: Present an idToken which is not configured in the Local Authorization List nor present in Authorization Cache.</td></tr><tr><td>1. The Charging Station does NOT send aauthorizeRequest</td><td></td></tr><tr><td colspan="2">2. Execute Reusable State EVConnectedPreSession</td></tr><tr><td colspan="2">3. The Charging Station does NOT start charging.</td></tr></table>

# 6.2.49. Page 185 - (2024-09) - TC_E_35_CS - StoppedReason must be validated in Ended event [O20-4467]

<table><tr><td>Test case name</td><td colspan="2">Stop transaction options - PowerPathClosed - Remote stop</td></tr><tr><td>Test case Id</td><td colspan="2">TC_E_35_CS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Test case name</td><td>Stop transaction options - PowerPathClosed - Remote stop</td></tr><tr><td rowspan="2">Tool validations</td><td>* Step 2: 
Message: RequestStopTransactionResponse 
- status must be Accepted 
* Step 3: 
Message: TransactionRequest 
- triggerReason must be RemoteStop (for one of the TransactionRequest) 
- transactionInfo.stoppedReason must be Remote (for the last TransactionRequest) 
-eventType must be Ended (for the last TransactionRequest)</td></tr><tr><td>Post scenario validations: 
N/a</td></tr></table>

# 6.2.50. Page 188 - (2025-02) - TC_E_22_CS - Stop transaction options - EnergyTransfer stopped - will end transaction

When TxStopPoint is EnergyTransfer this will end transaction when EV suspends energy.

TC_E_22_CS: Stop transaction options - EnergyTransfer stopped - SuspendedEV

<table><tr><td>Test case name</td><td>Stop transaction options - EnergyTransfer stopped - SuspendedEV</td></tr><tr><td>Test case Id</td><td>TC_E_22_CS</td></tr><tr><td>..</td><td>..</td></tr></table>

6.2.51. Page 189 - (2025-06) - TC_E_14_CS - StoppedReason validation too strict for remote

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1: 
Message: TransactionRequest 
- triggerReason must be ChargingStateChanged 
- transactionInfo.chargingState must be EVConnected -OR 
- transactionInfo.chargingState must be SuspendedEV AND 
- transactionInfo.stoppedReason must be StoppedByEV 
- eventType must be Ended (if chargingState is EVConnected) -OR 
-eventType must be Updated (if chargingState is SuspendedEV)</td></tr><tr><td>Post scenario validations: 
N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Stop transaction options - EVDisconnected - Charging Station side</td></tr><tr><td>Test case Id</td><td>TC_E_14_CS</td></tr><tr><td colspan="2">...</td></tr><tr><td>Tool validations</td></tr><tr><td>* Step 1:</td></tr><tr><td>Message: StatusNotificationRequest</td></tr><tr><td>- connectorStatus must be Available</td></tr><tr><td>Message: NotifyEventRequest</td></tr><tr><td>- eventData[0].trigger must be Delta</td></tr><tr><td>- eventData[0].actualValue must be Available</td></tr><tr><td>- eventData[0].component.name must be Connector</td></tr><tr><td>- eventData[0].variable.name must be AvailabilityState</td></tr><tr><td>* Step 3:</td></tr><tr><td>Message: TransactionEventRequest</td></tr><tr><td>- triggerReason must be EVCommunicationLost</td></tr><tr><td>- transactionInfo.chargingState must be Idle</td></tr><tr><td>- If the Test System is configured to stop transactions using a RequestStopTransactionRequest message then transactionInfo.stoppedReason must be Remote or EVDisconnected.</td></tr><tr><td>Else transactionInfo.stoppedReason must be Local, EVDisconnected or be omitted.</td></tr><tr><td>-/eventType must be Ended</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>N/a</td></tr></table>

# 6.2.52. Page 199 - (2025-04) - TC_E_27_CS - Remove manual action between step 4/5

There seems to have been copy/paste errors between testcase TC_E_26_CS and TC_E_27_CS. The cable should not have been reconnected between these steps as we are trying to trigger the timeout.

<table><tr><td>Test case name</td><td>Disconnect cable on EV-side - Suspend transaction - Fixed cable connection timeout</td></tr><tr><td>Test case Id</td><td>TC_E_27_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Manual Action: Disconnect the EV and EVSE on EV side (EVSE loses connection with EV).</td></tr><tr><td>1. The Charging Station sends a TransactionRequest</td><td>2. The Test System responds with a TransactionResponse</td></tr><tr><td>3. The Charging Station notifies the CSMS about the current state of the connector.Note(s):–This step needs to be executed when the Charging Station has a permanently attached cable on the Charging Station side.</td><td>4. The Test System responds accordingly.</td></tr><tr><td colspan="2">Manual Action: Reconnect the EV and EVSE on EV side.Note(s):–If the Charging Station has a permanently attached cable on the Charging Station side, then this step needs to be executed before the configured EVConnectionTimeout expires.</td></tr><tr><td>5. The Charging Station sends a TransactionRequest</td><td>6. The Test System responds with a TransactionResponse</td></tr><tr><td colspan="2">Note(s):–Optionally the Charging Station can send a StatusNotificationRequest or NotifyEventRequest with status Available</td></tr></table>

# 6.2.53. Page 204 - (2025-02) - TC_E_31_CS - Add steps for when running the testcase in Remote mode

As the Charging Station will go offline, the transaction must be stopped from EV side in case of remote authorization.

# TC_E_31_CS: Check Transaction status - Transaction with id ended - with message in queue

<table><tr><td>Test case name</td><td>Check Transaction status - Transaction with id ended - with message in queue</td></tr><tr><td>Test case Id</td><td>TC_E_31_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

# Before (Preparations)

# Configuration State:

···

UnlockOnEVSideDisconnect is true (If ReadWrite)

…

# Main (Test scenario)

<table><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td></td><td>The OCTT closes the WebSocket connection AND does not accept a reconnect.</td></tr><tr><td colspan="2">Manual Action: Present the same idToken as used to start the transaction.
Notes(s): Only if configured scenario is local</td></tr><tr><td colspan="2">Manual Action: Stop the energy transfer via the EV.
Notes(s): Only if configured scenario is remote</td></tr><tr><td colspan="2">Manual Action: Disconnect the EV and EVSE.</td></tr><tr><td colspan="2">Manual Action: Drive EV out of parking bay. (Only needed if TxStopPoint is ParkingBayOccupancy)</td></tr><tr><td colspan="2">...</td></tr></table>

# Tool validations

···

- Step 3:

Message: TransactionEventRequest

The tool validations from the reusable states need to be used to verify whether all required TransactionEventRequests have been received.

From StopAuthorized through ParkingBayUnoccupied (in case of scenario Local).

And from EnergyTransferSuspended through ParkingBayUnoccupied (in case of scenario Remote).

Post scenario validations:

N/a

# 6.2.54. Page 214 - (2024-06) TC_E_43_CS Move reusable state TransactionEventsInQueueEnded to Before [768]

State TransactionEventsInQueueEnded is moved to Before stage.

Test Case Id: TC_E_43_CS

<table><tr><td>Test case name</td><td>Offline Behaviour - Transaction during offline period</td></tr><tr><td>Test case Id</td><td>TC_E_43_CS</td></tr><tr><td>Use case Id(s)</td><td>E12</td></tr><tr><td>Requirement(s)</td><td>E12.FR.01,E12.FR.02,E12.FR.06</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>The Charging Station queues TransactionEvent messages to inform the CSMS that a transaction occurred while the Charging Station was Offline.</td></tr><tr><td>Purpose</td><td>To verify if the Charging Station is able to queue TransactionEvent messages while it was offline.</td></tr><tr><td>Prerequisite(s)</td><td>The Charging Station supports authorization methods other than NoAuthorization</td></tr><tr><td>Test case name</td><td colspan="2">Offline Behaviour - Transaction during offline period</td></tr><tr><td rowspan="3">Before 
(Preparations)</td><td colspan="2">Configuration State: 
N/a</td></tr><tr><td colspan="2">Memory State: 
N/a</td></tr><tr><td colspan="2">Reusable State(s): 
State is TransactionEventsInQueueEnded</td></tr><tr><td rowspan="3">Main 
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State TransactionEventsInQueueEnded</td></tr><tr><td>1. The Charging Stations sends a TransactionRequest 
Note(s): 
- The Charging Station will empty its Transaction message queue. This will contain one or more TransactionRequest messages</td><td>2. The OCTT responds with a TransactionResponse</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">* Step 1: 
All messages: TransactionRequest 
-offline must be true 
One of the messages: TransactionRequest 
-eventType Started 
One of the messages: TransactionRequest 
-eventType Ended</td></tr><tr><td colspan="2">Post scenario validations: 
N/a</td></tr></table>

NOTE If the Charging Station supports ISO15118, this testcase needs to be executed using EIM.

# 6.2.55. Page 217 - (2025-04) - TC_E_46_CS - Testcase updated to use the specialized Authorized15118 reusable state

Testcase updated to use the specialized Authorized15118 reusable state for starting the transaction, instead of the standard Authorized reusable state.

<table><tr><td>Test case name</td><td>End of charging process 15118</td></tr><tr><td>Test case Id</td><td>TC_E_46_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
State is EVConnectedPreSession 
State is Authorized15118 
State is EnergyTransferStarted</td></tr></table>

# 6.2.56. Page 221 - (2024-06) TC_F_04_CS Made mandatory in part 5, but prerequisite in part 6 was not updated

Removed Prerequisite(s):

<table><tr><td>Old</td><td>The Charging Station supports TxCtrl.TxStartPoint ParkingBayOccupancy OR Authorized.</td></tr><tr><td>New</td><td>N/a</td></tr></table>

And added to Preparations:

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>- TxCtrl.TxStartPoint is ParkingBayOccupancy OR Authorized (If supported)</td></tr></table>

# 6.2.57. Page 221 - (2025-02) TC_F_04_CS Prerequisite only if supported

Update Preparation(s):

Updated Preparations to only set TxStartPoint if supported:

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>- TxCtrl.TxStartPoint is ParkingBayOccupancy OR Authorized (If supported)</td></tr></table>

# 6.2.58. Page 295 - (2024-09) - TC_J_XX_CS Meter Values

Meter values cannot have location $=$ "EV", unless it is for measurand "SoC".

For all test cases in J add the following Post scenario validation:

<table><tr><td colspan="2">...</td></tr><tr><td rowspan="2">Tool validations</td><td>...</td></tr><tr><td>Post scenario validations: 
Message: MeterValuesRequest/TransactionRequest 
- ... 
- None of the provided sampledValues shall have location = EV, except when measurand = SoC.</td></tr></table>

# 6.2.59. Page 236 - (2025-02) - TC_F_19_CS - The testcase ends while the firmware update is still ongoing

Testcase TC_F_19_CS starts a firmware update and ends the testcase while it is still ongoing. This may cause problems for the next testcase, without proper cleanup. Therefore an invalid signature is given to prevent a full firmware update as this can take quite some time. These messages are then handled by the cleanup, but these described steps are not part of the scope of the testcase and therefore the SUT is unable to fail during these steps.

<table><tr><td>Test case name</td><td>Trigger message - FirmwareStatusNotification - Downloading</td></tr><tr><td>Test case Id</td><td>TC_F_19_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a UpdateFirmwareResponse</td><td>1. The Test System sends a UpdateFirmwareRequest firmware.location is &lt;Configured firmware_location&gt; firmware.retrieveDateTime is &lt;Current dateTime - 2 hours&gt; firmware.installDateTime is omitted firmware signingCertificate is &lt;Configured signingCertificate&gt; firmwaresignature is &lt;Configured invalid firmware signature&gt;</td></tr><tr><td colspan="2">...</td></tr><tr><td colspan="2">Note : Step 9 through 14 are cleanup to prevent an ongoing firmware update after the testcase is already ended. The behavior part of these steps is part of TC_L_06_CS and therefore not part of the scope for this testcase.</td></tr><tr><td>9. The Charging Station sends a FirmwareStatusNotificationRequest . With status Downloaded</td><td>10. The Test System responds with a FirmwareStatusNotificationResponse .</td></tr><tr><td>11. The Charging Station sends a FirmwareStatusNotificationRequest . With status InvalidSignature</td><td>12. The Test System responds with a FirmwareStatusNotificationResponse .</td></tr><tr><td>13. The Charging Station sends a SecurityEventNotificationRequest . With type Invalid FirmwareSignature</td><td>14. The Test System responds with a SecurityEventNotificationResponse .</td></tr></table>

# 6.2.60. Page 272 - (2025-02) - TC_H_08_CS Reserve an unspecified EVSE - Accepted

Wrong token was used for RequestStartTransaction.

TC_H_08_CS: Reserve an unspecified EVSE - Accepted

<table><tr><td>Test case name</td><td>Reserve an unspecified EVSE - Accepted</td></tr><tr><td>Test case Id</td><td>TC_H_08_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>…</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td colspan="2">5. Execute Reusable State AuthorizedNote(s):- &lt;Configured valid_idtoken_idtoken&gt; is used for the authorization.</td></tr><tr><td colspan="2">...</td></tr><tr><td>Tool validations</td></tr><tr><td>* Step 2:Message: ReserveNowResponse- status must be Accepted* Step 3: (Optional)Message: StatusNotificationRequest- connectorStatus must be Reserved-evseld must be &lt;Configured evseld&gt; - connectorld must be &lt;Configured connectorld&gt;Message: NotifyEventRequest- trigger must be Delta-actualValue must be "Reserved"- component.name must be "Connector"- evse.id must be &lt;Configured evseld&gt;- eyesconnectorld must be &lt;Configured connectorld&gt;- variable.name must be "AvailabilityState"(Optional)Message: NotifyEventRequest-eventData[0].trigger must be Delta-eventData[0].actualValue must be Available-eventData[0].component.name must be EVSE-eventData[0].variable.name must be AvailabilityState</td></tr><tr><td>Post scenario validations:N/a</td></tr></table>

# 6.2.61. Page 279/280 - (2025-06) - TC_H_15_CS & TC_H_16_CS can only be executed when the connector type of the Charging Station is part of the connectorEnumType.

The ConnectorEnumType list does not contain all connectorTypes. At OCPP 2.1 this enum has been changed to a string and can be extended, however this is not possible for OCPP 2.0.1. Therefore the reservation of connectorType testcases will not work for connectorTypes that are not part of the enum. It is not a major issue, because the CSMS can always reserve a specific EVSE based on the connectorTypes specified at the device model.

<table><tr><td>Test case name</td><td>Reserve a connector with a specific type - Success</td></tr><tr><td>Test case Id</td><td>TC_H_15_CS</td></tr><tr><td>Prerequisite(s)</td><td>- The configuration variable ReservationCtrl.ReservationAvailable is implemented with value true
- The Charging Station supports the reservation of a specific connector type, that is part of the ConnectorEnumType.</td></tr></table>

<table><tr><td>Test case name</td><td>Reserve a connector with a specific type - Amount of available connectors of a type equals the amount of reservations</td></tr><tr><td>Test case Id</td><td>TC_H_16_CS</td></tr><tr><td>Prerequisite(s)</td><td>- The configuration variable ReservationCtrlr.ReservationAvailable is implemented with value true
- The Charging Station supports the reservation of a specific connector type, that is part of the ConnectorEnumType.</td></tr></table>

# 6.2.62. Page 282 - (2025-02) - TC_H_17_CS - made more explicit on what to validate

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2:Message: CancelReservationResponse - status must be Accepted * Step 3:For each connector on the &lt;Configured evseld&gt; one of the following messages must be sent:Message: StatusNotificationRequest - connectorStatus must be Available - evseld must be &lt;Configured evseld&gt; - connectorld must be &lt;Configured connectorld&gt;Message: NotifyEventRequest - trigger must be Delta - actualValue must be &quot;Available&quot; - component.name must be &quot;Connector&quot; - evse.id must be &lt;Configured evseld&gt; - eyesconnectorld must be &lt;Configured connectorld&gt; - variable.name must be &quot;AvailabilityState&quot;</td></tr><tr><td>Post scenario validations: N/a</td></tr></table>

# 6.2.63. Page 297 - (2025-02) - TC_J_02_CS Clock-aligned Meter Values - reporting multiple phases

An erratum was added on adding support for validating reporting measurands on multiple phases: TC_J_02_CS Clock-aligned Meter Values (2024-09). However the validation is too strict, so this erratum supersedes it. Reporting measurands per phase must be done, when the energy meter supports it and it is applicable for the specified measurand.

<table><tr><td>Test case name</td><td colspan="2">Clock-aligned Meter Values - Transaction ongoing</td></tr><tr><td>Test case Id</td><td colspan="2">TC_J_02_CS</td></tr><tr><td>Use case Id(s)</td><td colspan="2">J01</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="3">Before 
(Preparations)</td><td colspan="2">Configuration State: 
AlignedDataInterval is &lt;Configured clock-aligned Meter Values interval&gt; 
AlignedDataSendDuringIdle is false (If implemented) 
RegisterValuesWithoutPhases is false (If implemented)</td></tr><tr><td colspan="2">Memory State: 
N/a</td></tr><tr><td colspan="2">Reusable State(s): 
State is EnergyTransferStarted</td></tr><tr><td rowspan="2">Main 
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">Note: The following steps do not need to be sent in a specific order. 
* Step 1: 
Message: MeterValuesRequest 
- meterValue[0].sampledValue[0].context must be Sample.Circle 
- meterValue[0].sampledValue must contain &lt;An element per configured measurand at the 
AlignedDataMeasurands&gt; 
Notes : 
- The measurand field may be omitted when the measurand is &quot;Energy.Active.Import.Register&quot; 
- It is possible that measurands are reported on multiple locations or phases, based on the capabilities of the 
energy meter. 
* Step 3: 
Message: TransactionEventRequest 
- triggerReason must be MeterValueClock 
- metervalue[0].sampledValue[0].context must be Sample.Circle 
- metervalue[0].sampledValue must contain &lt;An element per configured measurand at the 
AlignedDataMeasurands&gt; 
Notes : 
- The measurand field may be omitted when the measurand is &quot;Energy.Active.Import.Register&quot; 
- It is possible that measurands are reported on multiple locations or phases, based on the capabilities of the 
energy meter.</td></tr><tr><td colspan="2">Post scenario validations: 
...</td></tr></table>

# 6.2.64. Page 297 - (2024-09) - TC_J_02_CS Clock-aligned Meter Values

Meter values must be reported for all phases.

<table><tr><td>Test case name</td><td>Clock-aligned Meter Values - Transaction ongoing</td></tr><tr><td>Test case Id</td><td>TC_J_02_CS</td></tr><tr><td>Use case Id(s)</td><td>J01</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Test case name</td><td colspan="2">Clock-aligned Meter Values - Transaction ongoing</td></tr><tr><td rowspan="3">Before(Preparations)</td><td colspan="2">Configuration State:AlignedDataInterval is &lt;Configured clock-aligned Meter Values interval&gt;AlignedDataSendDuringIdle is false (If implemented)RegisterValuesWithoutPhases is false (If implemented)</td></tr><tr><td colspan="2">Memory State:N/a</td></tr><tr><td colspan="2">Reusable State(s):State is EnergyTransferStarted</td></tr><tr><td rowspan="2">Main(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">Note: The following steps do not need to be sent in a specific order.* Step 1:Message: MeterValuesRequest-meterValue[0].sampledValue[0].context must be Sample.Circle-meterValue[0].sampledValue must contain &lt;An element per configured measurand at theAlignedDataMeasurands for the number of phases reported in SupplyPhases. The measurand field may be omitted when the measurand is &quot;Energy.Active.Import.Register&quot;&gt;* Step 3:Message: TransactionEventRequest-triggerReason must be MeterValueClock-metervalue[0].sampledValue[0].context must be Sample.Circle-metervalue[0].sampledValue must contain &lt;An element per configured measurand at theAlignedDataMeasurands for the number of phases reported in SupplyPhases. The measurand field may be omitted when the measurand is &quot;Energy.Active.ImportREGISTER&quot;&gt;</td></tr><tr><td colspan="2">Post scenario validations:...</td></tr></table>

# 6.2.65. Page 306 - (2024-06) - TC_J_10_CS - Remove reference to non-existing requirements [4697]

<table><tr><td>Test case name</td><td>Sampled Meter Values - EventType Ended</td></tr><tr><td>Test case Id</td><td>TC_J_10_CS</td></tr><tr><td>Use case Id(s)</td><td>J02 &amp; (E06,E07,E08,E09,E10,E12)</td></tr><tr><td>Requirement(s)</td><td>J02.FR.01,J02.FR.02,J02.FR.03,J02.FR.04,J02.FR.10, E06.FR.11, E06.FR.17, E07.FR.08, E07.FR.13,E08.FR.09,E09.FR.05,E10.FR.04,E12.FR.07</td></tr><tr><td colspan="2">...</td></tr></table>

# 6.2.66. Page 318 - (2025-04) TC_K_09_CS: Removed validFrom/To from test

<table><tr><td>Test case name</td><td>Clear Charging Profile - Clearing a TxDefaultProfile - With ongoing transaction</td></tr><tr><td>Test case Id</td><td>TC_K_09_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:
SmartChargingCtrl.LimitChangeSignificance is 1.0</td></tr><tr><td>Memory State:</td></tr><tr><td>SetChargingProfile with</td></tr><tr><td>ChargingProfile 1:</td></tr><tr><td>chargingProfilePurpose is TxDefaultProfile</td></tr><tr><td>chargingProfileKind should be Absolute</td></tr><tr><td>stackLevel should be 0</td></tr><tr><td>evseld &lt;Configured evseld&gt;</td></tr><tr><td>validFrom &lt;currentDateTime&gt;&lt;Configured max time deviation&gt; seconds&gt;</td></tr><tr><td>validTo &lt;currentDateTime&gt;&lt;Configured max time deviation&gt; + 401 seconds&gt;</td></tr><tr><td>startSchedule &lt;currentDateTime&gt;</td></tr><tr><td>numberPhases &lt;Configured numberPhases&gt;</td></tr><tr><td>ChargingSchedule:</td></tr><tr><td>duration 400 + &lt;Configured max time deviation&gt;</td></tr><tr><td>...</td></tr></table>

# 6.2.67. Page 343 - (2025-04) TC_K_23_CS: Removed validFrom/To from test

<table><tr><td>Test case name</td><td>Set Charging Profile - StartSchedule</td></tr><tr><td>Test case Id</td><td>TC_K_23_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetChargingProfileResponse</td><td>1. The Test System sends a SetChargingProfileRequest with chargingProfile.chargingProfilePurpose is TxDefaultProfile chargingProfile.chargingProfileKind is Absolute evseld &lt;configured evseld&gt; chargingProfile.validFrom &lt;current dateTime&gt;&lt;Configured max time deviation&gt; + 50 seconds&gt; chargingProfile.validTo &lt;current dateTime&gt;&lt;Configured max time deviation&gt; + 400 seconds&gt; chargingProfile.chargingSchedule[0].startSchedule &lt;current dateTime&gt; + 60 seconds&gt; chargingProfile.chargingSchedule[0].chargingSchedulePeriod[]. numberPhases &lt;Configured numberPhases&gt; chargingProfile.chargingSchedule[0].chargingSchedulePeriod[]. startPeriod 0 chargingProfile.chargingSchedule[0].chargingSchedulePeriod[0 ].limit 6 * &lt;limit multiplier&gt; Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr><tr><td>...</td><td>...</td></tr></table>

# 6.2.68. Page 337 - (2025-04) TC_K_28_CS: Removed validFrom/To from test

<table><tr><td>Test case name</td><td>Set Charging Profile - TxDefaultProfile with transaction ongoing</td></tr><tr><td>Test case Id</td><td>TC_K_28_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetChargingProfileResponse</td><td>1. The Test System sends a SetChargingProfileRequest with chargingProfile.chargingProfilePurpose is TxDefaultProfile chargingProfile.chargingProfileKind is Absolute chargingProfile.chargingSchedule[0].duration is &lt;400 + &lt;Configured max time deviation&gt; seconds&gt; evseld &lt;Configured evseld&gt; chargingProfile.validFrom &lt;current dateTime - &lt;Configured max time deviation&gt; seconds&gt; chargingProfile.validTo &lt;current dateTime + &lt;Configured max time deviation&gt; + 401 seconds&gt; chargingProfile.chargingSchedule[0].startSchedule &lt;current dateTime - &lt;Configured max time deviation&gt; seconds&gt; chargingProfile.chargingSchedule[0].chargingSchedulePeriod[0 ].numberPhases &lt;Configured numberPhases&gt; chargingProfile.chargingSchedule[0].chargingSchedulePeriod[0 ].startPeriod 0 chargingProfile.chargingSchedule[0].chargingSchedulePeriod[0 ].limit 6 * &lt;limit multiplier&gt; ...</td></tr></table>

# 6.2.69. Page 345 - (2025-02) TC_K_XX_CS: Use realistic values for composite schedules

In order to use realistic limits for charging profiles, the limit of a charging profile will be determined by <Configured chargingRateUnit> and <Configured numberPhases>.

# Added new section to section K Smart Charging

# Determine Charging Profile Limit Multiplier

Not all chargers support setting limits in A or W. This can be configured with the configuration variable <ConfiguredchargingRateUnit>. To calculate the limit to be used, the following rules must be followed:

If <Configured chargingRateUnit> is A, then <limit multiplier> is 1

If <Configured chargingRateUnit> is W and <Configured numberPhases> is 1, then <limit multiplier> is 230

If <Configured chargingRateUnit> is W and <Configured numberPhases> is 2, then <limit multiplier> is 460

If <Configured chargingRateUnit> is W and <Configured numberPhases> is 3, then <limit multiplier> is 690

# Example 1

Given a test case is configured with:

<Configured chargingRateUnit> W

<Configured numberPhases> 2

When the test case specifies:

chargingProfile.chargingSchedule.chargingSchedulePeriodlimit 6 \* <limit multiplier>

Then it should set

chargingProfile.chargingSchedule.chargingSchedulePeriodlimit 2760

Example 2

Given a test case is configured with:

<Configured chargingRateUnit> A

<Configured numberPhases> 3

When the test case specifies:

chargingProfile.chargingSchedule.chargingSchedulePeriodlimit 6 \* <limit multiplier>

Then it should set

chargingProfile.chargingSchedule.chargingSchedulePeriodlimit 6

# All test cases using limits are updated

<table><tr><td>Test case name</td><td>[...]</td></tr><tr><td>Test case Id</td><td>TC_K_01_CS / TC_K_03_CS / TC_K_04_CS / TC_K_09_CS / TC_K_10_CS / TC_K_13_CS / TC_K_21_CS / TC_K_22_CS / TC_K_23_CS / TC_K_28_CS / TC_K_60_CS / TC_K_37_CS / TC_K_38_CS / TC_K_40_CS / TC_K_41_CS / TC_K_56_CS / TC_K_58_CS</td></tr><tr><td colspan="2">[...]</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>[...]</td><td>[...]Replace all *.limit assignments with:*.limit ? * &lt;limit multiplier&gt;Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2:
Replace all *.limit validations with:
*.limit &lt;?&gt; * &lt;limit multiplier&gt;</td></tr><tr><td>Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr><tr><td>Post scenario validations:
[...]</td></tr></table>

# 6.2.70. Page 345 - (2024-06) TC_K_35_CS Get Charging Profile - Evseld > 0 + chargingProfilePurpose [773]

Change initial charging state from "N/A" to:

<table><tr><td colspan="2">Charging State:
State is EnergyTransferStarted</td></tr></table>

# 6.2.71. Page 352 - (2025-04) - TC_K_39_CS - Validation of scheduleStart

<table><tr><td>Test case name</td><td>Get Composite Schedule - No ChargingProfile installed on Charging Station</td></tr><tr><td>Test case Id</td><td>TC_K_39_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
(Message: GetCompositeScheduleResponse) 
status Accepted 
evseld 0</td></tr><tr><td>scheduleStart &lt;The time the GetCompositeScheduleRequest was transmitted +/- &lt;Configured max time deviation&gt;&gt;</td></tr><tr><td>duration is 300</td></tr><tr><td>chargingRateUnit &lt;Configured chargingRateUnit&gt;</td></tr><tr><td>startPeriod 0</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>...</td></tr></table>

# 6.2.72. Page 353 - (2025-04) - TC_K_40_CS: startSchedule improvements

Now using same startSchedule time for both profiles.

<table><tr><td>Test case name</td><td>Get Composite Schedule - Stacking ChargingProfiles</td></tr><tr><td>Test case Id</td><td>TC_K_40_CS</td></tr><tr><td>Use case Id(s)</td><td>K08</td></tr><tr><td>Requirement(s)</td><td>K08.FR.02,K08.FR.06</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>The CSMS requests a composite schedule which is a combination of local limits and the prevailing Charging Profiles of the different chargingProfilePurposes and stack levels.
2 ChargingProfiles with same startSchedule and different stackLevels are submitted.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State:</td></tr><tr><td>set &lt;startScheduleTime&gt; = &lt;current dateTime&gt; - &lt;Configured max time deviation&gt;</td></tr><tr><td>SetChargingProfile with</td></tr><tr><td>ChargingProfile 1:</td></tr><tr><td>chargingProfilePurpose is TxDefaultProfile</td></tr><tr><td>chargingProfileKind should be Absolute</td></tr><tr><td>stackLevel should be 0</td></tr><tr><td>evseld &lt;Configured evseld&gt;</td></tr><tr><td>validFrom &lt;current dateTime&gt; &lt;Configured max time deviation&gt; seconds&gt;</td></tr><tr><td>validTo &lt;current dateTime + &lt;Configured max time deviation&gt; + 401 seconds&gt;</td></tr><tr><td>startSchedule &lt;startScheduleTime&gt;</td></tr><tr><td>numberPhases &lt;Configured numberPhases&gt;</td></tr><tr><td>ChargingSchedule:</td></tr><tr><td>duration 400 &lt;Configured max time deviation&gt;</td></tr><tr><td>chargingRateUnit &lt;Configured chargingRateUnit&gt;</td></tr><tr><td>startPeriod 0, limit 6 * &lt;limit multiplier&gt;</td></tr><tr><td>startPeriod 100, limit 8 * &lt;limit multiplier&gt;</td></tr><tr><td>startPeriod 200, limit 10 * &lt;limit multiplier&gt;</td></tr><tr><td>Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr><tr><td>ChargingProfile 2:</td></tr><tr><td>chargingProfilePurpose is TxDefaultProfile</td></tr><tr><td>chargingProfileKind should be Absolute</td></tr><tr><td>stackLevel should be 1</td></tr><tr><td>evseld &lt;Configured evseld&gt;</td></tr><tr><td>validFrom &lt;current dateTime&gt; &lt;Configured max time deviation&gt; seconds&gt;</td></tr><tr><td>validTo &lt;current dateTime + &lt;Configured max time deviation&gt; + 401 seconds&gt;</td></tr><tr><td>startSchedule &lt;startScheduleTime&gt;</td></tr><tr><td>numberPhases &lt;Configured numberPhases&gt;</td></tr><tr><td>ChargingSchedule:</td></tr><tr><td>duration 150 &lt;Configured max time deviation&gt;</td></tr><tr><td>chargingRateUnit &lt;Configured chargingRateUnit&gt;</td></tr><tr><td>startPeriod 0, limit 7 * &lt;limit multiplier&gt;</td></tr><tr><td>Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr><tr><td>startPeriod 100, limit 9 * &lt;limit multiplier&gt;</td></tr><tr><td>Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr><tr><td>Reusable State(s):</td></tr><tr><td>N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a GetCompositeScheduleResponse</td><td>1. The Test System sends a GetCompositeScheduleRequest with evseld &lt;Configured evseld&gt; 
duration is 350 
chargingRateUnit &lt;Configured chargingRateUnit&gt;</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
(Message: GetCompositeScheduleResponse) 
status Accepted 
evseld &lt;Configured evseld&gt; 
ChargingSchedule: 
duration 350 
chargingRateUnit &lt;Configured chargingRateUnit&gt; 
scheduleStart &lt;The time the GetCompositeScheduleRequest was transmitted&gt; plus/minus &lt;Configured max time deviation&gt; 
Note: The period of time between the scheduleStart from the SetChargingProfileRequest with ChargingProfile 2 and the scheduleStart from the GetCompositeScheduleResponse is called x. 
Note: The period of time between the scheduleStart from the SetChargingProfileRequest with ChargingProfile 1 and the scheduleStart from the GetCompositeScheduleResponse is called y- 
startPeriod 0, limit 7 * &lt;limit multiplier&gt; ( stackLevel 1 ) 
startPeriod (100 - x), limit 9 * &lt;limit multiplier&gt; ( stackLevel 1 ) 
startPeriod (150 - x + &lt;Configured max time deviation&gt;, limit 8 * &lt;limit multiplier&gt; ( stackLevel 0 ) 
startPeriod (200 - x), limit 10 * &lt;limit multiplier&gt; ( stackLevel 0 ) 
Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr><tr><td>Post scenario validations: 
N/a</td></tr></table>

# 6.2.73. Page 355 - (2025-04) - TC_K_41_CS: startSchedule improvement

<table><tr><td>Test case name</td><td>Get Composite Schedule - Combining chargingProfilePurposes</td></tr><tr><td>Test case Id</td><td>TC_K_41_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
set &lt;startScheduleTime&gt; = &lt;current dateTime&gt; - &lt;Configured max time deviation&gt; seconds</td></tr><tr><td>Note: Set MaxProfile for the next 24 hours: 
SetChargingProfile with 
ChargingProfile 1: 
chargingProfilePurpose is ChargingStationMaxProfile 
chargingProfileKind should be Absolute 
stackLevel should be 0 
evseld 0 
startSchedule &lt;startScheduleTime&gt; 
numberPhases &lt;Configured numberPhases&gt; 
ChargingSchedule: 
duration 86400 
chargingRateUnit &lt;Configured chargingRateUnit&gt; 
startPeriod 0, limit 10 * &lt;limit multiplier&gt; 
Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr><tr><td colspan="2">Before (Preparations)</td></tr><tr><td>Note: Set a default profile for 300 seconds</td><td>Note: set a TxProfile for 260 seconds:</td></tr><tr><td>ChargingProfile 2:</td><td>ChargingProfile 3:</td></tr><tr><td>chargingProfilePurpose is TxDefaultProfile</td><td>chargingProfilePurpose is TxProfile</td></tr><tr><td>chargingProfileKind should be Absolute</td><td>chargingProfileKind should be Absolute</td></tr><tr><td>stackLevel should be 0</td><td>stackLevel should be 0</td></tr><tr><td>evseld &lt;Configured evseld&gt;</td><td>evseld &lt;Configured evseld&gt;</td></tr><tr><td>validFrom &lt;currentDateTime&gt;&lt;Configured max time deviation&gt;</td><td>validFrom &lt;currentDateTime&gt;&lt;Configured max time deviation&gt;</td></tr><tr><td>seconds&gt;</td><td>seconds&gt;</td></tr><tr><td>validTo &lt;currentDateTime&gt;&lt;Configured max time deviation&gt; + 401 seconds&gt;</td><td>validTo &lt;currentDateTime&gt;&lt;Configured max time deviation&gt; + 401 seconds&gt;</td></tr><tr><td>startSchedule &lt;startScheduleTime&gt;</td><td>startSchedule &lt;startScheduleTime&gt;</td></tr><tr><td>numberPhases &lt;Configured numberPhases&gt;</td><td>numberPhases &lt;Configured numberPhases&gt;</td></tr><tr><td>ChargingSchedule:</td><td>ChargingSchedule:</td></tr><tr><td>duration 300</td><td>duration 260</td></tr><tr><td>chargingRateUnit &lt;Configured chargingRateUnit&gt;</td><td>chargingRateUnit &lt;Configured chargingRateUnit&gt;</td></tr><tr><td>startPeriod 0,60,120,180,260, limit 6,10,8,15,8 * &lt;limit multiplier&gt;</td><td>startPeriod 0,50,140,200,240, limit 8,11,16,6,12 * &lt;limit multiplier&gt;</td></tr><tr><td>Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td><td>Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr><tr><td colspan="2">Reusable State(s): N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
(Message: GetCompositeScheduleResponse)</td></tr><tr><td>status Accepted</td></tr><tr><td>evseld &lt;Configured evseld&gt;</td></tr><tr><td>ChargingSchedule:</td></tr><tr><td>duration 400</td></tr><tr><td>chargingRateUnit &lt;Configured chargingRateUnit&gt;</td></tr><tr><td>scheduleStart &lt;The time the GetCompositeScheduleRequest was transmitted +/- &lt;Configured max time deviation&gt;&gt;</td></tr><tr><td>Note: The period of time between the scheduleStart from the SetChargingProfileRequest with ChargingProfile 3 and the scheduleStart from the GetCompositeScheduleResponse is called x.</td></tr><tr><td>Note: The period of time between the scheduleStart from the SetChargingProfileRequest with ChargingProfile 2 and the scheduleStart from the GetCompositeScheduleResponse is called y.</td></tr><tr><td>startPeriod 0, limit 8 * &lt;limit multiplier&gt; (TxProfile)</td></tr><tr><td>startPeriod (50 - x), limit 10 * &lt;limit multiplier&gt; (ChargingStationMaxProfile)</td></tr><tr><td>startPeriod (200 - x), limit 6 * &lt;limit multiplier&gt; (TxProfile)</td></tr><tr><td>startPeriod (240 - x), limit 10 * &lt;limit multiplier&gt; (ChargingStationMaxProfile)</td></tr><tr><td>startPeriod (260 - x), limit 8 * &lt;limit multiplier&gt; (TxDefaultProfile)</td></tr><tr><td>startPeriod (300 - x), limit 10 * &lt;limit multiplier&gt; (ChargingStationMaxProfile)</td></tr><tr><td>Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>N/a</td></tr></table>

# 6.2.74. Page 354/355 - (2025-02) - TC_K_40_CS & TC_K_41_CS - Updated composite schedule validation

The startPeriod validation did not take the (to the duration added) <configured max time deviation> into account.

<table><tr><td>Test case name</td><td>Get Composite Schedule - Stacking ChargingProfiles</td></tr><tr><td>Test case Id</td><td>TC_K_40_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
(Message: GetCompositeScheduleResponse) 
status Accepted 
evseld &lt;Configured evseld&gt; 
ChargingSchedule: 
duration 350 
chargingRateUnit &lt;Configured chargingRateUnit&gt; 
scheduleStart &lt;The time the GetCompositeScheduleRequest was transmitted \+/- &lt;Configured max time deviation&gt;&gt; 
Note: If &lt;Configured chargingRateUnit&gt; is W, then the limit field will be multiplied by 1000. 
Note: The period of time between sending the second SetChargingProfileRequest and the scheduleStart from the 
GetCompositeScheduleResponse is called x: 
-Note: The period of time between the scheduleStart from the SetChargingProfileRequest with ChargingProfile 3 and the 
scheduleStart from the GetCompositeScheduleResponse is called x: 
Note: The period of time between the scheduleStart from the SetChargingProfileRequest with ChargingProfile 2 and the 
scheduleStart from the GetCompositeScheduleResponse is called y: 
startPeriod 0, limit 7 
startPeriod (100-x), limit 9 
startPeriod (150-x) 
startPeriod-(200-x), limit 10 
startPeriod 0, limit 8 
startPeriod (50-x), limit 10 
startPeriod (200-x), limit 6 
startPeriod (240-x), limit 10 
startPeriod (260-x + &lt;Configured max time deviation&gt;), limit 8 (TxDefaultProfile) 
startPeriod (300-y + &lt;Configured max time deviation&gt;), limit 10 (ChargingStationMaxProfile)</td></tr><tr><td>Post scenario validations: 
N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Get Composite Schedule - Combining chargingProfilePurposes</td></tr><tr><td>Test case Id</td><td>TC_K_41_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
SetChargingProfile with 
ChargingProfile 1: 
chargingProfilePurpose is ChargingStationMaxProfile 
chargingProfileKind should be Absolute 
stackLevel should be 0 
evseld 0 
startSchedule &lt;currentDateTime - &lt;Configured max time deviation&gt; seconds&gt; 
numberPhases &lt;Configured numberPhases&gt; 
ChargingSchedule: 
duration &lt;86400 &lt;Configured max time deviation&gt; seconds&gt; 
chargingRateUnit &lt;Configured chargingRateUnit&gt; 
Note: If &lt;Configured chargingRateUnit&gt; is W, then the limit field will be multiplied by 1000. 
startPeriod 0, limit 10</td></tr><tr><td colspan="2">Before (Preparations)</td></tr><tr><td>ChargingProfile 2: 
chargingProfilePurpose is TxDefaultProfile 
chargingProfileKind should be Absolute 
stackLevel should be 0 
evseld &lt;Configured evseld&gt; 
validFrom &lt;currentDateTime - &lt;Configured max time deviation&gt; 
seconds&gt; 
validTo &lt;currentDateTime + &lt;Configured max time deviation&gt; + 
401 seconds&gt; 
startSchedule &lt;currentDateTime - &lt;Configured max time 
deviation&gt; seconds&gt; 
numberPhases &lt;Configured numberPhases&gt; 
ChargingSchedule: 
duration &lt;300 &lt;Configured max time deviation&gt; seconds&gt; 
chargingRateUnit &lt;Configured chargingRateUnit&gt; 
Note: If &lt;Configured chargingRateUnit&gt; is W, then the limit field 
will be multiplied by 1000. 
startPeriod 0,60,120,180,260, limit 6,10,8,15,8</td><td>ChargingProfile 3: 
chargingProfilePurpose is TxProfile 
chargingProfileKind should be Absolute 
stackLevel should be 0 
evseld &lt;Configured evseld&gt; 
validFrom &lt;currentDateTime - &lt;Configured max time deviation&gt; 
seconds&gt; 
validTo &lt;currentDateTime + &lt;Configured max time deviation&gt; + 
401 seconds&gt; 
startSchedule &lt;currentDateTime - &lt;Configured max time 
deviation&gt; seconds&gt; 
numberPhases &lt;Configured numberPhases&gt; 
ChargingSchedule: 
 duration &lt;260 &lt;Configured max time deviation&gt; seconds&gt; 
chargingRateUnit &lt;Configured chargingRateUnit&gt; 
 Note: If &lt;Configured chargingRateUnit&gt; is W, then the limit field 
will be multiplied by 1000. 
startPeriod 0,50,140,200,240, limit 8,11,16,6,12</td></tr><tr><td colspan="2">Reusable State(s): 
N/a</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
(Message: GetCompositeScheduleResponse)</td></tr><tr><td>status Accepted</td></tr><tr><td>evseld &lt;Configured evseld&gt;</td></tr><tr><td>ChargingSchedule:</td></tr><tr><td>duration 400</td></tr><tr><td>chargingRateUnit &lt;Configured chargingRateUnit&gt;</td></tr><tr><td>Note: If &lt;Configured chargingRateUnit&gt; is W, then the limit field will be multiplied by 1000.</td></tr><tr><td>Note: The period of time between sending the second SetChargingProfileRequest and the scheduleStart from the GetCompositeScheduleResponse is called x:</td></tr><tr><td>startPeriod 0, limit 8</td></tr><tr><td>startPeriod (50 - x), limit 10</td></tr><tr><td>startPeriod (200 - x), limit 6</td></tr><tr><td>startPeriod (240 - x), limit 10</td></tr><tr><td>startPeriod (260 - x + &lt;Configured max time deviation&gt;), limit 8 (TxDefaultProfile)</td></tr><tr><td>startPeriod (300 - x + &lt;Configured max time deviation&gt;), limit 10 (ChargingStationMaxProfile)</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>N/a</td></tr></table>

# 6.2.75. Page 355 - (2025-04) - TC_K_41_CS: Added missing EnergyTransferStarted reusable state

A transaction needs to be started to be able to set a TxProfile. The tool already started a transaction for this reason, but the testcase description lacks this information.

<table><tr><td>Test case name</td><td>Get Composite Schedule - Combining chargingProfilePurposes</td></tr><tr><td>Test case Id</td><td>TC_K_41_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State:</td></tr><tr><td>...</td></tr><tr><td>Reusable State(s):</td></tr><tr><td>State is EnergyTransferStarted</td></tr></table>

# 6.2.76. Page 359 - (2025-04) - TC_K_53_CS: Added missing validations

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
State is Authorized (local) 
State is EVConnectedPreSession</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State Authorized15118</td></tr><tr><td>2. The Charging Station sends a NotifyEVChargingNeedsRequest</td><td>3. The Test System responds with a NotifyEVChargingNeedsResponse with status Accepted</td></tr><tr><td>5. The Charging Station responds with a SetChargingProfileResponse</td><td>4. The Test System sends a SetChargingProfileRequest with chargingProfile.chargingProfilePurpose TxProfile chargingProfile transactionld &lt;transactionld&gt; chargingProfile.chargingSchedule[0].id &lt;Id generated by Test System&gt; chargingProfile.chargingSchedule[0].chargingRateUnit &lt;Configured chargingRateUnit&gt; chargingProfile.chargingSchedule[0].chargingSchedulePeriod.s startPeriod 0 chargingProfile.chargingSchedule[0].chargingSchedulePeriod.limit 6 * &lt;limit multiplier&gt; Note: Check [csKSmartChargingChargingProfileLimits] for &lt;limit multiplier&gt;</td></tr><tr><td>6. The Charging Station sends a NotifyEVChargingScheduleRequest</td><td>7. The Test System responds with a NotifyEVChargingScheduleResponse with status Accepted</td></tr><tr><td colspan="2">4. Execute Reusable State EnergyTransferStarted</td></tr><tr><td>8. The Charging Station sends a TransactionEventRequest.</td><td>9. The Test System responds with a TransactionEventResponse</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:</td></tr><tr><td>Message: TransactionEventRequest of Authorized15118 step 3</td></tr><tr><td>- eventType must be Updated or Started</td></tr><tr><td>- triggerReason must be Authorized</td></tr><tr><td>* Step 2:</td></tr><tr><td>Message: NotifyEVChargingNeedsRequest</td></tr><tr><td>IF chargingNeeds.acChargingParameters is &lt;omitted&gt; THEN</td></tr><tr><td>chargingNeeds.dcChargingParameters must be &lt;not omitted&gt;</td></tr><tr><td>END IF</td></tr><tr><td>IF chargingNeeds.dcChargingParameters is &lt;omitted&gt; THEN</td></tr><tr><td>chargingNeeds.acChargingParameters must be &lt;not omitted&gt;</td></tr><tr><td>END IF</td></tr><tr><td>* Step 5:</td></tr><tr><td>Message: SetChargingProfileResponse</td></tr><tr><td>- status must be Accepted</td></tr><tr><td>* Step 6:</td></tr><tr><td>Message: NotifyEVChargingScheduleRequest</td></tr><tr><td>- chargingSchedule must be within bounds of chargingSchedule of step 4</td></tr><tr><td>* Step 8:</td></tr><tr><td>Message: TransactionEventRequest</td></tr><tr><td>- triggerReason must be ChargingStateChanged</td></tr><tr><td>- transactionInfo.chargingState must be Charging</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>N/a</td></tr></table>

# 6.2.77. Page 360 - (2025-02) - TC_K_54_CS: EVConnected must be before Authorization

TC_K_54_CS: Charging with load leveling based on High Level Communication - No SASchedule (rejected)

<table><tr><td>Test case name</td><td>Charging with load leveling based on High Level Communication - No SASchedule (rejected)</td></tr><tr><td>Test case Id</td><td>TC_K_54_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:
N/a</td></tr><tr><td>Memory State:
N/a</td></tr><tr><td>Reusable State(s):
State is EVConnectedPreSession
State is Authorized (local)</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State Authorized15118</td></tr><tr><td>2. The Charging Station sends a NotifyEVChargingNeedsRequest.</td><td>3. The Test System responds with a NotifyEVChargingNeedsResponse. With status Rejected</td></tr><tr><td colspan="2">[...]</td></tr></table>

# 6.2.78. Page 362 - (2025-02) - TC_K_56_CS: EVConnected must be before Authorization

TC_K_56_CS: Charging with load leveling based on High Level Communication - Offline

<table><tr><td>Test case name</td><td>Charging with load leveling based on High Level Communication - Offline</td></tr><tr><td>Test case Id</td><td>TC_K_56_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
RetryBackOffWaitMinimum is &lt;Configured RetryBackOffWaitMinimum&gt;</td></tr><tr><td>Memory State: 
...</td></tr><tr><td>Reusable State(s): 
State is EVConnectedPreSession 
State is Authorized (local)</td></tr></table>

# 6.2.79. Page 364 - (2025-02) - TC_K_57_CS: EVConnected must be before Authorization

TC_K_57_CS: Renegotiating a Charging Schedule - Initiated by EV

<table><tr><td>Test case name</td><td>Renegotiating a Charging Schedule - Initiated by EV</td></tr><tr><td>Test case Id</td><td>TC_K_57_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
State is EVConnectedPreSession 
State is Authorized (local) 
State is RenegotiateChargingLimits</td></tr></table>

# 6.2.80. Page 362 - (2024-09) - TC_K_56_CS Removed expecting triggerReason=ChargingRateChanged [776]

A trigger reason ChargingStateChange must only be sent, when an external actor (not CSMS) changes the charging rate. Therefore, removed the check that triggerReason=ChargingStateChanged is sent. Also added a check that the EV charging schedule fits within the given charging profile.

<table><tr><td>Test case name</td><td colspan="2">Charging with load leveling based on High Level Communication - Offline</td></tr><tr><td>Test case Id</td><td colspan="2">TC_K_56_CS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS 6. The OCTT responds with a TransactionResponse.</td></tr><tr><td colspan="2">...</td></tr><tr><td>Test case name</td><td>Charging with load leveling based on High Level Communication - Offline</td></tr><tr><td rowspan="2">Tool validations</td><td>* Step 3: 
(Message: NotifyEVChargingScheduleRequest) 
evseld &lt;Configured evseld&gt; 
chargingSchedule.chargingSchedule[0].chargingRateUnit &lt;Configured chargingRateUnit&gt; 
chargingSchedule.chargingSchedule[0].chargingSchedulePeriod[0].startPeriod 0 
If &lt;Configured chargingRateUnit&gt; is W: 
chargingSchedule.chargingSchedule[0].chargingSchedulePeriod[0].limit &lt;= 8000 
Else: 
chargingSchedule.chargingSchedule[0].chargingSchedulePeriod[0].limit &lt;= 8 * Step-5: 
Message: TransactionEventRequest 
-triggerReason must be ChargingStateChanged 
-transactionInfo.chargingState must be Charging 
-offline true</td></tr><tr><td>Post scenario validations: 
N/a</td></tr></table>

# 6.2.81. Page 366 - (2025-02) - TC_K_58_CS

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
State is Authorized (local) 
State is EVConnectedPreSession 
State is RenegotiateChargingLimits 
State is EVConnectedPreSession 
State is Authorized15118 
State is EnergyTransferStarted</td></tr></table>

# 6.2.82. Page 384 - TC_L_10_CS - Allow Download/InstallationFailed upon AcceptedCanceled

When a new firmware update is issued, the ongoing firmware update is canceled, but Charging Station may still send a FirmwareStatusNotification(DownloadFailed/InstallationFailed)

<table><tr><td>Test case name</td><td>Secure Firmware Update - AcceptedCanceled</td></tr><tr><td>Test case Id</td><td>TC_L_10_CS</td></tr><tr><td>...</td><td>...</td></tr><tr><td colspan="2"></td></tr><tr><td colspan="2">Before (Preparations)</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a Update FirmwareResponse With status Accepted</td><td>1. The Test System sends a Update FirmwareRequest with requestId = &lt;#1&gt; firmware.installDateTime &lt;Current DateTime - 2 hours&gt; firmware.location &lt;Configured firmware_location&gt; firmware.retrieveDateTime &lt;Current DateTime - 2 hours&gt; firmware/signingCertificate &lt;Configured signingCertificate&gt; firmwaresignature &lt;Configured signature&gt;</td></tr><tr><td>3. The Charging Station sends a FirmwareStatusNotificationRequest With requestId &lt;#1&gt; and status Downloading</td><td>4. The Test System responds with a FirmwareStatusNotificationResponse</td></tr><tr><td>6. The Charging Station responds with a UpdateFirmwareResponse With requestId &lt;#1&gt; and status AcceptedCanceled</td><td>5. The Test System sends a UpdateFirmwareRequest with requestId = &lt;#2&gt; firmware.installDateTime &lt;Current DateTime - 2 hours&gt; firmware.location &lt;Configured firmware_location&gt; firmware.retrieveDateTime &lt;Current DateTime - 2 hours&gt; firmware/signingCertificate &lt;Configured signingCertificate&gt; firmwaresignature &lt;Configured signature&gt;</td></tr><tr><td>7. The Charging Station sends a FirmwareStatusNotificationRequest With requestId &lt;#2&gt; and status Downloading</td><td>8. The Test System responds with a FirmwareStatusNotificationResponse</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
Message UpdateFirmwareResponse
- status Accepted
* Step 3: 
Message FirmwareStatusNotificationRequest
- status Downloading
- requestId = &lt;#1&gt; 
* Step 6: 
Message UpdateFirmwareResponse
- status AcceptedCanceled
A FirmwareStatusNotificationRequest DownloadFailed or InstallationFailed may be sent for requestId &lt;#1&gt; before or after step 6.</td></tr><tr><td>(The requestId at the FirmwareStatusNotificationRequest messages must refer to the id &lt;#2&gt; from the second 
UpdateFirmwareRequest from this point on)
* Step 7: 
Message FirmwareStatusNotificationRequest
- status Downloading
...</td></tr><tr><td>Post scenario validations: 
N/a</td></tr></table>

# 6.2.83. Page 387 - TC_L_06_CS - SecurityEventNotification and FirmwareStatusNotification can be sent in any order

The SecurityEventNotification with type InvalidFirmwareSignature and the FirmwareStatusNotification with status InvalidSignature can be sent in any order. These events are triggered simultaneously, so which message is transmitted first may vary.

<table><tr><td>Test case name</td><td>Secure Firmware Update - InvalidSignature</td></tr><tr><td>Test case Id</td><td>TC_L_06_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a UpdateFirmwareResponse</td><td>1. The Test System sends a UpdateFirmwareRequest with firmware.installDateTime &lt;Current DateTime - 2 hours&gt; firmware.location &lt;Configured firmware_location&gt; firmware.retrieveDateTime &lt;Current DateTime - 2 hours&gt; firmware signingCertificate &lt;Configured signingCertificate&gt; firmwaresignature &lt;Configured invalid firmware signature&gt;</td></tr><tr><td>3. The Charging Station sends a FirmwareStatusNotificationRequest. With status Downloading</td><td>4. The Test System responds with a FirmwareStatusNotificationResponse.</td></tr><tr><td>5. The Charging Station sends a FirmwareStatusNotificationRequest. With status Downloaded</td><td>6. The Test System responds with a FirmwareStatusNotificationResponse.</td></tr><tr><td colspan="2">Note: Step 7 through 10 can be sent in a different order.</td></tr><tr><td>7. The Charging Station sends a FirmwareStatusNotificationRequest. With status InvalidSignature</td><td>8. The Test System responds with a FirmwareStatusNotificationResponse.</td></tr><tr><td>9. The Charging Station sends a SecurityEventNotificationRequest. With type InvalidFirmwareSignature</td><td>10. The Test System responds with a SecurityEventNotificationResponse.</td></tr></table>

# 6.2.84. Page 422 - (2025-02) - TC_M_15_CS - V2GCertificateChain is not installed before being retrieved

<table><tr><td>Test case name</td><td>Retrieve certificates from Charging Station - V2G CertificateChain</td></tr><tr><td>Test case Id</td><td>TC_M_15_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
RenewV2GChargingStationCertificate</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

# 6.2.85. Page 430 - (2025-06) - TC_M_24_CS - A GetCertificateStatusRequest is also sent for the subCAs

According to requirement M06.FR.07, the Charging Station sends a GetCertificateStatusRequest for the V2G Charging Station certificate (leaf) and the subCAs.

<table><tr><td>Test case name</td><td>Get Charging Station Certificate status - Success</td></tr><tr><td>Test case Id</td><td>TC_M_24_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>1. The Charging Station sends a GetCertificateStatusRequest</td><td>2. The Test System responds with a GetCertificateStatusResponse with status Accepted ocspResult &lt;OCSPResponse class as defined in IETF RFC 6960. DER encoded (as defined in IETF RFC 6960), and then base64 encoded.&gt;</td></tr><tr><td colspan="2">Note: Step 1/2 are repeated for the V2G Charging Station (leaf), the subCA1 and subCA2 certificates.</td></tr></table>

# 6.2.86. Page 436 - (2025-02) - TC_N_01_CS - Made used component variable configurable

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
The following monitors (on arbitrary variables) must be present as &#x27;hard-wired&#x27; or &#x27;preconfigured&#x27; or must have been configured by GSMS: 
-LowerThreshold 
-UpperThreshold 
-Delta 
-Periodie 
-PeriodicClockAligned 
The following monitors must have been configured by CSMS for Component Variable &lt;Configured threshold monitor component variable &gt;</td></tr><tr><td>variable&gt;: 
-LowerThreshold using value &lt;Configured threshold monitor component variable LowerThreshold trigger value&gt; 
-UpperThreshold using value &lt;Configured threshold monitor component variable UpperThreshold trigger value&gt; 
-Periodic using value &lt;Configured Clock Aligned MeterValues Interval&gt;</td></tr><tr><td>The following monitors must have been configured by CSMS for Component Variable &lt;Configured numeric delta component variable&gt; 
-Delta using value &lt;Configured numeric delta component variable Delta numeric trigger value&gt; 
-PeriodicClockAligned using value &lt;Configured Clock Aligned MeterValues Interval&gt;</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

# 6.2.87. Page 455 - (2025-02) - TC_N_12_CS - Updating test case for using configuration variables

<table><tr><td>Test case name</td><td colspan="2">Set Variable Monitoring - Value out of range - Delta monitor</td></tr><tr><td colspan="3">[...]</td></tr><tr><td>Prerequisite(s)</td><td colspan="2">Charging Station has implemented device model monitoring and MonitoringCtrl::Enabled = true.
This test case assumes the following component exists and can be monitored:
-Component &quot;EVSE&quot;, evse &quot;1&quot;, variable &quot;AvailabilityState&quot;, monitor type Delta
Note: Variable _AvailabilityState is mandatory for an EVSE and it is likely (but not guaranteed), that it can be monitored=
This test case assumes a numeric component variable exists which can be monitored.</td></tr><tr><td colspan="3"></td></tr><tr><td colspan="3">Main (Test scenario)</td></tr><tr><td colspan="2">Charging Station</td><td>CSMS</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>2. Charging Station responds with: SetVariableMonitoringResponse</td><td>Install monitors
1. Test System sends SetVariableMonitoringRequest with:
- setMonitoringData[0].value = -1
- setMonitoringData[0].type = Delta
- setMonitoringData[0].severity = &lt;Configured severity&gt;
- setMonitoringData[0].component.name = &quot;EVSE&quot;
- setMonitoringData[0].component.evse.id = &lt;Configured evseId&gt;
- setMonitoringData[0].variable.name = &quot;AvailabilityState&quot;
- setMonitoringData[0].component = &lt;Configured numeric delta component&gt;
- setMonitoringData[0].variable = &lt;Configured numeric delta component variable&gt;</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
Message: SetVariableMonitoringResponse with (in arbitrary order): 
setMonitoringResult = { 
- id is absent 
- status = Rejected 
- type = Delta 
- severity = &lt;Configured severity&gt; 
-component.name = &quot;EVSE&quot; 
-component.evse.id = &lt;Configured evseld&gt; 
-variable.name = &quot;AvailabilityState&quot; 
- component = &lt;Configured numeric delta component variable&gt; 
- variable = &lt;Configured numeric delta component variable&gt; 
-statusInfo is absent or statusInfoReasonCode = &quot;ValueOfRange&quot; or statusInfoReasonCode = &quot;ValuePositiveOnly&quot; }</td></tr><tr><td>Post scenario validations: 
N/A</td></tr></table>

# 6.2.88. Page 456 - (2025-02) - TC_N_13_CS - Updating test case for using more specific configuration variables

# TC_N_13_CS: Set Variable Monitoring - Value out of range - Threshold monitor

<table><tr><td>Test case name</td><td>Set Variable Monitoring - Value out of range - Threshold monitor</td></tr><tr><td>Test case Id</td><td>TC_N_13_CS</td></tr><tr><td>Use case Id(s)</td><td>N04</td></tr><tr><td>Requirement(s)</td><td>N04.FR.13 N04.FR.06</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>CSMS tries to set a threshold monitor with a value that is out of range.</td></tr><tr><td>Purpose</td><td>To test that Charging Station checks that value is within range of variable.</td></tr><tr><td rowspan="2">Prerequisite(s)</td><td>Charging Station has implemented device model monitoring and MonitoringCtrl::Enabled = true.</td></tr><tr><td>This test case assumes the &lt;Configured threshold monitor component variable&gt; component_variable exists and can be monitored and has variableCharacteristics.maxLimit &lt; &lt;Configured threshold monitor value&gt; This test case assumes the &lt;Configured threshold monitor component variable with maxLimit&gt; component_variable exists and can be monitored and has variableCharacteristics.maxLimit &lt; &lt;Configured threshold monitor component variable with maxLimit exceeding maxLimit value&gt; + Note: Variable _Power(maxLimit) is mandatory for an EVSE, but the actual value not, but it is likely (but not guaranteed), that it can be monitored._</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. Charging Station responds with: SetVariableMonitoringResponse</td><td>Install monitors1. Test System sends SetVariableMonitoringRequest with:-setMonitoringData[0].value = &lt;Configured threshold monitor value&gt; - setMonitoringData[0].value = &lt;Configured threshold monitor component variable with maxLimit exceeding maxLimit value&gt; - setMonitoringData[0].type = UpperThreshold- setMonitoringData[0].severity = &lt;Configured severity&gt; -setMonitoringData[0].component.name = &lt;Configured threshold monitor component variable&gt; -setMonitoringData[0].component.evse.id = &lt;Configured evseId&gt; -setMonitoringData[0].variable.name = &lt;Configured threshold monitor component variable&gt; - setMonitoringData[0].component = &lt;Configured threshold monitor component variable with maxLimit&gt; - setMonitoringData[0].variable = &lt;Configured threshold monitor component variable with maxLimit&gt;</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
Message: SetVariableMonitoringResponse with (in arbitrary order): 
setMonitoringResult = { 
- id is absent 
- status = Rejected 
- type = UpperThreshold 
- severity = &lt;Configured severity&gt; 
-component.name = &lt;Configured threshold monitor component variable&gt; 
-component.evse.id = &lt;Configured evseId&gt; 
-variable.name = &lt;Configured threshold monitor component variable&gt; 
-component = &lt;Configured threshold monitor component variable with maxLimit&gt; 
-variable = &lt;Configured threshold monitor component variable with maxLimit&gt; 
-statusInfo is absent or statusInfoReasonCode = &quot;ValueOfRange&quot;}</td></tr><tr><td>Post scenario validations: 
N/A</td></tr></table>

# 6.2.89. Page 463 - (2025-02) TC_N_20_CS - Updating test case for using more specific configuration variables

# TC_N_20_CS: Alert Event - Threshold value exceeded

<table><tr><td>Test case name</td><td>Alert Event - Threshold value exceeded</td></tr><tr><td>Test case Id</td><td>TC_N_20_CS</td></tr><tr><td>Use case Id(s)</td><td>N07</td></tr><tr><td>Requirement(s)</td><td>N07.FR.06, N07.FR.07, N07.FR.16, N07.FR.17</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>A monitored variable exceeds a threshold monitor and causes a NotifyEventRequest message to be sent.</td></tr><tr><td>Purpose</td><td>To test that Charging Station supports threshold monitors</td></tr><tr><td>Prerequisite(s)</td><td>Charging Station has implemented device model monitoring and MonitoringCtrl::Enabled = true.</td></tr></table>

# Before (Preparations)

Configuration State: N/a

# Memory State:

This test requires the Monitoring Base to be set to All.

- SetMonitoringBaseRequest with monitoringBase = All.  
  Furthermore this test requires the existence of a LowerThreshold and UpperThreshold monitor on a (numerical) variable. Since it is not mandated which variables are required to be monitored, this test used the variable "Power" of component "EVSE".  
  -setMonitoringData[0].value--<Configured threshold monitor value>
- setMonitoringData[0].value = <Configured threshold monitor component variable UpperThreshold trigger value>
- setMonitoringData[0].type = UpperThreshold  
  -setMonitoringData[0].severity = <Configured severity>  
  -setMonitoringData[0].component.name -<Configured threshold monitor component variable>  
  -setMonitoringData[0].component.evse.id = <ConfiguredEvseId>  
  -setMonitoringData[0].variable.name--<Configured threshold monitor component variable>
- setMonitoringData[0].severity = 5
- setMonitoringData[0].component = <Configured threshold monitor component variable>
- setMonitoringData[0].variable = <Configured threshold monitor component variable>

Set MonitoringLevel to 8

# Notes:

- If componentVariable is set to "Power" or "Current", the value is set to the configured maxLimit 100.0
- Take a threshold that can easily be exceeded.

Reusable State(s): N/a

Main (Test scenario)

<table><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State EnergyTransferStarted or manually trigger the monitor.
Notes: If componentVariable is set to "Power" or "Current" EnergyTransferStarted will trigger the monitor. If another componentvariable is chosen a manual action is needed to trigger the monitor.</td></tr><tr><td>2. Charging Station sends a NotifyEventRequest with:
- Power exceeding upper threshold</td><td>3. Test System responds with a NotifyEventResponse</td></tr><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>5. Charging Station responds with a SetVariableMonitoringResponse with: - status Accepted</td><td>4. Test System sends a SetVariableMonitoringRequest with: - type LowerThreshold -component.name&lt;-Configured threshold monitor component variable&gt; -component.evse.id&lt;-configured evseid&gt; -variable.name&lt;-Configured threshold monitor component variable&gt; -value&lt;-Configured threshold monitor2 value&gt; - component&lt;-Configured threshold monitor component variable&gt; - variable&lt;-Configured threshold monitor component variable&gt; - value&lt;-Configured threshold monitor component variable&gt; - LowerThreshold trigger value&gt; Notes: -If componentVariable is set to "Power" or "Current", the value is set to the configured maxLimit 10.0 - Take a threshold that won't be exceeded.</td></tr><tr><td colspan="2">6. Execute Reusable State StopAuthorized or manually trigger the second monitor. Notes: If componentVariable is set to "Power" or "Current" EnergyTransferStarted will trigger the monitor. If another componentvariable is chosen a manual action is needed to trigger the monitor.</td></tr><tr><td>7. Charging Station sends: NotifyEventRequest for 2 events: - Returning below upper threshold (cleared) - Dropping below lower threshold</td><td>8. Test System responds: NotifyEventResponse</td></tr><tr><td colspan="2">Notes: Steps 2, 3, 7, and 8 may be repeated if the data is sent using two requests instead of one. Depending on the configuration the Charging Station may also send other notifications during step 4 and 9.</td></tr><tr><td colspan="2">Tool validations</td></tr><tr><td colspan="2">* Step 2: Message: NotifyEventRequest with: - generatedAt = &lt;time of generation at Charging Station&gt; - seqNo = 0 and an eventData element with: - eventId = &lt;id1&gt; - timestamp = &lt;time of event at Charging Station&gt; - trigger = Alerting - actualValue = &lt;current power&gt; (must be &gt;&lt;Configured threshold monitor value&gt;) - cleared is absent or cleared = false - transactionld = &lt;transaction id&gt; (delivery of power is always in transaction) - variableMonitoringId = &lt;monitor id1&gt; -component.name = &lt;Configured threshold monitor component variable&gt; -component.evse.id = &lt;Configured evseid&gt; -variable.name = &lt;Configured threshold monitor component variable&gt; - component = &lt;Configured threshold monitor component variable&gt; - variable.name = &lt;Configured threshold monitor component variable&gt; Other eventData elements can be ignored.</td></tr></table>

# Tool validations

- Step 7: Message: NotifyEventRequest with:

* generatedAt = <time of generation at Charging Station>  
  -seqNo $= 0$

and an eventData element with:

-eventId $=$ <id2>

- timestamp = <time of event at Charging Station>

- trigger = Alerting

-actualValue \(=\) <current power \(\rightharpoondown\) (must be \(= = < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < < <

- cleared is true

- transactionld = <transaction id> (delivery of power is always in transaction)

-variableMonitoringld $=$ <monitor id1>

-eventNotificationType $=$ CustomMonitor

-component.name = <Configured threshold monitor component variable>

-component.evse.id = <ConfiguredEvseId>

-variable.name = <Configured threshold monitor component variable>

- component = <Configured threshold monitor component variable>

- variable.name = <Configured threshold monitor component variable>

and an eventData element with:

-eventId $=$ <id3>

- timestamp = <time of event at Charging Station>

- trigger = Alerting

-actualValue = <current power> (must be <<Configured threshold monitor2 value>)

- cleared is absent or cleared is false

- transactionld = <transaction id> (delivery of power is always in transaction)

-variableMonitoringld $=$ <monitor id2>

-eventNotificationType $=$ CustomMonitor

-component.name = <Configured threshold monitor component variable>

-component.evse.id = <ConfiguredEvseId>

-variable.name $=$ <Configured threshold monitor component variable>

- component = <Configured threshold monitor component variable>

- variable.name = <Configured threshold monitor component variable>

Other eventData elements can be ignored. This can also be sent in two NotifyEventRequests, instead of one.

Post scenario validations: N/A

# 6.2.90. Page 468 - (2024-06) TC_N_23_CS Offline Notification - OfflineMonitoringEventQueuingSeverity set higher than severityLevel of the monitor [772]

<table><tr><td>Test case name</td><td colspan="2">Offline Notification - OfflineMonitoringEventQueuingSeverity set higher than severityLevel of the monitor</td></tr><tr><td>Test case Id</td><td colspan="2">TC_N_23_CS</td></tr><tr><td>Use case Id(s)</td><td colspan="2">N07</td></tr><tr><td>Requirement(s)</td><td colspan="2">N07.FR.04</td></tr><tr><td>System under test</td><td colspan="2">Charging Station</td></tr><tr><td>Description</td><td colspan="2">Charging Station does not queue event notifications when offline.</td></tr><tr><td>Purpose</td><td colspan="2">To test that Charging Station does not queue event notifications with a severity higher than OfflineMonitoringEventQueuingSeverity.</td></tr><tr><td>Prerequisite(s)</td><td colspan="2">Charging Station is online at start of test for configuration. CS has implemented device model monitoring and MonitoringCtrl::Enabled = true.</td></tr><tr><td colspan="3"></td></tr><tr><td rowspan="3">Before (Preparations)</td><td colspan="2">Configuration State: SetConfiguration with: - component.name = "MonitoringCtrl" - variable.name = "OfflineQueuingSeverity" - attributeValue = &lt;Configured Severity&gt;</td></tr><tr><td colspan="2">Memory State: Charging Station has custom or predefined monitors on variable AvailabilityState of Configured EVSE and Configured ConnectorId with severity = &lt;Configured severity&gt; + 1</td></tr><tr><td colspan="2">Reusable State(s): N/a</td></tr><tr><td rowspan="13">Main (Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Manual Action: Connect the EV and EVSE.</td></tr><tr><td>1. The Charging Station notifies the CSMS about the status change of the connector.</td><td>2. The OCTT responds accordingly.</td></tr><tr><td colspan="2">Note(s): Step 3, 4, 5, 6, 7, and 8 need to be executed when TxStartPoint contains EVConnected OR ParkingBayOccupancy</td></tr><tr><td>3. The Charging Station sends a TransactionEventRequest</td><td>4. The OCTT responds with a TransactionEventResponse</td></tr><tr><td colspan="2">Manual Action: Take Charging Station offline.</td></tr><tr><td colspan="2">Manual Action: Disconnect the EV and EVSE.</td></tr><tr><td colspan="2">Manual Action: Connect the EV and EVSE.</td></tr><tr><td colspan="2">Note(s): The tool will now wait for &lt;Configured Transaction Duration&gt; seconds</td></tr><tr><td colspan="2">Manual Action: Bring Charging Station back online.</td></tr><tr><td>5. The Charging Station sends a TransactionEventRequest</td><td>6. The OCTT responds with a TransactionEventResponse</td></tr><tr><td>7. The Charging Station sends a TransactionEventRequest</td><td>8. The OCTT responds with a TransactionEventResponse</td></tr><tr><td colspan="2">Note(s): The CS shall not send a NotifyEventRequest for AvailabilityState of EVSE and Connector. A StatusNotification may still be received.</td></tr><tr><td>Test case name</td><td>Offline Notification - OfflineMonitoringEventQueuingSeverity set higher than severityLevel of the monitor</td></tr><tr><td rowspan="5">Tool validations</td><td>* Step 1: (Optional):Message: StatusNotificationRequest- evseld &lt;configured evseld&gt; - connectorId &lt;configured connectorId&gt; - connectorStatus must be Occupied(Required, but can be combined into one NotifyEventRequest:)Message: NotifyEventRequest-eventData[0].trigger must be Delta-eventData[0].actualValue must be Occupied-eventData[0].component.name must be Connector-eventData[0].component.evse.id must be Configured EVSE-eventData[0].component.evseconnectorId must be Configured ConnectorId-eventData[0].variable.name must be AvailabilityStateMessage: NotifyEventRequest-eventData[0].trigger must be Delta-eventData[0].actualValue must be Occupied-eventData[0].component.name must be EVSE-eventData[0].component.evse.id must be Configured EVSE-eventData[0].variable.name must be AvailabilityState</td></tr><tr><td>* Step 3:Message: TransactionEventRequest- triggerReason must be CablePluggedIn- transactionInfo.chargingState must be EVConnected</td></tr><tr><td>* Step 5:Message: TransactionEventRequest- triggerReason must be EVCommunicationLost- transactionInfo.chargingState must be Idle</td></tr><tr><td>* Step 7:Message: TransactionEventRequest- triggerReason must be CablePluggedIn- transactionInfo.chargingState must be EVConnected</td></tr><tr><td>Post scenario validations:N/A</td></tr></table>

# 6.2.91. Page 470 - (2024-09) - TC_N_24_CS - Referring to incorrect use case and requirements [O20-4793]

<table><tr><td>Test case name</td><td colspan="2">Set Variable Monitoring - Periodic event</td></tr><tr><td>Test case Id</td><td colspan="2">TC_N_24_CS</td></tr><tr><td>Use case Id(s)</td><td colspan="2">N04, N08</td></tr><tr><td>Requirement(s)</td><td colspan="2">N04.FR.01, N04.FR.08, N08.FR.05 and N08.FR.06</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">...</td></tr><tr><td colspan="2">Post scenario validations:
N/A</td></tr></table>

# 6.2.92. Page 492 - (2025-02) - TC_N_39_CS - Test case now searches suitable variables to do test with

# TC_N_39_CS: Set Variable Monitoring - Component/Variable combination does NOT correspond

<table><tr><td>Test case name</td><td>Set Variable Monitoring - Component/Variable combination does NOT correspond</td></tr><tr><td>Test case Id</td><td>TC_N_39_CS</td></tr><tr><td colspan="2">...</td></tr><tr><td>Prerequisite(s)</td><td>Charging Station supports MonitoringThis test case assumes the Charging Station has a non-numeric Component Variable &lt;Configured non-numeric delta component variable&gt; and numeric Component Variable &lt;Configured threshold monitorcomponent variable&gt;.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>...</td></tr><tr><td>Memory State:
Variable monitor is already set with component.name = EVSE, variable.name = AvailabilityState, type = Delta
N/a</td></tr><tr><td>Reusable State:
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetVariableMonitoringResponse</td><td>1. The Test System sends a SetVariableMonitoringRequest with setMonitoringData[0].type Delta
setMonitoringData[0].value 1
setMonitoringData[0].component = &lt;Configured non-numeric delta component variable&gt;
setMonitoringData[0].variable = &lt;Configured non-numeric delta component variable&gt;</td></tr><tr><td>2. The Charging Station responds with a SetVariableMonitoringResponse</td><td>1. The Test System sends a SetVariableMonitoringRequest with setMonitoringData.type UpperThreshold
setMonitoringData(variable.name Power
setMonitoringData_component.name ChargingStation-</td></tr><tr><td>4. The Charging Station responds with a SetVariableMonitoringResponse</td><td>3. The Test System sends a SetVariableMonitoringRequest with setMonitoringData[0].id
&lt;SetVariableMonitoringResponse.setMonitoringResult[0].id of step 2&gt;
setMonitoringData[0].type Delta
setMonitoringData[0].value 1
setMonitoringData[0].component = &lt;Configured numeric delta component variable&gt;
setMonitoringData[0].variable = &lt;Configured numeric delta component variable&gt;</td></tr><tr><td rowspan="2">4. The Charging Station responds with a GetMonitoringReportResponse</td><td>3. The Test System sends a GetMonitoringReportRequest with -requestId &lt;Generated requestId&gt;</td></tr><tr><td>5. The Test System sends a GetMonitoringReportRequest with - requestId &lt;Generated requestId&gt;</td></tr><tr><td>6. The Charging Station responds with a GetMonitoringReportResponse</td><td></td></tr><tr><td>5. The Charging Station sends a NotifyMonitoringReportRequest</td><td>6. The Test System responds with a NotifyMonitoringReportResponse--</td></tr><tr><td>7. The Charging Station sends a NotifyMonitoringReportRequest</td><td>8. The Test System responds with a NotifyMonitoringReportResponse .</td></tr><tr><td>Note(s): 
- If tbc is True at Step 3 then step 3 and 4 will be repeated- 
- If tbc is True at Step 7 then step 7 and 8 will be repeated</td><td></td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2:</td></tr><tr><td>Message-SetVariableMonitoringResponse</td></tr><tr><td>-setMonitoringResult[0].status Rejected</td></tr><tr><td>-setMonitoringResult[0].type UpperThreshold</td></tr><tr><td>-setMonitoringResult[0].severity &lt;Configured severity&gt;</td></tr><tr><td>-setMonitoringResult[0].component.name ChargingStation</td></tr><tr><td>-setMonitoringResult[0].variable.name Power</td></tr><tr><td>* Step 4:</td></tr><tr><td>Message-GetMonitoringReportResponse</td></tr><tr><td>-status Accepted</td></tr><tr><td>* Step 5:</td></tr><tr><td>Message-NotifyMonitoringReportRequest</td></tr><tr><td>-monitor_component-EVSE</td></tr><tr><td>-monitor-variable-AvailabilityState</td></tr><tr><td>* Step 2:</td></tr><tr><td>Message SetVariableMonitoringResponse</td></tr><tr><td>-setMonitoringResult[0].id &lt;not omitted&gt;</td></tr><tr><td>-setMonitoringResult[0].status Accepted</td></tr><tr><td>-setMonitoringResult[0].type Delta</td></tr><tr><td>-setMonitoringResult[0].component = &lt;Configured non-numeric delta component variable&gt;</td></tr><tr><td>-setMonitoringResult[0].variable = &lt;Configured non-numeric delta component variable&gt;</td></tr><tr><td>* Step 4:</td></tr><tr><td>Message SetVariableMonitoringResponse</td></tr><tr><td>-setMonitoringResult[0].status Rejected</td></tr><tr><td>-setMonitoringResult[0].type Delta</td></tr><tr><td>-setMonitoringResult[0].component = &lt;Configured numeric delta component variable&gt;</td></tr><tr><td>-setMonitoringResult[0].variable = &lt;Configured numeric delta component variable&gt;</td></tr><tr><td>* Step 6:</td></tr><tr><td>Message GetMonitoringReportResponse</td></tr><tr><td>-status Accepted</td></tr><tr><td>* Step 7:</td></tr><tr><td>Message NotifyMonitoringReportRequest</td></tr><tr><td>Must contain a monitor with</td></tr><tr><td>-monitor[0].component = &lt;Configured non-numeric delta component variable&gt;</td></tr><tr><td>-monitor[0].variable = &lt;Configured non-numeric delta component variable&gt;</td></tr><tr><td>-monitor[0].variableMonitoring[0].id = &lt;SetVariableMonitoringResponse.setMonitoringResult[0].id of step 2&gt;</td></tr><tr><td>-monitor[0].variableMonitoring[0].value = 1</td></tr><tr><td>-monitor[0].variableMonitoring[0].type = Delta</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>- All report parts have been received</td></tr></table>

# 6.2.93. Page 472 - (2024-12) - TC_N_26_CS - Made test case more explicit and more time before ending

Note: This erratum was released in tag 2025-01, not the mentioned 2024-12.

# TC_N_26_CS: Retrieve Log Information - Diagnostics Log - Upload failed

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a GetLogResponse</td><td>1. The Test System sends a GetLogRequest with - logType DiagnosticsLog - retries 3 - retryInterval &lt;Configured retryInterval&gt; - log_remoteLocation &lt;Configured log location with non-existing path&gt;</td></tr><tr><td colspan="2">...</td></tr><tr><td colspan="2">Note(s): 
- Steps 3 &amp; 4 are optional after the first attempt. 
- The Charging Station will perform step (3,) 5, four times with &lt;Configured retryInterval&gt; seconds in between. 
- Step 3-4, 5-6 and 3-6 may repeat multiple times depending on Charging Station's implementation. 
- The Test System waits at least (3 * &lt;Configured retryInterval&gt;), before ending the testcase.</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>...</td></tr><tr><td>* Step 3:</td></tr><tr><td>Must be sent exactly 1 or 4 times</td></tr><tr><td>Message LogStatusNotificationRequest</td></tr><tr><td>- status Uploading</td></tr><tr><td>- requestId Same Id as the GetLogRequest</td></tr><tr><td>* Step 5:</td></tr><tr><td>Must be sent exactly 1 or 4 times</td></tr><tr><td>Message LogStatusNotificationRequest</td></tr><tr><td>...</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>- N/a</td></tr></table>

# 6.2.94. Page 470 - (2024-12) - TC_N_24_CS - Test case now searches suitable variable to do test with

Note: This erratum has been superseded by erratum: Page 470 - (2025-02) - TC_N_24_CS - Updating test case for using more specific configuration variables

TC_N_24_CS: Set Variable Monitoring - Periodic event

<table><tr><td>Test case name</td><td>Set Variable Monitoring - Periodic event</td></tr><tr><td>Test case Id</td><td>TC_N_24_CS</td></tr><tr><td colspan="2">...</td></tr><tr><td>Prerequisite(s)</td><td>Charging Station has implemented device model monitoring and MonitoringCtrl::Enabled = true. 
This test case assumes the device model exposes at least one component(variable which can be monitored.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>...</td></tr><tr><td>Reusable State(s):
N/a-
State is [csCommunicatedBaseReport]</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Search [csCommunicatedBaseReport].baseReportData to get a baseReportData.reportDataWHERE reportData variableCharacteristicssupportsMonitoring is trueAND reportData_component.instance is &lt;omitted&gt;AND reportData.instance.instance.is &lt;omitted&gt;AS &lt;componentVariable&gt;</td></tr><tr><td colspan="2">Set the monitor to generate a periodic event notification</td></tr><tr><td>2. Charging Station responds with SetVariableMonitoringResponse</td><td>1. Test System sends SetVariableMonitoringRequest with:-setMonitoringData[0].value = &lt;Configured Clock-AlignedMeterValues Interval&gt; - setMonitoringData[0].value = 2 - setMonitoringData[0].type = Periodic -setMonitoringData[0].component.name = "EVSE"-setMonitoringData[0].component.evse.id = &lt;ConfiguredevseId&gt;-setMonitoringData[0].variable.name = "AvailabilityState"-setMonitoringData[0].component.name = &lt;componentVariablecomponent.name&gt; - setMonitoringData[0].component.evse.id = &lt;componentVariablecomponent.evse.id&gt;- setMonitoringData[0].variable.name = &lt;componentVariable(variable.name&gt;</td></tr><tr><td>3. Charging Station generates NotifyEventRequest for EVSE#1::AvailabilityState_every&lt;Configured Clock-AlignedMeterValues Interval&gt;seconds.3. Charging Station sends a NotifyEventRequest</td><td>4. Test System responds with a NotifyEventResponse</td></tr><tr><td colspan="2">Note(s): Step 3 and 4 will repeat every 2 seconds</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2:Message: SetVariableMonitoringResponse with:setMonitoringResult[0].status = AcceptedsetMonitoringResult[0].component.name = &quot;EVSE&quot;setMonitoringResult[0].component.evse.id = &lt;Configured evseld&gt;setMonitoringResult[0].variable.name = &quot;AvailabilityState&quot;setMonitoringResult[0].component.name = &lt;componentVariablecomponent.name&gt;setMonitoringResult[0].component.evse.id = &lt;componentVariablecomponent.evse.id&gt;setMonitoringResult[0].variable.name = &lt;componentVariable(variable.name&gt;setMonitoringResult[0].attributeStatusInfo is absent or attributeStatusInforeasonCode = &quot;NoError&quot;</td></tr><tr><td>* Step 3:Message: a NotifyEventRequest message every&lt;Configured Clock Aligned MeterValues Interval&gt;seconds with:Message: NotifyEventRequest every 2 seconds with:with an eventData element with:- trigger = Periodic-component.name = &quot;EVSE&quot;-component.evse.id = -1-variable.name = &quot;AvailabilityState&quot;- component.name = &lt;componentVariablecomponent.name&gt;- component.evse.id = &lt;componentVariablecomponent.evse.id&gt;- variable.name = &lt;componentVariable(variable.name&gt;</td></tr><tr><td>Post scenario validations:N/A</td></tr></table>

# 6.2.95. Page 470 - (2025-02) - TC_N_24_CS - Updating test case for using more specific configuration variables

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a 
Set MonitoringLevel to 8</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

<table><tr><td colspan="3">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td colspan="2">CSMS</td></tr><tr><td colspan="3">Set the monitor to generate a periodic event notification</td></tr><tr><td>2. Charging Station responds with SetVariableMonitoringResponse</td><td colspan="2">1. Test System sends SetVariableMonitoringRequest with: - setMonitoringData[0].value = &lt;Configured Clock Aligned MeterValues Interval&gt; - setMonitoringData[0].type = Periodic - setMonitoringData[0].component.name = &quot;EVSE&quot; - setMonitoringData[0].component.evse.id = &lt;Configured evseId&gt; - setMonitoringData[0].variable.name = &quot;AvailabilityState&quot; - setMonitoringData[0].severity = 5 - setMonitoringData[0].component = &lt;Configured threshold monitor component variable&gt; - setMonitoringData[0].variable = &lt;Configured threshold monitor component variable&gt;</td></tr><tr><td>3. Charging Station generates NotifyEventRequest for EVSE #1::AvailabilityState_every&lt;Configured Clock-Aligned MeterValues Interval&gt;seconds.</td><td colspan="2">4. Test System responds with a NotifyEventResponse</td></tr><tr><td>3. Charging Station sends a NotifyEventRequest</td><td></td><td></td></tr><tr><td colspan="3">Note(s): Step 3 and 4 will repeat every &lt;Configured Clock Aligned MeterValues Interval&gt; seconds</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2:</td></tr><tr><td>Message: SetVariableMonitoringResponse with:</td></tr><tr><td>setMonitoringResult[0].status = Accepted</td></tr><tr><td>setMonitoringResult[0].component.name = "EVSE"</td></tr><tr><td>setMonitoringResult[0].component.evse.id = &lt;Configured evseld&gt;</td></tr><tr><td>setMonitoringResult[0].variable.name = "AvailabilityState"</td></tr><tr><td>setMonitoringResult[0].type = Periodic</td></tr><tr><td>setMonitoringResult[0].severity = 5</td></tr><tr><td>setMonitoringResult[0].component = &lt;Configured threshold monitor component variable&gt;</td></tr><tr><td>setMonitoringResult[0].attribute = &lt;Configured threshold monitor component variable&gt;</td></tr><tr><td>setMonitoringResult[0].attributeStatusInfo is absent or attributeStatusInforeasonCode = "NoError"</td></tr><tr><td>* Step 3:Message: a NotifyEventRequest message every &lt;Configured Clock Aligned MeterValues Interval&gt; seconds with:Message: NotifyEventRequest every &lt;Configured Clock Aligned MeterValues Interval&gt; seconds with:with an eventData element with:- trigger = Periodic-component.name = "EVSE"-component.evse.id = 1-variable.name = "AvailabilityState"- component = &lt;Configured threshold monitor component variable&gt;- variable = &lt;Configured threshold monitor component variable&gt;</td></tr><tr><td>Post scenario validations:N/A</td></tr></table>

# 6.2.96. Page 482 - (2025-02) - TC_N_63_CS - Clear Customer Information - add manual action to stop session

Note: This erratum is extended by erratum: Page 482 - (2025-04) - TC_N_63_CS - Added missing reusable state EnergyTransferStarted at before steps

<table><tr><td>Test case name</td><td>Clear Customer Information - Clear and report - customerCertificate</td></tr><tr><td>Test case Id</td><td>TC_N_63_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: -AuthCtrl.Enabled is true -AuthCtrlDISABLERemoteAuthorization is false -ISO15118Ctrl.CentralContractValidationAllowed is false -ISO15118Ctrl.V2GCertificateInstallationEnabled is true -ISO15118Ctrl Contract Certificate Installation Enabled is true -ISO15118Ctrl.PnCEnabled is true -ISO15118Ctrl.Seecd is AL- ISO15118Ctrl.CountryName is seecd -ISO15118Ctrl.OrganizationName is OCA</td></tr><tr><td>Memory State: RenewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificatescertificateType = V2GCertificateChain)</td></tr><tr><td>Reusable State: Execute Reusable State EVConnectedPreSession Execute Reusable State Authorized15118 (PnC)</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Manual action: EV ends the charging session.
Note: The Charging Station receives a SessionStopReq(Terminate) message from the EV to finish the transaction.</td></tr><tr><td>2. The Charging Station responds with a CustomerInformationResponse</td><td>1. The Test System sends a CustomerInformationRequest with - report true AND - clear true AND - customerCertificate certificate hash data of contract certificate</td></tr><tr><td>3. The Charging Station sends a NotifyCustomerInformationRequest</td><td>4. The Test System responds with a NotifyCustomerInformationResponse</td></tr><tr><td>Note(s): 
- If tbc is True at Step 3 then step 3 and 4 will be repeated</td><td></td></tr><tr><td>6. The Charging Station responds with a CustomerInformationResponse</td><td>5. The Test System sends a CustomerInformationRequest with - report true AND 
- clear false AND 
- customerCertificate certificate hash data of contract certificate</td></tr><tr><td>7. The Charging Station sends a NotifyCustomerInformationRequest</td><td>8. The Test System responds with a NotifyCustomerInformationResponse</td></tr><tr><td>Note(s): 
- If tbc is True at Step 7 then step 7 and 8 will be repeated</td><td></td></tr><tr><td colspan="2">Tool validations</td></tr><tr><td colspan="2">...</td></tr><tr><td colspan="2">Post scenario validations: 
- All report parts have been received</td></tr></table>

# 6.2.97. Page 487 - (2025-04) - TC_N_36_CS -

# LogStatusNotification(AcceptedCanceled) allowed before GetLogResponse

It is allowed that the LogStatusNotification(AcceptedCanceled) for the canceled GetLog is sent before the new GetLogRequest is responded to by a GetLogResponse.

<table><tr><td>Test case name</td><td>Retrieve Log Information - Second Request</td></tr><tr><td>Test case Id</td><td>TC_N_36_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>…</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a GetLogResponse</td><td>1. The Test System sends a GetLogRequest with logType &lt;Configured logType&gt; and requestId &lt;#1&gt;</td></tr><tr><td>Note(s): 
- Charging Station is uploading log file</td><td></td></tr><tr><td>3. The Charging Station sends a LogStatusNotificationRequest</td><td>4. The Test System responds with a LogStatusNotificationResponse .</td></tr><tr><td>Note(s): 
- Charging Station cancels uploading the first log file</td><td></td></tr><tr><td>6. The Charging Station responds with a GetLogResponse</td><td>5. The Test System sends a GetLogRequest with logType &lt;Configured logType&gt; and requestId &lt;#2&gt;</td></tr><tr><td>Step 7 is allowed to occur before step 6</td><td></td></tr><tr><td>7. The Charging Station sends a LogStatusNotificationRequest</td><td>8. The Test System responds with a LogStatusNotificationResponse .</td></tr><tr><td>Note(s): 
- Charging Station is uploading log file</td><td></td></tr><tr><td>9. The Charging Station sends a LogStatusNotificationRequest</td><td>10. The Test System responds with a LogStatusNotificationResponse .</td></tr><tr><td>Note(s):
- Log file is uploaded</td><td></td></tr><tr><td>11. The Charging Station sends a LogStatusNotificationRequest</td><td>12. The Test System responds with a LogStatusNotificationResponse .</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
Message GetLogResponse
- status Accepted
* Step 3: 
Message LogStatusNotificationRequest
- status Uploading
- requestId &lt;#1&gt;</td></tr><tr><td>Step 7 is allowed to occur before step 6
* Step 6: 
Message GetLogResponse
- status AcceptedCanceled
* Step 7: 
Message LogStatusNotificationRequest
- status AcceptedCanceled
- requestId &lt;#1&gt;</td></tr><tr><td>* Step 9: 
Message LogStatusNotificationRequest
- status Uploading
- requestId &lt;#2&gt; 
* Step 11: 
Message LogStatusNotificationRequest
- status Uploaded
- requestId &lt;#2&gt;</td></tr><tr><td>Post scenario validations: 
-N/a</td></tr></table>

# 6.2.98. Page 482 - (2025-04) - TC_N_63_CS - Added missing reusable state EnergyTransferStarted at before steps

Note: This erratum extends erratum: Page 482 - (2025-02) - TC_N_63_CS - Clear Customer Information - add manual action to stop session

<table><tr><td>Test case name</td><td>Clear Customer Information - Clear and report - customerCertificate</td></tr><tr><td>Test case Id</td><td>TC_N_63_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>...</td></tr><tr><td>Memory State:</td></tr><tr><td>RenewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificatescertificateType = V2GCertificateChain)</td></tr><tr><td>Reusable State:</td></tr><tr><td>Execute Reusable State EVConnectedPreSession</td></tr><tr><td>Execute Reusable State Authorized15118 (PnC)</td></tr><tr><td>Execute Reusable State EnergyTransferStarted</td></tr></table>

# 6.2.99. Page 493 - (2024-09) - TC_N_41_CS - Set Variable Monitoring - Return to FactoryDefault

Moved preconfigured monitor to Prerequisite.

<table><tr><td>Test case name</td><td colspan="2">Set Variable Monitoring - Return to FactoryDefault</td></tr><tr><td>Test case Id</td><td colspan="2">TC_N_41_CS</td></tr><tr><td colspan="3">...</td></tr><tr><td>Prerequisite(s)</td><td colspan="2">Charging Station supports Monitoring and a preconfigured monitor exists with id &lt;Preconfigured monitor id&gt; for component EVSE and variable AvailabilityState and type = Delta and severity = &lt;Preconfigured severity&gt;</td></tr><tr><td rowspan="3">Before (Preparations)</td><td colspan="2">Configuration state: N/a</td></tr><tr><td colspan="2">Memory state: a preconfigured monitor exists with id &lt;Preconfigured monitor id&gt; for component EVSE and variable AvailabilityState and type = Delta and severity = &lt;Preconfigured severity&gt;</td></tr><tr><td colspan="2">Charging State: N/a</td></tr><tr><td rowspan="2">Main (Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

# 6.2.100. Page 482 - (2024-09) - TC_N_63_CS - Clear Customer Information - Clear and report - customerCertificate

Test case design top stop transaction was not correct for an ISO 15118 session.

<table><tr><td>Test case name</td><td>Clear Customer Information - Clear and report - customerCertificate</td></tr><tr><td>Test case Id</td><td>TC_N_63_CS</td></tr><tr><td colspan="2">...</td></tr><tr><td rowspan="3">Before
(Preparations)</td><td>Configuration State:
N/a</td></tr><tr><td>Memory State:
N/a</td></tr><tr><td>Charging State:
Execute Reusable State EVConnectedPreSession
Execute Reusable State Authorized15118
Execute Reusable State ParkingBayUnoccupied</td></tr></table>

<table><tr><td>Test case name</td><td colspan="2">Clear Customer Information - Clear and report - customerCertificate</td></tr><tr><td rowspan="8">Main (Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Note: The Charging Station receives a SessionStopReq(Terminate) message from the EV to finish the transaction.</td></tr><tr><td>2. The Charging Station responds with a CustomerInformationResponse</td><td>1. The OCTT sends a CustomerInformationRequest with - report true AND - clear true AND - customerCertificate customer information used in the transaction</td></tr><tr><td>3. The Charging Station sends a NotifyCustomerInformationRequest</td><td>4. The OCTT responds with a NotifyCustomerInformationResponse</td></tr><tr><td>Note(s): - If tbc is True at Step 3 then step 3 and 4 will be repeated</td><td></td></tr><tr><td>6. The Charging Station responds with a CustomerInformationResponse</td><td>5. The OCTT sends a CustomerInformationRequest with - report true AND - clear false AND - customerCertificate customer information used in the transaction</td></tr><tr><td>7. The Charging Station sends a NotifyCustomerInformationRequest</td><td>8. The OCTT responds with a NotifyCustomerInformationResponse</td></tr><tr><td>Note(s): - If tbc is True at Step 7 then step 7 and 8 will be repeated</td><td></td></tr><tr><td>Tool validations</td><td colspan="2">...</td></tr></table>

# 6.2.101. Page 482 - (2025-02) - TC_N_63_CS - Added missing configuration state and authorize explicit using Plug and Charge (PnC)

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>- AuthCtrl.Enabled is true</td></tr><tr><td>- AuthCtrl_DISABLERemoteAuthorization is false</td></tr><tr><td>- ISO15118Ctrl.CentralContractValidationAllowed is false</td></tr><tr><td>- ISO15118Ctrl.V2G CertificateInstallationEnabled is true</td></tr><tr><td>- ISO15118Ctrl ContractCertificateInstallationEnabled is true</td></tr><tr><td>- ISO15118Ctrl.PnCEnabled is true</td></tr><tr><td>- ISO15118Ctrl.Secld is NL</td></tr><tr><td>- ISO15118Ctrl.CountryName is secld</td></tr><tr><td>- ISO15118Ctrl.OrganizationName is OCA</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State: 
Execute Reusable State EVConnectedPreSession</td></tr><tr><td>Execute Reusable State Authorized15118 (PnC)</td></tr></table>

# 6.2.102. Page 493 - (2024-09) - TC_N_41_CS - Set Variable Monitoring - Return to FactoryDefault

Moved preconfigured monitor to Prerequisite.

<table><tr><td>Test case name</td><td colspan="2">Set Variable Monitoring - Return to FactoryDefault</td></tr><tr><td>Test case Id</td><td colspan="2">TC_N_41_CS</td></tr><tr><td colspan="3">...</td></tr><tr><td>Prerequisite(s)</td><td colspan="2">Charging Station supports Monitoring and a preconfigured monitor exists with id &lt;Preconfigured monitor id&gt; for component EVSE and variable AvailabilityState and type = Delta and severity = &lt;Preconfigured severity&gt;</td></tr><tr><td rowspan="3">Before (Preparations)</td><td colspan="2">Configuration state: N/a</td></tr><tr><td colspan="2">Memory state: a preconfigured monitor exists with id &lt;Preconfigured monitor id&gt; for component EVSE and variable AvailabilityState and type = Delta and severity = &lt;Preconfigured severity&gt;</td></tr><tr><td colspan="2">Charging State: N/a</td></tr><tr><td rowspan="2">Main (Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

# 6.2.103. Page 493 - (2025-02) - TC_N_41_CS - Made less dependent on test case configuration variables, enables predefines monitors

TC_N_41_CS: Set Variable Monitoring - Return to FactoryDefault

<table><tr><td>Test case name</td><td>Set Variable Monitoring - Return to FactoryDefault</td></tr><tr><td>Test case Id</td><td>TC_N_41_CS</td></tr><tr><td>Use case Id(s)</td><td>N03</td></tr><tr><td>Requirement(s)</td><td>N03.FR.04, N04.FR.15</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>This test case describes how the CSMS requests the Charging Station to overrule a preconfigured monitor by a custom monitor. When monitoringBase is set to FactoryDefault the preconfigured monitor must return.</td></tr><tr><td>Purpose</td><td>To verify if the Charging station is able to correctly restore monitors to FactoryDefault.</td></tr><tr><td>Prerequisite(s)</td><td>Charging Station supports Monitoring and a preconfigured monitor exists with id &lt;Preconfigured monitor id&gt; for component EVSE and variable AvailabilityState and type = Delta and severity = &lt;Preconfigured severity&gt; 
- Charging Station supports Monitoring 
- A preconfigured monitor exists with id &lt;Configured preconfigured monitor id&gt;.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:
N/a</td></tr><tr><td>Memory State:
N/a
MonitoringBase has been set to FactoryDefault</td></tr><tr><td>Reusable State:
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds withGetMonitoringReportResponse</td><td>1. The Test System sends GetMonitoringReportRequest withrequestId = &lt;Generated requestId&gt;</td></tr><tr><td>3. The Charging Station sends NotifyMonitoringReportRequest</td><td>4. The Test System responds withNotifyMonitoringReportResponse</td></tr><tr><td colspan="2">Note(s):- If NotifyMonitoringReportRequest.tbc is True in Step 3 then step 3 and 4 will be repeated</td></tr><tr><td colspan="2">Search NotifyMonitoringReportRequest.monitoringReportData of step 3 to get a monitoringReportData.monitorWHERE monitor_variableMonitoring.id is &lt;Configured preconfigured monitor id&gt;AS &lt;preconfiguredMonitor&gt;</td></tr><tr><td>6. The Charging Station responds with aSetVariableMonitoringResponse</td><td>5. The Test System sends a SetVariableMonitoringRequest withsetMonitoringData.id &lt;Preconfigured monitor id&gt; ANDsetMonitoringData.type-DeltasetMonitoringData.severity &lt;Preconfigured severity&gt; + 1setMonitoringData.id&lt;preconfiguredMonitor variableMonitoring.id&gt;setMonitoringData transaction&lt;preconfiguredMonitor variableMonitoring transaction&gt;setMonitoringData.value&lt;preconfiguredMonitor variableMonitoring.value&gt;setMonitoringData.type&lt;preconfiguredMonitor variableMonitoring.type&gt;setMonitoringData.severity IF&lt;preconfiguredMonitor variableMonitoring.severity&gt; &lt; 9 THEN&lt;preconfiguredMonitor variableMonitoring.severity&gt; + 1ELSE5END IFsetMonitoringData_component&lt;preconfiguredMonitor component&gt;setMonitoringData(variable &lt; preconfiguredMonitor variable&gt;</td></tr><tr><td>8. The Charging Station responds with aGetMonitoringReportResponse</td><td>7. The Test System sends a GetMonitoringReportRequest with- requestId &lt;Generated requestId&gt;-id &lt;Preconfigured monitor id&gt;-componentVariablecomponent name-EVSE&gt;-componentVariablecomponent evse id-evseId&gt;-componentVariablevariablename-AvailabilityState-monitoringCriteria DeltaMonitoring- - id&lt;preconfiguredMonitor variableMonitoring.id&gt;- componentVariablecomponent&lt;preconfiguredMonitor component&gt;- componentVariable variable &lt; preconfiguredMonitor variable&gt;</td></tr><tr><td>9. The Charging Station sends aNotifyMonitoringReportRequest</td><td>10. The Test System responds with aNotifyMonitoringReportResponse .</td></tr><tr><td>12. The Charging Station responds with aSetMonitoringBaseResponse withstatus Accepted</td><td>11. The Test System sends a SetMonitoringBaseRequest with- monitoringBase FactoryDefault</td></tr><tr><td>14. The Charging Station responds with a GetMonitoringReportResponse</td><td>13. The Test System sends a GetMonitoringReportRequest with - requestId &lt;Generated requestId&gt; -id &lt;Preconfigured monitor id&gt; -componentVariable.parent.name\_EVSE -componentVariable.parent.evse.id-evseld -componentVariable.parent.name-AvailabilityState -monitoringCriteria-DeltaMonitoring- -id &lt;preconfiguredMonitor.parentMonitoring.id&gt; -componentVariable.parent -preconfiguredMonitor.parent -componentVariable.parent &lt;preconfiguredMonitor(variable&gt;</td></tr><tr><td>15. The Charging Station sends a NotifyMonitoringReportRequest</td><td>16. The Test System responds with a NotifyMonitoringReportResponse .</td></tr></table>

# Tool validations

\* Step 2:

Message GetMonitoringReportResponse

status Accepted

\* Step 6:

Message SetVariableMonitoringResponse

- setMonitoringResult[0].status Accepted

- setMonitoringResult[0].type Delta

-setMonitoringResult[0].component.name-EVSE

-setMonitoringResult[0].variable.name AvailabilityState

- setMonitoringResult[0].component <preconfiguredMonitor_component>

- setMonitoringResult[0].variable <preconfiguredMonitor(variable>

* Step 8:

Message GetMonitoringReportResponse

status Accepted

- Step 9:

Message NotifyMonitoringReportRequest

-monitor_component.name-EVSE

-monitor(variable.name AvailabilityState

-monitor_variableMonitoring.id<Preconfigured id>

-monitor_variableMonitoring.severity <Preconfigured_severity> + 1

Should contain monitor:

- monitor_component <preconfiguredMonitor_component>

- monitor(variable <preconfiguredMonitor(variable>

- monitor variable Monitoring.id <preconfiguredMonitor variable Monitoring.id>

- monitor_variableMonitoring.severity IF <preconfiguredMonitor_variableMonitoring.severity> < 9 THEN

<preconfiguredMonitor variable Monitoring.severity> + 1

ELSE

5

# END IF

\* Step 15:

Message NotifyMonitoringReportRequest

-monitor_component.name-EVSE

-monitor(variable.name AvailabilityState

-monitor_variableMonitoring.severity <Preconfigured_severity> + 1

-monitor_variableMonitoring.id<Preconfigured id>

-monitor_variableMonitoring.severity<Preconfigured_severity> +1

Should contain monitor:

- monitor_component <preconfiguredMonitor_component>

- monitor(variable <preconfiguredMonitor(variable>

- monitor variable Monitoring.id <preconfiguredMonitor variable Monitoring.id>

- monitor_variableMonitoring.severity <preconfiguredMonitor_variableMonitoring.severity>

Post scenario validations:

- All report parts have been received

# 6.2.104. Page 495 - (2024-11) - TC_N_43_CS - Remove incorrect tool validation StatusInfo

<table><tr><td>Test case name</td><td>Set Variable Monitoring - First SetMonitoringData and third SetMonitoringData are valid, but the second contains an out of range value</td></tr><tr><td>Test case Id</td><td>TC_N_43_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

Tool validations

```txt
\* Step 2:
Message: SetVariableMonitoringResponse with (in arbitrary order):
setMonitoringResult[1]  $=$  {
- status  $=$  Accepted
-type  $=$  UpperThreshold
-statusInfo is absent or statusInforeasonCode  $=$  "NoError"
}
setMonitoringResult[2]  $=$  {
- status  $=$  Rejected
-type  $=$  Delta
-statusInfo is absent or statusInforeasonCode  $=$  "NoError" (Removed)
}
setMonitoringResult[3]  $=$  {
- status  $=$  Accepted
-type  $=$  LowerThreshold
-statusInfo is absent or statusInforeasonCode  $=$  "NoError"
}
```

```txt
Post scenario validations: - N/a
```

# 6.2.105. Page 495 - (2025-02) - TC_N_43_CS - Updating test case for using more specific configuration variables

TC_N_43_CS: Set Variable Monitoring - First SetMonitoringData and third SetMonitoringData are valid, but the second contains an out of range value

<table><tr><td>Test case name</td><td>Set Variable Monitoring - First SetMonitoringData and third SetMonitoringData are valid, but the second contains an out of range value</td></tr><tr><td>Test case Id</td><td>TC_N_43_CS</td></tr><tr><td>Use case Id(s)</td><td>N04</td></tr><tr><td>Requirement(s)</td><td>N/a</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>This test case describes how the CSMS requests the Charging Station to set monitoring triggers on Variables. Multiple triggers can be set for upper or lower thresholds, delta changes or periodic reporting.</td></tr><tr><td>Purpose</td><td>To verify if the Charging station is able to correctly respond when one of requested variable monitor data is out of range replace as described at the OCPP specification.</td></tr><tr><td>Prerequisite(s)</td><td>Charging Station supports MonitoringThis test case assumes the Charging Station has a numeric Component Variable &lt;Configured numeric delta component variable&gt; and numeric Component Variable &lt;Configured threshold monitor component variable&gt;</td></tr></table>

Before (Preparations)

```txt
Configuration State: N/a
```

<table><tr><td>Before (Preparations)</td></tr><tr><td>Memory State:
N/a</td></tr><tr><td>Reusable State:
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td rowspan="3">2. The Charging Station responds with a SetVariableMonitoringResponse</td><td>1. The Test System sends a SetVariableMonitoringRequest with -setMonitoringData.element_name = &lt;Configured threshold monitor-component-variable&gt; -setMonitoringData_variable_name = &lt;Configured threshold monitor-component-variable&gt; -setMonitoringData_variable_name = &lt;Configured threshold monitor-component-variable&gt; -setMonitoringData[0].value = &lt;Configured threshold monitor value&gt; - setMonitoringData[0].component = &lt;Configured threshold monitor component variable&gt; - setMonitoringData[0].value = &lt;Configured threshold monitor component variable&gt; - setMonitoringData[0].value = &lt;Configured threshold monitor component variable&gt; - setMonitoringData[0].type = UpperThreshold trigger value&gt; - setMonitoringData[0].type = UpperThreshold</td></tr><tr><td>- setMonitoringData[1].component = &lt;Configured numeric delta component variable&gt; - setMonitoringData[1].variable = &lt;Configured numeric delta component variable&gt; - setMonitoringData[1].value = -1.0 - setMonitoringData[1].type = Delta</td></tr><tr><td>- setMonitoringData[2].value = &lt;Configured threshold monitor2 value&gt; - setMonitoringData[2].component = &lt;Configured threshold monitor component variable&gt; - setMonitoringData[2].variable = &lt;Configured threshold monitor component variable&gt; - setMonitoringData[2].value = &lt;Configured threshold monitor component variable LowerThreshold trigger value&gt; - setMonitoringData[2].type = LowerThreshold</td></tr><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
Message: SetVariableMonitoringResponse with (in arbitrary order): 
setMonitoringResult[1] = { 
- status = Accepted 
- type = UpperThreshold 
- statusInfo is absent or statusInfo_reasonCode = "NoError" 
} 
setMonitoringResult[2] = { 
- status = Rejected 
- type = Delta 
} 
setMonitoringResult[3] = { 
- status = Accepted 
- type = LowerThreshold 
- statusInfo is absent or statusInfo_reasonCode = "NoError" 
}</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

# 6.2.106. Page 497 - (2025-02) - TC_N_45_CS - Updating test case for using more specific configuration variables

TC_N_45_CS: Alert Event - Delta value exceeded

<table><tr><td>Test case name</td><td>Alert Event - Delta value exceeded</td></tr><tr><td>Test case Id</td><td>TC_N_45_CS</td></tr><tr><td>Use case Id(s)</td><td>N07</td></tr><tr><td>Requirement(s)</td><td>N07.FR.06, N07.FR.07, N07.FR.18, N07.FR.19</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>NotifyEventRequest reports every Component/Variable for which a VariableMonitoring setting was triggered. Only the VariableMonitoring settings that are responsible for triggering an event are included.</td></tr><tr><td>Purpose</td><td>To verify if the Charging station is correctly communicating when a delta value has exceeded as described at the OCPP specification.</td></tr><tr><td>Prerequisite(s)</td><td>n/a</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
Variable monitor is configured with: 
-setMonitoringData.element.name = &lt;Configured threshold monitor component variable&gt; 
-setMonitoringData_element.evse.id = &lt;Configured EVSEId&gt; 
-setMonitoringData_value = &lt;Configured threshold monitor value&gt; 
-setMonitoringData_type = Delta 
-setMonitoringData_variable.name = &lt;Configured delta monitor component variable&gt; 
- setMonitoringData_component = &lt;Configured numeric delta component variable&gt; 
- setMonitoringData_variable = &lt;Configured numeric delta component variable Delta numeric trigger value&gt; 
- setMonitoringData_value = &lt;Configured numeric delta component variable&gt; 
- setMonitoringData_type = Delta 
- setMonitoringData_severity = 5</td></tr><tr><td>Set MonitoringLevel to 8</td></tr><tr><td>Notes: If componentVariable is set to &quot;Power&quot; or &quot;Current&quot;, the value is set to 100.0</td></tr><tr><td>Reusable State: 
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Manual Action: If componentVariable is set to "Power" or "Current" EnergyTransferStarted will trigger the monitor. If another componentvariable is chosen a manual action is needed to trigger the monitor.</td></tr><tr><td colspan="2">1. Execute Reusable State EnergyTransferStarted or manually trigger the monitor.</td></tr><tr><td>2. The Charging Station sends a NotifyEventRequest</td><td>3. The Test System responds with a NotifyEventResponse .</td></tr><tr><td colspan="2">Note(s): 
- If tbc is True at Step 2 then step 1 and 3 will be repeated</td></tr><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
Message NotifyEventRequest
- eventData[0].trigger Delta
-eventData[0].component.name&lt;Configured threshold monitor component variable&gt;
-eventData[0].variable.name&lt;Configured threshold monitor component variable&gt;
-eventData[0].variableMonitoringld&lt;Configured variableMonitoringld&gt; 
-eventData[0].component &lt;Configured numeric delta component variable&gt;
-eventData[0].variable &lt;Configured numeric delta component variable&gt;
-eventData[0].variableMonitoringld &lt;SetVariableMonitoringResponse.setMonitoringResult.id in preparation phase&gt;</td></tr><tr><td>Post scenario validations: 
-N/a</td></tr></table>

# 6.2.107. Page 501 - (2025-02) - TC_N_51_CS - Updating test case for using more specific configuration variables

# TC_N_51_CS: Set Variable Monitoring - Replace-Variable-Monitor Modifying a VariableMonitor and trigger

<table><tr><td>Test case name</td><td>Set Variable Monitoring - Replace Variable Monitor
Set Variable Monitoring - Modifying a VariableMonitor and trigger</td></tr><tr><td>Test case Id</td><td>TC_N_51_CS</td></tr><tr><td>Use case Id(s)</td><td>N07</td></tr><tr><td>Requirement(s)</td><td>N07.FR.11</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>NotifyEventRequest reports every Component/Variable for which a VariableMonitoring setting was triggered. Only the VariableMonitoring settings that are responsible for triggering an event are included.</td></tr><tr><td>Purpose</td><td>To verify if the Charging station is able to correctly check if the current value exceeds the new threshold as described at the OCPP specification.</td></tr><tr><td>Prerequisite(s)</td><td>Charging Station supports Monitoring</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
Variable monitor is already set with: 
setMonitoringData_component.name &lt;Configured threshold monitor component variable&gt; AND 
setMonitoringData_component.evse.id &lt;Configured EVSEId&gt; AND 
setMonitoringData_value &lt;Configured threshold monitor value&gt; AND 
setMonitoringData_type UpperThreshold AND 
setMonitoringData_variable.name &lt;Configured threshold monitor component variable&gt; 
setMonitoringData_component &lt;Configured threshold monitor component variable&gt; 
setMonitoringData_variable &lt;Configured threshold monitor component variable&gt; 
setMonitoringData_value &lt;Configured threshold monitor component variable UpperThreshold non-trigger value&gt; 
setMonitoringData_type UpperThreshold 
setMonitoringData_severity 5 
Set MonitoringLevel to 8 
Notes: If componentVariable is set to &quot;Power&quot; or &quot;Current&quot;, the value is set to the configured maxLimit -1</td></tr><tr><td>Reusable State: 
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Notes: If componentVariable is set to "Power" or "Current" EnergyTransferStarted will trigger the monitor. If another componentvariable is chosen a manual action is needed to trigger the monitor.</td></tr><tr><td colspan="2">1. Execute Reusable State EnergyTransferStarted or manually trigger the monitor.</td></tr><tr><td>3. The Charging Station responds with a SetVariableMonitoringResponse</td><td>2. The Test System sends a SetVariableMonitoringRequest with setMonitoringData.element.name&lt;Configured threshold monitor_element_variable&gt; AND setMonitoringData_element.evse_id&lt;Configured EVSEId&gt; AND setMonitoringData_id&lt;Configured variableMonitoringId&gt; AND setMonitoringData_value&lt;Configured threshold monitor value2&gt; AND setMonitoringData_type_UpperThreshold setMonitoringData_variable.name&lt;Configured threshold monitor element_variable&gt; setMonitoringData_component&lt;Configured threshold monitor component variable&gt; setMonitoringData_variable&lt;Configured threshold monitor component variable&gt; setMonitoringData_id&lt;SetVariableMonitoringResponse.setMonitoringResult.id in preparation phase&gt; setMonitoringData_value&lt;Configured threshold monitor component variable UpperThreshold trigger value&gt; setMonitoringData_type_UpperThreshold Notes: If componentVariable is set to "Power" or "Current", the value is set to 0.0</td></tr><tr><td>4. The Charging station sends a NotifyEventRequest</td><td>5. The Test System responds with a NotifyEventResponse.</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 3:Message SetVariableMonitoringResponse-setMonitoringResult[0].status Accepted-setMonitoringResult[0].type UpperThreshold-setMonitoringResult[0].severity&lt;Configured severity&gt;-- setMonitoringResult[0].component.name&lt;Configured threshold monitor component variable&gt;-- setMonitoringResult[0].variable.name&lt;Configured threshold monitor component variable&gt;-- setMonitoringResult[0].severity 5-- setMonitoringResult[0].component&lt;Configured threshold monitor component variable&gt;-- setMonitoringResult[0].variable&lt;Configured threshold monitor component variable&gt;* Step 4:Message NotifyEventRequest-eventData[0].trigger Alerting-eventData[0].actualValue&gt;&lt;Configured threshold monitor value&gt;- eventData[0].actualValue&gt;&lt;Configured threshold monitor component variable UpperThreshold non-trigger value&gt;</td></tr><tr><td>Post scenario validations:- All report parts have been received</td></tr></table>

# 6.2.108. Page 503 - (2025-02) - TC_N_52_CS - Updating test case for using more specific configuration variables

# TC_N_52_CS: Set Variable Monitoring - Removing a VariableMonitor

<table><tr><td>Test case name</td><td>Set Variable Monitoring - Removing a VariableMonitor</td></tr><tr><td>Test case Id</td><td>TC_N_52_CS</td></tr><tr><td>Use case Id(s)</td><td>N07</td></tr><tr><td>Requirement(s)</td><td>N07.FR.12</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>NotifyEventRequest reports every Component/Variable for which a VariableMonitoring setting was triggered. Only the VariableMonitoring settings that are responsible for triggering an event are included.</td></tr><tr><td>Purpose</td><td>To verify if the Charging station is able to correctly communicate when a threshold has been exceeded and the applicable monitor is removed as described at the OCPP specification.</td></tr><tr><td>Prerequisite(s)</td><td>Charging Station supports Monitoring</td></tr></table>

# Before (Preparations)

Configuration State: N/a

# Memory State:

Variable monitor is already set with:

setMonitoringData_component.name<Configured threshold monitor component variable> AND

setMonitoringData:Evse.id<Configured-EVSEId>AND

setMonitoringData.value<Configured threshold monitor value>AND

setMonitoringData.type UpperThreshold-AND

setMonitoringData variable.name<Configured threshold monitor component variable>

setMonitoringData_component <Configured threshold monitor component variable>

setMonitoringData(variable <Configured threshold monitor component variable>

setMonitoringData.value <Configured threshold monitor component variable UpperThreshold trigger value>

setMonitoringData.type UpperThreshold

setMonitoringData.severity $= 5$

# Set MonitoringLevel to 8

Notes: If componentVariable is set to "Power" or "Current", the value is set to 0.0

# Reusable State:

Execute Reusable State EnergyTransferStarted or manually trigger the monitor.

Notes: If componentVariable is set to "Power" or "Current" EnergyTransferStarted will trigger the monitor. If another

componentvariable is chosen a manual action is needed to trigger the monitor.

# Main (Test scenario)

<table><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a ClearVariableMonitoringResponse</td><td>1. The Test System sends a ClearVariableMonitoringRequest with id&lt;Configured variableMonitoringId&gt; id&lt;SetVariableMonitoringResponse.setMonitoringResult.id in preparation phase&gt;</td></tr><tr><td>4. The Charging Station responds with a GetMonitoringReportResponse</td><td>3. The Test System sends a GetMonitoringReportRequest with componentVariable.element&lt;Configured threshold monitor component variable&gt;componentVariable_variable&lt;Configured threshold monitor component variable&gt;monitoringCriteria ThresholdMonitoring</td></tr><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td colspan="2">5. Execute Reusable State StopAuthorized or manually trigger the monitor.
Notes: If componentVariable is set to "Power" or "Current" EnergyTransferStarted will trigger the monitor. If another componentvariable is chosen a manual action is needed to trigger the monitor.</td></tr><tr><td>6. The Charging Station should not send a request for the cleared monitor</td><td></td></tr><tr><td colspan="2">Tool validations</td></tr><tr><td colspan="2">* Step 2:
Message ClearVariableMonitoringResponse
- clearMonitoringResult[0].status Accepted AND
- clearMonitoringResult[0].id&lt;Configured variableMonitoringId&gt; - clearMonitoringResult[0].id&lt;SetVariableMonitoringResponse.setMonitoringResult.id in preparation phase&gt;</td></tr><tr><td colspan="2">* Step 4:
Message GetMonitoringReportResponse
- getMonitoringResult[0].status EmptyResultSet</td></tr><tr><td colspan="2">* Step 6:
-No NotifyEventRequest with variableMonitoringId&lt;Configured variableMonitoringId&gt; is send- No NotifyEventRequest with variableMonitoringId &lt;SetVariableMonitoringResponse.setMonitoringResult.id in preparation phase&gt; is send</td></tr><tr><td colspan="2">Post scenario validations:
-N/a</td></tr></table>

# 6.2.109. Page 504 - (2025-02) - TC_N_53_CS - Updating test case for using more specific configuration variables

# TC_N_53_CS: Alert Event - Persistent over reboot

<table><tr><td>Test case name</td><td>Alert Event - Persistent over reboot</td></tr><tr><td>Test case Id</td><td>TC_N_53_CS</td></tr><tr><td>Use case Id(s)</td><td>N07</td></tr><tr><td>Requirement(s)</td><td>N07.FR.13</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>NotifyEventRequest reports every Component/Variable for which a VariableMonitoring setting was triggered. Only the VariableMonitoring settings that are responsible for triggering an event are included.</td></tr><tr><td>Purpose</td><td>To verify if the Charging station is able to save the variableMonitor data persistent across reboot as described at the OCPP specification.</td></tr><tr><td>Prerequisite(s)</td><td>n/a</td></tr></table>

# Before (Preparations)

Configuration State: N/a

# Memory State:

Variable monitor is already set with:

setMonitoringData_component.name<Configured threshold monitor component variable> AND

setMonitoringData:Evse.id<Configured-EVSEId>AND

setMonitoringData.value<Configured threshold monitor value>AND

setMonitoringData.type UpperThreshold-AND

setMonitoringData variable.name<Configured threshold monitor component variable>

setMonitoringData_component <Configured threshold monitor component variable>

setMonitoringData(variable <Configured threshold monitor component variable>

setMonitoringData.value <Configured threshold monitor component variable UpperThreshold trigger value>

setMonitoringData.type UpperThreshold

Reusable State:

Execute Reusable State Booted

Main (Test scenario)

<table><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a GetMonitoringReportResponse</td><td>1. The Test System sends a GetMonitoringReportRequest with monitoringCriteria ThresholdMonitoring</td></tr><tr><td>3. The Charging Station sends a NotifyMonitoringReportRequest</td><td>4. The Test System responds with a NotifyMonitoringReportResponse .</td></tr><tr><td colspan="2">Note(s): 
- If tbc is True at Step 3 then step 3 and 4 will be repeated</td></tr></table>

# Tool validations

\* Step 3:

Message NotifyMonitoringReportRequest

- requestId <The Id of the request> AND

-monitorvariableMonitoring.id<Received monitorld from set monitor> - monitor variable Monitoring.id

<SetVariableMonitoringResponse.setMonitoringResult.id in preparation phase> - monitor variable Monitoring.type UpperThreshold

Post scenario validations:

- All reports have been received

# 6.2.110. Page 505 - (2025-02) - TC_N_56_CS - Made test case configurable using configuration variables

```txt
Before (Preparations)
Configuration State:
N/a
Memory State:
Variable monitor is configured with:
component.evse.id<Configured-EVSEId>
component.name-EVSE
severity<Configured-severity>
type-Delta
value-1.0
variable-name-AvailabilityState
Variable monitor is configured with:
setMonitoringData[O].value  $= 1$
setMonitoringData[O].type  $=$  Delta
setMonitoringData[O].severity  $= 5$
setMonitoringData[O].component  $=$  <Configured non-numeric delta component variable>
setMonitoringData[O].variable  $=$  <Configured non-numeric delta component variable>
Set MonitoringLevel to 8
Notes :
Take a non-numeric component variable which can easily modified to trigger the alert.
Reusable State:
N/a
```

```txt
Tool validations
\* Step 1:
Message NotifyEventRequest
-eventData[0].trigger Delta
-eventData[O].component.name EVSE
-eventData[O].variable.name AvailabilityState
-eventData[O].component <Configured non-numeric delta component variable>
-eventData[O].variable <Configured non-numeric delta component variable>
-eventData[O].variableMonitoringld monitoringld of monitor set in Memory State
Post scenario validations:
-N/a
```

# 6.2.111. Page 506 - (2025-06) - TC_O_XX_CS - Updated configurations

Some generic changes regarding the configuration of the display message testcases were needed:

- Identifying which display to use has been made configurable.
- The Start / End date time configurations have been changed to offset configurations, so the current time can be used as a base.

<table><tr><td>Test case Id</td><td>TC_O_01_CS, TC_O_06_CS, TC_O_10_CS, TC_O_13_CS, TC_O_14_CS, TC_O_17_CS, TC_O_18_CS, TC_O_19_CS, TC_O_20_CS, TC_O_22_CS, TC_O_28_CS, TC_O_30_CS, TC_O_32_CS, TC_O_36_CS, TC_O_37_CS, TC_O_38_CS, TC_O_39_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>n. The Charging Station responds with a SetDisplayMessageResponse</td><td>n. The Test System sends a SetDisplayMessageRequest with message.display &lt;Configured display component variable&gt; 
(Omitted when left empty)</td></tr></table>

<table><tr><td>Test case Id</td><td>TC_O_02_CS, TC_O_04_CS, TC_O_07_CS, TC_O_08_CS, TC_O_09_CS, TC_O_11_CS, TC_O_12_CS, TC_O_34_CS, TC_O_35_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>...</td></tr><tr><td>Memory State:</td></tr><tr><td>SetDisplayMessage</td></tr><tr><td>Reusable State:</td></tr><tr><td>...</td></tr></table>

New Memory state:

Table 7. SetDisplayMessage

<table><tr><td>State</td><td>SetDisplayMessage</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>This will set a display message at the Charging Station.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId&gt;messagepriority &lt;Configured priority&gt;message.state &lt;Omitted, unless specifically described at the testcase&gt;message.display &lt;Configured display component variable&gt;(Omitted when left empty)message.message.format &lt;Configured Message Format&gt;message.message(content &lt;Configured Message&gt;</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2:
(Message: SetDisplayMessageResponse)
status is Accepted</td></tr><tr><td>Post scenario validations:
N/a</td></tr></table>

# Specific O testcase changes:

<table><tr><td>Test case name</td><td>Set Display Message - Replace DisplayMessage</td></tr><tr><td>Test case Id</td><td>TC_O_12_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId from before (preparation) steps&gt;
message.message.content &lt;Different message to indicate the message was replaced&gt;</td></tr><tr><td colspan="2">Note(s):
- The display message is replaced by a new one.</td></tr></table>

<table><tr><td>Test case name</td><td>Set Display Message - State Faulted</td></tr><tr><td>Test case Id</td><td>TC_O_39_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId&gt;message.priority &lt;Configured Priority&gt;message.state Faultedmessage.message.content &lt;Message indicating the Charging Station is in a Faulted state&gt;message.display &lt;Configured display component variable&gt;(Omitted when left empty)</td></tr></table>

<table><tr><td>Test case name</td><td>Set Display Message - Display message atStartTime</td></tr><tr><td>Test case Id</td><td>TC_O_13_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId&gt;messagepriority &lt;Configured Priority&gt;message.startDateTime &lt;Current dateTime + Configured Start Date Time Offset&gt;message.display &lt;Configured display component variable&gt;(Omitted when left empty)</td></tr><tr><td>4. The Charging Station responds with a GetDisplayMessagesResponse</td><td>3. The Test System sends a GetDisplayMessagesRequest with id &lt;Generated displayMessageId&gt;</td></tr><tr><td>5. The Charging Station sends a NotifyDisplayMessagesRequest</td><td>6. The Test System responds with a NotifyDisplayMessagesResponse .</td></tr><tr><td colspan="2">Note(s):- If tbc is True at Step 5 then step 5 and 6 will be repeated- Wait till &lt;Configured Start Date Time Offset&gt; seconds have passed- The display message should be displayed after &lt;Configured Start Date Time Offset&gt; seconds.</td></tr></table>

<table><tr><td>Test case name</td><td>Set Display Message - Remove message after EndTime</td></tr><tr><td>Test case Id</td><td>TC_O_14_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId&gt;messagepriority &lt;Configured Priority&gt;messageEndTimeTime &lt;CurrentDateTime + Configured End Date Time Offset&gt;message.display &lt;Configured display component variable&gt;(Omitted when left empty)</td></tr><tr><td>4. The Charging Station responds with a GetDisplayMessagesResponse</td><td>3. The Test System sends a GetDisplayMessagesRequest with id &lt;Generated displayMessageId&gt;</td></tr><tr><td>5. The Charging Station sends a NotifyDisplayMessagesRequest</td><td>6. The Test System responds with a NotifyDisplayMessagesResponse .</td></tr><tr><td colspan="2">Note(s):- If tbc is True at Step 5 then step 5 and 6 will be repeated-Wait till &lt;Configured End Date Time Offset&gt; seconds have passed-The display message is displayed and removed after &lt;Configured End Date Time Offset&gt; seconds.</td></tr><tr><td>8. The Charging Station responds with a GetDisplayMessagesResponse</td><td>7. The Test System sends a GetDisplayMessagesRequest with id &lt;Generated displayMessageId&gt;requestId &lt;Generated requestId&gt;</td></tr></table>

<table><tr><td>Test case name</td><td>Set Display Message - Specific transaction - Remove message after EndTime</td></tr><tr><td>Test case Id</td><td>TC_O_28_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId&gt; message_transactionId &lt;Generated transactionId&gt; message.priority &lt;Configured Priority message.endDateTime &lt;CurrentDateTime + Configured End Date Time Offset&gt; message.display &lt;Configured display component variable&gt;(Omitted when left empty)</td></tr><tr><td colspan="2">Note(s): 
- The display message should be displayed. 
- Waiting &lt;Configured End Date Time Offset&gt; seconds. 
- The display message is not being displayed anymore after &lt;Configured End Date Time Offset&gt; seconds.</td></tr><tr><td>4. The Charging Station responds with a GetDisplayMessagesResponse</td><td>3. The Test System sends a GetDisplayMessagesRequest with id &lt;Generated displayMessageId&gt;</td></tr></table>

<table><tr><td>Test case name</td><td>Set Display Message - NotSupportedMessageFormat</td></tr><tr><td>Test case Id</td><td>TC_O_19_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId&gt;
message(message.format &lt;ConfiguredUnsupported Message Format&gt;
message.display &lt;Configured display component variable&gt;
(Omitted when left empty)</td></tr></table>

<table><tr><td>Test case name</td><td>Set Display Message - Second Alwaysfront priority</td></tr><tr><td>Test case Id</td><td>TC_O_24_CS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId&gt;message.priority AlwaysFront</td></tr><tr><td>4. The Charging Station responds with a SetDisplayMessageResponse</td><td>3. The Test System sends a SetDisplayMessageRequest with message.id &lt;Configured displayMessage2Id&gt;message.priority AlwaysFront</td></tr><tr><td>6. The Charging Station responds with a GetDisplayMessagesResponse</td><td>5. The Test System sends a GetDisplayMessagesRequest with id &lt;Configured displayMessageId&gt;</td></tr><tr><td>6. The Charging Station responds with a GetDisplayMessagesResponse</td><td>5. The Test System sends a GetDisplayMessagesRequest with id &lt;Configured displayMessage2Id&gt;</td></tr><tr><td>7. The Charging Station sends a NotifyDisplayMessagesRequest</td><td>8. The Test System responds with a NotifyDisplayMessagesResponse .</td></tr><tr><td colspan="2">Note(s): 
- If tbc is True at Step 7 then step 7 and 8 will be repeated 
- The message from step 1 is NOT displayed anymore and is replaced by the message from step 5.</td></tr><tr><td>Tool validations</td></tr><tr><td>* Step 2: 
Message SetDisplayMessageResponse
- status Accepted
* Step 4: 
Message SetDisplayMessageResponse
- status Accepted
* Step 6: 
Message GetDisplayMessagesResponse
- status Unknown
* Step 6: 
Message GetDisplayMessagesResponse
- status Accepted
* Step 7: 
Message NotifyDisplayMessagesRequest
- requestId &lt;Generated requestId&gt;</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

# 6.2.112. Page 520 - (2025-02) - TC_O_15_CS - Test case removed

This test case has been removed.

<table><tr><td>Test case name</td><td>Set Display Message - Language preference of the EV Driver</td></tr><tr><td>Test case Id</td><td>TC_O_15_CS</td></tr><tr><td>...</td><td>...</td></tr></table>

# 6.2.113. Page 530 - (2025-02) - TC_O_28_CS - Transaction id should be specified for DisplayMessage

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId&gt;
message_transactionId &lt;Generated transactionId&gt;
message.priority &lt;Configured Priority
message.endDateTime &lt;Current dateTime + 60 seconds&gt;</td></tr><tr><td colspan="2">[...]</td></tr></table>

# 6.2.114. Page 533 - (2025-02) - TC_O_32_CS - Made notes about display behaviour more explicit

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId&gt; message_transactionId &lt;Received transactionId&gt; AND message.priority AlwaysFront</td></tr><tr><td colspan="2">Note(s):
- Display message &lt;Generated displayMessageId&gt; is shown</td></tr><tr><td>4. The Charging Station responds with a SetDisplayMessageResponse</td><td>3. The Test System sends a SetDisplayMessageRequest with message.id &lt;Configured displayMessage2Id&gt; message_transactionId &lt;Received transactionId&gt; AND messagepriority AlwaysFront</td></tr><tr><td colspan="2">Note(s): 
- Display message &lt;Generated displayMessage1Id&gt; is not displayed anymore 
- Display message &lt;Generated displayMessage2Id&gt; is shown</td></tr><tr><td>6. The Charging Station responds with a GetDisplayMessagesResponse</td><td>5. The Test System sends a GetDisplayMessagesRequest with id &lt;Generated displayMessageId&gt;</td></tr><tr><td>8. The Charging Station responds with a GetDisplayMessagesResponse</td><td>7. The Test System sends a GetDisplayMessagesRequest with id &lt;Generated displayMessageId&gt; requestId &lt;Generated requestId&gt;</td></tr><tr><td>9. The Charging Station sends a NotifyDisplayMessagesRequest</td><td>10. The Test System responds with a NotifyDisplayMessagesResponse .</td></tr><tr><td colspan="2">11. Execute Reusable State StopAuthorized</td></tr><tr><td colspan="2">12. Execute Reusable State EVConnectedPostSession</td></tr><tr><td colspan="2">13. Execute Reusable State EVDisconnected</td></tr><tr><td colspan="2">14. Execute Reusable State ParkingBayUnoccupied</td></tr><tr><td colspan="2">Note(s): 
- The display message is not displayed anymore 
- Display message &lt;Generated displayMessage2Id&gt; is not displayed anymore</td></tr><tr><td>16. The Charging Station responds with a GetDisplayMessagesResponse</td><td>15. The Test System sends a GetDisplayMessagesRequest with id &lt;Generated displayMessageId&gt;</td></tr></table>

# 6.2.115. Page 544 - (2025-02) - TC_O_39_CS - Wait for StatusNotificationRequest or NotifyEventRequest

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a SetDisplayMessageResponse</td><td>1. The Test System sends a SetDisplayMessageRequest with message.id &lt;Generated displayMessageId&gt;messagepriority &lt;Configured Prioritymessage.state &lt;Configured State&gt;message.message Faulted</td></tr><tr><td colspan="2">Note(s): The display message should NOT be displayed.</td></tr><tr><td colspan="2">Manual Action: Set the Charging Station to state Faulted.</td></tr><tr><td>3. The Charging Station notifies the CSMS about the status change of the Charging Station.</td><td>4. The Test System responds accordingly.</td></tr><tr><td colspan="2">Note(s):The display message should be displayed now.- Step 3/4 are used to detect if the Charging Station status has changed.- The display message should be displayed now.</td></tr><tr><td colspan="2">Manual Action: Set the Charging Station back to state Available.</td></tr><tr><td>5. The Charging Station notifies the CSMS about the status change of the Charging Station.</td><td>6. The Test System responds accordingly.</td></tr><tr><td colspan="2">Note(s):
The display message should NOT be displayed anymore.
- Step 5/6 are used to detect if the Charging Station status has changed.
- The display message should NOT be displayed anymore.</td></tr><tr><td>8. The Charging Station responds with a GetDisplayMessagesResponse</td><td>7. The Test System sends a GetDisplayMessagesRequest with id &lt;Generated displayMessageId&gt;
requestId &lt;Generated requestId&gt;</td></tr><tr><td>9. The Charging Station sends a NotifyDisplayMessagesRequest</td><td>10. The Test System responds with a NotifyDisplayMessagesResponse .</td></tr><tr><td colspan="2">Note(s): If tbc is True at Step 9 then step 9 and 10 will be repeated</td></tr></table>

# Tool validations

\* Step 2:

Message SetDisplayMessageResponse

status Accepted

\* Step 3:

At least one of te following messages must be sent:

Message: StatusNotificationRequest

- connectorStatus Faulted or Unavailable

Message: NotifyEventRequest

-eventData[0].trigger must be Delta

-eventData[0].actualValue must be Faulted or Unavailable

-eventData[0].component.name must be Connector

-eventData[0].variable.name must be AvailabilityState

- evse.id <not omitted>

- connector.id <not omitted>

Message: NotifyRequest

-eventData[0].trigger must be Delta

-eventData[0].actualValue must be Faulted

-eventData[0].component.name must be ChargingStation

-eventData[0].variable.name must be AvailabilityState

- evse.id <omitted>

- connector.id <omitted>

* Step 5:

At least one of te following messages must be sent:

Message: StatusNotificationRequest

- connectorStatus Available

Message: NotifyRequest

-eventData[0].trigger must be Delta

-eventData[0].actualValue must be Available

-eventData[0].component.name must be Connector

-eventData[0].variable.name must be AvailabilityState

- evse.id <not omitted>

- connector.id <not omitted>

Message: NotifyRequest

-eventData[0].trigger must be Delta

-eventData[0].actualValue must be Available

-eventData[0].component.name must be ChargingStation

-eventData[0].variable.name must be AvailabilityState $^+$ \* Step 8:

Message GetDisplayMessagesResponse

status Accepted

- Step 9:

Message NotifyDisplayMessagesRequest

- requestId <Generated requestId>

-state Faulted

Post scenario validations:

-N/a

# 6.2.116. Page 555 - (2024-11) - Remove StatusNotificationRequest from Authorized reusable state Main B steps

<table><tr><td colspan="2">Main B (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with aRequestStartTransactionResponse</td><td>1. The OCTT sends a RequestStartTransactionRequestwith idToken.idToken&lt;Configured valid_idtoken_idtoken&gt;_idToken.type&lt;Configured valid_idtoken_type&gt;_evseld&lt;Configured evseld&gt;</td></tr><tr><td>3. The Charging Station sends anauthorizeRequestNote(s):- This step needs to be executed whenAuthCtrl AUTHRemoteStart is true, unless (AuthEnabled isimplemented with mutability ReadOnly AND the value is set tofalse) ORthe idToken is cached.In case the idToken is used for a reservation, sending theAuthorizationRequest message is optional.</td><td>4. The OCTT responds with an AuthorizationResponsewith idTokenInfo.status Accepted</td></tr><tr><td colspan="2"></td></tr><tr><td>5. The Charging Station sends a TransactionEventRequestNote(s):- This step needs to be executed when TxStartPoint containsAuthorized OR the transaction already started. So in the caseTxStartPoint contains ParkingBayOccupancy or (EVConnected, inthe case this testcase was initiated from stateEVConnectedPreSession.)</td><td>6. The OCTT responds with a TransactionEventResponseNote(s):- The first TransactionEventRequest sent after authorizationcontains the idToken field. The TransactionEventResponse of thisrequest message contains idTokenInfowith status Accepted</td></tr></table>

# 6.2.117. Page 560 - (2025-04) - Reusable states StopAuthorized & Deauthorized

Based on TWG and CWG discussions the transaction validations of the Test system have been made more flexible and validate accordingly based on the different TxStartPoint and TxStopPoint combinations. However, the reusable states described at part 6 did not reflect this yet.

<table><tr><td>State</td><td>StopAuthorized</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>This state will prepare the Charging Station, so that it is in a state where the charging session is authorized to stop. This can be done in two ways (Configurable at Test System):
A. Using local authorization
B. Using a RequestStopTransactionRequest</td></tr></table>

<table><tr><td colspan="2">Main A (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Notes(s): The tool will wait for &lt;Configured Transaction Duration&gt; seconds</td></tr><tr><td colspan="2">Manual Action: Present the same idToken as used to start the transaction.</td></tr><tr><td>1. The Charging Station sends a TransactionEventRequest</td><td>2. The Test System responds with a TransactionResponse With idTokenInfo.status is Accepted</td></tr><tr><td colspan="2">Note(s): This step is optional</td></tr><tr><td>3. The Charging Station sends a TransactionEventRequest</td><td>4. The Test System responds with a TransactionResponse With idTokenInfo.status is Accepted</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:</td></tr><tr><td>Message: TransactionRequest</td></tr><tr><td>- triggerReason must be StopAuthorized</td></tr><tr><td>- idToken omit OR</td></tr><tr><td>- idToken.idToken &lt;Configured valid_idtoken_idtoken&gt; AND</td></tr><tr><td>- idToken.type &lt;Configured valid_idtoken_type&gt;</td></tr><tr><td>* Step 3:</td></tr><tr><td>Message: TransactionRequest</td></tr><tr><td>- triggerReason must be ChargingStateChanged</td></tr><tr><td>- transactionInfo.chargingState must be EVConnected</td></tr><tr><td>If TxStopPoint contains Authorized or PowerPathClosed or EnergyTransfer</td></tr><tr><td>Then the last of the two TransactionRequest messages from step 1 and 3 needs to contain:</td></tr><tr><td>- eventType must be Ended</td></tr><tr><td>- transactionInfo.stoppedReason must be Local or omitted</td></tr><tr><td>Else</td></tr><tr><td>Then both TransactionRequest messages need to contain:</td></tr><tr><td>- eventType must be Updated</td></tr></table>

<table><tr><td colspan="2">Main B (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a RequestStopTransactionResponse</td><td>1. The Test System sends a RequestStopTransactionRequest with transactionId &lt;transactionId provided by the Charging Station in TransactionRequest&gt;</td></tr><tr><td>3. The Charging Station sends a TransactionEventRequest</td><td>4. The Test System responds with a TransactionEventResponse</td></tr><tr><td colspan="2">Note(s): This step is optional</td></tr><tr><td>5. The Charging Station sends a TransactionEventRequest</td><td>6. The Test System responds with a TransactionEventResponse With idTokenInfo.status is Accepted</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2:</td></tr><tr><td>Message: RequestStopTransactionResponse</td></tr><tr><td>- status must be Accepted</td></tr><tr><td>* Step 3:</td></tr><tr><td>Message: TransactionRequest</td></tr><tr><td>- triggerReason must be RemoteStop</td></tr><tr><td>* Step 5:</td></tr><tr><td>Message: TransactionRequest</td></tr><tr><td>- triggerReason must be ChargingStateChanged</td></tr><tr><td>- transactionInfo.chargingState must be EVConnected</td></tr><tr><td>If TxStopPoint contains Authorized or PowerPathClosed or EnergyTransfer</td></tr><tr><td>Then the last of the two TransactionRequest messages from step 3 and 5 needs to contain:</td></tr><tr><td>- eventType must be Ended</td></tr><tr><td>- transactionInfo.stoppedReason must be Remote</td></tr><tr><td>Else</td></tr><tr><td>Then both TransactionRequest messages need to contain:</td></tr><tr><td>- eventType must be Updated</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>State is StopAuthorized</td></tr></table>

New reusable state Deauthorized. This is not a change to the testcases It already existed on the background, but is now formally defined at part 6.

# 6.2.118. Deauthorized

<table><tr><td>State</td><td>Deauthorized</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>This reusable state will set the Charging Station to a state in which the transaction will be deauthorized.</td></tr><tr><td>Prerequisite</td><td>Reusable State Authorized is executed.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
Continues executing transaction reusable states in order until the first TransactionRequest is received based on the configured TxStartPoint.</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>1. The Charging Station sends a TransactionEventRequest</td><td>2. The Test System responds with a TransactionResponse With idTokenInfo.status is Invalid</td></tr><tr><td>3. The Charging Station sends a TransactionRequest Note(s): - Step 3 and 4 are relevant when AuthCtrl_STOPTxOnInvalidld is true</td><td>4. The Test System responds with a TransactionResponse</td></tr><tr><td>6. The Charging Station sends a UnlockConnectorResponse</td><td>5. The Test System sends a UnlockConnectorRequest Note(s): - Step 5 and 6 are executed when the connector is locked and the transaction gets deauthorized.</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:</td></tr><tr><td>Message: TransactionRequest</td></tr><tr><td>-idToken.idToken &lt;Configured valid_idtoken_idtoken&gt; AND</td></tr><tr><td>-idToken.type &lt;Configured valid_idtoken_type&gt;</td></tr><tr><td>* Step 3:</td></tr><tr><td>Message: TransactionRequest</td></tr><tr><td>-triggerReason must be Deauthorized</td></tr><tr><td>- transactionInfo.chargingState must be EVConnected or SuspendedEVSE</td></tr><tr><td>If TxStopPoint contains Authorized or PowerPathClosed or EnergyTransfer</td></tr><tr><td>Then :</td></tr><tr><td>-eventType must be Ended</td></tr><tr><td>- stoppedReason must be DeAuthorized</td></tr><tr><td>Else:</td></tr><tr><td>-eventType must be Updated</td></tr></table>

# 6.2.119. Page 566 - (2025-02) - Reusable state RenegotiateChargingLimits

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">[...]</td></tr><tr><td>7. The Charging Station sends a TransactionEventRequest</td><td>8. The Test System responds with a TransactionEventResponse</td></tr><tr><td colspan="2">Note: Steps 7 and 8 are optional, but can also repeat until chargingState is Charging.</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>[...]</td></tr><tr><td>* Step 5:</td></tr><tr><td>Message: NotifyEVChargingScheduleRequest)</td></tr><tr><td>- evseld &lt;Configured evseld&gt;</td></tr><tr><td>* Step 7:</td></tr><tr><td>Message: TransactionEventRequest</td></tr><tr><td>-triggerReason must be ChargingStateChanged</td></tr><tr><td>-transactionInfo.chargingState must be Charging -evseld &lt;Configured evseld&gt;</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>N/a</td></tr></table>

# 6.2.120. Page 573/151 - (2025-04) - Removed Main steps B from IdTokenCached reusable state and added IdTokenCached15118

The described steps at step B were incorrect and the originally intended split does not exist in any of the currently existing testcases.

In addition, a separate IdTokenCached15118 reusable state has been added for ISO 15118 sessions. The affected testcases are TC_C_54_CS and TC_C_55_CS.

IdTokenCached

<table><tr><td>State</td><td>IdTokenCached</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>An idToken is stored in the Authorization Cache of the Charging Station.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State ParkingBayoccupied</td></tr><tr><td colspan="2">2. Execute Reusable State Authorized</td></tr><tr><td colspan="2">Note(s): Step 3 and onwards are executed in case the idToken at step 2 was Accepted.</td></tr><tr><td colspan="2">3. Execute Reusable State EVConnectedPreSession</td></tr><tr><td colspan="2">4. Execute Reusable State EnergyTransferStarted</td></tr><tr><td colspan="2">5. Execute Reusable State StopAuthorized</td></tr><tr><td colspan="2">6. Execute Reusable State EVDisconnected</td></tr><tr><td colspan="2">7. Execute Reusable State ParkingBayUnoccupied</td></tr></table>

# Tool validations

N/a

# IdTokenCached15118

<table><tr><td>State</td><td>IdTokenCached15118</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>A 15118-idToken is stored in the Authorization Cache of the Charging Station.</td></tr></table>

# Before (Preparations)

Configuration State:

N/a

Memory State:

N/a

Reusable State(s):

N/a

# Main (Test scenario)

Charging Station CSMS

1. Execute Reusable State ParkingBayoccupied
2. Execute Reusable State EVConnectedPreSession
3. Execute Reusable State Authorized15118
4. Execute Reusable State EnergyTransferStarted
5. Execute Reusable State StopAuthorized (Remote)
6. Execute Reusable State EVDisconnected
7. Execute Reusable State ParkingBayUnoccupied

# Tool validations

N/a

<table><tr><td>Test case name</td><td>Authorization using Contract Certificates 15118 - Offline - ContractValidationOffline is true</td></tr><tr><td>Test case Id</td><td>TC_C_54_CS</td></tr><tr><td colspan="2">...</td></tr></table>

# Before (Preparations)

Configuration State:

···

Memory State:

CertificateInstalled for certificateType V2GRootCertificate

CertificateInstalled for certificateType MORootCertificate

RenewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificates.certificateType =

V2GCertificateChain)

IdTokenCached15118 for <Configured valid ISO 15118 IdToken> (If implemented)

IdTokenLocalAuthList for <Configured valid ISO 15118 IdToken> (If implemented)

Reusable State(s):

N/a

<table><tr><td>Test case name</td><td>Authorization using Contract Certificates 15118 - Offline - ContractValidationOffline is false</td></tr><tr><td>Test case Id</td><td>TC_C_55_CS</td></tr><tr><td colspan="2">...</td></tr><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:</td></tr><tr><td>...</td></tr><tr><td>Memory State:</td></tr><tr><td>CertificateInstalled for certificateType V2GRootCertificate</td></tr><tr><td>CertificateInstalled for certificateType MORootCertificate</td></tr><tr><td>RenewV2GChargingStationCertificate (If none are present, when checking with GetInstalledCertificatesCertificateType = V2GCertificateChain)</td></tr><tr><td>IdTokenCached15118 for &lt;Configured valid ISO 15118 IdToken&gt; (If implemented)</td></tr><tr><td>IdTokenLocalAuthList for &lt;Configured valid ISO 15118 IdToken&gt; (If implemented)</td></tr><tr><td>Reusable State(s):</td></tr><tr><td>N/a</td></tr></table>

# 6.2.121. Page 574 - (2025-04) - IdTokenLocalAuthList memory state - set Enable to true if implemented

<table><tr><td>State</td><td>IdTokenLocalAuthList</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>An valid idToken is stored in the Local Authorization List of the Charging Station.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:
LocalAuthListCtrl.Enabled is true (If implemented)</td></tr><tr><td>Memory State:
N/a</td></tr><tr><td>Reusable State(s):
N/a</td></tr></table>

# 6.2.122. Page 575 - (2024-09) - Reusable state RenewChargingStationCertificate expects a reconnection [784]

If a valid certificate is installed, then charging station must use it. This involves reconnecting to set up a new TLS with the new certificate. If the charging station does not do so automatically, then OCTT will force it by sending a Reset command.

<table><tr><td>State</td><td>RenewChargingStationCertificate</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>The ChargingStationCertificate is renewed using A02/A03</td></tr><tr><td colspan="2">…</td></tr></table>

<table><tr><td>State</td><td colspan="2">RenewChargingStationCertificate</td></tr><tr><td rowspan="7">Main(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The Charging Station responds with a TriggerMessageResponse</td><td>1. The OCTT sends a TriggerMessageRequest With requestedMessageSignChargingStationCertificate</td></tr><tr><td>3 The Charging Station sends a SignCertificateRequest</td><td>4. The OCTT responds with a SignCertificateResponseWith status Accepted</td></tr><tr><td>6. The Charging Station responds with a CertificateSignedResponse</td><td>5. The OCTT sends a CertificateSignedRequest With certificateChain &lt;Certificate generated from the received CSR from step 3 and signed by the provided CSMS Root certificate&gt; certificateType ChargingStationCertificate</td></tr><tr><td colspan="2">If the certificate is valid, then Charging Station should reconnect with the new certificate. OCTT waits some time for a reconnection, and if that does not occur, will send a Reset command to Charging Station to force a reconnection.</td></tr><tr><td>7. The Charging Station reconnects.</td><td></td></tr><tr><td>8. If the reconnect was forced by a Reset: The Charging Station sends a BootNotificationRequest</td><td>9. OCTT responds with a BootNotificationResponse.</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">* Step 2: 
Message: TriggerMessageResponse 
- status must be Accepted 
* Step 3: 
Message: SignCertificateRequest 
-csr must contain &lt;An CSR that meets the following requirements: When using RSA or DSA the key must be at least 2048 bits long. and when using elliptic curve cryptography the key must be at least 224 bits long. The received CSR must be transmitted as described in RFC 2986 and then encoded in Privacy-Enhanced Mail (PEM) format.&gt; 
* Step 6: 
Message: CertificateSignedResponse 
- status must be Accepted 
* Step 7: 
Charging Station must reconnect with new certificate.</td></tr><tr><td colspan="2">Post scenario validations: N/a</td></tr></table>

# 6.2.123. Page 575 - (2025-02) - Reusable state RenewChargingStationCertificate must not do a Reset [5281]

This memory state was sending a Reset when Charging Station was dropping the connection in time, but according to A02.FR.08 a Reset is not needed. It is enough to just close the websocket connection.

<table><tr><td>State</td><td>RenewChargingStationCertificate</td></tr><tr><td>System under test</td><td>Charging Station</td></tr><tr><td>Description</td><td>The ChargingStationCertificate is renewed using A02/A03</td></tr><tr><td colspan="2">…</td></tr></table>

<table><tr><td>State</td><td colspan="2">RenewChargingStationCertificate</td></tr><tr><td rowspan="6">Main (Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>6. The Charging Station responds with a CertificateSignedResponse</td><td>5. The OCTT sends a CertificateSignedRequest With certificateChain &lt;Certificate generated from the received CSR from step 3 and signed by the provided CSMS Root certificate&gt; certificateType ChargingStationCertificate</td></tr><tr><td colspan="2">If the certificate is valid, then Charging Station should reconnect with the new certificate. Test System waits some time for a reconnection, and if that does not occur, will drop the connection to force a reconnection.</td></tr><tr><td>7. The Charging Station reconnects.</td><td></td></tr><tr><td>8. If Charging Station rebooted: The Charging Station sends a BootNotificationRequest</td><td>9. Test System responds with a BootNotificationResponse.</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">...</td></tr><tr><td colspan="2">Post scenario validations: N/a</td></tr></table>

# 6.3. CSMS

# 6.3.1. Page 593 - (2025-04) - TC_A_11_CSMS - Added post scenario validation for clarification

Note: This erratum extends erratum: Page 593 - (2024-09) - TC_A_11_CSMS - Reconnect using new client certificate

<table><tr><td>Test case name</td><td>Update Charging Station Certificate by request of CSMS - Success - Charging Station Certificate</td></tr><tr><td>Test case Id</td><td>TC_A_11_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>N/a</td></tr><tr><td>Post scenario validations: 
The Test System and the CSMS are connected.</td></tr></table>

# 6.3.2. Page 593 - (2024-09) - TC_A_11_CSMS - Reconnect using new client certificate

Note: This erratum is extended by erratum: Page 593 - (2025-04) - TC_A_11_CSMS - Added post scenario validation for clarification

The testcase is missing steps to reconnect using the new client certificate.

<table><tr><td>Test case name</td><td>Update Charging Station Certificate by request of CSMS - Success - Charging Station Certificate</td></tr><tr><td>Test case Id</td><td>TC_A_11_CSMS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State RenewChargingStationCertificate</td></tr><tr><td>2. The OCTT disconnects its current connection and reconnects to the CSMS with the new certificate.</td><td>3. The CSMS accepts the incoming connection request using the new certificate.</td></tr></table>

# 6.3.3. Page 596 - (2024-09) - TC_A_14_CSMS - Update Charging Station Certificate by request of CSMS - Invalid certificate

SecurityEventNotification(InvalidChargingStationCertificate) has been added.

<table><tr><td>Test case name</td><td>Update Charging Station Certificate by request of CSMS - Invalid certificate</td></tr><tr><td>Test case Id</td><td>TC_A_14_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Test case name</td><td colspan="2">Update Charging Station Certificate by request of CSMS - Invalid certificate</td></tr><tr><td rowspan="5">Main (Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The OCTT responds with a TriggerMessageResponse With status Accepted</td><td>1. The CSMS sends a TriggerMessageRequest</td></tr><tr><td>3 The OCTT sends a SignCertificateRequest With csv &lt;Configured CSR&gt; certificateType ChargingStationCertificate</td><td>4. The CSMS responds with a SignCertificateResponse</td></tr><tr><td>6. The OCTT responds with a CertificateSignedResponse With status Rejected</td><td>5. The CSMS sends a CertificateSignedRequest</td></tr><tr><td>7. The OCTT sends a SecurityEventNotificationRequest with type = InvalidChargingStationCertificate</td><td>8. The CSMS responds with a SecurityEventNotificationResponse</td></tr><tr><td>Tool validations</td><td colspan="2">...</td></tr></table>

# 6.3.4. Page 597 - (2025-04) - TC_A_19_CSMS - Added main steps and clarified tool validations

Clarified the validation steps regarding how the CSMS rejects the connection and added reconnect at the end of the testcase, so it does not end without a connection.

<table><tr><td>Test case name</td><td>Upgrade Charging Station Security Profile - Accepted</td></tr><tr><td>Test case Id</td><td>TC_A_19_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Manual Action: Request the CSMS to set a new NetworkConnectionProfile with a security profile level one higher than currently configured</td></tr><tr><td>2. The Test System responds with a SetNetworkProfileResponse With status Accepted</td><td>1. The CSMS sends a SetNetworkProfileRequest</td></tr><tr><td colspan="2">Manual Action: Request the CSMS to change the NetworkConfigurationPriority to one that contains the configurationSlot of the new NetworkConnectionProfile from step 1</td></tr><tr><td>4. The Test System responds with a SetVariablesResponse with status Accepted</td><td>3. The CSMS sends a SetVariablesRequest</td></tr><tr><td colspan="2">Manual Action: Request the CSMS to reboot the Charging Station</td></tr><tr><td>6. The Test System responds with a ResetResponse with status Accepted</td><td>5. The CSMS sends a ResetRequest</td></tr><tr><td>7. The Test System reconnects to the CSMS using the new NetworkProfile, containing the upgraded security profile &lt;Configured securityProfile + 1&gt;.</td><td>8. The CSMS accepts the connection attempt.</td></tr><tr><td colspan="2">9. Execute Reusable State Booted</td></tr><tr><td>10. The Test System reconnects to the CSMS using the original NetworkProfile, containing the lower security profile. Note(s): - This is done to ensure that the CSMS does not accept a connection using the lower security profile anymore.</td><td>11. The CSMS shall not accept the connection attempt.</td></tr><tr><td>12. The Test System reconnects to the CSMS using the new NetworkProfile, containing the upgraded security profile</td><td></td></tr><tr><td>&lt;Configured securityProfile + 1&gt;.</td><td></td></tr><tr><td>Note(s):</td><td></td></tr><tr><td>- This is done to restore the connection before ending the testcase.</td><td></td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:</td></tr><tr><td>Message SetNetworkProfileRequest</td></tr><tr><td>- connectionData.messageTimeout &lt;Configured messageTimeout&gt;</td></tr><tr><td>- connectionData.ocpptInterface &lt;Configured ocpptInterface&gt;</td></tr><tr><td>- connectionData.ocppTransport JSON</td></tr><tr><td>- connectionData.ocppVersion OCPP20</td></tr><tr><td>- connectionData.securityProfile &lt;Configured securityProfile + 1&gt;</td></tr><tr><td>* Step 3:</td></tr><tr><td>Message SetVariablesRequest</td></tr><tr><td>setVariableData:</td></tr><tr><td>- variable.name = &quot;NetworkConfigurationPriority&quot;</td></tr><tr><td>- component.name = &quot;OCPPCommCtrl&quot;</td></tr><tr><td>- attributeValue = &lt;contains configurationSlot provided at step 1&gt;</td></tr><tr><td>* Step 11:</td></tr><tr><td>When upgrading a Charging Station to a higher security profile, a CSMS has several options regarding which endpoint to use. This affects the way the CSMS is able to detect it needs to reject the incoming connection attempt.</td></tr><tr><td>In case of having upgraded from security profile 2 to 3, but there is an incoming connection attempt using security profile 2:</td></tr><tr><td>When the same endpoint is used, then it depends on the CSMS endpoint configuration.</td></tr><tr><td>- When the CSMS does a full switch and only allows TLS handshakes when a client certificate is provided, then the TLS handshake is rejected.</td></tr><tr><td>- When the CSMS only requires this Charging Station to use a client certificate, then it accepts the TLS handshake (because it will be unable to detect which Charging Station is connecting) and it rejects the HTTP request to establish the WebSocket connection.</td></tr><tr><td>When a different port or a whole different endpoint is used for the upgrade, then on the original endpoint the CSMS accepts the TLS handshake and it rejects the HTTP request to establish the WebSocket connection (because this Charging Station is not allowed to connect with security profile 2 anymore).</td></tr><tr><td>In case of security profile 1, the case is always the same. The CSMS shall always reject the HTTP request to establish the WebSocket connection, because TLS is required for this Charging Station.</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>The Test System and the CSMS are connected.</td></tr></table>

# 6.3.5. Page 597 - (2024-09) - TC_A_19_CSMS - Added additional information regarding the use of the client certificates

Added additional information regarding the use of the client certificates.

<table><tr><td>Test case name</td><td>Upgrade Charging Station Security Profile - Accepted</td></tr><tr><td>Test case Id</td><td>TC_A_19_CSMS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
If configured &lt;Security profile&gt; is 2, then RenewChargingStationCertificate 
The OCTT uses this certificate during the TLS handshake when connecting with security profile 3.</td></tr><tr><td>Reusable State(s): 
N/a</td></tr></table>

# 6.3.6. Page 597 - (2024-09) - TC_A_19_CSMS - Removed validation of OcppCsmsUrl [O20-4355]

Validation of OcppCsmsUrl has been removed, because in some implementations the URL changes with the security profile.

<table><tr><td>Test case name</td><td colspan="2">Upgrade Charging Station Security Profile - Accepted</td></tr><tr><td>Test case Id</td><td colspan="2">TC_A_19_CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">* Step 1:
Message SetNetworkProfileRequest
- connectionData.messageTimeout &lt;Configured messageTimeout&gt;
- connectionData.ocppCsmsUrl &lt;Configured ocppCsmsUrl&gt;
- connectionData.ocpptInterface &lt;Configured ocpptInterface&gt;
- connectionData.ocppTransport JSON
- connectionData.ocppVersion OCPP20
- connectionData.securityProfile &lt;Configured securityProfile + 1&gt;
* Step 3:
Message SetVariablesRequest
setVariableData:
- variable.name = &quot;NetworkConfigurationPriority&quot;
- component.name = &quot;OCPPCommCtrlr&quot;
- attributeValue = &lt;contains configurationSlot provided at step 1&gt;</td></tr><tr><td colspan="2">Post scenario validations:
- N/a</td></tr></table>

# 6.3.7. Page 637 - (2024-11) - TC_C_50_CSMS - Changed reference to configured valid idToken to a specific eMAID idToken

For ISO 15118 plug & charge the Charging Station always needs to use an eMAID idToken, which equals the CN of the configured contract certificate.

<table><tr><td>Test case name</td><td>Authorization using Contract Certificates 15118 - Online - Local contract certificate validation - Accepted</td></tr><tr><td>Test case Id</td><td>TC_C_50_CSMS</td></tr><tr><td>Use case Id(s)</td><td>C07</td></tr><tr><td>Requirement(s)</td><td>C07.FR.04</td></tr><tr><td>System under test</td><td>CSMS</td></tr><tr><td>Description</td><td>The Charging Station is able to authorize with contract certificates when it supports ISO 15118.</td></tr><tr><td>Purpose</td><td>To verify if the CSMS is able to validate the certificate hash data and the provided eMAID.</td></tr><tr><td>Prerequisite(s)</td><td>- The configured eMAID is known by the CSMS as valid.
- The configured contract certificate is valid.
- The CN of the configured contract certificate equals the configured eMAID.
- iso15118CertificateHashData has a responder URL that points to an OCSP service for OCTT.
- CSMS does not have a cached OCSP response for the contract certificate.</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State(s): 
State is EVConnectedPreSession</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>1. The OCTT sends anauthorizeRequest With idToken.idToken &lt;Configured eMAID&gt; idToken.type eMAID iso15118CertificateHashData contains &lt;hashes from configured (V2G) certificate chain</td><td>...</td></tr><tr><td colspan="2">...</td></tr></table>

# 6.3.8. Page 639 - (2024-09) - TC_C_52_CSMS - TC does not use <Configured contract_certificate>

OCTT already has a keystore that contains the certificate. The pdf should not mention the <Configured contract_certificate> as the testcase does not use it

<table><tr><td>Test case name</td><td colspan="2">Authorization using Contract Certificates 15118 - Online - Central contract certificate validation - Accepted</td></tr><tr><td>Test case Id</td><td colspan="2">TC_C_52_CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td>Prerequisite(s)</td><td colspan="2">- The configured eMAID is known by the CSMS as valid.
- The configured contract certificate is signed by the configured V2GRoot or MORoot certificate at the CSMS.
- Contract certificate has a responder URL that points to an OCSP service for OCTT. - CSMS does not have a cached OCSP response for the contract certificate.</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main (Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>1. The OCTT sends an AuthorizationRequest With idToken.idToken &lt;Configured valid_idtoken_idtoken&gt;
idToken.type &lt;Configured valid_idtoken_type&gt;
iso15118CertificateHashData is absent certificate from keystore</td><td>2. The CSMS sends an OCSP request to responder URL of certificate to check validity</td></tr><tr><td colspan="3">...</td></tr></table>

# 6.3.9. Page 639 - (2025-02) - TC_C_52_CSMS - Certificate needs at least one subCA

<table><tr><td>Test case name</td><td>Authorization using Contract Certificates 15118 - Online - Central contract certificate validation - Accepted</td></tr><tr><td>Test case Id</td><td>TC_C_52_CSMS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>…</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 2:CSMS sends an OCSP request for certificate* Step 3:Test System checks that received request for certificate is valid AND key type = ECDSA AND certificate chain contains at least one subCA* Step 4: Message:authorizeResponse-idTokenInfo.status Accepted-certificateStatus Accepted* Step 6:Message:TransactionEventResponse-idTokenInfo.status Accepted</td></tr><tr><td>Post scenario validations:N/a</td></tr></table>

# 6.3.10. Page 640 - (2025-04) - TC_D_01_CSMS - Missing tool validation that the idTokenInfo must be provided for all list entries

<table><tr><td>Test case name</td><td>Send Local Authorization List - Full</td></tr><tr><td>Test case Id</td><td>TC_D_01_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:
Message SendLocalListRequest
- upgradeType Full
- versionNumber &lt;Bigger than 0&gt;
- localAuthorizationList &lt;Not empty&gt;
- localAuthorizationList[n].idTokenInfo &lt;Not empty&gt;</td></tr><tr><td>Post scenario validations:
- N/a</td></tr></table>

# 6.3.11. Page 712 - (2024-09) - TC_I_01_CSMS - Show EV Driver running total cost

<table><tr><td>Test case name</td><td>Show EV Driver running total cost during charging - costUpdatedRequest</td></tr><tr><td>Test case Id</td><td>TC_I_01_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Test case name</td><td colspan="2">Show EV Driver running total cost during charging - costUpdatedRequest</td></tr><tr><td rowspan="4">Main (Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td>7. The OCTT sends a TransactionEventRequest With triggerReason is MeterValuePeriodic eventType is Updated timestamp &lt;The intervals between the timestamps of the received Meter Value messages equals the configured sampled Meter Values interval&gt;.sampledValue.context is Sample.PeriodicNote(s):-- This step will be executed every_&lt;Configured sampled Meter Values interval&gt; - The OCTT will end the testcase after two MeterValues.</td><td>8. The CSMS responds with a TransactionEventResponse</td></tr><tr><td colspan="2">...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">...</td></tr><tr><td colspan="2">Post scenario validations: - N/a</td></tr></table>

# 6.3.12. Page 715 - (2025-02) - TC_I_02_CSMS - Added explicit information about CSMS tariff configuration and sending in needed metervalues

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State:
N/a</td></tr><tr><td>Memory State:
N/a - CSMS is configured with a tariff which is based on energy consumed.</td></tr><tr><td>Reusable State(s):
state is EVConnectedPostSession- N/a</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute Reusable State EVConnectedPreSession</td></tr><tr><td colspan="2">- The TransactionEventRequest contains the MeterValue field.</td></tr><tr><td colspan="2">- sampledValue[0].value 1000</td></tr><tr><td colspan="2">- sampledValue[0].context Transaction.Begin</td></tr><tr><td colspan="2">2. Execute Reusable State Authorized</td></tr><tr><td colspan="2">3. Execute Reusable State EnergyTransferStarted</td></tr><tr><td colspan="2">4. Execute Reusable State StopAuthorized</td></tr><tr><td colspan="2">5. Execute Reusable State EVConnectedPostSession</td></tr><tr><td>6. The Test System notifies the CSMS about the current state of the configured connector.</td><td rowspan="2">7. The CSMS responds accordingly.</td></tr><tr><td>Message: StatusNotificationRequest
- connectorStatus Available
Message: NotifyEventRequest
- trigger Delta
-actualValue "Available"
- component.name "Connector"
- variable.name "AvailabilityState"</td></tr><tr><td>8. The Test System sends a TransactionEventRequest with
- triggerReason EVCommunicationLost
- eventType Ended
- transactionInfo.chargingState Idle
- transactionInfo.stoppedReason EVDisconnected
- meterValue[0].sampledValue[0].value 6000
- meterValue[0].sampledValue[0].context Transaction.End</td><td>9. The CSMS responds with a TransactionResponse</td></tr></table>

# 6.3.13. Page 726-760 - (2025-04) - TC_K_XX_CSMS - Improved tool validations to be sure valid Charging Profiles are used

<table><tr><td>Test case name</td><td>Set Charging Profile - TxDefaultProfile - Specific EVSE</td></tr><tr><td>Test case Id</td><td>TC_K_01_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1: 
Message SetChargingProfileRequest 
evseld &lt;Configured evseld&gt; AND 
chargingProfile.stackLevel &lt;Configured stackLevel&gt; AND 
chargingProfile.chargingProfilePurpose TxDefaultProfile AND 
chargingProfile.chargingProfileKind Absolute AND 
chargingProfile.validFrom now AND 
chargingProfile.validTo now + &lt;Configured Charging Schedule Duration&gt; AND 
chargingProfile.chargingSchedule.startSchedule now AND 
chargingProfile.chargingSchedule.chargingRateUnit &lt;Configured chargingRateUnit&gt; AND 
chargingProfile.chargingSchedule.duration &lt;Configured duration&gt; AND 
chargingProfile.chargingSchedule.chargingSchedulePeriod.startPeriod 0 AND 
chargingProfile.chargingSchedule.chargingSchedulePeriod limit 6.0 or 6000.0 AND 
chargingProfile.chargingSchedule.chargingSchedulePeriod.numberPhases &lt;Configured numberPhases&gt; where &lt;Configured 
numberPhases&gt; not 3 OR 
chargingProfile.chargingSchedule.chargingSchedulePeriod.numberPhases &lt;Configured numberPhases&gt; or &lt;omit&gt; where 
&lt;Configured numberPhases&gt; 3</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Set Charging Profile - TxProfile without ongoing transaction on the specified EVSE</td></tr><tr><td>Test case Id</td><td>TC_K_02_CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td>Tool validations</td></tr><tr><td>* Step 1: 
Message SetChargingProfileRequest
- evseld &lt;Configured evseld&gt; AND 
- chargingProfile.chargingProfilePurpose TxProfile AND 
- chargingProfile.stackLevel &lt;Configured stackLevel&gt; AND 
- chargingProfile.chargingProfileKind Relative AND 
- chargingProfile.chargingSchedule.startSchedule must be omitted AND 
- chargingProfile.chargingSchedule.chargingRateUnit &lt;Configured chargingRateUnit&gt; AND 
- chargingProfile.chargingSchedule.chargingSchedulePeriod.startPeriod 0 AND 
- chargingProfile.chargingSchedule.chargingSchedulePeriodlimit 7.0 or 7000.0 AND 
- chargingProfile.chargingSchedule.chargingSchedulePeriod.numberPhases &lt;Configured numberPhases&gt; where &lt;Configured 
numberPhases&gt; not 3 OR 
- chargingProfile.chargingSchedule.chargingSchedulePeriod.numberPhases &lt;Configured numberPhases&gt; or &lt;omit&gt; where 
&lt;Configured numberPhases&gt; 3</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Replace charging profile - With chargingProfileld</td></tr><tr><td>Test case Id</td><td>TC_K_04_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:</td></tr><tr><td>Message SetChargingProfileRequest</td></tr><tr><td>chargingProfile.chargingSchedule.chargingSchedulePeriod.startPeriod 0 AND</td></tr><tr><td>chargingProfile.chargingSchedule.chargingSchedulePeriodlimit 8.0 (A) or 8000.0 (W)</td></tr><tr><td>The chargingSchedule contains only one chargingSchedulePeriod</td></tr><tr><td>* Step 3:</td></tr><tr><td>Message SetChargingProfileRequest</td></tr><tr><td>chargingProfile.chargingSchedule.chargingSchedulePeriod.startPeriod 0 AND</td></tr><tr><td>chargingProfile.chargingSchedule.chargingSchedulePeriodlimit 6.0 (A) or 6000.0 (W)</td></tr><tr><td>The chargingSchedule contains only one chargingSchedulePeriod</td></tr><tr><td>* Step 1/3:</td></tr><tr><td>Message SetChargingProfileRequest</td></tr><tr><td>chargingProfile.id &lt;Same id for both chargingProfiles&gt;</td></tr><tr><td>chargingProfile.chargingSchedule.startSchedule must NOT be omitted.</td></tr><tr><td>chargingProfile.stackLevel &lt;Configured stackLevel&gt; AND</td></tr><tr><td>chargingProfile.chargingProfilePurpose &lt;Equal value for both profiles&gt; AND (TxDefaultProfile OR ChargingStationMaxProfile)</td></tr><tr><td>chargingProfile.chargingProfileKind &lt;Equal value for both profiles&gt; AND</td></tr><tr><td>If chargingProfile.chargingProfilePurpose is TxDefaultProfile then chargingProfile.chargingProfileKind must be Absolute OR</td></tr><tr><td>Recurring</td></tr><tr><td>If chargingProfile.chargingProfilePurpose is ChargingStationMaxProfile then chargingProfile.chargingProfileKind must be</td></tr><tr><td>Absolute</td></tr><tr><td>If chargingProfile.chargingProfileKind is Recurring then chargingProfile.recurrencyKind must NOT be omitted, else omitted</td></tr><tr><td>The received Charging Profiles must comply with the requirements defined at part 2 specification.</td></tr><tr><td>Post scenario validations: - N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Clear Charging Profile - With chargingProfileId</td></tr><tr><td>Test case Id</td><td>TC_K_05_CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td>Tool validations</td></tr><tr><td>* Step 1:
Message ClearChargingProfileRequest
chargingProfileId &lt;Generated chargingProfileId&gt; AND
chargingProfileCriteria omit</td></tr><tr><td>Post scenario validations:
- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Clear Charging Profile - With stackLevel/purpose combination for one profile</td></tr><tr><td>Test case Id</td><td>TC_K_06_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:
Message ClearChargingProfileRequest
chargingProfileCriteria.chargingProfilePurpose TxDefaultProfile AND
chargingProfileCriteria.stackLevel &lt;Configured stackLevel&gt; AND
chargingProfileCriteria.evseld &lt;Configured evseld&gt; AND
chargingProfileId must be omitted.</td></tr><tr><td>Post scenario validations:
- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Clear Charging Profile - Without previous charging profile</td></tr><tr><td>Test case Id</td><td>TC_K_08_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:
Message ClearChargingProfileRequest
chargingProfileCriteria. chargingProfilePurpose TxDefaultProfile AND
chargingProfileCriteria. stackLevel &lt;Configured stackLevel&gt; AND
chargingProfileCriteria. evseld &lt;Configured evseld&gt; AND
chargingProfileId must be omitted.</td></tr><tr><td>Post scenario validations:
- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Set Charging Profile - Not Supported</td></tr><tr><td>Test case Id</td><td>TC_K_15_CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td>Tool validations</td></tr><tr><td>* Step 1:</td></tr><tr><td>Message SetChargingProfileRequest</td></tr><tr><td>evseld &lt;Configured evseld&gt; AND</td></tr><tr><td>chargingProfile.stackLevel &lt;Configured stackLevel&gt; AND</td></tr><tr><td>chargingProfile.chargingProfilePurpose TxDefaultProfile AND</td></tr><tr><td>chargingProfile.chargingProfileKind Absolute AND</td></tr><tr><td>chargingProfile.chargingSchedule.startSchedule &lt;Not omitted&gt; AND</td></tr><tr><td>chargingProfile.chargingSchedule.chargingRateUnit &lt;Configured ChargingRateUnit&gt; AND</td></tr><tr><td>chargingProfile.chargingSchedule.chargingSchedulePeriod.startPeriod 0 AND</td></tr><tr><td>chargingProfile.chargingSchedule.duration &lt;Configured duration&gt;</td></tr><tr><td>chargingProfile.chargingSchedule.chargingSchedulePeriod limit 6.0 or 6000.0 AND</td></tr><tr><td>chargingProfile.chargingSchedule.chargingSchedulePeriod.numberPhases &lt;Configured numberPhases&gt; where &lt;Configured</td></tr><tr><td>numberPhases&gt; not 3 OR</td></tr><tr><td>chargingProfile.chargingSchedule.chargingSchedulePeriod.numberPhases &lt;Configured numberPhases&gt; or &lt;omit&gt; where</td></tr><tr><td>&lt;Configured numberPhases&gt; 3 +</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Get Charging Profile - Evseld 0</td></tr><tr><td>Test case Id</td><td>TC_K_29_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1: 
Message GetChargingProfilesRequest
- evseld 0 AND 
- chargingProfile.chargingProfilePurpose &lt;Configured chargingProfilePurpose&gt; AND 
Note : chargingProfilePurpose is included, because the chargingProfile field is required and may not be left empty. 
- chargingProfile.stackLevel must be omitted AND 
- chargingProfile.chargingLimitSource must be omitted AND 
- chargingProfile.chargingProfileId must be omitted</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Get Charging Profile - Evseld &gt; 0</td></tr><tr><td>Test case Id</td><td>TC_K_30_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1: 
Message GetChargingProfilesRequest
- evseld &lt;Configured evseld&gt; AND
- chargingProfile.chargingProfilePurpose &lt;Configured chargingProfilePurpose&gt; AND
Note : chargingProfilePurpose is included, because the chargingProfile field is required and may not be left empty.
- chargingProfile.stackLevel must be omitted AND
- chargingProfile.chargingLimitSource must be omitted AND
- chargingProfile.chargingProfileId must be omitted</td></tr><tr><td>Post scenario validations:
- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Get Charging Profile - No Evseld</td></tr><tr><td>Test case Id</td><td>TC_K_31_CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td>Tool validations</td></tr><tr><td>* Step 1: 
Message GetChargingProfilesRequest
- evseld must be omitted AND
- chargingProfile.chargingProfilePurpose &lt;Configured chargingProfilePurpose&gt; AND
Note : chargingProfilePurpose is included, because the chargingProfile field is required and may not be left empty.
- chargingProfile.stackLevel must be omitted AND
- chargingProfile.chargingLimitSource must be omitted AND
- chargingProfile.chargingProfileld must be omitted</td></tr><tr><td>Post scenario validations:
- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Get Charging Profile - chargingProfileId</td></tr><tr><td>Test case Id</td><td>TC_K_32_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:
Message GetChargingProfilesRequest
- evseld must be omitted AND
- chargingProfile.chargingProfilePurpose must be omitted AND
- chargingProfile.stackLevel must be omitted AND
- chargingProfile.chargingLimitSource must be omitted AND
- chargingProfile.chargingProfileId &lt;received chargingProfileId&gt;</td></tr><tr><td>Post scenario validations:
- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Get Charging Profile - Evseld &gt; 0 + stackLevel</td></tr><tr><td>Test case Id</td><td>TC_K_33_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1: 
Message GetChargingProfilesRequest
- evseld &lt;Configured evseld&gt; AND
- chargingProfile.stackLevel &lt;Configured stackLevel&gt; AND
- chargingProfile.chargingProfilePurpose must be omitted AND
- chargingProfile.chargingLimitSource must be omitted AND
- chargingProfile.chargingProfileld must be omitted</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Get Charging Profile - Evseld &gt; 0 + chargingLimitSource</td></tr><tr><td>Test case Id</td><td>TC_K_34_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1: 
Message GetChargingProfilesRequest
- evseld &lt;Configured evseld&gt; AND
- chargingProfile.chargingLimitSource &lt;Configured chargingLimitSource&gt; AND
- chargingProfile.stackLevel must be omitted AND
- chargingProfile.chargingProfilePurpose must be omitted AND
- chargingProfile.chargingProfileId must be omitted</td></tr></table>

# Tool validations

# Post scenario validations:

-N/a

<table><tr><td>Test case name</td><td>Get Charging Profile - Evseld &gt; 0 + chargingProfilePurpose</td></tr><tr><td>Test case Id</td><td>TC_K_35_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

# Tool validations

- Step 1:  
  Message GetChargingProfilesRequest

* evseld<Configured evseld> AND
* chargingProfile.chargingProfilePurpose <Configured chargingProfilePurpose> AND
* chargingProfile.stackLevel must be omitted AND
* chargingProfile.chargingLimitSource must be omitted AND
* chargingProfile.chargingProfileId must be omitted

Post scenario validations:

-N/a

<table><tr><td>Test case name</td><td>Get Charging Profile - Evseld &gt; 0 + chargingProfilePurpose + stackLevel</td></tr><tr><td>Test case Id</td><td>TC_K_36_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

# Tool validations

- Step 1:  
  Message GetChargingProfilesRequest

* evseld<Configured evseld> AND  
  -chargingProfile.chargingProfilePurpose <Configured chargingProfilePurpose> AND
* chargingProfile.chargingLimitSource must be omitted AND
* chargingProfile.stackLevel <Configured stackLevel> AND
* chargingProfile.chargingProfileId must be omitted

Post scenario validations:

-N/a

<table><tr><td>Test case name</td><td>Set Charging Profile - TxProfile with ongoing transaction on the specified EVSE</td></tr><tr><td>Test case Id</td><td>TC_K_60_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

# Tool validations

- Step 1:

(Message: SetChargingProfileRequest)

chargingProfile.chargingProfilePurpose is TxProfile AND

chargingProfile.evseld is <Configured evseld> AND

chargingProfile transactionld <Generated transactionId> AND

chargingProfile.chargingProfileKind is Relative OR Absolute

If chargingProfileKind is Relative then chargingSchedule.startSchedule must be omitted.

If chargingProfileKind is Absolute then chargingSchedule.startSchedule must NOT be omitted.

The received Charging Profile must comply with the requirements defined at part 2 specification.

Post scenario validations:

N/a

<table><tr><td>Test case name</td><td>Remote start transaction with charging profile - Success</td></tr><tr><td>Test case Id</td><td>TC_K_37_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:</td></tr><tr><td>Message: RequestStartTransactionRequest</td></tr><tr><td>idToken.idToken &lt;Configured valid idToken&gt;</td></tr><tr><td>idToken.type &lt;Configured valid idToken type&gt;</td></tr><tr><td>evseld &lt;Configured evseld&gt;</td></tr><tr><td>chargingProfile contains:</td></tr><tr><td>chargingProfile.chargingProfilePurpose is TxProfile</td></tr><tr><td>chargingProfile transactionId is omitted</td></tr><tr><td>chargingProfile.chargingProfileKind is Relative OR Absolute</td></tr><tr><td>If chargingProfileKind is Relative then chargingSchedule.startSchedule must be omitted.</td></tr><tr><td>If chargingProfileKind is Absolute then chargingSchedule.startSchedule must NOT be omitted.</td></tr><tr><td>The received Charging Profile must comply with the requirements defined at part 2 specification.</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>N/a</td></tr></table>

<table><tr><td>Test case name</td><td>Set Charging Profile - Multiple Profiles</td></tr><tr><td>Test case Id</td><td>TC_K_70_CSMS</td></tr><tr><td>Use case Id(s)</td><td>n/a</td></tr><tr><td>Requirement(s)</td><td>n/a</td></tr><tr><td>System under test</td><td>CSMS</td></tr><tr><td>Description</td><td>To enable the CSMS to influence the charging power or current drawn from a specific EVSE or the entire Charging Station over a period of time. The CSMS sends a SetChargingProfileRequest to the Charging Station to influence the power or current drawn by EVs. The CSMS calculates a ChargingSchedule to stay within certain limits, which MAY be imposed by any external system.</td></tr><tr><td>Purpose</td><td>To verify if the CSMS is able to set multiple Charging Profiles.</td></tr><tr><td>Prerequisite(s)</td><td>n/a</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:</td></tr><tr><td>Message SetChargingProfileRequest</td></tr><tr><td>chargingProfile.chargingProfilePurpose TxDefaultProfile</td></tr><tr><td>chargingProfile.chargingProfileKind is Absolute OR Recurring</td></tr><tr><td>chargingProfile.chargingSchedule.startSchedule must NOT be omitted.</td></tr><tr><td>If chargingProfile.chargingProfileKind is Recurring then chargingProfile.recurrencyKind must NOT be omitted.</td></tr><tr><td>* Step 3:</td></tr><tr><td>Message SetChargingProfileRequest</td></tr><tr><td>chargingProfile.id &lt;different id from chargingProfile at step 1&gt;</td></tr><tr><td>chargingProfile.chargingProfilePurpose ChargingStationMaxProfile</td></tr><tr><td>chargingProfile.chargingProfileKind is Absolute</td></tr><tr><td>chargingProfile.chargingSchedule.startSchedule must NOT be omitted.</td></tr><tr><td>The received Charging Profiles must comply with the requirements defined at part 2 specification.</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>- N/a</td></tr></table>

# 6.3.14. Page 728 - (2024-09) - TC_K_03_CSMS - Not requiring validFrom/To fields in charging profile [O20-4592] and chargingProfileKind must be Absolute [O20-4591]

<table><tr><td>Test case name</td><td colspan="2">Set Charging Profile - ChargingStationMaxProfile</td></tr><tr><td>Test case Id</td><td colspan="2">TC_K_03_CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">* Step 1:
Message SetChargingProfileRequest
evseld 0 AND
chargingProfile.stackLevel &lt;Configured stackLevel&gt; AND
chargingProfile.chargingProfilePurpose ChargingStationMaxProfile_ AND
chargingProfile.chargingProfileKind Absolute OR Relative
chargingProfile.chargingSchedule.chargingRateUnit &lt;Configured ChargingRateUnit&gt;
chargingProfile.chargingSchedule.duration &lt;Configured duration&gt;
chargingProfile.chargingSchedule.chargingSchedulePeriod.startPeriod 0
chargingProfile.chargingSchedule.chargingSchedulePeriod limit 8.0 or 8000.0
chargingProfile.chargingSchedule.chargingSchedulePeriod.numberPhases &lt;Configured numberPhases&gt;
where &lt;Configured numberPhases&gt; not 3 OR
chargingProfile.chargingSchedule.chargingSchedulePeriod.numberPhases &lt;Configured numberPhases&gt;
or &lt;omit&gt; where &lt;Configured numberPhases&gt; 3
chargingProfile.validFrom &lt;Not omitted&gt;
chargingProfile.validTo &lt;Not omitted&gt;
chargingProfile.chargingSchedule.startSchedule &lt;Not omitted&gt;</td></tr><tr><td colspan="2">Post scenario validations:
- N/a</td></tr></table>

# 6.3.15. Page 733 - (2024-09) - TC_K_10_CSMS - Not requiring validFrom/To fields in charging profile [O20-4592]

<table><tr><td>Test case name</td><td colspan="2">Set Charging Profile - TxDefaultProfile - All EVSE</td></tr><tr><td>Test case Id</td><td colspan="2">TC_K_10_CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td>Test case name</td><td>Set Charging Profile - TxDefaultProfile - All EVSE</td></tr><tr><td rowspan="2">Tool validations</td><td>* Step 1: 
Message SetChargingProfileRequest 
evseld 0 AND 
chargingProfile.stackLevel &lt;Configured stackLevel&gt; AND 
chargingProfile.chargingProfilePurpose TxDefaultProfile AND 
chargingProfile.chargingProfileKind Absolute AND 
chargingProfile.validFrom &lt;Not omitted&gt; AND 
chargingProfile.validTo &lt;Not omitted&gt; AND 
chargingProfile.chargingSchedule.startSchedule &lt;Not omitted&gt; AND 
chargingProfile.chargingSchedule.chargingRateUnit &lt;Configured ChargingRateUnit&gt; AND 
chargingProfile.chargingSchedule.chargingSchedulePeriod.startPeriod 0 AND 
chargingProfile.chargingSchedule.duration &lt;Configured duration&gt; 
chargingProfile.chargingSchedule.chargingSchedulePeriod limit 6.0 or 6000.0 AND 
chargingProfile.chargingSchedule.chargingSchedulePeriod.numberPhases &lt;Configured numberPhases&gt; 
where &lt;Configured numberPhases&gt; not 3 OR 
chargingProfile.chargingSchedule.chargingSchedulePeriod.numberPhases &lt;Configured numberPhases&gt; 
or &lt;omit&gt; where &lt;Configured numberPhases&gt; 3</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

# 6.3.16. Page 734 - (2024-09) - TC_K_15_CSMS - Not requiring validFrom/To fields in charging profile [O20-4592]

<table><tr><td>Test case name</td><td colspan="2">Set Charging Profile - Not Supported</td></tr><tr><td>Test case Id</td><td colspan="2">TC_K_15_CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The OCTT responds with RPC Framework: 
CALLERROR: NotSupported.</td><td>1. The CSMS sends a SetChargingProfileRequest with:
evseld &lt;Configured evseld&gt; AND 
chargingProfile.stackLevel &lt;Configured stackLevel&gt; 
AND 
chargingProfile.chargingProfilePurpose 
TxDefaultProfile AND 
chargingProfile.chargingProfileKind Absolute AND 
chargingProfile.validFrom &lt;Not omitted&gt; AND 
chargingProfile.validTo &lt;Not omitted&gt; AND 
chargingProfile.chargingSchedule.startSchedule 
&lt;Not omitted&gt; AND 
chargingProfile.chargingSchedule.chargingRateUnit 
&lt;Configured ChargingRateUnit&gt; AND 
chargingProfile.chargingSchedule.chargingSchedul ePeriod.startPeriod 0 AND 
chargingProfile.chargingSchedule.duration 
&lt;Configured duration&gt; 
chargingProfile.chargingSchedule.chargingSchedul ePeriod limit 6.0 or 6000.0 AND 
chargingProfile.chargingSchedule.chargingSchedul ePeriod.numberPhases &lt;Configured numberPhases&gt;</td></tr><tr><td>Tool validations</td><td colspan="2">...</td></tr></table>

# 6.3.17. Page 752 - (2025-06) - TC_K_53_CSMS - Validate that the CSMS let's the Charging Station charging, according to the negotiated limits

<table><tr><td>Test case name</td><td>Charging with load leveling based on High Level Communication - Success</td></tr><tr><td>Test case Id</td><td>TC_K_53_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">1. Execute reusable state ISO15118SmartCharging</td></tr><tr><td colspan="2">2. The CSMS does NOT send a SetChargingProfileRequest
Note(s):
- The CSMS must NOT initiate a renegotiate after starting the transaction, without cause. For example; a smart charging algorithm or an external trigger, etc.</td></tr></table>

# 6.3.18. Page 753 - (2024-09) - TC_K_55_CSMS, TC_K_57_CSMS, TC_K_58_CSMS, TC_K_59_CSMS Removed triggerReason = ChargingRateChanged [776]

A trigger reason ChargingStateChange must only be sent, when an external actor (not CSMS) changes the charging rate. Therefore, removed the sending of a triggerReason=ChargingStateChanged by OCTT. This does not affect tool validations, but it was incorrect behavior of OCTT.

The step that sends a TransactionEventRequest with triggerReason=ChargingRateChanged has been removed from:

- TC_K_55_CSMS
- TC_K_57_CSMS
- TC_K_58_CSMS
- TC_K_59_CSMS

# 6.3.19. Page 760 - (2024-11) - TC_K_70_CSMS - Updated tool validation chargingProfiles and added preparation step.

We require a CSMS to install multiple ChargingProfiles with the same purpose and for the same connectorld with a different stackLevel. However there are CSMSs that do the stacking themselves and are unable to do this. Therefore it was decided to use different purposes instead.

<table><tr><td>Test case name</td><td colspan="2">Set Charging Profile - Multiple Profiles</td></tr><tr><td>Test case Id</td><td colspan="2">TC_K_70_CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="2">Before
(Preparations)</td><td colspan="2">...</td></tr><tr><td colspan="2">Charging State:
State is EnergyTransferStarted</td></tr><tr><td rowspan="3">Main
(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>2. The OCTT responds with a
SetChargingProfileResponse with
status Accepted</td><td>1. The CSMS sends a SetChargingProfileRequest
with
chargingProfilePurpose TxDefaultProfile</td></tr><tr><td>4. The OCTT responds with a
SetChargingProfileResponse with
status Accepted</td><td>3. The CSMS sends a SetChargingProfileRequest
with
chargingProfilePurpose ChargingStationMaxProfile</td></tr><tr><td>Test case name</td><td>Set Charging Profile - Multiple Profiles</td></tr><tr><td rowspan="2">Tool validations</td><td>* Step 1: 
Message SetChargingProfileRequest 
chargingProfile.chargingProfilePurpose TxDefaultProfile 
* Step 3: 
Message SetChargingProfileRequest 
chargingProfile.id &lt;different id for both chargingProfiles&gt; 
chargingProfile.chargingProfilePurpose ChargingStationMaxProfile</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

# 6.3.20. Page 805/806 - (2025-06) - TC_N_01_CSMS & TC_N_02_CSMS - omit filter fields that are not tested

These testcases specifically test the use of the different uses of the fields that are used to filter the result. monitoringCriteria in case of TC_N_01_CSMS and componentVariable in case of TC_N_02_CSMS. The fields that are not part of the testcase need to be omitted.

<table><tr><td>Test case name</td><td>Get Monitoring Report - with monitoringCriteria</td></tr><tr><td>Test case Id</td><td>TC_N_01_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:
Message: GetMonitoringReportRequest
- monitoringCriteria = DeltaMonitoring
- componentVariable is omitted.</td></tr><tr><td>* Step 3:
Message: GetMonitoringReportRequest
- monitoringCriteria = ThresholdMonitoring
- componentVariable is omitted.</td></tr><tr><td>Post scenario validations:
Check that CSMS shows the Threshold monitors.</td></tr></table>

<table><tr><td>Test case name</td><td>Get Monitoring Report - with component/variable</td></tr><tr><td>Test case Id</td><td>TC_N_02_CSMS</td></tr><tr><td colspan="2">...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:
Message: GetMonitoringReportRequest
- componentVariable[0].component.name = &quot;ChargingStation&quot;
- componentVariable[0].variable.name = &quot;Power&quot;
- monitoringCriteria is omitted.</td></tr><tr><td>* Step 3:
Message: GetMonitoringReportRequest
- componentVariable[1].component.name = &quot;EVSE&quot;
- componentVariable[1].component.evse.id = 1
- componentVariable[1].variable.name = &quot;AvailabilityState&quot;
- monitoringCriteria is omitted.</td></tr><tr><td>Post scenario validations:
Check that CSMS shows the monitor for AvailabilityState for EVSE #1.</td></tr></table>

# 6.3.21. Page 806 - (2025-06) - TC_N_02_CSMS - component and variable instance need to be omitted

The testcase specifically requests two component variables that do not have an instance.

<table><tr><td>Test case name</td><td>Get Monitoring Report - with component/variable</td></tr><tr><td>Test case Id</td><td>TC_N_02_CSMS</td></tr><tr><td colspan="2">...</td></tr><tr><td colspan="2">Tool validations</td></tr><tr><td colspan="2">* Step 1: 
Message: GetMonitoringReportRequest 
- componentVariable[0].component.name = &quot;ChargingStation&quot; 
- componentVariable[0].component.instance is omitted. 
- componentVariable[0].variable.name = &quot;Power&quot; 
- componentVariable[0].variable.instance is omitted. 
- monitoringCriteria is omitted.</td></tr><tr><td colspan="2">* Step 3: 
Message: GetMonitoringReportRequest 
- componentVariable[1].component.name = &quot;EVSE&quot; 
- componentVariable[1].component.instance is omitted. 
- componentVariable[1].component.evse.id = 1 
- componentVariable[1].component.name = &quot;AvailabilityState&quot; 
- componentVariable[1].variable.instance is omitted. 
- monitoringCriteria is omitted.</td></tr><tr><td colspan="2">Post scenario validations: 
Check that CSMS shows the monitor for AvailabilityState for EVSE #1.</td></tr></table>

# 6.3.22. Page 824 - (2025-04) - TC_N_62_CSMS - Check only single identifier is provided

Added validation that Token and customerCertificate are omitted.

TC_N_62_CSMS: Clear Customer Information - Clear and report - customerIdentifier

<table><tr><td>Test case name</td><td>Clear Customer Information - Clear and report - customerIdentifier</td></tr><tr><td>Test case Id</td><td>TC_N_62_CSMS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Before (Preparations)</td></tr><tr><td>..</td></tr></table>

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:
Message CustomerInformationRequest
- report true
- clear true
- customerIdentifier "OpenChargeAlliance"
- idToken is omitted
- customerCertificate is omitted</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

# 6.3.23. Page 830 - (2024-11) - TC_N_46_CSMS - Updated tool validation sendLocalListRequest

<table><tr><td>Test case name</td><td colspan="2">Clear Customer Information - Update Local Authorization List</td></tr><tr><td>Test case Id</td><td colspan="2">TC_N_46_CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="3">Before(Preparations)</td><td colspan="2">...</td></tr><tr><td colspan="2">Memory State:A local authorization list with &lt;Configured valid_idtoken_idtoken&gt; is configured.</td></tr><tr><td colspan="2">...</td></tr><tr><td rowspan="2">Main(Test scenario)</td><td>Charging Station</td><td>CSMS</td></tr><tr><td>...</td><td>...</td></tr><tr><td rowspan="2">Tool validations</td><td colspan="2">* Step 1:Message CustomerInformationRequest- report true AND- clear true AND-idToken.idToken &lt;Configured valid_idtoken_idtoken&gt;- idToken.type &lt;Configured valid_idtoken_type&gt;* Step 5:Message SendLocalListRequest-updateType Differential-versionNumber &lt;Bigger than currently configured in OCTT&gt;- localAuthorizationList &lt;Contains only the configured valid_idtoken_idtoken, without idTokenInfo&gt;OR:updateType Full- localAuthorizationList &lt;Does NOT contain configured valid_idtoken_idtoken&gt;</td></tr><tr><td colspan="2">Post scenario validations:- N/a</td></tr></table>

# 6.3.24. Page 830 - (2025-02) - TC_N_46_CSMS - Aligning configuration variable usage

<table><tr><td colspan="2">Main (Test scenario)</td></tr><tr><td>Charging Station</td><td>CSMS</td></tr><tr><td colspan="2">Manual action: Trigger CSMS to CustomerInformationRequest to both report and clear token &lt;Configured valid_idtoken_idtoken&gt; and &lt;Configured valid_idtoken_type&gt;</td></tr><tr><td>2. The Test System responds with a CustomerInformationResponse with status Accepted</td><td>1. The CSMS sends a CustomerInformationRequest</td></tr><tr><td>3. The Test System sends a NotifyCustomerInformationRequest</td><td>4. The CSMS responds with a NotifyCustomerInformationResponse .</td></tr><tr><td colspan="2">Manual action: If not triggered automatically, trigger CSMS to send SendLocalListRequest with version = &lt;configured local list version&gt; + 1 and updateType = Differential and localAuthorizationList = {{idToken = {&lt;Configured valid_idtoken&gt;, &lt;Configured valid_idtoken_type&gt;} }}</td></tr><tr><td>6 The Test System responds with a SendLocalListResponse with status Accepted</td><td>5. The CSMS sends a SendLocalListRequest</td></tr><tr><td colspan="2">Note(s): If the Local Authorization List is too big for one message, step 5 and 6 will be repeated</td></tr></table>

# Tool validations

- Step 1:

Message CustomerInformationRequest

-report true AND

- clear true AND  
  -idToken.idToken<Configuredvalid_idtoken_idtoken>  
  -idToken.type<Configured valid_idtoken_type>  
  \* Step 5:

Message SendLocalListRequest

-updateType Differential  
-versionNumber<configured local list version> + 1

- localAuthorizationList <Contains only the configured valid_idtoken_idtoken, without idTokenInfo>

- localAuthorizationList[0].idToken contains <configured_valid_idtoken_idtoken> and <configured valid_idtoken_type>

- localAuthorizationList[0].idTokenInfo <omitted>

Post scenario validations:

- All messages have been received

# 6.3.25. Page 854 - (2025-02) - TC_O_27_CSMS - Fixing validations to be more specific for test case

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1: 
Message SetDisplayMessageRequest
- message.id &lt;GeneratedId&gt; 
- message.startDateTime &lt;Configured startDateTime&gt; 
- message_transactionld is present
- message.state is &lt;omitted&gt; 
- message.startDateTime is &lt;Configured startDateTime&gt; 
- message.endDateTime is &lt;omitted&gt; 
- message.transactionld is &lt;Generated transactionld from Before&gt;</td></tr><tr><td>Post scenario validations: 
- N/a</td></tr></table>

# 6.3.26. Page 855 - (2025-02) - TC_O_28_CSMS - Fixing validations to be more specific for test case

A test case needs to start in Preparations phase:

<table><tr><td>Before (Preparations)</td></tr><tr><td>Configuration State: 
N/a</td></tr><tr><td>Memory State: 
N/a</td></tr><tr><td>Reusable State: 
State is EnergyTransferStarted</td></tr></table>

<table><tr><td>Tool validations</td></tr><tr><td>* Step 1:</td></tr><tr><td>Message SetDisplayMessageRequest</td></tr><tr><td>-message.id &lt;GeneratedId&gt;</td></tr><tr><td>-messagepriority &lt;ConfiguredPriority&gt;</td></tr><tr><td>-message.endDateTime &lt;Configured endDateTime&gt;</td></tr><tr><td>-message.state &lt;Configured State&gt;</td></tr><tr><td>-message_transactionld is present</td></tr><tr><td>- message.state is &lt;omitted&gt;</td></tr><tr><td>- message.startDateTime is &lt;omitted&gt;</td></tr><tr><td>- message.endDateTime is &lt;Configured endDateTime&gt;</td></tr><tr><td>- message.transactionld is &lt;Generated transactionld from Before&gt;</td></tr><tr><td>Post scenario validations:</td></tr><tr><td>- N/a</td></tr></table>
