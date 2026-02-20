# OCPP

# Table of Contents

Disclaimer 1

Version History 2

1. Introduction. 3

1.1. OCPP version 2.0.1. 3  
1.2. Terms and abbreviations 3  
1.3. References 4

2. New functionalities in OCPP2.0.1 5

2.1. Device Management 5  
2.2. Improvements for better handling of large amounts of transactions 5  
2.3. Improvements regarding cyber security 5  
2.4. Extended Smart Charging 5  
2.5. Support for ISO 15118 6  
2.6. Improvements for customer experience 6  
2.7. Transport Protocols: OCPP-J Improvements 6  
2.8. Minor changes/extensions 7

3. OCPP2.0.1DocumentationStructure 8

3.1. Overview of Specification Parts 8  
3.2. Functional Blocks 9  
3.3. All Functional Blocks and use cases 10

4. Basic implementation of OCPP 2.0.1 13

# Disclaimer

Copyright © 2010 - 2024 Open Charge Alliance. All rights reserved.

This document is made available under the _Creative Commons Attribution-NoDerivatives 4.0 International Public License_ (https://creativecommons.org/licenses/by-nd/4.0/legalcode).

Version History

<table><tr><td>Version</td><td>Date</td><td>Description</td></tr><tr><td>2.0.1 Edition 3</td><td>2024-05-06</td><td>OCPP 2.0.1 Edition 3. All errata from OCPP 2.0.1 Part 0 until and including Errata 2024-04 have been merged into this version of the specification.</td></tr><tr><td>2.0.1</td><td>2020-03-31</td><td>Final version of OCPP 2.0.1</td></tr><tr><td>2.0</td><td>2018-04-11</td><td>OCPP 2.0 April 2018
First release of this Introduction document</td></tr></table>

# 1. Introduction

Electric Vehicles (EVs) are becoming the new standard for mobility all over the world. This development is only possible with a good coverage of Charging Stations. To advance the roll out of charging infrastructure, open communication standards play a key role: to enable switching from charging network without necessarily replacing all the Charging Stations, to encourage innovation and cost effectiveness and to allow many and diverse players participate in this new industry.

Additionally, the EV charging infrastructure is part of the Smart Grid, a larger and still evolving ecosystem of actors, devices and protocols. In this Smart Grid ecosystem, open communications standards are key enablers for two-way power flows, real time information exchange, demand control and eMobility services.

The Open Charge Point Protocol (OCPP) is the industry-supported de facto standard for communication between a Charging Station and a Charging Station Management System (CSMS) and is designed to accommodate any type of charging technique. OCPP is an open standard with no cost or licensing barriers for adoption.

# 1.1. OCPP version 2.0.1

This specification defines version 2.0.1 of OCPP.

After the release of OCPP 2.0, some issues were found in OCPP 2.0. Some of these issues could not be fixed issuing errata to the specification text only, as has been done with OCPP 1.6, but required changes to the protocol's machine-readable schema definition files that cannot be backward compatible.

To prevent confusion in the market and possible interoperability issues in the field, OCA has decided to name this version: 2.0.1. OCPP 2.0.1 contains fixes for all the known issues, to date, not only the fixes to the messages.

This version replaces OCPP 2.0. OCA advises implementers of OCPP to no longer implement OCPP 2.0 and only use version 2.0.1 going forward.

Any mentions of "OCPP 2.0" refers to revision 2.0.1 unless specifically stated otherwise.

# 1.2. Terms and abbreviations

This section contains the terminology and abbreviations that are used throughout this document.

# 1.2.1. Terms

<table><tr><td>Term</td><td>Meaning</td></tr><tr><td>Charging Station</td><td>The Charging Station is the physical system where an EV can be charged. A Charging Station has one or more EVSEs.</td></tr><tr><td>Charging Station Management System (CSMS)</td><td>Charging Station Management System: manages Charging Stations and has the information for authorizing Users for using its Charging Stations.</td></tr><tr><td>Electric Vehicle Supply Equipment (EVSE)</td><td>An EVSE is considered as an independently operated and managed part of the Charging Station that can deliver energy to one EV at a time.</td></tr><tr><td>Energy Management System (EMS)</td><td>In this document this is defined as a device that manages the local loads (consumption and production) based on local and/or contractual constraints and/or contractual incentives. It has additional inputs, such as sensors and controls from e.g. PV, battery storage.</td></tr></table>

# 1.2.2. Abbreviations

<table><tr><td>Term</td><td>Meaning</td></tr><tr><td>CSO</td><td>Charging Station Operator</td></tr><tr><td>CSMS</td><td>Charging Station Management System</td></tr><tr><td>EMS</td><td>Energy Management System.</td></tr><tr><td>EV</td><td>Electric Vehicle</td></tr><tr><td>EVSE</td><td>Electric Vehicle Supply Equipment</td></tr><tr><td>RFID</td><td>Radio-Frequency Identification</td></tr></table>

# 1.3. References

Table 1. References

<table><tr><td>Reference</td><td>Description</td></tr><tr><td>[IEC61851-1]</td><td>IEC 61851-1 2017: EV conductive charging system - Part 1: General requirements. https://webstore.iec.ch/publication/33644</td></tr><tr><td>[IEC62559-2:2015]</td><td>Definition of the templates for use cases, actor list and requirements list. https://webstore.iec.ch/publication/22349</td></tr><tr><td>[ISO15118-1]</td><td>ISO 15118-1 specifies terms and definitions, general requirements and use cases as the basis for the other parts of ISO 15118. It provides a general overview and a common understanding of aspects influencing the charge process, payment and load leveling. https://webstore.iec.ch/publication/9272</td></tr><tr><td>[OCPP1.5]</td><td>http://www.openchargealliance.org/downloads/</td></tr><tr><td>[OCPP1.6]</td><td>http://www.openchargealliance.org/downloads/</td></tr></table>

# 2. New functionalities in OCPP2.0.1

OCPP 2.0.1 introduces new functionalities compared to OCPP 1.6 [OCPP1.6].

Due to improvements and new features, OCPP 2.0.1 is not backward compatible with OCPP 1.6 [OCPP1.6] or OCPP 1.5 [OCPP1.5].

# 2.1. Device Management

Device Management (also known as Device Model) is a long awaited feature especially welcomed by CSOs who manage a network of (complex) charging stations (from different vendors).

It provides the following functionality:

- Inventory reporting
- Improved error and state reporting
- Improved configuration
- Customizable Monitoring

This all should help CSOs to reduce the costs of operating a Charging Station network.

Charging Station Manufacturers are free to decide themselves how much details about a Charging Station they want to publish via Device Management: for example, they can decide what can be monitored, and what not.

# 2.2. Improvements for better handling of large amounts of transactions

# 2.2.1. One message for all transaction related functionalities

With the growing of the EV charging market, the number of Charging Stations and transactions that the CSMS needs to manage also grows. The structure and method for reporting transaction is unified in OCPP 2.0. In OCPP 1.x, the reporting of transaction data is split over the messages StartTransaction, StopTransaction, MeterValue and StatusNotification. With the market progressing towards more enhanced scheduling, a need is born for more sophisticated handling of transaction data. All the StartTransaction, StopTransaction, and transaction related MeterValue and StatusNotification messages are replaced by 'TransactionEvent'. The StatusNotification message still exists, but only for non-transaction related status notifications about connector availability.

# 2.2.2. Data reduction

With the introduction of JSON over Web sockets in OCPP 1.6 [OCPP1.6] a great reduction of mobile data cost can be achieved. With OCPP 2.0, support for WebSocket Compression is introduced, which reduces the amount of data even more.

# 2.3. Improvements regarding cyber security

The following improvements have been added to harden OCPP against cyber attacks:

Security profiles (3 levels) for Charging Station and/or CSMS authentication and Communication Security  
Key management for Client-Side certificates

- Secure firmware updates  
  Security event log

# 2.4. Extended Smart Charging

In OCPP 2.0.1 Smart Charging functionality has been extended (compared to OCPP 1.6 [OCPP1.6]) to support:

- Direct Smart Charging inputs from an Energy Management System (EMS) to a Charging Station
- Improved Smart Charging with a local controller
- Support for integrated smart charging of the CSMS, Charging Station and EV ([ISO15118-1]).

# 2.5. Support for ISO 15118

The ISO 15118 standard [ISO15118-1] is a newer protocol for EVSE to EV communication, compared to IEC 61851 [IEC61851-1]. ISO 15118 allows a lot of new features and more secure communication between EVSE and EV. OCPP 2.0.1 supports the ISO 15118 standard, the newly added features are:

Plug & Charge

- Smart Charging including input from the EV

# 2.6. Improvements for customer experience

# 2.6.1. More authorization options

OCPP 1.x was designed (mainly) for Charging Stations that authorize an EV driver via an RFID card-token. If other authorization systems or a mix of systems are used, the CSMS needs to know what system is used for which authorization. OCPP 2.0.1 has been extended to support things like: 15118 Plug & Charge [ISO15118-1], Payment Terminals, local mechanical key, Smart-phones, etc.

# 2.6.2. Display Messages

This provides Charging Station Operators with the possibility to configure - from the CSMS - a message on a Charging Station to be displayed to EV drivers. Messages can be transaction related or global.

# 2.6.3. EV Driver preferred languages

To be able to show messages to an EV driver in a language the driver understands best, OCPP 2.0.1 provides the possibility to send the language preference of a driver to a Charging Station.

# 2.6.4. Tariff and Costs

OCPP 2.0.1 allows Charging Stations to show the applicable tariff/price before an EV driver starts charging, to show the running total cost during a charging transaction and/or to show the final total cost after the transaction is finished.

# 2.7. Transport Protocols: OCPP-J Improvements

# 2.7.1. Simple Message routing

A description has been added on how to create a simple solution for OCPP message routing in, for example, a Local Controller. This is defined in Part 4, Section 6: OCPP Routing.

# 2.7.2. No SOAP Support

OCPP 2.0.1 no longer supports SOAP as a transport protocol. This decision was taken by the OCA members, who believe that the protocol does no longer lend itself for constrained computing resources that many Charging Stations operate under. The verbosity of the protocol could lead to slower performance and requires a higher bandwidth, which, in many cases, leads to higher cellular costs. SOAP is also difficult to support when communication is via local site networking.

Edition 3 FINAL, 2024-05-06

# 2.8. Minor changes/extensions

# 2.8.1. Renamed messages

In the OCPP 1.x series, the names of all messages were kept unchanged for backward compatibility, even though some message names were found to be confusing or misleading in practice. In OCPP 2.0.1 message names have been changed, where appropriate, to improve clarity and understanding.

Example: RemoteStartTransaction.req: a lot of implementers though it meant the Charging Station should start the transaction, but in fact it is a request to try to start a transaction. However, for example, if no cable is plugged in, no transaction can be started. Since the message was always intended to be a request, it has been changed to a more logical name: RequestStartTransactionRequest.

# 2.8.2. TransactionId Identification & Message Sequencing

In OCPP 2.0, transaction identifiers are generated by the Charging Station, to facilitate offline charging sessions, in contrast to OCPP 1.x, where transaction identifiers were generated at the CSMS and sent to the Charging Station. In addition, all messages relating to a transaction are assigned incremental sequence numbering, to facilitate transaction data completeness checking at the CSMS.

# 2.8.3. Extended enumerations

Many enumerations have been extended to support more use cases, provide more options etc.

# 2.8.4. Offline Transaction Event Indication

Charging Stations can optionally indicate in transaction messages that a transaction event occurred while the Charging Station was Offline. This can assist a CSMS with the processing of transactions.

# 2.8.5. Personal message

Message that can be shown to the EV Driver and can be used for tariff information, user greetings and for indicating why a driver is not authorized to charge. When a driver uses an authorization method (RFID for example) and the CSMS does not authorize the driver to start charging, this field can thus contain additional reasons to provide the driver with a meaningful explanation why (s)he is not allowed to charge.

# 3. OCPP 2.0.1 Documentation Structure

# 3.1. Overview of Specification Parts

The overall structure of the standard has been improved, making the new specification easier to read, implement and test.

For readability and implementation purposes, OCPP 2.0.1 is divided in seven parts.

Table 2. Parts

<table><tr><td>Part 0</td><td>Introduction (this document)</td></tr><tr><td>Part 1</td><td>Architecture &amp; Topology</td></tr><tr><td>Part 2</td><td>Specification: 
Use Cases and Requirements, Messages, Data Types and Referenced Components and Variables 
Appendices: 
Security Events, Standardized Units of Measure, Components and Variables</td></tr><tr><td>Part 3</td><td>Schemas</td></tr><tr><td>Part 4</td><td>Implementation Guide JSON</td></tr><tr><td>Part 5</td><td>Certification Profiles</td></tr><tr><td>Part 6</td><td>Test Cases</td></tr></table>

In contrast to OCPP 1.6 [OCPP1.6], the OCPP 2.0.1 specification is written in a different structure, based on [IEC62559-2:2015]: "Use case methodology - Part 2: Definition of the template for use cases, actor list and requirements list".

Part 2, the specification, is divided into 'Functional Blocks'. These Functional Blocks contain use cases and requirements.

Messages, Data Types and Referenced Components and Variables are described at the end of the document. The Appendices can be found in the separate document: Part 2 - Appendices.

Messages and Data Types are structured in almost the same way as the previous OCPP specification [OCPP1.6].

# 3.2. Functional Blocks

OCPP 2.0.1 consists of the following Functional Blocks.

Table 3. Functional Blocks

<table><tr><td>Clause</td><td>Functional Block Title</td><td>Description</td></tr><tr><td>A.</td><td>Security</td><td>This Functional Block describes a security specification for the OCPP protocol.</td></tr><tr><td>B.</td><td>Provisioning</td><td>This Functional Block describes all the functionalities that help a CSO provision their Charging Stations, allowing them to be registered and accepted on their network and retrieving basic configuration information from these Charging Stations.</td></tr><tr><td>C.</td><td>Authorization</td><td>This Functional Block describes all the authorization related functionality:authorizeRequest message handling/behavior and Authorization Cache functionality.</td></tr><tr><td>D.</td><td>Local Authorization List Management</td><td>This Functional Block describes functionality for managing the Local Authorization List.</td></tr><tr><td>E.</td><td>Transactions</td><td>This Functional Block describes the basic OCPP Transaction related functionality for transactions that are started/stopped on the Charging Station.</td></tr><tr><td>F.</td><td>Remote Control</td><td>This Functional Block describes three types of use cases for remote control management from the CSMS: Remote Transaction Control, Unlocking a Connector and Remote Trigger.</td></tr><tr><td>G.</td><td>Availability</td><td>This functional Block describes the functionality of sending status notification messages.</td></tr><tr><td>H.</td><td>Reservation</td><td>This Functional Block describes the reservation functionality of a Charging Station.</td></tr><tr><td>I.</td><td>Tariff and Cost</td><td>This Functional Block provides tariff and cost information to an EV Driver, when a Charging Station is capable of showing this on a display. Before a driver starts charging tariff information needs to be given, detailed prices for all the components that make up the tariff plan applicable to this driver at this Charging Station. During charging the EV Driver needs to be shown the running total cost, updated at a regular, fitting interval. When the EV Driver stops charging the total cost of this transaction needs to be shown.</td></tr><tr><td>J.</td><td>Metering</td><td>This Functional Block describes the functionality for sending meter values, on a periodic sampling and/or clock-aligned timing basis.</td></tr><tr><td>K.</td><td>Smart Charging</td><td>This Functional Block describes all the functionality that enables the CSO (or indirectly a third party) to influence the charging current/power of a charging session, or set limits to the amount of power/current a Charging Station can offer to an EV.</td></tr><tr><td>L.</td><td>Firmware Management</td><td>This Functional Block describes the functionality that enables a CSO to update the firmware of a Charging Station.</td></tr><tr><td>M.</td><td>ISO 15118 Certificate Management</td><td>This Functional Block provides the installation and update of ISO 15118 certificates.</td></tr><tr><td>N.</td><td>Diagnostics</td><td>This Functional Block describes the functionality that enables a CSO to request and track the upload of a diagnostics file from a Charging Station, and to manage the monitoring of Charging Station data.</td></tr><tr><td>O.</td><td>Display Message</td><td>With the DisplayMessage feature OCPP enables a CSO to display a message on a Charging Station, that is not part of the firmware of the Charging Station. The CSO gets control over these messages: the CSO can set, retrieve (get), replace and clear messages.</td></tr><tr><td>P.</td><td>Data Transfer</td><td>This Functional Block describes the functionality that enables a party to add custom commands to OCPP, enabling custom extension to OCPP.</td></tr></table>

# 3.3. All Functional Blocks and use cases

The following table shows the full list of use cases supported by OCPP 2.0.1 and which use cases were already supported by OCPP 1.6 [OCPP1.6].

<table><tr><td>Clause</td><td>Functional Block</td><td>UC ID</td><td>Use case name</td><td>OCPP 1.6</td><td>New in OCPP 2.0.1</td></tr><tr><td>A</td><td>Security</td><td>A01</td><td>Update Charging Station Password for HTTP Basic Authentication</td><td></td><td>o</td></tr><tr><td></td><td></td><td>A02</td><td>Update Charging Station Certificate by request of CSMS</td><td></td><td>o</td></tr><tr><td></td><td></td><td>A03</td><td>Update Charging Station Certificate initiated by the Charging Station</td><td></td><td>o</td></tr><tr><td></td><td></td><td>A04</td><td>Security Event Notification</td><td></td><td>o</td></tr><tr><td>B</td><td>Provisioning</td><td>B01</td><td>Cold Boot Charging Station</td><td>o</td><td></td></tr><tr><td></td><td></td><td>B02</td><td>Cold Boot Charging Station - Pending</td><td>o</td><td></td></tr><tr><td></td><td></td><td>B03</td><td>Cold Boot Charging Station - Rejected</td><td>o</td><td></td></tr><tr><td></td><td></td><td>B04</td><td>Offline Behavior Idle Charging Station</td><td>o</td><td></td></tr><tr><td></td><td></td><td>B05</td><td>Set Variables</td><td></td><td>o</td></tr><tr><td></td><td></td><td>B06</td><td>Get Variables</td><td></td><td>o</td></tr><tr><td></td><td></td><td>B07</td><td>Get Base Report</td><td></td><td>o</td></tr><tr><td></td><td></td><td>B08</td><td>Get Custom Report</td><td></td><td>o</td></tr><tr><td></td><td></td><td>B09</td><td>Setting a new NetworkConnectionProfile</td><td></td><td>o</td></tr><tr><td></td><td></td><td>B10</td><td>Migrate to new CSMS</td><td></td><td>o</td></tr><tr><td></td><td></td><td>B11</td><td>Reset - Without Ongoing Transaction</td><td>o</td><td></td></tr><tr><td></td><td></td><td>B12</td><td>Reset - With Ongoing Transaction</td><td>o</td><td></td></tr><tr><td>C</td><td>Authorization</td><td>C01</td><td>EV Driver Authorization using RFID</td><td>o</td><td></td></tr><tr><td></td><td></td><td>C02</td><td>Authorization using a start button</td><td></td><td>o</td></tr><tr><td></td><td></td><td>C03</td><td>Authorization using credit/debit card</td><td></td><td>o</td></tr><tr><td></td><td></td><td>C04</td><td>Authorization using PIN-code</td><td></td><td>o</td></tr><tr><td></td><td></td><td>C05</td><td>Authorization for CSMS initiated transactions</td><td></td><td>o</td></tr><tr><td></td><td></td><td>C06</td><td>Authorization using local id type</td><td></td><td>o</td></tr><tr><td></td><td></td><td>C07</td><td>Authorization using Contract Certificates</td><td></td><td>o</td></tr><tr><td></td><td></td><td>C08</td><td>Authorization at EVSE using ISO 15118 External Identification Means (EIM)</td><td></td><td>o</td></tr><tr><td></td><td></td><td>C09</td><td>Authorization by GroupId</td><td>o</td><td></td></tr><tr><td></td><td></td><td>C10</td><td>Store Authorization Data in the Authorization Cache</td><td>o</td><td></td></tr><tr><td></td><td></td><td>C11</td><td>Clear Authorization Data in Authorization Cache</td><td>o</td><td></td></tr><tr><td></td><td></td><td>C12</td><td>Start Transaction - Cached Id</td><td>o</td><td></td></tr><tr><td></td><td></td><td>C13</td><td>Offline Authorization through Local Authorization List</td><td>o</td><td></td></tr><tr><td></td><td></td><td>C14</td><td>Online Authorization through Local Authorization List</td><td>o</td><td></td></tr><tr><td></td><td></td><td>C15</td><td>Offline Authorization of unknown Id</td><td>o</td><td></td></tr><tr><td></td><td></td><td>C16</td><td>Stop Transaction with a Master Pass</td><td></td><td>o</td></tr><tr><td>D</td><td>LocalAuthorizationList</td><td>D01</td><td>Send Local Authorization List</td><td>o</td><td></td></tr><tr><td></td><td></td><td>D02</td><td>Get Local List Version</td><td>o</td><td></td></tr><tr><td>E</td><td>Transactions</td><td>E01</td><td>Start Transaction Options</td><td></td><td>o</td></tr><tr><td></td><td></td><td>E02</td><td>Start Transaction - Cable Plugin First</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E03</td><td>Start Transaction - IdToken First</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E04</td><td>Transaction started while Charging Station is offline</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E05</td><td>Start Transaction - Id not Accepted</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E06</td><td>Stop Transaction Options</td><td></td><td>o</td></tr><tr><td></td><td></td><td>E07</td><td>Transaction locally stopped by IdToken</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E08</td><td>Transaction stopped while Charging Station is offline</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E09</td><td>When cable disconnected on EV-side: Stop Transaction</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E10</td><td>When cable disconnected on EV-side: Suspend Transaction</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E11</td><td>Connection Loss During Transaction</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E12</td><td>Inform CSMS of an Offline Occurred Transaction</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E13</td><td>Transaction related message not accepted by CSMS</td><td>o</td><td></td></tr><tr><td></td><td></td><td>E14</td><td>Check transaction status</td><td></td><td>o</td></tr><tr><td></td><td></td><td>E15</td><td>End of charging process</td><td>o</td><td></td></tr><tr><td>F</td><td>RemoteControl</td><td>F01</td><td>Remote Start Transaction - Cable Plugin First</td><td>o</td><td></td></tr><tr><td></td><td></td><td>F02</td><td>Remote Start Transaction - Remote Start First</td><td>o</td><td></td></tr><tr><td></td><td></td><td>F03</td><td>Remote Stop Transaction</td><td>o</td><td></td></tr><tr><td></td><td></td><td>F04</td><td>Remote Stop ISO 15118 charging from CSMS</td><td></td><td>o</td></tr><tr><td></td><td></td><td>F05</td><td>Remotely Unlock Connector</td><td>o</td><td></td></tr><tr><td></td><td></td><td>F06</td><td>Trigger Message</td><td>o</td><td></td></tr><tr><td>G</td><td>Availability</td><td>G01</td><td>Status Notification</td><td>o</td><td></td></tr><tr><td></td><td></td><td>G02</td><td>Heartbeat</td><td>o</td><td></td></tr><tr><td></td><td></td><td>G03</td><td>Change Availability EVSE</td><td>o</td><td></td></tr><tr><td></td><td></td><td>G04</td><td>Change Availability Charging Station</td><td>o</td><td></td></tr><tr><td></td><td></td><td>G05</td><td>Lock Failure</td><td>o</td><td></td></tr><tr><td>H</td><td>Reservation</td><td>H01</td><td>Reservation</td><td>o</td><td></td></tr><tr><td></td><td></td><td>H02</td><td>Cancel Reservation</td><td>o</td><td></td></tr><tr><td></td><td></td><td>H03</td><td>Use a reserved EVSE</td><td>o</td><td></td></tr><tr><td></td><td></td><td>H04</td><td>Reservation Ended, not used</td><td>o</td><td></td></tr><tr><td>I</td><td>Tariff and Costs</td><td>I01</td><td>Show EV Driver-specific tariff information</td><td></td><td>o</td></tr><tr><td></td><td></td><td>I02</td><td>Show EV Driver running total cost during charging</td><td></td><td>o</td></tr><tr><td></td><td></td><td>I03</td><td>Show EV Driver final total cost after charging</td><td></td><td>o</td></tr><tr><td></td><td></td><td>I04</td><td>Show fallback tariff information</td><td></td><td>o</td></tr><tr><td></td><td></td><td>I05</td><td>Show fallback total cost message</td><td></td><td>o</td></tr><tr><td></td><td></td><td>I06</td><td>Update Tariff Information During Transaction</td><td></td><td>o</td></tr><tr><td>J</td><td>Metering</td><td>J01</td><td>Sending Meter Values not related to a transaction</td><td>o</td><td></td></tr><tr><td></td><td></td><td>J02</td><td>Sending transaction related Meter Values</td><td>o</td><td></td></tr><tr><td></td><td></td><td>J03</td><td>Charging Loop with metering information exchange</td><td></td><td>o</td></tr><tr><td>K</td><td>SmartCharging</td><td>K01</td><td>SetChargingProfile</td><td>o</td><td></td></tr><tr><td></td><td></td><td>K02</td><td>Central Smart Charging</td><td>o</td><td></td></tr><tr><td></td><td></td><td>K03</td><td>Local Smart Charging</td><td>o</td><td></td></tr><tr><td></td><td></td><td>K04</td><td>Internal Load Balancing</td><td>o</td><td></td></tr><tr><td></td><td></td><td>K05</td><td>Remote Start Transaction with Charging Profile</td><td>o</td><td></td></tr><tr><td></td><td></td><td>K06</td><td>Offline Behavior Smart Charging During Transaction</td><td>o</td><td></td></tr><tr><td></td><td></td><td>K07</td><td>Offline Behavior Smart Charging at Start of Transaction</td><td>o</td><td></td></tr><tr><td></td><td></td><td>K08</td><td>Get Composite Schedule</td><td>o</td><td></td></tr><tr><td></td><td></td><td>K09</td><td>Get Charging Profiles</td><td></td><td>o</td></tr><tr><td></td><td></td><td>K10</td><td>Clear Charging Profile</td><td>o</td><td></td></tr><tr><td></td><td></td><td>K11</td><td>Set / Update External Charging Limit With Ongoing Transaction</td><td></td><td>o</td></tr><tr><td></td><td></td><td>K12</td><td>Set / Update External Charging Limit Without Ongoing Transaction</td><td></td><td>o</td></tr><tr><td></td><td></td><td>K13</td><td>Reset / release external charging limit</td><td></td><td>o</td></tr><tr><td></td><td></td><td>K14</td><td>External Charging Limit with Local Controller</td><td></td><td>o</td></tr><tr><td></td><td></td><td>K15</td><td>Charging with load leveling based on High Level Communication</td><td></td><td>o</td></tr><tr><td></td><td></td><td>K16</td><td>Optimized charging with scheduling to the CSMS</td><td></td><td>o</td></tr><tr><td></td><td></td><td>K17</td><td>Renegotiating a Charging Schedule</td><td></td><td>o</td></tr><tr><td>L</td><td>Firmware Management</td><td>L01</td><td>Secure Firmware Update</td><td></td><td>o</td></tr><tr><td></td><td></td><td>L02</td><td>Non-Secure Firmware Update</td><td>o</td><td></td></tr><tr><td></td><td></td><td>L03</td><td>Publish Firmware file on Local Controller</td><td></td><td>o</td></tr><tr><td></td><td></td><td>L04</td><td>Unpublish Firmware file on Local Controller</td><td></td><td>o</td></tr><tr><td>M</td><td>ISO 15118 Certificate Management</td><td>M01</td><td>Certificate Installation EV</td><td></td><td>o</td></tr><tr><td></td><td></td><td>M02</td><td>Certificate Update EV</td><td></td><td>o</td></tr><tr><td></td><td></td><td>M03</td><td>Retrieve list of available certificates from a Charging Station</td><td></td><td>o</td></tr><tr><td></td><td></td><td>M04</td><td>Delete a specific certificate from a Charging Station</td><td></td><td>o</td></tr><tr><td></td><td></td><td>M05</td><td>Install CA certificate in a Charging Station</td><td></td><td>o</td></tr><tr><td></td><td></td><td>M06</td><td>Get Charging Station Certificate status</td><td></td><td>o</td></tr><tr><td>N</td><td>Diagnostics</td><td>N01</td><td>Retrieve Log Information</td><td>o</td><td></td></tr><tr><td></td><td></td><td>N02</td><td>Get Monitoring report</td><td></td><td>o</td></tr><tr><td></td><td></td><td>N03</td><td>Set Monitoring Base</td><td></td><td>o</td></tr><tr><td></td><td></td><td>N04</td><td>Set Variable Monitoring</td><td></td><td>o</td></tr><tr><td></td><td></td><td>N05</td><td>Set Monitoring Level</td><td></td><td>o</td></tr><tr><td></td><td></td><td>N06</td><td>Clear / Remove Monitoring</td><td></td><td>o</td></tr><tr><td></td><td></td><td>N07</td><td>Alert Event</td><td></td><td>o</td></tr><tr><td></td><td></td><td>N08</td><td>Periodic Event</td><td></td><td>o</td></tr><tr><td></td><td></td><td>N09</td><td>Get Customer Information</td><td></td><td>o</td></tr><tr><td></td><td></td><td>N10</td><td>Clear Customer Information</td><td></td><td>o</td></tr><tr><td>O</td><td>Display Message</td><td>001</td><td>Set DisplayMessage</td><td></td><td>o</td></tr><tr><td></td><td></td><td>002</td><td>Set DisplayMessage for Transaction</td><td></td><td>o</td></tr><tr><td></td><td></td><td>003</td><td>Get All DisplayMessages</td><td></td><td>o</td></tr><tr><td></td><td></td><td>004</td><td>Get Specific DisplayMessages</td><td></td><td>o</td></tr><tr><td></td><td></td><td>005</td><td>Clear a DisplayMessage</td><td></td><td>o</td></tr><tr><td></td><td></td><td>006</td><td>Replace DisplayMessage</td><td></td><td>o</td></tr><tr><td>P</td><td>DataTransfer</td><td>P01</td><td>Data Transfer to the Charging Station</td><td>o</td><td></td></tr><tr><td></td><td></td><td>P02</td><td>Data Transfer to the CSMS</td><td>o</td><td></td></tr></table>

# NOTE

OCPP is used in many different regions and for many different charging solutions. Not all functionalities offered by OCPP 2.0.1 will be applicable to all implementations. Implementers can decide what specific functionalities apply to their charging solution.

For interoperability purposes, the Open Charge Alliance introduces Certification Profiles in Part 5 of the specification.

# 4. Basic implementation of OCPP 2.0.1

This section is informative.

The OCPP protocol describes a large number of use cases and messages, which are not all needed to implement a basic Charging Station or CSMS. The table below lists messages that are typically implemented to deliver basic functionality for an OCPP managed Charging Station. The purpose of this list is to guide developers that are new to OCPP.

Please note: this table does not define what needs to be done to become OCPP 2.0.1 "certified". The functionality that is to be implemented to become OCPP 2.0.1 certified is described in Part 5 of the specification, "Certification Profiles".

Table 4. OCPP 2.0.1 Basic Implementation

<table><tr><td>Functionality</td><td>Use cases</td><td>Messages</td></tr><tr><td>Booting a Charging Station</td><td>B01-B04</td><td>BootNotification</td></tr><tr><td>Configuring a Charging Station</td><td>B05-B07</td><td>SetVariables, GetVariables and GetReportBase (respond correctly to requests with reportBase = ConfigurationInventory, FullInventory and SummaryInventory).</td></tr><tr><td>Resetting a Charging Station</td><td>B11-B12</td><td>Reset</td></tr><tr><td>Authorization options</td><td>One of C01, C02 and C04</td><td>authorize</td></tr><tr><td>Transaction mechanism</td><td>E01 (one of S1-S6), E02-E03, E05, E06 (one of S1-S6), E07-E08, One of E09-E10, E11-E13</td><td>TransactionEvent</td></tr><tr><td>Availability</td><td>G01, G03-G04</td><td>Only ChangeAvailability and StatusNotification.</td></tr><tr><td>Monitoring Events</td><td>G05, N07</td><td>A basic implementation of the NotifyEvent message to be used to report operational state changes and problem/error conditions of the Charging Station, e.g. for Lock Failure. Also used for reporting built-in monitoring events.</td></tr><tr><td>Sending transaction related Meter values</td><td>J02</td><td>TransactionEvent</td></tr><tr><td>DataTransfer</td><td>P01-P02</td><td>Any OCPP implementations should at least be able to reject any request for DataTransfer if no (special) functionality is implemented.</td></tr></table>

NOTE Please also refer to the section on Minimum Device Model in part 1.
