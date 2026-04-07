import { hash } from 'node:crypto'

import {
  EncodingMethodEnumType,
  type JsonObject,
  MeterValueContext,
  MeterValueUnit,
  SigningMethodEnumType,
} from '../../types/index.js'
import { roundTo } from '../../utils/index.js'

export interface SignedMeterData extends JsonObject {
  encodingMethod: EncodingMethodEnumType
  publicKey: string
  signedMeterData: string
  signingMethod: '' | SigningMethodEnumType
}

export interface SignedMeterDataParams {
  context: MeterValueContext
  meterSerialNumber: string
  meterValue: number
  meterValueUnit?: MeterValueUnit
  timestamp: Date
  transactionId: number | string
}

const DEFAULT_SIGNING_METHOD = SigningMethodEnumType.ECDSA_secp256r1_SHA256
const DEFAULT_ENCODING_METHOD = EncodingMethodEnumType.OCMF

const contextToTxCode = (context: MeterValueContext): string => {
  switch (context) {
    case MeterValueContext.TRANSACTION_BEGIN:
      return 'B'
    case MeterValueContext.TRANSACTION_END:
      return 'E'
    default:
      return 'P'
  }
}

export const buildPublicKeyValue = (hexKey: string): string => {
  return Buffer.from(`oca:base16:asn1:${hexKey}`).toString('base64')
}

export const generateSignedMeterData = (
  params: SignedMeterDataParams,
  publicKeyHex?: string,
  signingMethod?: SigningMethodEnumType
): SignedMeterData => {
  const resolvedSigningMethod = signingMethod ?? DEFAULT_SIGNING_METHOD
  const txCode = contextToTxCode(params.context)
  const meterValueKwh =
    params.meterValueUnit === MeterValueUnit.KILO_WATT_HOUR
      ? roundTo(params.meterValue, 3)
      : roundTo(params.meterValue / 1000, 3)

  const ocmfPayload = {
    FV: '1.0',
    GI: 'SIMULATOR',
    GS: params.meterSerialNumber,
    GV: '1.0',
    PG: `T${String(params.transactionId)}`,
    RD: [
      {
        RI: '1-0:1.8.0',
        RT: 'AC',
        RU: 'kWh',
        RV: meterValueKwh,
        ST: 'G',
        TM: params.timestamp.toISOString(),
        TX: txCode,
      },
    ],
  }

  const simulatedSignature = hash('sha256', JSON.stringify(ocmfPayload), 'hex')

  // OCMF includes the signing algorithm in the SA field of signedMeterData.
  // Per OCA Application Note Table 11: "If it is already included in the
  // signedMeterData, then this SHALL be an empty string."
  const ocmfString = `OCMF|${JSON.stringify(ocmfPayload)}|{"SA":"${resolvedSigningMethod}","SD":"${simulatedSignature}"}`

  return {
    encodingMethod: DEFAULT_ENCODING_METHOD,
    publicKey: publicKeyHex != null ? buildPublicKeyValue(publicKeyHex) : '',
    signedMeterData: Buffer.from(ocmfString).toString('base64'),
    signingMethod: '',
  }
}
