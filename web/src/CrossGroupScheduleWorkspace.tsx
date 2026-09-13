import { useEffect, useMemo, useState } from 'react'
import { Save24Regular, Send24Regular } from '@fluentui/react-icons'
import { Button, Card, CardHeader, Field, Select, Text } from '@fluentui/react-components'
import { api, type ClassGroup, type Group, type ScheduleRecord, type TimelineRecord } from './api'
import { ClassSelector } from './ClassSelector'
import { useWorkspaceStyles } from './styles/workspaceStyles'

type Course = { id: string; name: string; simplifiedName?: string; teacher?: string; icon?: string; color?: string; location?: string; isLocalClassroom: boolean }
type Entry = { id: string; sourceEntryId?: string; type: 'class' | 'break' | 'activity' | 'free' | 'preparation'; startTime: string; endTime: string; title?: string; subjectId?: string }
type Day = { id: string; timelineId: string; entries: Entry[]; dayOfWeek?: number[]; weeks?: 'all' | number | number[] | null; date?: string }
type Assignment = { id: string; timelineId: string; entryId: string; dayOfWeek?: number[]; weeks?: 'all' | number | number[] | null; subjectId?: string }
type Schedule = { meta: { id: string; version: 1; maxWeekCycle: number; startDate: string }; subjects: Course[]; days: Day[]; overrides: Array<Record<string, unknown>>; timelineIds: string[]; assignments: Assignment[] }
type Props = { organizationId: string; groups: Group[]; classGroups: ClassGroup[]; onComplete: (message: string, tone?: 'success' | 'error') => void }

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

function assignmentFor(schedule: Schedule, day: Day, entry: Entry, week: number) {
  const entryId = entry.sourceEntryId ?? entry.id
  return schedule.assignments.find((item) => (item.entryId === entryId || item.entryId === entry.id) && (item.dayOfWeek?.includes(day.dayOfWeek?.[0] ?? 0) ?? true) && appliesToWeek(item.weeks, week))
}

export function CrossGroupScheduleWorkspace({ organizationId, groups, classGroups, onComplete }: Props) {
  const styles = useWorkspaceStyles()
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
    // 班级的当前课表是唯一的课程来源；所选时间线只决定本页展示哪些时间段。
    const record = records.find((item) => item.group_ids.includes(groupId))
    if (!record) return timelineDays(selectedTimeline, courses)
    const source = structuredClone(record.schedule) as unknown as Schedule
    const oldSubjects = Array.isArray((source as { subjects?: Course[] }).subjects) ? (source as { subjects: Course[] }).subjects : []
    const idsByName = new Map(courses.map((course) => [course.name, course.id]))
    const subjectIdMap = new Map(oldSubjects.map((subject) => [subject.id, idsByName.get(subject.name) ?? subject.id]))
    const draft = timelineDays(selectedTimeline, courses)
    draft.meta = { ...draft.meta, ...source.meta }
    const sourceDays = source.days ?? []
    const sourceAssignments = source.assignments ?? []
    draft.days = draft.days.map((targetDay) => {
      const sourceDay = sourceDays.find((item) => item.dayOfWeek?.some((value) => targetDay.dayOfWeek?.includes(value)) && appliesToWeek(item.weeks, targetDay.weeks === 'all' || targetDay.weeks == null ? 1 : targetDay.weeks as number))
      return {
        ...targetDay,
        entries: targetDay.entries.map((entry, index) => {
          const sourceEntry = sourceDay?.entries[index]
          const sourceEntryId = sourceEntry?.sourceEntryId ?? sourceEntry?.id
          const assignment = sourceAssignments.find((item) => (sourceEntryId && item.entryId === sourceEntryId) && (item.dayOfWeek?.includes(targetDay.dayOfWeek?.[0] ?? 0) ?? true) && appliesToWeek(item.weeks, 1))
          const subjectId = assignment?.subjectId ?? sourceEntry?.subjectId
          return { ...entry, subjectId: subjectId ? subjectIdMap.get(subjectId) ?? subjectId : undefined }
        }),
      }
    })
    draft.assignments = buildAssignments(draft)
    return draft
  }

  function selectGroups(ids: string[]) {
    setSelectedGroups(ids)
    setDrafts((value) => Object.fromEntries(ids.map((id) => [id, value[id] ?? createDraft(id)!])))
  }

  function setCell(groupId: string, sourceEntryId: string, entryIndex: number, subjectId: string) {
    setDrafts((value) => {
      const current = value[groupId]
      if (!current) return value
      const target = activeDay(current, day, week)
      if (!target) return value
      const days = current.days.map((item) => item.id === target.id ? {
        ...item,
        entries: item.entries.map((entry, index) => (index === entryIndex || (entry.sourceEntryId ?? entry.id) === sourceEntryId) ? { ...entry, subjectId: subjectId || undefined } : entry),
      } : item)
      const assignments = current.assignments.filter((item) => !(item.timelineId === target.timelineId && item.entryId === sourceEntryId && (item.dayOfWeek?.includes(day) ?? true) && appliesToWeek(item.weeks, week)))
      assignments.push({ id: `${target.id}:${sourceEntryId}`, timelineId: target.timelineId, entryId: sourceEntryId, dayOfWeek: [day], weeks: target.weeks, subjectId: subjectId || undefined })
      return { ...value, [groupId]: { ...current, days, assignments } }
    })
  }

  async function save(publish: boolean) {
    if (!selectedTimeline) return onComplete('请先选择公共时间线', 'error')
    if (!selectedGroups.length) return onComplete('请至少选择一个班级', 'error')
    try {
      for (const groupId of selectedGroups) {
        const draft = drafts[groupId]
        if (!draft) continue
        const payload = { ...draft, subjects: courses, assignments: buildAssignments(draft) }
        const current = records.find((item) => item.group_ids.includes(groupId))
        const result = current
          ? await api.updateSchedule(current.id, { name: current.name, schedule: payload })
          : await api.publishSchedule({ organization_id: organizationId, name: `${groups.find((item) => item.id === groupId)?.name ?? '班级'} - 按天排课`, schedule: payload, group_ids: [] })
        if (publish) await api.assignSchedule(result.id, [groupId])
      }
      onComplete(publish ? '已按班级保存并发布' : '已保存按天排课草稿')
      await load()
    } catch (error) {
      onComplete(error instanceof Error ? error.message : '保存按天排课失败', 'error')
    }
  }

  return <Card>
    <CardHeader
      header={<Text as="h2" weight="semibold" size={400}>按天拉通排课</Text>}
      description={<Text size={200}>共用一条时间线，按天为多个班级同时安排课程。</Text>}
    />
    <div className={styles.commandBarActions}>
      <Button appearance="secondary" icon={<Save24Regular />} onClick={() => void save(false)}>保存草稿</Button>
      <Button appearance="primary" icon={<Send24Regular />} onClick={() => void save(true)}>保存并发布</Button>
    </div>
    <div className={styles.row}>
      <Field label="公共时间线"><Select value={timelineId} onChange={(_, data) => { setTimelineId(data.value); setSelectedGroups([]); setDrafts({}); setWeek(1) }}><option value="">选择时间线</option>{timelines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field className={styles.grow} label="参与班级"><ClassSelector groups={groups} classGroups={classGroups} selected={selectedGroups} onChange={selectGroups} idPrefix="cross-group" /></Field>
    </div>
    <div className={styles.marker}>{DAYS.map((label, index) => <Button appearance={day === index + 1 ? 'primary' : 'secondary'} key={label} onClick={() => setDay(index + 1)}>{label}</Button>)}</div>
    <div className={styles.commandBarActions} style={{ justifyContent: 'flex-start' }}><Button appearance="subtle" disabled={week <= 1} onClick={() => setWeek(week - 1)}>上一周</Button><Text weight="semibold">循环第 {week} 周</Text><Button appearance="subtle" disabled={!selectedTimeline || week >= cycleWeeks} onClick={() => setWeek(week + 1)}>下一周</Button></div>
    <div className={styles.gridScroll}>
      {!selectedTimeline
        ? <div className={styles.empty}>请先选择公共时间线。</div>
        : !selectedGroups.length
          ? <div className={styles.empty}>请选择参与排课的班级。</div>
          : <div className={styles.weekGrid} style={{ gridTemplateColumns: `minmax(180px, 1fr) repeat(${selectedGroups.length}, minmax(180px, 1fr))` }}>
            <div className={styles.gridHead}>时间段</div>
            {selectedGroups.map((groupId) => <div className={styles.gridHead} key={groupId}>{groups.find((item) => item.id === groupId)?.name ?? '未命名班级'}</div>)}
            {entries.map((entry, index) => <div className={styles.weekRow} key={entry.id}>
              <div className={styles.timeCell}><Text weight="semibold" block>第 {index + 1} 节</Text><Text className={styles.muted} size={200} block>{entry.startTime}–{entry.endTime}</Text></div>
              {selectedGroups.map((groupId) => {
                const current = drafts[groupId] ? activeDay(drafts[groupId], day, week) : undefined
                const currentEntry = current?.entries[index] ?? current?.entries.find((item) => (item.sourceEntryId ?? item.id) === entry.id)
                const value = currentEntry?.subjectId ?? (current && currentEntry ? assignmentFor(drafts[groupId], current, currentEntry, week)?.subjectId ?? '' : '')
                return <Select key={groupId} aria-label={`${groups.find((item) => item.id === groupId)?.name ?? '班级'} 第 ${index + 1} 节`} value={value} disabled={!current} onChange={(_, data) => setCell(groupId, entry.id, index, data.value)}>
                  <option value="">未设置</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </Select>
              })}
            </div>)}
          </div>}
    </div>
  </Card>
}
