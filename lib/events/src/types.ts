export type EventBusMode = 'kafka' | 'memory' | 'sqs'
export type EventHeaders = Readonly<Record<string, string>>

export interface PublishOptions {
  headers?: EventHeaders
  key?: string
}

export interface EventMessage {
  headers: EventHeaders
  key: string | null
  timestamp: number
  topic: string
  value: string
}

export type EventHandler = (message: EventMessage) => Promise<void> | void
export type Unsubscribe = () => void

export interface EventBus {
  readonly mode: EventBusMode
  subscribe(topic: string, handler: EventHandler): Unsubscribe
  start(): Promise<void>
  publish(topic: string, value: string, options?: PublishOptions): Promise<void>
  close(): Promise<void>
}
