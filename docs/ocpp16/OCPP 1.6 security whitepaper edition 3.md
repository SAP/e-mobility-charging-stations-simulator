![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/009866b32eaf3b0d5fb8178531198df8f133c802ba519340dfe0d96fb5abca3c.jpg)

# OCA white paper:

Improved security for OCPP 1.6-J.

Relevant for OCPP 1.6-J (JSON over WebSockets)

Copyright © 2022 Open Charge Alliance. All rights reserved.

This document is made available under the _Creative Commons Attribution-NoDerivatives 4.0 International Public License_ (https://creativecommons.org/licenses/by-nd/4.0/legalcode).

Version History

<table><tr><td>VERSION</td><td>DATE</td><td>AUTHOR</td><td>DESCRIPTION</td></tr><tr><td>1.3 Edition 3</td><td>2022-02-17</td><td>Franc Buve (OCA)Paul Klapwijk (OCA)</td><td>Clarified the description of the certificateHashData fields</td></tr><tr><td>1.2 Edition 2</td><td>2020-03-31</td><td>Paul Klapwijk (OCA)Milan Jansen (OCA)Robert de Leeuw (ihomer)</td><td>Edition 2, based on the security fixes in the OCPP 2.0.1 specification</td></tr><tr><td>1.0</td><td>2018-11-20</td><td>Robert de Leeuw (IHomer)</td><td>Final release after last rework check</td></tr></table>

# 1. Scope

This white paper describes how the security enhancements, introduced in OCPP 2.0, can be used, on top of OCPP 1.6-J, in a standardized way.

The security part of OCPP 2.0 was developed to strengthen and mature the future development and standardization of OCPP. It is based amongst others on the end-to-end security design by LaQuSo [11]. Security requirements are included, on security measures for both Charge Point and Central System, to help developers build a secure OCPP implementation.

This document contains the following security improvements:

- Secure connection setup
- Security events/logging
- Secure firmware update

# 1.1. Edition 3

This document is the Edition 3 of "Improved security for OCPP 1.6-J" white paper. The difference between Edition 3 and the previous version is the clarification of the fields of the CertificateHashDataType, see also the changelog edition 3. This clarification was needed since in practice it turned out that the current description was ambiguous and could lead to non-interoperable implementations, because content and representation were not clearly specified.

Edition 3 of this document replaces previous versions. OCA advises implementers of OCPP 1.6-J to no longer implement previous versions of this document and only use edition 3 going forward.

As a rule, existing numbered requirements are only updated or removed, previously used requirements numbers are never reused for a totally different requirement.

# 1.2. Security Objectives

This section is informative.

OCPP security has been designed to meet the following security objectives:

1. To allow the creation of a secure communication channel between the Central System and Charge Point. The integrity and confidentiality of messages on this channel should be protected with strong cryptographic measures.
2. To provide mutual authentication between the Charge Point and the Central System. Both parties should be able to identify who they are communicating with.
3. To provide a secure firmware update process by allowing the Charge Point to check the source and the integrity of firmware images, and by allowing non-repudiation of these images.
4. To allow logging of security events to facilitate monitoring the security of the smart charging system.

# 1.3. Design Considerations

This section is informative.

This document was designed to fit into the approach taken in OCPP. Standard web technologies are used whenever possible to allow cost-effective implementations using available web libraries and software. No application layer security measures are included. Based on these considerations, OCPP security is based on TLS and public key cryptography using X.509 certificates. Because the Central System usually acts as the server, different users or role-based access control on the Charge Point are not implemented in this standard. To mitigate this, it is recommended to implement access control on the Central System. To make sure the mechanisms implemented there cannot be bypassed, OCPP should not be used by qualified personnel performing maintenance to Charge Points locally at the Charge Point, as other protocols may be used for local maintenance purposes.

# 1.4. OCPP-J Only

This section is informative.

This document is for OCPP 1.6-J (JSON over WebSockets) only, OCPP-S (SOAP) is NOT supported. This document was started, as it is seen as a simple step to port OCPP 2.0 security to OCPP 1.6. But as OCPP 2.0/2.0.1 only supports JSON over WebSockets (not SOAP), this document is also written for OCPP 1.6-J only. Adding SOAP to this document would have taken a lot of work and review by security experts.

# 1.5. General documentation remarks

This section is informative.

This document is based on OCPP 2.0.1. To help developers that are implementing both 1.6J security improvement and OCPP 2.0.1, we have kept the Use Case numbering from OCPP 2.0.1. So when implementing for example Use Case N01, it is the same use case in this document as in the 2.0.1 specification.

# 1.6. Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC2119 [13], subject to the following additional clarification clause:

The phrase "valid reasons in particular circumstances" relating to the usage of the terms "SHOULD", "SHOULD NOT", "RECOMMENDED", and "NOT RECOMMENDED" is to be taken to mean technically valid reasons, such as the absence of necessary hardware to support a function from a Charge Point design: for the purposes of this specification it specifically excludes decisions made on commercial, or other non-technical grounds, such as cost of implementation, or likelihood of use.

# 1.7.References

Table 1. References

<table><tr><td>REFERENCE</td><td>DESCRIPTION</td></tr><tr><td>[1]</td><td>ENISA European Network and Information Security Agency, Algorithms, key size and parameters report 2014, 2014. (last accessed on 17 January 2016) https://www.enisa.europa.eu/publications/algorithms-key-size-and-parameters-report-2014</td></tr><tr><td>[2]</td><td>Cooper, D., et al., Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL) Profile, Internet Engineering Task Force, Request for Comments 5280, May 2008, http://www.ietf.org/rfc/rfc5280.txt</td></tr><tr><td>[3]</td><td>Dierks, T. and Rescorla, E., The Transport Layer Security (TLS) Protocol Version 1.2, Internet Engineering Task Force, Request for Comments 5246, August 2008, http://www.ietf.org/rfc/rfc5246.txt</td></tr><tr><td>[4]</td><td>Hollenbeck, S., &quot;Transport Layer Security Protocol Compression Methods&quot;, RFC 3749, May 2004. https://www.ietf.org/rfc/rfc3749.txt</td></tr><tr><td>[5]</td><td>Bundesamt für Sicherheit in der Informationstechnik: Anwendungshinweise und Interpretationen zum Schema, AIS 20, Funktionalitätsklassen und Evaluationsmethodologie für deterministische Zufallszahlengenerator, Version 3.0, Bonn, Germany, May 2013. (in German) https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/Zertifizierung/Interpretationen/AIS_20(pdf.html</td></tr><tr><td>[6]</td><td>Adams, C., Farrell, S., Kause, T., and T. Mononen, &quot;Internet X.509 Public Key Infrastructure Certificate Management Protocol (CMP)&quot;, RFC 4210, September 2005. https://www.ietf.org/rfc/rfc4210.txt</td></tr><tr><td>[7]</td><td>National Institute of Standards and Technology. Special Publication 800-57 Part 1 Rev. 4, Recommendation for Key Management. January 2016. https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-4/final</td></tr><tr><td>[8]</td><td>RFC 2617. HTTP Authentication: Basic and Digest Access Authentication. https://www.ietf.org/rfc/rfc2617.txt</td></tr><tr><td>[9]</td><td>RFC 5280. Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL) Profile. https://www.ietf.org/rfc/rfc5280.txt</td></tr><tr><td>[10]</td><td>OCPP 1.6. Interface description between Charge Point and Central System. October 2015. http://www.openchargealliance.org/downloads/</td></tr><tr><td>[11]</td><td>Eekelen, M. van, Poll, E., Hubbers, E., Vieira, B., Broek, F. van den: An end-to-end security design for smart EV-charging for Enexus and ElaadNL by LaQuSo1. December 2, 2014. https://www.elaad.nl/smart-charging-end2end-security-design/</td></tr><tr><td>[12]</td><td>RFC 2818. HTTP Over TLS. https://tools.ietf.org/html/rfc2818</td></tr><tr><td>[13]</td><td>Key words for use in RFCs to Indicate Requirement Levels. S. Bradner. March 1997. http://www.ietf.org/rfc/rfc2119.txt</td></tr><tr><td>[14]</td><td>RFC 2986. PKCS #10: Certification Request Syntax Specification, Version 1.7. https://www.ietf.org/rfc/rfc2986.txt</td></tr><tr><td>[15]</td><td>RFC 6960. X.509 Internet Public Key Infrastructure Online Certificate Status Protocol - OCSP, https://www.ietf.org/rfc/rfc6960.txt</td></tr></table>

# 2. Secure connection setup

# 2.1. Security Profiles

This section defines the different OCPP security profiles and their requirement. This White Paper supports three security profiles:

The table below shows which security measures are used by which profile.

Table 2. Overview of OCPP security profiles

<table><tr><td>PROFILE</td><td>CHARGE POINT
AUTHENTICATION</td><td>CENTRAL SYSTEM
AUTHENTICATION</td><td>COMMUNICATION
SECURITY</td></tr><tr><td>1. Unsecured Transport with Basic Authentication</td><td>HTTP Basic Authentication</td><td>-</td><td>-</td></tr><tr><td>2. TLS with Basic Authentication</td><td>HTTP Basic Authentication</td><td>TLS authentication
using certificate</td><td>Transport Layer Security
(TLS)</td></tr><tr><td>3. TLS with Client Side Certificates</td><td>TLS authentication
using certificate</td><td>TLS authentication
using certificate</td><td>Transport Layer Security
(TLS)</td></tr></table>

- The Unsecured Transport with Basic Authentication Profile does not include authentication for the Central System, or measures to set up a secure communication channel. Therefore, it should only be used in trusted networks, for instance in networks where there is a VPN between the Central System and the Charge Point. For field operation it is highly recommended to use a security profile with TLS.

# 2.2. Generic Security Profile requirements

Table 3. Generic Security Profile requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A00.FR.001</td><td></td><td>The Charge Point and Central System SHALL only use one security profile at a time</td></tr><tr><td>A00.FR.002</td><td>If the Charge Point tries to connect with a different profile than the Central System is using</td><td>The Central System SHALL reject the connection.</td></tr><tr><td>A00.FR.003</td><td>If the Charge Point detects that the Central System has accepted a connection with a different profile than the Charge Point is using</td><td>The Charge Point SHALL terminate the connection.</td></tr><tr><td>A00.FR.004</td><td></td><td>The security profile SHALL be configured before OCPP communication is enabled.</td></tr><tr><td>A00.FR.005</td><td></td><td>Lowering the security profile that is used to a less secure profile is, for security reasons, not part of the OCPP specification, and MUST be done through another method, not via OCPP. OCPP messages SHALL NOT be used for this (e.g. ChangeConfiguration.req or DataTransfer).</td></tr><tr><td>A00.FR.006</td><td>When a Central System communicates with Charge Points with different security profiles or different versions of OCPP.</td><td>The Central System MAY operate the Charge Points via different addresses or ports of the Central System.
For instance, the Central System server may have one TCP port for TLS with Basic Authentication, and another port for TLS with Client Side Certificates.
In this case there is only one security profile in use per port of the Central System, which is allowed.</td></tr></table>

# NOTE

Only securing the OCPP communication is not enough to build a secure Charge Point. All other interfaces to the Charge Point should be equally well secured.

# 2.3. Unsecured Transport with Basic Authentication Profile - 1

Table 4. Security Profile 1 - Unsecured Transport with Basic Authentication

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Unsecured Transport with Basic Authentication</td></tr><tr><td>2</td><td>Profile No.</td><td>1</td></tr><tr><td>3</td><td>Description</td><td>The Unsecured Transport with Basic Authentication profile provides a low level of security. Charge Point authentication is done through a username and password. No measures are included to secure the communication channel.</td></tr><tr><td>4</td><td>Charge Point Authentication</td><td>For Charge Point authentication HTTP Basic authentication is used.</td></tr><tr><td>5</td><td>Central System Authentication</td><td>In this profile, the Central System does not authenticate itself to the Charge Point. The Charge Point has to trust that the server it connects to is indeed the Central System.</td></tr><tr><td>6</td><td>Communication Security</td><td>No communication security measures are included in the profile.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/f3d8f1224d4b432fd43ec95ca395382af17c82bfda6b1141fd4a6ac607890b7c.jpg)  
Figure 1. Sequence Diagram: HTTP Basic Authentication sequence diagram

<table><tr><td>7</td><td>Remark(s)</td><td>The Charge Point should include the same header as used in Basic Auth RFC 2617, while requesting to upgrade the http connection to a websocket connection as described in RFC 6455. The server first needs to validate the Authorization header before upgrading the connection.
Example:
GET /ws HTTP/1.1
Remote-Addr: 127.0.0.1
UPGRADE: websocket
CONNECTION: Upgrade
HOST: 127.0.0.1:9999
ORIGIN: http://127.0.0.1:9999
SEC-WEBSOCKET-KEY: Pb4obWo2214EfaPQuazMjA==SEC-WEBSOCKET-VERSION: 13
AUTHORIZATION: Basic &lt;Base64 encoded(&lt;ChargePointId&gt;:_&lt;AuthorizationKey&gt;)</td></tr></table>

# 2.3.1. Unsecured Transport with Basic Authentication Profile - Requirements

Table 5. Security Profile 1 - Unsecured Transport with Basic Authentication - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A00.FR.201</td><td></td><td>The Unsecured Transport with Basic Authentication Profile SHOULD only be used in trusted networks.</td></tr><tr><td>A00.FR.202</td><td></td><td>The Charge Point SHALL authenticate itself to the Central System using HTTP Basic authentication [8]</td></tr><tr><td>A00.FR.203</td><td>A00.FR.202</td><td>The client, i.e. the Charge Point, SHALL provide a username and password with every connection request.</td></tr><tr><td>A00.FR.204</td><td>A00.FR.203</td><td>The username SHALL be equal to the Charge Point identity, which is the identifying string of the Charge Point as it uses it in the OCPP-J connection URL.</td></tr><tr><td>A00.FR.205</td><td>A00.FR.203</td><td>The password SHALL be stored in the AuthorizationKey Configuration Key. Minimal 16-bytes long, It is strongly advised to be randomly generated binary to get maximal entropy. Hexadecimal represented (20 bytes maximum, represented as a string of up to 40 hexadecimal digits).</td></tr><tr><td>A00.FR.206</td><td>A00.FR.203</td><td>With HTTP Basic, the username and password are transmitted in clear text, encoded in base64 only. Hence, it is RECOMMENDED that this mechanism will only be used over connections that are already secured with other means, such as VPNs.</td></tr></table>

# 2.4. TLS with Basic Authentication Profile - 2

Table 6. Security Profile 2 - TLS with Basic Authentication

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>TLS with Basic Authentication</td></tr><tr><td>2</td><td>Profile No.</td><td>2</td></tr><tr><td>3</td><td>Description</td><td>In the TLS with Basic Authentication profile, the communication channel is secured using Transport Layer Security (TLS). The Central System authenticates itself using a TLS server certificate. The Charge Points authenticate themselves using HTTP Basic Authentication.</td></tr><tr><td>4</td><td>Charge Point Authentication</td><td>For Charge Point authentication HTTP Basic authentication is used.Because TLS is used in this profile, the password will be sent encrypted, reducing the risks of using this authentication method.</td></tr><tr><td>5</td><td>Central System Authentication</td><td>The Charge Point authenticates the Central System via the TLS server certificate.</td></tr><tr><td>6</td><td>Communication Security</td><td>The communication between Charge Point and Central System is secured using TLS.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/a7074526f69a5e825915d9fccebd675f4682a7687e3ed7b2da2b65bfd7e3e4a9.jpg)  
Figure 2. Sequence Diagram: TLS with Basic Authentication sequence diagram

<table><tr><td>7</td><td>Remark(s)</td><td>TLS allows a number of configurations, not all of which provide sufficient security. The requirements below describe the configurations allowed for OCPP.
It is strongly RECOMMENDED to use TLS v1.2 or above for new Charge Points. This also facilitates a later upgrade to OCPP 2.0.1. To provide an adequate level of security for legacy Charge Points that cannot support TLS v1.2 or above, TLS v1.0 or v1.1 MAY be used with cypher suite TLS_RSA_WITH_AES_128_CBC_SHA.</td></tr></table>

# 2.4.1. TLS with Basic Authentication Profile - Requirements

Table 7. Security Profile 2 - TLS with Basic Authentication - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A00.FR.301</td><td></td><td>The Charge Point SHALL authenticate itself to the Central System using HTTP Basic authentication [8]</td></tr><tr><td>A00.FR.302</td><td>A00.FR.301</td><td>The client, i.e. the Charge Point, SHALL provide a username and password with every connection request.</td></tr><tr><td>A00.FR.303</td><td>A00.FR.302</td><td>The username SHALL be equal to the Charge Point identity, which is the identifying string of the Charge Point as it uses it in the OCPP-J connection URL.</td></tr><tr><td>A00.FR.304</td><td>A00.FR.302</td><td>The password SHALL be stored in the AuthorizationKey Configuration Key. Minimal 16-bytes long, It is strongly advised to be randomly generated binary to get maximal entropy. Hexadecimal represented (20 bytes maximum, represented as a string of up to 40 hexadecimal digits).</td></tr><tr><td>A00.FR.305</td><td></td><td>The Central System SHALL act as the TLS server.</td></tr><tr><td>A00.FR.306</td><td></td><td>The Central System SHALL authenticate itself by using the Central System certificate as server side certificate.</td></tr><tr><td>A00.FR.307</td><td></td><td>The Charge Point SHALL verify the certification path of the Central System's certificate according to the path validation rules established in Section 6 of [2].</td></tr><tr><td>A00.FR.308</td><td></td><td>The Charge Point SHALL verify that the commonName includes the Central System's Fully Qualified Domain Name (FQDN).</td></tr><tr><td>A00.FR.309</td><td>If the Central System does not own a valid certificate, or if the certification path is invalid</td><td>The Charge Point SHALL trigger an InvalidCentralSystemCertificate security event.</td></tr><tr><td>A00.FR.310</td><td>A00.FR.309</td><td>The Charge Point SHALL terminate the connection.</td></tr><tr><td>A00.FR.311</td><td></td><td>The communication channel SHALL be secured using Transport Layer Security (TLS) [3].</td></tr><tr><td>A00.FR.312</td><td></td><td>The Charge Point and Central System SHALL only use TLS v1.2 or above, TLS v1.0/1.1 MAY be used by Charge Points that cannot support TLS v1.2 (NOTE: TLS v1.0/1.1 is not allowed in OCPP 2.0.1).</td></tr><tr><td>A00.FR.313</td><td></td><td>Both of these endpoints SHALL check the version of TLS used.</td></tr><tr><td>A00.FR.314</td><td>A00.FR.313 AND The Central System detects that the Charge Point only allows connections using an older version of TLS, and TLS v1.0/1.1 not expected for this Charge Point, or only allows SSL</td><td>The Central System SHALL terminate the connection.</td></tr><tr><td>A00.FR.315</td><td>A00.FR.313 AND The Charge Point detects that the Central System only allows connections using an older version of TLS, or only allows SSL</td><td>The Charge Point SHALL trigger an InvalidTLSVersion security event AND terminate the connection.</td></tr><tr><td>A00.FR.316</td><td></td><td>TLS SHALL be implemented as in [3] or its successor standards without any modifications.</td></tr><tr><td>A00.FR.317</td><td></td><td>The Central System SHALL support at least the following four cipher suites:TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384TLS_RSA_WITH_AES_128_GCM_SHA256TLS_RSA_WITH_AES_256_GCM_SHA384Note: The Central System will have to provide 2 different certificates to support both Digital Signature Algorithms (RSA and ECDSA). Also when using security profile 3, the Central System should be capable of generating client side certificates for both Digital Signature Algorithms.</td></tr><tr><td>A00.FR.318</td><td></td><td>The Charge Point SHALL support at least the cipher suites:(TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256ANDTLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384)OR(TLS_RSA_WITH_AES_128_GCM_SHA256ANDTLS_RSA_WITH_AES_256_GCM_SHA384)ORWhen the Charge Point supports only TLS v1.0/1.1:TLS_RSA_WITH_AES_128_CBC_SHANote: TLS_RSA does not support forward secrecy, therefore TLS_ECDHE is RECOMMENDED. Furthermore, if the Charge Point detects an algorithm used that is not secure, it SHOULD trigger an InvalidTLSCipherSuite security event (send to the Central System via a SecurityEventNotification.req).</td></tr><tr><td>A00.FR.319</td><td></td><td>The Charge Point and Central System SHALL NOT use cipher suites that use cryptographic primitives marked as unsuitable for legacy use in [1]. This will mean that when one (or more) of the cipher suites described in this specification becomes marked as unsuitable for legacy use, it SHALL NOT be used anymore.</td></tr><tr><td>A00.FR.320</td><td></td><td>The TLS Server and Client SHALL NOT use TLS compression methods to avoid compression side-channel attacks and to ensure interoperability as described in Section 6 of [4].</td></tr><tr><td>A00.FR.321</td><td>A00.FR.320ANDThe Central System detects that theCharge Point only allows connections using one of these suites</td><td>The Central System SHALL terminate the connection.</td></tr><tr><td>A00.FR.322</td><td>A00.FR.320ANDThe Charge Point detects that theCentral System only allowsconnections using one of these suites</td><td>The Charge Point SHALL trigger an InvalidTLSCipherSuite security event AND terminate the connection.</td></tr><tr><td>A00.FR.323</td><td>When the Central System terminates the connection because of a security reason</td><td>It is RECOMMENDED to log a security event in the Central System.</td></tr><tr><td>A00.FR.324</td><td>When the Central System expects Charge Points with only TLS v1.0/1.1 support</td><td>The Central System SHOULD support the cypher suite: TLS_RSA_WITH_AES_128_CBC_SHA only for TLS v1.0/1.1 connections.</td></tr></table>

# 2.5. TLS with Client Side Certificates Profile - 3

Table 8. Security Profile 3 - TLS with Client Side Certificates

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>TLS with Client Side Certificates</td></tr><tr><td>2</td><td>Profile No.</td><td>3</td></tr><tr><td>3</td><td>Description</td><td>In the TLS with Client Side Certificates profile, the communication channel is secured using Transport Layer Security (TLS). Both the Charge Point and Central System authenticate themselves using certificates.</td></tr><tr><td>4</td><td>Charge Point Authentication</td><td>The Central System authenticates the Charge Point via the TLS client certificate.</td></tr><tr><td>5</td><td>Central System Authentication</td><td>The Charge Point authenticates the Central System via the TLS server certificate.</td></tr><tr><td>6</td><td>Communication Security</td><td>The communication between Charge Point and Central System is secured using TLS.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/cca21ba540c933f70219517fc07fe97128ca86fb48dbe235cd4d51b35ef4c49f.jpg)  
Figure 3. Sequence Diagram: TLS with Client Side Certificates

<table><tr><td>7</td><td>Remark(s)</td><td>It is strongly RECOMMENDED to use TLS v1.2 or above for new Charge Points. This also facilitates a later upgrade to OCPP 2.0.1. To provide an adequate level of security for legacy Charge Points that cannot support TLS v1.2 or above, TLS v1.0 or v1.1 MAY be used with cypher suite TLS_RSA_WITH_AES_128_CBC_SHA.</td></tr></table>

# 2.5.1. TLS with Client Side Certificates Profile - Requirements

Table 9. Security Profile 3 - TLS with Client Side Certificates - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A00.FR.401</td><td></td><td>The Charge Point SHALL authenticate itself to the Central System using the Charge Point certificate.</td></tr><tr><td>A00.FR.402</td><td></td><td>The Charge Point certificate SHALL be used as a TLS client side certificate</td></tr><tr><td>A00.FR.403</td><td></td><td>The Central System SHALL verify the certification path of the Charge Point's certificate according to the path validation rules established in Section 6 of [2]</td></tr><tr><td>A00.FR.404</td><td></td><td>The Central System SHALL verify that the certificate is owned by the CPO (or an organization trusted by the CPO) by checking that the O (organizationName) RDN in the subject field of the certificate contains the CPO name.</td></tr><tr><td>A00.FR.405</td><td></td><td>The Central System SHALL verify that the certificate belongs to this Charge Point by checking that the CN (commonName) RDN in the subject field of the certificate contains the unique Serial Number of the Charge Point</td></tr><tr><td>A00.FR.406</td><td>If the Charge Point certificate is not owned by the CPO, for instance immediately after installation</td><td>it is RECOMMENDED to update the certificate before continuing communication with the Charge Point (also see Installation during manufacturing or installation.)</td></tr><tr><td>A00.FR.407</td><td>If the Charge Point does not own a valid certificate, or if the certification path is invalid</td><td>The Central System SHALL terminate the connection.</td></tr><tr><td>A00.FR.408</td><td>A00.FR.407</td><td>It is RECOMMENDED to log a security event in the Central System.</td></tr><tr><td>A00.FR.409</td><td></td><td>The Central System SHALL act as the TLS server.</td></tr><tr><td>A00.FR.410</td><td></td><td>The Central System SHALL authenticate itself by using the Central System certificate as server side certificate.</td></tr><tr><td>A00.FR.411</td><td></td><td>The Charge Point SHALL verify the certification path of the Central System's certificate according to the path validation rules established in Section 6 of [2].</td></tr><tr><td>A00.FR.412</td><td></td><td>The Charge Point SHALL verify that the commonName matches the Central System's Fully Qualified Domain Name (FQDN).</td></tr><tr><td>A00.FR.413</td><td>If the Central System does not own a valid certificate, or if the certification path is invalid</td><td>The Charge Point SHALL trigger an InvalidCentralSystemCertificate security event.</td></tr><tr><td>A00.FR.414</td><td>A00.FR.413</td><td>The Charge Point SHALL terminate the connection.</td></tr><tr><td>A00.FR.415</td><td></td><td>The communication channel SHALL be secured using Transport Layer Security (TLS) [3].</td></tr><tr><td>A00.FR.416</td><td></td><td>The Charge Point and Central System SHALL only use TLS v1.2 or above, TLS v1.0/1.1 MAY be used by Charge Points that cannot support TLS v1.2 (NOTE: TLS v1.0/1.1 is not allowed in OCPP 2.0.1).</td></tr><tr><td>A00.FR.417</td><td></td><td>Both of these endpoints SHALL check the version of TLS used.</td></tr><tr><td>A00.FR.418</td><td>A00.FR.417 AND The Central System detects that the Charge Point only allows connections using an older version of TLS, and TLS v1.0/1.1 not expected for this Charge Point, or only allows SSL</td><td>The Central System SHALL terminate the connection.</td></tr><tr><td>A00.FR.419</td><td>A00.FR.417 AND The Charge Point detects that the Central System only allows connections using an older version of TLS, or only allows SSL</td><td>The Charge Point SHALL trigger an InvalidTLSVersion security event AND terminate the connection.</td></tr><tr><td>A00.FR.420</td><td></td><td>TLS SHALL be implemented as in [3] or its successor standards without any modifications.</td></tr><tr><td>A00.FR.421</td><td></td><td>The Central System SHALL support at least the following four cipher suites: TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 TLS_RSA_WITH_AES_128_GCM_SHA256 TLS_RSA_WITH_AES_256_GCM_SHA384</td></tr><tr><td>A00.FR.422</td><td></td><td>The Charge Point SHALL support at least the cipher suites: (TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 AND TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384) OR (TLS_RSA_WITH_AES_128_GCM_SHA256 AND TLS_RSA_WITH_AES_256_GCM_SHA384) OR When the Charge Point supports only TLS v1.0/1.1: TLS_RSA_WITH_AES_128_CBC_SHA Note: TLS_RSA does not support forward secrecy, therefore TLS_ECDHE is preferred. Furthermore, if the Charge Point detects an algorithm used that is not secure, it SHOULD trigger an InvalidTLSCipherSuite security event.</td></tr><tr><td>A00.FR.423</td><td></td><td>The Charge Point and Central System SHALL NOT use cipher suites that use cryptographic primitives marked as unsuitable for legacy use in [1]. This will mean that when one (or more) of the cipher suites described in this specification becomes marked as unsuitable for legacy use, it SHALL NOT be used anymore.</td></tr><tr><td>A00.FR.424</td><td></td><td>The TLS Server and Client SHALL NOT use TLS compression methods to avoid compression side-channel attacks and to ensure interoperability as described in Section 6 of [4].</td></tr><tr><td>A00.FR.425</td><td>A00.FR.424 AND If the Central System detects that the Charge Point only allows connections using one of these suites</td><td>The Central System SHALL terminate the connection.</td></tr><tr><td>A00.FR.426</td><td>A00.FR.424 AND The Charge Point detects that the Central System only allows connections using one of these suites</td><td>The Charge Point SHALL trigger an InvalidTLSCipherSuite security event AND terminate the connection.</td></tr><tr><td>A00.FR.427</td><td></td><td>A unique Charge Point certificate SHALL be used for each Charge Point.</td></tr><tr><td>A00.FR.428</td><td>When the Central System expects Charge Points with only TLS v1.0/1.1 support</td><td>The Central System SHOULD support the cypher suite: TLS_RSA_WITH_AES_128_CBC_SHA only for TLS v1.0/1.1 connections.</td></tr><tr><td>A00.FR.429</td><td>When Charge Point supports Security Profile 3</td><td>The manufacturer is required to give every Charge Point a unique Serial Number.</td></tr></table>

# 2.6. Keys used in OCPP

OCPP uses a number of public private key pairs for its security, see below Table. To manage the keys on the Charge Point, messages have been added to OCPP. Updating keys on the Central System or at the manufacturer is out of scope for OCPP. If TLS with Client Side certificates is used, the Charge Point requires a "Charge Point certificate" for authentication against the Central System.

Table 10. Certificates used in the OCPP security specification

<table><tr><td>CERTIFICATE</td><td>PRIVATE KEY STORED AT</td><td>DESCRIPTION</td></tr><tr><td>Central System Certificate</td><td>Central System</td><td>Key used to authenticate the Central System.</td></tr><tr><td>Central System Root Certificate</td><td>Central System</td><td>Certificate used to authenticate the Central System.</td></tr><tr><td>Charge Point Certificate</td><td>Charge Point</td><td>Key used to authenticate the Charge Point.</td></tr><tr><td>Firmware Signing Certificate</td><td>Manufacturer</td><td>Key used to verify the firmware signature.</td></tr><tr><td>Manufacturer Root Certificate</td><td>Manufacturer</td><td>Root certificate for verification of the Manufacturer certificate.</td></tr></table>

# 2.6.1. Certificate Properties

Table 11. Certificate Properties requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A00.FR.501</td><td></td><td>All certificates SHALL use a private key that provides security equivalent to a symmetric key of at least 112 bits according to Section 5.6.1 of [7]. This is the key size that NIST recommends for the period 2011-2030.</td></tr><tr><td>A00.FR.502</td><td>A00.FR.501ANDRSA or DSA</td><td>This translates into a key that SHALL be at least 2048 bits long.</td></tr><tr><td>A00.FR.503</td><td>A00.FR.501ANDelliptic curve cryptography</td><td>This translates into a key that SHALL be at least 224 bits long.</td></tr><tr><td>A00.FR.504</td><td></td><td>For all cryptographic operations, only the algorithms recommended by BSI in [5], which are suitable for use in future systems, SHALL be used. This restriction includes the signing of certificates in the certificate hierarchy</td></tr><tr><td>A00.FR.505</td><td></td><td>For signing by the certificate authority RSA-PSS, or ECDSA SHOULD be used.</td></tr><tr><td>A00.FR.506</td><td></td><td>For computing hash values the SHA256 algorithm SHOULD be used.</td></tr><tr><td>A00.FR.507</td><td></td><td>The certificates SHALL be stored and transmitted in the X.509 format encoded in Privacy-Enhanced Mail (PEM) format.</td></tr><tr><td>A00.FR.508</td><td></td><td>All certificates SHALL include a serial number.</td></tr><tr><td>A00.FR.509</td><td></td><td>The subject field of the certificate SHALL contain the organization name of the certificate owner in the O (organizationName) RDN.</td></tr><tr><td>A00.FR.510</td><td></td><td>For the Central System certificate, the subject field SHALL contain the Fully Qualified Domain Name (FQDN) of the server in the CN (commonName) RDN</td></tr><tr><td>A00.FR.511</td><td></td><td>For the Charge Point certificate, the subject field SHALL contain a CN (commonName) RDN which consists of the unique serial number of the Charge Point. This serial number SHALL NOT be in the format of a URL or an IP address so that Charge Point certificates can be differentiated from Central System certificates.
Note: According to RFC 2818 [12], if a subjectAltName extension of type dnsName is present, that must be used as the identity. This would be incompliant with OCPP. Therefore it SHOULD NOT be used in Charge Point and Central System certificates.
It is allowed to use the subjectAltName extension of type dnsName for a Central System, when the Central System has multiple network paths to reached it. (for example, via a private APN + VPN using its IP address in the VPN and via public Internet using a named URL)</td></tr><tr><td>A00.FR.512</td><td></td><td>For all certificates the X.509 Key Usage extension [9] SHOULD be used to restrict the usage of the certificate to the operations for which it will be used.</td></tr></table>

# 2.6.2. Certificate Hierarchy

This White Paper adds support for the use of two separate certificate hierarchies:

1. The Charge Point Operator hierarchy which contains the Central System, and Charge Point certificates.
2. The Manufacturer hierarchy which contains the Firmware Signing certificate.

The Central System can update the CPO root certificates stored on the Charge Point using the InstallCertificate.req message.

Table 12. Certificate Hierarchy requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A00.FR.601</td><td></td><td>The Charge Point Operator MAY act as a certificate authority for the Charge Point Operator hierarchy</td></tr><tr><td>A00.FR.602</td><td></td><td>The private keys belonging to the CPO root certificates MUST be well protected.</td></tr><tr><td>A00.FR.603</td><td></td><td>As the Manufacturer is usually a separate organization from the Charge Point Operator, a trusted third party SHOULD be used as a certificate authority. This is essential to have non-repudiation of firmware images.</td></tr></table>

# 2.6.3. Certificate Revocation

In some cases a certificate may become invalid prior to the expiration of the validity period. Such cases include changes of the organization name, or the compromise or suspected compromise of the certificate's private key. In such cases, the certificate needs to be revoked or indicate it is no longer valid. The revocation of the certificate does not mean that the connection needs to be closed as the the connection can stay open longer than 24 hours.

Different methods are recommended for certificate revocation, see below Table.

Table 13. Recommended revocation methods for the different certificates.

<table><tr><td>CERTIFICATE</td><td>REVOCATION</td></tr><tr><td>Central System certificate</td><td>Fast expiration</td></tr><tr><td>Charge Point certificate</td><td>Online verification</td></tr><tr><td>Firmware Signing certificate</td><td>Online verification</td></tr></table>

Table 14. Certificate Revocation requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A00.FR.701</td><td></td><td>Fast expiration SHOULD be used to revoke the Central System certificate. (See Note 1)</td></tr><tr><td>A00.FR.702</td><td></td><td>The Central System SHOULD use online certificate verification to verify the validity of the Charge Point certificates.</td></tr><tr><td>A00.FR.703</td><td></td><td>It is RECOMMENDED that a separate certificate authority server is used to manage the certificates.</td></tr><tr><td>A00.FR.704</td><td></td><td>The Central System SHALL verify the validity of the certificate with the certificate authority server. (See Note 2)</td></tr><tr><td>A00.FR.706</td><td></td><td>Prior to providing the certificate for firmware validation to the Charge Point, the Central System SHOULD validate both, the certificate and the signed firmware update.</td></tr></table>

Note 1: With fast expiration, the certificate is only valid for a short period, less than 24 hours. After that the server needs to request a new certificate from the Certificate Authority, which may be the CPO itself (see section Certificate Hierarchy). This prevents the Charge Points from needing to implement revocation lists or online certificate verification. This simplifies the implementation of certificate management at the Charge Point and reduces communication costs at the Charge Point side. By requiring fast expiration, if the certificate is compromised, the impact is reduced to only a short period.

When the certificate chain should become compromised, attackers could used forged certificates to trick a Charge Point to connect to a "fake" Central System. By using fast expiration, the time a Charge Point is vulnerable is greatly reduced.

The Charge Point always communicates with the Certificate Authority through the Central System, this way, if the Charge Points is compromised, the Charge Point cannot attack the CA directly.

Note 2: This allows for immediate revocation of Charge Point certificates. Revocation of Charge Point certificates will happen for instance when a Charge Point is removed. This is more common than revoking the Central System certificate, which is normally only done when it is compromised.

Note 3: It is best practice for any certificate authority server to keep track of revoked certificates.

# 2.6.4. Installation during manufacturing or installation.

Unique credentials should be used to authenticate each Charge Point to the Central System, whether they are the password used for HTTP Basic Authentication (see Charge Point Authentication) or the Charge Point certificate. These unique credentials have to be put on the Charge Point at some point during manufacturing or installation.

Table 15. Certificate Installation requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A00.FR.801</td><td></td><td>It is RECOMMENDED that the manufacturer initializes the Charge Point with unique credentials during manufacturing.</td></tr><tr><td>A00.FR.802</td><td>A00.FR.801</td><td>The credentials SHOULD be generated using a cryptographic random number generator, and installed in a secure environment.</td></tr><tr><td>A00.FR.803</td><td>A00.FR.801</td><td>The information needed by the CPO to validate the Charge Point credentials SHOULD be sent to the CPO over a secure channel, so that the CPO can import them in the Central System. For example the password. The Certificate Private key is not needed by the CPO and SHOULD NOT be provided to the CPO.</td></tr><tr><td>A00.FR.804</td><td>If Charge Point certificates are used.</td><td>The manufacturer MAY sign these using their own certificate.</td></tr><tr><td>A00.FR.805</td><td>A00.FR.804</td><td>It is RECOMMENDED that the CPO immediately updates the credentials after installation using the methods described in Section A01 - Update Charge Point Password for HTTP Basic Authentication or A02 - Update Charge Point Certificate by request of the Central System.</td></tr><tr><td>A00.FR.806</td><td>Before the &#x27;factory credentials&#x27; have been updated</td><td>The Central System MAY restrict the functionality that the Charge Point can use. The Central System can use the BootNotification state: Pending for this. During the Pending state, the Central System can update the credentials.</td></tr></table>

# A01 - Update Charge Point Password for HTTP Basic Authentication

Table 16. A01 - Password Management

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Update Charge Point Password for HTTP Basic Authentication</td></tr><tr><td>2</td><td>ID</td><td>A01 (OCPP 2.0.1)</td></tr><tr><td>3</td><td>Objective(s)</td><td>This use case defines how to use the authorizationKey, the password used to authenticate Charge Points in the Basic and TLS with Basic Authentication security profiles.</td></tr><tr><td>4</td><td>Description</td><td>To enable the Central System to configure a new password for HTTP Basic Authentication, the Central System can send a new value for the AuthorizationKey Configuration Key.</td></tr><tr><td></td><td>Actors</td><td>Charge Point, Central System</td></tr><tr><td></td><td>Scenario description</td><td>1. The Central System sends a ChangeConfiguration.req(key = AuthorizationKey) to the Charge Point with the AuthorizationKey Configuration Key.
2. The Charge Point responds with ChangeConfiguration.conf and the status Accepted.
3. The Charge Point disconnects it current connection. (Storing any queued messages)
4. The Charge Point connects to the Central System with the new password.</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>Security Profile: Basic Security Profile or TLS with Basic Authentication in use.</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>Successful postcondition:
The Charge Point has reconnected to the Central System with the new password.
Failure postcondition:
If the Charge Point responds to the ChangeConfiguration.req with a ChangeConfiguration.req with a status other than Accepted, the Charge Point will keep using the old credentials. The Central System might treat the Charge Point differently, e.g. by not accepting the Charge Point's boot notifications.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/1ac541d68f94ab2052239c9af1743e2421a875a9e34935fdb0a17e4b6cc9008b.jpg)  
Figure 4. Update Charge Point Password for HTTP Basic Authentication (happy flow)

<table><tr><td>7</td><td>Error handling</td><td>n/a</td></tr><tr><td>8</td><td>Remark(s)</td><td>n/a</td></tr></table>

# A01 - Update Charge Point Password for HTTP Basic Authentication - Requirements

Table 17. A01 - Update Charge Point Password for HTTP Basic Authentication - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A01.FR.01</td><td></td><td>The Charge Point SHALL store the password in the configuration key AuthorizationKey.</td></tr></table>

Table 18. A02 - Update Charge Point Certificate by request of Central System

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A01.FR.02</td><td></td><td>To set a Charge Point&#x27;s authorization key via OCPP, the Central System SHALL send the Charge Point a ChangeConfiguration.req message with the AuthorizationKey Configuration Key.</td></tr><tr><td>A01.FR.03</td><td>A01.FR.02 AND The Charge Point responds to this ChangeConfiguration.req with a ChangeConfiguration.conf with status Accepted.</td><td>The Central System SHALL assume that the authorization key change was successful, and no longer accept the credentials previously used by the Charge Point.</td></tr><tr><td>A01.FR.04</td><td>A01.FR.02 AND The Charge Point responds to this ChangeConfiguration.req with a ChangeConfiguration.conf with status Rejected or NotSupported.</td><td>The Central System SHALL assume that the Charge Point has NOT changed the password. Therefore the Central System SHALL keep accepting the old credentials.</td></tr><tr><td>A01.FR.05</td><td>A01.FR.04</td><td>While the Central System SHALL still accepts a connection from the Charge Point, it MAY restrict the functionality that the Charge Point can use. The Central System can use the BootNotification state: Pending for this. During the Pending state, the Central System can for example retry to update the credentials.</td></tr><tr><td>A01.FR.06</td><td></td><td>Different passwords SHOULD be used for different Charge Points.</td></tr><tr><td>A01.FR.07</td><td></td><td>Passwords SHOULD be generated randomly to ensure that the passwords have sufficient entropy.</td></tr><tr><td>A01.FR.08</td><td></td><td>the Central System SHOULD only store salted password hashes, not the passwords themselves.</td></tr><tr><td>A01.FR.09</td><td></td><td>the Central System SHOULD NOT put the passwords in clear-text in log files or debug information. In this way, if the Central System is compromised not all Charge Point password will be immediately compromised.</td></tr><tr><td>A01.FR.10</td><td></td><td>On the Charge Point the password needs to be stored in clear-text. Extra care SHOULD be taken into storing it securely. Definitions of mechanisms how to securely store the credentials are however not in scope of the OCPP Security Profiles.</td></tr><tr><td>A01.FR.11</td><td>A01.FR.02</td><td>The Charge Point SHALL log the change of AuthorizationKey in the Security log.</td></tr><tr><td>A01.FR.12</td><td>A01.FR.11</td><td>The Charge Point SHALL NOT disclose the content of the AuthorizationKey in its logging. This is to prevent exposure of key material to persons that may have access to a diagnostics file.</td></tr></table>

# A02 - Update Charge Point Certificate by request of Central System

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Update Charge Point Certificate by request of Central System</td></tr><tr><td>2</td><td>ID</td><td>A02 (OCPP 2.0.1)</td></tr><tr><td>3</td><td>Objective(s)</td><td>To facilitate the management of the Charge Point client side certificate, a certificate update procedure is provided.</td></tr><tr><td>4</td><td>Description</td><td>The Central System requests the Charge Point to update its key using ExtendedTriggerMessage.req(SignChargePointCertificate).</td></tr><tr><td></td><td>Actors</td><td>Charge Point, Central System, Certificate Authority Server</td></tr><tr><td></td><td>Scenario description</td><td>1. The Central System requests the Charge Point to update its certificate using the ExtendedTriggerMessage.req(SignChargePointCertificate) message.
2. The Charge Point responds with ExtendedTriggerMessage.conf
3. The Charge Point generates a new public / private key pair.
4. The Charge Point sends a SignCertificate.req to the Central System.
5. The Central System responds with SignCertificate.conf, with status Accepted.
6. The Central System forwards the CSR to the Certificate Authority Server.
7. Certificate Authority Server signs the certificate.
8. The Certificate Authority Server returns the Signed Certificate to the Central System.
9. The Central System sends CertificateSigned.req to the Charge Point.
10. The Charge Point verifies the Signed Certificate.
11. The Charge Point responds with h to the Central System with the status Accepted or Rejected.</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>The configuration variable CpoName MUST be set.</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>Successful postcondition:
New Client Side certificate installed in the Charge Point.
Failure postcondition:
New Client Side certificate is rejected and discarded.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/dcbfd1f102f800c37208ce1d58be17cf4bfcde43d0fcef1cb0e96f472382f808.jpg)  
Figure 5. Update Charge Point Certificate

<table><tr><td>7</td><td>Error handling</td><td>The Central System accepts the CSR request from the Charge Point, before forwarding it to the CA. But when the CA cannot be reached, or rejects the CSR, the Charge Point will never known. The Central System may do some checks on the CSR, but cannot do all the checks that a CA does, and it does not prevent connection timeout to the CA. When something like this goes wrong, either the CA is offline or the CSR send by the Charge Point is not correct, according to the CA. In both cases this is something an operator at the CPO needs to be notified of. The operator then needs to investigate the issue. When resolved, the operator can re-run A02. It is NOT RECOMMENDED to let the Charge Point retry when the certificate is not send within X minutes or hours. When the CSR is incorrect, that will not be resolved automatically. It is possible that only a new firmware will fix this.</td></tr><tr><td>8</td><td>Remark(s)</td><td>The CPO may act as a Certification Authority, so the CA Server may be a local server.
The applicable Certification Authority SHALL check the information in the CSR.
If it is correct, the Certificate Authority SHALL sign the CSR, send it to the CPO, the CPO sends it back to the Charge Point in the CertificateSigned.req message
The certificate authority SHOULD implement strong measures to keep the certificate signing private keys secure.
Even though the messages CertificateSigned.req (see use cases A02 and A03) and InstallCertificate.req (use case M05 - Install CA Certificate in a Charge Point) are both used to send certificates, their purposes are different.
CertificateSigned.req is used to return the the Charge Points own public certificate signed by a Certificate Authority. InstallCertificate.req is used to install Root certificates.
For (Sub-)CA certificate handling see use cases M03 - Retrieve list of available certificates from a Charge Point, M04 - Delete a specific certificate from a Charge Point, M05 - Install CA certificate in a Charge Point.</td></tr></table>

# A02 - Update Charge Point Certificate by request of Central System - Requirements

Table 19. A02 - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A02.FR.01</td><td></td><td>A key update SHOULD be performed after installation of the Charge Point, to change the key from the one initially provisioned by the manufacturer (possibly a default key).</td></tr><tr><td>A02.FR.02</td><td>After sending a ExtendedTriggerMessage.conf.</td><td>The Charge Point SHALL generate a new public / private key pair using one of the key generation functions described in Section 4.2.1.3 of [6].</td></tr><tr><td>A02.FR.03</td><td>A02.FR.02</td><td>The Charge Point SHALL send the public key in form of a Certificate Signing Request (CSR) as described in RFC 2986 [14] and then PEM encoded, using the SignCertificate.req message.</td></tr><tr><td>A02.FR.04</td><td></td><td>The Central System SHOULD NOT sign the certificate itself, but instead forwards the CSR to a dedicated certificate authority server managing the certificates for the Charge Point infrastructure. The dedicated authority server MAY be operated by the CPO.</td></tr><tr><td>A02.FR.05</td><td></td><td>The private key generated by the Charge Point during the key update process SHALL NOT leave the Charge Point at any time, and SHALL NOT be readable via OCPP or any other (remote) communication connection.</td></tr><tr><td>A02.FR.06</td><td></td><td>The Charge Point SHALL verify the validity of the signed certificate in the CertificateSigned.req message, checking at least the period when the certificate is valid, the properties in Certificate Properties, and that it is part of the Charge Point Operator certificate hierarchy as described in Certificate Hierarchy.</td></tr><tr><td>A02.FR.07</td><td>If the certificate is not valid.</td><td>The Charge Point SHALL discard the certificate, and trigger an InvalidChargePointCertificate security event.</td></tr><tr><td>A02.FR.08</td><td></td><td>The Charge Point SHALL switch to the new certificate as soon as the current date and time is after the 'Not valid before' field in the certificate.</td></tr><tr><td>A02.FR.09</td><td>If the Charge Point contains more than one valid certificate of the same type.</td><td>The Charge Point SHALL use the newest certificate, as measured by the start of the validity period.</td></tr><tr><td>A02.FR.10</td><td>When the Charge Point has validated that the new certificate works</td><td>The Charge Point MAY discard the old certificate. It is RECOMMENDED to store old certificates for one month, as fallback.</td></tr><tr><td>A02.FR.11</td><td>Upon receipt of a SignCertificate.req AND It is able to process the request</td><td>The Central System SHALL set status to Accepted in the SignCertificate.conf.</td></tr><tr><td>A02.FR.12</td><td>Upon receipt of a SignCertificate.req AND It is NOT able to process the request</td><td>The Central System SHALL set status to Rejected in the SignCertificate.conf.</td></tr><tr><td>A02.FR.13</td><td>A02.FR.03</td><td>The Charge Point SHALL put the value of the CpoName configuration key in the organizationName (O) RDN in the CSR subject field.</td></tr></table>

# A03 - Update Charge Point Certificate initiated by the Charge Point

Table 20. A03 - Update Charge Point Certificate initiated by the Charge Point

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Update Charge Point Certificate initiated by the Charge Point</td></tr><tr><td>2</td><td>ID</td><td>A03 (OCPP 2.0.1)</td></tr><tr><td>3</td><td>Objective(s)</td><td>To facilitate the management of the Charge Point client side certificate, a certificate update procedure is provided.</td></tr><tr><td>4</td><td>Description</td><td>The Charge Point detects that the &#x27;Charge Point Certificate&#x27; it is using will expire in one month. The Charge Point initiates the process to update its key using SignCertificate.req.</td></tr><tr><td></td><td>Actors</td><td>Charge Point, Central System, Certificate Authority Server</td></tr><tr><td></td><td>Scenario description</td><td>1. The Charge Point detects that the Charge Point certificate is due to expire.
2. The Charge Point generates a new public / private key pair.
3. The Charge Point sends a SignCertificate.req to the Central System.
4. The Central System responds with a SignCertificate.conf, with status Accepted.
5. The Central System forwards the CSR to the Certificate Authority Server.
6. Certificate Authority Server signs the certificate.
7. The Certificate Authority Server returns the Signed Certificate to the Central System.
8. The Central System sends a CertificateSigned.req to the Charge Point.
9. The Charge Point verifies the Signed Certificate.
10. The Charge Point responds with a CertificateSigned.conf to the Central System with the status Accepted or Rejected.</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>The configuration variable CpoName MUST be set.</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>Successful postcondition:
New Client Side certificate installed in the Charge Point.
Failure postcondition:
New Client Side certificate is rejected and discarded.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/48f5eac52baf8b1311d15a38b540f6519fa79f3fe80816028c2b0b0fbcfd6dcd.jpg)  
Figure 6. Update Charge Point Certificate initiated by Charge Point

<table><tr><td>7</td><td>Error handling</td><td>The Central System accepts the CSR request from the Charge Point, before forwarding it to the CA. But when the CA cannot be reached, or rejects the CSR, the Charge Point will never known. The Central System may do some checks on the CSR, but cannot do all the checks that a CA does, and it does not prevent connection timeout to the CA. When something like this goes wrong, either the CA is offline or the CSR send by the Charge Point is not correct, according to the CA. In both cases this is something an operator at the CPO needs to be notified of. The operator then needs to investigate the issue. When resolved, the operator can re-run A02. It is NOT RECOMMENDED to let the Charge Point retry when the certificate is not send within X minutes or hours. When the CSR is incorrect, that will not be resolved automatically. It is possible that only a new firmware will fix this.</td></tr><tr><td>8</td><td>Remark(s)</td><td>Same remarks as in A02 - Update Charge Point Certificate by request of Central System apply.</td></tr></table>

# A03 - Update Charge Point Certificate initiated by the Charge Point - Requirements

Table 21. A03 - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A03.FR.01</td><td></td><td>A key update MAY be performed after installation of the Charge Point, to change the key from the one initially provisioned by the manufacturer (possibly a default key).</td></tr><tr><td>A03.FR.02</td><td>When the Charge Point detects that the current Charge Point certificate will expire in one month.</td><td>The Charge Point SHALL generate a new public / private key pair using one of the key generation functions described in Section 4.2.1.3 of [6].</td></tr><tr><td>A03.FR.03</td><td>A03.FR.02</td><td>The Charge Point SHALL send the public key in form of a Certificate Signing Request (CSR) as described in RFC 2986 [14] and then PEM encoded, using the SignCertificate.req message.</td></tr><tr><td>A03.FR.04</td><td></td><td>The Central System SHOULD NOT sign the certificate itself, but instead forwards the CSR to a dedicated certificate authority server managing the certificates for the Charge Point infrastructure. The dedicated authority server MAY be operated by the CPO.</td></tr><tr><td>A03.FR.05</td><td></td><td>The private key generated by the Charge Point during the key update process SHALL NOT leave the Charge Point at any time, and SHALL NOT be readable via OCPP or any other (remote) communication connection.</td></tr><tr><td>A03.FR.06</td><td></td><td>The Charge Point SHALL verify the validity of the signed certificate in the CertificateSigned.req message, checking at least the period when the certificate is valid, the properties in Certificate Properties, and that it is part of the Charge Point Operator certificate hierarchy as described in Certificate Hierarchy.</td></tr><tr><td>A03.FR.07</td><td>If the certificate is not valid.</td><td>The Charge Point SHALL discard the certificate, and trigger an InvalidChargePointCertificate security event.</td></tr><tr><td>A03.FR.08</td><td></td><td>The Charge Point SHALL switch to the new certificate as soon as the current date and time is after the 'Not valid before' field in the certificate.</td></tr><tr><td>A03.FR.09</td><td>If the Charge Point contains more than one valid certificate of the same type.</td><td>The Charge Point SHALL use the newest certificate, as measured by the start of the validity period.</td></tr><tr><td>A03.FR.10</td><td>When the Charge Point has validated that the new certificate works</td><td>The Charge Point MAY discard the old certificate. It is RECOMMENDED to store old certificates for one month, as fallback.</td></tr><tr><td>A03.FR.11</td><td>Upon receipt of a SignCertificate.req AND It is able to process the request</td><td>The Central System SHALL set status to Accepted in the SignCertificate.conf.</td></tr><tr><td>A03.FR.12</td><td>Upon receipt of a SignCertificate.req AND It is NOT able to process the request</td><td>The Central System SHALL set status to Rejected in the SignCertificate.conf.</td></tr><tr><td>A03.FR.13</td><td>A03.FR.03</td><td>The Charge Point SHALL put the value of CpoName in the organizationName RDN in the CSR subject field.</td></tr></table>

# A05 - Upgrade Charge Point Security Profile

Table 22. A05 - Upgrade Charge Point Security Profile

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Upgrade Charge Point Security Profile</td></tr><tr><td>2</td><td>ID</td><td>A05 (OCPP 2.0.1)</td></tr><tr><td>3</td><td>Objective(s)</td><td>Upgrade the security profile used by a Charge Point to a higher profile.</td></tr><tr><td>4</td><td>Description</td><td>The CPO wants to increase the security of the OCPP connection between Central System and a Charge Point. This use case is especially relevant when migrating from OCPP 1.6 without security profiles to OCPP 1.6 with security profiles, before migrating to a security profile the prerequisites, like installed certificates or password need to be configured. The CPO ensures the prerequisite(s) for going to a higher security certificates are met before sending the command to change to a higher security profile. the Charge Point reconnects to the Central System using the higher security profile.</td></tr><tr><td></td><td>Actors</td><td>Charge Point, Central System, CPO</td></tr><tr><td></td><td>Scenario description</td><td>1. CPO command the Central System to upgrade a Charge Point to a higher Security Profile.2. The Central System sends a ChangeConfiguration.req for configuration key: SecurityProfile with a new (higher) value to the Charge Point.3. The Charge Point checks all the prerequisites for the new Security Profile.4. The Charge Point responds with ChangeConfiguration.conf.5. The Charge Point disconnects it&#x27;s current connection the Central System. 6. The Charge Point connects to the Central System using the new Security Profile.</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>Configuration Key: SecurityProfile available.</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>Successful postcondition:The Charge Point is using the higher security profile.Failure postcondition:The Charge Point is NOT using the higher security profile.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/aa8a30542b91db05532180e5773c64314b4442b35c4a1ed49c57be57da1558be.jpg)  
Figure 7. Upgrade Charge Point Certificate initiated by Charge Point

<table><tr><td>7</td><td>Error handling</td><td>If the Charge Point is unable to connect to the Central System using the configured (higher) security profile, it SHOULD fallback to its previous security profile settings. This is to prevent that the Charge Point will become unable to reconnect to the Central System on its own.</td></tr><tr><td>8</td><td>Remark(s)</td><td>For security reasons it is not allowed to change to a lower Security Profile over OCPP.</td></tr></table>

# A05 - Upgrade Charge Point Security Profile - Requirements

Table 23. A05 - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>A05.FR.01</td><td>Charge Point receives ChangeConfiguration.req for SecurityProfile with a value lower or equal to the current value.</td><td>The Charge Point SHALL respond with ChangeConfiguration.conf(Rejected), and not change the value for SecurityProfile and/or reconnect to the Central System.</td></tr><tr><td>A05.FR.02</td><td>Charge Point receives ChangeConfiguration.req for SecurityProfile with a value higher than the current value AND new value is 1 or 2 AND configuration key: AuthorizationKey does not contain a value (that meets the requirements for AuthorizationKey)</td><td>The Charge Point SHALL respond with ChangeConfiguration.conf(Rejected), and not change the value for SecurityProfile and/or reconnect to the Central System.</td></tr><tr><td>A05.FR.03</td><td>Charge Point receives ChangeConfiguration.req for SecurityProfile with a value higher then the current value AND new value is 2 or 3 AND No valid CentralSystemRootCertificate installed</td><td>The Charge Point SHALL respond with ChangeConfiguration.conf(Rejected), and not change the value for SecurityProfile and/or reconnect to the Central System.</td></tr><tr><td>A05.FR.04</td><td>Charge Point receives ChangeConfiguration.req for SecurityProfile with a value higher then the current value AND new value is 3 AND No valid ChargePointCertificate installed</td><td>The Charge Point SHALL respond with ChangeConfiguration.conf(Rejected), and not change the value for SecurityProfile and/or reconnect to the Central System.</td></tr><tr><td>A05.FR.05</td><td>Charge Point receives ChangeConfiguration.req for SecurityProfile with a value higher then the current value AND all prerequisites are met</td><td>The Charge Point SHALL respond with ChangeConfiguration.conf(Accepted)</td></tr><tr><td>A05.FR.06</td><td>A05.FR.05</td><td>The Charge Point SHALL disconnect from the Central System</td></tr><tr><td>A05.FR.07</td><td>A05.FR.06</td><td>The Charge Point SHALL reconnect the Central System with the new Security Profile</td></tr><tr><td>A05.FR.08</td><td>A05.FR.07 AND The Charge Point was unable to connect to the Central System</td><td>The Charge Point SHOULD fallback to its previous security profile setting.</td></tr><tr><td>A05.FR.09</td><td>A05.FR.07 AND
The Charge Point was able to successfully connect to the Central System</td><td>The Central System SHALL NOT allow the Charge Point to connect with a lower security profile anymore.</td></tr></table>

# M03 - Retrieve list of available certificates from a Charge Point

Table 24. M03 - Retrieve list of available certificates from a Charge Point

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Retrieve list of available certificates from a Charge Point</td></tr><tr><td>2</td><td>ID</td><td>M03 (OCPP 2.0.1)</td></tr><tr><td>3</td><td>Objective(s)</td><td>To enable the Central System to retrieve a list of available certificates from a Charge Point.</td></tr><tr><td>4</td><td>Description</td><td>To facilitate the management of the Charge Point&#x27;s installed certificates, a method of retrieving the installed certificates is provided. The Central System requests the Charge Point to send a list of installed certificates</td></tr><tr><td></td><td>Actors</td><td>Charge Point, Central System</td></tr><tr><td></td><td>Scenario description</td><td>1. The Central System requests the Charge Point to send a list of installed certificates by sending a GetInstalledCertificates.req
2. The Charge Point responds with a GetInstalledCertificates.conf</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>n/a</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>The Central System received a list of installed certificates</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/5c056493731c00efd5a6b558f580dd04c8e97dbb33bf10117432eca7e59516e6.jpg)  
Figure 8. Retrieve list of available certificates from a Charge Point

<table><tr><td>7</td><td>Error handling</td><td>n/a</td></tr><tr><td>8</td><td>Remark(s)</td><td>For installing the Charge Point Certificate, see use cases A02 - Update Charge Point Certificate by request of Central System and A03 - Update Charge Point Certificate initiated by the Charge Point.</td></tr></table>

# M03 - Retrieve list of available certificates from a Charge Point - Requirements

Table 25. M03 - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>M03.FR.01</td><td>After receiving a GetInstalledCertificates.req</td><td>The Charge Point SHALL respond with a GetInstalledCertificates.conf.</td></tr><tr><td>M03.FR.02</td><td>M03.FR.01 AND No certificate matching certificateType was found</td><td>The Charge Point SHALL indicate this by setting status in the GetInstalledCertificates.conf to NotFound.</td></tr><tr><td>M03.FR.03</td><td>M03.FR.01 AND A certificate matching certificateType was found</td><td>The Charge Point SHALL indicate this by setting status in the GetInstalledCertificates.conf to Accepted.</td></tr><tr><td>M03.FR.04</td><td>M03.FR.03</td><td>The Charge Point SHALL include the hash data for each matching installed certificate in the GetInstalledCertificates.conf.</td></tr></table>

# M04 - Delete a specific certificate from a Charge Point

Table 26. M04 - Delete a specific certificate from a Charge Point

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Delete a specific certificate from a Charge Point</td></tr><tr><td>2</td><td>ID</td><td>M04 (OCPP 2.0.1)</td></tr><tr><td>3</td><td>Objective(s)</td><td>To enable the Central System to request the Charge Point to delete an installed certificate.</td></tr><tr><td>4</td><td>Description</td><td>To facilitate the management of the Charge Point&#x27;s installed certificates, a method of deleting an installed certificate is provided. The Central System requests the Charge Point to delete a specific certificate.</td></tr><tr><td></td><td>Actors</td><td>Charge Point, Central System</td></tr><tr><td></td><td>Scenario description</td><td>1. The Central System requests the Charge Point to delete an installed certificate by sending a DeleteCertificate.req.
2. The Charge Point responds with a DeleteCertificate.conf.</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>n/a</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>The requested certificate was deleted from the Charge Point.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/e98af77b35919a949a89d0fe647444ba23c70b7e742a499379c4cbe1699662cc.jpg)

Figure 9. Delete Installed Certificate

<table><tr><td>7</td><td>Error handling</td><td>n/a</td></tr><tr><td>8</td><td>Remark(s)</td><td>For installing the Charge Point Certificate, see use cases A02 - Update Charge Point Certificate by request of Central System and A03 - Update Charge Point Certificate initiated by the Charge Point.
It is possible to delete the last (every) installed CentralSystemRootCertificates, when all CentralSystemRootCertificates are deleted, the Charge Point cannot validate Central System Certificates, so it will not be able to connect to a Central System.
Before a Central System would ever send a DeleteCertificate.req that would delete the last/all CentralSystemRootCertificates the Central System is ADVICED to make very sure that this is what is really wanted.
It is possible to delete the last (every) installed ManufacturerRootCertificates, when all ManufacturerRootCertificates are deleted, no &quot;Signed Firmware&quot; can be installed in the Charge Point.</td></tr></table>

# M04 - Delete a specific certificate from a Charge Point - Requirements

Table 27. M04 - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>M04.FR.01</td><td>After receiving a DeleteCertificate.req</td><td>The Charge Point SHALL respond with a DeleteCertificate.conf.</td></tr><tr><td>M04.FR.02</td><td>M04.FR.01 AND The requested certificate was found</td><td>The Charge Point SHALL delete it, and indicate success by setting 'status' to 'Success' in the DeleteCertificate.conf.</td></tr><tr><td>M04.FR.03</td><td>M04.FR.01 AND The deletion fails</td><td>The Charge Point SHALL indicate failure by setting 'status' to 'Failed' in the DeleteCertificate.conf.</td></tr><tr><td>M04.FR.04</td><td>M04.FR.01 AND The requested certificate was not found</td><td>The Charge Point SHALL indicate failure by setting 'status' to 'NotFound' in the DeleteCertificate.conf.</td></tr><tr><td>M04.FR.05</td><td></td><td>Deletion of the Charge Point Certificate SHALL NOT be possible via a DeleteCertificate.req.</td></tr><tr><td>M04.FR.06</td><td>M04.FR.01 AND Certificate to delete is a CentralSystemRootCertificate AND This CentralSystemRootCertificate is currently in use for validation of the connection the the Central System</td><td>The Charge Point SHALL reject the request by setting 'status' to 'Failed' in the DeleteCertificate.conf.</td></tr><tr><td>M04.FR.07</td><td>When deleting a certificate</td><td>The Central System SHALL use the hashAlgorithm, which was used to install the certificate.</td></tr></table>

# M05 - Install CA certificate in a Charge Point

Table 28. M05 - Install CA certificate in a Charge Point

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Install CA certificate in a Charge Point</td></tr><tr><td>2</td><td>ID</td><td>M05 (OCPP 2.0.1)</td></tr><tr><td>3</td><td>Objective(s)</td><td>To facilitate the management of the Charge Point&#x27;s installed certificates, a method to install a new CA certificate.</td></tr><tr><td>4</td><td>Description</td><td>The Central System requests the Charge Point to install a new Central System root certificate or Manufacturer root certificate.</td></tr><tr><td></td><td>Actors</td><td>Charge Point, Central System</td></tr><tr><td></td><td>Scenario description</td><td>1. The Central System requests the Charge Point to install a new certificate by sending an InstallCertificate.req.
2. The Charge Point responds with an InstallCertificate.conf.</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>n/a</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>The new certificate was installed in the Charge Point trust store.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/0f930d2d6592d6aa7533e821b4461308a5330b4b4a6843296b7fccf16b5f1c17.jpg)  
Figure 10. Install CA certificate in a Charge Point

<table><tr><td>7</td><td>Error handling</td><td>n/a</td></tr><tr><td>8</td><td>Remark(s)</td><td>Even though the messages CertificateSigned.req (see use cases A02 - Update Charge Point Certificate by request of Central System and A03 - Update Charge Point Certificate initiated by the Charge Point) and InstallCertificate.req (use case M05) are both used to send certificates, their purposes are different. CertificateSigned.req is used to return the the Charge Points own public certificate signed by a Certificate Authority. InstallCertificate.req is used to install Root certificates.For installing the Charge Point Certificate, see use cases A02 - Update Charge Point Certificate by request of Central System and A03 - Update Charge Point Certificate initiated by the Charge Point.It is allowed to have multiple certificates of the same type installed.</td></tr></table>

# M05 - Install CA certificate in a Charge Point - Requirements

Table 29. M05 - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td></tr><tr><td>M05.FR.01</td><td>After receiving an InstallCertificate.req</td><td>The Charge Point SHALL attempt to install the certificate and respond with an InstallCertificate.conf.</td></tr><tr><td>M05.FR.02</td><td>M05.FR.01 AND The installation was successful</td><td>The Charge Point SHALL indicate success by setting 'status' to 'Accepted' in the InstallCertificate.conf.</td></tr><tr><td>M05.FR.03</td><td>M05.FR.01 AND Current amount of install certificates &gt;= CertificateStoreMaxLength</td><td>The Charge Point SHALL indicate failure (no more space to install more certificates) by setting 'status' to 'Rejected' in the InstallCertificate.conf</td></tr><tr><td>M05.FR.04</td><td>M05.FR.01 AND The installation failed</td><td>The Charge Point SHALL indicate failure by setting 'status' to 'Failed' in the InstallCertificate.conf.</td></tr><tr><td>M05.FR.06</td><td>M05.FR.01 AND The certificate is invalid and/or incorrect.</td><td>The Charge Point SHALL indicate rejection by setting 'status' to 'Rejected' in the InstallCertificate.conf.</td></tr><tr><td>M05.FR.08</td><td>When AdditionalRootCertificateCheck is true</td><td>Only one certificate (plus a temporarily fallback certificate) of certificateType CentralSystemRootCertificate is allowed to be installed at a time.</td></tr><tr><td>M05.FR.09</td><td>When AdditionalRootCertificateCheck is true AND installing a new certificate of certificateType CentralSystemRootCertificate</td><td>The new Central System Root certificate SHALL replace the old Central System Root certificate AND the new Root Certificate MUST be signed by the old Root Certificate it is replacing</td></tr><tr><td>M05.FR.10</td><td>M05.FR.09 AND the new Central System Root certificate is NOT signed by the old Central System Root certificate</td><td>The Charge Point SHALL NOT install the new Central System Root Certificate and respond with status Rejected.</td></tr><tr><td>M05.FR.11</td><td>M05.FR.09 AND the new Central System Root certificate is signed by the old Central System Root certificate</td><td>The Charge Point SHALL install the new Central System Root Certificate AND temporarily keep the old Central System Root certificate as a fallback certificate AND respond with status Accepted</td></tr><tr><td>M05.FR.12</td><td>M05.FR.11 AND the Charge Point successfully connected to the Central System using the new Central System Root certificate</td><td>The Charge Point SHALL remove the old Central System Root (fallback) certificate.</td></tr><tr><td>M05.FR.13</td><td>M05.FR.11 AND The Charge Point is attempting to reconnect to the Central System, but determines that the server certificate provided by the Central System is invalid when using the new Central System Root certificate to verify it</td><td>The Charge Point SHALL try to use the old Central System Root ( fallback) certificate to verify the server certificate.</td></tr></table>

# 3. Security events/logging

# A04 - Security Event Notification

Table 30. A04 - Security Event Notification

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Security Event Notification</td></tr><tr><td>2</td><td>ID</td><td>A04 (OCPP 2.0.1)</td></tr><tr><td>3</td><td>Objective(s)</td><td>To inform the Central System of critical security events.</td></tr><tr><td>4</td><td>Description</td><td>This use case allows the Charge Point to immediately inform the Central System of changes in the system security.</td></tr><tr><td></td><td>Actors</td><td>Central System, Charge Point</td></tr><tr><td></td><td>Scenario description</td><td>1. A critical security event happens.
2. The Charge Point sends a SecurityEventNotification.req to the Central System.
3. The Central System responds with SecurityEventNotification.conf to the Charge Point.</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>n/a</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>The Charge Point successfully informed the Central System of critical security events by sending a SecurityEventNotification.req to the Central System.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/b8e23ff46e8516da2afabea05df444c87373b57ba80c17852c20189f9d4b4b8f.jpg)  
Figure 11. Security Event Notification

<table><tr><td>7</td><td>Error handling</td><td>n/a</td></tr><tr><td>8</td><td>Remark(s)</td><td>A list of security related events and their 'criticality' is provided at Security Events</td></tr></table>

# A04 - Security Event Notification - Requirements

Table 31. A04 - Security Event Notification - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td><td>NOTE</td></tr><tr><td>A04.FR.01</td><td>When a critical security event happens</td><td>The Charge Point SHALL inform the Central System of the security events by sending a SecurityEventNotification.req, to the Central System.</td><td></td></tr><tr><td>A04.FR.02</td><td>A04.FR.01 AND the Charge Point is disconnected.</td><td>Security event notifications MUST be queued with a guaranteed delivery at the Central System.</td><td></td></tr><tr><td>A04.FR.03</td><td>A04.FR.01</td><td>The Central System SHALL confirm the receipt of the notification using the SecurityEventNotification.conf message.</td><td></td></tr><tr><td>A04.FR.04</td><td>When a security event happens (also none-critical)</td><td>The Charge Point SHALL store the security event in a security log.</td><td>It is recommended to implement this in a rolling format.</td></tr></table>

# N01 - Retrieve Log Information

Table 32. N01 - Retrieve Log Information

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Retrieve Log</td></tr><tr><td>2</td><td>ID</td><td>N01 (OCPP 2.0.1)</td></tr><tr><td>3</td><td>Objective(s)</td><td>To enable the Central System retrieving of log information from a Charge Point.</td></tr><tr><td>4</td><td>Description</td><td>This use case covers the functionality of getting log information from a Charge Point. The Central System can request a Charge Point to upload a file with log information to a given location (URL). The format of this log file is not prescribed. The Charge Point uploads a log file and gives information about the status of the upload by sending status notifications to the Central System.</td></tr><tr><td></td><td>Actors</td><td>Charge Point, Central System</td></tr><tr><td></td><td>Scenario description</td><td>1. The Central System sends a GetLog.req to the Charge Point.
2. The Charge Point responds with a GetLog.conf.
3. The Charge Point sends a LogStatusNotification.req with the status Uploading
4. The Central System responds with a LogStatusNotification.conf acknowledging the status update request.
5. Uploading of the diagnostics files.
6. The Charge Point sends LogStatusNotification.req with the status Uploaded.
7. The Central System responds with LogStatusNotification.conf, acknowledging the status update request.
8. The Charge Point returns to Idle status.</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>- Requested information (either DiagnosticsLog or SecurityLog) is available for upload.
- URL to upload file to is reachable and exists.</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>Successful postcondition:
Log file Successfully uploaded.
Failure postcondition:
Log file not Successfully uploaded and Failed.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/1f135bf201ee8dd57dff1e22c33bd7cbe8707690e9c3efe1068945bd59b37d9e.jpg)  
Figure 12. Sequence Diagram: Get Security Log

<table><tr><td>7</td><td>Error handling</td><td>When the upload fails, and the transfer protocol supports "resume", it is recommended that the Charge Point tries "resume" before aborting the upload.</td></tr><tr><td>8</td><td>Remark(s)</td><td>When a Charge Point is requested to upload a log file, the Central System supplies in the request an URL where the Charge Point SHALL upload the file. The URL also contains the protocol which must be used to upload the file.
It is recommended that the log file is uploaded via FTP or FTPS. FTP(S) is better optimized for large binary data than HTTP. Also FTP(S) has the ability to resume uploads. In case an upload is interrupted, the Charge Point can resume uploading after the part it already has uploaded. The FTP URL is of format: ftp://User:password@host:port /path in which the parts User:password@, :password or :port may be excluded.
The Charge Point has an optional Configuration Key that reports which file transfer protocols it supports:
SupportedFileTransferProtocols.
The format of the log file is not prescribed.
FTP needs to be able to use Passive FTP, to be able to transverse over as much different typologies as possible.</td></tr></table>

# N01 - Retrieve Log Information - Requirements

Table 33. N01 - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td><td>NOTE</td></tr><tr><td>N01.FR.01</td><td>Upon receipt of a GetLog.req AND if the requested log information is available</td><td>The Charge Point SHALL respond with a GetLog.conf stating the name of the file and status Accepted.</td><td></td></tr><tr><td>N01.FR.02</td><td>N01.FR.01</td><td>The Charge Point SHALL start uploading a single log file to the specified location</td><td></td></tr><tr><td>N01.FR.03</td><td>N01.FR.02 AND The GetLog.req contained/logType SecurityLog</td><td>The Charge Point SHALL upload its security log</td><td></td></tr><tr><td>N01.FR.04</td><td>N01.FR.02 AND The GetLog.req contained/logType DiagnosticsLog</td><td>The Charge Point SHALL upload its diagnostics.</td><td></td></tr><tr><td>N01.FR.05</td><td>When a security event happens</td><td>The Charge Point SHALL log this event in its security log. See Section 8. Security Events for a list of security events.</td><td></td></tr><tr><td>N01.FR.07</td><td></td><td>Every LogStatusNotification.req that is sent for the upload of a specific log SHALL contain the same requestid as the GetLog.req that started this log upload.</td><td></td></tr><tr><td>N01.FR.08</td><td>When uploading a log document is started</td><td>The Charge Point SHALL send a LogStatusNotification.req with status Uploading.</td><td></td></tr><tr><td>N01.FR.09</td><td>When a log document is uploaded successfully</td><td>The Charge Point SHALL send a LogStatusNotification.req with status Uploaded.</td><td></td></tr><tr><td>N01.FR.10</td><td>When uploading a log document failed</td><td>The Charge Point SHALL send a LogStatusNotification.req with status UploadFailed, BadMessage, PermissionDenied OR NotSupportedOperation.</td><td>It is RECOMMENDED to send a status that describes the reason of failure as precise as possible.</td></tr><tr><td>N01.FR.11</td><td>When a Charge Point is uploading a log file AND the Charge Point receives a new GetLog.req</td><td>The Charge Point SHOULD cancel the ongoing log file upload AND respond with status AcceptedCanceled.</td><td></td></tr><tr><td>N01.FR.12</td><td></td><td>The field requestId in LogStatusNotification.req is mandatory, unless the message was triggered by an ExtendedTriggerMessage.req AND there is no log upload ongoing.</td><td></td></tr></table>

# 4. Secure firmware update

# L01 - Secure Firmware Update

Table 34. L01 - Secure Firmware Update

<table><tr><td>NO.</td><td>TYPE</td><td>DESCRIPTION</td></tr><tr><td>1</td><td>Name</td><td>Secure Firmware Update</td></tr><tr><td>2</td><td>ID</td><td>L01</td></tr><tr><td>3</td><td>Objective(s)</td><td>Download and install a Secure firmware update.</td></tr><tr><td>4</td><td>Description</td><td>Illustrate how a Charge Point processes a Secure firmware update.</td></tr><tr><td></td><td>Actors</td><td>Central System, Charge Point</td></tr><tr><td></td><td>Scenario description</td><td>1. The Central System sends a SignedUpdateFirmware.req message that contains the location of the firmware, the time after which it should be retrieved, and information on how many times the Charge Point should retry downloading the firmware.
2. The Charge Point verifies the validity of the certificate against the Manufacturer root certificate.
3. If the certificate is not valid or could not be verified, the Charge Point aborts the firmware update process and sends a SignedUpdateFirmware.conf with status InvalidCertificate (or status RevokedCertificate when the certificate has been revoked) and a SecurityEventNotification.req with the security event InvalidFirmwareSigningCertificate.
If the certificate is valid, the Charge Point starts downloading the firmware, and sends a SignedFirmwareStatusNotification.req with status Downloading.
4. If the Firmware successfully downloaded, the Charge Point sends a SignedFirmwareStatusNotification.req with status Downloaded.
Otherwise, it sends a SignedFirmwareStatusNotification.req with status DownloadFailed.
5. If the verification is successful, the Charge Point sends a SignedFirmwareStatusNotification.req with status Installing.
If the verification of the firmware fails or if a signature is missing entirely, the Charge Point sends a SignedFirmwareStatusNotification.req with status InvalidSignature and a SecurityEventNotification.req with the security event InvalidFirmwareSignature.
6. If the installation is successful, the Charge Point sends a SignedFirmwareStatusNotification.req with status Installed.
Otherwise, it sends a SignedFirmwareStatusNotification.req with status InstallationFailed.</td></tr><tr><td>5</td><td>Prerequisite(s)</td><td>The Charge Point Manufacturer provided a firmware update, signing certificate and signature.</td></tr><tr><td>6</td><td>Postcondition(s)</td><td>Successful postcondition:
The firmware is updated and the Charge Point is in Installed status.
Failure postconditions:
The certificate is not valid or could not be verified and the Charge Point is in InvalidCertificate status.
Downloading the firmware failed and the Charge Point is in DownloadFailed status.
The verification of the firmware&#x27;s digital signature failed and the Charge Point is in InvalidSignature status.
The installation of the firmware is not successful and the Charge Point is in InstallationFailed status.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/3786da9b91f2febca7bcb96a83a0f9b85c2b2fdaee3ca08ce997ac38595f2802.jpg)  
Figure 13. Sequence diagram secure firmware upgrade (happy flow)

<table><tr><td>7</td><td>Error handling</td><td>n/a</td></tr><tr><td rowspan="5">8</td><td rowspan="5">Remark(s)</td><td>Measures SHOULD be taken to secure the firmware when it is stored on a server or workstation.</td></tr><tr><td>The Charge Point has a required Configuration Key that reports which file transfer protocols it supports: 
SupportedFileTransferProtocols</td></tr><tr><td>The requirements for the Firmware Signing Certificate are described in the: Certificate Properties section.</td></tr><tr><td>The manufacturer SHALL NOT use intermediate certificates for the firmware signing certificate in the Charge Point.</td></tr><tr><td>FTP needs to be able to use Passive FTP, to be able to transverse over as much different typologies as possible.</td></tr></table>

![](https://cdn-mineru.openxlab.org.cn/result/2025-11-07/82dedffe-7ba7-4207-9a46-9f761107dabb/2979bfc518f40617061ef0fc1a0751b4414f0f2a527eafd7cfdd254c74d55a86.jpg)  
Figure 14. Firmware update process

# L01 - Secure Firmware Update - Requirements

Table 35. L01 - Requirements

<table><tr><td>ID</td><td>PRECONDITION</td><td>REQUIREMENT DEFINITION</td><td>NOTE</td></tr><tr><td>L01.FR.01</td><td>Whenever the Charge Point enters a new state in the firmware update process.</td><td>The Charge Point SHALL send a Signed FirmwareStatusNotification.req message to the Central System with this new status. What reason to use is described in the description of FirmwareStatusEnumType.</td><td></td></tr><tr><td>L01.FR.02</td><td>When the Charge Point enters the Invalid Certificate state in the firmware process.</td><td>The Charge Point SHALL send a SecurityEventNotification.req message to the Central System with the security event InvalidFirmwareSigningCertificate.</td><td></td></tr><tr><td>L01.FR.03</td><td>When the Charge Point enters the Invalid Signature state.</td><td>The Charge Point SHALL send a SecurityEventNotification.req message to the Central System with the security event InvalidFirmwareSignature.</td><td></td></tr><tr><td>L01.FR.04</td><td>When the Charge Point has successfully downloaded the new firmware</td><td>The signature SHALL be validated, by calculating the signature over the entire firmware file using the RSA-PSS or ECSchnorr algorithm for signing, and the SHA256 algorithm for calculating hash values.</td><td></td></tr><tr><td>L01.FR.05</td><td>L01.FR.04 AND installDateTime is not set</td><td>The Charge Point SHALL install the new firmware as soon as it is able to.</td><td></td></tr><tr><td>L01.FR.06</td><td>L01.FR.05 AND The Charge Point has ongoing transactions AND When it is not possible to continue charging during installation of firmware</td><td>The Charge Point SHALL wait until all transactions have ended, before commencing installation.</td><td></td></tr><tr><td>L01.FR.07</td><td>L01.FR.06</td><td>The Charge Point SHALL set all connectors that are not in use to UNAVAILABLE while the Charge Point waits for the ongoing transactions to end. Until the firmware is installed, any connector that becomes available SHALL be set to UNAVAILABLE.</td><td></td></tr><tr><td>L01.FR.08</td><td></td><td>It is RECOMMENDED that the firmware is sent encrypted to the Charge Point. This can either be done by using a secure protocol (such as HTTPS, SFTP, or FTPS) to send the firmware, or by encrypting the firmware itself before sending it.</td><td></td></tr><tr><td>L01.FR.09</td><td></td><td>Firmware updates SHALL be digitally protected to ensure authenticity and to provide proof of origin.</td><td>This protection is achieved by applying a digital signature over the hash value of the firmware image. Ideally, this signature is already computed by the manufacturer. This way proof of origin of the firmware image can be tracked back to the original author of the firmware.</td></tr><tr><td>L01.FR.10</td><td></td><td>Every Signed FirmwareStatusNotification.req that is sent for a specific firmware update SHALL contain the same requestid as the SignedUpdateFirmware.req that started this firmware update.</td><td></td></tr><tr><td>L01.FR.11</td><td></td><td>For security purposes the Central System SHALL include the Firmware Signing certificate (see Keys used in OCPP) in the SignedUpdateFirmware.req.</td><td></td></tr><tr><td>L01.FR.12</td><td></td><td>For verifying the certificate (see Certificate Hierarchy) use the rules for X.509 certificates [9]. The Charge Point MUST verify the file's digital signature using the Firmware Signing certificate.</td><td></td></tr><tr><td>L01.FR.13</td><td>When the Charge Point enters the Download Scheduled state.</td><td>The Charge Point SHALL send a SignedFirmwareStatusNotification.req with status DownloadScheduled.</td><td>For example when it is busy with installing another firmware or it is busy Charging.</td></tr><tr><td>L01.FR.14</td><td>When the Charge Point enters the Download Paused state.</td><td>The Charge Point SHALL send a SignedFirmwareStatusNotification.req with status DownloadPaused.</td><td>For example when the Charge Point has tasks with higher priorities.</td></tr><tr><td>L01.FR.15</td><td>When a Charge Point needs to reboot before installing the downloaded firmware.</td><td>The Charge Point SHALL send a SignedFirmwareStatusNotification.req with status InstallRebooting, before rebooting.</td><td></td></tr><tr><td>L01.FR.16</td><td>L01.FR.04 AND When installDateTime is set to a future date-time</td><td>The Charge Point SHALL send a SignedFirmwareStatusNotification.req with status InstallScheduled and install the firmware at the specified installation time.</td><td></td></tr><tr><td>L01.FR.17</td><td>L01.FR.16 AND current DateTime &gt;= InstallDateTime</td><td>The Charge Point SHALL install the new firmware as soon as it is able to.</td><td></td></tr><tr><td>L01.FR.18</td><td>L01.FR.17 AND The Charge Point has ongoing transactions AND It is not possible to continue charging during installation of firmware</td><td>The Charge Point SHALL wait until all transactions have ended, before commencing installation.</td><td></td></tr><tr><td>L01.FR.19</td><td>L01.FR.18</td><td>The Charge Point SHALL set all connectors that are not in use to UNAVAILABLE while the Charge Point waits for the ongoing transactions to end. Until the firmware is installed, any connector that becomes available SHALL be set to UNAVAILABLE.</td><td></td></tr><tr><td>L01.FR.20</td><td>When the Charge Point receives a UpdateFirmware.req (the original OCPP 1.6 message)</td><td>The Charge Point SHALL respond with a WebSocket RPC CALLERROR NotSupported, and the Charge Point SHALL NOT start the Firmware Update process.</td><td></td></tr><tr><td>L01.FR.21</td><td></td><td>The field requestId in SignedFirmwareStatusNotification.req is mandatory, unless status = Idle.</td><td></td></tr><tr><td>L01.FR.22</td><td>When the Charge Point needs to reboot during a firmware update AND the bootloader is unable to send OCPP messages</td><td>The Charge Point MAY omit the SignedFirmwareStatusNotification.req (status=Installing) message.</td><td></td></tr><tr><td>L01.FR.23</td><td>When the Charge Point receives an SignedUpdateFirmware.req</td><td>The Charge Point SHALL validate the certificate before accepting the message.</td><td></td></tr><tr><td>L01.FR.24</td><td>L01.FR.23 AND the certificate is invalid</td><td>The Charge Point SHALL respond with SignedUpdateFirmware.conf (status=InvalidCertificate).</td><td></td></tr><tr><td>L01.FR.25</td><td>L01.FR.23 AND the certificate is revoked</td><td>The Charge Point SHALL respond with SignedUpdateFirmware.conf (status=RevokedCertificate).</td><td></td></tr><tr><td>L01.FR.26</td><td>When a Charge Point is installing new Firmware OR is going to install new Firmware, but has received an SignedUpdateFirmware.req command to install it at a later time AND the Charge Point receives a new SignedUpdateFirmware.req</td><td>The Charge Point SHOULD cancel the ongoing firmware update AND respond with status AcceptedCanceled.</td><td>The Charge Point SHOULD NOT first check if the new firmware file exists, this way the Central System will be able to cancel an ongoing firmware update without starting a new one.</td></tr><tr><td>L01.FR.27</td><td>L01.FR.26 AND the Charge Point is unable to cancel the installation</td><td>The Charge Point MAY respond with status Rejected.</td><td></td></tr><tr><td>L01.FR.28</td><td>Charge Point receives a ExtendedTriggerMessage.req for FirmwareStatusNotification AND last sent SignedFirmwareStatusNotification.req had status = Installed</td><td>Charge Point SHALL return a SignedFirmwareStatusNotification.req with status = Idle.</td><td></td></tr><tr><td>L01.FR.29</td><td>Charge Point receives a ExtendedTriggerMessage.req for FirmwareStatusNotification AND last sent SignedFirmwareStatusNotification.req had status &lt;&gt; Installed</td><td>Charge Point SHALL return a SignedFirmwareStatusNotification.req with the last sent status.</td><td></td></tr></table>

# 5. Messages

To add the functionality needed for this WhitePaper, a couple of messages have been added from OCPP 2.0.1. Most have their original name from OCPP 2.0.1. Others have a modified name, because they have been modified between 1.6 and 2.0.1. The messages that have been renamed, are marked as such.

# 5.1. CertificateSigned.req

This contains the field definition of the CertificateSigned.req PDU sent by the Central System to the Charge Point.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>certificateChain</td><td>string[0..10000]</td><td>1..1</td><td>Required. The signed PEM encoded X.509 certificates. This can also contain the necessary sub CA certificates. The maximum size of this field is be limited by the configuration key: CertificateSignedMaxSize.</td></tr></table>

# 5.2. CertificateSigned.conf

This contains the field definition of the CertificateSigned.conf PDU sent by the Charge Point to the Central System in response to a CertificateSigned.req.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>status</td><td>CertificateSignedStatusEnumType</td><td>1..1</td><td>Required. Returns whether certificate signing has been accepted, otherwise rejected.</td></tr></table>

# 5.3. DeleteCertificate.req

Used by the Central System to request deletion of an installed certificate on a Charge Point.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>certificateHashData</td><td>CertificateHashDataT ype</td><td>1..1</td><td>Required. Indicates the certificate of which deletion is requested.</td></tr></table>

# 5.4. DeleteCertificate.conf

Response to a DeleteCertificate.req.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>status</td><td>DeleteCertificateStatusEnumType</td><td>1..1</td><td>Required. Charge Point indicates if it can process the request.</td></tr></table>

# 5.5. ExtendedTriggerMessage.req

This contains the field definition of the ExtendedTriggerMessage.req PDU sent by the Central System to the Charge Point.

This message is based on the OCPP 2.0.1 TriggerMessageRequest, it has been renamed to:

ExtendedTriggerMessage.req, because the original name conflicts with the TriggerMessage.req from OCPP 1.6.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>requestedMessage</td><td>MessageTriggerEnum Type</td><td>1..1</td><td>Required. Type of the message to be triggered.</td></tr><tr><td>connectorId</td><td>integer connectorId &gt; 0</td><td>0..1</td><td>Optional. Only filled in when request applies to a specific connector.</td></tr></table>

# 5.6. ExtendedTriggerMessage.conf

This contains the field definition of the ExtendedTriggerMessage.conf PDU sent by the Charge Point to the Central System in response to ExtendedTriggerMessage.req.

This message is based on the OCPP 2.0.1 TriggerMessageResponse, it has been renamed to:

ExtendedTriggerMessage.conf, because the original name conflicts with the TriggerMessage.conf from OCPP 1.6.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td rowspan="2">status</td><td>TriggerMessageStatus</td><td rowspan="2">1..1</td><td rowspan="2">Required. Indicates whether the Charge Point will send the requested notification or not.</td></tr><tr><td>EnumType</td></tr></table>

# 5.7. GetInstalledCertificates.req

Used by the Central System to request an overview of the installed certificates on a Charge Point.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>certificateType</td><td>CertificateUseEnumType</td><td>1..1</td><td>Required. Indicates the type of certificates requested.</td></tr></table>

# 5.8. GetInstalledCertificates.conf

Response to a GetInstalledCertificateIDs.req.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>status</td><td>GetInstalledCertificatesStatusEnumType</td><td>1..1</td><td>Required. Charge Point indicates if it can process the request.</td></tr><tr><td>certificateHashData</td><td>CertificateDataType</td><td>0.*</td><td>Optional. The Charge Point includes the Certificate information for each available certificate.</td></tr></table>

# 5.9. GetLog.req

This contains the field definition of the GetLog.req PDU sent by the Central System to the Charge Point.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>logType</td><td>LogEnumType</td><td>1..1</td><td>Required. This contains the type of log file that the Charge Point should send.</td></tr><tr><td>requestId</td><td>integer</td><td>1..1</td><td>Required. The Id of this request</td></tr><tr><td>retries</td><td>integer</td><td>0..1</td><td>Optional. This specifies how many times the Charge Point must try to upload the log before giving up. If this field is not present, it is left to Charge Point to decide how many times it wants to retry.</td></tr><tr><td>retryInterval</td><td>integer</td><td>0..1</td><td>Optional. The interval in seconds after which a retry may be attempted. If this field is not present, it is left to Charge Point to decide how long to wait between attempts.</td></tr><tr><td>log</td><td>LogParametersType</td><td>1..1</td><td>Required. This field specifies the requested log and the location to which the log should be sent.</td></tr></table>

# 5.10. GetLog.conf

This contains the field definition of the GetLog.conf PDU sent by the Charge Point to the Central System in response to a GetLog.req.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>status</td><td>LogStatusEnumType</td><td>1..1</td><td>Required. This field indicates whether the Charge Point was able to accept the request.</td></tr><tr><td>filename</td><td>string[0..255]</td><td>0..1</td><td>Optional. This contains the name of the log file that will be uploaded. This field is not present when no logging information is available.</td></tr></table>

# 5.11. InstallCertificate.req

Used by the Central System to request installation of a certificate on a Charge Point.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>certificateType</td><td>CertificateUseEnumType</td><td>1..1</td><td>Required. Indicates the certificate type that is sent.</td></tr><tr><td>certificate</td><td>string[0..5500]</td><td>1..1</td><td>Required. An PEM encoded X.509 certificate.</td></tr></table>

# 5.12. InstallCertificate.conf

The response to a InstallCertificate.req, sent by the Charge Point to the Central System.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>status</td><td>CertificateStatusEnu mType</td><td>1..1</td><td>Required. Charge Point indicates if installation was successful.</td></tr></table>

# 5.13. LogStatusNotification.req

This contains the field definition of the LogStatusNotification.req PDU sent by the Charge Point to the Central System.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>status</td><td>UploadLogStatusEnu mType</td><td>1..1</td><td>Required. This contains the status of the log upload.</td></tr><tr><td>requestId</td><td>integer</td><td>0..1</td><td>Optional. The request id that was provided in the GetLog.req that started this log upload.</td></tr></table>

# 5.14. LogStatusNotification.conf

This contains the field definition of the LogStatusNotification.conf PDU sent by the Central System to the Charge Point in response to LogStatusNotification.req.

No fields are defined.

# 5.15. SecurityEventNotification.req

Sent by the Charge Point to the Central System in case of a security event.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>type</td><td>string[50]</td><td>1..1</td><td>Required. Type of the security event (See list of currently known security events)</td></tr><tr><td>timestamp</td><td>dateTime</td><td>1..1</td><td>Required. Date and time at which the event occurred.</td></tr><tr><td>techInfo</td><td>string[0..255]</td><td>0..1</td><td>Additional information about the occurred security event.</td></tr></table>

# 5.16. SecurityEventNotification.conf

Sent by the Central System to the Charge Point to confirm the receipt of a SecurityEventNotification.req message.

No fields are defined.

# 5.17. SignCertificate.req

Sent by the Charge Point to the Central System to request that the Certificate Authority signs the public key into a certificate.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>csr</td><td>string[0..5500]</td><td>1..1</td><td>Required. The Charge Point SHALL send the public key in form of a Certificate Signing Request (CSR) as described in RFC 2986 [14] and then PEM encoded, using the SignCertificate.req message.</td></tr></table>

# 5.18. SignCertificate.conf

Sent by the Central System to the Charge Point in response to the SignCertificate.req message.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>status</td><td>GenericStatusEnumType</td><td>1..1</td><td>Required. Specifies whether the Central System can process the request.</td></tr></table>

# 5.19. Signed FirmwareStatusNotification.req

This contains the field definition of the Signed FirmwareStatusNotification.req PDU sent by the Charge Point to the Central System.

This is the OCPP 2.0.1 FirmwareStatusNotificationRequest, it has been renamed to SignedFirmwareStatusNotification.req, because the original name conflicts with the FirmwareStatusNotification.req from OCPP 1.6.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>status</td><td>FirmwareStatusEnum Type</td><td>1..1</td><td>Required. This contains the progress status of the firmware installation.</td></tr><tr><td>requestId</td><td>integer</td><td>0..1</td><td>Optional. The request id that was provided in the SignedUpdateFirmware.req that started this firmware update. This field is mandatory, unless the message was triggered by a TriggerMessage.req or the ExtendedTriggerMessage.req AND there is no firmware update ongoing.</td></tr></table>

# 5.20. Signed FirmwareStatusNotification.conf

This contains the field definition of the Signed FirmwareStatusNotification.conf PDU sent by the Central System to the Charge Point in response to a Signed FirmwareStatusNotification.req.

This is the OCPP 2.0.1 FirmwareStatusNotificationResponse, it is renamed to:  
SignedFirmwareStatusNotification.conf, because the original name conflicts with the FirmwareStatusNotification.conf from OCPP 1.6.

No fields are defined.

# 5.21. SignedUpdateFirmware.req

This contains the field definition of the SignedUpdateFirmware.req PDU sent by the Central System to the Charge Point.

This is the OCPP 2.0.1 UpdateFirmwareRequest, it is renamed to SignedUpdateFirmware.req, it is renamed because the original name conflicts with the UpdateFirmware.req from OCPP 1.6.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>retries</td><td>integer</td><td>0..1</td><td>Optional. This specifies how many times Charge Point must try to download the firmware before giving up. If this field is not present, it is left to Charge Point to decide how many times it wants to retry.</td></tr><tr><td>retrypInterval</td><td>integer</td><td>0..1</td><td>Optional. The interval in seconds after which a retry may be attempted. If this field is not present, it is left to Charge Point to decide how long to wait between attempts.</td></tr><tr><td>requestId</td><td>integer</td><td>1..1</td><td>Required. The Id of this request</td></tr><tr><td>firmware</td><td>FirmwareType</td><td>1..1</td><td>Required. Specifies the firmware to be updated on the Charge Point.</td></tr></table>

# 5.22. SignedUpdateFirmware.conf

This contains the field definition of the SignedUpdateFirmware.conf PDU sent by the Charge Point to the Central System in response to an SignedUpdateFirmware.req.

This is the OCPP 2.0.1 UpdateFirmwareResponse, it is renamed to SignedUpdateFirmware.conf, it is renamed because the original name conflicts with the UpdateFirmware.req from OCPP 1.6.

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>status</td><td>UpdateFirmwareStatusEnumType</td><td>1..1</td><td>Required. This field indicates whether the Charge Point was able to accept the request.</td></tr></table>

# 6. Datatypes

# 6.1. CertificateDataType

Class

CertificateHashDataType is used by: DeleteCertificate.req, GetInstalledCertificatesIds.conf

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>hashAlgorithm</td><td>HashAlgorithmEnumType</td><td>1..1</td><td>Required. Used algorithms for the hashes provided.</td></tr><tr><td>issuerNameHash</td><td>CiString128Type</td><td>1..1</td><td>Required. The hash of the issuer's distinguished name (DN), that must be calculated over the DER encoding of the issuer's name field in the certificate being checked. The hash is represented in hexbinary format (i.e. each byte is represented by 2 hexadecimal digits).Please refer to the OCSP specification: RFC6960 [15].</td></tr><tr><td>issuerKeyHash</td><td>CiString128Type</td><td>1..1</td><td>Required. The hash of the DER encoded public key: the value (excluding tag and length) of the subject public key field in the issuer's certificate. The hash is represented in hexbinary format (i.e. each byte is represented by 2 hexadecimal digits). Please refer to the OCSP specification: RFC6960 [15].</td></tr><tr><td>serialNumber</td><td>CiString40Type</td><td>1..1</td><td>Required. The serial number as a hexadecimal string without leading zeroes (and without the prefix 0x). For example: the serial number with decimal value 4095 will be represented as "FFF". Please note: The serial number of a certificate is a non-negative integer of at most 20 bytes. Since this is too large to be handled as a number in many system, it is represented as a string that contains the hexadecimal representation of this number. The string shall not have any leading zeroes.</td></tr></table>

# 6.2. CertificateSignedStatusEnumType

Enumeration

CertificateSignedStatusEnumType is used by: CertificateSigned.conf

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>Accepted</td><td>Signed certificate is valid.</td></tr><tr><td>Rejected</td><td>Signed certificate is invalid.</td></tr></table>

# 6.3. CertificateStatusEnumType

Enumeration

Status of the certificate.

CertificateStatusEnumType is used by: InstallCertificate.conf

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>Accepted</td><td>The installation of the certificate succeeded.</td></tr><tr><td>Failed</td><td>The certificate is valid and correct, but there is another reason the installation did not succeed.</td></tr><tr><td>Rejected</td><td>The certificate is invalid and/or incorrect OR the CPO tries to install more certificates than allowed.</td></tr></table>

# 6.4. CertificateUseEnumType

Enumeration

CertificateUseEnumType is used by: GetInstalledCertificates.req, InstallCertificate.req

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>CentralSystemRootCertificate</td><td>Root certificate, used by the CA to sign the Central System and Charge Point certificate.</td></tr><tr><td>ManufacturerRootCertificate</td><td>Root certificate for verification of the Manufacturer certificate.</td></tr></table>

# 6.5. CiString40Type

Type

Generic case insensitive string of 40 characters.

<table><tr><td>FIELD TYPE</td><td>DESCRIPTION</td></tr><tr><td>CiString[40]</td><td>String is case insensitive.</td></tr></table>

# 6.6. CiString128Type

Type

Generic case insensitive string of 128 characters.

<table><tr><td>FIELD TYPE</td><td>DESCRIPTION</td></tr><tr><td>CiString[128]</td><td>String is case insensitive.</td></tr></table>

# 6.7. DeleteCertificateStatusEnumType

Enumeration

DeleteCertificateStatusEnumType is used by: DeleteCertificate.conf

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>Accepted</td><td>Normal successful completion (no errors).</td></tr><tr><td>Failed</td><td>Processing failure.</td></tr><tr><td>NotFound</td><td>Requested resource not found.</td></tr></table>

# 6.8. FirmwareStatusEnumType

Enumeration

Status of a firmware download.

A value with "Intermediate state" in the description, is an intermediate state, update process is not finished.

A value with "Failure end state" in the description, is an end state, update process has stopped, update failed.

A value with "Successful end state" in the description, is an end state, update process has stopped, update successful.

FirmwareStatusEnumType is used by: SignedFirmwareStatusNotification.req

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>Downloaded</td><td>Intermediate state. New firmware has been downloaded by Charge Point.</td></tr><tr><td>DownloadFailed</td><td>Failure end state. Charge Point failed to download firmware.</td></tr><tr><td>Downloading</td><td>Intermediate state. Firmware is being downloaded.</td></tr><tr><td>DownloadScheduled</td><td>Intermediate state. Downloading of new firmware has been scheduled.</td></tr><tr><td>DownloadPaused</td><td>Intermediate state. Downloading has been paused.</td></tr><tr><td>Idle</td><td>Charge Point is not performing firmware update related tasks. Status Idle SHALL only be used as in a Signed Firmware Status Notification req that was triggered by Extended Trigger Message req.</td></tr><tr><td>InstallationFailed</td><td>Failure end state. Installation of new firmware has failed.</td></tr><tr><td>Installing</td><td>Intermediate state. Firmware is being installed.</td></tr><tr><td>Installed</td><td>Successful end state. New firmware has successfully been installed in Charge Point.</td></tr><tr><td>InstallRebooting</td><td>Intermediate state. Charge Point is about to reboot to activate new firmware. This status MAY be omitted if a reboot is an integral part of the installation and cannot be reported separately.</td></tr><tr><td>InstallScheduled</td><td>Intermediate state. Installation of the downloaded firmware is scheduled to take place on installDateTime given in SignedUpdateFirmware.req.</td></tr><tr><td>InstallVerificationFailed</td><td>Failure end state. Verification of the new firmware (e.g. using a checksum or some other means) has failed and installation will not proceed. (Final failure state)</td></tr><tr><td>InvalidSignature</td><td>Failure end state. The firmware signature is not valid.</td></tr><tr><td>SignatureVerified</td><td>Intermediate state. Provide signature successfully verified.</td></tr></table>

# 6.9. FirmwareType

Class

Represents a copy of the firmware that can be loaded/updated on the Charge Point.

FirmwareType is used by: SignedUpdateFirmware.req

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>location</td><td>string[0..512]</td><td>1..1</td><td>Required. URI defining the origin of the firmware.</td></tr><tr><td>retrieveDateTime</td><td>dateTime</td><td>1..1</td><td>Required. Date and time at which the firmware shall be retrieved.</td></tr><tr><td>installDateTime</td><td>dateTime</td><td>0..1</td><td>Optional. Date and time at which the firmware shall be installed.</td></tr><tr><td>signingCertificate</td><td>string[0..5500]</td><td>1..1</td><td>Required. Certificate with which the firmware was signed. PEM encoded X.509 certificate.</td></tr><tr><td>signature</td><td>string[0..800]</td><td>1..1</td><td>Required. Base64 encoded firmware signature.</td></tr></table>

# 6.10.Generic statusesTypeDef

Enumeration

Generic message response status

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>Accepted</td><td>Request has been accepted and will be executed.</td></tr><tr><td>Rejected</td><td>Request has not been accepted and will not be executed.</td></tr></table>

# 6.11. GetInstalledCertificateStatusEnumType

Enumeration

GetInstalledCertificateStatusEnumType is used by: GetInstalledCertificates.conf

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>Accepted</td><td>Normal successful completion (no errors).</td></tr><tr><td>NotFound</td><td>Requested certificate not found.</td></tr></table>

# 6.12. HashAlgorithmEnumType

Enumeration

HashAlgorithmEnumType is used by: CertificateHashDataType

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>SHA256</td><td>SHA-256 hash algorithm.</td></tr><tr><td>SHA384</td><td>SHA-384 hash algorithm.</td></tr><tr><td>SHA512</td><td>SHA-512 hash algorithm.</td></tr></table>

# 6.13. LogEnumType

Enumeration

LogEnumType is used by: GetLog.req

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>DiagnosticsLog</td><td>This contains the field definition of a diagnostics log file</td></tr><tr><td>SecurityLog</td><td>Sent by the Central System to the Charge Point to request that the Charge Point uploads the security log.</td></tr></table>

# 6.14. LogParametersType

Class

Class for detailed information the retrieval of logging entries.

LogParametersType is used by: GetLog.req

<table><tr><td>FIELD NAME</td><td>FIELD TYPE</td><td>CARD.</td><td>DESCRIPTION</td></tr><tr><td>remoteLocation</td><td>string[0..512]</td><td>1..1</td><td>Required. The URL of the location at the remote system where the log should be stored.</td></tr><tr><td>oldestTimestamp</td><td>dateTime</td><td>0..1</td><td>Optional. This contains the date and time of the oldest logging information to include in the diagnostics.</td></tr><tr><td>latestTimestamp</td><td>dateTime</td><td>0..1</td><td>Optional. This contains the date and time of the latest logging information to include in the diagnostics.</td></tr></table>

# 6.15. LogStatusEnumType

Enumeration

LogStatusEnumType is used by: GetLog.conf

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>Accepted</td><td>Accepted this log upload. This does not mean the log file is uploaded is successfully, the Charge Point will now start the log file upload.</td></tr><tr><td>Rejected</td><td>Log update request rejected.</td></tr><tr><td>AcceptedCanceled</td><td>Accepted this log upload, but in doing this has canceled an ongoing log file upload.</td></tr></table>

# 6.16. MessageTriggerEnumType

Enumeration

Type of request to be triggered by trigger messages.

MessageTriggerEnumType is used by: ExtendedTriggerMessage.req

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>BootNotification</td><td>To trigger BootNotification.req.</td></tr><tr><td>LogStatusNotifica tion</td><td>To trigger LogStatusNotification.req.</td></tr><tr><td>FirmwareStatusN otification</td><td>To trigger SignedFirmwareStatusNotification.req (So the status of the secure firmware update introduced in this document).</td></tr><tr><td>Heartbeat</td><td>To trigger Heartbeat.req.</td></tr><tr><td>MeterValues</td><td>To trigger MeterValues.req.</td></tr><tr><td>SignChargePointCertificate</td><td>To trigger a SignCertificate.req with certificateType: ChargePointCertificate.</td></tr><tr><td>StatusNotification</td><td>To trigger SatusNotification.req.</td></tr></table>

# 6.17. TriggerMessageStatusEnumType

Enumeration

TriggerMessageStatusEnumType is used by: ExtendedTriggerMessage.conf

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>Accepted</td><td>Requested message will be sent.</td></tr><tr><td>Rejected</td><td>Requested message will not be sent.</td></tr><tr><td>NotImplemented</td><td>Requested message cannot be sent because it is either not implemented or unknown.</td></tr></table>

# 6.18. UpdateFirmwareStatusEnumType

Enumeration

Update Firmware StatusEnumType is used by: SignedUpdateFirmware.conf

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>Accepted</td><td>Accepted this firmware update request. This does not mean the firmware update is successful, the Charge Point will now start the firmware update process.</td></tr><tr><td>Rejected</td><td>Firmware update request rejected.</td></tr><tr><td>AcceptedCanceled</td><td>Accepted this firmware update request, but in doing this has canceled an ongoing firmware update.</td></tr><tr><td>InvalidCertificate</td><td>The certificate is invalid.</td></tr><tr><td>RevokedCertificate</td><td>Failure end state. The Firmware Signing certificate has been revoked.</td></tr></table>

# 6.19. UploadLogStatusEnumType

Enumeration

UploadLogStatusEnumType is used by: LogStatusNotification.req

<table><tr><td>VALUE</td><td>DESCRIPTION</td></tr><tr><td>BadMessage</td><td>A badly formatted packet or other protocol incompatibility was detected.</td></tr><tr><td>Idle</td><td>The Charge Point is not uploading a log file. Idle SHALL only be used when the message was triggered by a ExtendedTriggerMessage.req.</td></tr><tr><td>NotSupportedOperation</td><td>The server does not support the operation</td></tr><tr><td>PermissionDenied</td><td>Insufficient permissions to perform the operation.</td></tr><tr><td>Uploaded</td><td>File has been uploaded successfully.</td></tr><tr><td>UploadFailure</td><td>Failed to upload the requested file.</td></tr><tr><td>Uploading</td><td>File is being uploaded.</td></tr></table>

# 7. Configuration Keys

7.1.AdditionalRootCertificateCheck

<table><tr><td>Required/optional</td><td>optional</td></tr><tr><td>Accessibility</td><td>R</td></tr><tr><td>Type</td><td>boolean</td></tr><tr><td>Description</td><td>When set to true, only one certificate (plus a temporarily fallback certificate) of certificateType CentralSystemRootCertificate is allowed to be installed at a time. When installing a new Central System Root certificate, the new certificate SHALL replace the old one AND the new Central System Root Certificate MUST be signed by the old Central System Root Certificate it is replacing. This configuration key is required unless only &quot;security profile 1 - Unsecured Transport with Basic Authentication&quot; is implemented. Please note that security profile 1 SHOULD only be used in trusted networks.
Note: When using this additional security mechanism please be aware that the Charge Point needs to perform a full certificate chain verification when the new Central System Root certificate is being installed. However, once the old Central System Root certificate is set as the fallback certificate, the Charge Point needs to perform a partial certificate chain verification when verifying the server certificate during the TLS handshake. Otherwise the verification will fail once the old Central System Root ( fallback) certificate is either expired or removed.</td></tr></table>

# 7.2. AuthorizationKey

<table><tr><td>Required/optional</td><td>optional</td></tr><tr><td>Accessibility</td><td>W</td></tr><tr><td>Type</td><td>String</td></tr><tr><td>Description</td><td>The basic authentication password is used for HTTP Basic Authentication, minimal length: 16 bytes.
It is strongly advised to be randomly generated binary to get maximal entropy. Hexadecimal represented (20 bytes maximum, represented as a string of up to 40 hexadecimal digits).
This configuration key is write-only, so that it cannot be accidentally stored in plaintext by the Central System when it reads out all configuration keys.
This configuration key is required unless only &quot;security profile 3 - TLS with client side certificates&quot; is implemented.</td></tr></table>

# 7.3. CertificateSignedMaxChainSize

<table><tr><td>Required/optional</td><td>optional</td></tr><tr><td>Accessibility</td><td>R</td></tr><tr><td>Type</td><td>integer</td></tr><tr><td>Description</td><td>This configuration key can be used to limit the size of the &#x27;certificateChain&#x27; field from the CertificateSigned.req PDU. The value of this configuration key has a maximum limit of 10.000 characters.</td></tr></table>

# 7.4. CertificateStoreMaxLength

<table><tr><td>Required/optional</td><td>optional</td></tr><tr><td>Accessibility</td><td>R</td></tr><tr><td>Type</td><td>integer</td></tr><tr><td>Description</td><td>Maximum number of Root/CA certificates that can be installed in the Charge Point.</td></tr></table>

# 7.5. CpoName

<table><tr><td>Required/optional</td><td>optional</td></tr><tr><td>Accessibility</td><td>RW</td></tr><tr><td>Type</td><td>String</td></tr><tr><td>Description</td><td>This configuration key contains CPO name (or an organization trusted by the CPO) as used in the Charge Point Certificate. This is the CPO name that is to be used in a CSR send via: SignCertificate.req</td></tr><tr><td colspan="2">7.6. SecurityProfile</td></tr><tr><td>Required/optional</td><td>optional</td></tr><tr><td>Accessibility</td><td>RW</td></tr><tr><td>Type</td><td>integer</td></tr><tr><td>Description</td><td>This configuration key is used to set the security profile used by the Charge Point.The value of this configuration key can only be increased to a higher level, not decreased to a lower level, if the Charge Point receives a lower value then currently configured,the Charge Point SHALL Rejected the ChangeConfiguration.reqBefore accepting the new value, the Charge Point SHALL check if all the prerequisites for the new Security Profile are met, if not, the Charge Point SHALL Rejected the ChangeConfiguration.req.After the security profile was successfully changed, the Charge Point disconnects from the Central System and SHALL reconnect using the new configured Security Profile.Default, when no security profile is yet configured: 0.</td></tr></table>

# 8. Security Events

The table below provides a list of security events. Security events that are critical should be pushed to the Central System.

<table><tr><td>SECURITY EVENT</td><td>DESCRIPTION</td><td>CRITICAL</td></tr><tr><td>FirmwareUpdated</td><td>The Charge Point firmware is updated</td><td>Yes</td></tr><tr><td>FailedToAuthenticationAtCentralSystem</td><td>The authentication credentials provided by the Charge Point were rejected by the Central System</td><td>No</td></tr><tr><td>CentralSystemFailedToAuthentication</td><td>The authentication credentials provided by the Central System were rejected by the Charge Point</td><td>No</td></tr><tr><td>SettingSystemTime</td><td>The system time on the Charge Point was changed</td><td>Yes</td></tr><tr><td>StartupOfTheDevice</td><td>The Charge Point has booted</td><td>Yes</td></tr><tr><td>ResetOrReboot</td><td>The Charge Point was rebooted or reset</td><td>Yes</td></tr><tr><td>SecurityLogWasCleared</td><td>The security log was cleared</td><td>Yes</td></tr><tr><td>ReconfigurationOfSecurityParameters</td><td>Security parameters, such as keys or the security profile used, were changed</td><td>No</td></tr><tr><td>MemoryExhaustion</td><td>The Flash or RAM memory of the Charge Point is getting full</td><td>Yes</td></tr><tr><td>InvalidMessages</td><td>The Charge Point has received messages that are not valid OCPP messages, if signed messages, signage invalid/incorrect</td><td>No</td></tr><tr><td>AttemptedReplayAttacks</td><td>The Charge Point has received a replayed message (other than the Central System trying to resend a message because it there was for example a network problem)</td><td>No</td></tr><tr><td>TamperDetectionActivated</td><td>The physical tamper detection sensor was triggered</td><td>Yes</td></tr><tr><td>InvalidFirmwareSignature</td><td>The firmware signature is not valid</td><td>No</td></tr><tr><td>InvalidFirmwareSigningCertificate</td><td>The certificate used to verify the firmware signature is not valid</td><td>No</td></tr><tr><td>InvalidCentralSystemCertificate</td><td>The certificate that the Central System uses was not valid or could not be verified</td><td>No</td></tr><tr><td>InvalidChargePointCertificate</td><td>The certificate sent to the Charge Point using the SignCertificate.conf message is not a valid certificate</td><td>No</td></tr><tr><td>InvalidTLSVersion</td><td>The TLS version used by the Central System is lower than 1.2 and is not allowed by the security specification</td><td>No</td></tr><tr><td>InvalidTLSCipherSuite</td><td>The Central System did only allow connections using TLS cipher suites that are not allowed by the security specification</td><td>No</td></tr></table>

# 9. Changelog Edition 2

<table><tr><td>SECTION / USE CASE</td><td>CHANGE</td></tr><tr><td>2.3. Unsecured Transport with Basic Authentication Profile</td><td>Basic auth example added to remarks.</td></tr><tr><td>2.4.1. TLS with Basic Authentication Profile</td><td>A00.FR.308 changed. "URL or IP address" changed to "FQDN".</td></tr><tr><td>2.4.1. TLS with Basic Authentication Profile</td><td>A00.FR.317 changed. Added a note.</td></tr><tr><td>2.5.1. TLS with Client Side Certificates Profile</td><td>A00.FR.405 changed. "unique identifier" changed to "unique serial number".</td></tr><tr><td>2.5.1. TLS with Client Side Certificates Profile</td><td>A00.FR.412 changed. "URL" changed to "FQDN".</td></tr><tr><td>2.5.1. TLS with Client Side Certificates Profile</td><td>A00.FR.429 added.</td></tr><tr><td>2.6.1. Certificate Properties</td><td>A00.FR.507 changed. Encoding changed from DER, followed by Base64 encoding to PEM.</td></tr><tr><td>2.6.1. Certificate Properties</td><td>A00.FR.510 changed. "full URL of the endpoint" changed to "FQDN".</td></tr><tr><td>2.6.2. Certificate Hierarchy</td><td>A00.FR.604, A00.FR.605 removed.</td></tr><tr><td>A02/A03</td><td>Prerequisite added. "The configuration variable CpoName MUST be set."</td></tr><tr><td>A02/A03</td><td>Error handling added.</td></tr><tr><td>A02/A03</td><td>A02.FR.03/A03.FR.03 changed. PEM encoding included.</td></tr><tr><td>A02/A03</td><td>A02.FR.04/A03.FR.04 changed. The dedicated authority server MAY be operated by the CPO.</td></tr><tr><td>A05</td><td>Error handling and requirements; A05.FR.08, A05.FR.09 added.</td></tr><tr><td>L01</td><td>Added requirements; L01.FR.21, L01.FR.22, L01.FR.23, L01.FR.24, L01.FR.25, L01.FR.26, L01.FR.27, L01.FR.28, L01.FR.29.</td></tr><tr><td>M04</td><td>M04.FR.07 added.</td></tr><tr><td>M05</td><td>M05.FR.05, M05.FR.06, M05.FR.07, M05.FR.08, M05.FR.09 added in v1.1.M05.FR.05, M05.FR.07 removed in v1.2M05.FR.08, M05.FR.09 changed in v1.2M05.FR.10, M05.FR.11, M05.FR.12, M05.FR.13 added in v1.2</td></tr><tr><td>N01</td><td>N01.FR.11, N01.FR.12 added.</td></tr><tr><td>5.1. CertificateSigned.req</td><td>Changes in 'cert' field. Field name changed from 'cert' to 'certificateChain'. Field type changed from string[0..5500] to string[0..10000]. Cardinality changed from 1..* to 1..1. Encoding changed from DER, then Hex encoded into a case insensitive string to PEM.</td></tr><tr><td>5.7. GetInstalledCertificateslds.req</td><td>'typeOfCertificate' field renamed to 'certificateType'.</td></tr><tr><td>5.11. InstallCertificate.req</td><td>' certificate' field encoding changed from DER, then Hex encoded into a case insensitive string to PEM.</td></tr><tr><td>5.17. SignCertificate.req</td><td>'csr' field encoding changed from DER to PEM.</td></tr><tr><td>5.13. LogStatusNotification.request</td><td>'requestId' field cardinality changed from 1..1 to 0..1</td></tr><tr><td>5.15. SecurityEventNotification.request</td><td>'techInfo' field added.</td></tr><tr><td>5.19. SignedFirmwareStatusNotification.request</td><td>'requestId' field cardinality changed from 1..1 to 0..1</td></tr><tr><td>6.1. CertificateHashDataType</td><td>'issuerKeyHash' field type changed from string[0..128] to identifierString[0..128].</td></tr><tr><td>6.1. CertificateHashDataType</td><td>'serialNumber' field type changed from string[0..20] to string[0..40].</td></tr><tr><td>6.6. FirmwareStatusEnumType</td><td>Enum values 'InvalidCertificate', 'RevokedCertificate', 'CertificateVerified' removed.</td></tr><tr><td>6.7. FirmwareType</td><td>'signingCertificate' field encoding changed from DER, then Hex encoded into a case insensitive string to PEM.</td></tr><tr><td>6.16. UpdateFirmwareStatusEnumType</td><td>Enum values 'InvalidCertificate', 'RevokedCertificate' added.</td></tr><tr><td>7. Configuration Keys</td><td>Configuration key 'CertificateSignedMaxChain' removed.</td></tr><tr><td>7. Configuration Keys</td><td>Configuration key 'CertificateSignedMaxChainSize' added.</td></tr><tr><td>7. Configuration Keys</td><td>Configuration key 'AdditionalRootCertificateCheck' added.</td></tr><tr><td>8. Security Events</td><td>'FailedToAuthenticationAtCentral System' changed to: 'FailedToAuthenticationAtCentralSystem' removed incorrect whitespace.</td></tr><tr><td>8. Security Events</td><td>'Central SystemFailedToAuthentication' changed to: 'CentralSystemFailedToAuthentication' removed incorrect whitespace.</td></tr></table>

# 10. Changelog Edition 3

<table><tr><td>SECTION / USE CASE</td><td>CHANGE</td></tr><tr><td>6.1. CertificateHashDataType</td><td>Updated descriptions of the fields of this type, clarifying that the contents of these fields must follow the OCSP specification. Corrected the type of the fields to CiStrings.</td></tr></table>
