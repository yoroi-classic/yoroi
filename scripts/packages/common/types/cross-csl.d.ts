declare module '@emurgo/cross-csl-core' {
  export type Transaction = any
  export type TransactionBody = any
  export type WasmModuleProxy = Record<string, any>
}

declare module '@emurgo/cross-csl-mobile' {
  import type {WasmModuleProxy} from '@emurgo/cross-csl-core'

  export function init(scope: string): WasmModuleProxy
}
