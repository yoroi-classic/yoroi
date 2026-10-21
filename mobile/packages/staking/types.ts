import {
  Addressing as AddressingType,
  Api as AppApi,
  Balance,
  CardanoAddressedUtxo as CardanoAddressedUtxoType,
  SignedTx as SignedTxType,
  StakingKeyBalances as StakingKeyBalancesType,
  TokenEntry as TokenEntryType,
  TxMetadata as TxMetadataType,
  UnsignedTx as UnsignedTxType,
} from '@yoroi/types'

import {WalletChecksum as WalletChecksumType} from '@emurgo/cip4-js'
import {AxiosRequestConfig} from 'axios'

/**
 * Staking info (UI state)
 */
export type StakingInfo =
  | {status: 'not-registered'}
  | {status: 'registered'}
  | {
      status: 'staked'
      poolId: string
      amount: Balance.Quantity
      rewards: Balance.Quantity
    }

/**
 * Staking status (delegation state)
 */
export type StakingStatus =
  | {isRegistered: false}
  | {isRegistered: true}
  | {
      isRegistered: true
      poolKeyHash: string
    }

export namespace CardanoTypes {
  export type TxMetadata = TxMetadataType
  export type CardanoAddressedUtxo = CardanoAddressedUtxoType
  export type SignedTx = SignedTxType
  export type UnsignedTx = UnsignedTxType
  export type MultiTokenValue = Balance.Amounts
  export type StakingKeyBalances = StakingKeyBalancesType
  export type WalletChecksum = WalletChecksumType

  export type Addressing = AddressingType
  export type PublicKey = {hash: () => {toHex: () => string}}
  export type TokenEntry = TokenEntryType
}

export namespace Catalyst {
  export type Api = Readonly<{
    getFundInfo: (
      fetcherConfig?: AxiosRequestConfig,
    ) => Promise<Readonly<AppApi.Response<FundInfo>>>
  }>

  export type Config = Readonly<{
    api: {
      fund: string
    }
    apps: {
      ios: string
      android: string
    }
    groups: {
      community: string
      announcements: string
    }
    media: {
      townhall: string
    }
    newsletter: string
    others: {
      ideascale: string
    }
  }>
  export type Manager = Readonly<{
    getFundInfo(): ReturnType<Api['getFundInfo']>
    fundStatus(fundInfo: FundInfo, when?: Date): FundStatus
    config: Config
  }>

  export type FundStatus = {
    registration: 'pending' | 'running' | 'done'
    voting: 'pending' | 'running' | 'done'
    results: 'pending' | 'running' | 'done'
  }

  export type FundInfo = {
    id: number
    fundName: string
    fundStartTime: Date
    fundEndTime: Date
    registrationSnapshotTime: Date
    challenges: Array<FundChallenge>
    snapshotStart: Date
    votingStart: Date
    votingEnd: Date
    tallyingEnd: Date
    resultsUrl: string
    surveyUrl: string
    votingPowerThreshold: number
  }

  export type FundChallenge = {
    id: number
    challengeType: string
    title: string
    description: string
    rewardsTotal: number
    proposersRewards: number
    challengeUrl: string
  }

  export type CatalystApiFundInfo = {
    id: number
    fund_name: string

    fund_goal: string // {timestamp: string, themes: Array<string>}

    voting_power_threshold: number
    fund_start_time: string
    fund_end_time: string
    next_fund_start_time: string
    registration_snapshot_time: string
    next_registration_snapshot_time: string
    chain_vote_plans: Array<CatalystApiChainVotePlan>
    challenges: Array<CatalystApiChallenge>
    insight_sharing_start: string
    proposal_submission_start: string
    refine_proposals_start: string
    finalize_proposals_start: string
    proposal_assessment_start: string
    assessment_qa_start: string
    snapshot_start: string
    voting_start: string
    voting_end: string
    tallying_end: string
    goals: Array<string>[]
    results_url: string
    survey_url: string
    next: CatalystApiFundNext
  }

  export type CatalystApiChainVotePlan = {
    id: number
    chain_voteplan_id: string
    chain_vote_start_time: string
    chain_vote_end_time: string
    chain_committee_end_time: string
    chain_voteplan_payload: string
    chain_vote_encryption_key: string
    fund_id: number
  }

  export type CatalystApiChallenge = {
    internal_id: number
    id: number
    challenge_type: string
    title: string
    description: string
    rewards_total: number
    proposers_rewards: number
    fund_id: number
    challenge_url: string
    highlights: unknown
  }

  export type CatalystApiFundNext = {
    id: number
    fund_name: string
    insight_sharing_start: string
    proposal_submission_start: string
    refine_proposals_start: string
    finalize_proposals_start: string
    proposal_assessment_start: string
    assessment_qa_start: string
    snapshot_start: string
    voting_start: string
    voting_end: string
    tallying_end: string
  }
}
