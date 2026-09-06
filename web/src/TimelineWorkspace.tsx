import { useEffect, useState } from 'react'
import { Add24Regular, Copy24Regular, Delete24Regular, Save24Regular } from '@fluentui/react-icons'
import { Button, Card, CardHeader, Checkbox, Field, Input, Select } from '@fluentui/react-components'
import { api, type TimelineRecord } from './api'

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

function emptyTimeline(): TimelineData {
  return { id: crypto.randomUUID(), entries: [], dayOfWeek: [1, 2, 3, 4, 5], weeks: 'all' }
}

function normalize(item: TimelineRecord): TimelineData {
  return { id: item.timeline.id as string || item.id, entries: (item.timeline.entries as TimelineEntry[] ?? []).map((entry) => ({ ...entry })), dayOfWeek: item.timeline.dayOfWeek as number[] | undefined, weeks: item.timeline.weeks as TimelineData['weeks'], date: item.timeline.date as string | undefined }
}

export function TimelineWorkspace({ organizationId, onComplete }: Props) {
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
  return <div className="timeline-resource-workspace">
    <Card className="resource-sidebar"><CardHeader header={<strong>时间线</strong>} action={<Button appearance="subtle" icon={<Add24Regular />} onClick={reset}>新建</Button>} /><div className="resource-nav">{records.map((record) => <Button className={selectedId === record.id ? 'selected' : ''} appearance="subtle" key={record.id} onClick={() => open(record)}><span><strong>{record.name}</strong><small>{(record.timeline.entries as TimelineEntry[] ?? []).length} 个时间段</small></span></Button>)}</div></Card>
    <Card className="form-section timeline-resource-editor"><div className="editor-commandbar"><Field label="时间线名称"><Input value={name} onChange={(_, data) => setName(data.value)} /></Field><div className="form-actions"><Button appearance="secondary" icon={<Copy24Regular />} onClick={clone}>复制</Button><Button appearance="secondary" icon={<Delete24Regular />} disabled={!selectedId} onClick={() => void remove()}>删除</Button><Button appearance="primary" icon={<Save24Regular />} onClick={() => void save()}>保存</Button></div></div>
      <div className="timeline-rule">
        <Field label="规则类型">
          <Select value={timeline.date ? 'date' : 'week'} onChange={(event) => update(event.target.value === 'date' ? { date: new Date().toISOString().slice(0, 10), dayOfWeek: undefined, weeks: 'all' } : { date: undefined, dayOfWeek: [1, 2, 3, 4, 5], weeks: 'all' })}>
            <option value="week">按星期</option><option value="date">按日期</option>
          </Select>
        </Field>
        {timeline.date ? <Field label="指定日期"><Input type="date" value={timeline.date} onChange={(_, data) => update({ date: data.value })} /></Field> : <>
          <Field label="星期"><div className="day-pills" role="group" aria-label="选择星期">{DAYS.map((day, index) => <Checkbox key={day} id={`timeline-day-${index + 1}`} label={day} checked={timeline.dayOfWeek?.includes(index + 1) ?? false} onChange={(_, data) => update({ dayOfWeek: data.checked ? [...new Set([...(timeline.dayOfWeek ?? []), index + 1])] : (timeline.dayOfWeek ?? []).filter((value) => value !== index + 1) })} />)}</div></Field>
          <Field label="循环周" hint="可以指定任意周数；留空表示每周"><Input type="number" min={1} max={52} placeholder="每周" value={timeline.weeks === 'all' || timeline.weeks == null ? '' : String(timeline.weeks)} onChange={(_, data) => update({ weeks: data.value.trim() ? Number(data.value) : 'all' })} /></Field>
        </>}
      </div>
      <div className="pane-heading"><strong>时间段</strong><Button appearance="secondary" icon={<Add24Regular />} onClick={addEntry}>添加时间段</Button></div><div className="timeline-entry-list">{timeline.entries.map((entry, index) => <Card className="timeline-entry-row" key={entry.id}><strong>{index + 1}</strong><Select value={entry.type} onChange={(event) => updateEntry(entry.id, { type: event.target.value as TimelineEntry['type'] })}><option value="class">课程</option><option value="break">课间</option><option value="activity">活动</option><option value="free">空闲</option><option value="preparation">预备</option></Select><Input type="time" value={entry.startTime} onChange={(_, data) => updateEntry(entry.id, { startTime: data.value })} /><span>至</span><Input type="time" value={entry.endTime} onChange={(_, data) => updateEntry(entry.id, { endTime: data.value })} /><Input placeholder="时间段标题" value={entry.title ?? ''} onChange={(_, data) => updateEntry(entry.id, { title: data.value || undefined })} /><Button appearance="subtle" icon={<Delete24Regular />} onClick={() => removeEntry(entry.id)} aria-label={`删除时间段 ${index + 1}`} /></Card>)}{timeline.entries.length === 0 && <div className="empty-command">暂无时间段，请添加时间段。</div>}</div>
    </Card>
  </div>
}
