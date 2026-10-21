import {cardanoConfig} from '@yoroi/blockchains'
import {
  CIP30TransactionError,
  createSignedLedgerTxFromCbor,
  validateTransactionCbor,
} from '@yoroi/tx'
import {HW, Wallet} from '@yoroi/types'

import {
  MessageAddressFieldType,
  MessageData,
} from '@cardano-foundation/ledgerjs-hw-app-cardano'
import {
  addressInfoFromAddress,
  addressToHex,
  rewardAddressFromAddress,
} from '@yoroi-classic/cml-mobile-bridge'

import {buildCoseSign1FromSignature, makeCip8Key} from '../cip8/cip8'
import {assertHasAllSigners} from '../common/signatureUtils'
import {CardanoWalletDependencies} from '../dependencies'
import {signMessageWithLedger, signTxWithLedger} from '../hw/hw'
import {YoroiWallet} from '../types'
import {
  getAddressedUtxos,
  getHexAddressingMap,
  getStakeAddressMap,
} from '../utils'

export type CIP30LedgerExtension = {
  signData(
    address: string,
    payload: string,
    hwDeviceInfo: HW.DeviceInfo,
    useUSB: boolean,
  ): Promise<{signature: string; key: string}>
  signTx(
    cbor: string,
    partial: boolean,
    hwDeviceInfo: HW.DeviceInfo,
    useUSB: boolean,
  ): Promise<Uint8Array>
}

export const cip30LedgerExtensionMaker = (
  wallet: YoroiWallet,
  meta: Wallet.Meta,
  dependencies: Pick<CardanoWalletDependencies, 'toLedgerSignRequest'>,
): CIP30LedgerExtension => {
  const {toLedgerSignRequest} = dependencies
  return {
    async signData(
      address: string,
      payload: string,
      hwDeviceInfo: HW.DeviceInfo,
      useUSB: boolean,
    ) {
      const addressInfo = addressInfoFromAddress(address)
      if (!addressInfo.isValid || !addressInfo.bech32) {
        throw new Error('Invalid address')
      }

      let rewardAddressHex: string | undefined
      try {
        rewardAddressHex = addressToHex(
          rewardAddressFromAddress(address, wallet.networkManager.chainId),
        )
      } catch {
        // Byron and enterprise addresses do not carry a stake credential.
      }

      const stakingSigningPath =
        meta.implementation === 'cardano-cip1852'
          ? cardanoConfig.implementations[meta.implementation].features.staking
              .addressing
          : null

      const signingPath =
        rewardAddressHex === wallet.rewardAddressHex &&
        Array.isArray(stakingSigningPath)
          ? stakingSigningPath
          : wallet.getAddressing(addressInfo.bech32).path

      const ledgerPayload: MessageData = {
        messageHex: payload,
        signingPath,
        hashPayload: false,
        preferHexDisplay: false,
        addressFieldType: MessageAddressFieldType.KEY_HASH,
      }
      const response = await signMessageWithLedger(
        ledgerPayload,
        hwDeviceInfo,
        useUSB,
      )
      return encodeHardwareWalletSignResult({
        addressHex: response.addressFieldHex,
        signatureHex: response.signatureHex,
        payloadHex: payload,
        signingPublicKeyHex: response.signingPublicKeyHex,
      })
    },

    async signTx(
      cbor: string,
      partial: boolean,
      hwDeviceInfo: HW.DeviceInfo,
      useUSB: boolean,
    ) {
      // Validate transaction CBOR before signing
      const validation = validateTransactionCbor(cbor)
      if (!validation.valid) {
        throw new CIP30TransactionError(
          `Transaction validation failed: ${validation.errors.join(', ')}`,
          validation,
        )
      }

      if (!partial) await assertHasAllSigners(cbor, wallet, meta)

      const stakingSigningPath =
        meta.implementation === 'cardano-cip1852'
          ? Array.from(
              cardanoConfig.implementations[meta.implementation].features
                .staking.addressing,
            )
          : undefined

      const addressingMap = await getHexAddressingMap(wallet)
      const stakeAddressMap = getStakeAddressMap(
        wallet.rewardAddressHex,
        stakingSigningPath as number[] | undefined,
      )
      const payload = await toLedgerSignRequest(
        cbor,
        wallet.networkManager.chainId,
        wallet.networkManager.protocolMagic,
        addressingMap,
        stakeAddressMap,
        getAddressedUtxos(wallet),
        [],
        stakingSigningPath as number[] | undefined,
      )

      const signedLedgerTx = await signTxWithLedger(
        payload,
        hwDeviceInfo,
        useUSB,
      )
      const implementationConfig =
        cardanoConfig.implementations[meta.implementation]
      const bytes = await createSignedLedgerTxFromCbor(
        cbor,
        signedLedgerTx,
        implementationConfig.derivations.base.harden.purpose,
        wallet.publicKeyHex,
      )
      return bytes
    },
  }
}

export async function encodeHardwareWalletSignResult(options: {
  addressHex: string
  signatureHex: string
  payloadHex: string
  signingPublicKeyHex: string
}): Promise<{signature: string; key: string}> {
  const coseSign1 = await buildCoseSign1FromSignature(
    Buffer.from(options.addressHex, 'hex'),
    Buffer.from(options.signatureHex, 'hex'),
    Buffer.from(options.payloadHex, 'hex'),
    Buffer.from(options.signingPublicKeyHex, 'hex'),
  )

  const key = await makeCip8Key(Buffer.from(options.signingPublicKeyHex, 'hex'))

  return {
    signature: Buffer.from(coseSign1.toBytes()).toString('hex'),
    key: Buffer.from(key.toBytes()).toString('hex'),
  }
}
