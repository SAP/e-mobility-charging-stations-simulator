# OCPP

# Table of Contents

Disclaimer 1

Version History 2

1. Introduction. 3

1.1. Goal of this document 3  
1.2. Terms and abbreviations 3

2. 3-tier model 4

3. Device Model: Addressing Components and Variables 5

3.1. Components 5  
3.2. Variables 6  
3.3. Characteristics and Attributes 6  
3.4. Monitoring 8  
3.5. Standardized lists of Components and Variables 9  
3.6. Minimum Device Model 9

4. Device Model hierarchy 11
5. Information Model vs. Device Model 12
6. Using OCPP for other purposes than EV charging 13
7. Numbering 14

7.1. EVSE numbering. 14  
7.2. Connector numbering 14  
7.3. Transaction IDs. 14

8. Topologies supported by OCPP 15

8.1. Charging Station(s) directly connected to CSMS 15  
8.2. Multiple Charging Stations connected to CSMS via Local Proxy 15  
8.3. Multiple Charging Stations connected to CSMS via Local Controller 16  
8.4. Non-OCPP Charging Stations connected to CSMS via OCPP Local Controller 16  
8.5. DSO control signals to CSMS 16

9. Energy management topologies supported by OCPP 18

9.1. Parallel control of charging station by CSMS and smart meter 18  
9.2. Parallel control of charging location by CSMS and EMS 18  
9.3. EMS via Local Controller 19  
9.4. EMS as man-in-the-middle 20  
9.5. Hybrid local & cloud EMS 20  
9.6. Parallel control by CSMS and EMS 21

# Disclaimer

Copyright © 2010 - 2025 Open Charge Alliance. All rights reserved.

This document is made available under the _Creative Commons Attribution-NoDerivatives 4.0 International Public License_ (https://creativecommons.org/licenses/by-nd/4.0/legalcode).

# Version History

<table><tr><td>Version</td><td>Date</td><td>Description</td></tr><tr><td>2.1 Edition 1</td><td>2025-01-23</td><td>OCPP 2.1 Edition 1</td></tr></table>

# Chapter 1. Introduction

# 1.1. Goal of this document

The goal of this document is to describe a number of architecture related topics for OCPP 2.1. It is not fundamentally different from the version for OCPP 2.0.1.

OCPP was originally intended for two way communication between a backoffice, in OCPP the Charging Station Management System (in this document: CSMS) and a Charging Station. The protocol has become more advanced and with every new revision new functionalities and options are added. It has evolved into a protocol that can be used in different architectures for different types of Charging Stations.

This document describes, in addition to the original "simple" setup CSMS $\ll$ Charging Station, a number of topologies as an additional explanation for using OCPP. Furthermore, the Device Management concept to configure and monitor any type of Charging Station, the OCPP Information Model and the 3-tier model are explained.

This document is partially informative and partially normative and is not intended to limit the use of OCPP. However, it does add an explanation what kind of use of OCPP the creators of OCPP had in mind when creating this version of the specification. This document is therefore also intended to support the reader of the protocol specification in Part 2 of OCPP to understand how it can be used.

# 1.2. Terms and abbreviations

This section contains the terminology and abbreviations that are used throughout this document.

# 1.2.1. Terms

<table><tr><td>Term</td><td>Meaning</td></tr><tr><td>Charging Location</td><td>A group of one or more Charging Stations that belong together geographically or spatially.</td></tr><tr><td>Charging Station</td><td>The Charging Station is the physical system where EVs can be charged. A Charging Station has one or more EVSEs.</td></tr><tr><td>Connector</td><td>The term Connector, as used in this specification, refers to an independently operated and managed electrical outlet on a Charging Station. In other words, this corresponds to a single physical Connector. In some cases an EVSE may have multiple physical socket types and/or tethered cable/Connector arrangements (i.e. Connectors) to facilitate different vehicle types (e.g. four-wheeled EVs and electric scooters).</td></tr><tr><td>EVSE</td><td>An EVSE is considered as an independently operated and managed part of the Charging Station that can deliver energy to one EV at a time.</td></tr><tr><td>Local port Smart Meter</td><td>The local port on a Smart Meter is a port (for example serial) on a digital electricity meter that provides access to information about meter readings and usage.</td></tr></table>

# 1.2.2. Abbreviations

<table><tr><td>Abbreviation</td><td>Meaning</td></tr><tr><td>DSO</td><td>Distribution System Operator</td></tr><tr><td>CSO</td><td>Charging Station Operator</td></tr><tr><td>CSMS</td><td>Charging Station Management System</td></tr><tr><td>EMS</td><td>Energy Management System. In this document this is defined as a device that manages the local loads (consumption an production) based on local and/or contractual constraints and/or contractual incentives. It has additional inputs, such as sensors and controls from e.g. PV, battery storage.</td></tr><tr><td>EVSE</td><td>Electric Vehicle Supply Equipment</td></tr><tr><td>LC</td><td>Local Controller. In this document this is defined as a device that can send messages to its Charging Stations, independently of the CSMS. A typical usage for this is the local smart charging case described in the Smart Charging chapter of Part 2 of OCPP, where a Local Controller can impose charge limits on its Charging Stations.</td></tr><tr><td>LP</td><td>Local Proxy. Acts as a message router.</td></tr></table>

# Chapter 2. 3-tier model

This section is informative.

To understand the terminology in the OCPP specification, it is important to understand the starting point of this specification. The OCPP specification uses the term Charging Station as the physical system where EVs can be charged. A Charging Station can have one or more EVSEs (Electric Vehicle Supply Equipment). An EVSE is considered as a part of the Charging Station that can deliver energy to one EV at a time. The term Connector, as used in this specification, refers to an independently operated and managed electrical outlet on a Charging Station, in other words, this corresponds to a single physical Connector. In some cases an EVSE may have multiple physical socket types and/or tethered cable/connector arrangements to facilitate different vehicle types (e.g. four-wheeled EVs and electric scooters). This setup is referred to as the 3-tier model and visualized in the figure below.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/534f4196a4fb9c1f89f389595c3cf7a4d52aee2833f3461d87f0b18cf5da7799.jpg)  
Figure 1. 3-tier model as used in OCPP

A Charging Location is a group of Charging Stations at the same place or building. This concept has no meaning in OCPP, since OCPP is about CSMS to Charging Station communication, but a Charging Location may exist as a concept in a CSMS for management and reporting purposes.

# NOTE

This section describes the charging infrastructure on a logical level for communication purposes. We do not wish to impose a mapping onto physical hardware. This is a manufacturer's choice. For example, the EVSE might be integrated into a Charging Station and to look as just a part of that device, but it might just as well have its own casing and live outside of the physical entity Charging Station, for example a charging plaza with 20 EVSEs and Connectors which communicates via 1 modem as 1 Charging Station to the CSMS is seen by OCPP as 1 Charging Station.

# Chapter 3. Device Model: Addressing Components and Variables

The Device Model refers to a generalized mechanism within OCPP to enable any model of Charging Station to report how it is build up, so it can be managed from any CSMS. To manage a Charging Station with the Device Model (i.e. "to manage a device") a number of messages and use cases is defined to configure and monitor a Charging Station in detail, without defining the structure of the Charging Station in advance. To be able do do this, OCPP provides a generalized mechanism to allow the exchange of a wide range of information about Charging Station. This version of the Device Model has the 3-tier model (Charging Station, EVSE, Connector) as its starting point, which means that any description created with the Device Model follows these three tiers. The remainder of this chapter describes how the data (and associated meta-data) looks like that can be exchanged between a Charging Station and a CSMS. The use cases and messages that are used to manage a device are not described here, but in Part 2 of the specification. This chapter only focuses on the data model.

# 3.1. Components

In OCPP 2.1, a Charging Station is modelled as a set of "Components", typically representing physical devices (including any external equipment to which it is connected for data gathering and/or control), logical functionality, or logical data entities.

Components of different types are primarily identified by a ComponentName, that is either the name of a standardized component (see OCPP part 2c), or a custom/non-standardized component name, for new, pre-standardized equipment, vendor specific extensions, etc.

ChargingStation (TopLevel), EVSE, and Connector represent the three major " tiers" of a Charging Station, and constitute an implicit "location-based" addressing scheme that is widely used in many OCPP data structures. Each "tier" has a component of the same name, which represents the tier. For example, EVSE 1 on a Charging Station is represented by the component named "EVSE" (no instance name) with "evseld = 1". In the same manner, Connector 1 on EVSE 1 is represented by the component named "Connector" (no instance name) with "evseld = 1, connectorld = 1".

By default, all components are located at the ChargingStation tier, but individual instances of any component can be associated with a specific EVSE, or a specific Connector (on a specific EVSE) by including EVSE or EVSE and Connector identification numbers as part of a component addressing reference.

Additionally, there can be more than one instance of a component (in the functional dimension), representing multi-occurrence physical or logical components (e.g. power converter modules, fan banks, resident firmware images, etc.).

Each distinct component instance is uniquely identified by an (optional) componentInstance addressing key. When no

componentInstance is provided, then the default or only instance of a component is referenced.

Components do not in themselves hold data: all externally accessible data associated with each component instance is represented by a set of variables that can be read, set, and/or monitored for changes. The relationship of a Component with one or more Variables is illustrated in below.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/5cb0a6074d8ee3cb9519a79425b3c258e685b3feb5f60ae8172ccf89861dc587.jpg)  
Figure 2. Component and variables

The table below illustrates some common components (by their standardized component-names), and examples of the hierarchical location levels at which they typically occur for a basic home charger and a typical public Charging Station.

<table><tr><td colspan="3">Basic home charger example configuration</td></tr><tr><td>ChargingStation tier</td><td>EVSE tier</td><td>Connector tier</td></tr><tr><td>ChargingStation (itself, as a whole)</td><td>EVSE (itself, as a whole)</td><td>Connector (itself, as a whole)</td></tr><tr><td>RadioLink</td><td>ControlMetering</td><td>PlugRetentionLock</td></tr><tr><td>TokenReader</td><td>OverCurrentBreaker</td><td></td></tr><tr><td>Controller</td><td>RCD</td><td></td></tr><tr><td></td><td>ChargingStatusIndicator</td><td></td></tr><tr><td colspan="3">Public Charging Station example configuration</td></tr><tr><td>ChargingStation tier</td><td>EVSE tier</td><td>Connector tier</td></tr><tr><td>ChargingStation (itself, as a whole)</td><td>EVSE (itself, as a whole)</td><td>Connector (itself, as a whole)</td></tr><tr><td>ElectricalFeed</td><td>ElectricalFeed</td><td>AccessProtection</td></tr><tr><td>TokenReader</td><td>TokenReader</td><td>PlugRetentionLock</td></tr><tr><td>Display</td><td>Display</td><td></td></tr><tr><td>FiscalMetering</td><td>FiscalMetering</td><td></td></tr><tr><td>Clock</td><td>ControlMetering</td><td></td></tr><tr><td>Controller</td><td>OverCurrentBreaker</td><td></td></tr><tr><td></td><td>RCD</td><td></td></tr><tr><td></td><td>ChargingStatusIndicator</td><td></td></tr></table>

# 3.2. Variables

Every component has a number of variables, that can, as appropriate, be used to hold, set, read, and/or report on all (externally visible) data applicable to that component, including configuration parameters, measured values (e.g. a current or a temperature) and/or monitored changes to variable values.

Although many components can have associated variables that are, by their nature, specific to the component type (e.g. ConnectorType for a Connector component), there is a minimal set of standardized variables that is used to provide standardized high level event notification and state/status reporting (e.g. Problem, Active) on a global and/or selective basis, and also to report component presence, availability, etc. during the inventorying/discovery process (e.g. Available, Enabled). A Charging Station is not required to report the base variables: Present, Available and Enabled when they are readily and set to true. When a Charging Station does not report: Present, Available and/or Enabled the Central System SHALL assume them to be readily and set to true Variables can be any of a range of common general-purpose data types (boolean, integer, decimal, date-time, string), but also can have their allowable values constrained to particular ranges, enumeration lists, sets, or ordered lists.

To support complex components, there can be more than one instance of any given variable name associated with any components (e.g. power converter modules reporting temperature, current, or voltage at multiple points).

Each distinct variable instance is uniquely identified by an (optional) variableInstance addressing key string value. When no variableInstance is provided, then the default or only instance of a variable is referenced.

# 3.3. Characteristics and Attributes

Each variable, in addition to its primary ("Actual") value, can have a set of associated secondary data that is linked to the same primary variable name and variableInstance.

This greatly avoids cluttering the variables namespace with confusing clusters of ancillary variable names (e.g. FanSpeed, FanSpeedUnits, MinimumFanSpeed, BaseFanSpeed) that lack consistence and discoverability.

The ancillary variable data includes:

- Variable characteristics meta-data (read-only)

。Unit of measure (V,W,kW,kWh,etc.)  
。Data type (Integer, Decimal, String, Date, OptionList, etc.)  
。Lower limit  
。Upper limit  
。List of allowed values for enumerated variables

Variable attributes (read-write):

。Actual value  
。Target value  
。Configured lower limit  
。Configured upper limit  
。Mutability (whether the value can be altered or not, e.g. ReadOnly orReadWrite)  
. Persistence (whether the value is preserved in case of a reboot or power loss)

The relationship of a Variable with one or more VariableAttributes is illustrated in the figure below.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/1c0e15dc8de68d2231a1fadbc33a83c2ba5a09b979839139233f54804c43b63a.jpg)  
Figure 3. Variable attributes and characteristics

There is a difference between how to implement (physical) devices and (virtual) controller components, using the DeviceModel. A (virtual) controller component has to be implementing as described in part 2 chapter the "Referenced Components and Variables". These kind of components/variables are only using the variableAttribute type 'Actual'. Depending on if this variableAttribute is writable, the CSMS can use this to set a new value.

(Physical) devices are a bit more complex to implement. For example, there is a fan with a fan speed, that has a (physical) limit with a range of 0 - 1000. But it should not be allowed to set the value below 200, because the fan can stop functioning. And it should not be set above 500, because that would be bad for the fan on the long run. When implementing this device using the DeviceModel, it can be defined as follows:

<table><tr><td>Component</td><td>name</td><td>Fan</td><td></td></tr><tr><td rowspan="13">Variable</td><td>name</td><td>FanSpeed</td><td></td></tr><tr><td rowspan="3">variableAttribute 1</td><td>type</td><td>Actual</td></tr><tr><td>value</td><td>&lt;The current fan speed value of the fan.&gt;</td></tr><tr><td>mutability</td><td>ReadOnly</td></tr><tr><td rowspan="3">variableAttribute 2</td><td>type</td><td>Target</td></tr><tr><td>value</td><td>&lt;The CSMS can use this value to adjust the fan speed. The Charging Station SHALL try to keep the actual value at the target value.&gt;</td></tr><tr><td>mutability</td><td>ReadWrite</td></tr><tr><td rowspan="2">variableAttribute 3</td><td>type</td><td>MaxSet</td></tr><tr><td>value</td><td>&lt;The value &#x27;500&#x27; from the example. The target may not be set above this value.&gt;</td></tr><tr><td rowspan="2">variableAttribute 4</td><td>type</td><td>MinSet</td></tr><tr><td>value</td><td>&lt;The value &#x27;200&#x27; from the example. The target may not be set below this value.&gt;</td></tr><tr><td rowspan="2">variableCharacteristics</td><td>maxLimit</td><td>&lt;The value &#x27;1000&#x27; from the example. This could be the physical max limit of the fan.&gt;</td></tr><tr><td>minLimit</td><td>&lt;The value &#x27;0&#x27; from the example. This could be the physical min limit of the fan. This could also be -1000, if the fan is also able to rotate in the other direction.&gt;</td></tr><tr><td>Description</td><td colspan="3">This is an example of how a fan could be defined using the DeviceModel.</td></tr></table>

When trying to set the target with value 600, the Charging Station will first check the allowed min and max values/limits and reject the set. If the target value is set to 500, the value is within range and the Charging Station will allow the set and start to adjust the actual fan speed. If the actual fan speed is measured to be 502, it's out of range. But it should be reported to the CSMS, so the actual value of a physical component should be updated without checking the min and max values/limits.

# 3.4. Monitoring

(Updated in OCPP 2.1)

Optional monitoring settings can be associated with a variable, that allow changes to variable (Actual) values are to be reported to the CSMS as event notifications.

These include:

Monitoring value  
Monitoring type: upper threshold, lower threshold, delta, periodic

- Severity level when reporting the event

The following table show which MonitorType/dataType combinations are possible.

<table><tr><td></td><td>string</td><td>decimal</td><td>integer</td><td>dateTime</td><td>boolean</td><td>OptionList</td><td>SequenceList</td><td>MemberList</td></tr><tr><td>UpperThresh old</td><td></td><td>X</td><td>X</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>LowerThresh old</td><td></td><td>X</td><td>X</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>Delta</td><td>X</td><td>X</td><td>X</td><td>X</td><td>X</td><td>X</td><td>X</td><td>X</td></tr><tr><td>Periodic</td><td>X</td><td>X</td><td>X</td><td></td><td>X</td><td>X</td><td>X</td><td>X</td></tr><tr><td>PeriodicCloc kAligned</td><td>X</td><td>X</td><td>X</td><td></td><td>X</td><td>X</td><td>X</td><td>X</td></tr><tr><td>TargetDelta</td><td>X</td><td>X</td><td>X</td><td></td><td>X</td><td>X</td><td>X</td><td>X</td></tr><tr><td>TargetDeltaR elative</td><td>X</td><td>X</td><td>X</td><td></td><td>X</td><td>X</td><td>X</td><td>X</td></tr></table>

- For UpperThreshold and LowerThreshold the value represents the to be exceeded value by the actual value of the variable.
- For Delta this value represents the change in value compared to the actual value from the moment the monitor was set.

When thedataType of the variable is integer or decimal, this value represents the absolute difference to be reached to trigger the monitor.  
。When thedataType of the variable is DateTime the unit of measure will be in seconds.  
When the dataType of the variable is string, boolean, OptionList, SequenceList or MemberList, this value is ignored. The monitor will be triggered by every change in the actual value.

- When a delta monitor is triggered OR when the Charging Station has rebooted, the Charging Station shall set a new momentary value.
- For Periodic and PeriodicClockAligned the value represents the interval in seconds.
- For TargetDelta this value represents the absolute difference between the variableAttributes "Actual" and "Target" (calculated as Actual - Target).
- For TargetDeltaRelative this value represents the relative deviation of the "Actual" variableAttribute with respect to the "Target" variableAttribute (calculated as the absolute value of (Actual - Target) / Target).

The relationship between a Variable and one or more VariableMonitoring elements is illustrated in the figure below.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/04846e9ee324c2423ddff47d5c451639443860960abc60802e2d78030a59f1fd.jpg)  
Figure 4. Variables and monitoring

# 3.5. Standardized lists of Components and Variables

To provide some level of interoperability between different Charging Stations and CSMSs, besides the above defined model of Components and Variables, part 2 - appendices of the OCPP specification provides a list of standardized names for Components and Variables. The idea of this lists is to make sure that if a Charging Station and CSMS want to exchange information about a component, they both use the same name and description if it is listed in the OCPP specification. For names of a Components or Variables that are not listed in the specification, bilateral appointments between Charging Station manufacturer and CSMS are to be made. In these cases it is advised to provide feedback to the Open Charge Alliance to be able to include new/additional Components and Variables in new versions of OCPP.

# 3.6. Minimum Device Model

Since the Device Model is a generalized mechanism which can be applied to any model of Charging Station, the complexity of different implementations can vary. It consists of a number of use cases and messages that are not all required. This section describes the minimum part of the Device Model that needs to be implemented to create a working implementation of OCPP 2.1.

The Device Model introduces Components and Variables that can be used for configuring and monitoring a Charging Station. A number of these Components and Variables are included in the list of Referenced Components and Variables (grouped by Functional Block) in Part 2 of the specification. When implementing a Functional Block, ALL required Configuration Variables that belong to a Functional Block SHALL be implemented. The required Configuration Variables from the General section SHALL also be implemented for all implementations of OCPP 2.1.

The following table describes which messages are required to implement for use cases that are part of the Device Model implementation.

<table><tr><td colspan="2">Use cases / messages that are part of a minimum Device Model implementation</td></tr><tr><td>Use case</td><td>Messages</td></tr><tr><td>B05 Set Variables</td><td>SetVariables message MUST be implemented</td></tr><tr><td>B06 Get Variables</td><td>GetVariables message MUST be implemented.</td></tr><tr><td>B07 Get Base Report</td><td>GetBaseReport message MUST be implemented and MUST support ConfigurationInventory and FullInventory. The content of these reports depends on the implementation of the Charging Station. It is up to the implementer to decide which components and variables exist in the implementation.</td></tr><tr><td colspan="2">Additional use cases / messages that are not part of a minimum Device Model implementation</td></tr><tr><td>Use case</td><td>Messages</td></tr><tr><td>B08 Get Custom Report</td><td>GetCustomReport message is optional.</td></tr><tr><td>N02 Get Monitoring Report</td><td>GetMonitoringRequest message is optional.</td></tr><tr><td>N03 Set Monitoring Base</td><td>SetMonitoringBaseRequest message is optional.</td></tr><tr><td>N04 Set Variable Monitoring</td><td>SetVariableMonitoringRequest message is optional.</td></tr><tr><td>N05 Set Monitoring Level</td><td>SetMonitoringLevelRequest message is optional.</td></tr><tr><td>N06 Clear/Remove Monitoring</td><td>ClearVariableMonitoringRequest message is optional.</td></tr><tr><td>N07 Alert Event</td><td>it is RECOMMENDED that NotifyEventRequest is implemented in the Charging Station even when monitoring is not implemented, so that this can be used to report built-in monitoring events.</td></tr><tr><td>N08 Periodic Event</td><td>see N07.</td></tr></table>

# Chapter 4. Device Model hierarchy

(New in OCPP 2.1)

The 3-tier model of the Device Model does not suffice to represent the hierarchy of Charging Stations with a lot of components. If there is a need to represent a hierarchy between components, then a set of standard variables can be used for this. To allow comprehensive rendering of its components in a UI, a Charging Station may describe the hierarchy of its components using the following read-only variables:

- CommunicationParent (data flow source),
- ElectricalParent (power flow source),
- LogicalParent (for a comprehensive overview),
- PhysicalParent (container).

These variables point to one or more (using multiple instances of these variables) parent components. Since the Device Model does not permit duplicate component names and instances, which might occur in a hierarchy, the optional read-only variable "Label" permits specifying a non-unique label to use instead of the component name and instance in a hierarchical rendering.

See Part 2 of this specification for details on these variables.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/bd5dbedc5d06930ca9fc0bb3e567ae23b4ccd950f99df9ce7905d9001eb4b189.jpg)  
Figure 5. Example of hierarchy in device model

# Chapter 5. Information Model vs. Device Model

As described above, the terms Information Model and Device Model refer to different concepts. The Information Model refers to a model of the information structure upon which the messages and datatypes in OCPP are based, whereas the Device Model refers to a generalized mechanism within OCPP to enable any model of Charging Station to report how it is build up so, it can be managed from any CSMS without defining the structure of the Charging Station in advance.

# Chapter 6. Using OCPP for other purposes than EV charging

As indicated in the introduction of this document, OCPP is primarily intended for two way communication between a CSMS and a Charging Station. However, with the addition of the Device Model as described in the chapter Device Model, OCPP can additionally be used for other purposes. For example, the reporting of Events or Status changes in transformers or stand-alone battery packs might also be useful for companies that are rolling out EV charging infrastructure. In this example, a BootNotification could be used to connect these devices to a management system. In the device model a device that is not a Charging Station, can be recognized by the fact that the component Charging Station is not present at the top level. At the moment the OCPP specification does not provide use cases for non Charging Station devices. However, they may be added in a future version of OCPP.

# Chapter 7. Numbering

This section is normative.

# 7.1. EVSE numbering

To enable the CSMS to address all the EVSEs of a Charging Station, EVSEs MUST always be numbered in the same way.

EVSEs numbering (evselds) MUST be as follows:

- The EVSEs MUST be sequentially numbered, starting from 1 at every Charging Station (no numbers may be skipped).
- evselds MUST never be higher than the total number of EVSEs of a Charging Station
- For operations initiated by the CSMS, evseld 0 is reserved for addressing the entire Charging Station.
- For operations initiated by the Charging Station (when reporting), evseld 0 is reserved for the Charging Station main controller.

Example: A Charging Station with 3 EVSEs: All EVSEs MUST be numbered with the IDs: 1, 2 and 3. It is advisable to number the EVSEs of a Charging Station in a logical way: from left to right, top to bottom incrementing.

# 7.2. Connector numbering

To enable the CSMS to address all the Connectors of a Charging Station, Connectors MUST always be numbered in the same way.

Connector numbering (connectorlds) MUST be as follows:

- The connectors are numbered (increasing) starting at connectorld 1 on every EVSE
- Every connector per EVSE has a unique number
- ID of the first Connector of an EVSE MUST be 1  
  Additional Connectors of the same EVSE MUST be sequentially numbered (no numbers may be skipped)
- connectorlds MUST never be higher than the total number of connectors on that EVSE

Example: A Charging Station with 3 EVSEs that each have 2 connectors, is numbered as follows:

- EVSE 1 has connectors with connectorld 1 and 2
- EVSE 2 has connectors with connectorld 1 and 2
- EVSE 3 has connectors with connectorld 1 and 2

# 7.3. Transaction IDs

TransactionIds are now generated by the Charging Station and MUST be unique on this Charging Station for every started transaction.

In OCPP 1.x this was done by the CSMS.

The format of the transaction ID is left to implementation. This MAY for example be an incremental number or an UUID.

# Chapter 8. Topologies supported by OCPP

This chapter shows a number of topologies for using OCPP. As indicated in the introduction, OCPP was originally used for a setup where each Charging Station communicates directly with the CSMS. It is important to keep in mind that OCPP has no knowledge of the topology of the Charging Station network. The following figure shows an example of a more complex topology where OCPP is used between CSMS, Local Controller and Charging Station, and other protocols are being used between EMS (Energy Management System) and Local Controller, and the smart grid meter and the Charging Station.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/ffb319b212f16cd2d90d9ebb3131f995601619b209caf0f8b27a6650e75fc08a.jpg)  
Figure 6. Example of a topology with OCPP and non-OCPP components

# 8.1. Charging Station(s) directly connected to CSMS

# Description

This is the basic setup for using OCPP.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/75249d5df2cbcdf716ab5ee146fc04a94fcec9946d87c189dfd2e19977081b2b.jpg)  
Figure 7. Charging Station directly connected to CSMS

# 8.2. Multiple Charging Stations connected to CSMS via Local Proxy

# Description

In some situations it is desirable to route all communications for a group of Charging Stations through a single network node (i.e. modem, router, etc.). A typical example is the situation where a number of a Charging Stations are located in an underground parking garage with little or no access to the mobile network. In order to provide access to mobile data the Charging Stations are linked to a central data communications unit over a LAN. This central unit connects to the mobile network and acts as a proxy between CSMS and Charging Stations. Such a unit is called a "local proxy" (LP) in OCPP. A local proxy acts as a message router. Neither the CSMS nor the Charging Stations are aware of the topology of the network. For the Charging Stations in the group the local proxy "is" the CSMS. Similarly, for the CSMS the local proxy "is" the Charging Station. The diagram below illustrates this configuration.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/2546b5ba6d29240f893fff8065def4c5668582f40362058d602a650abd21cb63.jpg)  
Figure 8. Multiple Charging Stations connected to CSMS via Local Proxy

# 8.3. Multiple Charging Stations connected to CSMS via Local Controller

# Description

Whereas a local proxy does little more than route OCPP messages, a Local Controller can send messages to its Charging Stations, independently of the CSMS. A typical usage for this is the local smart charging case described in the Smart Charging chapter of Part 2 of OCPP, where a Local Controller can impose charge limits on its Charging Stations. In order for a Local Controller to be addressed by the CSMS, it needs to have its own Charging Station identity. From the point of view from OCPP, the Local Controller will just be a Charging Station (without any EVSEs/Connectors). The CSMS will possess the logic to deal with the Local Controller in order to support, for example, local smart charging. It is up to the implementation of the CSMS, whether the group topology is manually configured or deduced from the network based on IP addresses and information in BootNotifications. The diagram below illustrate this configuration.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/c1b7e56278146529ea0549dc4f16452e0ec358e4d23a8f91fbdc1b5557555107.jpg)  
Figure 9. Multiple Charging Stations connected to CSMS via Local Controller

# NOTE

When a Charging Station connects to the Local Controller, the Local Controller must open a websocket connection with the same address to the CSMS. The advantage of this approach is that CSMS does not require any modification, because it does not notice that a Local Controller is in between. Still, a Local Controller can read all messages to a Charging Stations, and can act on it, for example to perform local load-balancing. It will, however, in large installations lead to a lot of websocket connections between CSMS and LC. For further information, please refer to OCPP implementation guide in Part 4.

# 8.4. Non-OCPP Charging Stations connected to CSMS via OCPP Local Controller

This setup has multiple non-OCPP Charging Stations that are abstracted away using a OCPP enabled Local Controller. When applying OCPP in this situation, the LC should be considered as a Charging Station with many EVSEs or the LC should act as multiple OCPP Charging Stations (having their own Charging Station Identity).

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/14127aa91dcd4bdf9a82d6408d1e1aeb56b239c7c8b02e160f4e36d14d294129.jpg)  
Figure 10. Multiple non-OCPP Charging Stations connected to CSMS via Local Controller

# 8.5. DSO control signals to CSMS

This is a set-up in which the CSMS is the only application sending signals to a its Charging Stations, but the CSMS receives smart charging signals from a DSO based on (most likely) grid constraints. This means that a non-OCPP signal such as OpenADR or OSCP is received and based on this signal, the CSMS limits charging on its Charging Stations. CSOs that want full control over their Charging Station use this architecture, this way they are in control of the amount of energy being used by their Charging Stations. This can be done by sending charging profiles / charging schedules to Charging Stations.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/ba2ef5829b6e254e1341bb9ca2c629ec9b309df36037e21c3d4e062c52ad9a97.jpg)  
Figure 11. Smart Charging - DSO control signals to CSMS

# Chapter 9. Energy management topologies supported by OCPP

(New in OCPP 2.1)

This chapter describes various topologies that can be used when combining an external actor for energy management with Charging Stations. The external actor can be a full-fledged (home) energy management system, often abbreviated as EMS or HEMS, but it can also be a smart meter that provides a maximum power limit. It is not meant to be an exhaustive list of possibilities, and in the future other topologies may become possible.

In the diagrams the following convention is used for the connectors between components:

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/df00dee1a04be9d841e4e689cfb127a55cf17f06933f17f46f6ab0524a7e1438.jpg)

# 9.1. Parallel control of charging station by CSMS and smart meter

In this setup a Charging Station is connected to a smart meter of the grid connection for the premise. The smart meter provides a charging limit to the Charging Station, such that the power consumption of the Charging Station will be reduced if the capacity of the grid connection is about to be reached.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/44cd243fd69b1617712058bc04099ec9ed6ec455afa3170c06d2540b942e63c8.jpg)  
Figure 12. Parallel control by CSMS and smart meter

# 9.2. Parallel control of charging location by CSMS and EMS

In this setup a Charging Location with one or more Charging Stations is equipped with an Energy Management System (EMS). CSMS controls the Charging Stations via OCPP, but local load-balancing on-site is controlled by the EMS. EMS will have its own connection to a Charging Station, using its own protocol, for example Modbus. If a Charging Station receives a charging constraint from EMS, then it will represent this constraint internally as an OCPP charging profile with purpose ChargingStationExternalConstraints. This charging profile is combined with other charging profiles that it might receive from CSMS. When such an external constraint is received by the Charging Station, it will immediately report this constraint to CSMS via the NotifyChargingLimitRequest message. A limitation of this topology is that EMS is not aware of OCPP information that is exchanged between Charging Station and CSMS. EMS can therefore not know who is charging at a Charging Station, or what the specific charging needs of a user are. Local balancing based on user needs (e.g. time of departure) or priorities is not possible in this topology.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/9612969b5d6fb02e99d4246e8bb56ecb534c9e4acb70bc243e38c5924d67ccb2.jpg)  
Figure 13. Parallel control by CSMS and EMS

# 9.3. EMS via Local Controller

The limitation of Parallel control of charging location by CSMS and EMS can be overcome with help of a Local Controller component. A Local Controller is a kind of "local CSMS" (see Multiple Charging Stations connected to CSMS via Local Controller), that uses OCPP messages to perform local load-balancing. In this topology the Energy Management System (EMS) is connected to the Local Controller. EMS treats all Charging Stations at Charging Location as a single load, and provides its constraint to the Local Controller. The Local Controller will represent this constraint internally as a ChargingStationExternalConstraints charging profile for the cluster of Charging Stations at the Charging Location. It is up to the Local Controller to divide the available capacity among the Charging Stations in the cluster. Because all OCPP traffic between Charging Station and CSMS passes through the Local Controller, it can be made aware of user needs and priorities, and use this information for intelligent scheduling. An added advantage of an on-site Local Controller is, that it can continue to function and support local load-balancing, even when connection to CSMS is lost.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/42c2f7ee31bdb256246385636f361ae16f9a5a8a36508b8306aba86f8705ca0d.jpg)  
Figure 14. EMS via Local Controller

# 9.4. EMS as man-in-the-middle

In the topology sketched above in EMS via Local Controller it is a logical step to combine the EMS and Local Controller functionality in one box. EMS is acting as a Local Controller and is placed as a "man-in-the-middle" between CSMS and Charging Stations. An advantage of this setup is, that EMS (as part of a Local Controller) is aware of instructions coming from CSMS. This enables EMS to know about a charging limitation set by CSMS to the (cluster of) Charging Stations. Having this knowledge allows for more sophisticated energy management, because EMS can now differentiate between the situation where an EV is charging at low power because it does not need more power, and the situation where it is not allowed more power by CSMS or Local Controller.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/79a612111870d18c3d5d7a9de070affb17a8c40b243b250febb79c44b9b44f26.jpg)  
Figure 15. EMS as man-in-the-middle

# 9.5. Hybrid local & cloud EMS

The hybrid local & cloud EMS topology describes the situation where an advanced EMS is running in the cloud. This cloud EMS can have advanced scheduling algorithms and has access to external information, like weather forecasts and control signals from a

DSO. Since it is running in the cloud it can even optimize across multiple sites. An EMS in the cloud will likely not be able to react fast enough to protect the local grid connection, and it will not be able to control the site when the internet connection is lost. This topology therefore adds a local EMS, whose main task is to protect the fuse of the local grid connection, to pass data with local load measurements on to the cloud EMS, and to act as a fallback when data connection to the cloud is lost. Charging Stations can connect directly to the Cloud EMS acting as a Local Controller, as shown below.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/0c7ec91422d7acf061b2f489fdda9074c033a5f80ed356b93c0d3bcb33a0c149.jpg)  
Figure 16. Hybrid topology with cloud EMS as Local Controller

Alternatively, the Local Controller function can be performed by the Local EMS. The Cloud EMS scheduling will be suboptimal, however, because in this case it is not aware of the state of ongoing transactions, unless this information is explicitly passed by Local EMS to Cloud EMS.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/c44043cfda96df24d519fbdec33ae9ad0b1ca2cdc8a211cbe1fbc4bc72e8f4c8.jpg)  
Figure 17. Hybrid topology with local EMS as Local Controller

# 9.6. Parallel control by CSMS and EMS

(Updated in OCPP 2.1 and moved from chapter 8 to 9)

# Description

In a (semi-)private situation where a Charging Station is not only connected to the CSMS, but also to an Energy Management System, some form of parallel control is possible. OCPP is then used for transaction handling and management of the Charging Station, and the Energy Management System provides smart charging controls. OCPP 2.1 supports reporting external smart charging control limits. Control limits that EMS provides via its own protocol, are represented (and reported as) "ExternalConstraints" charging profiles by the Charging Station.

When the Energy Management System decides to delay charging, the Energy Management System can impose an external limit (e.g. 0) to a Charging Station, which the Charging Station in turn can report to the CSMS via OCPP. The Energy Management System might get input from e.g. Local port of a Smart Meter to prevent overloading the grid connection, but can also have other reasons for not charging (e.g. weather conditions).

The protocol between Charging Station and EMS is not specified. Charging limits or schedules can be provided by any means that Charging Station supports. This can also be implemented using OCPP messages. See also Part 2, section K 2.4 for some topology examples with an EMS.

NOTE

An OCPP message exchange between Charging Station and EMS is not a full-fledged OCPP connection in which EMS acts as the server. It is a limited solution consisting of a websocket connection over which EMS sends, for

example, a SetChargingProfile message, and Charging Station sends MeterValue messages.

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/4b94497e-59e2-42d7-8bc7-41490864b07f/c96184bb631463b5a8b731a610e01012aa53257f2cd793588f811f73ba713a0c.jpg)  
Figure 18. Parallel control by CSMS and EMS
