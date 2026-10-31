import {CardanoAddressedUtxo} from '@yoroi/tx'

import {
  filterAddressesByStakingKey,
  getPoolBech32Id,
  isValidPoolIdOrHash,
  normalizeToPoolHash,
} from './delegationUtils'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn(() => ({
    hex: '00' + 'ab'.repeat(28),
    networkId: 0,
    bech32: 'addr_test1fixture',
    isValid: true,
  })),
  stakeCredentialHexFromAddress: jest.fn((address: string) =>
    address === 'addr_test1fixture'
      ? '8200581c' + 'cd'.repeat(28)
      : '8200581c' + 'ef'.repeat(28),
  ),
  normalizePoolIdentifier: jest.fn((value: string) => {
    if (value === 'pool1fixture') return {id: value, hash: 'ab'.repeat(28)}
    if (/^[0-9a-fA-F]{56}$/.test(value)) {
      return {id: 'pool1fixture', hash: value.toLowerCase()}
    }
    throw new Error('Invalid pool identifier')
  }),
}))

describe('filterAddressesByStakingKey', () => {
  it('uses the CML stake credential parser for account address filtering', async () => {
    const utxo = {receiver: 'addr_test1fixture'} as CardanoAddressedUtxo
    const nonMatchingUtxo = {
      receiver: 'addr_test1notmatching',
    } as CardanoAddressedUtxo
    const result = await filterAddressesByStakingKey(
      '8200581c' + 'cd'.repeat(28),
      [utxo, nonMatchingUtxo],
      false,
    )

    expect(result).toEqual([utxo])
  })
})

describe('CML pool identifier normalization', () => {
  it('normalizes bech32 IDs and key hashes without CSL objects', () => {
    expect(normalizeToPoolHash('pool1fixture')).toBe('ab'.repeat(28))
    expect(getPoolBech32Id('ab'.repeat(28))).toBe('pool1fixture')
    expect(isValidPoolIdOrHash('pool1fixture')).toBe(true)
    expect(isValidPoolIdOrHash('not-a-pool')).toBe(false)
  })
})
