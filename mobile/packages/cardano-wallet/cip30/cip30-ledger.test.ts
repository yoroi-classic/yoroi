import {MessageAddressFieldType} from '@cardano-foundation/ledgerjs-hw-app-cardano'
import {
  addressInfoFromAddress,
  rewardAddressFromAddress,
} from '@yoroi-classic/cml-mobile-bridge'

import {signMessageWithLedger} from '../hw/hw'
import {cip30LedgerExtensionMaker} from './cip30-ledger'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn(() => ({
    hex: '60aa',
    bech32: 'addr_test1fixture',
    networkId: 0,
    isValid: true,
  })),
  addressToHex: jest.fn(() => 'stake1fixturehex'),
  rewardAddressFromAddress: jest.fn(() => 'stake1fixture'),
}))

jest.mock('../hw/hw', () => ({
  signMessageWithLedger: jest.fn(async () => ({
    addressFieldHex: '60aa',
    signatureHex: 'bb'.repeat(64),
    signingPublicKeyHex: 'cc'.repeat(32),
  })),
  signTxWithLedger: jest.fn(),
}))

jest.mock('../cip8/cip8', () => ({
  buildCoseSign1FromSignature: jest.fn(async () => ({
    toBytes: () => new Uint8Array([1]),
  })),
  makeCip8Key: jest.fn(async () => ({toBytes: () => new Uint8Array([2])})),
}))

describe('CIP-30 Ledger extension', () => {
  it('normalizes an address through CML and signs with its wallet derivation path', async () => {
    const wallet = {
      networkManager: {chainId: 0},
      rewardAddressHex: 'different-stake-hex',
      getAddressing: jest.fn(() => ({path: [1852, 1815, 0, 0, 0]})),
    }
    const extension = cip30LedgerExtensionMaker(
      wallet as never,
      {implementation: 'unknown'} as never,
      {} as never,
    )

    const result = await extension.signData(
      'addr_test1fixture',
      'deadbeef',
      {} as never,
      false,
    )

    expect(addressInfoFromAddress).toHaveBeenCalledWith('addr_test1fixture')
    expect(rewardAddressFromAddress).toHaveBeenCalledWith(
      'addr_test1fixture',
      0,
    )
    expect(wallet.getAddressing).toHaveBeenCalledWith('addr_test1fixture')
    expect(signMessageWithLedger).toHaveBeenCalledWith(
      {
        messageHex: 'deadbeef',
        signingPath: [1852, 1815, 0, 0, 0],
        hashPayload: false,
        preferHexDisplay: false,
        addressFieldType: MessageAddressFieldType.KEY_HASH,
      },
      {},
      false,
    )
    expect(result).toEqual({signature: '01', key: '02'})
  })

  it('rejects an address the CML parser cannot normalize', async () => {
    ;(addressInfoFromAddress as jest.Mock).mockReturnValueOnce({
      hex: '',
      bech32: null,
      networkId: 0,
      isValid: false,
    })
    const extension = cip30LedgerExtensionMaker(
      {networkManager: {chainId: 0}} as never,
      {implementation: 'unknown'} as never,
      {} as never,
    )

    await expect(
      extension.signData('not-an-address', '', {} as never, false),
    ).rejects.toThrow('Invalid address')
  })
})
