import {Address} from '@yoroi/types'

import {
  baseAddressBech32FromPublicKeyHashes,
  derivePublicKeyFromAccountPathHex,
  icarusAddressBase58FromAccountPublicKeyHex,
  publicKeyHashHexFromRawHex,
  rewardAddressHexFromAccountPublicKey,
} from '@yoroi-classic/cml-mobile-bridge'

import * as cardanoApi from '../api/api'
import {
  AddressChain,
  type AddressGenerator,
  accountManagerMaker,
  createAddressChain,
  createAddressGenerator,
} from './account-manager'

jest.mock('../api/api', () => ({
  filterUsedAddresses: jest.fn().mockResolvedValue([]),
}))

const getAddr = (i: number) => `Addr${i}` as Address

describe('AddressChain', () => {
  let chain: AddressChain | undefined
  let used: number[] = []
  const filterFn = (addrs: Address[]) =>
    Promise.resolve(addrs.filter((addr) => used.map(getAddr).includes(addr)))

  beforeEach(() => {
    used = []
    chain = createAddressChain(
      {
        generate: (ids) => ids.map(getAddr),
      } as AddressGenerator,
      5 /* block size */,
      2 /* gap limit */,
    )
  })

  it('starts with some addresses', () => {
    expect.assertions(1)
    chain?.initialize()
    expect(chain?.size()).toBe(5)
  })

  it('follows discovery', async () => {
    expect.assertions(5)
    used = []
    chain?.initialize()
    await chain?.sync(filterFn)
    expect(chain?.size()).toBe(5)

    used.push(1)
    await chain?.sync(filterFn)
    expect(chain?.size()).toBe(5)

    used.push(0)
    used.push(2)
    await chain?.sync(filterFn)
    expect(chain?.size()).toBe(5)

    used.push(3)
    await chain?.sync(filterFn)
    expect(chain?.size()).toBe(10)

    used.push(9)
    used.push(14)
    used.push(19)
    await chain?.sync(filterFn)
    expect(chain?.size()).toBe(25)
  })

  it('provides correct indexOf', async () => {
    expect.assertions(4)

    used = [4, 9]
    chain?.initialize()
    await chain?.sync(filterFn)
    expect(chain?.size()).toBe(15)
    expect(chain?.getIndexOfAddress(getAddr(4))).toBe(4)
    expect(chain?.getIndexOfAddress(getAddr(7))).toBe(7)
    expect(chain?.getIndexOfAddress(getAddr(14))).toBe(14)
  })

  it('can continue after rehydrating', async () => {
    const legacyByronAddress =
      'Ae2tdPwUPEZ6ipzynAWN6atmb9LNqEogput2NrMD3Z8UL7phtQLDhrKt1bf'
    jest
      .mocked(icarusAddressBase58FromAccountPublicKeyHex)
      .mockImplementation((_accountPubKeyHex, role, index) =>
        role === 1 && index === 3
          ? legacyByronAddress
          : `Ae2tdPwUPEZfixture${index}`,
      )
    const chainId = 1
    const pubKey44 =
        '7f53efa3c08093db3824235769079e96ef96b6680fc254f6c021ec420e4d1555' +
        'b5bafb0b1fc6c8040cc8f69f7c1948dfb4dcadec4acd09730c0efb39c6159362',
      chain = createAddressChain(
        createAddressGenerator(pubKey44, 1, 'cardano-bip44', chainId),
        5,
        2,
      )

    expect.assertions(2)

    chain.initialize()

    const data = chain.toJSON()
    const chain2 = AddressChain.fromJSON(data, 1)

    const used = [
      // '2cWKMJemoBaiAKW7iBFgK3prZAK3gAEgkndCUTkGpUAoRofmXJcbmie2qe6JTN44dQ2Ag', // byron testnet
      legacyByronAddress, // byron mainnet
    ]

    const filter = (addresses: Address[]) => {
      return Promise.resolve(
        addresses.filter((addr) => used.includes(addr as string)),
      )
    }
    await chain.sync(filter)
    await chain2.sync(filter)
    expect(chain.size()).toBe(10)
    expect(chain2.addresses).toEqual(chain.addresses)
  })
})

describe('CML reward address derivation', () => {
  it('derives the reward address bytes from the account key and configured stake path', () => {
    jest
      .mocked(rewardAddressHexFromAccountPublicKey)
      .mockReturnValue('e1' + 'ab'.repeat(28))
    const accountPubKeyHex = '01'.repeat(64)
    const generator = createAddressGenerator(
      accountPubKeyHex,
      0,
      'cardano-cip1852',
      0,
    )

    expect(generator.getRewardAddressHex()).toBe('e1' + 'ab'.repeat(28))
    expect(rewardAddressHexFromAccountPublicKey).toHaveBeenCalledWith(
      accountPubKeyHex,
      0,
      2,
      0,
    )
  })

  it('builds Shelley base addresses from the payment and stake key hashes', () => {
    jest
      .mocked(derivePublicKeyFromAccountPathHex)
      .mockReturnValueOnce('11'.repeat(32))
      .mockReturnValueOnce('22'.repeat(32))
    jest
      .mocked(publicKeyHashHexFromRawHex)
      .mockReturnValueOnce('33'.repeat(28))
      .mockReturnValueOnce('44'.repeat(28))
    jest
      .mocked(baseAddressBech32FromPublicKeyHashes)
      .mockReturnValue('addr_test1cmlfixture')
    const accountPubKeyHex = '01'.repeat(64)
    const generator = createAddressGenerator(
      accountPubKeyHex,
      0,
      'cardano-cip1852',
      0,
    )

    expect(generator.generate([7])).toEqual(['addr_test1cmlfixture'])
    expect(baseAddressBech32FromPublicKeyHashes).toHaveBeenCalledWith(
      '33'.repeat(28),
      '44'.repeat(28),
      0,
    )
  })

  it('builds Byron Icarus addresses with the legacy protocol magic', () => {
    jest
      .mocked(icarusAddressBase58FromAccountPublicKeyHex)
      .mockReturnValue('Ae2tdPwUPEZfixture')
    const accountPubKeyHex = '01'.repeat(64)
    const generator = createAddressGenerator(
      accountPubKeyHex,
      1,
      'cardano-bip44',
      1,
    )

    expect(generator.generate([4])).toEqual(['Ae2tdPwUPEZfixture'])
    expect(icarusAddressBase58FromAccountPublicKeyHex).toHaveBeenCalledWith(
      accountPubKeyHex,
      1,
      4,
      764824073,
    )
  })
})

describe('accountManagerMaker', () => {
  it('routes address discovery through the cardano API with the wallet network', async () => {
    const storage = {
      join: jest.fn(() => storage),
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => undefined),
      removeItem: jest.fn(async () => undefined),
    } as any

    const manager = await accountManagerMaker({
      chainId: 1,
      implementation: 'cardano-bip44',
      accountPubKeyHex:
        '7f53efa3c08093db3824235769079e96ef96b6680fc254f6c021ec420e4d1555' +
        'b5bafb0b1fc6c8040cc8f69f7c1948dfb4dcadec4acd09730c0efb39c6159362',
      storage,
      baseApiUrl: 'https://api.yoroiwallet.com/api',
      cardanoWalletBackendNetwork: 'mainnet',
    })

    await manager.discoverAddresses()

    expect(cardanoApi.filterUsedAddresses).toHaveBeenCalledWith(
      expect.any(Array),
      'https://api.yoroiwallet.com/api',
      undefined,
      'mainnet',
    )
  })
})
