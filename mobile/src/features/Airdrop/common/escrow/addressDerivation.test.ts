import {deriveEscrowAddress as deriveEscrowAddressCml} from '@yoroi-classic/cml-mobile-bridge'

import {deriveEscrowAddress} from './addressDerivation'
import {ESCROW_SCRIPT_HASH} from './constants'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  deriveEscrowAddress: jest.fn(() => 'addr_test1script'),
}))

describe('deriveEscrowAddress', () => {
  it('uses CML with the selected network and escrow script hash', async () => {
    await expect(deriveEscrowAddress('addr_test1eligible', 0)).resolves.toBe(
      'addr_test1script',
    )
    expect(deriveEscrowAddressCml).toHaveBeenCalledWith({
      eligibleAddress: 'addr_test1eligible',
      scriptHashHex: ESCROW_SCRIPT_HASH,
      networkId: 0,
    })
  })
})
