import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MbaAgentConfigurationFolder,
  MbaInsightsFolder,
  MbaThreadControlFolder,
  type MbaFolderProps,
} from '../components/api-playground/mba/MbaConfigurationInsights'
import {
  ConnectorToolsPlaygroundFolder,
  ConnectorsPlaygroundFolder,
} from '../components/api-playground/mba/ConnectorFolders'
import {
  MbaInstructionsCards,
  MbaInteractiveMessagesCards,
  MbaKnowledgeCards,
} from '../components/api-playground/mba/MbaKnowledgeCards'
import { MbaOperationsFolder } from '../components/api-playground/mba/MbaOperations'
import { PlaygroundPostmanRegistryProvider } from '../components/api-playground/PlaygroundPostmanRegistry'
import { Tabs } from '@mba-desk/ui'

type Folder =
  | 'agentConfiguration'
  | 'connectors'
  | 'connectorTools'
  | 'instructions'
  | 'interactiveMessages'
  | 'knowledge'
  | 'operations'
  | 'insights'
  | 'threadControl'

const folders: ReadonlyArray<{
  value: Folder
  Component: (props: MbaFolderProps) => React.JSX.Element
}> = [
  { value: 'agentConfiguration', Component: MbaAgentConfigurationFolder },
  { value: 'connectors', Component: ConnectorsPlaygroundFolder },
  { value: 'connectorTools', Component: ConnectorToolsPlaygroundFolder },
  { value: 'instructions', Component: MbaInstructionsCards },
  { value: 'interactiveMessages', Component: MbaInteractiveMessagesCards },
  { value: 'knowledge', Component: MbaKnowledgeCards },
  { value: 'operations', Component: MbaOperationsFolder },
  { value: 'insights', Component: MbaInsightsFolder },
  { value: 'threadControl', Component: MbaThreadControlFolder },
]

export function MbaPlayground(props: MbaFolderProps) {
  const { t } = useTranslation()
  const [folder, setFolder] = useState<Folder>('agentConfiguration')
  const items = folders.map(({ value }) => ({
    value,
    label: t(`apiPlayground.mba.folders.${value}`),
  }))

  return (
    <div className="grid gap-4">
      <Tabs
        items={items}
        value={folder}
        onValueChange={setFolder}
        ariaLabel={t('apiPlayground.mba.folderTabsLabel')}
        variant="pills"
      />
      {folders.map(({ value, Component }) => (
        <PlaygroundPostmanRegistryProvider
          key={value}
          folder={items.find((item) => item.value === value)?.label ?? value}
        >
          <div
            role="tabpanel"
            aria-label={items.find((item) => item.value === value)?.label}
            hidden={folder !== value}
          >
            <Component {...props} />
          </div>
        </PlaygroundPostmanRegistryProvider>
      ))}
    </div>
  )
}
