import {Hex, hex} from '@yoroi/common'
import {encryptWalletData} from '@yoroi/links'

import {randomHexString} from './random-hex-string'

export const encryptData = ({
  plainData,
  secretKey,
}: {
  plainData: Hex
  secretKey: Hex
}) => {
  return hex(
    encryptWalletData(plainData.value, secretKey.utf8, 'chacha20poly1305', {
      randomHexString,
    }),
  )
}

export const randomSalt = () => randomHexString(32)

export const randomNonce = () => randomHexString(24)
