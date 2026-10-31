import {RawUtxo} from '@yoroi/api'
import {YoroiWallet} from '@yoroi/cardano-wallet'
import {deriveRewardAddressFromAddress} from '@yoroi/cardano-wallet'
import {asQuantity} from '@yoroi/cardano-wallet'
import {isNonNullable} from '@yoroi/common'
import {decodeDatum, decodeDatumToJson} from '@yoroi/tx'
import {Api, Branded, Network, Portfolio} from '@yoroi/types'
import {useSelectedNetwork} from '@yoroi/wallet-manager'
import {useSelectedWallet} from '@yoroi/wallet-manager'

import {
  addressInfoFromAddress,
  datumInfoFromOutputCborHex,
} from '@yoroi-classic/cml-mobile-bridge'
import * as _ from 'lodash'
import * as React from 'react'

import {usePortfolioTokenInfos} from '~/features/Portfolio/common/hooks/usePortfolioTokenInfos'

import {
  AddressCredentialKind as AddressCredentialKindCode,
  addressCredentialKindFromHex,
} from '../address-kind'
import type {AddressCredentialKind} from '../address-kind'
import {
  CmlReviewOutput,
  CmlTransactionReviewInfo,
  FormattedCertificate,
  FormattedFee,
  FormattedInputs,
  FormattedOutputs,
  FormattedTx,
  FormattedWithdrawals,
  FormattedWitnessSet,
  TransactionBody,
  TransactionInputs,
} from '../types'

export const useFormattedTx = (
  data: TransactionBody,
): {
  formattedTx: FormattedTx | null
  isLoading: boolean
  areTokenInfosLoaded: boolean
  error: Error | null
} => {
  const {wallet} = useSelectedWallet()

  const inputs = React.useMemo(() => data?.inputs ?? [], [data?.inputs])
  const outputs = React.useMemo(() => data?.outputs ?? [], [data?.outputs])
  const referenceInputs = React.useMemo(
    () => data?.reference_inputs ?? [],
    [data?.reference_inputs],
  )

  const inputUtxosResult = useUtxos(inputs, wallet)
  const referenceInputUtxosResult = useUtxos(referenceInputs, wallet)

  const isLoading =
    inputUtxosResult.isLoading || referenceInputUtxosResult.isLoading
  const error = inputUtxosResult.error || referenceInputUtxosResult.error

  const inputTokenIds = inputs.flatMap((i) => {
    const utxo = inputUtxosResult.data.find(
      (utxo: RawUtxo) =>
        utxo?.tx_hash === i.transaction_id && utxo?.tx_index === i.index,
    )
    return utxo?.assets.map((a) => a.tokenId) ?? []
  })

  const referenceInputTokenIds = referenceInputs.flatMap((i) => {
    const utxo = referenceInputUtxosResult.data.find(
      (utxo: RawUtxo) =>
        utxo?.tx_hash === i.transaction_id && utxo?.tx_index === i.index,
    )
    return utxo?.assets.map((a) => a.tokenId) ?? []
  })

  // Output quantities and asset names come directly from CML's normalized DTO.
  const outputTokenIds = React.useMemo(() => {
    const cmlOutputs = data.cmlReviewInfo?.body.outputs
    if (cmlOutputs)
      return cmlOutputs.flatMap((output) =>
        output.assets.map(
          (asset) =>
            `${asset.policyIdHex}.${asset.assetNameHex}` as Portfolio.Token.Id,
        ),
      )
    return outputs.flatMap((o) => {
      if (!o.amount.multiasset) return []
      const policyIds = Object.keys(o.amount.multiasset)
      return policyIds.flatMap((policyId) => {
        const assetIds = Object.keys(o.amount.multiasset?.[policyId] ?? {})
        return assetIds.map((assetId) => {
          // Asset names are already represented as hexadecimal JSON keys.
          return `${policyId}.${assetId}` as Portfolio.Token.Id
        })
      })
    })
  }, [data.cmlReviewInfo, outputs])

  const mintTokenIds = React.useMemo(() => {
    // Use JSON parsing for mint (mint.keys() doesn't exist on MintsAssets type)
    return (
      data.mint?.map(([policyId, asset]) => {
        const assetNameHex = Object.keys(asset)[0] ?? ''
        return `${policyId}.${assetNameHex}` as Portfolio.Token.Id
      }) ?? []
    )
  }, [data.mint])

  const tokenIds = _.uniq<Portfolio.Token.Id>([
    ...inputTokenIds,
    ...outputTokenIds,
    ...mintTokenIds,
    ...referenceInputTokenIds,
  ])
  const {tokenInfos, isLoading: isTokenInfosLoading} = usePortfolioTokenInfos({
    wallet,
    tokenIds,
  })

  if (error) {
    return {
      formattedTx: null,
      isLoading: false,
      areTokenInfosLoaded: !isTokenInfosLoading,
      error,
    }
  }

  if (isLoading) {
    return {
      formattedTx: null,
      isLoading: true,
      areTokenInfosLoaded: !isTokenInfosLoading,
      error: null,
    }
  }

  const reviewInfo = data.cmlReviewInfo
  const formattedOutputs: FormattedOutputs = reviewInfo
    ? formatCmlOutputs(
        wallet,
        reviewInfo.transactionIdHex,
        reviewInfo.body.outputs,
        tokenInfos,
      )
    : formatLegacyOutputs(wallet, outputs, tokenInfos)

  const formattedInputs: FormattedInputs = formatInputs(
    wallet,
    tokenInfos,
    inputUtxosResult.data,
  )
  const formattedReferenceInputs: FormattedInputs = formatInputs(
    wallet,
    tokenInfos,
    referenceInputUtxosResult.data,
  )
  const formattedFee = formatFee(wallet, data)
  const formattedCertificates = formatCertificates(data.certs)
  const formattedMintData = formatMintData(data.mint, tokenInfos)

  // Extract all missing transaction body fields
  const formattedWithdrawals = reviewInfo
    ? formatCmlWithdrawals(wallet, reviewInfo)
    : null
  const formattedCollateral = reviewInfo
    ? formatCmlInputs(wallet, tokenInfos, reviewInfo)
    : null
  const formattedCollateralReturn = reviewInfo?.body.collateralReturn
    ? formatCmlOutput(
        wallet,
        reviewInfo.transactionIdHex,
        reviewInfo.body.collateralReturn,
        tokenInfos,
        reviewInfo.body.outputs.length,
      )
    : null
  const formattedTotalCollateral =
    reviewInfo?.body.totalCollateral != null
      ? {
          tokenInfo: wallet.portfolioPrimaryTokenInfo,
          quantity: asQuantity(reviewInfo.body.totalCollateral),
        }
      : null
  const formattedRequiredSigners = reviewInfo?.body.requiredSigners ?? null
  const formattedScriptDataHash = reviewInfo?.body.scriptDataHashHex ?? null
  const formattedTtl = safeNumber(reviewInfo?.body.ttl)
  const formattedValidityIntervalStart = safeNumber(
    reviewInfo?.body.validityIntervalStart,
  )
  const formattedNetworkId = safeNumber(reviewInfo?.body.networkId)
  const formattedWitnessSet = reviewInfo
    ? formatCmlWitnessSet(reviewInfo)
    : null
  const governance = null
  const chainInfo: FormattedTx['chainInfo'] = reviewInfo
    ? {isChained: false}
    : null

  return {
    formattedTx: {
      inputs: formattedInputs,
      outputs: formattedOutputs,
      fee: formattedFee,
      certificates: formattedCertificates,
      mint: formattedMintData,
      referenceInputs: formattedReferenceInputs,
      withdrawals: formattedWithdrawals,
      collateral: formattedCollateral,
      collateralReturn: formattedCollateralReturn,
      totalCollateral: formattedTotalCollateral,
      requiredSigners: formattedRequiredSigners,
      scriptDataHash: formattedScriptDataHash,
      ttl: formattedTtl,
      validityIntervalStart: formattedValidityIntervalStart,
      networkId: formattedNetworkId,
      witnessSet: formattedWitnessSet,
      governance,
      chainInfo,
    },
    isLoading: false,
    areTokenInfosLoaded: !isTokenInfosLoading,
    error: null,
  }
}

const formatInputs = (
  wallet: YoroiWallet,
  tokenInfos: Map<Portfolio.Token.Id, Portfolio.Token.Info> | undefined,
  inputUtxos: RawUtxo[],
): FormattedInputs => {
  return inputUtxos.map((utxo: RawUtxo) => {
    const address = utxo?.receiver
    const coin = utxo?.amount != null ? asQuantity(utxo.amount) : null

    const addressKind = address != null ? getAddressKind(address) : null
    const rewardAddress =
      address != null && addressKind === AddressCredentialKindCode.Key
        ? deriveAddress(address, wallet.networkManager.chainId)
        : null

    const primaryAssets =
      coin != null
        ? [
            {
              tokenInfo: wallet.portfolioPrimaryTokenInfo,
              quantity: coin,
            },
          ]
        : []

    const multiAssets =
      utxo?.assets
        .map((a) => {
          if (a == null) return null
          const tokenInfo = tokenInfos?.get(a.tokenId)
          if (!tokenInfo) return null
          const quantity = asQuantity(a.amount)

          return {
            tokenInfo,
            quantity: quantity,
          }
        })
        .filter(Boolean) ?? []

    return {
      assets: [...primaryAssets, ...multiAssets].filter(isNonNullable),
      address,
      addressKind: addressKind ?? null,
      rewardAddress,
      ownAddress: address != null ? isOwnedAddress(wallet, address) : null,
      txIndex: utxo.tx_index,
      txHash: utxo.tx_hash,
    }
  })
}

const formatLegacyOutputs = (
  wallet: YoroiWallet,
  outputs: TransactionBody['outputs'],
  tokenInfos: Map<Portfolio.Token.Id, Portfolio.Token.Info> | undefined,
): FormattedOutputs =>
  outputs.map((output) => {
    const address = output.address
    const coin = asQuantity(output.amount.coin)

    const addressKind = getAddressKind(address)
    const rewardAddress =
      addressKind === AddressCredentialKindCode.Key
        ? deriveAddress(address, wallet.networkManager.chainId)
        : null

    const primaryAssets = [
      {
        tokenInfo: wallet.portfolioPrimaryTokenInfo,
        quantity: coin,
      },
    ]

    const multiAssets = output.amount.multiasset
      ? Object.entries(output.amount.multiasset).flatMap(
          ([policyId, assets]) => {
            return Object.entries(assets as Record<string, string>).map(
              ([assetId, amount]) => {
                // Asset names are already represented as hexadecimal JSON keys.
                const tokenId = `${policyId}.${assetId}` as Portfolio.Token.Id
                const tokenInfo = tokenInfos?.get(tokenId)
                if (tokenInfo == null) return null
                const quantity = asQuantity(amount)

                return {
                  tokenInfo,
                  quantity,
                }
              },
            )
          },
        )
      : []

    const assets = [...primaryAssets, ...multiAssets].filter(isNonNullable)

    return {
      assets,
      address,
      addressKind,
      rewardAddress,
      ownAddress: isOwnedAddress(wallet, address),
    }
  })

const formatCmlOutputs = (
  wallet: YoroiWallet,
  transactionIdHex: string,
  outputs: CmlReviewOutput[],
  tokenInfos: Map<Portfolio.Token.Id, Portfolio.Token.Info> | undefined,
): FormattedOutputs =>
  outputs.map((output, index) =>
    formatCmlOutput(wallet, transactionIdHex, output, tokenInfos, index),
  )

export const formatCmlOutput = (
  wallet: YoroiWallet,
  transactionIdHex: string,
  output: CmlReviewOutput,
  tokenInfos: Map<Portfolio.Token.Id, Portfolio.Token.Info> | undefined,
  index = 0,
): FormattedOutputs[number] => {
  const address = output.address ?? output.addressHex
  const addressKind = getAddressKind(address)
  const datumInfo = JSON.parse(datumInfoFromOutputCborHex(output.cborHex)) as {
    type: 'hash' | 'inline' | 'embedded'
    hash: string
    data?: string
  } | null
  const decoded = datumInfo?.data ? decodeDatum(datumInfo.data) : null
  const script = output.scriptRef
  return {
    assets: [
      {
        tokenInfo: wallet.portfolioPrimaryTokenInfo,
        quantity: asQuantity(output.lovelace),
      },
      ...output.assets.flatMap((asset) => {
        const tokenInfo = tokenInfos?.get(
          `${asset.policyIdHex}.${asset.assetNameHex}` as Portfolio.Token.Id,
        )
        return tokenInfo
          ? [{tokenInfo, quantity: asQuantity(asset.quantity)}]
          : []
      }),
    ],
    address,
    addressKind,
    rewardAddress:
      addressKind === AddressCredentialKindCode.Key
        ? deriveAddress(address, wallet.networkManager.chainId)
        : null,
    ownAddress: isOwnedAddress(wallet, address),
    datum: datumInfo
      ? {
          type: datumInfo.type,
          hash: datumInfo.hash,
          data: datumInfo.data,
          decoded,
          json:
            decoded && datumInfo.data
              ? decodeDatumToJson({
                  type: datumInfo.type,
                  hash: datumInfo.hash,
                  data: datumInfo.data,
                })
              : null,
        }
      : null,
    referenceScript: script
      ? {
          txHash: Branded.asTransactionHash(transactionIdHex),
          txIndex: index,
          scriptHash: Branded.asScriptHash(script.hashHex),
          scriptType: script.type.startsWith('native') ? 'native' : 'plutus',
          scriptSize: safeNumber(script.size) ?? 0,
        }
      : null,
  }
}

const safeNumber = (value: string | null | undefined): number | null => {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export const formatCmlWithdrawals = (
  wallet: YoroiWallet,
  info: CmlTransactionReviewInfo,
): FormattedWithdrawals | null => {
  const formatted = (info.body.withdrawals ?? []).map((item) => ({
    address: item.rewardAddress,
    amount: asQuantity(item.amount),
    tokenInfo: wallet.portfolioPrimaryTokenInfo,
  }))
  return formatted.length > 0 ? formatted : null
}

const formatCmlInputs = (
  wallet: YoroiWallet,
  tokenInfos: Map<Portfolio.Token.Id, Portfolio.Token.Info> | undefined,
  info: CmlTransactionReviewInfo,
): FormattedInputs | null => {
  const collateral = info.body.collateralInputs ?? []
  const utxos = collateral.flatMap((input) => {
    const txIndex = safeNumber(input.index)
    if (txIndex == null) return []
    const utxo = wallet
      .utxos()
      .find(
        (item) =>
          item.tx_hash === input.transactionIdHex && item.tx_index === txIndex,
      )
    return utxo ? [utxo] : []
  })
  return collateral.length > 0 ? formatInputs(wallet, tokenInfos, utxos) : null
}

export const formatCmlWitnessSet = (
  info: CmlTransactionReviewInfo,
): FormattedWitnessSet | null => {
  const witness = info.witnessSet
  const formatted: FormattedWitnessSet = {
    vkeys: witness.vkeys.map(({publicKeyHex, signatureHex}) => ({
      publicKey: publicKeyHex,
      signature: signatureHex,
    })),
    bootstraps: witness.bootstraps.map(
      ({publicKeyHex, signatureHex, chainCodeHex, attributes}) => ({
        publicKey: publicKeyHex,
        signature: signatureHex,
        chaincode: chainCodeHex,
        attributes:
          typeof attributes === 'string'
            ? attributes
            : JSON.stringify(attributes),
      }),
    ),
    nativeScripts: witness.nativeScripts.map(({hashHex}) => ({
      scriptHash: hashHex,
    })),
    plutusScripts: witness.plutusScripts.map(({hashHex, bytesHex}) => ({
      scriptHash: hashHex,
      scriptBytes: bytesHex,
    })),
    plutusData: witness.plutusDataCborHex.map((data) => ({data})),
  }
  return Object.values(formatted).some((items) => items.length > 0)
    ? formatted
    : null
}

export const formatFee = (
  wallet: YoroiWallet,
  data: TransactionBody,
): FormattedFee => {
  const fee = asQuantity(data?.fee ?? Branded.ZERO_QUANTITY)

  return {
    tokenInfo: wallet.portfolioPrimaryTokenInfo,
    quantity: fee,
  }
}

const formatCertificates = (certificates: TransactionBody['certs']) => {
  if (!certificates) return null

  const formatted = certificates
    .map((cert) => {
      const entry = Object.entries(cert)[0]
      if (entry == null) return null
      const [type, certificate] = entry
      return {type, value: certificate} as FormattedCertificate
    })
    .filter(isNonNullable)

  return formatted
}

const formatMintData = (
  mintData: TransactionBody['mint'] | null,
  tokenInfos: Map<Portfolio.Token.Id, Portfolio.Token.Info> | undefined,
) => {
  if (mintData == null) return null
  return (mintData?.flatMap(([policyId, tokens]) =>
    Object.entries(tokens)
      .map(([assetNameHex, count]) => {
        // Asset names are already represented as hexadecimal JSON keys.
        const tokenId = `${policyId}.${assetNameHex}` as Portfolio.Token.Id
        return [tokenInfos?.get(tokenId), count] as const
      })
      .filter(([tokenInfo]) => tokenInfo != null),
  ) ?? []) as Array<[Portfolio.Token.Info, string]>
}

const deriveAddress = (address: string, chainId: number) => {
  try {
    return deriveRewardAddressFromAddress(address, chainId)
  } catch {
    return null
  }
}

const getAddressKind = (addressBech32: string): AddressCredentialKind => {
  try {
    const {hex, isValid} = addressInfoFromAddress(addressBech32)
    if (!isValid) return null
    return addressCredentialKindFromHex(hex)
  } catch {
    return null
  }
}

export const useUtxos = (inputs: TransactionInputs, wallet: YoroiWallet) => {
  const {networkManager} = useSelectedNetwork()

  const [utxos, setUtxos] = React.useState<RawUtxo[]>([])
  const [isLoaded, setIsLoaded] = React.useState(false)
  const [error, setError] = React.useState<Error | null>(null)

  const inputsRef = React.useRef<TransactionInputs>([])
  const stableInputs = React.useMemo(() => {
    const inputsKey = inputs
      .map((input) => `${input.transaction_id}:${input.index}`)
      .join(',')
    const prevInputsKey = inputsRef.current
      .map((input) => `${input.transaction_id}:${input.index}`)
      .join(',')

    if (inputsKey !== prevInputsKey) {
      inputsRef.current = inputs
    }

    return inputsRef.current
  }, [inputs])

  React.useEffect(() => {
    let isMounted = true

    if (!wallet || !networkManager) {
      if (isMounted) {
        setUtxos([])
        setIsLoaded(true)
        setError(null)
      }
      return
    }

    if (stableInputs.length === 0) {
      if (isMounted) {
        setUtxos([])
        setIsLoaded(true)
        setError(null)
      }
      return
    }

    if (isMounted) {
      setIsLoaded(false)
      setError(null)
    }

    const fetchUtxos = async () => {
      try {
        const result = await getAllUtxos(
          stableInputs,
          wallet,
          networkManager.api.utxoData,
        )

        if (isMounted) {
          setUtxos(result)
          setIsLoaded(true)
          setError(null)
        }
      } catch (fetchError) {
        if (isMounted) {
          setUtxos([])
          setIsLoaded(true)
          setError(fetchError as Error)
        }
      }
    }

    fetchUtxos()

    return () => {
      isMounted = false
    }
  }, [stableInputs, wallet, networkManager])

  return {
    data: utxos,
    isLoading: !isLoaded && stableInputs.length > 0,
    error,
  }
}

const getAllUtxos = async (
  inputs: TransactionInputs,
  wallet: YoroiWallet,
  getUtxoData: Network.Api['utxoData'],
) => {
  try {
    const promises = inputs.map((input: TransactionInputs[0]) => {
      return getUtxo(wallet, input.transaction_id, input.index, getUtxoData)
    })
    const result = await Promise.all(promises)

    return result ?? []
  } catch (fetchError) {
    throw fetchError
  }
}

const getUtxo = async (
  wallet: YoroiWallet,
  txHash: string,
  txIndex: number,
  getUtxoData: Network.Api['utxoData'],
) => {
  const internalUtxo = wallet
    .utxos()
    .find((u) => u.tx_hash === txHash && u.tx_index === txIndex)

  if (!internalUtxo) {
    try {
      const externalUtxo = await getUtxoData({txHash, txIndex})

      if (externalUtxo == null) {
        throw new Error(`useUtxos: utxo not found for ${txHash}:${txIndex}`)
      }

      const rawUtxo = toRawUtxo(externalUtxo, txHash, txIndex)
      return rawUtxo
    } catch (error) {
      throw error
    }
  }

  return internalUtxo
}

function toRawUtxo(
  utxosData: Api.Cardano.UtxoData,
  txHash: string,
  txIndex: number,
): RawUtxo {
  const {address, amount, assets} = utxosData.output

  // Convert backend response (with assetId) to internal format (with tokenId)
  // assetId from backend is already the full token ID in format policyId.assetNameHex
  const mappedAssets = assets.map((asset) => ({
    amount: Branded.asBalanceQuantity(asset.amount),
    tokenId: asset.assetId as Portfolio.Token.Id,
    policyId: Branded.asPolicyId(asset.policyId),
    name: asset.name,
  }))

  const txHashBranded = Branded.asTransactionHash(txHash)
  return {
    amount: Branded.asBalanceQuantity(amount),
    receiver: Branded.asAddress(address),
    tx_hash: txHashBranded,
    tx_index: txIndex,
    utxo_id: Branded.asUtxoIdFromParts(txHashBranded, txIndex),
    assets: mappedAssets,
  }
}

const isOwnedAddress = (wallet: YoroiWallet, bech32Address: string) => {
  return (
    wallet.internalAddresses().includes(Branded.asAddress(bech32Address)) ||
    wallet.externalAddresses().includes(Branded.asAddress(bech32Address))
  )
}
