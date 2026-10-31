import {walletRootKeyHexFromEntropy} from '@yoroi-classic/cml-mobile-bridge'
import {generateMnemonic, mnemonicToEntropy} from 'bip39'
import {randomBytes} from 'react-native-randombytes'

const mnemonicStrengh = 160

export const generateAdaMnemonic = () =>
  generateMnemonic(mnemonicStrengh, randomBytes)

export const getMasterKeyFromMnemonic = (mnemonic: string) => {
  const entropyHex = mnemonicToEntropy(mnemonic)
  return Uint8Array.from(
    Buffer.from(walletRootKeyHexFromEntropy(entropyHex), 'hex'),
  )
}
