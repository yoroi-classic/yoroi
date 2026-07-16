declare module '@yoroi/logger' {
  export type Logger = {
    warn: (message: string) => void
  }

  export const getLogger: () => Logger
}
