import { useTranslation } from 'react-i18next'
import { Button, Dialog, Input } from '@mba-desk/ui'

export function RenameProjectDialog({
  project,
  name,
  working,
  onNameChange,
  onClose,
  onRename,
}: {
  project: { name: string } | null
  name: string
  working: boolean
  onNameChange: (name: string) => void
  onClose: () => void
  onRename: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('studio.renameTitle')}
      description={t('studio.renameDescription')}
    >
      <div className="w-full">
        <Input
          autoFocus
          value={name}
          aria-label={t('studio.projectName')}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onRename()
          }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={working || !name.trim()} onClick={onRename}>
            {t('studio.rename')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
