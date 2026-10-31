import {identifierToAssetHex} from './assetHelpers'

describe('identifierToAssetHex', () => {
  it('returns plain policy and asset-name hex without CSL objects', () => {
    const policyId = 'ab'.repeat(28)
    expect(identifierToAssetHex(`${policyId}.00ff`)).toEqual({
      policyIdHex: policyId,
      assetNameHex: '00ff',
    })
  })

  it('preserves an empty asset name', () => {
    const policyId = 'cd'.repeat(28)
    expect(identifierToAssetHex(policyId)).toEqual({
      policyIdHex: policyId,
      assetNameHex: '',
    })
  })
})
