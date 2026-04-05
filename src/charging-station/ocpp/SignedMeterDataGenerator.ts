import { createHash } from 'node:crypto'

export interface SignedMeterData {
  encodingMethod: string
  publicKey: string
  signedMeterData: string
  signingMethod: string
}

export interface SignedMeterDataParams {
  context: 'Sample.Clock' | 'Sample.Periodic' | 'Transaction.Begin' | 'Transaction.End'
  meterSerialNumber: string
  meterValue: number
  timestamp: Date
  transactionId: number | string
}

const SIGNING_METHOD = 'ECDSA-secp256r1-SHA256'
const ENCODING_METHOD = 'OCMF'

const contextToTxCode = (context: SignedMeterDataParams['context']): string => {
  switch (context) {
    case 'Transaction.Begin':
      return 'B'
    case 'Transaction.End':
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
  const meterValueKwh = (params.meterValue / 1000).toFixed(3)
  const txCode = contextToTxCode(params.context)

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

  const simulatedSignature = createHash('sha256').update(JSON.stringify(params)).digest('hex')

  const ocmfString = `OCMF|${JSON.stringify(ocmfPayload)}|{"SA":"${SIGNING_METHOD}","SD":"${simulatedSignature}"}`

  return {
    encodingMethod: ENCODING_METHOD,
    publicKey: publicKeyHex != null ? buildPublicKeyValue(publicKeyHex) : '',
    signedMeterData: Buffer.from(ocmfString).toString('base64'),
    signingMethod: SIGNING_METHOD,
  }
}
