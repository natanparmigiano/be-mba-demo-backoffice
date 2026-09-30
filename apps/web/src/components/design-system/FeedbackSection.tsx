import {
  CheckCircle2,
  CircleAlert,
  FileText,
  Info,
  Plus,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  SectionCard,
  SectionHeading,
  Toast,
  useTimedToast,
} from '../ui'

export function FeedbackSection() {
  const { t } = useTranslation()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { message, showToast, dismissToast } = useTimedToast()

  return (
    <>
      <section id="feedback" className="scroll-mt-24 pt-10">
        <SectionHeading
          eyebrow={t('design.feedbackEyebrow')}
          title={t('design.feedbackTitle')}
          description={t('design.feedbackDescription')}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title={t('design.alerts')}>
            <div className="grid gap-3">
              <Alert
                icon={Info}
                title={t('design.newVersion')}
                description={t('design.newVersionDescription')}
                tone="primary"
                dismissLabel={t('design.dismissAlert')}
              />
              <Alert
                icon={CheckCircle2}
                title={t('design.importComplete')}
                description={t('design.importDescription')}
                tone="success"
                dismissLabel={t('design.dismissAlert')}
              />
              <Alert
                icon={CircleAlert}
                title={t('design.paymentExpiring')}
                description={t('design.paymentDescription')}
                tone="warning"
                dismissLabel={t('design.dismissAlert')}
              />
            </div>
          </SectionCard>

          <SectionCard
            title={t('design.dialogsToasts')}
            description={t('design.dialogsDescription')}
          >
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setIsDialogOpen(true)}>
                {t('design.openDialog')}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  showToast({
                    title: t('design.changesSaved'),
                    description: t('design.preferencesUpdated'),
                  })
                }
              >
                {t('design.showToast')}
              </Button>
            </div>
            <div className="mt-6 rounded-xl border border-dashed bg-muted/35 p-5">
              <p className="text-sm font-semibold">{t('design.emptyState')}</p>
              <div className="mt-4">
                <EmptyState
                  icon={<FileText className="size-5" />}
                  title={t('design.noReports')}
                  description={t('design.noReportsDescription')}
                  action={
                    <Button
                      size="sm"
                      onClick={() =>
                        showToast({
                          title: t('design.reportStarted'),
                          description: t('design.reportStartedDescription'),
                        })
                      }
                    >
                      <Plus className="size-3.5" />
                      {t('design.createReport')}
                    </Button>
                  }
                />
              </div>
            </div>
          </SectionCard>
        </div>
      </section>

      <Dialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={t('design.deleteTitle')}
        description={t('design.deleteDescription')}
        icon={
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <Trash2 className="size-5" />
          </span>
        }
      >
        <Button
          variant="outline"
          autoFocus
          onClick={() => setIsDialogOpen(false)}
        >
          {t('design.cancel')}
        </Button>
        <Button variant="danger" onClick={() => setIsDialogOpen(false)}>
          {t('design.deleteRecord')}
        </Button>
      </Dialog>

      <Toast
        message={message}
        onDismiss={dismissToast}
        dismissLabel={t('design.dismissNotification')}
      />
    </>
  )
}
