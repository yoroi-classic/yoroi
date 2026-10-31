import {catalystPrivateKeyHexFromEntropy} from '@yoroi-classic/cml-mobile-bridge'
import {mnemonicToEntropy} from 'bip39'
import {Buffer} from 'buffer'

import {generateAdaMnemonic} from '../mnemonic/mnemonic'

export function generatePrivateKeyForCatalyst(): Uint8Array {
  const mnemonic = generateAdaMnemonic()
  const entropyHex = mnemonicToEntropy(mnemonic)
  const privateKeyHex = catalystPrivateKeyHexFromEntropy(entropyHex, '')

  return Uint8Array.from(Buffer.from(privateKeyHex, 'hex'))
}
