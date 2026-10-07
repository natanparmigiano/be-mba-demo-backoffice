import {
  Ellipsis,
  Filter,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  Search,
  UserPlus,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Avatar,
  Button,
  Pill,
  SearchBox,
  SectionCard,
  SectionHeading,
  PageHeader,
  SettingsCard,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@mba-desk/ui'

const people = [
  {
    nameKey: 'design.demoPeople.maya',
    email: 'maya@example.com',
    role: 'admin',
    status: 'active',
  },
  {
    nameKey: 'design.demoPeople.alex',
    email: 'alex@example.com',
    role: 'editor',
    status: 'active',
  },
  {
    nameKey: 'design.demoPeople.sam',
    email: 'sam@example.com',
    role: 'viewer',
    status: 'invited',
  },
  {
    nameKey: 'design.demoPeople.jordan',
    email: 'jordan@example.com',
    role: 'editor',
    status: 'inactive',
  },
] as const

export function DataDisplaySection() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedPeople, setSelectedPeople] = useState<string[]>([
    'maya@example.com',
  ])

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase()
    const translatedPeople = people.map((person) => ({
      ...person,
      name: t(person.nameKey),
    }))
    if (!query) return translatedPeople

    return translatedPeople.filter((person) =>
      `${person.name} ${person.email} ${t(`design.roles.${person.role}`)}`
        .toLowerCase()
        .includes(query),
    )
  }, [search, t])

  const togglePerson = (email: string) => {
    setSelectedPeople((current) =>
      current.includes(email)
        ? current.filter((person) => person !== email)
        : [...current, email],
    )
  }

  return (
    <section id="data" className="scroll-mt-24 pt-10">
      <SectionHeading
        eyebrow={t('design.dataEyebrow')}
        title={t('design.dataTitle')}
        description={t('design.dataDescription')}
      />
      <div className="mb-5 rounded-2xl border bg-card p-5 sm:p-6">
        <PageHeader
          eyebrow={t('design.dataEyebrow')}
          title={t('design.dataTitle')}
          description={t('design.dataDescription')}
          actions={<Button>{t('design.addMember')}</Button>}
        />
      </div>
      <div className="mb-5">
        <SettingsCard
          icon={<Users className="size-5" aria-hidden />}
          title={t('design.teamMembers')}
          description={t('design.dataDescription')}
          action={<Button size="sm">{t('design.addMember')}</Button>}
        >
          <p className="text-sm text-muted-foreground">
            {t('design.noMembersHint')}
          </p>
        </SettingsCard>
      </div>
      <SectionCard
        title={t('design.teamMembers')}
        description={`${t('design.selectedCount', { count: selectedPeople.length })} · ${t('design.shownCount', { count: filteredPeople.length })}`}
        action={
          <Button size="sm">
            <UserPlus className="size-3.5" />
            {t('design.addMember')}
          </Button>
        }
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBox
            className="w-full sm:max-w-xs"
            placeholder={t('design.searchMembers')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button variant="outline" className="sm:ml-auto">
            <Filter className="size-4" />
            {t('design.filters')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-lg"
            aria-label={t('design.tableOptions')}
          >
            <Ellipsis className="size-4" />
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12 px-4">
                <span className="sr-only">{t('design.select')}</span>
              </TableHead>
              <TableHead>{t('design.member')}</TableHead>
              <TableHead>{t('design.role')}</TableHead>
              <TableHead>{t('design.status')}</TableHead>
              <TableHead className="text-right">
                {t('design.tableActions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPeople.map((person) => (
              <TableRow key={person.email}>
                <TableCell className="px-4">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer accent-primary"
                    checked={selectedPeople.includes(person.email)}
                    onChange={() => togglePerson(person.email)}
                    aria-label={`${t('design.select')} ${person.name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={person.name}
                      status={person.status === 'active' ? 'online' : 'offline'}
                      statusLabel={t(
                        person.status === 'active'
                          ? 'common.status.online'
                          : 'common.status.offline',
                      )}
                    />
                    <div>
                      <p className="font-semibold">{person.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {person.email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t(`design.roles.${person.role}`)}
                </TableCell>
                <TableCell>
                  <Pill
                    tone={
                      person.status === 'active'
                        ? 'success'
                        : person.status === 'invited'
                          ? 'primary'
                          : 'neutral'
                    }
                    dot
                  >
                    {t(`design.memberStatus.${person.status}`)}
                  </Pill>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={t('design.actionsFor', { name: person.name })}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredPeople.length === 0 && (
          <div className="grid place-items-center py-10 text-center">
            <Search className="size-7 text-muted-foreground" />
            <p className="mt-3 font-semibold">{t('design.noMembers')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('design.noMembersHint')}
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-4 border-t pt-6 sm:grid-cols-3">
          <StatCard
            icon={Users}
            label={t('design.totalMembers')}
            value={new Intl.NumberFormat(i18n.resolvedLanguage).format(2480)}
            change={new Intl.NumberFormat(i18n.resolvedLanguage, {
              style: 'percent',
              signDisplay: 'always',
            }).format(0.125)}
          />
          <StatCard
            icon={LayoutGrid}
            label={t('design.activeTeams')}
            value="42"
            change={t('design.thisMonth')}
          />
          <StatCard
            icon={MessageCircle}
            label={t('design.openThreads')}
            value="128"
            change={t('design.unread')}
          />
        </div>
      </SectionCard>
    </section>
  )
}
