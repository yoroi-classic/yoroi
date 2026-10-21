import {Hex, hex} from '@yoroi/common'
import {decryptWalletData} from '@yoroi/links'
import {App} from '@yoroi/types'

import {logger} from '~/kernel/logger/logger'

export const decryptData = ({
  encryptedData,
  secretKey,
}: {
  encryptedData: Hex
  secretKey: Hex
}) => {
  try {
    return hex(
      decryptWalletData(
        encryptedData.value,
        secretKey.utf8,
        'chacha20poly1305',
      ),
    )
  } catch {
    try {
      // Existing encrypted storage uses CSL's EMIP-3 byte layout. Keep that
      // format decrypt-only while new writes use the standard format.
      return hex(
        decryptWalletData(
          encryptedData.value,
          secretKey.utf8,
          'chacha20poly1305-csl',
        ),
      )
    } catch {
      // Wrong password is expected during password validation and shouldn't be
      // sent to error tracking services.
      logger.debug('Decryption failed (expected during password validation)', {
        origin: 'decryptData',
      })
      throw new App.Errors.WrongPassword()
    }
  }
}
