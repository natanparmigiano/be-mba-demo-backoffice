export function validateChannel(channel: string): void {
  if (!channel.trim()) throw new Error('Pub/sub channel cannot be empty')
}
