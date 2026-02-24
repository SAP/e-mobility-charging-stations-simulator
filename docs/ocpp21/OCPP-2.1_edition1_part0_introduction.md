# OCPP

# Table of Contents

Disclaimer 1

Version History 2

1. Introduction. 3

1.1. OCPP version 2.1 3  
1.2. Terms and abbreviations 3  
1.3. References 5

2. New functionality in OCPP 2.1 6

3. OCPP2.1 Documentation Structure. 8

3.1. Overview of Specification Parts 8  
3.2. Functional Blocks 9  
3.3. All Functional Blocks and use cases 10

4. Basic implementation of OCPP 2.1 15

# Disclaimer

Copyright © 2010 - 2025 Open Charge Alliance. All rights reserved.

This document is made available under the _Creative Commons Attribution-NoDerivatives 4.0 International Public License_ (https://creativecommons.org/licenses/by-nd/4.0/legalcode).

# Version History

<table><tr><td>Version</td><td>Date</td><td>Description</td></tr><tr><td>2.1 Edition 1</td><td>2025-01-23</td><td>OCPP 2.1 Edition 1</td></tr></table>

# Chapter 1. Introduction

Electric Vehicles (EVs) are becoming the new standard for mobility all over the world. This development is only possible with a good coverage of Charging Stations. To advance the roll out of charging infrastructure, open communication standards play a key role: to enable switching from charging network without necessarily replacing all the Charging Stations, to encourage innovation and cost effectiveness and to allow many and diverse players participate in this new industry.

Additionally, the EV charging infrastructure is part of the Smart Grid, a larger and still evolving ecosystem of actors, devices and protocols. In this Smart Grid ecosystem, open communications standards are key enablers for two-way power flows, real time information exchange, demand control and eMobility services.

The Open Charge Point Protocol (OCPP) is the industry-supported de facto standard for communication between a Charging Station and a Charging Station Management System (CSMS) and is designed to accommodate any type of charging technique. OCPP is an open standard with no cost or licensing barriers for adoption.

# 1.1. OCPP version 2.1

This specification defines version 2.1 of OCPP.

Version 2.1 is an extension of OCPP 2.0.1. OCPP 2.1 has its own JSON schemas, but the schemas are OCPP 2.0.1 schemas that have been extended with optional fields that are used by OCPP 2.1 functionality. With the minor exceptions mentioned below, all application logic developed for OCPP 2.0.1 will continue to work in OCPP 2.1 without any changes. The new features of OCPP 2.1, of course, require new application logic.

# Use case A02 & A03

The application logic in a CSMS for OCPP 2.0.1 for use cases A02 & A03 requires a small change in order to work in OCPP 2.1.

The SignCertificateRequest message has been extended with a requestId field, such that the resulting

CertificateSignedRequest message can be accurately mapped to the request that initiated it. Use of requestId is optional for

Charging Station, but when present, CSMS will have to use it in the subsequent CertificateSignedRequest message.

Note, that the updated application logic remains valid to use in OCPP 2.0.1.

# Use case N02

The application logic in a Charging Station for OCPP 2.0.1 for use case N02 requires a small change in order to work for OCPP 2.1.

The message NotifyMonitoringReportRequest has been extended with a required field in VariableMonitoringType: eventNotificationType. Charging Station has to provide this field. It provides essential information to CSMS about the type of monitor (HardWiredMonitor, PreconfiguredMonitor, CustomMonitor) that was missing in OCPP 2.0.1. Existing OCPP 2.0.1 logic in a CSMS that is not aware of this new field, will continue to work.

# 1.2. Terms and abbreviations

This section contains the terminology and abbreviations that are used throughout this document.

# 1.2.1. Terms

<table><tr><td>Term</td><td>Meaning</td></tr><tr><td>Charging Station</td><td>The Charging Station is the physical system where an EV can be charged. A Charging Station has one or more EVSEs.</td></tr><tr><td>Charging Station Management System (CSMS)</td><td>Charging Station Management System: manages Charging Stations and has the information for authorizing Users for using its Charging Stations.</td></tr><tr><td>Electric Vehicle Supply Equipment (EVSE)</td><td>An EVSE is considered as an independently operated and managed part of the Charging Station that can deliver energy to one EV at a time.</td></tr><tr><td>Energy Management System (EMS)</td><td>In this document this is defined as a device that manages the local loads (consumption and production) based on local and/or contractual constraints and/or contractual incentives. It has additional inputs, such as sensors and controls from e.g. PV, battery storage.</td></tr></table>

# 1.2.2. Abbreviations

<table><tr><td>Term</td><td>Meaning</td></tr><tr><td>CSO</td><td>Charging Station Operator</td></tr><tr><td>CSMS</td><td>Charging Station Management System</td></tr><tr><td>EMS</td><td>Energy Management System.</td></tr><tr><td>EV</td><td>Electric Vehicle</td></tr><tr><td>EVSE</td><td>Electric Vehicle Supply Equipment</td></tr><tr><td>RFID</td><td>Radio-Frequency Identification</td></tr></table>

# 1.3. References

Table 1. References

<table><tr><td>Reference</td><td>Description</td></tr><tr><td>[IEC61851-1]</td><td>IEC 61851-1 2017: EV conductive charging system - Part 1: General requirements. https://webstore.iec.ch/publication/33644</td></tr><tr><td>[IEC62559-2:2015]</td><td>Definition of the templates for use cases, actor list and requirements list. https://webstore.iec.ch/publication/22349</td></tr><tr><td>[ISO15118-1]</td><td>ISO 15118-1 specifies terms and definitions, general requirements and use cases as the basis for the other parts of ISO 15118. It provides a general overview and a common understanding of aspects influencing the charge process, payment and load leveling. https://webstore.iec.ch/publication/9272</td></tr><tr><td>[OCPP1.5]</td><td>http://www.openchargealliance.org/downloads/</td></tr><tr><td>[OCPP1.6]</td><td>http://www.openchargealliance.org/downloads/</td></tr></table>

# Chapter 2. New functionality in OCPP 2.1

OCPP 2.1 introduces new functionality compared to OCPP 2.0.1.

The application logic for OCPP 2.0.1 remains valid, but will have to be extended to support the new features of OCPP 2.1.

Most important new features of OCPP 2.1 include support for ISO 15118-20 and extensive support for bidirectional power transfer (V2X), and control of Charging Stations and EVs as Distributed Energy Resources (DER). New use cases have been added that describe ad hoc payment, and Charging Stations can now do local cost calculation based on tariff information from CSMS.

Below is a list of sections of Part 2 of the specification that have new or updated functionality.

# A Security

A02/A03 A requestId has been added to SignCertificateRequest. Added support for ISO 15118-20 certificates.

A05 Downgrading from security profile 3 to 2 is no longer prohibited.

# B Provisioning

B09 SetNetworkProfileRequest has been extended with basicAuthPassword and identity.

B13 New use case to support resuming transaction after a reset.

# C Authorization

Length of IdToken has been extended to 255 characters.  
IdToken type is now a predefined list instead of enumeration to allow for easier extension.  
C07/C08 ISO 15118 authorization use cases updated with ISO 15118-20 flows.  
C10 Explicit requirement added about expiration in authorization cache.  
C17 New use case for authorization with prepaid card.  
C18-C23 New use cases for ad hoc payment with integrated payment terminal.  
C24 New use case for ad hoc payment via stand-alone payment terminal.  
C25 New use case for ad hoc payment via dynamic QR code.

# E Transactions

E16 New use case for transactions with cost, energy, time, SoC limit.  
E17 New use case for resuming a transaction after forced reboot.

# F Remote Control

F06 Added CustomTrigger to TriggerMessageRequest.  
F07 Net use case for remote start of transaction with limits.

# G Availability

Availability notification using NotifyEventRequest for component Connector is now the preferred method, instead of StatusNotification.

# I Tariff and Cost

Introducing local cost calculation

I07-I11 New use cases to set default/user tariffs on charging station.  
I12 New use case to report calculated cost during and at end of transaction.

# J Metvalues

New metervalue location: Upstream.

New measurands for bidirectional charging.

# K Smart Charging

New charging profile purposes PriorityCharging and LocalGeneration.  
Added operationMode to ChargingSchedulePeriodType to facilitate bidirectional charging scenarios.  
K01 Added dynamic charging profiles for frequent and unscheduled updates of limits.  
K23-K27 New use cases for topologies with energy management systems.  
K18-K20 New uses cases to support ISO 15118-20.  
K21-K22 New uses cases for priority charging to allow user to overrule charging profile.

# M Certificate Management

M01 Updated use case for ISO 15118-20.

# N Diagnostics

N01 Added support for data collector log on charging station.  
N02 Added monitoring types TargetDelta and TargetDeltaRelative.  
N07 Added severity to NotifyEventRequest.  
N11-14 New use cases for optimized frequent periodic variable monitoring via an event stream. This utilizes the new unconfirmed message type: SEND.  
N15 Use case to set a frequent periodic monitoring via event stream.

# O Display Message

001 Added multi-language support.

# Q Bidirectional Power Transfer

New section that describes control of bidirectional charging via charging profiles.  
Q01-Q04 V2X control with centrally controlled charging profiles.  
Q05-Q06 V2X control with externally controlled charging profiles.  
Q07-Q08 Central can local frequency control.  
Q09 Local load-balancing with V2X.  
Q10-Q12 Idle state, offline and resuming after offline.

# R DER Control

New section that describes grid control when EV and charging station are considered to be a Distributed Energy Resource (DER).

U01 DER control in EVSE.  
U02 DER control in EV.  
U03 Hybrid DER control in both EVSE and EV.  
U04 Configure DER controls in charging station.  
U05 Charging station reporting a DER event.

# S Battery Swapping

New section that describes how to control a battery swap station.

S01 Battery Swap Local Autorization  
S02 Battery Swap Remote Start  
S03 Battery Swap In/Out  
S04 Battery Swap Charging

# Chapter 3. OCPP 2.1 Documentation Structure

# 3.1. Overview of Specification Parts

For readability and implementation purposes, OCPP 2.1 is divided in seven parts.

Table 2. Parts

<table><tr><td>Part 0</td><td>Introduction (this document)</td></tr><tr><td>Part 1</td><td>Architecture &amp; Topology</td></tr><tr><td>Part 2</td><td>Specification: 
Use Cases and Requirements, Messages, Data Types and Referenced Components and Variables 
Appendices: 
Security Events, Standardized Units of Measure, Components and Variables</td></tr><tr><td>Part 3</td><td>Schemas</td></tr><tr><td>Part 4</td><td>Implementation Guide JSON</td></tr><tr><td>Part 5</td><td>Certification Profiles (not yet available)</td></tr><tr><td>Part 6</td><td>Test Cases (not yet available)</td></tr></table>

The OCPP 2.1 specification is written using a structure, based on [IEC62559-2:2015]: "Use case methodology - Part 2: Definition of the template for use cases, actor list and requirements list".

Part 2, the specification, is divided into 'Functional Blocks'. These Functional Blocks contain use cases and requirements. Messages, Data Types and Referenced Components and Variables are described at the end of the document. The Appendices can be found in the separate document: Part 2 - Appendices.

# 3.2. Functional Blocks

OCPP 2.1 consists of the following Functional Blocks.

Table 3. Functional Blocks

<table><tr><td>Clause</td><td>Functional Block Title</td><td>Description</td></tr><tr><td>A.</td><td>Security</td><td>This Functional Block describes a security specification for the OCPP protocol.</td></tr><tr><td>B.</td><td>Provisioning</td><td>This Functional Block describes all the functionalities that help a CSO provision their Charging Stations, allowing them to be registered and accepted on their network and retrieving basic configuration information from these Charging Stations.</td></tr><tr><td>C.</td><td>Authorization</td><td>This Functional Block describes all the authorization related functionality: AuthorizationRequest message handling/behavior and Authorization Cache functionality.</td></tr><tr><td>D.</td><td>Local Authorization List Management</td><td>This Functional Block describes functionality for managing the Local Authorization List.</td></tr><tr><td>E.</td><td>Transactions</td><td>This Functional Block describes the basic OCPP Transaction related functionality for transactions that are started/stopped on the Charging Station.</td></tr><tr><td>F.</td><td>Remote Control</td><td>This Functional Block describes three types of use cases for remote control management from the CSMS: Remote Transaction Control, Unlocking a Connector and Remote Trigger.</td></tr><tr><td>G.</td><td>Availability</td><td>This functional Block describes the functionality of sending status notification messages.</td></tr><tr><td>H.</td><td>Reservation</td><td>This Functional Block describes the reservation functionality of a Charging Station.</td></tr><tr><td>I.</td><td>Tariff and Cost</td><td>This Functional Block provides tariff and cost information to an EV Driver, when a Charging Station is capable of showing this on a display. Before a driver starts charging tariff information needs to be given, detailed prices for all the components that make up the tariff plan applicable to this driver at this Charging Station. During charging the EV Driver needs to be shown the running total cost, updated at a regular, fitting interval. When the EV Driver stops charging the total cost of this transaction needs to be shown.</td></tr><tr><td>J.</td><td>Metering</td><td>This Functional Block describes the functionality for sending meter values, on a periodic sampling and/or clock-aligned timing basis.</td></tr><tr><td>K.</td><td>Smart Charging</td><td>This Functional Block describes all the functionality that enables the CSO (or indirectly a third party) to influence the charging current/power of a charging session, or set limits to the amount of power/current a Charging Station can offer to an EV.</td></tr><tr><td>L.</td><td>Firmware Management</td><td>This Functional Block describes the functionality that enables a CSO to update the firmware of a Charging Station.</td></tr><tr><td>M.</td><td>Certificate Management</td><td>This Functional Block provides the installation and update of certificates.</td></tr><tr><td>N.</td><td>Diagnostics</td><td>This Functional Block describes the functionality that enables a CSO to request and track the upload of a diagnostics file from a Charging Station, and to manage the monitoring of Charging Station data.</td></tr><tr><td>O.</td><td>Display Message</td><td>With the DisplayMessage feature OCPP enables a CSO to display a message on a Charging Station, that is not part of the firmware of the Charging Station. The CSO gets control over these messages: the CSO can set, retrieve (get), replace and clear messages.</td></tr><tr><td>P.</td><td>Data Transfer</td><td>This Functional Block describes the functionality that enables a party to add custom commands to OCPP, enabling custom extension to OCPP.</td></tr><tr><td>Q</td><td>Bidirectional Power Transfer</td><td>This Functional block extends Smart Charging with bidirectional power transfer (V2X).</td></tr><tr><td>R</td><td>DER Control</td><td>This Functional Block describes how charging stations and EVs can be controlled as Distributed Energy Resources. It provides functions to configure grid code parameters on a charging station via CSMS. It is designed to support DER settings from IEC 61850 and IEEE 2030.5 on the grid side, and ISO 15118-20 Amendment 1 on the EV side.</td></tr><tr><td>S</td><td>Battery Swapping</td><td>This Functional block describes how to deal with battery swap stations in OCPP and adds the BatterySwap message.</td></tr></table>

# 3.3. All Functional Blocks and use cases

The following table shows the full list of use cases supported by OCPP 2.1 and which use cases were already supported by OCPP 1.6 [OCPP1.6] and OCPP 2.1.

<table><tr><td>Clause</td><td>Functional Block</td><td>UC ID</td><td>Use case name</td><td>OCPP 1.6</td><td>New in OCPP 2.0.1</td><td>New in OCPP 2.1</td></tr><tr><td>A</td><td>Security</td><td>A01</td><td>Update Charging Station Password for HTTP Basic Authentication</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>A02</td><td>Update Charging Station Certificate by request of CSMS</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>A03</td><td>Update Charging Station Certificate initiated by the Charging Station</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>A04</td><td>Security Event Notification</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>A05</td><td>Upgrade Charging Station Security Profile</td><td></td><td>o</td><td></td></tr><tr><td>B</td><td>Provisioning</td><td>B01</td><td>Cold Boot Charging Station</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>B02</td><td>Cold Boot Charging Station - Pending</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>B03</td><td>Cold Boot Charging Station - Rejected</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>B04</td><td>Offline Behavior Idle Charging Station</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>B05</td><td>Set Variables</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>B06</td><td>Get Variables</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>B07</td><td>Get Base Report</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>B08</td><td>Get Custom Report</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>B09</td><td>Setting a new NetworkConnectionProfile</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>B10</td><td>Migrate to new CSMS</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>B11</td><td>Reset - Without Ongoing Transaction</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>B12</td><td>Reset - With Ongoing Transaction</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>B13</td><td>Reset - With Ongoing Transaction - Resuming Transaction</td><td></td><td></td><td>o</td></tr><tr><td>C</td><td>Authorization</td><td>C01</td><td>EV Driver Authorization using RFID</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>C02</td><td>Authorization using a start button</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>C03</td><td>Authorization using credit/debit card</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>C04</td><td>Authorization using PIN-code</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>C05</td><td>Authorization for CSMS initiated transactions</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>C06</td><td>Authorization using local id type</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>C07</td><td>Authorization using Contract Certificates</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>C08</td><td>Authorization at EVSE using ISO 15118 External Identification Means (EIM)</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>C09</td><td>Authorization by GroupId</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>C10</td><td>Store Authorization Data in the Authorization Cache</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>C11</td><td>Clear Authorization Data in Authorization Cache</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>C12</td><td>Start Transaction - Cached Id</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>C13</td><td>Offline Authorization through Local Authorization List</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>C14</td><td>Online Authorization through Local Authorization List</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>C15</td><td>Offline Authorization of unknown Id</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>C16</td><td>Stop Transaction with a Master Pass</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>C17</td><td>Authorization with prepaid card</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>C18</td><td>Authorization using locally connected payment terminal</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>C19</td><td>Cancelation prior to transaction</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>C20</td><td>Cancelation after start of transaction, before costs have been incurred.</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>C21</td><td>Settlement at end of transaction</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>C22</td><td>Settlement is rejected or fails</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>C23</td><td>Increasing authorization amount</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>C24</td><td>Ad hoc payment via stand-alone payment terminal</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>C25</td><td>Ad hoc payment via static or dynamic QR code</td><td></td><td></td><td>o</td></tr><tr><td>D</td><td>LocalAuthorizationList</td><td>D01</td><td>Send Local Authorization List</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>D02</td><td>Get Local List Version</td><td>o</td><td></td><td></td></tr><tr><td>E</td><td>Transactions</td><td>E01</td><td>Start Transaction Options</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>E02</td><td>Start Transaction - Cable Plugin First</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E03</td><td>Start Transaction - IdToken First</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E04</td><td>Transaction started while Charging Station is offline</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E05</td><td>Start Transaction - Id not Accepted</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E06</td><td>Stop Transaction Options</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>E07</td><td>Transaction locally stopped by IdToken</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E08</td><td>Transaction stopped while Charging Station is offline</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E09</td><td>When cable disconnected on EV-side: Stop Transaction</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E10</td><td>When cable disconnected on EV-side: Suspend Transaction</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E11</td><td>Connection Loss During Transaction</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E12</td><td>Inform CSMS of an Offline Occurred Transaction</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E13</td><td>Transaction related message not accepted by CSMS</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E14</td><td>Check transaction status</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>E15</td><td>End of charging process</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>E16</td><td>Transactions with fixed cost, energy, SoC or time</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>E17</td><td>Resuming transaction after forced</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>E18</td><td>Battery Swapping</td><td></td><td></td><td>o</td></tr><tr><td>F</td><td>RemoteControl</td><td>F01</td><td>Remote Start Transaction - Cable Plugin First</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>F02</td><td>Remote Start Transaction - Remote Start First</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>F03</td><td>Remote Stop Transaction</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>F04</td><td>Remote Stop ISO 15118 charging from CSMS</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>F05</td><td>Remotely Unlock Connector</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>F06</td><td>Trigger Message</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>F07</td><td>Remote start with fixed cost, energy or time</td><td></td><td></td><td>o</td></tr><tr><td>G</td><td>Availability</td><td>G01</td><td>Status Notification</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>G02</td><td>Heartbeat</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>G03</td><td>Change Availability EVSE</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>G04</td><td>Change Availability Charging Station</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>G05</td><td>Lock Failure</td><td>o</td><td></td><td></td></tr><tr><td>H</td><td>Reservation</td><td>H01</td><td>Reservation</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>H02</td><td>Cancel Reservation</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>H03</td><td>Use a reserved EVSE</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>H04</td><td>Reservation Ended, not used</td><td>o</td><td></td><td></td></tr><tr><td>I</td><td>Tariff and Costs</td><td>I01</td><td>Show EV Driver-specific tariff information</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>I02</td><td>Show EV Driver running total cost during charging</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>I03</td><td>Show EV Driver final total cost after charging</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>I04</td><td>Show fallback tariff information</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>I05</td><td>Show fallback total cost message</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>I06</td><td>Update Tariff Information During Transaction</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>I07</td><td>Local Cost Calculation - Set Default Tariff</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>I08</td><td>Local Cost Calculation - Receive User Tariff</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>I09</td><td>Local Cost Calculation - Get Tariffs</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>I10</td><td>Local Cost Calculation - Clear Tariffs</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>I11</td><td>Local Cost Calculation - Change transaction tariff</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>I12</td><td>Local Cost Calculation - Cost Details of Transaction</td><td></td><td></td><td>o</td></tr><tr><td>J</td><td>Metering</td><td>J01</td><td>Sending Meter Values not related to a transaction</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>J02</td><td>Sending transaction related Meter Values</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>J03</td><td>Charging Loop with metering information exchange</td><td></td><td>o</td><td></td></tr><tr><td>K</td><td>SmartCharging</td><td>K01</td><td>SetChargingProfile</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>K02</td><td>Central Smart Charging</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>K03</td><td>Local Smart Charging</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>K04</td><td>Internal Load Balancing</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>K05</td><td>Remote Start Transaction with Charging Profile</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>K06</td><td>Offline Behavior Smart Charging During Transaction</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>K07</td><td>Offline Behavior Smart Charging at Start of Transaction</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>K08</td><td>Get Composite Schedule</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>K09</td><td>Get Charging Profiles</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>K10</td><td>Clear Charging Profile</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>K11</td><td>Set / Update External Charging Limit With Ongoing Transaction</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>K12</td><td>Set / Update External Charging Limit Without Ongoing Transaction</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>K13</td><td>Reset / release external charging limit</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>K14</td><td>External Charging Limit with Local Controller</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>K15</td><td>Charging with load leveling based on High Level Communication</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>K16</td><td>Optimized charging with scheduling to the CSMS</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>K17</td><td>Renegotiating a Charging Schedule</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>K18</td><td>ISO 15118-20 Scheduled Control Mode</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>K19</td><td>ISO 15118-20 Dynamic Control Mode</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>K20</td><td>Adjusting charging schedule when energy needs change</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>K21</td><td>Requesting priority charging remotely</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>K22</td><td>Requesting priority charging locally</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>K23</td><td>Smart Charging with EMS connected to Charging Stations</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>K24</td><td>Smart Charging with EMS connected to Local Controller</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>K25</td><td>Smart Charging with EMS acting as a Local Controller</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>K26</td><td>Smart Charging with Hybrid Local &amp; Cloud EMS</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>K27</td><td>Smart Charging with EMS and LocalGeneration</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>K28</td><td>Dynamic charging profiles</td><td></td><td></td><td>o</td></tr><tr><td>L</td><td>Firmware Management</td><td>L01</td><td>Secure Firmware Update</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>L02</td><td>Non-Secure Firmware Update</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>L03</td><td>Publish Firmware file on Local Controller</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>L04</td><td>Unpublish Firmware file on Local Controller</td><td></td><td>o</td><td></td></tr><tr><td>M</td><td>Certificate Management</td><td>M01</td><td>Certificate Installation EV</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>M02</td><td>Certificate Update EV</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>M03</td><td>Retrieve list of available certificates from a Charging Station</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>M04</td><td>Delete a specific certificate from a Charging Station</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>M05</td><td>Install CA certificate in a Charging Station</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>M06</td><td>Get Charging Station Certificate status</td><td></td><td>o</td><td></td></tr><tr><td>N</td><td>Diagnostics</td><td>N01</td><td>Retrieve Log Information</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>N02</td><td>Get Monitoring report</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>N03</td><td>Set Monitoring Base</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>N04</td><td>Set Variable Monitoring</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>N05</td><td>Set Monitoring Level</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>N06</td><td>Clear / Remove Monitoring</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>N07</td><td>Alert Event</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>N08</td><td>Periodic Event</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>N09</td><td>Get Customer Information</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>N10</td><td>Clear Customer Information</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>N11</td><td>Set Frequent Periodic Variable Monitoring</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>N12</td><td>Get Periodic Event Streams</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>N13</td><td>Close Periodic Event Streams</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>N14</td><td>Adjust Periodic Event Streams</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>N15</td><td>Periodic Event Streams</td><td></td><td></td><td>o</td></tr><tr><td>O</td><td>Display Message</td><td>001</td><td>Set DisplayMessage</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>002</td><td>Set DisplayMessage for Transaction</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>003</td><td>Get All DisplayMessages</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>004</td><td>Get Specific DisplayMessages</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>005</td><td>Clear a DisplayMessage</td><td></td><td>o</td><td></td></tr><tr><td></td><td></td><td>006</td><td>Replace DisplayMessage</td><td></td><td>o</td><td></td></tr><tr><td>P</td><td>DataTransfer</td><td>P01</td><td>Data Transfer to the Charging Station</td><td>o</td><td></td><td></td></tr><tr><td></td><td></td><td>P02</td><td>Data Transfer to the CSMS</td><td>o</td><td></td><td></td></tr><tr><td>Q</td><td>Bidirectional Power Transfer</td><td>Q01</td><td>V2X Authorization</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q02</td><td>Charging only (V2X control) before starting V2X</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q03</td><td>Central V2X control with charging schedule</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q04</td><td>Central V2X control with dynamic CSMS setpoint</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q05</td><td>External V2X setpoint control with a charging profile from CSMS</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q06</td><td>External V2X control with a charging profile from an External System</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q07</td><td>Central V2X control for frequency support</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q08</td><td>Local V2X control for frequency support</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q09</td><td>Local V2X control for load balancing</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q10</td><td>Idle, minimizing energy consumption</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q11</td><td>Going offline during V2X operation</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>Q12</td><td>Resuming a V2X operation after an offline period</td><td></td><td></td><td>o</td></tr><tr><td>R</td><td>DER Control</td><td>R01</td><td>Starting a V2X session with DER control in EVSE</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>R02</td><td>Starting a V2X session with DER control in EV</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>R03</td><td>Starting a V2X session with hybrid DER control in both EV and EVSE</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>R04</td><td>Configure DER control settings at Charging Station</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>R05</td><td>Charging station reporting a DER event</td><td></td><td></td><td>o</td></tr><tr><td>S</td><td>Battery Swapping</td><td>S01</td><td>Battery swap local authorization</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>S02</td><td>Battery swap remote start</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>S03</td><td>Battery swap in/out</td><td></td><td></td><td>o</td></tr><tr><td></td><td></td><td>R04</td><td>Battery swap charging</td><td></td><td></td><td>o</td></tr></table>

# NOTE

OCPP is used in many different regions and for many different charging solutions. Not all functionalities offered by OCPP will be applicable to all implementations. Implementers can decide what specific functionalities apply to their charging solution.

For interoperability purposes, the Open Charge Alliance introduces Certification Profiles in Part 5 of the specification.

# Chapter 4. Basic implementation of OCPP 2.1

This section is informative.

The OCPP protocol describes a large number of use cases and messages, which are not all needed to implement a basic Charging Station or CSMS. The table below lists messages that are typically implemented to deliver basic functionality for an OCPP managed Charging Station. The purpose of this list is to guide developers that are new to OCPP.

The basic implementation set for OCPP 2.1 is the same as for OCPP 2.0.1.

# NOTE

this table does not define what needs to be done to become OCPP 2.1 "certified". The functionality that is to be implemented to become OCPP 2.1 certified is described in Part 5 of the specification, "Certification Profiles".

Table 4. OCPP 2.1 Basic Implementation

<table><tr><td>Functionality</td><td>Use cases</td><td>Messages</td></tr><tr><td>Booting a Charging Station</td><td>B01-B04</td><td>BootNotification</td></tr><tr><td>Configuring a Charging Station</td><td>B05-B07</td><td>SetVariables, GetVariables and GetReportBase (respond correctly to requests with reportBase = ConfigurationInventory, FullInventory and SummaryInventory).</td></tr><tr><td>Resetting a Charging Station</td><td>B11-B12</td><td>Reset</td></tr><tr><td>Authorization options</td><td>One of C01, C02 and C04</td><td>Authorization</td></tr><tr><td>Transaction mechanism</td><td>E01 (one of S1-S6), E02-E03, E05, E06 (one of S1-S6), E07-E08, One of E09-E10, E11-E13</td><td>TransactionEvent</td></tr><tr><td>Availability</td><td>G01, G03-G04</td><td>Only ChangeAvailability and StatusNotification.</td></tr><tr><td>Monitoring Events</td><td>G05, N07</td><td>A basic implementation of the NotifyEvent message to be used to report operational state changes and problem/error conditions of the Charging Station, e.g. for Lock Failure. Also used for reporting built-in monitoring events.</td></tr><tr><td>Sending transaction related Meter values</td><td>J02</td><td>TransactionEvent</td></tr><tr><td>DataTransfer</td><td>P01-P02</td><td>Any OCPP implementations should at least be able to reject any request for DataTransfer if no (special) functionality is implemented.</td></tr></table>

# NOTE

Please also refer to the section on Minimum Device Model in part 1.
