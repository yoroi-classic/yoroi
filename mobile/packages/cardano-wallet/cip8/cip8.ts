import {init} from '@emurgo/cross-msl-mobile'
import {Buffer} from 'buffer'

const MSL = init('cip8')

export const makeCip8Key = async (publicSigningKey: Uint8Array) => {
  const key = MSL.COSEKey.new(MSL.Label.fromKeyType(MSL.KeyType.OKP))
  key.setAlgorithmId(MSL.Label.fromAlgorithmId(MSL.AlgorithmId.EdDSA))
  key.setHeader(
    MSL.Label.newInt(MSL.Int.newNegative(MSL.BigNum.fromStr('1'))),
    MSL.CBORValue.newInt(MSL.Int.newI32(6)),
  )
  key.setHeader(
    MSL.Label.newInt(MSL.Int.newNegative(MSL.BigNum.fromStr('2'))),
    MSL.CBORValue.newBytes(publicSigningKey),
  )

  return key
}

export const buildCoseSign1FromSignature = async (
  address: Buffer,
  signature: Buffer,
  payload: Buffer,
  publicKey?: Uint8Array,
) => {
  const protectedHeader = MSL.HeaderMap.new()
  protectedHeader.setAlgorithmId(
    MSL.Label.fromAlgorithmId(MSL.AlgorithmId.EdDSA),
  )
  // Label 4 contains the public key (required by CIP-8)
  if (publicKey) {
    protectedHeader.setHeader(
      MSL.Label.newInt(MSL.Int.newI32(4)),
      MSL.CBORValue.newBytes(publicKey),
    )
  }
  protectedHeader.setHeader(
    MSL.Label.newText('address'),
    MSL.CBORValue.newBytes(address),
  )
  const protectedSerialized = MSL.ProtectedHeaderMap.new(protectedHeader)
  const unprotected = MSL.HeaderMap.new()
  const headers = MSL.Headers.new(protectedSerialized, unprotected)
  const builder = MSL.COSESign1Builder.new(headers, payload, false)
  return builder.build(signature)
}

export const makeCip8DataToSign = (
  address: Buffer,
  payload: Buffer,
  publicKey: Uint8Array,
): Buffer => {
  const protectedHeader = MSL.HeaderMap.new()
  protectedHeader.setAlgorithmId(
    MSL.Label.fromAlgorithmId(MSL.AlgorithmId.EdDSA),
  )
  protectedHeader.setHeader(
    MSL.Label.newInt(MSL.Int.newI32(4)),
    MSL.CBORValue.newBytes(publicKey),
  )
  protectedHeader.setHeader(
    MSL.Label.newText('address'),
    MSL.CBORValue.newBytes(address),
  )
  const protectedSerialized = MSL.ProtectedHeaderMap.new(protectedHeader)
  const headers = MSL.Headers.new(protectedSerialized, MSL.HeaderMap.new())
  const builder = MSL.COSESign1Builder.new(headers, payload, false)
  return Buffer.from(builder.makeDataToSign().toBytes())
}
