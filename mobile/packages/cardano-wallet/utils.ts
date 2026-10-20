import {RawUtxo} from '@yoroi/api'
import {primaryTokenId as defaultPrimaryTokenId} from '@yoroi/portfolio'
import {
  SendToken,
  TransactionOutput,
  normalizeToAddress,
  validateAndExtractAddressInfo,
} from '@yoroi/tx'
import {Balance, BaseAsset, Chain, Portfolio, Wallet} from '@yoroi/types'

import {
  addressToHex as cmlAddressToHex,
  rewardAddressDetailsFromAddress,
  rewardAddressFromAddress,
  rewardAddressHexFromAccountPublicKey,
  stakeCredentialHexFromAddress,
} from '@yoroi-classic/csl-mobile-bridge'
import {BigNumber} from 'bignumber.js'
import {Buffer} from 'buffer'

import {withMinAmounts} from './getMinAmounts'
import {CardanoTypes, YoroiWallet} from './types'
import {Amounts} from './utils/utils'
import {CardanoMobileWrapped} from './wrappedCsl'

export const deriveRewardAddressHex = (
  accountPubKeyHex: string,
  chainId: number,
  role: number,
  index: number,
): string => {
  return rewardAddressHexFromAccountPublicKey(
    accountPubKeyHex,
    chainId,
    role,
    index,
  )
}

export const deriveRewardAddressFromAddress = (
  address: string,
  chainId: number,
): string => {
  return rewardAddressFromAddress(address, chainId)
}

export const serializeAddressToHex = (address: string): string => {
  return cmlAddressToHex(address)
}

export const deriveStakeCredentialHex = (address: string): string => {
  return stakeCredentialHexFromAddress(address)
}

export const deriveRewardAddressDetails = (
  address: string,
): {bech32: string; keyHashHex: string} => {
  return rewardAddressDetailsFromAddress(address)
}

// matches RawUtxo and a tx input/output
type RemoteValue = {
  readonly amount: string
  readonly assets?: ReadonlyArray<BaseAsset>
}

export const amountsFromRemote = (
  remoteValue: RemoteValue,
): Balance.Amounts => {
  const amounts: Balance.Amounts = {} as Balance.Amounts

  // Add primary token (ADA)
  // remoteValue.amount is a string, Balance.Quantity is a branded string type
  amounts[defaultPrimaryTokenId] = remoteValue.amount as Balance.Quantity

  // Add other assets
  if (remoteValue.assets != null) {
    for (const token of remoteValue.assets) {
      // token.amount is now BalanceQuantity (String<'BalanceQuantity'>)
      amounts[token.tokenId as Portfolio.Token.Id] = token.amount
    }
  }

  return amounts
}

export const isByron = (implementation: Wallet.Implementation) =>
  implementation === 'cardano-bip44'

export const isShelley = (implementation: Wallet.Implementation) =>
  implementation === 'cardano-cip1852'

export const toSendTokenList = (
  amounts: Balance.Amounts,
  primaryTokenInfo: Portfolio.Token.Info,
): Array<SendToken> => {
  return Amounts.toArray(amounts).map(toSendToken(primaryTokenInfo))
}

export const toRecipients = async (
  entries: TransactionOutput[],
  primaryTokenInfo: Portfolio.Token.Info,
  protocolParams: Chain.Cardano.ProtocolParams,
) => {
  return Promise.all(
    entries.map(async (entry) => {
      const amounts = await withMinAmounts(
        entry.address,
        entry.amounts,
        primaryTokenInfo,
        protocolParams,
      )
      return {
        receiver: entry.address,
        tokens: toSendTokenList(amounts, primaryTokenInfo),
        datum: entry.datum,
      }
    }),
  )
}

export const toSendToken =
  (primaryTokenInfo: Portfolio.Token.Info) =>
  (amount: Balance.Amount | Portfolio.Token.Amount): SendToken => {
    let tokenId = ''
    let quantity = ''
    if ('info' in amount) {
      tokenId = amount.info.id
      quantity = amount.quantity.toString()
    } else {
      tokenId = amount.tokenId
      quantity = amount.quantity
    }

    const isPrimary = tokenId === primaryTokenInfo.id

    return {
      token: {
        identifier: tokenId as Portfolio.Token.Id,
        isDefault: isPrimary,
      },
      amount: new BigNumber(quantity),
      shouldSendAll: false,
    }
  }

export const isTokenInfo = (
  token: Balance.TokenInfo | Portfolio.Token.Info,
): token is Balance.TokenInfo => {
  return !!(token as Balance.TokenInfo).kind
}

export const generateCIP30UtxoCbor = (utxo: RawUtxo) => {
  return CardanoMobileWrapped.cslScope((csl) => {
    const txHash = csl.TransactionHash.fromBytes(
      Buffer.from(utxo.tx_hash, 'hex'),
    )
    if (!txHash) throw new Error('Invalid tx hash')

    const index = utxo.tx_index
    const input = csl.TransactionInput.new(txHash, index)
    // Use normalizeToAddress to handle Byron (base58), Shelley (bech32), and hex addresses
    const address = normalizeToAddress(csl, utxo.receiver)
    if (!address) throw new Error('Invalid address')

    const amount = csl.BigNum.fromStr(utxo.amount)
    if (!amount) throw new Error('Invalid amount')

    const collateral = csl.Value.new(amount)
    const output = csl.TransactionOutput.new(address, collateral)
    const transactionUnspentOutput = csl.TransactionUnspentOutput.new(
      input,
      output,
    )

    return transactionUnspentOutput.toHex()
  })
}

export const copyFromCSL = <T extends {toHex: () => string}>(
  creator: {fromHex: (hex: string) => T},
  value: T,
): T => {
  return creator.fromHex(value.toHex())
}

export const copyMultipleFromCSL = <T extends {toHex: () => string}>(
  items: T[],
  creator: {fromHex: (hex: string) => T},
) => {
  return items.map((item) => copyFromCSL(creator, item))
}

export const getHexAddressingMap = async (wallet: YoroiWallet) => {
  const addressedUtxos = await Promise.all(
    wallet.utxos().map(async (utxo: RawUtxo) => {
      const addressing = wallet.getAddressing(utxo.receiver)
      // Use validateAndExtractAddressInfo to safely extract hex without WASM pointer issues
      const addressInfo = await validateAndExtractAddressInfo(utxo.receiver)
      const hexAddress = addressInfo?.hex

      return {addressing, hexAddress}
    }),
  )

  const addressing = addressedUtxos
  return addressing.reduce<{[addressHex: string]: Array<number>}>(
    (acc, curr) => {
      if (!curr.hexAddress) return acc
      acc[curr.hexAddress] = curr.addressing.path
      return acc
    },
    {},
  )
}

/**
 * Builds a stake address map for hardware wallet signing.
 * Includes the reward address mapped to its staking derivation path.
 * This is required for withdrawals in ORDINARY_TRANSACTION mode,
 * which must use KEY_PATH instead of KEY_HASH.
 */
export const getStakeAddressMap = (
  rewardAddressHex: string | undefined,
  stakingDerivationPath: number[] | undefined,
): {[addressHex: string]: Array<number>} => {
  const stakeAddressMap: {[addressHex: string]: Array<number>} = {}

  // Add reward address if both reward address and staking derivation path are available
  if (stakingDerivationPath && rewardAddressHex) {
    stakeAddressMap[rewardAddressHex] = stakingDerivationPath
  }

  return stakeAddressMap
}

export const getAddressedUtxos = (wallet: YoroiWallet) => {
  // Use wallet.utxos to exclude collateral UTXO from transaction operations
  // Collateral should not be used in regular transactions
  const primaryTokenId = wallet.portfolioPrimaryTokenInfo.id
  return wallet
    .utxos()
    .map((utxo: RawUtxo): CardanoTypes.CardanoAddressedUtxo => {
      const addressing = wallet.getAddressing(utxo.receiver)

      // Convert to modern Balance.Amounts format
      const balance: Balance.Amounts = {
        [primaryTokenId]: utxo.amount as Balance.Quantity,
      }
      for (const asset of utxo.assets) {
        balance[asset.tokenId] = asset.amount as Balance.Quantity
      }

      return {
        addressing,
        txIndex: utxo.tx_index,
        txHash: utxo.tx_hash,
        receiver: utxo.receiver,
        utxoId: utxo.utxo_id,
        balance,
      }
    })
}

export const getPublicKeyHex = (wallet: YoroiWallet) => {
  const pkBytes = wallet.getStakingKey().hash().toBytes()
  return Buffer.from(pkBytes).toString('hex')
}
