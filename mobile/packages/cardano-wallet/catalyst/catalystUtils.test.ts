import {catalystPrivateKeyHexFromEntropy} from '@yoroi-classic/cml-mobile-bridge'
import {mnemonicToEntropy} from 'bip39'

import {generateAdaMnemonic} from '../mnemonic/mnemonic'
import {generatePrivateKeyForCatalyst} from './catalystUtils'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  catalystPrivateKeyHexFromEntropy: jest.fn(() => 'a1b2c3'),
}))
jest.mock('bip39', () => ({mnemonicToEntropy: jest.fn(() => '001122')}))
jest.mock('../mnemonic/mnemonic', () => ({
  generateAdaMnemonic: jest.fn(() => 'fixture mnemonic'),
}))

describe('generatePrivateKeyForCatalyst', () => {
  it('returns the exact raw key bytes produced by CML from the generated entropy', () => {
    expect(Array.from(generatePrivateKeyForCatalyst())).toEqual([
      0xa1, 0xb2, 0xc3,
    ])
    expect(mnemonicToEntropy).toHaveBeenCalledWith('fixture mnemonic')
    expect(catalystPrivateKeyHexFromEntropy).toHaveBeenCalledWith('001122', '')
    expect(generateAdaMnemonic).toHaveBeenCalledTimes(1)
  })
})
