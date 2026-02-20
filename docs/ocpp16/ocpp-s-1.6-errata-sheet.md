# OCPP

Copyright © 2010 - 2019 Open Charge Alliance. All rights reserved.

This document is made available under the _Creative Commons Attribution-NoDerivatives 4.0 International Public License_ (https://creativecommons.org/licenses/by-nd/4.0/legalcode).

Version History

<table><tr><td>VERSION</td><td>DATE</td><td>AUTHOR</td><td>DESCRIPTION</td></tr><tr><td>v1.0 Release</td><td>2019-12-04</td><td>Robert de Leeuw
IHomer</td><td>Release of the OCPP-S errata sheet</td></tr></table>

# 1. Scope

This document contains errata on the OCPP 1.6-S specification (SOAP).

# 1.1. Terminology and Conventions

Underlined: when needed to clarify differences, they might be underlined.

# 2. Major errata

Non known

# 3. Minor errata

Improvements to the descriptions on how the protocol (should) work.

# 3.1. Page 9, par 4. No definition of: 'failure to process the message'

The OCPP 1.6 spec points to the OCPP-S spec for a definition on how a SOAP implementation should respond to a request to indicate: 'failure to process message', but there was no definition of: 'failure to process the message' in the OCPP-S spec.

<table><tr><td>Old text</td><td>In cases where the receiving party (e.g. Charge Point or Central System) cannot process the request and the corresponding confirmation PDU does not have to ability to report the error, then the SOAP Fault Response Message SHOULD be used.</td></tr><tr><td>New text</td><td>In cases where the receiving party (e.g. Charge Point or Central System) cannot process the OCPP request and the corresponding confirmation PDU does not have to ability to report the error, the receiving party needs to report: &#x27;failure to process the message&#x27;. In such a case, the receiving party SHALL use the SOAP Fault Response Message.</td></tr></table>

# 3.2. Page 9, par 4. Contradiction in definition of resending 'transaction related messages'

The OCPP 1.6 spec states:

"It is permissible for the Charge Point to skip a transaction-related message if and only if the Central System repeatedly reports a `failure to process the message'."

But the OCPP-S specification states:

"If a sender receives a SOAP Fault Response from the receiver, the sender SHOULD NOT resend the same message."

The following errata should fix this:

<table><tr><td>Old text</td><td>If a sender receives a SOAP Fault Response from the receiver, the sender SHOULD NOT resend the same message.</td></tr><tr><td rowspan="2">New text</td><td>If a sender receives a SOAP Fault Response from the receiver, or a HTTP response with a status code indicating an error, the sender SHOULD NOT resend the same message, except transaction-related message, a Charge Point SHALL retry these a couple of times.</td></tr><tr><td>To determine if there is a 'failure to process the message', or a connection issue. The Charge Point SHALL send a simple proven message like a HeartBeat.req PDU. If the Charge Point does receive a HeartBeat.conf from the Central System it knows the problem is with the message itself: 'failure to process the message'.</td></tr></table>

# 3.3. Page 9, par 4. Text about SubCode is not clear

There is something written about SOAP Fault SubCodes, but that is not really clear and/or helpful.

<table><tr><td>Old text</td><td>The following fault codes can be used by the service:Code, Reason and Value belong to the namespace &quot;http://www.w3.org/2003/05SOAP-envelope&quot;.This example SubCode belongs to the namespace &quot;urn://Ocpp/Cs/2015/10&quot;[TABLE WITH SUBCODES]</td></tr><tr><td>New text</td><td>When the receiver needs to return a fault, the following SubCodes can be used inside the SOAP fault, to give more detail about the type of problem the receiver encountered:[TABLE WITH SUBCODES]Note about the namespaces of the different fields of a SOAP fault:Code, Reason and Value belong to the namespace &quot;http://www.w3.org/2003/05SOAP-envelope&quot;.SubCode belongs to the namespace &quot;urn:/Ocpp/Cs/2015/10&quot;Note: The given SubCodes are part of the OCPP namespace, but are not (yet) part of the OCPP WSDL files. This might change in future versions. Client implementations SHALL accept any SubCode, not only the given list above.</td></tr></table>

# 4. Typos

Typos, fixes to incorrect links/reference, improve terms used etc. that have no impact on the description of the way the protocol works.

Non known

# 5. Known issues that will not be fixed

Non known
