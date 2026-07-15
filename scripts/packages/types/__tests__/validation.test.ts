const mockWarn = jest.fn()

jest.mock('@yoroi/logger', () => ({
  getLogger: () => ({warn: mockWarn}),
}))

import {
  addressToBase58,
  addressToBech32,
  addressToHex,
  addressToPayment,
  addressToStaking,
  asAddress,
  asAddressBase58,
  asAddressBech32,
  asAddressHex,
  asAmount,
  asAmountFormatted,
  asAmountRaw,
  asAmountSanitized,
  asAnchorHash,
  asAnchorUrl,
  asAssetName,
  asBalanceQuantity,
  asBlake2bHash,
  asBlockHash,
  asCborHex,
  asDatumCbor,
  asDatumHash,
  asDRepId,
  asEpochNumber,
  asGovernanceActionId,
  asKeyHash,
  asMetadataCbor,
  asPaymentAddress,
  asPolicyId,
  asPrivateKeyHex,
  asPublicKeyHex,
  asScriptCbor,
  asScriptHash,
  asSha256Hash,
  asSignatureHex,
  asSlotNumber,
  asStakingAddress,
  asTokenFingerprint,
  asTokenId,
  asPortfolioTokenId,
  asTransactionCbor,
  asTransactionCborBase64,
  asTransactionCborHex,
  asTransactionHash,
  asUtxoId,
  asUtxoIdFromParts,
  base58ToAddress,
  bech32ToAddress,
  hexToAddress,
  paymentToAddress,
  stakingToAddress,
} from '../src/branded/validation'

describe('branded validation helpers', () => {
  beforeEach(() => {
    mockWarn.mockClear()
  })

  it('returns branded values without warning for valid formats', () => {
    const policyId = 'a'.repeat(56)
    const txHash = 'b'.repeat(64)

    expect(asPolicyId(policyId)).toBe(policyId)
    expect(asTransactionHash(txHash)).toBe(txHash)
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it('keeps simple casts and conversion helpers warning-free', () => {
    const address = asAddress('addr1valid')
    const bech32Address = asAddressBech32('addr1valid')
    const hexAddress = asAddressHex('abcd')
    const base58Address = asAddressBase58('123456789ABCDEFGHJKLMNPQRSTUVWXYZ')
    const paymentAddress = asPaymentAddress('addr1payment')
    const stakingAddress = asStakingAddress('stake1staking')
    const txHash = asTransactionHash('b'.repeat(64))

    expect(addressToBech32(address)).toBe(address)
    expect(addressToHex(address)).toBe(address)
    expect(addressToBase58(address)).toBe(address)
    expect(bech32ToAddress(bech32Address)).toBe(bech32Address)
    expect(hexToAddress(hexAddress)).toBe(hexAddress)
    expect(base58ToAddress(base58Address)).toBe(base58Address)
    expect(addressToPayment(address)).toBe(address)
    expect(addressToStaking(address)).toBe(address)
    expect(paymentToAddress(paymentAddress)).toBe(paymentAddress)
    expect(stakingToAddress(stakingAddress)).toBe(stakingAddress)
    expect(asPortfolioTokenId('token')).toBe('token')
    expect(asAmount('1')).toBe('1')
    expect(asAmountRaw('raw')).toBe('raw')
    expect(asAmountSanitized('sanitized')).toBe('sanitized')
    expect(asAmountFormatted('1.00')).toBe('1.00')
    expect(asUtxoId('hash:0')).toBe('hash:0')
    const utxoIdObject = {id: 'hash:0'}
    expect(asUtxoId(utxoIdObject as any)).toBe(utxoIdObject)
    expect(asUtxoIdFromParts(txHash, 1)).toBe(`${txHash}:1`)
    expect(asTransactionCborHex('abcd')).toBe('abcd')
    expect(asTransactionCborBase64('ab==')).toBe('ab==')
    expect(asTransactionCbor('abcd')).toBe('abcd')
    expect(asAnchorUrl('https://yoroi-classic.local')).toBe(
      'https://yoroi-classic.local',
    )
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'address',
      validate: () => asAddress(''),
      expected: '[BrandedType] Invalid address: empty or non-string',
    },
    {
      name: 'bech32 address',
      validate: () => asAddressBech32('invalid'),
      expected: '[BrandedType] Invalid bech32 address format: invalid',
    },
    {
      name: 'hex address',
      validate: () => asAddressHex('zz'),
      expected: '[BrandedType] Invalid hex address format: zz',
    },
    {
      name: 'base58 address',
      validate: () => asAddressBase58('0'),
      expected: '[BrandedType] Invalid base58 address format: 0',
    },
    {
      name: 'payment address',
      validate: () => asPaymentAddress(''),
      expected: '[BrandedType] Invalid payment address: ',
    },
    {
      name: 'staking address',
      validate: () => asStakingAddress(''),
      expected: '[BrandedType] Invalid staking address: ',
    },
    {
      name: 'token ID',
      validate: () => asTokenId(''),
      expected: '[BrandedType] Invalid token ID: ',
    },
    {
      name: 'policy ID',
      validate: () => asPolicyId('not-hex'),
      expected:
        '[BrandedType] Invalid policy ID format (expected empty string or 56 hex chars): not-hex',
    },
    {
      name: 'asset name',
      validate: () => asAssetName('zz'),
      expected: '[BrandedType] Invalid asset name hex format: zz',
    },
    {
      name: 'token fingerprint',
      validate: () => asTokenFingerprint(''),
      expected: '[BrandedType] Invalid token fingerprint: ',
    },
    {
      name: 'balance quantity',
      validate: () => asBalanceQuantity(''),
      expected: '[BrandedType] Invalid balance quantity: ',
    },
    {
      name: 'transaction hash',
      validate: () => asTransactionHash('zz'),
      expected:
        '[BrandedType] Invalid transaction hash format (expected 64 hex chars): zz',
    },
    {
      name: 'block hash',
      validate: () => asBlockHash('zz'),
      expected: '[BrandedType] Invalid block hash format: zz',
    },
    {
      name: 'slot number',
      validate: () => asSlotNumber(-1),
      expected: '[BrandedType] Invalid slot number: -1',
    },
    {
      name: 'epoch number',
      validate: () => asEpochNumber(-1),
      expected: '[BrandedType] Invalid epoch number: -1',
    },
    {
      name: 'public key',
      validate: () => asPublicKeyHex('zz'),
      expected:
        '[BrandedType] Invalid public key hex format (expected 64 or 128 hex chars): zz',
    },
    {
      name: 'private key',
      validate: () => asPrivateKeyHex('zz'),
      expected: '[BrandedType] Invalid private key hex format: zz',
    },
    {
      name: 'key hash',
      validate: () => asKeyHash('zz'),
      expected:
        '[BrandedType] Invalid key hash format (expected 56 hex chars): zz',
    },
    {
      name: 'signature',
      validate: () => asSignatureHex('zz'),
      expected:
        '[BrandedType] Invalid signature hex format (expected 128 hex chars): zz',
    },
    {
      name: 'Blake2b hash',
      validate: () => asBlake2bHash('zz'),
      expected: '[BrandedType] Invalid Blake2b hash format: zz',
    },
    {
      name: 'SHA-256 hash',
      validate: () => asSha256Hash('zz'),
      expected:
        '[BrandedType] Invalid SHA-256 hash format (expected 64 hex chars): zz',
    },
    {
      name: 'datum hash',
      validate: () => asDatumHash('zz'),
      expected: '[BrandedType] Invalid datum hash format: zz',
    },
    {
      name: 'script hash',
      validate: () => asScriptHash('zz'),
      expected: '[BrandedType] Invalid script hash format: zz',
    },
    {
      name: 'CBOR hex',
      validate: () => asCborHex('zz'),
      expected: '[BrandedType] Invalid CBOR hex format: zz',
    },
    {
      name: 'metadata CBOR',
      validate: () => asMetadataCbor('zz'),
      expected: '[BrandedType] Invalid metadata CBOR format: zz',
    },
    {
      name: 'script CBOR',
      validate: () => asScriptCbor('zz'),
      expected: '[BrandedType] Invalid script CBOR format: zz',
    },
    {
      name: 'datum CBOR',
      validate: () => asDatumCbor('zz'),
      expected: '[BrandedType] Invalid datum CBOR format: zz',
    },
    {
      name: 'transaction CBOR hex',
      validate: () => asTransactionCborHex('zz'),
      expected: '[BrandedType] Invalid transaction CBOR hex format: zz...',
    },
    {
      name: 'transaction CBOR base64',
      validate: () => asTransactionCborBase64('zz'),
      expected: '[BrandedType] Invalid transaction CBOR base64 format: zz...',
    },
    {
      name: 'legacy transaction CBOR',
      validate: () => asTransactionCbor('zz'),
      expected: '[BrandedType] Invalid transaction CBOR hex format: zz...',
    },
    {
      name: 'DRep ID',
      validate: () => asDRepId('zz'),
      expected: '[BrandedType] Invalid DRep ID format: zz',
    },
    {
      name: 'governance action ID',
      validate: () => asGovernanceActionId(''),
      expected: '[BrandedType] Invalid governance action ID: ',
    },
    {
      name: 'anchor URL',
      validate: () => asAnchorUrl('not-a-url'),
      expected: '[BrandedType] Invalid anchor URL format: not-a-url',
    },
    {
      name: 'anchor hash',
      validate: () => asAnchorHash('zz'),
      expected: '[BrandedType] Invalid anchor hash format: zz',
    },
  ])(
    'keeps lenient casting behavior and logs invalid $name',
    ({validate, expected}) => {
      validate()

      expect(mockWarn).toHaveBeenCalledWith(expected)
    },
  )
})
