import { useEffect, useState } from 'react'
import { Add24Regular, Copy24Regular, Delete24Regular, Save24Regular } from '@fluentui/react-icons'
import { Button, Card, CardHeader, Checkbox, Field, Input, Select, Text, mergeClasses } from '@fluentui/react-components'
import { api, type TimelineRecord } from './api'
import { useWorkspaceStyles } from './styles/workspaceStyles'

type TimelineEntry = {
  id: string
  type: 'class' | 'break' | 'activity' | 'free' | 'preparation'
  startTime: string
  endTime: string
  title?: string
}
type TimelineData = {
  id: string
  entries: TimelineEntry[]
  dayOfWeek?: number[]
  weeks?: 'all' | number | number[] | null
  date?: string
}

type Props = { organizationId: string; onComplete: (message: string, tone?: 'success' | 'error') => void }
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const ENTRY_TYPES: Array<{ value: TimelineEntry['type']; label: string }> = [
  { value: 'class', label: '课程' },
  { value: 'break', label: '课间' },
  { value: 'activity', label: '活动' },
  { value: 'free', label: '空闲' },
  { value: 'preparation', label: '预备' },
]

function emptyTimeline(): TimelineData {
  return { id: crypto.randomUUID(), entries: [], dayOfWeek: [1, 2, 3, 4, 5], weeks: 'all' }
}

function normalize(item: TimelineRecord): TimelineData {
  return { id: item.timeline.id as string || item.id, entries: (item.timeline.entries as TimelineEntry[] ?? []).map((entry) => ({ ...entry })), dayOfWeek: item.timeline.dayOfWeek as number[] | undefined, weeks: item.timeline.weeks as TimelineData['weeks'], date: item.timeline.date as string | undefined }
}

export function TimelineWorkspace({ organizationId, onComplete }: Props) {
  const styles = useWorkspaceStyles()
  const [records, setRecords] = useState<TimelineRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('普通教学日')
  const [timeline, setTimeline] = useState<TimelineData>(emptyTimeline)

  async function load() {
    if (!organizationId) return
    try {
      const next = await api.timelines(organizationId)
      setRecords(next)
      if (!selectedId && next[0]) {
        setSelectedId(next[0].id)
        setName(next[0].name)
        setTimeline(normalize(next[0]))
      }
    } catch { /* 页面提示由操作反馈处理 */ }
  }
  useEffect(() => { void load() }, [organizationId])

  function reset() { setSelectedId(''); setName('新时间线'); setTimeline(emptyTimeline()) }
  function open(record: TimelineRecord) { setSelectedId(record.id); setName(record.name); setTimeline(normalize(record)) }
  function update(patch: Partial<TimelineData>) { setTimeline((value) => ({ ...value, ...patch })) }
  function addEntry() { update({ entries: [...timeline.entries, { id: crypto.randomUUID(), type: 'class', startTime: '08:00', endTime: '08:40', title: `第 ${timeline.entries.length + 1} 节` }] }) }
  function updateEntry(id: string, patch: Partial<TimelineEntry>) { update({ entries: timeline.entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) }) }
  function removeEntry(id: string) { update({ entries: timeline.entries.filter((entry) => entry.id !== id) }) }
  function clone() { setSelectedId(''); setName(`${name} - 副本`); setTimeline({ ...structuredClone(timeline), id: crypto.randomUUID(), entries: timeline.entries.map((entry) => ({ ...entry, id: crypto.randomUUID() })) }); onComplete('已创建时间线副本') }
  async function save() {
    try {
      const timelineData = { ...timeline, entries: timeline.entries.map(({ ...entry }) => entry) }
      const body = { organization_id: organizationId, timeline: { name: name.trim() || '未命名时间线', ...timelineData } }
      const result = selectedId ? await api.updateTimeline(selectedId, { timeline: body.timeline }) : await api.createTimeline(body)
      setSelectedId(result.id); setName(result.name); onComplete('时间线已保存'); await load()
    } catch (error) { onComplete(error instanceof Error ? error.message : '保存时间线失败', 'error') }
  }
  async function remove() {
    if (!selectedId || !window.confirm(`确定删除时间线“${name}”？`)) return
    try { await api.deleteTimeline(selectedId); onComplete('时间线已删除'); reset(); await load() } catch (error) { onComplete(error instanceof Error ? error.message : '删除时间线失败', 'error') }
  }

  return <div className={styles.layout}>
    <Card className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <Text weight="semibold">时间线</Text>
        <Button appearance="subtle" icon={<Add24Regular />} onClick={reset}>新建</Button>
      </div>
      <div className={styles.nav}>
        {records.map((record) => <Button
          key={record.id}
          appearance="subtle"
          className={mergeClasses(styles.navButton, selectedId === record.id && styles.navButtonSelected)}
          onClick={() => open(record)}
        >
          <span className={styles.navButtonCopy}>
            <Text weight="semibold" block>{record.name}</Text>
            <Text className={styles.navButtonMeta} size={200} block>{(record.timeline.entries as TimelineEntry[] ?? []).length} 个时间段</Text>
          </span>
        </Button>)}
        {records.length === 0 && <div className={styles.empty}>暂无时间线</div>}
      </div>
    </Card>
    <div className={styles.main}>
      <Card>
        <CardHeader header={<Text as="h2" weight="semibold" size={400}>{selectedId ? '编辑时间线' : '新建时间线'}</Text>} />
        <div className={styles.commandBar}>
          <Field label="时间线名称" className={styles.commandBarField}><Input value={name} onChange={(_, data) => setName(data.value)} /></Field>
          <div className={styles.commandBarActions}>
            <Button appearance="secondary" icon={<Copy24Regular />} onClick={clone}>复制</Button>
            <Button appearance="secondary" icon={<Delete24Regular />} disabled={!selectedId} onClick={() => void remove()}>删除</Button>
            <Button appearance="primary" icon={<Save24Regular />} onClick={() => void save()}>保存</Button>
          </div>
        </div>
        <div className={styles.row}>
          <Field label="规则类型">
            <Select value={timeline.date ? 'date' : 'week'} onChange={(_, data) => update(data.value === 'date' ? { date: new Date().toISOString().slice(0, 10), dayOfWeek: undefined, weeks: 'all' } : { date: undefined, dayOfWeek: [1, 2, 3, 4, 5], weeks: 'all' })}>
              <option value="week">按星期</option>
              <option value="date">按日期</option>
            </Select>
          </Field>
          {timeline.date
            ? <Field label="指定日期"><Input type="date" value={timeline.date} onChange={(_, data) => update({ date: data.value })} /></Field>
            : <>              <Field label="星期">
                <div className={styles.marker} role="group" aria-label="选择星期">{DAYS.map((day, index) => <Checkbox key={day} label={day} checked={timeline.dayOfWeek?.includes(index + 1) ?? false} onChange={(_, data) => update({ dayOfWeek: data.checked ? [...new Set([...(timeline.dayOfWeek ?? []), index + 1])] : (timeline.dayOfWeek ?? []).filter((value) => value !== index + 1) })} />)}</div>
              </Field>
              <Field label="循环周" hint="可以指定任意周数；留空表示每周"><Input type="number" min={1} max={52} placeholder="每周" value={timeline.weeks === 'all' || timeline.weeks == null ? '' : String(timeline.weeks)} onChange={(_, data) => update({ weeks: data.value.trim() ? Number(data.value) : 'all' })} /></Field>
            </>}
        </div>
      </Card>
      <Card>
        <CardHeader header={<Text as="h2" weight="semibold" size={400}>时间段</Text>} action={<Button appearance="secondary" icon={<Add24Regular />} onClick={addEntry}>添加时间段</Button>} />
        <div className={styles.main}>
          {timeline.entries.map((entry, index) => <div className={styles.row} key={entry.id}>
            <Text weight="semibold">{index + 1}</Text>
            <Select aria-label={`第 ${index + 1} 个时间段的类型`} value={entry.type} onChange={(_, data) => updateEntry(entry.id, { type: data.value as TimelineEntry['type'] })}>
              {ENTRY_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Input aria-label={`第 ${index + 1} 个时间段的开始时间`} type="time" value={entry.startTime} onChange={(_, data) => updateEntry(entry.id, { startTime: data.value })} />
            <Text className={styles.muted}>至</Text>
            <Input aria-label={`第 ${index + 1} 个时间段的结束时间`} type="time" value={entry.endTime} onChange={(_, data) => updateEntry(entry.id, { endTime: data.value })} />
            <Input className={styles.grow} placeholder="时间段标题" value={entry.title ?? ''} onChange={(_, data) => updateEntry(entry.id, { title: data.value || undefined })} />
            <Button appearance="subtle" icon={<Delete24Regular />} onClick={() => removeEntry(entry.id)} aria-label={`删除时间段 ${index + 1}`} />
          </div>)}
          {timeline.entries.length === 0 && <div className={styles.empty}>暂无时间段，请添加时间段。</div>}
        </div>
      </Card>
    </div>
  </div>
}
