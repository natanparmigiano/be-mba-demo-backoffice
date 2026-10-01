export type PubSubMode = 'memory' | 'redis'

export interface PubSubMessage {
  channel: string
  value: string
}

export type PubSubHandler = (message: PubSubMessage) => Promise<void> | void
export type Unsubscribe = () => Promise<void>

export interface PubSub {
  readonly mode: PubSubMode
  subscribe(channel: string, handler: PubSubHandler): Promise<Unsubscribe>
  start(): Promise<void>
  publish(channel: string, value: string): Promise<void>
  close(): Promise<void>
}
