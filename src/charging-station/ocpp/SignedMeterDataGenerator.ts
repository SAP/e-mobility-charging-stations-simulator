import { createHash } from 'node:crypto'

import { type JsonObject, MeterValueContext, MeterValueUnit } from '../../types/index.js'

export interface SignedMeterData extends JsonObject {
  encodingMethod: string
  publicKey: string
  signedMeterData: string
  signingMethod: string
}

export interface SignedMeterDataParams {
  context: MeterValueContext
  meterSerialNumber: string
  meterValue: number
  meterValueUnit?: MeterValueUnit
  timestamp: Date
  transactionId: number | string
}

const SIGNING_METHOD = 'ECDSA-secp256r1-SHA256'
const ENCODING_METHOD = 'OCMF'

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
  publicKeyHex?: string
): SignedMeterData => {
  const txCode = contextToTxCode(params.context)
  const meterValueKwh =
    params.meterValueUnit === MeterValueUnit.KILO_WATT_HOUR
      ? Number(params.meterValue.toFixed(3))
      : Number((params.meterValue / 1000).toFixed(3))

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

  const simulatedSignature = createHash('sha256').update(JSON.stringify(ocmfPayload)).digest('hex')

  const ocmfString = `OCMF|${JSON.stringify(ocmfPayload)}|{"SA":"${SIGNING_METHOD}","SD":"${simulatedSignature}"}`

  return {
    encodingMethod: ENCODING_METHOD,
    publicKey: publicKeyHex != null ? buildPublicKeyValue(publicKeyHex) : '',
    signedMeterData: Buffer.from(ocmfString).toString('base64'),
    signingMethod: SIGNING_METHOD,
  }
}
