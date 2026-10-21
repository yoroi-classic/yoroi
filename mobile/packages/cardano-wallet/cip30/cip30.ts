import {RawUtxo, toAssetNameHex, toPolicyId} from '@yoroi/api'
import {cardanoConfig} from '@yoroi/blockchains'
import {getLogger} from '@yoroi/logger'
import {
  CIP30TransactionError,
  RemoteUnspentOutput,
  calculateTxId,
  normalizeAddressToHex,
  validateTransactionCbor,
} from '@yoroi/tx'
import {AddressHex, Balance, Branded, Portfolio, Wallet} from '@yoroi/types'

import {
  addressInfoFromAddress,
  addressToHex,
  deriveWalletPublicKeyHex,
  emptyWitnessTransactionHex,
  rewardAddressFromAddress,
  signWalletData,
  transactionReviewInfoJson,
  transactionUnspentOutputHex,
  valueFromAmountsHex,
  valueFromHexInfoJson,
} from '@yoroi-classic/cml-mobile-bridge'
import {BigNumber} from 'bignumber.js'
import {Buffer} from 'buffer'

import {identifierToAssetHex} from '../assetUtils'
import * as cip8 from '../cip8/cip8'
import {
  getDerivationPathForAddress,
  getTransactionSigners,
} from '../common/signatureUtils'
import {CardanoWalletDependencies} from '../dependencies'
import {createSendTxFromWallet} from '../transaction-recipes'
import {Pagination, YoroiWallet} from '../types'
import {Utxos, asQuantity} from '../utils/utils'
import {
  collateralConfig,
  findCollateralCandidates,
  utxosMaker,
} from '../utxoManager/utxos'

export type CIP30Extension = {
  getBalance(tokenId?: string): string
  getUnusedAddresses(): string[]
  getUsedAddresses(pagination?: Pagination): string[]
  getChangeAddress(): string
  getRewardAddresses(): string[]
  getUtxos(value?: string, pagination?: Pagination): Promise<string[] | null>
  getCollateral(value?: string): Promise<string[] | null>
  submitTx(cbor: string): Promise<string>
  signData(
    rootKey: string,
    address: string,
    payload: string,
  ): Promise<{signature: string; key: string}>
  signTx(rootKey: string, cbor: string, partial?: boolean): Promise<string>
  buildReorganisationTx(value?: string): Promise<string>
}

export const cip30ExtensionMaker = (
  wallet: YoroiWallet,
  meta: Wallet.Meta,
  dependencies: Pick<CardanoWalletDependencies, 'createCollateralEntry'>,
): CIP30Extension => {
  const {createCollateralEntry} = dependencies
  return {
    getBalance(tokenId = '*') {
      return _getBalance(
        tokenId,
        wallet.utxos(),
        wallet.portfolioPrimaryTokenInfo.id,
      )
    },

    getUnusedAddresses() {
      return wallet
        .receiveAddresses()
        .filter((address) => !wallet.isUsedAddressIndex()[address])
        .map(normalizeAddressToHex)
        .filter((address): address is AddressHex => address !== undefined)
    },

    getUsedAddresses(pagination?: Pagination) {
      return paginate(wallet.externalAddresses(), pagination)
        .map(normalizeAddressToHex)
        .filter((address): address is AddressHex => address !== undefined)
    },

    getChangeAddress() {
      const changeAddr = wallet.getChangeAddress(meta.addressMode)
      const addressHex = normalizeAddressToHex(changeAddr)
      if (!addressHex) throw new Error(`Invalid change address: ${changeAddr}`)
      return addressHex
    },

    getRewardAddresses() {
      const addressHex = normalizeAddressToHex(wallet.rewardAddressHex)
      if (!addressHex) throw new Error('Invalid reward address')
      return [addressHex]
    },

    async getUtxos(value?: string, pagination?: Pagination) {
      return _getUtxos(wallet, meta, value, pagination)
    },

    async getCollateral(value?: string) {
      const valueStr = value?.trim() ?? collateralConfig.minLovelace.toString()
      const valueNum = new BigNumber(valueStr)

      assertCollateralValue(valueNum)

      const currentCollateral = wallet.getCollateralInfo()
      const canUseCurrentCollateral =
        currentCollateral.utxo && valueNum.lte(currentCollateral.utxo.amount)

      if (canUseCurrentCollateral && currentCollateral.utxo) {
        try {
          const utxo = cardanoUtxoFromRemoteFormat(
            rawUtxoToRemoteUnspentOutput(
              currentCollateral.utxo,
              wallet.portfolioPrimaryTokenInfo.id,
            ),
            wallet.portfolioPrimaryTokenInfo.id,
          )
          return [utxo]
        } catch (error) {
          getLogger().error(
            'Error converting collateral UTXO to Cardano CBOR',
            {
              error: error instanceof Error ? error.message : String(error),
              utxoIndex: currentCollateral.utxo.tx_index,
              utxoAmount: currentCollateral.utxo.amount,
              utxoAssetsCount: currentCollateral.utxo.assets?.length ?? 0,
              utxoReceiver: currentCollateral.utxo.receiver,
              txHash: currentCollateral.utxo.tx_hash,
              txIndex: currentCollateral.utxo.tx_index,
            },
          )
          throw error
        }
      }

      const oneUtxoCollateral = _drawCollateralInOneUtxo(
        wallet,
        asQuantity(valueNum),
      )
      if (oneUtxoCollateral) {
        return [oneUtxoCollateral]
      }

      const multipleUtxosCollateral = await _drawCollateralInMultipleUtxos(
        wallet,
        meta,
        asQuantity(valueNum),
      )
      if (multipleUtxosCollateral && multipleUtxosCollateral.length > 0) {
        return multipleUtxosCollateral
      }

      return null
    },

    async submitTx(cbor: string) {
      const base64 = Branded.asTransactionCborBase64(
        Buffer.from(cbor, 'hex').toString('base64'),
      )
      const txId = await calculateTxId(cbor, 'hex')
      await wallet.submitTransaction(base64)
      return txId
    },

    async signData(rootKey: string, address: string, payload: string) {
      const addressInfo = addressInfoFromAddress(address)
      if (!addressInfo.isValid || !addressInfo.bech32) {
        throw new Error('Invalid address')
      }
      const bech32Address = addressInfo.bech32
      const payloadInBytes = Buffer.from(payload, 'hex')
      const addressBytes = Buffer.from(addressInfo.hex, 'hex')
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
          : getDerivationPathForAddress(bech32Address, wallet, meta, true)

      const publicKeyHex = deriveWalletPublicKeyHex({
        masterKeyHex: rootKey,
        signerPath: signingPath,
      })
      const publicKeyBytes = Buffer.from(publicKeyHex, 'hex')
      const dataToSign = cip8.makeCip8DataToSign(
        addressBytes,
        payloadInBytes,
        publicKeyBytes,
      )
      const {signatureHex, publicKeyHex: signedPublicKeyHex} = signWalletData({
        messageHex: dataToSign.toString('hex'),
        masterKeyHex: rootKey,
        signerPath: signingPath,
      })
      if (signedPublicKeyHex !== publicKeyHex) {
        throw new Error('CML signing key changed during CIP-8 signing')
      }
      const coseSign1 = await cip8.buildCoseSign1FromSignature(
        addressBytes,
        Buffer.from(signatureHex, 'hex'),
        payloadInBytes,
        publicKeyBytes,
      )
      const key = await cip8.makeCip8Key(publicKeyBytes)

      return {
        signature: Buffer.from(coseSign1.toBytes()).toString('hex'),
        key: Buffer.from(key.toBytes()).toString('hex'),
      }
    },

    async signTx(rootKey: string, cbor: string, partial = false) {
      // Validate transaction CBOR before signing
      const validation = validateTransactionCbor(cbor)
      if (!validation.valid) {
        throw new CIP30TransactionError(
          `Transaction validation failed: ${validation.errors.join(', ')}`,
          validation,
        )
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        getLogger().warn('CIP-30 transaction validation warnings', {
          warnings: validation.warnings,
        })
      }

      // Get transaction signers
      const signers = await getTransactionSigners(cbor, wallet, meta, partial)
      // Derivation and witness construction run in the CML native bridge.
      const signedTxBytes = await wallet.signRawTx(cbor, rootKey, signers)
      if (!signedTxBytes) throw new Error('Unable to sign transaction')

      // Return signed transaction CBOR hex string (CIP-30 spec requirement)
      return Buffer.from(signedTxBytes).toString('hex')
    },

    async buildReorganisationTx(value?: string) {
      const valueStr = value?.trim() ?? collateralConfig.minLovelace.toString()
      const valueNum = new BigNumber(valueStr)

      assertCollateralValue(valueNum)

      const entry = createCollateralEntry(wallet, valueStr)
      const yoroiUnsignedTx = await createSendTxFromWallet(wallet, {
        entries: [entry],
        addressMode: meta.addressMode,
      })

      return emptyWitnessTransactionHex(yoroiUnsignedTx.cbor)
    },
  }
}

const cardanoUtxoFromRemoteFormat = (
  u: RemoteUnspentOutput,
  primaryTokenId: Portfolio.Token.Id,
): string => {
  // Validate input data
  if (!u.txHash || typeof u.txHash !== 'string') {
    throw new Error(`Invalid txHash: ${u.txHash}`)
  }
  if (typeof u.txIndex !== 'number') {
    throw new Error(`Invalid txIndex: ${u.txIndex}`)
  }
  if (!u.balance || typeof u.balance !== 'object') {
    throw new Error(`Invalid balance: ${u.balance}`)
  }
  if (!u.receiver || typeof u.receiver !== 'string') {
    throw new Error(`Invalid receiver: ${u.receiver}`)
  }

  const primaryAmount = u.balance[primaryTokenId] ?? Branded.ZERO_QUANTITY
  return transactionUnspentOutputHex({
    txHashHex: u.txHash,
    index: String(u.txIndex),
    address: u.receiver,
    lovelace: primaryAmount,
    assets: Object.entries(u.balance)
      .filter(
        ([tokenId, quantity]) => tokenId !== primaryTokenId && quantity !== '0',
      )
      .map(([tokenId, quantity]) => ({
        policyIdHex: toPolicyId(tokenId),
        assetNameHex: toAssetNameHex(tokenId),
        quantity,
      })),
  })
}

const _getBalance = (
  tokenId = '*',
  utxos: RawUtxo[],
  primaryTokenId: Portfolio.Token.Id,
): string => {
  if (tokenId === 'TADA' || tokenId === 'ADA') tokenId = '.'
  const amounts = Utxos.toAmounts(utxos, primaryTokenId)
  const assets = Object.keys(amounts)
    .filter((t) => {
      if (tokenId === '*') return true
      return t === tokenId
    })
    .map((tokenId) => {
      if (tokenId === '.' || tokenId === '' || tokenId === primaryTokenId)
        return null
      const {policyIdHex, assetNameHex} = identifierToAssetHex(tokenId)
      const amount = amounts[tokenId as Portfolio.Token.Id] as string
      return {policyIdHex, assetNameHex, quantity: amount}
    })

  return valueFromAmountsHex({
    coin: amounts[primaryTokenId] ?? Branded.ZERO_QUANTITY,
    assets: assets.filter(
      (asset): asset is NonNullable<typeof asset> => asset !== null,
    ),
  })
}

const _getUtxos = async (
  wallet: YoroiWallet,
  meta: Wallet.Meta,
  value?: string,
  pagination?: Pagination,
): Promise<string[] | null> => {
  const valueStr = value?.trim() ?? ''

  if (valueStr.length === 0) {
    const primaryTokenId = wallet.portfolioPrimaryTokenInfo.id
    const validUtxos = wallet.utxos().map((o) => {
      try {
        return cardanoUtxoFromRemoteFormat(
          rawUtxoToRemoteUnspentOutput(o, primaryTokenId),
          primaryTokenId,
        )
      } catch (error) {
        getLogger().error('Error converting UTXO to Cardano CBOR', {
          error: error instanceof Error ? error.message : String(error),
          utxoIndex: o.tx_index,
          utxoAmount: o.amount,
          utxoAssetsCount: o.assets?.length ?? 0,
          utxoReceiver: o.receiver,
          txHash: o.tx_hash,
          txIndex: o.tx_index,
        })
        throw error
      }
    })
    return paginate(validUtxos, pagination)
  }

  const amounts: Balance.Amounts = {}

  const isValueNumber = !isNaN(Number(valueStr))

  if (isValueNumber) {
    amounts[wallet.portfolioPrimaryTokenInfo.id] = asQuantity(valueStr)
  } else {
    try {
      Object.assign(
        amounts,
        getAmountsFromValue(valueStr, wallet.portfolioPrimaryTokenInfo.id),
      )
    } catch (error) {
      getLogger().error('cip30 Failed to parse value _getUtxos', {error})
    }
  }

  const validUtxos = await _getRequiredUtxos(
    wallet,
    amounts,
    wallet.utxos(),
    meta,
  )
  if (validUtxos === null) return null
  return paginate(validUtxos, pagination)
}

export const _getRequiredUtxos = async (
  wallet: YoroiWallet,
  amounts: Balance.Amounts,
  allUtxos: RawUtxo[],
  meta: Wallet.Meta,
): Promise<string[] | null> => {
  const primaryTokenId = wallet.portfolioPrimaryTokenInfo.id
  const remoteUnspentOutputs: RemoteUnspentOutput[] = allUtxos.map((utxo) =>
    rawUtxoToRemoteUnspentOutput(utxo, primaryTokenId),
  )
  const rewardAddressInfo = addressInfoFromAddress(wallet.rewardAddressHex)
  const rewardAddress = rewardAddressInfo.isValid
    ? rewardAddressInfo.bech32
    : undefined
  if (!rewardAddress) throw new Error('Invalid wallet state')

  try {
    const unsignedTx = await createSendTxFromWallet(wallet, {
      entries: [{address: Branded.asAddress(rewardAddress), amounts}],
      addressMode: meta.addressMode,
    })
    const requiredUtxos = findUtxosInUnsignedTx(
      unsignedTx,
      remoteUnspentOutputs,
    )
    const primaryTokenId = wallet.portfolioPrimaryTokenInfo.id
    return requiredUtxos.map((o) => {
      try {
        return cardanoUtxoFromRemoteFormat(o, primaryTokenId)
      } catch (error) {
        getLogger().error('Error converting UTXO to Cardano CBOR', {
          error: error instanceof Error ? error.message : String(error),
          utxoIndex: o.txIndex,
          utxoBalance: o.balance,
          utxoReceiver: o.receiver,
          txHash: o.txHash,
          txIndex: o.txIndex,
        })
        throw error
      }
    })
  } catch (e) {
    return null
  }
}

const rawUtxoToRemoteUnspentOutput = (
  utxo: RawUtxo,
  primaryTokenId: Portfolio.Token.Id,
): RemoteUnspentOutput => {
  // Convert to modern Balance.Amounts format
  const balance: Balance.Amounts = {
    [primaryTokenId]: utxo.amount as Balance.Quantity,
  }

  // Add other assets
  for (const asset of utxo.assets) {
    balance[asset.tokenId] = asset.amount as Balance.Quantity
  }

  return {
    txHash: utxo.tx_hash,
    txIndex: utxo.tx_index,
    receiver: utxo.receiver,
    utxoId: utxo.utxo_id,
    balance,
  }
}

const findUtxosInUnsignedTx = (
  unsignedTx: {cbor: string},
  utxos: RemoteUnspentOutput[],
) => {
  const transaction = JSON.parse(
    transactionReviewInfoJson(unsignedTx.cbor),
  ) as {
    body: {inputs: Array<{transactionIdHex: string; index: string}>}
  }
  return transaction.body.inputs.flatMap((input) => {
    const utxo = utxos.find(
      (candidate) =>
        candidate.txHash === input.transactionIdHex &&
        String(candidate.txIndex) === input.index,
    )
    return utxo ? [utxo] : []
  })
}

const paginate = <T>(
  items: T[],
  pagination?: {page: number; limit: number},
) => {
  return pagination
    ? items.slice(
        pagination.page * pagination.limit,
        (pagination.page + 1) * pagination.limit,
      )
    : items
}

const _drawCollateralInOneUtxo = (
  wallet: YoroiWallet,
  quantity: Balance.Quantity,
) => {
  const utxos = utxosMaker(wallet.utxos(), {
    maxLovelace: collateralConfig.maxLovelace,
    minLovelace: quantity,
    maxUTxOs: collateralConfig.maxUTxOs,
  })

  const possibleCollateralId = utxos.drawnCollateral()
  if (!possibleCollateralId) return null
  const collateralUtxo = utxos.findById(possibleCollateralId)
  if (!collateralUtxo) return null
  const primaryTokenId = wallet.portfolioPrimaryTokenInfo.id
  try {
    return cardanoUtxoFromRemoteFormat(
      rawUtxoToRemoteUnspentOutput(collateralUtxo, primaryTokenId),
      primaryTokenId,
    )
  } catch (error) {
    getLogger().error('Error converting collateral UTXO to Cardano CBOR', {
      error: error instanceof Error ? error.message : String(error),
      utxoIndex: collateralUtxo.tx_index,
      utxoAmount: collateralUtxo.amount,
      utxoAssetsCount: collateralUtxo.assets?.length ?? 0,
      utxoReceiver: collateralUtxo.receiver,
      txHash: collateralUtxo.tx_hash,
      txIndex: collateralUtxo.tx_index,
    })
    throw error
  }
}

const _drawCollateralInMultipleUtxos = async (
  wallet: YoroiWallet,
  meta: Wallet.Meta,
  quantity: Balance.Quantity,
) => {
  const possibleUtxos = findCollateralCandidates(wallet.utxos(), {
    maxLovelace: collateralConfig.maxLovelace,
    minLovelace: asQuantity('0'),
    maxUTxOs: collateralConfig.maxUTxOs,
  })

  const sortedFromMaxToMin = possibleUtxos.sort((a, b) => {
    const aAmount = new BigNumber(a.amount)
    const bAmount = new BigNumber(b.amount)
    return bAmount.comparedTo(aAmount) ?? 0
  })

  const utxosWithLimitAccounted = sortedFromMaxToMin.slice(
    0,
    collateralConfig.maxUTxOs,
  )

  const utxos = await _getRequiredUtxos(
    wallet,
    {[wallet.portfolioPrimaryTokenInfo.id]: quantity},
    utxosWithLimitAccounted,
    meta,
  )

  if (utxos !== null && utxos.length > 0) {
    return utxos
  }
  return null
}

const getAmountsFromValue = (value: string, primaryTokenId: string) => {
  const decoded: unknown = JSON.parse(valueFromHexInfoJson(value))
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    !('coin' in decoded) ||
    typeof decoded.coin !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(decoded.coin) ||
    !('assets' in decoded) ||
    !Array.isArray(decoded.assets)
  ) {
    throw new Error('Invalid CML value response')
  }
  const amounts: Balance.Amounts = {}

  amounts[primaryTokenId as Portfolio.Token.Id] = asQuantity(decoded.coin)
  for (const asset of decoded.assets) {
    if (
      typeof asset !== 'object' ||
      asset === null ||
      !('policyIdHex' in asset) ||
      typeof asset.policyIdHex !== 'string' ||
      !/^[0-9a-f]{56}$/i.test(asset.policyIdHex) ||
      !('assetNameHex' in asset) ||
      typeof asset.assetNameHex !== 'string' ||
      !/^(?:[0-9a-f]{2}){0,32}$/i.test(asset.assetNameHex) ||
      !('quantity' in asset) ||
      typeof asset.quantity !== 'string' ||
      !/^(0|[1-9][0-9]*)$/.test(asset.quantity)
    ) {
      throw new Error('Invalid CML value asset response')
    }
    const id =
      `${asset.policyIdHex}.${asset.assetNameHex}` as Portfolio.Token.Id
    amounts[id] = asQuantity(asset.quantity)
  }
  return amounts
}

const assertCollateralValue = (value: BigNumber) => {
  if (value.gt(new BigNumber(collateralConfig.maxLovelace))) {
    throw new Error('Collateral value is too high')
  }
}
