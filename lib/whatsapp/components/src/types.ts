export interface ComponentsRequestOptions {
  signal?: AbortSignal
}

export interface ConversationalCommand {
  command_name: string
  command_description: string
  [key: string]: unknown
}

/** Icebreakers are named `prompts` by the Graph API. */
export type Icebreaker = string

export interface ConversationalComponents {
  commands?: ConversationalCommand[]
  prompts?: Icebreaker[]
  [key: string]: unknown
}

export interface WriteConversationalComponentsInput {
  commands?: ConversationalCommand[]
  prompts?: Icebreaker[]
}

export interface SuccessResponse {
  success: true
}
