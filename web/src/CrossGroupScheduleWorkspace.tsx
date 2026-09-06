import { useEffect, useMemo, useState } from 'react'
import { Save24Regular, Send24Regular } from '@fluentui/react-icons'
import { Button, Card, Checkbox, Field, Select } from '@fluentui/react-components'
import { api, type Group, type ScheduleRecord, type TimelineRecord } from './api'

type Course = { id: string; name: string; simplifiedName?: string; teacher?: string; icon?: string; color?: string; location?: string; isLocalClassroom: boolean }
type Entry = { id: string; sourceEntryId?: string; type: 'class' | 'break' | 'activity' | 'free' | 'preparation'; startTime: string; endTime: string; title?: string; subjectId?: string }
type Day = { id: string; timelineId: string; entries: Entry[]; dayOfWeek?: number[]; weeks?: 'all' | number | number[] | null; date?: string }
type Assignment = { id: string; timelineId: string; entryId: string; dayOfWeek?: number[]; weeks?: 'all' | number | number[] | null; subjectId?: string }
type Schedule = { meta: { id: string; version: 1; maxWeekCycle: number; startDate: string }; subjects: Course[]; days: Day[]; overrides: Array<Record<string, unknown>>; timelineIds: string[]; assignments: Assignment[] }
type Props = { organizationId: string; groups: Group[]; onComplete: (message: string, tone?: 'success' | 'error') => void }

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function appliesToWeek(value: Day['weeks'], week: number) {
  return value === 'all' || value == null || value === week || Array.isArray(value) && value.includes(week)
}

function activeDay(schedule: Schedule, day: number, week: number) {
  return schedule.days.find((item) => item.dayOfWeek?.includes(day) && appliesToWeek(item.weeks, week))
}

function timelineDays(timeline: TimelineRecord, courses: Course[]): Schedule {
  const weekdays = Array.isArray(timeline.timeline.dayOfWeek) && timeline.timeline.dayOfWeek.length ? timeline.timeline.dayOfWeek as number[] : [1, 2, 3, 4, 5]
  const sourceEntries = timeline.timeline.entries as Entry[] ?? []
  const weeks = timeline.timeline.weeks as Day['weeks']
  const days = weekdays.map((weekday) => ({
    id: `${timeline.id}:${weekday}`,
    timelineId: timeline.id,
    dayOfWeek: [weekday],
    weeks,
    entries: sourceEntries.map((entry) => ({ ...entry, sourceEntryId: entry.id, id: `${timeline.id}:${weekday}:${entry.id}`, subjectId: undefined })),
  }))
  return {
    meta: { id: crypto.randomUUID(), version: 1, maxWeekCycle: typeof weeks === 'number' ? weeks : 2, startDate: new Date().toISOString().slice(0, 10) },
    subjects: courses,
    days,
    overrides: [],
    timelineIds: [timeline.id],
    assignments: [],
  }
}

function buildAssignments(schedule: Schedule): Assignment[] {
  return schedule.days.flatMap((day) => day.entries
    .filter((entry) => entry.type === 'class' || entry.type === 'activity')
    .map((entry) => ({ id: `${day.id}:${entry.id}`, timelineId: day.timelineId, entryId: entry.sourceEntryId ?? entry.id, dayOfWeek: day.dayOfWeek, weeks: day.weeks, subjectId: entry.subjectId })))
}

export function CrossGroupScheduleWorkspace({ organizationId, groups, onComplete }: Props) {
  const [timelines, setTimelines] = useState<TimelineRecord[]>([])
  const [records, setRecords] = useState<ScheduleRecord[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [timelineId, setTimelineId] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [day, setDay] = useState(1)
  const [week, setWeek] = useState(1)
  const [drafts, setDrafts] = useState<Record<string, Schedule>>({})

  async function load() {
    if (!organizationId) return
    try {
      const [nextTimelines, nextRecords, nextCourses] = await Promise.all([api.timelines(organizationId), api.schedules(organizationId), api.courses(organizationId)])
      setTimelines(nextTimelines)
      setRecords(nextRecords)
      setCourses(nextCourses.map(({ organization_id: _organizationId, created_at: _createdAt, updated_at: _updatedAt, ...course }) => course))
    } catch (error) {
      onComplete(error instanceof Error ? error.message : '加载按天排课数据失败', 'error')
    }
  }

  useEffect(() => { void load() }, [organizationId])

  const selectedTimeline = timelines.find((item) => item.id === timelineId)
  const entries = useMemo(() => selectedTimeline ? (selectedTimeline.timeline.entries as Entry[] ?? []) : [], [selectedTimeline])
  const cycleWeeks = selectedTimeline && typeof selectedTimeline.timeline.weeks === 'number' ? selectedTimeline.timeline.weeks : 1

  function createDraft(groupId: string): Schedule | undefined {
    if (!selectedTimeline) return undefined
    const record = records.find((item) => item.group_ids.includes(groupId) && (item.schedule.timelineIds as string[] | undefined)?.includes(selectedTimeline.id))
    if (!record) return timelineDays(selectedTimeline, courses)
    const draft = structuredClone(record.schedule) as unknown as Schedule
    draft.subjects = courses
    draft.overrides ??= []
    draft.timelineIds = [selectedTimeline.id]
    draft.assignments ??= []
    return draft
  }

  function toggleGroup(groupId: string, checked: boolean) {
    setSelectedGroups((value) => checked ? [...new Set([...value, groupId])] : value.filter((id) => id !== groupId))
    if (checked) setDrafts((value) => value[groupId] ? value : { ...value, [groupId]: createDraft(groupId)! })
  }

  function setCell(groupId: string, sourceEntryId: string, subjectId: string) {
    setDrafts((value) => {
      const current = value[groupId]
      if (!current) return value
      const target = activeDay(current, day, week)
      if (!target) return value
      const days = current.days.map((item) => item.id === target.id ? {
        ...item,
        entries: item.entries.map((entry) => (entry.sourceEntryId ?? entry.id) === sourceEntryId ? { ...entry, subjectId: subjectId || undefined } : entry),
      } : item)
      return { ...value, [groupId]: { ...current, days } }
    })
  }

  async function save(publish: boolean) {
    if (!selectedTimeline) return onComplete('请先选择公共时间线', 'error')
    if (!selectedGroups.length) return onComplete('请至少选择一个分组', 'error')
    try {
      for (const groupId of selectedGroups) {
        const draft = drafts[groupId]
        if (!draft) continue
        const payload = { ...draft, subjects: courses, assignments: buildAssignments(draft) }
        const current = records.find((item) => item.group_ids.includes(groupId) && (item.schedule.timelineIds as string[] | undefined)?.includes(selectedTimeline.id))
        const result = current
          ? await api.updateSchedule(current.id, { name: current.name, schedule: payload })
          : await api.publishSchedule({ organization_id: organizationId, name: `${groups.find((item) => item.id === groupId)?.name ?? '分组'} - 按天排课`, schedule: payload, group_ids: [] })
        if (publish) await api.assignSchedule(result.id, [groupId])
      }
      onComplete(publish ? '已按分组保存并发布' : '已保存按天排课草稿')
      await load()
    } catch (error) {
      onComplete(error instanceof Error ? error.message : '保存按天排课失败', 'error')
    }
  }

  return <div className="cross-group-workspace"><Card className="cross-group-panel">
    <div className="section-heading"><div><h2>按天拉通排课</h2><span>共用一条时间线，按天为多个分组同时安排课程。</span></div><div className="form-actions"><Button appearance="secondary" icon={<Save24Regular />} onClick={() => void save(false)}>保存草稿</Button><Button appearance="primary" icon={<Send24Regular />} onClick={() => void save(true)}>保存并发布</Button></div></div>
    <div className="cross-group-toolbar"><Field label="公共时间线"><Select value={timelineId} onChange={(event) => { setTimelineId(event.target.value); setSelectedGroups([]); setDrafts({}); setWeek(1) }}><option value="">选择时间线</option>{timelines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><div className="group-picker"><span className="group-picker-label">参与分组</span><div className="checks fluent-checks">{groups.map((group) => <Checkbox id={`cross-group-${group.id}`} key={group.id} checked={selectedGroups.includes(group.id)} disabled={!selectedTimeline} onChange={(_, data) => toggleGroup(group.id, data.checked === true)} label={group.name} />)}</div></div></div>
    <div className="day-pills fluent-day-pills">{DAYS.map((label, index) => <Button appearance={day === index + 1 ? 'primary' : 'secondary'} key={label} onClick={() => setDay(index + 1)}>{label}</Button>)}</div>
    <div className="week-toolbar"><Button appearance="subtle" disabled={week <= 1} onClick={() => setWeek(week - 1)}>上一周</Button><strong>循环第 {week} 周</strong><Button appearance="subtle" disabled={!selectedTimeline || week >= cycleWeeks} onClick={() => setWeek(week + 1)}>下一周</Button></div>
    {!selectedTimeline ? <div className="empty-command">请先选择公共时间线。</div> : !selectedGroups.length ? <div className="empty-command">请选择参与排课的分组。</div> : <div className="cross-group-grid" style={{ gridTemplateColumns: `minmax(180px, 1fr) repeat(${selectedGroups.length}, minmax(180px, 1fr))` }}><div className="grid-head">时间段</div>{selectedGroups.map((groupId) => <div className="grid-head" key={groupId}>{groups.find((item) => item.id === groupId)?.name ?? '未命名分组'}</div>)}{entries.map((entry, index) => <div className="cross-group-row" key={entry.id}><div className="time-cell"><strong>第 {index + 1} 节</strong><span>{entry.startTime}–{entry.endTime}</span></div>{selectedGroups.map((groupId) => { const current = drafts[groupId] ? activeDay(drafts[groupId], day, week) : undefined; const value = current?.entries.find((item) => (item.sourceEntryId ?? item.id) === entry.id)?.subjectId ?? ''; return <Select key={groupId} aria-label={`${groups.find((item) => item.id === groupId)?.name ?? '分组'} 第 ${index + 1} 节`} value={value} disabled={!current} onChange={(event) => setCell(groupId, entry.id, event.target.value)}><option value="">未设置</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</Select> })}</div>)}</div>}
  </Card></div>
}
