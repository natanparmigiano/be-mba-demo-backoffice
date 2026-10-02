import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../../../api'
import { Input, Select, Textarea } from '../../ui'
import {
  PlaygroundOperationCard,
  type PlaygroundOperationState,
} from '../PlaygroundOperationCard'
import type { PlaygroundRequestExample } from '../PlaygroundRequestActions'

type Props = {
  channelId: string
  phoneNumberId: string
  businessId: string
  mutationDisabled: boolean
}
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
type ValueMap = Record<string, string>
type Field = {
  name: string
  label: string
  initial?: string
  required?: boolean
  kind?: 'input' | 'textarea' | 'json' | 'select' | 'file'
  options?: readonly string[]
}
type Action =
  | 'listSkills'
  | 'getSkill'
  | 'createSkill'
  | 'updateSkill'
  | 'deleteSkill'
  | 'listUiSkills'
  | 'getUiSkill'
  | 'createUiSkill'
  | 'updateUiSkill'
  | 'deleteUiSkill'
  | 'getBusinessInfo'
  | 'replaceBusinessInfo'
  | 'resetBusinessInfo'
  | 'listFaqs'
  | 'getFaq'
  | 'createFaq'
  | 'updateFaq'
  | 'deleteFaq'
  | 'listKnowledgeFiles'
  | 'getKnowledgeFile'
  | 'deleteKnowledgeFile'
  | 'listKnowledgeWebsites'
  | 'getKnowledgeWebsite'
  | 'createKnowledgeWebsite'
  | 'updateKnowledgeWebsite'
  | 'deleteKnowledgeWebsite'

const descriptions: Record<string, string> = {
  'List Agent Instructions':
    'Lists the instructions currently available to the Business Agent.',
  'Get Agent Instruction':
    'Retrieves one Business Agent instruction by its identifier.',
  'Create Agent Instruction':
    'Creates a reusable instruction with the supplied title and content.',
  'Update Agent Instruction':
    'Updates the title or content of an existing instruction.',
  'Delete Agent Instruction': 'Deletes an instruction from the Business Agent.',
  'List UI Skills':
    'Lists the interactive-message skills configured for the Business Agent.',
  'Get UI Skill': 'Retrieves one interactive-message skill by its identifier.',
  'Create UI Skill':
    'Creates an interactive-message skill from its name and configuration.',
  'Update UI Skill':
    'Updates an existing interactive-message skill configuration.',
  'Delete UI Skill':
    'Deletes an interactive-message skill from the Business Agent.',
  'Get Business Info':
    'Retrieves the business information used by the Business Agent.',
  'Replace Business Info':
    'Replaces the Business Agent business information with the supplied profile.',
  'Reset Business Info':
    'Resets the Business Agent business information to its default state.',
  'List FAQs':
    'Lists the frequently asked questions in the Business Agent knowledge base.',
  'Get FAQ': 'Retrieves one frequently asked question by its identifier.',
  'Create FAQ': 'Adds a question-and-answer pair to the knowledge base.',
  'Update FAQ': 'Updates an existing knowledge-base question and answer.',
  'Delete FAQ': 'Deletes a frequently asked question from the knowledge base.',
  'List Knowledge Files':
    'Lists files uploaded to the Business Agent knowledge base.',
  'Get Knowledge File':
    'Retrieves metadata and processing status for one knowledge file.',
  'Upload Knowledge File':
    'Uploads a file for extraction into the Business Agent knowledge base.',
  'Delete Knowledge File':
    'Deletes an uploaded file from the Business Agent knowledge base.',
  'List Knowledge Websites':
    'Lists websites indexed by the Business Agent knowledge base.',
  'Get Knowledge Website': 'Retrieves one indexed website by its identifier.',
  'Add Knowledge Website':
    'Adds a website for crawling and knowledge extraction.',
  'Update Knowledge Website':
    'Updates the URL or configuration of an indexed website.',
  'Delete Knowledge Website':
    'Removes a website from the Business Agent knowledge base.',
}

type Definition = {
  title: string
  method: Method
  action: Action | 'uploadKnowledgeFile'
  path: (phone: string, values: ValueMap) => string
  fields: readonly Field[]
  mutation?: boolean
  args?: (values: ValueMap) => unknown[]
  options?: (values: ValueMap) => Record<string, unknown>
  body?: (values: ValueMap) => unknown
  query?: (values: ValueMap) => Record<string, unknown>
  /** Values used only by copied code and OpenAPI exports when a form field is empty. */
  exportFallbacks?: Readonly<ValueMap>
}

const idField = (name: string, label: string): Field => ({
  name,
  label,
  required: true,
})
const text = (name: string, label: string, initial = ''): Field => ({
  name,
  label,
  initial,
  required: true,
})
const json = (name: string, label: string, initial: unknown): Field => ({
  name,
  label,
  initial: JSON.stringify(initial, null, 2),
  kind: 'json',
})
const optionalText = (name: string, label: string, initial = ''): Field => ({
  name,
  label,
  initial,
})
const compact = (entries: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(entries).filter(([, entry]) => entry !== ''),
  )
const endpoint = (phone: string, ...parts: string[]) =>
  `https://api.facebook.com/${[phone || 'PHONE_NUMBER_ID', ...parts]
    .map(encodeURIComponent)
    .join('/')}`
const resourcePath =
  (...parts: string[]) =>
  (phone: string) =>
    endpoint(phone, ...parts)
const skillPath = (phone: string, values: ValueMap) =>
  endpoint(phone, 'agent_config', 'skills', value(values, 'skillId'))
const faqPath = (phone: string, values: ValueMap) =>
  endpoint(phone, 'agent_config', 'faq', value(values, 'faqId'))
const filePath = (phone: string, values: ValueMap) =>
  endpoint(phone, 'agent_config', 'files', value(values, 'fileId'))
const websitePath = (phone: string, values: ValueMap) =>
  endpoint(phone, 'agent_config', 'websites', value(values, 'websiteId'))

const instructionFields = [
  optionalText('title', 'Title', 'greeting-skill'),
  optionalText(
    'description',
    'Description',
    'Apply when the customer first messages the agent.',
  ),
  {
    ...optionalText(
      'skill',
      'Instruction',
      'Greet the customer warmly, identify the business, and ask how you can help.',
    ),
    kind: 'textarea' as const,
  },
] as const
const instructionBody = (v: ValueMap) => ({
  ...compact({ title: v.title, description: v.description, skill: v.skill }),
})
const agentIdField = optionalText('agentId', 'Agent settings ID (optional)')

const instructions: readonly Definition[] = [
  {
    title: 'List Agent Instructions',
    method: 'GET',
    action: 'listSkills',
    path: resourcePath('agent_config', 'skills'),
    fields: [agentIdField],
    exportFallbacks: { agentId: '{{MBA-Agent-ID}}' },
    query: (v) => compact({ agent_id: v.agentId }),
    options: (v) => compact({ agentId: v.agentId }),
  },
  {
    title: 'Get Agent Instruction',
    method: 'GET',
    action: 'getSkill',
    path: skillPath,
    fields: [idField('skillId', 'Skill ID')],
    exportFallbacks: { skillId: '{{MBA-Skill-ID}}' },
    args: (v) => [v.skillId],
  },
  {
    title: 'Create Agent Instruction',
    method: 'POST',
    action: 'createSkill',
    path: resourcePath('agent_config', 'skills'),
    fields: [...instructionFields, agentIdField],
    exportFallbacks: { agentId: '{{MBA-Agent-ID}}' },
    mutation: true,
    body: instructionBody,
    args: (v) => [instructionBody(v)],
    query: (v) => compact({ agent_id: v.agentId }),
    options: (v) => compact({ agentId: v.agentId }),
  },
  {
    title: 'Update Agent Instruction',
    method: 'PUT',
    action: 'updateSkill',
    path: skillPath,
    fields: [idField('skillId', 'Skill ID'), ...instructionFields],
    exportFallbacks: { skillId: '{{MBA-Skill-ID}}' },
    mutation: true,
    body: instructionBody,
    args: (v) => [v.skillId, instructionBody(v)],
  },
  {
    title: 'Delete Agent Instruction',
    method: 'DELETE',
    action: 'deleteSkill',
    path: skillPath,
    fields: [idField('skillId', 'Skill ID')],
    exportFallbacks: { skillId: '{{MBA-Skill-ID}}' },
    mutation: true,
    args: (v) => [v.skillId],
  },
]

const uiFields: readonly Field[] = [
  text('title', 'Title', 'Learn more button'),
  {
    name: 'componentType',
    label: 'Component type',
    initial: 'cta_url',
    kind: 'select',
    required: true,
    options: [
      'carousel_quick_reply',
      'carousel_url',
      'cta_url',
      'flow',
      'image',
      'interactive_list',
      'interactive_reply_buttons',
      'location',
      'location_request',
    ],
  },
  {
    name: 'status',
    label: 'Status',
    initial: 'enabled',
    kind: 'select',
    required: true,
    options: ['enabled', 'disabled'],
  },
  {
    ...text(
      'instruction',
      'Instruction',
      'When a customer asks to learn more, send a button labeled Learn more that opens https://www.example.com.',
    ),
    kind: 'textarea',
  },
  { name: 'flowId', label: 'Flow ID (flow components only)' },
]
const uiBody = (v: ValueMap, includeType: boolean) =>
  compact({
    ...(includeType ? { component_type: v.componentType } : {}),
    title: v.title,
    status: v.status,
    instruction: v.instruction,
    ...(includeType && v.flowId ? { flow_id: Number(v.flowId) } : {}),
  })
const updateUiFields = uiFields
  .filter((field) => field.name !== 'componentType' && field.name !== 'flowId')
  .map((field) => ({ ...field, required: false }))
const uiPath = (phone: string, values: ValueMap) =>
  endpoint(phone, 'agent-ui-skills', value(values, 'uiSkillId'))

const interactiveMessages: readonly Definition[] = [
  {
    title: 'List UI Skills',
    method: 'GET',
    action: 'listUiSkills',
    path: resourcePath('agent-ui-skills'),
    fields: [
      optionalText('before', 'Before cursor'),
      optionalText('after', 'After cursor'),
      optionalText('limit', 'Page size'),
    ],
    query: (v) => compact({ before: v.before, after: v.after, limit: v.limit }),
    options: (v) =>
      compact({
        before: v.before,
        after: v.after,
        limit: v.limit ? Number(v.limit) : '',
      }),
  },
  {
    title: 'Get UI Skill',
    method: 'GET',
    action: 'getUiSkill',
    path: uiPath,
    fields: [idField('uiSkillId', 'UI skill ID')],
    exportFallbacks: { uiSkillId: '{{MBA-UI-Skill-ID}}' },
    args: (v) => [v.uiSkillId],
  },
  {
    title: 'Create UI Skill',
    method: 'POST',
    action: 'createUiSkill',
    path: resourcePath('agent-ui-skills'),
    fields: uiFields,
    mutation: true,
    body: (v) => uiBody(v, true),
    args: (v) => [uiBody(v, true)],
  },
  {
    title: 'Update UI Skill',
    method: 'PUT',
    action: 'updateUiSkill',
    path: uiPath,
    fields: [idField('uiSkillId', 'UI skill ID'), ...updateUiFields],
    exportFallbacks: { uiSkillId: '{{MBA-UI-Skill-ID}}' },
    mutation: true,
    body: (v) => uiBody(v, false),
    args: (v) => [v.uiSkillId, uiBody(v, false)],
  },
  {
    title: 'Delete UI Skill',
    method: 'DELETE',
    action: 'deleteUiSkill',
    path: uiPath,
    fields: [idField('uiSkillId', 'UI skill ID')],
    exportFallbacks: { uiSkillId: '{{MBA-UI-Skill-ID}}' },
    mutation: true,
    args: (v) => [v.uiSkillId],
  },
]

const faqFields: readonly Field[] = [
  text('question', 'Question', 'What is your return policy?'),
  {
    ...text(
      'answer',
      'Answer',
      'Returns are accepted within 30 days with proof of purchase.',
    ),
    kind: 'textarea',
  },
  json('metadata', 'Metadata (JSON object)', { category: 'returns' }),
]
const faqBody = (v: ValueMap) => ({
  question: v.question,
  answer: v.answer,
  ...(v.metadata
    ? { metadata: parseObject(value(v, 'metadata'), 'Metadata') }
    : {}),
})
const websiteFields: readonly Field[] = [
  text('url', 'Website URL', 'https://www.example.com'),
  json('includedSubDomains', 'Included subdomains (JSON array)', []),
  json('includedUrlPatterns', 'Included URL patterns (JSON array)', []),
  json('excludedSubDomains', 'Excluded subdomains (JSON array)', []),
  json('excludedUrlPatterns', 'Excluded URL patterns (JSON array)', []),
  json('singleUrls', 'Single URLs (JSON array)', []),
]
const websiteBody = (v: ValueMap) =>
  compact({
    url: v.url,
    included_sub_domains: v.includedSubDomains
      ? parseArray(v.includedSubDomains, 'Included subdomains')
      : '',
    included_url_patterns: v.includedUrlPatterns
      ? parseArray(v.includedUrlPatterns, 'Included URL patterns')
      : '',
    excluded_sub_domains: v.excludedSubDomains
      ? parseArray(v.excludedSubDomains, 'Excluded subdomains')
      : '',
    excluded_url_patterns: v.excludedUrlPatterns
      ? parseArray(v.excludedUrlPatterns, 'Excluded URL patterns')
      : '',
    single_urls: v.singleUrls ? parseArray(v.singleUrls, 'Single URLs') : '',
  })
const businessFields: readonly Field[] = [
  optionalText('paymentMethod', 'Payment method', 'Credit card'),
  optionalText(
    'returnPolicy',
    'Return policy',
    'Returns are accepted within 30 days.',
  ),
  optionalText(
    'purchaseInfo',
    'Purchase information',
    'Purchase online or contact our team.',
  ),
  optionalText(
    'deliveryAndShipping',
    'Delivery and shipping',
    'Standard delivery takes 3-5 business days.',
  ),
  {
    ...optionalText(
      'businessDescription',
      'Business description',
      'Describe your business here.',
    ),
    kind: 'textarea',
  },
  optionalText('contactEmail', 'Contact email', 'support@example.com'),
  optionalText(
    'hoursOfOperation',
    'Hours of operation',
    'Monday-Friday, 09:00-17:00',
  ),
  optionalText('businessAddress', 'Business address', 'Business address'),
]
const businessBody = (v: ValueMap) =>
  compact({
    payment_method: v.paymentMethod,
    return_policy: v.returnPolicy,
    purchase_info: v.purchaseInfo,
    delivery_and_shipping: v.deliveryAndShipping,
    business_description: v.businessDescription,
    contact_info:
      v.contactEmail || v.hoursOfOperation || v.businessAddress
        ? compact({
            email: v.contactEmail,
            hours_of_operation: v.hoursOfOperation,
            address: v.businessAddress,
          })
        : '',
  })

const knowledge: readonly Definition[] = [
  {
    title: 'Get Business Info',
    method: 'GET',
    action: 'getBusinessInfo',
    path: resourcePath('agent_config', 'business_info'),
    fields: [],
  },
  {
    title: 'Replace Business Info',
    method: 'PUT',
    action: 'replaceBusinessInfo',
    path: resourcePath('agent_config', 'business_info'),
    fields: businessFields,
    mutation: true,
    body: businessBody,
    args: (v) => [businessBody(v)],
  },
  {
    title: 'Reset Business Info',
    method: 'DELETE',
    action: 'resetBusinessInfo',
    path: resourcePath('agent_config', 'business_info'),
    fields: [],
    mutation: true,
  },
  {
    title: 'List FAQs',
    method: 'GET',
    action: 'listFaqs',
    path: resourcePath('agent_config', 'faq'),
    fields: [],
  },
  {
    title: 'Get FAQ',
    method: 'GET',
    action: 'getFaq',
    path: faqPath,
    fields: [idField('faqId', 'FAQ ID')],
    exportFallbacks: { faqId: '{{MBA-FAQ-ID}}' },
    args: (v) => [v.faqId],
  },
  {
    title: 'Create FAQ',
    method: 'POST',
    action: 'createFaq',
    path: resourcePath('agent_config', 'faq'),
    fields: faqFields,
    mutation: true,
    body: faqBody,
    args: (v) => [faqBody(v)],
  },
  {
    title: 'Update FAQ',
    method: 'PUT',
    action: 'updateFaq',
    path: faqPath,
    fields: [idField('faqId', 'FAQ ID'), ...faqFields],
    exportFallbacks: { faqId: '{{MBA-FAQ-ID}}' },
    mutation: true,
    body: faqBody,
    args: (v) => [v.faqId, faqBody(v)],
  },
  {
    title: 'Delete FAQ',
    method: 'DELETE',
    action: 'deleteFaq',
    path: faqPath,
    fields: [idField('faqId', 'FAQ ID')],
    exportFallbacks: { faqId: '{{MBA-FAQ-ID}}' },
    mutation: true,
    args: (v) => [v.faqId],
  },
  {
    title: 'List Knowledge Files',
    method: 'GET',
    action: 'listKnowledgeFiles',
    path: resourcePath('agent_config', 'files'),
    fields: [],
  },
  {
    title: 'Get Knowledge File',
    method: 'GET',
    action: 'getKnowledgeFile',
    path: filePath,
    fields: [idField('fileId', 'File ID')],
    exportFallbacks: { fileId: '{{MBA-File-ID}}' },
    args: (v) => [v.fileId],
  },
  {
    title: 'Upload Knowledge File',
    method: 'POST',
    action: 'uploadKnowledgeFile',
    path: resourcePath('agent_config', 'files'),
    fields: [
      {
        name: 'fileName',
        label: 'File name',
        initial: 'knowledge.pdf',
        required: true,
      },
      { name: 'file', label: 'Knowledge file', kind: 'file', required: true },
    ],
    mutation: true,
  },
  {
    title: 'Delete Knowledge File',
    method: 'DELETE',
    action: 'deleteKnowledgeFile',
    path: filePath,
    fields: [idField('fileId', 'File ID')],
    exportFallbacks: { fileId: '{{MBA-File-ID}}' },
    mutation: true,
    args: (v) => [v.fileId],
  },
  {
    title: 'List Knowledge Websites',
    method: 'GET',
    action: 'listKnowledgeWebsites',
    path: resourcePath('agent_config', 'websites'),
    fields: [],
  },
  {
    title: 'Get Knowledge Website',
    method: 'GET',
    action: 'getKnowledgeWebsite',
    path: websitePath,
    fields: [idField('websiteId', 'Website ID')],
    exportFallbacks: { websiteId: '{{MBA-Website-ID}}' },
    args: (v) => [v.websiteId],
  },
  {
    title: 'Add Knowledge Website',
    method: 'POST',
    action: 'createKnowledgeWebsite',
    path: resourcePath('agent_config', 'websites'),
    fields: websiteFields,
    mutation: true,
    body: websiteBody,
    args: (v) => [websiteBody(v)],
  },
  {
    title: 'Update Knowledge Website',
    method: 'PUT',
    action: 'updateKnowledgeWebsite',
    path: websitePath,
    fields: [idField('websiteId', 'Website ID'), ...websiteFields],
    exportFallbacks: { websiteId: '{{MBA-Website-ID}}' },
    mutation: true,
    body: websiteBody,
    args: (v) => [v.websiteId, websiteBody(v)],
  },
  {
    title: 'Delete Knowledge Website',
    method: 'DELETE',
    action: 'deleteKnowledgeWebsite',
    path: websitePath,
    fields: [idField('websiteId', 'Website ID')],
    exportFallbacks: { websiteId: '{{MBA-Website-ID}}' },
    mutation: true,
    args: (v) => [v.websiteId],
  },
]

export function MbaInstructionsCards(props: Props) {
  return <CardList definitions={instructions} {...props} />
}
export function MbaInteractiveMessagesCards(props: Props) {
  return <CardList definitions={interactiveMessages} {...props} />
}
export function MbaKnowledgeCards(props: Props) {
  return <CardList definitions={knowledge} {...props} />
}

function CardList({
  definitions,
  ...props
}: Props & { definitions: readonly Definition[] }) {
  return (
    <div className="grid gap-4">
      {definitions.map((definition, index) => (
        <MbaCard
          key={definition.title}
          definition={definition}
          defaultOpen={index === 0}
          {...props}
        />
      ))}
    </div>
  )
}

function MbaCard({
  definition,
  channelId,
  phoneNumberId,
  mutationDisabled,
  defaultOpen,
}: Props & { definition: Definition; defaultOpen: boolean }) {
  const { t } = useTranslation()
  const operation = useOperation()
  const [values, setValues] = useState<ValueMap>(() =>
    Object.fromEntries(
      definition.fields.map((field) => [field.name, field.initial ?? '']),
    ),
  )
  const [file, setFile] = useState<File | null>(null)
  const previewValues = Object.fromEntries(
    Object.entries(values).map(([name, current]) => [
      name,
      current || definition.exportFallbacks?.[name] || '',
    ]),
  )
  const request: PlaygroundRequestExample = {
    method: definition.method,
    path: definition.path('{{Phone-Number-ID}}', previewValues),
    headers: { 'X-API-Version': '2.0.0' },
    ...(definition.body
      ? { body: safePreview(() => definition.body?.(previewValues)) }
      : {}),
    ...(definition.action === 'uploadKnowledgeFile'
      ? {
          contentType: 'multipart/form-data' as const,
          body: {
            file_name: values.fileName,
            file: {
              name: file?.name ?? '{{MBA-Knowledge-File-Path}}',
            },
          },
        }
      : {}),
    ...(definition.query ? { query: definition.query(previewValues) } : {}),
  }
  const submit = () =>
    operation.run(async () => {
      if (definition.action === 'uploadKnowledgeFile') {
        if (!file) throw new Error('Select a knowledge file.')
        const form = new FormData()
        form.set('file', file, values.fileName || file.name)
        const response = await apiClient.api.channels[':id'][
          'agent-knowledge'
        ].files.$post({ param: { id: channelId } }, { init: { body: form } })
        return readDirectResult(response, t)
      }
      const response = await apiClient.api.playground.mba[':channelId'].$post({
        param: { channelId },
        json: {
          action: definition.action,
          arguments: definition.args?.(values) ?? [],
          options: definition.options?.(values) ?? {},
        },
      })
      return readResult(response, t)
    })
  return (
    <PlaygroundOperationCard
      method={definition.method}
      request={request}
      title={definition.title}
      description={
        descriptions[definition.title] ?? t('apiPlayground.mba.description')
      }
      action={t('apiPlayground.mba.action')}
      state={operation.state}
      disabled={
        !channelId || (Boolean(definition.mutation) && mutationDisabled)
      }
      defaultOpen={defaultOpen}
      resultLabel={t('apiPlayground.result')}
      onSubmit={() => void submit()}
    >
      {definition.fields.map((field) => {
        if (field.kind === 'select')
          return (
            <Select
              key={field.name}
              label={field.label}
              required={field.required}
              value={values[field.name]}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.name]: event.currentTarget.value,
                }))
              }
            >
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )
        if (field.kind === 'textarea' || field.kind === 'json')
          return (
            <Textarea
              key={field.name}
              label={field.label}
              required={field.required}
              rows={field.kind === 'json' ? 5 : 3}
              value={values[field.name]}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.name]: event.currentTarget.value,
                }))
              }
            />
          )
        if (field.kind === 'file')
          return (
            <Input
              key={field.name}
              label={field.label}
              required
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.csv,.xlsx"
              type="file"
              onChange={(event) =>
                setFile(event.currentTarget.files?.[0] ?? null)
              }
            />
          )
        return (
          <Input
            key={field.name}
            label={field.label}
            required={field.required}
            value={values[field.name]}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [field.name]: event.currentTarget.value,
              }))
            }
          />
        )
      })}
    </PlaygroundOperationCard>
  )
}

function parseObject(value: string, label: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new TypeError(`${label} must be a JSON object.`)
  return parsed as Record<string, unknown>
}
function parseArray(value: string, label: string): unknown[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed))
    throw new TypeError(`${label} must be a JSON array.`)
  return parsed
}
function safePreview(create: () => unknown) {
  try {
    return create()
  } catch {
    return {}
  }
}
function useOperation() {
  const { t } = useTranslation()
  const [state, setState] = useState<PlaygroundOperationState>({
    status: 'idle',
  })
  return {
    state,
    run: async (request: () => Promise<unknown>) => {
      setState({ status: 'loading' })
      try {
        setState({ status: 'success', result: await request() })
      } catch (error) {
        setState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : t('apiPlayground.operationFailed'),
        })
      }
    },
  }
}
type T = ReturnType<typeof useTranslation>['t']
async function readResult(response: Response, t: T) {
  const body: unknown = await response.json()
  const record = object(body)
  if (!response.ok)
    throw new Error(
      typeof record.message === 'string'
        ? record.message
        : t('apiPlayground.requestFailed', { status: response.status }),
    )
  if (!('result' in record))
    throw new Error(t('apiPlayground.unexpectedResponse'))
  return record.result
}
async function readDirectResult(response: Response, t: T) {
  const body: unknown = await response.json()
  const record = object(body)
  if (!response.ok)
    throw new Error(
      typeof record.message === 'string'
        ? record.message
        : t('apiPlayground.requestFailed', { status: response.status }),
    )
  return body
}
function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function value(values: ValueMap, name: string): string {
  return values[name] ?? ''
}
