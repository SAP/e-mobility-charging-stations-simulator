# OCPP

OCPP 2.1 Edition 1

Errata 2025-09

# Table of Contents

Disclaimer 1  
Scope 2  
Terminology and Conventions 2  
0. Part 0 3

1. Part 1 4
2. Part 2 5  
   2.1. Page 65-(2025-09)-B07.FR.15 has been deleted [1007]. 5  
   2.2. Page 70-(2025-09)-B09.FR.02/04/05-Added optionalreasonCode 5  
   2.3. Page 71 - (2025-09) - B09.FR.22/26/27/28 - Improved definitions 5  
   2.4. Page 71 - (2025-09) - B09.FR.31/32 - Improved definition  
   2.5. Page 71 - (2025-09) - B09.FR.33/34/35 - Added requirements to validate NetworkConfiguration  
   2.6. Page 74 - (2025-06) - B10.FR.03/04/10 - Migrate to new NetworkConnectionProfile 8  
   2.7. Page 75 - (2025-06) - B11 - Clarify meaning of Onldle for Reset  
   2.8. Page 189-(2025-06)-E06.FR.05 for DataSigned as TxStopPoint is invalid 9  
   2.9. Page 193 - (2025-09) - E07.FR.07 - Improved precondition.. 9  
   2.10. Page 219 - (2025-06) - E17.FR.01 Clarification of transaction state to store 9  
   2.11. Page 240 - (2025-06) - F06 Requirement for CSMS to support customTrigger [896] 10  
   2.12. Page 260 - (2025-06) - H02 - Added missing requirements 10  
   2.13. Page 290 - (2025-09) - I08.FR.31 is a duplicate requirement number [1042] 11  
   2.14. Page 297 - (2025-09) - I12.FR.02 fails to mention that chargingPeriods are not sent for running cost updates [1048] . . . 12  
   2.15. Page 354-(2025-06)-Updated remark of K11 12  
   2.16. Page 327 - (2025-06) - Updated note of K01.FR.05 13  
   2.17. Page 327 - (2025-06) - Add cross-references to K01.FR.06 and K01.FR.39 13  
   2.18. Page 331-(2025-06)-K01.FR.50 requirement is a SHALL 14  
   2.19. Page 332 - (2025-09) - K01.FR.56 is too strict 14

2.19.1. Page 747-ChargingProfileUpdateRateLimit 15  
2.19.2. ChargingProfileUpdateRateLimit 15

2.20. Page 332 - (2025-06) - CSMS requirements for useLocalTime, PriorityCharging and others [954] 16  
2.21. Page 333 - [2025-09] - K01 New requirement for randomized Delays larger than schedule period [1004] 16  
2.22. Page 336 - (2025-06) - K02 Updated remark of use case about merging profiles 17  
2.23. Page 334 - (2025-09) - Requirement for supported operationMode 17  
2.24. Page 335 - (2025-06) - Requirements for checking operationMode and phases L2/L3 17  
2.25. Page 335 - (2025-09) - K01.FR.126 corrected requirement definition 19  
2.26. Page 376 - (2025-09) - K15 Added rule for composite schedules in case of multiple charging schedules [1002] 19

2.26.1. K15-ISO 15118-2. 20  
2.26.2. K18 - ISO 15118-20 Scheduled Control Mode. 20  
2.26.3. K19 - ISO 15118-20 Dynamic Control Mode 20

2.27. Page 350 - (2025-06) - GetCompositeSchedule and L2/L3 values 20  
2.28. Page 356 - (2025-06) - Updated note of K11.FR.06 with MaxExternalConstraintsId 20  
2.29. Page 376 - (2025-09) - K16 use case description update 21

2.29.1. Page 377 22

2.30. Page 475 - (2025-06) - 001 - Added missing requirements 22  
2.31. Page 370 - (2025-06) - K27 Updated remark of use case 23  
2.32. Page 389 - (2025-06) - K19.FR.04 Minor rephrasing 23  
2.33. Page 395 - (2025-06) - CSMS requirement to support UsePriorityCharging. 23  
2.34. Page 396 - (2025-06) - 5.5 Dynamic Charging Profile [882] 24  
2.35. Page 397 - (2025-06) - K28 missing requirement about duration [882]. 24  
2.36. Page 399 - (2025-09) - K28.FR.10 Precondition not complete 25  
2.37. Page 400 - (2025-06) - K29 missing requirement about duration [882]. 26  
2.38. Page 401 - (2025-06) - K29.FR.04: updated precondition to using dynamic profiles. 26  
2.39. Page 402 - (2025-06) - K29.FR.05: Setpoint missing in precondition 27  
2.40. Page 447 - (2025-09) - N01.FR.12 - Improved definition 27  
2.41. Page 449 - (2025-09) - N02: changed empty to absent. 27  
2.42. Page 450 - (2025-06) - N02.FR.13/23 monitoringCriteria DeltaMonitoring is used for TargetDelta [895] 27  
2.43. Page 720 - (2025-06) - New configuration variable to allow TLS wildcard certificates 28  
2.44. Page 739 - (2025-09) - Error in description of Associated data interval variables [1043] 28

2.44.1. AlignedDataInterval 28  
2.44.2. AlignedDataTxEndInterval 29  
2.44.3. AlignedDataUpstreamInterval 29

2.45. Page 492 - (2025-09) - Text instances of dischargingLimit instead of dischargeLimit 29  
2.46. Page 499 - (2025-06) - Additional V2X generic requirements. 29  
2.47. Page 503 - (2025-06) - Q01.FR.05 Precondition needs to refer to ISO15118-serviceRenegotiationSupport . 30  
2.48. Page 504 - (2025-09) - Q01.FR.02 Enhanced precondition to apply only for V2X 30  
2.49. Page 504 - (2025-09) - Q01.FR.07 Clarified difference Accepted and Processing. 31  
2.50. Page 504 - (2025-09) - Q01.FR.08 Improved precondition 31  
2.51. Page 503 - (2025-06) - Q01.FR.09 Wrong precondition. 31  
2.52. Page 504 - (2025-06) - Q02 Use case text not in line with Q02.FR.03 32  
2.53. Page 513 - (2025-06) - Q05 add requirement about duration [822] 32  
2.54. Page 514 - (2025-06) - Prerequisite in use case Q06 updated 32  
2.55. Page 516 - (2025-06) - Q06.FR.11/12 can be combined [883] 33  
2.56. Page 517 - (2025-06) - Q06 add requirement about duration [822] 33  
2.57. Page 519 - (2025-09) - Q07 Added requirements 33  
2.58. Page 522 - (2025-09) - Q08.FR.02/12 Requirement updates for aFRR 34  
2.59. Page 550 - (2025-09) - R04 extra requirements to SetDERControlRequest [997]. 34  
2.60. Page 551 - (2025-09) - R04 extra requirements to GetDERControlRequest [998] 35  
2.61. Page 551 - (2025-09) - R04 updated requirements to ClearDERControlRequest [999] 35  
2.62. Page 620 - (2025-06) - ChargingSchedulePeriodType limit description update. 37  
2.63. Page 703 - (2025-06) - Controller component PaymentCtrl added to list 37  
2.64. Page 750 - (2025-09) - TariffCostCtrl.Enabled can be ReadOnly [934]. 37  
2.65. Appendix Page 51 - (2025-09) - Added connector type BatterySlot. 38

3. Part 3 39
4. Part 4 40

4.1. Page 16 - (2025-06) - 5.4 Reconnecting - reset backoff wait timer 40  
4.2. Page 21 - (2025-06) - 6.3 Connection loss - Allow Local Controller to keep connection open 40

# Disclaimer

Copyright © 2010 - 2025 Open Charge Alliance. All rights reserved.

This document is made available under the _Creative Commons Attribution-NoDerivatives 4.0 International Public License_ (https://creativecommons.org/licenses/by-nd/4.0/legalcode).

Version History

<table><tr><td>Version</td><td>Date</td><td>Description</td></tr><tr><td>2025-09</td><td>2025-09-22</td><td>Includes errata for Part 2 and 4 of OCPP 2.1 Edition 1.</td></tr><tr><td>2025-06</td><td>2025-07-08</td><td>Includes errata for Part 2 and 4 of OCPP 2.1 Edition 1.</td></tr></table>

# Scope

This document contains errata on the OCPP 2.1 documentation. These errata have to be read as an addition to the release of OCPP 2.1 Edition 1.

The errata do not affect any schemas of OCPP messages. Certain errata do contain changes to requirements or even new requirements, but only in cases where a requirement contains an obvious error and would not or could not be implemented literally. New requirements are only added when they were already implicitly there. These changes have been discussed in or were proposed by the Technology Working Group of the Open Charge Alliance.

The appendices of the OCPP specification can be updated without requiring a new OCPP release. This mainly concerns the components and variables of the OCPP device model, which can be extended with new components or variables, as long as they are optional.

# Terminology and Conventions

Bold: when needed to clarify differences, bold text might be used.

The errata entries are sorted by page number of the affected section of the specification document. When an errata entry affects multiple parts of the specification, then the various changes are grouped together with subsections referring to the pages affected by those changes.

This is version 2025-09 of the errata. The errata of this version are marked with "(2025-09)" in the section title.

In some cases the issue number by which it was reported, is added in square brackets at the end of the section title, e.g. "[349]". For retrieval of the issue in the issue tracking system prefix the number with "OCPP20M", like "[OCPP20M-349]".

# 0. Part 0

Currently no new errata for OCPP 2.1 Edition 1 part 0.

# 1. Part 1

Currently no new errata for OCPP 2.1 Edition 1 part 1.

# 2. Part 2

# 2.1. Page 65 - (2025-09) - B07.FR.15 has been deleted [1007]

B07.FR.15 was added since 2.1, but it is wrong. It speaks about ReadOnly variables, but this must be WriteOnly. It is also not needed, because in 2.0.1 Errata 2025-02 requirement B07.FR.03 was already updated to exclude WriteOnly variables.

Deleted requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>B07.FR.15</td><td>When the Charging Station is sending the requested information via one or more NotifyReportRequest messages to the CSMS</td><td>The Charging Station SHALL omit the value of readily variables</td><td></td></tr></table>

# 2.2. Page 70 - (2025-09) - B09.FR.02/04/05 - Added optional reasonCode

A mention of adding an optional reasonCode when a SetNetworkProfileRequest is rejected, has been added.

Changed requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>B09.FR.02</td><td>On receipt of the SetNetworkProfileRequest</td><td>The Charging Station SHALL validate the content. If the content is invalid, the Charging Station SHALL respond by sending a SetNetworkProfileResponse message, with status Rejected and optional statusInforeasonCode = &quot;InvalidNetworkConf&quot;</td><td>Matches B09.FR.34 for NetworkConfiguration.</td></tr><tr><td>B09.FR.04</td><td>The variable AllowSecurityProfileDowngrade is not implemented or implemented and set to false AND the Charging Station receives a SetNetworkProfileRequest AND the NetworkConnectionProfile contains a lower securityProfile than the currently active security profile</td><td>The Charging Station SHALL respond by sending a SetNetworkProfileResponse message, with status Rejected and optional statusInforeasonCode = &quot;NoSecurityDowngrade&quot;</td><td>Matches B09.FR.35 for NetworkConfiguration.</td></tr><tr><td>B09.FR.05</td><td>When the value of configurationSlot in SetNetworkProfileRequest does not match an entry in valuesList of NetworkConfigurationPriority</td><td>The Charging Station SHALL respond by sending a SetNetworkProfileResponse message with status Rejected with optional statusInforeasonCode = &quot;InvalidConfSlot&quot;</td><td></td></tr></table>

# 2.3. Page 71 - (2025-09) - B09.FR.22/26/27/28 - Improved definitions

The original requirements have been rephrased so that they apply to network configurations from SetNetworkProfileRequests as well as instances of NetworkConfiguration.

Changed requirements

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>B09.FR.2 2 (2.1)</td><td>B09.FR.10 AND On receipt of a SetVariablesRequest containing any NetworkConfiguration component variable AND the component instance matches any of the members in the currently configured NetworkConfigurationPriority</td><td>The Charging Station SHALL respond by sending a SetVariablesResponse with the corresponding setVariableResult containing status Rejected</td><td>It is not allowed to update any NetworkConfiguration instance that can potentially be used during a reconnection attempt.</td></tr><tr><td>New</td><td>B09.FR.2 2 (2.1)</td><td>B09.FR.10 AND On receipt of a SetVariablesRequest containing any NetworkConfiguration component variable AND the component instance matches any of the members in the currently configured NetworkConfigurationPriority</td><td>The Charging Station SHALL respond by sending a SetVariableResult with the corresponding setVariableResult with attributeStatus Rejected and attributeStatusInfoReasonCode = "ActiveNetworkConf"</td><td>It is not allowed to update any NetworkConfiguration instance that can potentially be used during a reconnection attempt.</td></tr><tr><td>Old</td><td>B09.FR.2 6 (2.1)</td><td>B09.FR.10 AND On receipt of a SetVariablesRequest containing the variable SecurityCtrl.Identity AND the mutability of this variable is read/write</td><td>The Charging Station SHALL also set the variable of the same name in all NetworkConfiguration component instances to the same value (if valid), including component instances which are contained in the currently configured NetworkConfigurationPriority. This is for backwards compatibility only. CSMS SHOULD set the NetworkConfiguration component variable instead.</td><td></td></tr><tr><td>New</td><td>B09.FR.2 6 (2.1)</td><td>When a SetVariablesRequest changes the variable of SecurityCtrl.Identity</td><td>The Charging Station SHALL clear the Identity from the active NetworkConnectionProfile and NetworkConfiguration (when it is writable)</td><td>The SecurityCtrl.Identity is deprecated, and remains for backwards compatibility only. This assures that the Charging Station will use the value from the SecurityCtrl.Identity if it is set by CSMS (See B09.FR.16).</td></tr><tr><td>Old</td><td>B09.FR.2 7 (2.1)</td><td>B09.FR.10 AND On receipt of a SetVariablesRequest containing the variable SecurityCtrl.BasicAuthPassword d</td><td>The Charging Station SHALL also set the variable of the same name in all NetworkConfiguration component instances to the same value (if valid), including component instances which are contained in the currently configured NetworkConfigurationPriority. This is for backwards compatibility only. CSMS SHOULD set the NetworkConfiguration component variable instead.</td><td></td></tr><tr><td>New</td><td>B09.FR.2 7 (2.1)</td><td>When a SetVariablesRequest changes the variable SecurityCtrl.BasicAuthPassword d</td><td>The Charging Station SHALL clear the BasicAuthPassword from the active NetworkConnectionProfile and NetworkConfiguration (when it is writable)</td><td>The SecurityCtrl.BasicAuthPassword is deprecated, and remains for backwards compatibility only. This assures that the Charging Station will use the value from the SecurityCtrl.BasicAuthPassword d if it is set by CSMS (See B09.FR.16).</td></tr><tr><td>Old</td><td>B09.FR.2 8 (2.1)</td><td>B09.FR.10 AND When Charging Station activates a new network configuration</td><td>Charging Station SHALL ensure that the values of SecurityCtrl.Identity and SecurityCtrl.BasicAuthPassword match the corresponding variables of NetworkConfiguration.Identity[configurationSlot] and NetworkConfiguration.BasicAuthPassword [configurationSlot] for the currently active configurationSlot.</td><td></td></tr><tr><td>New</td><td>B09.FR.2 8 (2.1)</td><td>If the NetworkConnectionProfile or NetworkConfiguration used for the currently active connection includes values for the variables Identity and/or BasicAuthPassword</td><td>The Charging Station SHALL set the values of SecurityCtrl.Identity and/or SecurityCtrl.BasicAuthPassword accordingly.</td><td></td></tr></table>

# 2.4. Page 71 - (2025-09) - B09.FR.31/32 - Improved definition

The original requirements has been rephrased so that it applies to a network configuration from either SetNetworkProfileRequests or from an instance of NetworkConfiguration.

Changed requirements

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>B09.FR.31</td><td>The variableAllowSecurityProfileDowngrade is implemented and set to true AND The currently active &#x27;SecurityProfile&#x27; is 3 AND The Charging Station receives a SetNetworkProfileRequest AND the NetworkConnectionProfile contains a securityProfile with a value of 2.</td><td>The Charging Station SHALL respond with SetVariablesResponse(Accepted)</td><td></td></tr><tr><td>New</td><td>B09.FR.31</td><td>The variableAllowSecurityProfileDowngrade is implemented and set to true AND the currently active &#x27;SecurityProfile&#x27; is higher than 1 AND the Charging Station receives a SetNetworkProfileRequest with a NetworkConnectionProfile with securityProfile = 1</td><td>The Charging Station SHALL respond with SetNetworkProfileResponse with status Rejected and optional statusInforeasonCode = &quot;NoSecurityDowngrade&quot;</td><td></td></tr><tr><td>Old</td><td>B09.FR.32</td><td>The variableAllowSecurityProfileDowngrade is implemented and set to true AND The currently active &#x27;SecurityProfile&#x27; is higher than 1 AND The Charging Station receives a SetNetworkProfileRequest AND the NetworkConnectionProfile contains a securityProfile with a value of 1.</td><td>The Charging Station SHALL respond with SetVariablesResponse(Rejected)</td><td></td></tr><tr><td>New</td><td>B09.FR.32 (2.1)</td><td>The variableAllowSecurityProfileDowngrade is implemented and set to true AND the currently active &#x27;SecurityProfile&#x27; is higher than 1 AND the Charging Station receives a SetVariablesRequest for NetworkConfiguration.SecurityProfile with attributeValue = 1.</td><td>The Charging Station SHALL respond with SetVariablesResponse with the corresponding setVariableResult with attributeStatus Rejected and attributeStatusInforeasonCode = &quot;NoSecurityDowngrade&quot;</td><td></td></tr></table>

# 2.5. Page 71 - (2025-09) - B09.FR.33/34/35 - Added requirements to validate NetworkConfiguration

The same validations that are performed when activating a network connection profile from SetNetworkProfileRequest also need to be performed when activating an instance of NetworkConfiguration.

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>B09.FR.33(2.1)</td><td>B09.FR.10 ANDOn receipt of a SetVariablesRequest containing the variableNetworkConfigurationPriority ANDthe new value adds configurationslot(s) to the current value</td><td>The Charging Station SHALL validate theNetworkConfiguration component for instancesequal to the added configuration slot(s), and if successful, the Charging Station SHALL respond by sending a SetVariablesResponse message, with status Accepted</td><td></td></tr><tr><td>B09.FR.034(2.1)</td><td>B09.FR.10 ANDOn receipt of a SetVariablesRequest containing the variableNetworkConfigurationPriority ANDthe new value adds configurationslot(s) to the current value</td><td>The Charging Station SHALL validate theNetworkConfiguration component for instancesequal to the added configuration slot(s), and if not successful the Charging Station SHALL respond by sending a SetVariablesResponse message, with the corresponding setVariableResult withattributeStatus Rejected andattributeStatusInforeasonCode = &quot;InvalidNetworkConf&quot;</td><td>The field additionalInfo can be used to providedetails about whichNetworkConfigurationvariable is invalid.Matches B09.FR.02 forSetNetworkProfileRequest.</td></tr><tr><td>B09.FR.35(2.1)</td><td>The variableAllowSecurityProfileDowngrade is notimplemented or set to false ANDThe Charging Station receives aSetVariablesRequest forNetworkConfiguration.SecurityProfilewith an attributeValue that has a lowervalue than the currently active‘SecurityProfile&#x27;</td><td>The Charging Station SHALL respond withSetVariablesResponse with the correspondingsetVariableResult with attributeStatus Rejectedand attributeStatusInforeasonCode = &quot;NoSecurityDowngrade&quot;</td><td>Matches B09.FR.04 forSetNetworkProfileRequest.</td></tr></table>

# 2.6. Page 74 - (2025-06) - B10.FR.03/04/10 - Migrate to new NetworkConnectionProfile

Changed requirements

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>B10.FR.03</td><td>B10.FR.04 AND When connecting fails</td><td>The Charging Station SHALL make the number of attempts as configured in NetworkProfileConnectionAttempts per entry of NetworkConfigurationPriority.</td><td></td></tr><tr><td>New</td><td>B10.FR.03</td><td>After a reboot OR When connection to CSMS is lost</td><td>The Charging Station SHALL make the number of attempts as configured in NetworkProfileConnectionAttempts per entry of NetworkConfigurationPriority.</td><td></td></tr><tr><td>Old</td><td>B10.FR.04</td><td>B10.FR.01 OR B09.FR.01 AND After a reboot</td><td>The Charging Station SHALL begin connecting to the first entry of NetworkConfigurationPriority</td><td>Same as A05.FR.05</td></tr><tr><td>New</td><td>B10.FR.04</td><td>(B10.FR.01 OR B09.FR.01) AND After a reboot</td><td>The Charging Station SHALL begin connecting to the first entry of NetworkConfigurationPriority</td><td>Same as A05.FR.05</td></tr></table>

The following requirement is added to make explicit that a BootNotification must be sent, or else Charging Station might connect to a new CSMS without it, in which case CSMS would respond with a CALLERROR(SecurityEvent).

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>B10.FR.10 (new)</td><td>B10.FR.03 AND Charging Station successfully connected after having switched to a different NetworkConnectionProfile</td><td>Charging Station SHALL send a BootNotificationRequest to CSMS to reestablish its registration status, even if it has not rebooted since last being accepted by any CSMS.</td><td>Charging Station does not need to check whether the CSMS it connected to, is actually one that it has not connected to before.</td></tr></table>

# 2.7. Page 75 - (2025-06) - B11 - Clarify meaning of Onidle for Reset

The "idle state" is defined in Terminology as: "In both use cases and sequence diagrams, Idle status is referred as the state in which a Charging Station is not performing any use case related tasks. Condition during which the equipment can promptly provide a primary function but is not doing so." This is a broader concept, than having an active transaction. A remark is added to the use case to explain that.

The sentence about persistent states and ResetResponse did not belong in Remarks section.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Reset - Without Ongoing Transaction</td></tr><tr><td>...</td><td>...</td><td></td></tr><tr><td>8</td><td>Remark(s)</td><td>Persistent states: for example, EVSE set to Unavailable SHALL persist.+ [line-through]#The Charging Station responds with ResetResponse.OnIdle refers to the &quot;idle state&quot; of a charging station. This is when the Charging Station is not performing any use case related tasks that might interfere with a reset process. The most obvious case is being involved in an active transaction, but there are other conditions when the Charging Station is not idle, for example, when a firmware update process is ongoing, a log file is uploaded to CSMS, a reservation is pending or a cable is still locked in the Charging Station.</td></tr></table>

# 2.8. Page 189 - (2025-06) - E06.FR.05 for DataSigned as TxStopPoint is invalid

DataSigned cannot be used as a TxStopPoint. This requirement is therefore invalid and confusing when present.

Deleted requirement

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Delete</td><td>E06.FR.05</td><td>TxStopPoint contains: DataSigned AND Charging Station can no longer retrieve signed meter values.</td><td>The Charging Station SHALL stop the transaction and send a TransactionRequest (eventType = Ended) to the CSMS.</td></tr></table>

# 2.9. Page 193 - (2025-09) - E07.FR.07 - Improved precondition

The precondition of E07.FR.07 was written as text, but it is more precise to refer another requirement.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>E07.FR.07</td><td>As part of the normal transaction termination.</td><td>The Charging Station SHALL unlock the cable (if not permanently attached).</td><td></td></tr><tr><td>New</td><td>E07.FR.07</td><td>E07.FR.02</td><td>The Charging Station SHALL unlock the cable (if not permanently attached).</td><td></td></tr></table>

# 2.10. Page 219 - (2025-06) - E17.FR.01 Clarification of transaction state to store

Minor improvement of definition to clarify that state information needed to resume a transaction must be persisted.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>E17.FR.01</td><td>If [configkey-tx-resumption-timeout] &gt; 0</td><td>Charging Station SHALL store transaction state in persistent memory</td><td>This is needed in order to resume transactions after a power loss.</td></tr><tr><td>New</td><td>E17.FR.01</td><td>If [configkey-tx-resumption-timeout] &gt; 0</td><td>Charging Station SHALL store transaction state that is needed to resume transactions in persistent memory</td><td>This includes at least, but is not limited to, the seqNo, idToken, evse and transactionInfo data of all active transactions. This ensures transactions can be restored after a power loss.</td></tr></table>

# 2.11. Page 240 - (2025-06) - F06 Requirement for CSMS to support customTrigger [896]

A requirement for CSMS to support customTriggers was missing.

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>F06.FR.20 (2.1)</td><td>If Charging Station reports custom triggers in CustomizationCtrl.CustomTriggers</td><td>CSMS SHALL support sending these custom triggers as a [triggermessagerequest] with requestedMessage = CustomTrigger and customTrigger set to the custom trigger.</td><td></td></tr></table>

# 2.12. Page 260 - (2025-06) - H02 - Added missing requirements

Added missing requirements explicitly specifying behaviour of Charging Station when a reservation is cancelled.

Removed details from scenario description:

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td colspan="3">[...]</td></tr><tr><td></td><td>Scenario description</td><td>1. EV Driver asks the CSMS to cancel a reservation.
2. To cancel a reservation, the CSMS sends CancelReservationRequest to the Charging Station.
3. If the Charging Station has a reservation matching the reservationId in the request PDU, it returns the status Accepted.
4. If a specific EVSE was reserved for this reservation, the Charging Station sends a NotifyEventRequest with variable &quot;AvailabilityState&quot; set to &quot;Available&quot; for all the Connectors of that EVSE.
5. The CSMS responds with a NotifyEventResponse to the Charging Station.
6. The reservation is canceled.</td></tr><tr><td colspan="3">[...]</td></tr></table>

Removed details from sequence diagram

Old:

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/65c8c772-509e-45de-b077-e3f560fa735b/f7af6590f4b6335dd87edd4166295226def3fc11f2354f205fa12067d26d9381.jpg)  
Sequence Diagram: Cancel Reservation

New:

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/65c8c772-509e-45de-b077-e3f560fa735b/c53a84ef9e2c9f349b3314d39c00f25b1cf5c8aefde4b22ed2b62faa7086f3b9.jpg)  
Sequence Diagram: Cancel Reservation

New requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>H02.FR.03</td><td>H02.FR.02 ANDIf a specific EVSE was reserved for this reservation</td><td>The Charging Station SHALL allow charging again on this EVSE.</td></tr><tr><td>H02.FR.04</td><td>H02.FR.03</td><td>The Charging Station SHALL send a StatusNotificationRequest with status Available or a NotifyEventRequest with AvailabilityState set to Available to the CSMS for each connector, notifying the CSMS that all the connectors of this EVSE are available again for any EV Driver.</td></tr><tr><td>H02.FR.05</td><td>H02.FR.02 ANDIf no specific EVSE was reserved for this reservation</td><td>The Charging Station SHALL allow charging on all EVSE which were not reserved explicitly.</td></tr><tr><td>H02.FR.06</td><td>H01.FR.05 ANDbefore cancelling the reservation the amount of EVSEs reserved was equal to the amount of reservations</td><td>The Charging Station SHALL send for all connectors of all EVSEs which were not reserved explicitly:- a NotifyEventRequest with component = &quot;Connector&quot;, variable = &quot;AvailabilityState&quot;, trigger = &quot;Delta&quot;, actualValue = &quot;Available&quot;, OR - a StatusNotificationRequest with connectorStatus = Available.</td></tr></table>

# 2.13. Page 290 - (2025-09) - I08.FR.31 is a duplicate requirement number [1042]

By mistake the requirement number I08.FR.31 occurs twice in I08. This has been fixed by moving the first I08.FR.31 requirement to become I08.FR.37.

Requirement number changed

<table><tr><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Notes</td></tr><tr><td>I08.FR.31</td><td rowspan="2">I08.FR.30 AND Charging Station does not have a Delta monitor installed on TariffCostCtrlr.Problem</td><td rowspan="2">Charging Station SHALL send a [notifyeventrequest] with trigger = Alerting, eventNotificationType = HardWiredNotification, component = &quot;TariffCostCtrlr&quot;, variable = &quot;Problem&quot;, actualValue = &quot;true&quot; and techCode optionally set to the applicable reason code from Appendix 5, to notify CSMS that it cannot support the tariff in the response.</td><td rowspan="2">techCode can be, for example, one of &quot;TooManyElements&quot;, &quot;OutOfMemory&quot;, &quot;InternalError&quot;, &quot;UnsupportedParam&quot;, etc.</td></tr><tr><td>I08.FR.37</td></tr></table>

# 2.14. Page 297 - (2025-09) - I12.FR.02 fails to mention that chargingPeriods are not sent for running cost updates [1048]

The element chargingPeriods in CostDetailsType is not sent for running cost updates, because that is not needed and adds a lot of data to the message. This is mentioned explicitly in CostDetailsType, but it is not formalized in the requirements.

Changed requirement

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Notes</td></tr><tr><td>Old</td><td>I12.FR.02</td><td>I12.FR.01 AND TariffCostCtrl.Enabled[RunningCost] = true</td><td>Charging Station SHALL provide a costDetails field of type [cmn_costdetailedtype] in [transactioneventrequest] with eventType = Started and every TariffCostCtrlInterval[Cost] seconds during the transaction for eventType = Updated.</td><td>Providing running cost updates needs to be enabled via TariffCostCtrl.Enabling[RunningCost]. See [configkey-running-cost-enabled] and [configkey-cost-interval].</td></tr><tr><td>New</td><td>I12.FR.02</td><td>I12.FR.01 AND TariffCostCtrl.Enabled[RunningCost] = true</td><td>Charging Station SHALL provide a costDetails field of type [cmn_costdetailedtype] without a chargingPeriods field in [transactioneventrequest] with eventType = Started and every TariffCostCtrlInterval[Cost] seconds during the transaction for eventType = Updated.</td><td>Providing running cost updates needs to be enabled via TariffCostCtrl.Enabling[RunningCost]. See [configkey-running-cost-enabled] and [configkey-cost-interval].</td></tr></table>

# 2.15. Page 354 - (2025-06) - Updated remark of K11

Added sentence to Remarks a new charging profile for an update of external limit can use the same charging profile id.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>...</td><td>...</td><td>...</td></tr><tr><td>8</td><td>Remarks</td><td>[...]If the external limit is represented by an Absolute or RelativeChargingStationExternalConstraints charging profile, then every update of the external limit requires (K11.FR.06) that the existingChargingStationExternalConstraints charging profile is replaced by a new one. This one can use the samechargingProfile.id, however.</td></tr></table>

# 2.16. Page 327 - (2025-06) - Updated note of K01.FR.05

Note suggested that ChargingStationExternalConstraints cannot be replaced at all. Updated note to clarify that a ChargingStationExternalConstraints cannot be replaced by CSMS.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>K01.FR.05</td><td>When a SetChargingProfileRequest with an already known ChargingProfile.id is received AND the existing ChargingProfile does NOT have chargingProfilePurpose = ChargingStationExternalConstraints</td><td>The Charging Station SHALL replace the existing ChargingProfile with the one specified.</td><td>ChargingStationExternalConstraints profile cannot be replaced.</td></tr><tr><td>New</td><td>K01.FR.05</td><td>When a SetChargingProfileRequest with an already known ChargingProfile.id is received AND the existing ChargingProfile does NOT have chargingProfilePurpose = ChargingStationExternalConstraints</td><td>The Charging Station SHALL replace the existing ChargingProfile with the one specified.</td><td>ChargingStationExternalConstraints profile cannot be replaced by CSMS.</td></tr></table>

# 2.17. Page 327 - (2025-06) - Add cross-references to K01.FR.06 and K01.FR.39

Requirement K01.FR.06 and K01.FR.39 are similar, but located far apart in the table. It is convenient to add a cross-reference between both.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>K01.FR.06</td><td>When chargingProfilePurpose is NOT TxProfile</td><td>The CSMS SHALL NOT send a ChargingProfile with a stackLevel - chargingProfilePurpose - evseld combination that already exists in another ChargingProfile (with different id) on the Charging Station and has an overlapping validity period.</td><td>This is to ensure that no two charging profiles with same stack level and purpose can be valid at the same time.</td></tr><tr><td>New</td><td>K01.FR.06</td><td>When chargingProfilePurpose is NOT TxProfile</td><td>The CSMS SHALL NOT send a ChargingProfile with a stackLevel - chargingProfilePurpose - evseld combination that already exists in another ChargingProfile (with different id) on the Charging Station and has an overlapping validity period.</td><td>This is to ensure that no two charging profiles with same stack level and purpose can be valid at the same time. 
(See also K01.FR.39)</td></tr><tr><td>Old</td><td>K01.FR.39</td><td>When chargingProfilePurpose is TxProfile</td><td>The CSMS SHALL NOT send a ChargingProfile with a stackLevel - transactionId combination that already exists in another ChargingProfile (with different id) with purpose TxProfile.</td><td>This is to ensure that no two charging profiles with same stack level and purpose can be valid at the same time.</td></tr><tr><td>New</td><td>K01.FR.39</td><td>When chargingProfilePurpose is TxProfile</td><td>The CSMS SHALL NOT send a ChargingProfile with a stackLevel - transactionId combination that already exists in another ChargingProfile (with different id) with purpose TxProfile.</td><td>This is to ensure that no two charging profiles with same stack level and purpose can be valid at the same time. 
(See also K01.FR.06)</td></tr></table>

# 2.18. Page 331 - (2025-06) - K01.FR.50 requirement is a SHALL

Physics determines how to convert power to current. This cannot be a "should" requirement, but is a SHALL.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>K01.FR.49</td><td>When a SetChargingProfileRequest without a value for numberPhases is received AND the EVSE is of type AC</td><td>The Charging Station SHALL assume numberPhases = 3 as a default value.</td><td></td></tr><tr><td>New</td><td>K01.FR.49</td><td>When a SetChargingProfileRequest without a value for numberPhases is received AND the EVSE is of type AC</td><td>The Charging Station SHALL assume numberPhases = 3 as a default value.</td><td>Regions with a single phase network should always provide numberPhases = 1, otherwise 3 phases will be assumed.</td></tr><tr><td>Old</td><td>K01.FR.50</td><td>When a SetChargingProfileRequest with a chargingRateUnit = W is received AND The ChargingSchedule is used for AC charging</td><td>The Charging Station SHOULD calculate the phase current limit via: Current per phase = Power / (Line Voltage * Number of Phases).</td><td>The &quot;Line Voltage&quot; used in the calculation is not the measured voltage, but the set voltage for the area (for example, 230 or 110 V). The &quot;Number of Phases&quot; is the numberPhases from the ChargingSchedulePeriod. It is usually more convenient to use chargingRateUnit = A for AC charging.</td></tr><tr><td>New</td><td>K01.FR.50</td><td>When a SetChargingProfileRequest with a chargingRateUnit = W is received AND The charging profile is used for AC charging</td><td>The Charging Station SHALL calculate the phase current limit via: Current per phase = limit / (Line Voltage * numberPhases), in which limit and numberPhases are the values from the ChargingSchedulePeriod.</td><td>The &quot;Line Voltage&quot; used in the calculation is not the measured voltage, but the set voltage for the area (for example, 230 or 110 V). The limit and numberPhases are the values from the ChargingSchedulePeriod. When numberPhases is not specified, a value of 3 is assumed (see K01.FR.49). It is usually more convenient to use chargingRateUnit = A for AC charging, since in that case the limit does not change depending on number of phases in use.</td></tr></table>

# 2.19. Page 332 - (2025-09) - K01.FR.56 is too strict

K01.FR.56 attempts to limit the update rate of persistent profiles, but current requirement prohibits setting profiles on different EVSEs in quick succession.

Updated requirement

New requirement

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>K01.FR.56(2.1)</td><td>When Charging Station receives a [setchargingprofilerequest] for a [cmn_chargingprofiletype] with a chargingProfilePurpose that is to be stored persistently AND the previous [setchargingprofilerequest] for this chargingProfilePurpose was less than ChargingProfileUpdateRateLimit seconds ago</td><td>Charging Station MAY respond with [setchargingprofileresponse] with status = Rejected andreasonCode = &quot;RateLimitExceeded&quot;</td><td>See also K01.FR.55 and K01.FR.27. If ChargingProfileUpdateRateLimit does not exist, there is no rate limit.</td></tr><tr><td>New</td><td>K01.FR.56(2.1)</td><td>When Charging Station receives frequent [setchargingprofilerequest] messages at a rate that threatens to wear out its persistent memory, for a [emm_chargingprofiletype] with a chargingProfilePurpose that is to be stored persistently</td><td>Charging Station MAY respond with [setchargingprofileresponse] with status = Rejected andreasonCode = &quot;RateLimitExceeded&quot;</td><td>See K01.FR.55 and K01.FR.27 for which charging profiles are persistent.</td></tr></table>

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>K01.FR.57(2.1)</td><td>K01.FR.56</td><td>Charging Station SHOULD report the duration after which a next update will be accepted, in field statusInfo additionlInfo as &quot;&lt;xx&gt; seconds before retry&quot;</td><td>&lt;xx&gt; is the number of seconds after which the next [setchargingprofilerequest] is allowed.</td></tr><tr><td>K01.FR.58(2.1)</td><td>K01.FR.56</td><td>CSMS MAY retry the [setchargingprofilerequest] if still applicable</td><td></td></tr><tr><td>K01.FR.59(2.1)</td><td>K01.FR.57</td><td>CSMS IS RECOMMENDED to use at least the number of seconds in statusInfo additionlInfo as a delay before retrying</td><td>This will avoid unnecessary rejections</td></tr></table>

# 2.19.1. Page 747 - ChargingProfileUpdateRateLimit

This variable has now been deprecated.

# 2.19.2. ChargingProfileUpdateRateLimit

Deprecated

<table><tr><td>Required</td><td colspan="3">no</td></tr><tr><td>Component</td><td>componentName</td><td colspan="2">SmartChargingCtrlr</td></tr><tr><td rowspan="3">Variable</td><td>variableName</td><td colspan="2">UpdateRateLimit</td></tr><tr><td>variableAttributes</td><td>mutability</td><td>ReadOnly</td></tr><tr><td>variableCharacteristics</td><td>dataType</td><td>integer</td></tr></table>

<table><tr><td rowspan="2">Description</td><td>This configuration key limits how often a persistent charging profile can be updated. It is the minimum duration in seconds between updates of charging profiles of the same chargingProfilePurpose. A Charging Station may reject SetChargingProfileRequests that occur too frequently, as per K01.FR.56.</td></tr><tr><td>Note: This configuration variable has been deprecated, because a simple variable with number of seconds between updates does not determine when a Charging Station may reject a message or not.</td></tr></table>

# 2.20. Page 332 - (2025-06) - CSMS requirements for useLocalTime, PriorityCharging and others [954]

Requirements have been added for the implicit assumption that CSMS has to support these new features.

New requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td colspan="4">PriorityCharging</td></tr><tr><td>K01.FR.72(2.1)</td><td></td><td>CSMS SHALL support sending a SetChargingProfileRequest with chargingProfilePurpose = PriorityCharging.</td><td></td></tr><tr><td>K01.FR.73(2.1)</td><td></td><td>CSMS SHALL NOT add a duration to a chargingSchedule in a chargingProfile with chargingProfilePurpose = PriorityCharging.</td><td></td></tr><tr><td colspan="4">Use Local Time / Randomized Delay</td></tr><tr><td>K01.FR.96(2.1)</td><td></td><td>CSMS SHALL support sending a SetChargingProfileRequest with a chargingSchedule that contains fields useLocalTime = true and/or randomizedDelay &gt; 0</td><td></td></tr><tr><td colspan="4">Limit Beyond SoC / Offline validity</td></tr><tr><td>K01.FR.104(2.1)</td><td></td><td>CSMS SHALL support sending a SetChargingProfileRequest with a maxOfflineDuration &gt; 0 and invalidAfterOfflineDuration = true or false.</td><td></td></tr><tr><td>K01.FR.105(2.1)</td><td></td><td>CSMS SHALL support sending a SetChargingProfileRequest with a chargingSchedule with a limitAtSoC element.</td><td></td></tr></table>

# 2.21. Page 333 - [2025-09] - K01 New requirement for randomizedDelays larger than schedule period [1004]

Each startPeriod (except the first one) is increased with a random value at start of the transaction. Remember that a delay in the start of the next period, implies an increase in the length of the current period.

A requirement was missing to define how to deal with the situation where a randomizedDelay turns out to be longer than the duration of the chargingSchedulePeriod for which the start is randomized. It is important to remember that all randomized startPeriods are calculated before the charging profile is used (at submission or start of transaction). If a randomization of the startPeriod is longer than the schedule period (i.e. until the randomized start of the next period), then this period is skipped entirely.

This implies that a randomized delay can never become more than the duration between startPeriod(i) and startPeriod(i+1)\_randomized, because at that point the next period is started.

# Example

# Assume a schedule

{start:0,limit:0}, {start:300,limit:1}, {start:600,limit:2}, {start:900,limit:3}

# Random delays create

{start: 0, limit: 0}, {start: 300+753=1053, limit: 1}, {start: 600+123=723, limit: 2}, {start: 900+87=987, limit: 3} In this case the second period will be dropped, because it exceeds start of the third period (723).

<table><tr><td>K01.FR.97
(2.1)</td><td>K01.FR.93 AND
startPeriod + &lt;random delay&gt; of
chargingSchedulePeriod[i] is
greater/equal than startPeriod +
&lt;random delay&gt; of
chargingSchedulePeriod[i+1] or
greater/equal than chargingSchedule
.duration</td><td>chargingSchedulePeriod[i] is skipped
from the randomized charging
schedule.</td><td>chargingSchedulePeriod[i] is skipped
because its randomized start would
take place after the randomized start
of chargingSchedulePeriod[i+1] or
after end of charging schedule. This
is basically means that
chargingSchedulePeriod[i-1]
continues until (randomized) start of
chargingSchedulePeriod[i+1] or until
charging schedule end if this is the
last period.</td></tr></table>

# 2.22. Page 336 - (2025-06) - K02 Updated remark of use case about merging profiles

The description of merging profiles in the remark was not complete. It has been updated to refer to the appropriate requirement.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>...</td><td>...</td><td>...</td></tr><tr><td>8</td><td>Remark(s)</td><td>[...]The final schedule constraints that apply to a transaction are determined by merging the profiles with purposes ChargingStationMaxProfile with the profile TxProfile or TxDefaultProfile in case no profile of purpose TxProfile is provided. Zero or more of the following ChargingProfile purposes MAY have been previously received from the CSMS: ChargingStationMaxProfile or TxDefaultProfile, as described in requirement SC.01 in Chapter 4. Smart Charging Signals to a Charging Station from Multiple Actors .[...]</td></tr></table>

# 2.23. Page 334 - (2025-09) - Requirement for supported operationMode

A missing requirement that only supported operationModes are accepted, has been added.

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>K01.FR.115 (2.1)</td><td>When Charging Station receives a [setchargingprofilerequest] with a charging profile that contains a [cmn_chargescheduleperi odtype] with a value for operationMode that is not ChargingOnly and not part of the attributeValue of [configkey- v2xsupportedoperationmod es]</td><td>Charging Station SHALL respond with [setchargingprofileresponse] with status = Rejected and statusInfo withreasonCode = &quot;InvalidOperationMode&quot;</td><td></td></tr></table>

# 2.24. Page 335 - (2025-06) - Requirements for checking operationMode and phases L2/L3

The following requirements have been made explicit from the table in paragraph 3.2 Charging Profile purpose.

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td colspan="4">OperationMode</td></tr><tr><td>K01.FR.111(2.1)</td><td>When a charging profile haschargingProfilePurpose =PriorityCharging orChargingStationMaxPrforfile</td><td>The charging profile SHALL only containchargingSchedulePeriodswith operationMode =ChargingOnly or without operationMode.</td><td></td></tr><tr><td>K01.FR.112(2.1)</td><td>When a charging profile haschargingProfilePurpose =ChargingStationExternalLimits</td><td>The charging profile SHALL only containchargingSchedulePeriodswith operationMode =ChargingOnly, ExternalLimits,ExternalSetpoint or without operationMode.</td><td></td></tr><tr><td>K01.FR.113(2.1)</td><td>When a charging profile haschargingProfilePurpose =LocalGeneration</td><td>The charging profile SHALL only containchargingSchedulePeriodswith operationMode =ChargingOnly, ExternalLimits or without operationMode.</td><td></td></tr><tr><td>K01.FR.114(2.1)</td><td>When Charging Stationreceives a[setchargingprofilerequest]with a charging profile thatdoes not obey toK01.FR.111, K01.FR.112,K01.FR.113</td><td>Charging Station SHALL respond with[setchargingprofileresponse] with status =Rejectedand statusInfo withreasonCode = &quot;InvalidOperationMode&quot;</td><td></td></tr></table>

The following requirements have been added to make explicit when \_L2 and \_L3 fields can be used.

New requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td colspan="4">ISO 15118-20 multi-phase support</td></tr><tr><td>K01.FR.140(2.1)</td><td>When determining the composite schedule from multiple charging profiles</td><td>Charging Station SHALL at each point in time use the lowest value of numberPhases for that point in time in all applicable chargingSchedulePeriods.</td><td>For example, if ChargingStationMaxProfile has numberPhases = 1 and TxProfile has numberPhases = 3, then the value 1 is used.</td></tr><tr><td>K01.FR.141(2.1)</td><td>When Charging Station receives a [setchargingprofilerequest] that introduces a conflicting value of phaseToUse with the schedule periods of other applicable charging profiles</td><td>Charging Station SHALL respond with [setchargingprofileresponse] with status = Rejected and a statusInfo withreasonCode = "PhaseConflict".</td><td>For example, if ChargingStationMaxProfile has phaseToUse = 1 and TxProfile is submitted with phaseToUse = 3, then this will be rejected.</td></tr><tr><td>K01.FR.142(2.1)</td><td>When v2xChargingParameters of [notifyevchargingneedsrequest] from Charging Station does not contain maxChargePower_L2 and/or maxChargePower_L3</td><td>CSMS SHALL NOT provide values for limit_L2 and/or limit_L3 fields in a charging profile.</td><td>If EV does not report L2/L3 fields then do not provide separate limits for them.</td></tr><tr><td>K01.FR.143(2.1)</td><td>When CSMS sends a [setchargingprofilerequest] for a chargingProfilePurpose that is not TxProfile</td><td>CSMS SHALL NOT provide values for limit_L2 and limit_L3 fields in chargingSchedulePeriods of the charging profile</td><td>Only a TxProfile is submitted after receiving a NotifyEVChargingNeedsRequest.</td></tr><tr><td>K01.FR.144(2.1)</td><td>(K01.FR.142 OR K01.FR.143) AND Charging Station receives a [setchargingprofilerequest] with values for limit_L2 and/or limit_L3 fields in a charging profile</td><td>Charging Station SHALL respond with [setchargingprofileresponse] with status = Rejected and a statusInfo withreasonCode = "PhaseConflict".</td><td></td></tr><tr><td>K01.FR.145(2.1)</td><td>When CSMS sends a [setchargingprofilerequest] of chargingProfilePurpose = TxProfile</td><td>CSMS SHALL NOT provide values for limit_L2 and/or limit_L3 fields in a chargingSchedulePeriod without providing a value for limit.</td><td>E.g. limit_L2/L3 can only exist if limit is also provided, because in that case limit represents phase L1.</td></tr><tr><td>K01.FR.146(2.1)</td><td>K01.FR.145 AND Charging Station receives a [setchargingprofilerequest] with values for limit_L2 and/or limit_L3 fields in a charging profile, but no value for limit</td><td>Charging Station SHALL respond with [setchargingprofileresponse] with status = Rejected and a statusInfo withreasonCode = "PhaseConflict".</td><td></td></tr><tr><td>K01.FR.147(2.1)</td><td>In the event that an AC ISO 15118-20 session is ongoing and Charging Station falls back to using Mode 3 PWM communication AND charging profiles are active that specify limit_L2 and/or limit_L3</td><td>Charging Station SHALL use the lowest value of limit, limit_L2 and/or limit_L3 as the limit to use for each phase.</td><td>The phrase "limit_L2 and/or limit_L3" is used to cater for both 2-phase and 3-phase situations.</td></tr></table>

# 2.25. Page 335 - (2025-09) - K01.FR.126 corrected requirement definition

K01.FR.126 was not entirely correct, because evseSleep can only occur while in operationMode = Idle.

Changed requirement

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>Old</td><td>K01.FR.126(2.1)</td><td>When Charging Station receives a [setchargingprofilerequest] with evseSleep = true AND [configkey-supports- evsesleep] is false or absent</td><td>Charging Station SHALL respond with [setchargingprofileresponse] with status = Rejected and optionally withreasonCode = &quot;InvalidSchedule&quot;.</td><td></td></tr><tr><td>New</td><td>K01.FR.126(2.1)</td><td>When Charging Station receives a [setchargingprofilerequest] with a chargingSchedulePeriod that has evseSleep = true and operationMode != &#x27;Idle&#x27; AND [configkey- supports-evsesleep] is false or absent</td><td>Charging Station SHALL respond with [setchargingprofileresponse] with status = Rejected and optionally withreasonCode = &quot;InvalidSchedule&quot;.</td><td>A request for EVSE to sleep can only occur during operationMode Idle. See Q10 for evseSleep behavior.</td></tr></table>

# 2.26. Page 376 - (2025-09) - K15 Added rule for composite schedules in case of multiple charging schedules [1002]

In the theoretical situation that 2 TxProfiles are submitted with different stack levels and multiple charging schedules (which can only be the case for an ISO 15118 session) and, because of different durations of these schedules, parts of each of these schedules will be valid at one point or another, then how is the composite schedule calculated? It is not $3 \times 3$ composite schedules (all possible combinations), but only 3 composite schedules, because schedule #1 is always combined with schedule #1, #2 with #2 and #3 with #3. Other chargingProfilePurposes, like ChargingStationMaxProfile need also to be taken into account when calculating the composite schedule.

A new requirement is added to define this behavior.

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>K15.FR.22</td><td>When calculating CompositeSchedule(s) to create a SAScheduleList for ISO 15118-2 to send to EV AND multiple ChargingProfileTypes of chargingProfilePurpose = TxProfile with different stackLevels are valid AND some or all these ChargingProfileTypes have more than one chargingSchedule</td><td>Charging Station SHALL create up to three CompositeSchedules as defined in K08.FR.04, by combining the first chargingSchedule with the first chargingSchedule of other stack levels, the second with second (if existing), the third with the third (if existing), based on their order in the ChargingProfileTypes.</td><td>This is about a corner case when multiple TxProfiles with different stack levels and multiple charging schedules have been sent to the Charging Station. (See K18.FR.24)</td></tr></table>

# 2.26.2. K18 - ISO 15118-20 Scheduled Control Mode

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>K18.FR.24</td><td>When calculating CompositeSchedule(s) to create ScheduleTupleTypes for ISO 15118-20 to send to EV AND multiple ChargingProfileTypes of chargingProfilePurpose = TxProfile with different stackLevels are valid AND some or all these ChargingProfileTypes have more than one chargingSchedule</td><td>Charging Station SHALL create up to three CompositeSchedules as defined in K08.FR.04, by combining the first chargingSchedule with the first chargingSchedule of other stack levels, the second with the second (if existing), the third with the third (if existing), based on their order in the ChargingProfileTypes.</td><td>This is about a corner case when multiple TxProfiles with different stack levels and multiple charging schedules have been sent to the Charging Station. (See K15.FR.22)</td></tr></table>

# 2.26.3. K19 - ISO 15118-20 Dynamic Control Mode

This issue does not affect the requirements in K19, because in Dynamic Control Mode only a single charging schedule is offered by CSMS.

# 2.27. Page 350 - (2025-06) - GetCompositeSchedule and L2/L3 values

The following clarifies that a composite schedule only needs to report L2/L3 values when they exist in the applicable charging profiles.

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>K08.FR.09 (2.1)</td><td>K08.FR.02 AND a chargingSchedulePeriod in the applicable charging profiles contains limit_L2 and/or limit_L3 values</td><td>Charging Station SHALL report the composite value for limit_L2 and/or limit_L3 values in the resulting chargingSchedulePeriod of the [getcompositescheduleresponse].</td></tr></table>

# 2.28. Page 356 - (2025-06) - Updated note of K11.FR.06 with MaxExternalConstraintsId

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>K11.FR.06</td><td>When an external charging limit/schedule is received</td><td>The Charging Station SHALL use purpose ChargingStationExternalConstraints when reporting about this limit (i.e. in a ReportChargingProfilesRequest).</td><td>It is RECOMMENDED to use negative values for the id of a ChargingStationExternalConstraints profile, to minimize the risk of a clash with an id that CSMS might use for a (future) charging profile. See use case K29 for the use of Dynamic charging profiles and external limits.</td></tr><tr><td>New</td><td>K11.FR.06</td><td>When an external charging limit/schedule is received</td><td>The Charging Station SHALL use purpose ChargingStationExternalConstraints when reporting about this limit (i.e. in a ReportChargingProfilesRequest).</td><td>When configuration variable MaxExternalConstraintsId exists, it is RECOMMENDED to use values for the id of a ChargingStationExternalConstraints profile below this value, to minimize the risk of a clash with an id that CSMS might use for a (future) charging profile. When configuration variable MaxExternalConstraintsId does not exist, it is RECOMMENDED to use negative values for the id of a ChargingStationExternalConstraints profile, to minimize the risk of a clash with an id that CSMS might use for a (future) charging profile. See use case K29 for the use of Dynamic charging profiles and external limits.</td></tr></table>

# 2.29. Page 376 - (2025-09) - K16 use case description update

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
10 If EV provided a charging profile in the previous step, then Charging Station will send a NotifyEVChargingScheduleRequest to the CSMS.</td></tr><tr><td>...</td><td>...</td><td>...</td></tr></table>

# 2.29.1. Page 377

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirements</td><td>NOTE</td></tr><tr><td>Old</td><td>K16.FR.0 2 (2.1)</td><td>K16.FR.01</td><td>Charging Station SHALL initiate schedule renegotiation with EV.</td><td>In ISO 15118-2 this is done by replying with EVSENotification=ReNegotiation to a CurrentDemandReq (for DC) or ChargingStatusReq (for AC) message.In ISO 15118-20 this is done by replying with EVSENotification=ScheduleRenegotiation in ChargeLoopRes.</td></tr><tr><td>New</td><td>K16.FR.0 2 (2.1)</td><td>When the composite schedule for the EVSE changes</td><td>Charging Station SHALL initiate schedule renegotiation with EV.</td><td>This can be caused by a Set/ClearChargingProfileRequest or a change in ChargingStationExternalConstraints/Local Generation charging profiles.In ISO 15118-2 renegotiation is started by replying with EVSENotification=ReNegotiation to a CurrentDemandReq (for DC) or ChargingStatusReq (for AC) message.In ISO 15118-20 this is done by replying with EVSENotification=ScheduleRenegotiation in ChargeLoopRes.</td></tr><tr><td>Old</td><td>K16.FR.0 3</td><td>K16.FR.02</td><td>Charging Station SHALL provide the ChargingSchedule data to the EV.</td><td>In ISO 15118 this is done in the ChargeParameterDiscoverRes message.</td></tr><tr><td>New</td><td>K16.FR.0 3</td><td>K16.FR.02</td><td>Charging Station SHALL provide the composite schedule(s) ChargingSchedule data to the EV.</td><td>In ISO 15118 this is done in the ChargeParameterDiscoverRes message.</td></tr></table>

# 2.30. Page 475 - (2025-06) - 001 - Added missing requirements

Added missing requirements explicitly specifying behaviour of Charging Station it contains one or more displays.

New requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td colspan="3">Multiple Display support</td></tr><tr><td>001.FR.20</td><td>When Charging Station has multiple displays AND Charging Station receives a [setdisplaymessagerequest] without a display element in its MessageInfoType</td><td>Charging Station SHOULD use the message for the main display(s)</td></tr><tr><td>001.FR.21</td><td>When receiving a GetBaseReportRequest AND Charging Station has one or more displays</td><td>Charging Station SHOULD include in the report a Display component for every display it contains.</td></tr><tr><td>001.FR.22</td><td>When Charging Station receives a [setdisplaymessagerequest] with Display element referencing an unknown Display in its MessageInfoType</td><td>Charging Station SHOULD respond with a [setdisplaymessageresponse] with status = Rejected.</td></tr><tr><td>001.FR.23</td><td>When Charging Station receives a [setdisplaymessagerequest] with Display element referencing a known Display in its MessageInfoType</td><td>Charging Station SHOULD use the message only for the specified display.</td></tr></table>

# 2.31. Page 370 - (2025-06) - K27 Updated remark of use case

The remark of K27 has been improved to clarify the difference between using an Absolute or a Dynamic chargingProfileKind for a charging profile with a LocalGeneration chargingProfilePurpose, and to mention that chargingProfile.id for the updates does not change.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>...</td><td>...</td><td>...</td></tr><tr><td>8</td><td>Remarks</td><td>If the external system provides a limit via a protocol that is not OCPP, e.g. ModBus, then Charging Station can represent this as an Absolute charging profile, that is replaced when the limit changes, or as a Dynamic charging profile with a single charging schedule period with operationMode = ExternalLimits in which the limit is dynamically updated.
It is up to the Charging Station implementation to decide whether to represent the external limits for LocalGeneration as an Absolute charging profile that is replaced by a new charging profile with the same chargingProfile.id upon each change of the external limit, or as a Dynamic charging profile with an operationMode = ExternalLimits in which the limit is changed upon each change of the external limit.</td></tr></table>

# 2.32. Page 389 - (2025-06) - K19.FR.04 Minor rephrasing

K19.FR.04 reads "If the CSMS is not able to provide ...". This suggests that it may be caused by an error condition, but it can be a conscious choice to not provide a charging profile. Changed "able" to "going" to make this clear.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>K19.FR.04</td><td>K19.FR.02</td><td>If the CSMS is not able to provide a charging schedule, it SHALL indicate this by setting the status field in the NotifyEVChargingNeedsResponse to NoChargingProfile.</td><td>(Note, status value differs from K15.FR.04). Charging Station will use a TxDefaultProfile or provide a schedule with unlimited power.</td></tr><tr><td>New</td><td>K19.FR.04</td><td>K19.FR.02</td><td>If the CSMS is not going to provide a charging schedule, it SHALL indicate this by setting the status field in the NotifyEVChargingNeedsResponse to NoChargingProfile.</td><td>(Note, status value differs from K15.FR.04). Charging Station will use a TxDefaultProfile or provide a schedule with maximum power of EVSE.</td></tr></table>

# 2.33. Page 395 - (2025-06) - CSMS requirement to support UsePriorityCharging

A CSMS must support priority charging. This has been added as a requirement.

New requirement

<table><tr><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>K21.FR.10</td><td></td><td>CSMS SHALL support sending a [useprioritychargingrequest]</td><td>A Charging Station reports support for this in SmartChargingCtrlr.SupportedAdditionalPurposes.</td></tr></table>

# 2.34. Page 396 - (2025-06) - 5.5 Dynamic Charging Profile [882]

The following paragraphs are added to clarify use of duration field.

# Duration in dynamic charging profiles

The field duration of ChargingScheduleType limits the maximum duration of a charging schedule. A dynamic charging profile consists of a charging schedule with only a single period. If no duration is given in the charging schedule, this period is valid indefinitely, and the limits only change when updated via an UpdateDynamicScheduleRequest or PullDynamicScheduleUpdateResponse message or by an external system.

If a value for duration is given, then the charging schedule will end if no update for the limits has been received for more than duration seconds since the last update. This mechanism can be used to ensure that a dynamic charging profile that depends on regular limit updates from CSMS or an external system, will cease to be used when no updates are received anymore, e.g. because connection to the CSMS or external system has been lost.

# 2.35. Page 397 - (2025-06) - K28 missing requirement about duration [882]

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Dynamic charging profiles from CSMS</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="3"></td><td rowspan="3">Scenario description #1</td><td>Updates sent by CSMS</td></tr><tr><td>...</td></tr><tr><td>5. If chargingSchedule.duration is set and the setpoint/limit is not updated by a [updatedynamicschedulerequest] after duration seconds, then the chargingSchedule ends and Charging Station will fall back to the next valid charging profile.a. If chargingSchedule.duration has not been set, then the chargingSchedule is valid indefinitely, until the charging profile is cleared or replaced by CSMS.</td></tr><tr><td rowspan="3"></td><td rowspan="3">Scenario description #2</td><td>Updates requested by Charging Station</td></tr><tr><td>...</td></tr><tr><td>6. If chargingSchedule.duration is set and the setpoint/limit is not updated by [pulldynamicscheduleupdateresponse] after duration seconds, then the chargingSchedule ends and Charging Station will fall back to the next valid charging profile.a. If chargingSchedule.duration has not been set, then the chargingSchedule is valid indefinitely, until the charging profile is cleared or replaced by CSMS.</td></tr><tr><td colspan="3">...</td></tr></table>

The following requirements have been copied from Q05 to K28, because they are generic.

New requirements

<table><tr><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>K28.FR.13</td><td>When a ChargingProfileType has chargingProfileKind = Dynamic AND chargingSchedule.duration is set AND current time &gt; (chargingSchedule.duration + dynUpdateTime)</td><td>Charging Station SHALL consider the charging profile invalid and switch to using the next valid charging profile.</td><td>This is a fallback when CSMS is no longer responding within time set by duration.</td></tr><tr><td>K28.FR.14</td><td>K28.FR.13 AND Charging Station receives an update for limit or setpoint from CSMS via [updatedynamicschedulereques] or [pulldynamicscheduleupdateresponse]</td><td>Charging Station SHALL consider the charging profile eligible again as a valid profile.</td><td>This means the charging profile is valid again when a new update is received, assuming there is no other charging profile of higher stack level.</td></tr></table>

Having K28.FR.07 as precondition in K28.FR.09 is not correct.

Updated requirement

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>K28.FR.09</td><td>K28.FR.06 OR K28.FR.07 OR K28.FR.08</td><td>Charging Station SHALL set dynUpdateTime to current time.</td><td></td></tr><tr><td>New</td><td>K28.FR.09</td><td>K28.FR.06 OR K28.FR.07 OR K28.FR.08</td><td>Charging Station SHALL set dynUpdateTime to current time.</td><td></td></tr></table>

# 2.36. Page 399 - (2025-09) - K28.FR.10 Precondition not complete

Pulling a new schedule is, of course, only required when the dynUpdateInterval has elapsed.

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>K28.FR.10</td><td>When chargingProfileKind = Dynamic and dynUpdateInterval &gt; 0 in chargingProfile</td><td>Charging Station SHALL send a [pulldynamicscheduleupdaterequest] with chargingProfileId = chargingProfile.id to request an update of the chargingSchedulePeriod.</td><td></td></tr><tr><td>New</td><td>K28.FR.10</td><td>When chargingProfileKind = Dynamic and dynUpdateInterval &gt; 0 in chargingProfile AND dynUpdateTime + dynUpdateTime &gt;= &lt;current time&gt;</td><td>Charging Station SHALL send a [pulldynamicscheduleupdaterequest] with chargingProfileId = chargingProfile.id to request an update of the chargingSchedulePeriod.</td><td></td></tr></table>

New requirement

<table><tr><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>K28.FR.15</td><td>When a [cmnchargeringscheduetype] of a [cmnchargeringsprofiletype] with chargingProfileKind = Dynamic contains the field duration AND current time &gt; (chargingSchedule.duration + dynUpdateTime)</td><td>Charging Station SHALL consider the charging profile invalid and switch to using the next valid charging profile.</td><td>Field duration defines how long a the charging schedule remains valid after receipt of a [updatedynamicschedulereques t] or [pulldynamicscheduleupdateres ponse].</td></tr></table>

# 2.37. Page 400 - (2025-06) - K29 missing requirement about duration [882]

The scenarios have been updated to show how to deal with a limited duration of a dynamic charging profile.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Dynamic charging profiles from external system</td></tr><tr><td colspan="3">...</td></tr><tr><td rowspan="3"></td><td rowspan="3">Scenario description #1</td><td>Charging profile from external system with dynamic updates</td></tr><tr><td>...</td></tr><tr><td>5. If chargingSchedule.duration is set and the setpoint/limit is not updated by External System after duration seconds, then the chargingSchedule ends and Charging Station will fall back to the next valid charging profile.a. If chargingSchedule.duration has not been set, then the chargingSchedule is valid indefinitely, until the charging profile is cleared or replaced by External System.</td></tr><tr><td rowspan="2"></td><td rowspan="2">Scenario description #2</td><td>Charging profile from CSMS with dynamic updates from external system...</td></tr><tr><td>5. If chargingSchedule.duration is set and the setpoint/limit is not updated by External System after duration seconds, then the chargingSchedule ends and Charging Station will fall back to the next valid charging profile.#a. If chargingSchedule.duration has not been set, then the chargingSchedule is valid indefinitely, until the charging profile is cleared or replaced by CSMS.</td></tr><tr><td>8</td><td>Remarks</td><td>...It is advised to have a charging profile with a lower stack level present to fall back to, in case the dynamic charging profile is invalidated, because no update is provided within duration seconds.</td></tr></table>

The following requirements have been copied from Q05 to K29, because they are generic.

New requirements

<table><tr><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>K29.FR.07</td><td>When a ChargingProfileType has chargingProfileKind = Dynamic AND chargingSchedule.duration is set AND current time &gt; (chargingSchedule.duration + dynUpdateTime)</td><td>Charging Station SHALL consider the charging profile invalid and switch to using the next valid charging profile.</td><td>This is a fallback when CSMS or External System is no longer responding within time set by duration.</td></tr><tr><td>K29.FR.08</td><td>K29.FR.07 AND Charging Station receives an update for limit or setpoint from External System</td><td>Charging Station SHALL consider the charging profile eligible again as a valid profile.</td><td>This means the charging profile is valid again when a new update is received, assuming there is no other charging profile of higher stack level. (See also K29.FR.03)</td></tr></table>

# 2.38. Page 401 - (2025-06) - K29.FR.04: updated precondition to using dynamic profiles

K29.FR.04 only applies when Charging Station intends to use a dynamic charging profile. This is reflected by adding K29.FR.05 in precondition.

<table><tr><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr></table>

<table><tr><td>Old</td><td>K29.FR.04</td><td>NOT K29.FR.03 AND [configkey-external-constraints-profile-disallowed] is false or absent AND An external system provides a current or power limit (i.e. single value, not a schedule)</td><td>Charging Station SHALL represent this as a [cmnchargerprofiletype] with a single chargingSchedulePeriod, and having a chargingProfilePurpose = ChargingStationExternalConstraints with a chargingProfileKind = Dynamic.</td><td>The alternative, using a chargingProfileKind = Absolute, is described in K11.FR.06.</td></tr><tr><td>New</td><td>K29.FR.04</td><td>NOT K29.FR.03 AND K29.FR.05 AND [configkey-external-constraints-profile-disallowed] is false or absent AND An external system provides a current or power limit (i.e. single value, not a schedule)</td><td>Charging Station SHALL represent this as a [cmnchargerprofiletype] with a single chargingSchedulePeriod, and having a chargingProfilePurpose = ChargingStationExternalConstraints with a chargingProfileKind = Dynamic.</td><td>The alternative, using a chargingProfileKind = Absolute, is described in K11.FR. 06.</td></tr></table>

# 2.39. Page 402 - (2025-06) - K29.FR.05: Setpoint missing in precondition

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>K29.FR.05</td><td>When external system updates a limit AND Charging Station represents this as a Dynamic charging profile</td><td>Charging Station SHALL update the limit or setpoint in this charging profile.</td><td></td></tr><tr><td>New</td><td>K29.FR.05</td><td>When external system updates a limit or setpoint AND Charging Station represents this as a Dynamic charging profile</td><td>Charging Station SHALL update the limit or setpoint in this charging profile.</td><td></td></tr></table>

# 2.40. Page 447 - (2025-09) - N01.FR.12 - Improved definition

Updated requirement definition to clarify the AcceptedCanceled status.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Old</td><td>N01.FR.12</td><td>When a Charging Station is assembling or uploading the log file AND the Charging Station receives a new GetLogRequest</td><td>The Charging Station SHOULD cancel the ongoing log file upload AND respond with status AcceptedCanceled.</td></tr><tr><td>New</td><td>N01.FR.12</td><td>When a Charging Station is assembling or uploading the log file AND the Charging Station receives a new GetLogRequest</td><td>The Charging Station SHOULD cancel the ongoing log file upload AND respond GetLogResponse with status AcceptedCanceled.</td></tr></table>

# 2.41. Page 449 - (2025-09) - N02: changed empty to absent.

A number of requirements previously stated "empty" when they should have indicated "absent." For example, the phrases referring to monitoringCriteria and componentVariables being "empty" are incorrect. These arrays cannot be empty; they must be absent instead. This correction has been applied to all occurrences throughout section N02.

# 2.42. Page 450 - (2025-06) - N02.FR.13/23 monitoringCriteria DeltaMonitoring is used for TargetDelta [895]

There is no monitoring criteria TargetDeltaMonitoring. That is just DeltaMonitoring.

Change requirement

Deleted requirement

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>Old</td><td>N02.FR.13</td><td>If monitoringCriteria contains DeltaMonitoring</td><td>All monitors with type = Delta are reported.</td></tr><tr><td>New</td><td>N02.FR.13</td><td>If monitoringCriteria contains DeltaMonitoring</td><td>All monitors with type = Delta, TargetDelta and TargetDeltaRelative are reported.</td></tr></table>

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td></tr><tr><td>N02-FR.23 (2.1)</td><td>If monitoringCriteria contains TargetDeltaMonitoring</td><td>All monitors with type = TargetDelta and type = TargetDeltaRelative are reported.</td></tr></table>

# 2.43. Page 720 - (2025-06) - New configuration variable to allow TLS wildcard certificates

New configuration key

AllowCSMSTLSWildcards

<table><tr><td>Required</td><td colspan="3">no</td></tr><tr><td>Component</td><td>componentName</td><td colspan="2">SecurityCtrlr</td></tr><tr><td rowspan="3">Variable</td><td>ijklname</td><td colspan="2">AllowCSMSTLSWildcards</td></tr><tr><td>ijkl attributes</td><td>mutability</td><td>ReadWrite</td></tr><tr><td>ijklCharacteristics</td><td>dataType</td><td>boolean</td></tr><tr><td>Description</td><td colspan="3">This variable allows a Charging Station to support non-compliant OCPP behavior and connect to a CSMS that uses a wildcard TLS server certificate for the OCPP connection. If this variable is present it SHALL be ReadWrite. If this variable is not implemented or has value false, the OCPP-compliant behavior is that a Charging Station rejects a connection from a CSMS that presents a wildcard certificate. It is highly RECOMMENDED to not allow wildcard certificates.</td></tr></table>

# 2.44. Page 739 - (2025-09) - Error in description of AssociatedData interval variables [1043]

The Interval and TxEndedInterval variables of AlignmentDataCtrl mention an incorrect time and duration format (ISO8601) that is not supported by OCPP.

# 2.44.1.AlignedDataInterval

<table><tr><td>...</td><td>...</td></tr><tr><td>Description</td><td>Size (in seconds) of the clock-aligned data interval, intended to be transmitted in the MeterValuesRequest or TransactionEventRequest message. This is the size (in seconds) of the set of evenly spaced aggregation intervals per day, starting at 00:00:00 (midnight). For example, a value of 900 (15 minutes) indicates that every day should be broken into 96 15-minute intervals.
When clock-aligned data is being transmitted, the interval in question is identified by the start time and (optional) duration interval value, represented according to the ISO8601 standard.
A value of &quot;0&quot; (numeric zero), by convention, is to be interpreted to mean that no clock-aligned data should be transmitted.</td></tr></table>

# 2.44.2.AlignedDataTxEndInterval

<table><tr><td>...</td><td>...</td></tr><tr><td>Description</td><td>Size (in seconds) of the clock-aligned data interval, intended to be transmitted in the TransactionRequest (eventType = Ended) message. This is the size (in seconds) of the set of evenly spaced aggregation intervals per day, starting at 00:00:00 (midnight). For example, a value of 900 (15 minutes) indicates that every day should be broken into 96 15-minute intervals.
When clock-aligned data is being collected, the interval in question is identified by the start time and (optional) duration interval value, represented according to the ISO8601 standard. All intervals are transmitted (if so enabled) at the end of the transaction in 1 TransactionRequest (eventType = Ended) message.
This is not a recommended practice, since the size of the message can become very large.</td></tr></table>

# 2.44.3.AlignedDataUpstreamInterval

New in OCPP 2.1

<table><tr><td>...</td><td>...</td></tr><tr><td>Description</td><td>Size (in seconds) of the clock-aligned data interval, intended to be transmitted in the MeterValuesRequest message for location Upstream only. This is the size (in seconds) of the set of evenly spaced aggregation intervals per day, starting at 00:00:00 (midnight). For example, a value of 900 (15 minutes) indicates that every day should be broken into 96 15-minute intervals.
When clock-aligned data is being transmitted, the interval in question is identified by the start time and (optional) duration interval value, represented according to the ISO8601 standard. All &quot;per-period&quot; data (e.g. energy readings) should be accumulated (for &quot;flow&quot; type measurands such as energy), or averaged (for other values) across the entire interval, and transmitted (if so enabled) at the end of each interval, bearing the interval start time timestamp. • A value of &quot;0&quot; (numeric zero), by convention, is to be interpreted to mean that no clock-aligned data should be transmitted.</td></tr></table>

# 2.45. Page 492 - (2025-09) - Text instances of dischargingLimit instead of dischargeLimit

There were many instances of the word dischargingLimit being used in text or requirements of section Q, instead of the correct word dischargeLimit. This has been fixed globally.

# 2.46. Page 499 - (2025-06) - Additional V2X generic requirements

The phase-related requirement from K01 also apply to discharging and setpoint parameters in block Q.

New requirements

<table><tr><td>ID</td><td>Precondition</td><td>Requirement definition</td><td>Note</td></tr><tr><td>V2X.06</td><td></td><td>Any requirements for limit, dischargingLimit, setpoint and setpointReactive also apply to their equivalents with postfix _L2 and _L3</td><td></td></tr><tr><td>V2X.07</td><td></td><td>The postfixed L2 and L3 variants of limit, dischargingLimit, setpoint and setpointReactive can only occur in combination with the associated field without the postfix.</td><td>See K01.FR.145</td></tr><tr><td>V2X.08</td><td>When v2xChargingParameters of [notifyevchargingneed srequest] from Charging Station does not contain maxDischargePower_L2 and/or maxDischargePower_L3</td><td>CSMS SHALL NOT provide values for dischargeLimit_L2, dischargeLimit_L3, setpoint(Reactive)_L2 or setpoint(Reactive)_L3 fields in a charging profile.</td><td>If EV does not report L2/L3 fields then do not provide separate limits for them. See K01.FR.142.</td></tr><tr><td>V2X.09</td><td>When CSMS sends a [setchargingprofilerequest] for a chargingProfilePurpose other than TxProfile</td><td>CSMS SHALL NOT provide values for dischargeLimit_L2, dischargeLimit_L3, setpoint(Reactive)_L2 or setpoint(Reactive)_L3 fields in chargingSchedulePeriods of the charging profile</td><td>Only a TxProfile is submitted after receiving a NotifyEVChargingNeedsRequest. See K01.FR.143.</td></tr><tr><td>V2X.10</td><td>(V2X.08 OR V2X.09) AND Charging Station receives a [setchargingprofilerequest] with values for dischargeLimit_L2, dischargeLimit_L3, setpoint(Reactive)_L2 or setpoint(Reactive)_L3 fields in a charging profile</td><td>Charging Station SHALL respond with [setchargingprofileresponse] with status = Rejected and a statusInfo with reasonCode = "PhaseConflict".</td><td>See K01.FR.144.</td></tr></table>

# 2.47. Page 503 - (2025-06) - Q01.FR.05 Precondition needs to refer to ISO15118-serviceRenegotiationSupport

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>Q01.FR.05</td><td>Q01.FR.04</td><td>Charging Station SHOULD start a service renegotiation with EV for a different energy transfer service</td><td>This situation should not occur when an energy transfer is selected from the allowedEnergyTransfer list in theauthorizeResponse.</td></tr><tr><td>New</td><td>Q01.FR.05</td><td>Q01.FR.04 AND ISO15118(ServiceRenegotiationSupport = true</td><td>Charging Station SHALL start a service renegotiation with EV for a different energy transfer service and send a new NotifyEVChargingNeedsRequest</td><td>This situation should not occur when an energy transfer is selected from the allowedEnergyTransfer list in theauthorizeResponse.</td></tr></table>

# 2.48. Page 504 - (2025-09) - Q01.FR.02 Enhanced precondition to apply only for V2X

The need to send an EVCCID only applies for stations that are able to switch to V2X. This has been added to precondition.

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>Q01.FR.02</td><td>When Charging Station starts an ISO 15118-20 transaction</td><td>Charging Station SHALL add EVCCID to idToken in [transactioneventrequest](eventType=Started) in idToken不断增加Info.additionallyd Token and with idToken不断增加Info.type set to "EVCCID".</td><td>This transaction may become bidirectional. This is needed in case CSMS uses the EVCCID of vehicle to decide whether to allow V2X.</td></tr><tr><td>New</td><td>Q01.FR.02</td><td>When Charging Station's ISO15118Ctrlr.Enabled = true and V2XChargingCtrlr.Enabled = true AND When Charging Station starts an ISO 15118-20 transaction</td><td>Charging Station SHALL add EVCCID to idToken in [transactioneventrequest](eventType=Started) in idToken不断增加Info不断增加Id Token and with idToken不断增加Info.type set to "EVCCID".</td><td>This transaction may become bidirectional. This is needed in case CSMS uses the EVCCID of vehicle to decide whether to allow V2X.</td></tr></table>

# 2.49. Page 504 - (2025-09) - Q01.FR.07 Clarified difference Accepted and Processing

The difference between status Accepted and Processing was not mentioned in requirement, because that is described in use cases K18 and K19. As such, the requirement Q01.FR.07 could have been omitted in Q01, but since it is so essential to the use case flow, it was added to the requirements table. This errata clarifies the difference between Accepted and Processing and refers to K18 and K19.

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>Q01.FR.07</td><td>If CSMS accepts the requestedEnergyTransfer</td><td>CSMS SHALL respond with a [notifyevchargingneedsresponse] with status = Accepted or Processing.</td><td>Charging station can expect to receive a charging profile immediately or soon.</td></tr><tr><td>New</td><td>Q01.FR.07</td><td>If CSMS accepts the requestedEnergyTransfer</td><td>CSMS SHALL respond with a [notifyevchargingneedsresponse] with status = Accepted if able to provide a charging profile immediately or Processing if more time is needed to provide a charging profile.</td><td>See requirements K18/19.FR.03 and K18/19.FR.05. Charging station can expect to receive a charging profile immediately or soon.</td></tr></table>

# 2.50. Page 504 - (2025-09) - Q01.FR.08 Improved precondition

Q01.FR.08 had Q01.FR.01 as precondition, but they were contradicting each other about being able and not able to determine allowedEnergyTransfer. Relevant part of Q01.FR.01 precondition has been added to Q01.FR.08.

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>Q01.FR.08</td><td>Q01.FR.01 AND CSMS is not able to determine a list of allowedEnergyTranfer before sending the [authorizeresponse]</td><td>CSMS SHALL omit allowedEnergyTransfer from [authorization].</td><td>This can happen if it could not be determined within the short time span before the response has to be returned, e.g. because a third party has to be requested for permission.</td></tr><tr><td>New</td><td>Q01.FR.08</td><td>Q01.FR.01 AND Charging Station&#x27;s ISO15118Ctrlr.Enabled = true and V2XChargingCtrlr.Enabled = true AND CSMS receives an [authorization] AND CSMS is not able to determine a list of allowedEnergyTranfer before sending the [authorization]</td><td>CSMS SHALL omit allowedEnergyTransfer from [authorization].</td><td>This can happen if it could not be determined within the short time span before the response has to be returned, e.g. because a third party has to be requested for permission.</td></tr></table>

# 2.51. Page 503 - (2025-06) - Q01.FR.09 Wrong precondition

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>Q01.FR.09</td><td>Q01.FR.20</td><td>Charging Station SHALL send a [notifyevchargingneedsrequest] with evseld set to the EVSE used for this transaction and requestedEnergyTransfer set to its default energy transfer (charging only AC/DC) and availableEnergyTransfer set to the supported energy transfers.</td><td>Depending on type of EVSE this will be AC_single_phase, AC_two_phase, AC_three_phase or DC, DC_ACDP</td></tr><tr><td>New</td><td>Q01.FR.09</td><td>Q01.FR.08</td><td>Charging Station SHALL send a [notifyevchargingneedsrequest] with evseld set to the EVSE used for this transaction and requestedEnergyTransfer set to its default energy transfer (charging only AC/DC) and availableEnergyTransfer set to the supported energy transfers.</td><td>Depending on type of EVSE this will be AC_single_phase, AC_two_phase, AC_three_phase or DC, DC_ACDP</td></tr></table>

# 2.52. Page 504 - (2025-06) - Q02 Use case text not in line with Q02.FR.03

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>Starting in operationMode ChargingOnly before enabling V2X</td></tr><tr><td colspan="3">...</td></tr><tr><td></td><td>Scenario description</td><td>1. The Charging Station sends a [authorizerequest] with EVCCID of EV in additionInfo of idToken.
a. The CSMS cannot (yet) allow V2X and returns an [authorizeresponse] with idTokenInfo.status = Accepted and omits the field allowedEnergyTransfer.</td></tr><tr><td colspan="3">...</td></tr></table>

# 2.53. Page 513 - (2025-06) - Q05 add requirement about duration [822]

Requirement from K28 has been added that charging profile becomes valid again after an update of limit is received.

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Q05.FR.08</td><td>Q05.FR.07 AND Charging Station receives an update for limit, dischargingLimit or setpoint from External System</td><td>Charging Station SHALL consider the charging profile eligible again as a valid profile.</td><td>This means the charging profile is valid again when a new update is received, assuming there is no other charging profile of higher stack level.</td></tr></table>

# 2.54. Page 514 - (2025-06) - Prerequisite in use case Q06 updated

The use case Q06 contains a prerequisite about TxProfile or TxDefaultProfile which does not belong here.

<table><tr><td>No.</td><td>Type</td><td>Description</td></tr><tr><td>1</td><td>Name</td><td>External V2X control with a charging profile from an External System</td></tr><tr><td colspan="3">...</td></tr><tr><td>5</td><td>Prerequisites</td><td>For discharging, at least one of the active charging sessions must have an active TxProfile or TxDefaultProfile for V2X operations.
Configuration variable [configkey-external-control-signals-enabled] = true.
Configuration variable [configkey-external-constraints-profile-disallowed] = false or absent.</td></tr><tr><td colspan="3">...</td></tr></table>

# 2.55. Page 516 - (2025-06) - Q06.FR.11/12 can be combined [883]

Requirements Q06.FR.11 and Q06.FR.12 are overlapping and can be combined.

<table><tr><td></td><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>Q06.FR.11</td><td>Q06.FR.02 OR Q06.FR.04</td><td>Charging Station SHALL send a [notifycharginglimitrequest] with chargingLimitSource = EMS, isDynamic = true and with the received schedule in chargingSchedule to CSMS.</td><td>This chargingSchedule will only have a single period.</td></tr><tr><td>New</td><td>Q06.FR.11</td><td>(Q06.FR.02 OR Q06.FR.04) AND The value of limit, dischargingLimit setpoint, setpointReactive changes more than SmartChargingCtrl.LimitChangeSignificance</td><td>Charging Station SHALL send a [notifycharginglimitrequest] with chargingLimitSource = EMS, isDynamic = true and with the received schedule in chargingSchedule to CSMS.</td><td>This chargingSchedule will only have a single period. Also applies to L2 and L3 values.</td></tr></table>

Deleted requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Q06.FR.12</td><td>Q06.FR.07 AND The value of limit, dischargingLimit, setpoint, setpointReactive changes more than SmartChargingCtrl.LimitChangeSignificance</td><td>Charging Station SHALL send a [notifycharginglimitrequest] with chargingLimitSource = EMS, isDynamic = true and a schedule with the new values in chargingSchedule to CSMS.</td><td>Also applies to L2 and L3 values.</td></tr></table>

# 2.56. Page 517 - (2025-06) - Q06 add requirement about duration [822]

Requirement from K29 has been added that charging profile becomes valid again after an update of limit is received.

New requirement

<table><tr><td>ID</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td colspan="4">Dynamic duration</td></tr><tr><td>Q06.FR.40</td><td>When a ChargingProfileType has chargingProfileKind = Dynamic AND chargingSchedule.duration is set AND current time &gt; (chargingSchedule.duration + dynUpdateTime)</td><td>Charging Station SHALL consider the charging profile invalid and switch to using the next valid charging profile.</td><td>This is a fallback when External System is no longer responding within time set by duration. (Same as K29.FR.07)</td></tr><tr><td>Q06.FR.41</td><td>Q06.FR.40 AND Charging Station receives an update for limit, dischargingLimit or setpoint from External System</td><td>Charging Station SHALL consider the charging profile eligible again as a valid profile.</td><td>This means the charging profile is valid again when a new update is received, assuming there is no other charging profile of higher stack level.</td></tr></table>

# 2.57. Page 519 - (2025-09) - Q07 Added requirements

Q07 is a special case of CentralSetpoint, but some requirements were added for completeness.

New requirements

<table><tr><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td colspan="4">OperationMode CentralFrequency</td></tr><tr><td>Q07.FR.01</td><td>When Charging Station supports centrally controlled frequency support</td><td>Charging Station SHALL report the operation mode CentralFrequency in [configkey-v2xsupportedoperationmodes]</td><td></td></tr><tr><td>Q07.FR.02</td><td>When CSMS is providing centrally controlled frequency support via setpoints</td><td>CSMS SHALL send a [setchargingprofilerequest] message with chargingProfileKind = Dynamic and a single chargingSchedulePeriod that has operationMode = CentralFrequency.</td><td></td></tr><tr><td>Q07.FR.03</td><td>Q07.FR.02</td><td>CSMS SHALL NOT include fields limit and dischargeLimit in the [cmnchargeringscheduleperiodtype].</td><td>This also includes the L2 and L3 variants of those fields.</td></tr><tr><td>Q07.FR.04</td><td>Q07.FR.02</td><td>CSMS IS RECOMMENDED to set a duration of the chargingSchedule to prevent that the schedule remains active indefinitely when CSMS is unable to send any [updatedynamicschedulerequest] for whatever reason.</td><td></td></tr></table>

# 2.58. Page 522 - (2025-09) - Q08.FR.02/12 Requirement updates for aFRR

Changed requirement

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>Q08.FR.02</td><td>Q08.FR.01</td><td>The [cmnchargeringscheduleperiodtype] SHALL have a v2xFreqWattCurve with at least two [cmn_v2xfreqwattpointtype] elements, and a value for v2xBaseline.</td><td></td></tr><tr><td>New</td><td>Q08.FR.02</td><td>Q08.FR.01</td><td>The [cmnchargeringscheduleperiodtype] SHALL have a v2xFreqWattCurve with at least two [cmn_v2xfreqwattpointtype] elements, and a value for v2xBaseline, and optionally a v2xSignalWattCurve with at least to [cmn_v2xsignalwattpointtype] elements.</td><td></td></tr></table>

New requirements

<table><tr><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Q08.FR.12</td><td>When CSMS receives an aFRR signal from an external actor</td><td>CSMS SHALL send a [afrrsignalrequest] with timestamp set to current time and signal set to value received from external actor.</td><td>External actor is, for example, a TSO.</td></tr><tr><td colspan="4">Configuration</td></tr><tr><td>Q08.FR.20</td><td>When Charging Station supports local frequency support</td><td>Charging Station SHALL report the operation mode LocalFrequency in [configkey-v2xsupportedoperationmodes]</td><td></td></tr></table>

# 2.59. Page 550 - (2025-09) - R04 extra requirements to SetDERControlRequest [997]

A default control cannot have a startTime or duration. Requirements have been added to make this explicit. The mapping of(controlType to control fields has been made explicit.

New requirements

<table><tr><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>R04.FR.12</td><td></td><td>CSMS SHALL not send a [setdercontrolrequest] that has isdefault = true for a control that has astartTime and/or duration field</td><td>All controls except enterService and gradient have optionalstartTime, duration.</td></tr><tr><td>R04.FR.13</td><td>Charging Station receives a [settercontrolrequest] with isDefault = true AND a control that has astartTime and/or duration field</td><td>Charging Station SHALL respond with [settercontrolresponse] with status = Rejected</td><td>Default controls cannot have astartTime or duration.</td></tr><tr><td>R04.FR.14</td><td></td><td>CSMS SHALL not send [settercontrolrequest] that has isdefault = false for(controlType = EnterService or Gradients</td><td>These only exist as default controls.</td></tr><tr><td>R04.FR.15</td><td>Charging Station receives a [settercontrolrequest] with isDefault = false AND controlType = EnterService or Gradients</td><td>Charging Station SHALL respond with [settercontrolresponse] with status = Rejected</td><td></td></tr><tr><td>R04.FR.16</td><td></td><td>CSMS SHALL only provide in [settercontrolrequest] the control field that is related to(controlType, according to the following mapping: fixedPFAbsorb for FixedPFAbsorb, fixedPFInject for FixedPFInject, fixedVar for FixedVar, limitMaxDischarge for LimitMaxDischarge, freqDroop for FreqDroop, enterService for EnterService, gradient for Gradients, curve for all other controlTypes</td><td></td></tr><tr><td>R04.FR.17</td><td>Charging Station receives a [settercontrolrequest] with multiple controls or with a control that does not match(controlType</td><td>Charging Station SHALL respond with [settercontrolresponse] with status = Rejected</td><td>See R04.FR.16 for mapping of control fields to(controlType.</td></tr></table>

# 2.60. Page 551 - (2025-09) - R04 extra requirements to GetDERControlRequest [998]

Requirement added for the case where only isDefault is provided as a parameter.

New requirement

<table><tr><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>R04.FR.37</td><td>NOT R04.FR.30 AND Charging Station receives a [getdercontrolrequest] with a value for isDefault and no(controlType and no controlled</td><td>Charging Station SHALL return a status = Accepted and send one or more [reportdercontrolrequest] messages for all controls that match the value of isDefault.</td><td>This is used to request all default or all scheduled controls at once.</td></tr></table>

# 2.61. Page 551 - (2025-09) - R04 updated requirements to ClearDERControlRequest [999]

Requirements R04.FR.41 and R04.FR.42 have been simplified. The way that requirement R04.FR.45 was phrased, it always returns Accepted - even when no matching controls exist. Requirement R04.FR.46 has been added for clearing based on controlId.

Changed requirements

New requirement

<table><tr><td></td><td>ID.</td><td>Precondition</td><td>Requirements</td><td>Note</td></tr><tr><td>Old</td><td>R04.FR.41</td><td>Charging Station receives a [clearercontrolrequest] with no controlId and with a controlType that it supports, but that has not been set at the Charging Station for the specified value of isDefault</td><td>Charging Station returns a [clearercontrolresponse] with status = NotFound.</td><td></td></tr><tr><td>New</td><td>R04.FR.41</td><td>Charging Station receives a [clearercontrolrequest] with no controlId and with a controlType that it supports, but that has not been set at the Charging Station for the specified value of isDefault</td><td>Charging Station returns a [clearercontrolresponse] with status = NotFound.</td><td></td></tr><tr><td>Old</td><td>R04.FR.42</td><td>Charging Station receives a [clearercontrolrequest] with no controlType and with a controlId that has not been set for the given value of isDefault</td><td>Charging Station SHALL respond with [clearercontrolresponse] with status = NotFound.</td><td></td></tr><tr><td>New</td><td>R04.FR.42</td><td>Charging Station receives a [clearercontrolrequest] with no controlType and with a controlId that has not been set for the given value of isDefault</td><td>Charging Station SHALL respond with [clearercontrolresponse] with status = NotFound.</td><td></td></tr><tr><td>Old</td><td>R04.FR.45</td><td>Charging Station receives a [clearercontrolrequest] with no controlId and with a controlType that it supports and that is in use</td><td>Charging Station SHALL clear all controls that match the value of isDefault and(controlType in the request, and return a [clearercontrolresponse] with status = Accepted.</td><td>Return default or scheduled messages for controlType based on value of isDefault.</td></tr><tr><td>New</td><td>R04.FR.45</td><td>Charging Station receives a [clearercontrolrequest] with no controlId and with a controlType that it supports and that is in use</td><td>Charging Station SHALL clear all controls that match the value of isDefault and(controlType in the request, and return a [clearercontrolresponse] with status = Accepted.</td><td>Clear default or scheduled messages for controlType based on value of isDefault.</td></tr></table>

<table><tr><td>R04.FR.46</td><td>Charging Station receives a [clearercontrolrequest] with a controId that has been set for the given value of isDefault</td><td>Charging Station SHALL clear the control that matches the value of controId in the request, and return a [clearercontrolresponse] with status = Accepted.</td><td></td></tr></table>

# 2.62. Page 620 - (2025-06) - ChargingSchedulePeriodType limit description update

The sentence about allowing negative values has been removed, because that is not in line with requirements. The meaning of this field in case chargingRateUnit = A, was missing.

<table><tr><td>Field Name</td><td>Field Type</td><td>Card.</td><td>Description</td></tr><tr><td colspan="4">...</td></tr><tr><td>limit</td><td>decimal</td><td>0..1</td><td>Optional. Optional only when not required by the operationMode, as in CentralSetpoint, ExternalSetpoint, ExternalLimits, LocalFrequency, LocalLoadBalancing. Charging rate limit during the schedule period, in the applicable chargingRateUnit. This SHOULD be a non-negative value; a negative value is only supported for backwards compatibility with older systems that use a negative value to specify a discharging limit. The value is zero or positive. When using chargingRateUnit = w, this field represents the sum of the power of all phases, unless values are provided for L2 and L3, in which case this field represents phase L1. When using chargingRateUnit = A, this field represents the current on each phase, unless values are provided for L2 and L3, in which case the field represents phase L1.</td></tr><tr><td colspan="4">...</td></tr></table>

# 2.63. Page 703 - (2025-06) - Controller component PaymentCtrl added to list

The PaymentCtrl has been added to the list of controller components.

<table><tr><td>Controller Component</td><td>Description</td></tr><tr><td>...</td><td>...</td></tr><tr><td>PaymentCtrl (2.1)</td><td>Responsible for configuration relating to a payment terminal.</td></tr></table>

# 2.64. Page 750 - (2025-09) - TariffCostCtrlr.Enabled can be ReadOnly [934]

There are good reasons to allow TariffCostCtrlr.Enabled to be a ReadOnly variable. TariffCostCtrlr.Enabled[Cost] (CostEnabled) can be set to ReadOnly false when Local Cost Calculation is not supported, and only cost calculation from the CSMS is supported. In this case TariffCostCtrlr.Available[Cost] will also be false.

TariffCostCtrl.Enabled[Tariff] (TariffEnabled) can be set to ReadOnly true when the Charging Station only supports OCPP standardized tariff structures and no proprietary tariff structures. In this case TariffCostCtrl.Available[Tariff] will be true.

<table><tr><td>Required</td><td colspan="3">no</td></tr><tr><td>Component</td><td>componentName</td><td colspan="2">TariffCostCtrlr</td></tr><tr><td rowspan="4">Variable</td><td>variableName</td><td colspan="2">Enabled</td></tr><tr><td>variableInstance</td><td colspan="2">Tariff</td></tr><tr><td>variableAttributes</td><td>mutability</td><td>ReadWrite /ReadOnly</td></tr><tr><td>variableCharacteristics</td><td>dataType</td><td>boolean</td></tr><tr><td>Description</td><td colspan="3">...</td></tr><tr><td>variableInstance</td><td colspan="2">Cost</td></tr><tr><td>variableAttributes</td><td>mutability</td><td>ReadWrite /ReadOnly</td></tr><tr><td>variableCharacteristics</td><td>dataType</td><td>boolean</td></tr><tr><td>Description</td><td colspan="3">...</td></tr></table>

# 2.65. Appendix Page 51 - (2025-09) - Added connector type BatterySlot

The generic connector type BatterySlot for battery swap stations has been added to ConnectorEnum.Type.

New connector type

<table><tr><td>Value</td><td>Description</td></tr><tr><td>bBatterySlot</td><td>Slot of a battery swap station to accept battery cartridges (type unspecified)</td></tr></table>

Example representation of a battery swap station in device model

<table><tr><td>Connector</td><td>1</td><td>1</td><td></td><td>ConnectorType</td><td></td><td>Actual</td><td>b BatterySlot</td><td>string</td><td></td><td>false</td></tr><tr><td>Connector</td><td>2</td><td>1</td><td></td><td>ConnectorType</td><td></td><td>Actual</td><td>b BatterySlot</td><td>string</td><td></td><td>false</td></tr></table>

# 3. Part 3

Currently no new errata for OCPP 2.1 part 3.

# 4. Part 4

# 4.1. Page 16 - (2025-06) - 5.4 Reconnecting - reset backoff wait timer

The RetryBackOffWaitMinimum timer is to be used the first time it tries to connect. A sentence has been added to below paragraph to make it explicit that it needs to be reset after successful connection.

The first reconnection attempts SHALL be after a back-off time of: RetryBackOffWaitMinimum seconds, plus a random value with a maximum of RetryBackOffRandomRange seconds. After every failed reconnection attempt the Charging Station SHALL double the previous back-off time, with a maximum of RetryBackOffRepeatTimes, adding a new random value with a maximum of RetryBackOffRandomRange seconds to every reconnection attempt. After RetryBackOffRepeatTimes reconnection attempts, the Charging Station SHALL keep reconnecting with the last back-off time, not increasing it any further. After a successful connection the backoff wait timer SHALL be reset to RetryBackOffWaitMinimum seconds.

# 4.2. Page 21 - (2025-06) - 6.3 Connection loss - Allow Local Controller to keep connection open

The sentence in this section was too strict about requiring a Local Controller to always close the connection with its charging stations when the connection with CSMS is lost. The sentence has been updated in order to allow for Local Controller implementations that are able to manage the local charging stations locally (for a limited time) when the connection with CSMS is down.

<table><tr><td>Old text</td><td>Whenever one or more WebSocket connections between CSMS and the Local Controller are lost, the Local Controller SHALL close all corresponding WebSocket to the Charging Stations that are connected to it.</td></tr><tr><td>New text</td><td>Whenever one or more WebSocket connections between CSMS and the Local Controller are lost, the Local Controller SHALL close all corresponding WebSocket to the Charging Stations that are connected to it, unless the Local Controller is capable of responding to Charging Station requests, and forwards transaction-related requests to the CSMS once the connection is restored.</td></tr></table>
