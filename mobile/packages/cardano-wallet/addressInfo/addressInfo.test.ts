import {addressInfoFromAddress} from '@yoroi-classic/cml-mobile-bridge'

import {
  addressUsesStakingKey,
  getSpendingKey,
  getStakingKey,
  toCardanoAddressInfo,
} from './addressInfo'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn(),
}))

const baseMainnet =
  'addr1q9ndnrwz52yeex4j04kggp0ul5632qmxqx22ugtukkytjysw86pdygc6zarl2kks6fvg8um447uvv679sfdtzkwf2kuq673wke'
const baseTestnet =
  'addr_test1qpfn8e903n5eqsplral59lhrvyud9g50mmceqeezhnfpr3aytuevw54ze6zh8cgk8vld0m7cumkttye5wc44ad04s29sm2lmry'
const enterpriseScript =
  'addr1vyht4ja0zcn45qvyx477qlyp6j5ftu5ng0prt9608dxp6lgpnh5ft'
const rewardMainnet =
  'stake1u948jr02falxxqphnv3g3rkd3mdzqmtqq3x0tjl39m7dqngqg0fxp'
const rewardTestnet =
  'stake_test1uq3ejar8nmvc2xnxn4frrhw8myggfa2g5jlpsfj0c3mh84cwvmp2w'
const byron = 'Ae2tdPwUPEZ9uHfzhw3vXUrTFLowct5hMMHeNjfsrkQv5XSi5PhSs2yRNUb'
const jormungandr =
  'ta1svy0mwwm7mdwcuj308aapjw6ra4c3e6cygd0f333nvtjzxg8ahdvxlswdf0'

const keyHash = '66d98dc2a2899c9ab27d6c8405fcfd351503660194ae217cb588b912'
const stakeHash = '0e3e82d2231a1747f55ad0d25883f375afb8c66bc5825ab159c955b8'
const rewardMainHash =
  '6a790dea4f7e6300379b22888ecd8eda206d60044cf5cbf12efcd04d'
const rewardTestHash =
  '239974679ed9851a669d5231ddc7d91084f548a4be18264fc47773d7'

const parsedAddresses = new Map([
  [baseMainnet, `01${keyHash}${stakeHash}`],
  [
    baseTestnet,
    `00${'5333e4af8ce990403f1f7f42fee36138d2a28fdef1906722bcd211c7'}${'a45f32c752a2ce8573e1163b3ed7efd8e6ecb59334762b5eb5f5828b'}`,
  ],
  [enterpriseScript, `71${'ab'.repeat(28)}`],
  [rewardMainnet, `e1${rewardMainHash}`],
  [rewardTestnet, `e0${rewardTestHash}`],
])

beforeEach(() => {
  ;(addressInfoFromAddress as jest.Mock).mockImplementation(
    (address: string) => {
      const hex = parsedAddresses.get(address)
      if (!hex) throw new Error('Invalid Cardano address')
      return {hex, networkId: 1, bech32: address, isValid: true}
    },
  )
})

describe('CML address credential extraction', () => {
  it.each([
    [baseMainnet, keyHash, stakeHash],
    [
      baseTestnet,
      '5333e4af8ce990403f1f7f42fee36138d2a28fdef1906722bcd211c7',
      'a45f32c752a2ce8573e1163b3ed7efd8e6ecb59334762b5eb5f5828b',
    ],
    [enterpriseScript, '', null],
    [rewardMainnet, rewardMainHash, ''],
    [rewardTestnet, rewardTestHash, ''],
    [byron, null, null],
    [jormungandr, null, null],
  ])('extracts key hashes from %s', (address, spending, staking) => {
    expect(getSpendingKey(address)).toBe(spending)
    expect(getStakingKey(address)).toBe(staking)
  })

  it('returns only serializable CML address information', () => {
    expect(toCardanoAddressInfo(baseMainnet)).toEqual({
      hex: `01${keyHash}${stakeHash}`,
      networkId: 1,
      bech32: baseMainnet,
      isValid: true,
    })
    expect(toCardanoAddressInfo(byron)).toBeNull()
  })

  it('matches only the requested stake credential and rejects non-base or malformed addresses', () => {
    expect(addressUsesStakingKey(baseMainnet, stakeHash)).toBe(true)
    expect(addressUsesStakingKey(baseMainnet, keyHash)).toBe(false)
    expect(addressUsesStakingKey(enterpriseScript, stakeHash)).toBe(false)
    expect(addressUsesStakingKey(byron, stakeHash)).toBe(false)
    expect(addressUsesStakingKey('not-an-address', stakeHash)).toBe(false)
  })
})
