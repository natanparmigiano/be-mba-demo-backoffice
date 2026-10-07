import { Mail } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Checkbox,
  Input,
  SearchBox,
  SectionCard,
  SectionHeading,
  Select,
  Switch,
  TagInput,
  Textarea,
} from '@mba-desk/ui'

export function FormsSection() {
  const { t } = useTranslation()
  const [tags, setTags] = useState(['support', 'billing'])

  return (
    <section id="forms" className="scroll-mt-24 pt-10">
      <SectionHeading
        eyebrow={t('design.inputEyebrow')}
        title={t('design.formsTitle')}
        description={t('design.formsDescription')}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title={t('design.inputsSearch')}
          description={t('design.commonPatterns')}
        >
          <div className="grid gap-5">
            <Input
              label={t('design.fullName')}
              placeholder={t('design.fullNamePlaceholder')}
            />
            <Input
              label={t('design.email')}
              type="email"
              defaultValue="maya@example"
              error={t('design.invalidEmail')}
              leadingIcon={Mail}
            />
            <Textarea
              label={t('design.notes')}
              placeholder={t('design.notesPlaceholder')}
              hint={t('design.teamOnly')}
            />
            <TagInput
              getRemoveLabel={(tag) => t('design.removeTag', { tag })}
              hint={t('design.tagsHint')}
              label={t('design.tags')}
              placeholder={t('design.tagsPlaceholder')}
              value={tags}
              onValueChange={setTags}
            />
            <div>
              <span className="mb-1.5 block text-sm font-semibold">
                {t('design.search')}
              </span>
              <SearchBox placeholder={t('design.searchPeople')} />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t('design.selection')}
          description={t('design.selectionDescription')}
        >
          <div className="grid gap-6">
            <Select
              label={t('design.workspace')}
              defaultValue="latam"
              hint={t('design.workspaceHint')}
            >
              <option value="latam">{t('design.latam')}</option>
              <option value="north-america">{t('design.northAmerica')}</option>
              <option value="europe">{t('design.europe')}</option>
            </Select>
            <Select label={t('design.accessLevel')} defaultValue="editor">
              <option value="admin">{t('design.administrator')}</option>
              <option value="editor">{t('design.editor')}</option>
              <option value="viewer">{t('design.viewer')}</option>
            </Select>
            <div className="grid gap-4 border-t pt-5">
              <Checkbox
                label={t('design.emailNotifications')}
                description={t('design.emailNotificationsDescription')}
                defaultChecked
              />
              <Checkbox
                label={t('design.weeklyDigest')}
                description={t('design.weeklyDigestDescription')}
              />
              <Checkbox label={t('design.unavailableOption')} disabled />
            </div>
            <div className="grid gap-4 border-t pt-5">
              <Switch
                label={t('design.publicProfile')}
                description={t('design.publicProfileDescription')}
                defaultChecked
              />
              <Switch
                label={t('design.autoApprove')}
                description={t('design.autoApproveDescription')}
              />
            </div>
          </div>
        </SectionCard>
      </div>
    </section>
  )
}
