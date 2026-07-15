import {asPolicyId, asTransactionHash} from '../src/branded/validation'

describe('branded validation helpers', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('returns branded values without warning for valid formats', () => {
    const policyId = 'a'.repeat(56)
    const txHash = 'b'.repeat(64)

    expect(asPolicyId(policyId)).toBe(policyId)
    expect(asTransactionHash(txHash)).toBe(txHash)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('keeps lenient casting behavior and warns for invalid formats', () => {
    expect(asPolicyId('not-hex')).toBe('not-hex')
    expect(warnSpy).toHaveBeenCalledWith(
      '[BrandedType] Invalid policy ID format (expected empty string or 56 hex chars): not-hex',
    )
  })
})
