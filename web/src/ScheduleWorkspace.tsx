import { useEffect, useMemo, useState } from 'react'
import { Add24Regular, ArrowUpload24Regular, Copy24Regular, Save24Regular, Send24Regular } from '@fluentui/react-icons'
import { api, type ClassGroup, type Group, type ScheduleRecord, type TimelineRecord } from './api'
import { ClassSelector } from './ClassSelector'
import { Button, Checkbox, Field, Input, Select } from '@fluentui/react-components'

type Course = { id: string; name: string; simplifiedName?: string; teacher?: string; color?: string; location?: string; isLocalClassroom: boolean }
type Entry = { id: string; sourceEntryId?: string; type: 'class' | 'break' | 'activity' | 'free' | 'preparation'; startTime: string; endTime: string; subjectId?: string; title?: string }
type Day = { id: string; entries: Entry[]; dayOfWeek?: number[]; weeks?: 'all' | number | number[] | null; date?: string; timelineId?: string }
type Assignment = { id: string; timelineId: string; entryId: string; dayOfWeek?: number[]; weeks?: 'all' | number | number[] | null; subjectId?: string }
type ScheduleMeta = { id?: string; version?: 1; maxWeekCycle: number; startDate?: string }
type Schedule = { meta: ScheduleMeta; subjects: Course[]; days: Day[]; overrides: Array<Record<string, unknown>>; timelineIds: string[]; assignments: Assignment[] }
type Props = { organizationId: string; groups: Group[]; classGroups: ClassGroup[]; onComplete: (message: string, tone?: 'success' | 'error') => void }
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
function emptySchedule(): Schedule { const meta: ScheduleMeta = { id: crypto.randomUUID(), version: 1, maxWeekCycle: 2, startDate: new Date().toISOString().slice(0, 10) }; return { meta, subjects: [], days: [], overrides: [], timelineIds: [], assignments: [] } }
function normalize(value: Record<string, unknown>): Schedule { const source = value as unknown as Partial<Schedule>; const base = emptySchedule(); const meta: ScheduleMeta = { ...base.meta, ...(source.meta ?? {}) }; return { ...base, ...source, meta, subjects: source.subjects ?? [], days: source.days ?? [], overrides: source.overrides ?? [], timelineIds: source.timelineIds ?? [], assignments: source.assignments ?? [] } }
function checks(groups: Group[], classGroups: ClassGroup[], selected: string[], setSelected: (ids: string[]) => void, idPrefix = 'schedule-group') { return <ClassSelector groups={groups} classGroups={classGroups} selected={selected} onChange={setSelected} idPrefix={idPrefix} /> }
function fromTimeline(item: TimelineRecord): Day[] { const days = Array.isArray(item.timeline.dayOfWeek) && item.timeline.dayOfWeek.length ? item.timeline.dayOfWeek as number[] : [undefined]; return days.map((day) => ({ id: `${item.id}:${day ?? 'date'}`, timelineId: item.id, entries: (item.timeline.entries as Entry[] ?? []).map((entry) => ({ ...entry, sourceEntryId: entry.id, id: `${item.id}:${day ?? 'date'}:${entry.id}`, subjectId: undefined })), dayOfWeek: day == null ? undefined : [day], weeks: item.timeline.weeks as Day['weeks'], date: item.timeline.date as string | undefined })) }
function assignments(schedule: Schedule): Assignment[] { const selected = new Set(schedule.timelineIds); return schedule.days.flatMap((day) => !day.timelineId || !selected.has(day.timelineId) ? [] : day.entries.filter((entry) => entry.type === 'class' || entry.type === 'activity').map((entry) => ({ id: `${day.id}:${entry.id}`, timelineId: day.timelineId!, entryId: entry.sourceEntryId ?? entry.id, dayOfWeek: day.dayOfWeek, weeks: day.weeks, subjectId: entry.subjectId }))) }

export function ScheduleWorkspace({ organizationId, groups, classGroups, onComplete }: Props) {
  const [records, setRecords] = useState<ScheduleRecord[]>([]); const [timelines, setTimelines] = useState<TimelineRecord[]>([]); const [courses, setCourses] = useState<Course[]>([]); const [editingId, setEditingId] = useState<string | null>(null); const [name, setName] = useState('新课表'); const [schedule, setSchedule] = useState<Schedule>(emptySchedule); const [tab, setTab] = useState<'resources' | 'schedule'>('resources'); const [publishGroups, setPublishGroups] = useState<string[]>([]); const [week, setWeek] = useState(1)
  const load = async () => { if (!organizationId) return; try { const [nextRecords, nextTimelines, nextCourses] = await Promise.all([api.schedules(organizationId), api.timelines(organizationId), api.courses(organizationId)]); const availableCourses = nextCourses.map((course) => ({ id: course.id, name: course.name, simplifiedName: course.simplifiedName, teacher: course.teacher, color: course.color, location: course.location, isLocalClassroom: course.isLocalClassroom })); setRecords(nextRecords); setTimelines(nextTimelines); setCourses(availableCourses); if (!editingId && nextCourses.length) setSchedule((value) => value.subjects.length ? value : ({ ...emptySchedule(), subjects: availableCourses } as Schedule)) } catch { /* parent displays request failures */ } }
  useEffect(() => { void load() }, [organizationId])
  function reset() { setEditingId(null); setName('新课表'); setSchedule({ ...emptySchedule(), subjects: courses } as Schedule); setPublishGroups([]); setTab('resources') }
  function edit(record: ScheduleRecord) { setEditingId(record.id); setName(record.name); setSchedule(normalize(structuredClone(record.schedule))); setPublishGroups(record.group_ids); setTab('resources') }
  function chooseTimelines(ids: string[]) { const old = new Map(schedule.days.map((day) => [day.id, day])); const days = timelines.filter((item) => ids.includes(item.id)).flatMap((item) => fromTimeline(item).map((day) => old.get(day.id) ?? day)); setSchedule({ ...schedule, timelineIds: ids, days }) }
  async function importSchedule(file: File | undefined) {
    if (!file) return
    try {
      const json = JSON.parse(await file.text()) as Record<string, unknown>
      const candidate = ('schedule' in json ? json.schedule : json) as Record<string, unknown>
      const importedSubjects = Array.isArray(candidate.subjects) ? candidate.subjects as Course[] : []
      const importedDays = Array.isArray(candidate.days) ? candidate.days as Day[] : []
      if (!candidate.meta || !importedSubjects.length || !importedDays.length) throw new Error('文件不是有效的 Class Widgets 2 课表')

      // 课程按名称合并：同名课程覆盖现有配置，不同名课程新建。
      const existingByName = new Map(courses.map((course) => [course.name, course]))
      const subjectIds = new Map<string, string>()
      for (const subject of importedSubjects) {
        const existing = existingByName.get(subject.name)
        const payload = { ...subject, id: existing?.id ?? subject.id, name: subject.name }
        const result = existing
          ? await api.updateCourse(existing.id, { course: payload })
          : await api.createCourse({ organization_id: organizationId, course: payload })
        subjectIds.set(subject.id, result.id)
        existingByName.set(subject.name, result)
      }

      // 旧课表的时间段提取为一个新的共享时间线，课程绑定全部留给新课表的 assignments。
      const sourceDay = importedDays.find((day) => day.entries.length) ?? importedDays[0]
      const timelineEntries = sourceDay.entries.map((entry) => ({ ...entry, subjectId: undefined, title: entry.title }))
      const timelineDays = [...new Set(importedDays.flatMap((day) => day.dayOfWeek ?? []))]
      const timeline = await api.createTimeline({
        organization_id: organizationId,
        timeline: { id: crypto.randomUUID(), name: `${file.name.replace(/\.json$/i, '') || '导入'} 时间线`, entries: timelineEntries, dayOfWeek: timelineDays.length ? timelineDays : [1, 2, 3, 4, 5], weeks: 'all' },
      })
      const timelineId = timeline.id
      const timelineEntryIds = timelineEntries.map((entry) => entry.id)
      const days = importedDays.map((day, dayIndex) => ({
        ...day,
        timelineId,
        entries: day.entries.map((entry, entryIndex) => ({ ...entry, id: `${timelineId}:${dayIndex}:${entryIndex}`, sourceEntryId: timelineEntryIds[entryIndex] ?? entry.id, subjectId: entry.subjectId ? subjectIds.get(entry.subjectId) : undefined })),
      }))
      const importedSchedule = normalize({ ...candidate, days, timelineIds: [timelineId], subjects: [...existingByName.values()], assignments: [] })
      const data = { ...importedSchedule, assignments: assignments(importedSchedule) }
      const result = await api.publishSchedule({ organization_id: organizationId, name: file.name.replace(/\.json$/i, '') || '导入的课表', schedule: data, group_ids: [] })
      setEditingId(result.id)
      setName(file.name.replace(/\.json$/i, '') || '导入的课表')
      setSchedule(importedSchedule)
      setPublishGroups([])
      await load()
      onComplete(`已拆分导入：新建时间线、课表，并合并 ${importedSubjects.length} 个课表课程`)
    } catch (error) { onComplete(error instanceof Error ? error.message : '课表导入失败', 'error') }
  }
  async function save(publish = false) { try { const knownTimelineIds = new Set(timelines.map((item) => item.id)); const timelineIds = [...new Set([...schedule.timelineIds, ...schedule.days.map((day) => day.timelineId).filter((id): id is string => Boolean(id) && knownTimelineIds.has(id!))])].filter((id) => knownTimelineIds.has(id)); const prepared = { ...schedule, timelineIds }; const data = { ...prepared, assignments: assignments(prepared) }; const result = editingId ? await api.updateSchedule(editingId, { name: name.trim() || '未命名课表', schedule: data }) : await api.publishSchedule({ organization_id: organizationId, name: name.trim() || '未命名课表', schedule: data, group_ids: [] }); if (publish) await api.assignSchedule(result.id, publishGroups); setEditingId(result.id); onComplete(publish ? `已创建课表 r${result.revision} 并发布` : `已创建课表 r${result.revision}`); await load() } catch (error) { onComplete(error instanceof Error ? error.message : '保存失败', 'error') } }
  async function clone(record: ScheduleRecord) { try { const result = await api.cloneSchedule(record.id, `${record.name} - 副本`); onComplete(`副本 r${result.revision} 已保存`); await load() } catch (error) { onComplete(error instanceof Error ? error.message : '克隆失败', 'error') } }
  async function publish(record: ScheduleRecord, ids: string[]) { try { await api.assignSchedule(record.id, ids); onComplete(ids.length ? `“${record.name}”已发布到 ${ids.length} 个班级` : `“${record.name}”已取消发布`); await load() } catch (error) { onComplete(error instanceof Error ? error.message : '发布失败', 'error') } }
  return <div className="schedule-workspace"><section className="resource-sidebar data-section"><div className="section-heading"><h2>课表资源</h2><Button appearance="subtle" icon={<Add24Regular />} onClick={reset}>新建</Button></div><div className="resource-nav">{records.map((record) => <article className={editingId === record.id ? 'selected' : ''} key={record.id}><Button appearance="subtle" className="resource-main" onClick={() => edit(record)}><strong>{record.name}</strong><span>r{record.revision} · {record.group_ids.length ? `${record.group_ids.length} 个班级` : '草稿'}</span></Button><Button appearance="subtle" icon={<Copy24Regular />} title="克隆" onClick={() => void clone(record)} /></article>)}</div></section><section className="schedule-editor form-section"><div className="editor-commandbar"><Field label="课表名称" hint={editingId ? '编辑现有课表；保存时创建新修订' : '尚未保存的课表'}><Input aria-label="课表名称" value={name} onChange={(_, data) => setName(data.value)} /></Field><Button appearance="secondary" icon={<ArrowUpload24Regular />} className="import-button">导入 JSON<input type="file" accept="application/json,.json" onChange={(event) => { void importSchedule(event.target.files?.[0]); event.target.value = '' }} /></Button><Button appearance="secondary" icon={<Save24Regular />} onClick={() => void save()}>仅保存</Button><Button appearance="primary" icon={<Send24Regular />} disabled={!publishGroups.length || !schedule.timelineIds.length} onClick={() => void save(true)}>保存并发布</Button></div><div className="meta-strip"><Field label="开学日期"><Input type="date" value={schedule.meta.startDate} onChange={(_, data) => setSchedule({ ...schedule, meta: { ...schedule.meta, startDate: data.value } })} /></Field><Field label="最大周循环"><Input type="number" min={1} max={52} value={String(schedule.meta.maxWeekCycle)} onChange={(_, data) => setSchedule({ ...schedule, meta: { ...schedule.meta, maxWeekCycle: Number(data.value) } })} /></Field><fieldset><legend>发布目标</legend>{checks(groups, classGroups, publishGroups, setPublishGroups)}</fieldset></div><div className="editor-tabs"><Button appearance="subtle" className={tab === 'resources' ? 'active' : ''} onClick={() => setTab('resources')}>1. 选择时间线</Button><Button appearance="subtle" className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>2. 排课</Button></div>{tab === 'resources' && <TimelineSelection schedule={schedule} timelines={timelines} onChange={chooseTimelines} />}{tab === 'schedule' && <WeeklyEditor schedule={schedule} setSchedule={setSchedule} week={week} setWeek={setWeek} />}</section><SchedulePublishLibrary records={records} groups={groups} classGroups={classGroups} onPublish={publish} /></div>
}
function TimelineSelection({ schedule, timelines, onChange }: { schedule: Schedule; timelines: TimelineRecord[]; onChange: (ids: string[]) => void }) { return <div className="resource-selection"><div className="section-heading"><div><h2>使用的时间线</h2><span>课程表必须选择时间线，排课只能使用其时间段。</span></div></div>{timelines.length === 0 && <div className="empty-command">暂无时间线，请先在“时间线”设置页创建。</div>}{timelines.map((timeline) => { const date = typeof timeline.timeline.date === 'string' ? timeline.timeline.date : undefined; const weekdays = Array.isArray(timeline.timeline.dayOfWeek) ? (timeline.timeline.dayOfWeek as number[]).map((day) => DAYS[day - 1]).join('、') : ''; const rule = date ?? (weekdays || '未指定规则'); return <label className="resource-choice" key={timeline.id}><Checkbox checked={schedule.timelineIds.includes(timeline.id)} onChange={(_, data) => onChange(data.checked ? [...schedule.timelineIds, timeline.id] : schedule.timelineIds.filter((id) => id !== timeline.id))} /><span><strong>{timeline.name}</strong><small>{(timeline.timeline.entries as Entry[] ?? []).length} 个时间段 · {rule}</small></span></label> })}</div> }
function WeeklyEditor({ schedule, setSchedule, week, setWeek }: { schedule: Schedule; setSchedule: (value: Schedule) => void; week: number; setWeek: (value: number) => void }) {
  const days = useMemo(() => schedule.days.filter((day) => day.dayOfWeek?.some((value) => value >= 1 && value <= 7)).sort((a, b) => (a.dayOfWeek?.[0] ?? 8) - (b.dayOfWeek?.[0] ?? 8)), [schedule.days])
  const rows = useMemo(() => Math.max(0, ...days.map((day) => day.entries.length)), [days])
  function setCell(day: Day, entry: Entry, subjectId: string) {
    const nextDays = schedule.days.map((item) => item.id === day.id ? { ...item, entries: item.entries.map((value) => value.id === entry.id ? { ...value, subjectId } : value) } : item)
    setSchedule({ ...schedule, days: nextDays, assignments: assignments({ ...schedule, days: nextDays }) })
  }
  return <div className="weekly-editor"><div className="week-toolbar"><Button appearance="subtle" disabled={week <= 1} onClick={() => setWeek(week - 1)}>上一周</Button><strong>循环第 {week} 周</strong><Button appearance="subtle" disabled={week >= schedule.meta.maxWeekCycle} onClick={() => setWeek(week + 1)}>下一周</Button><span></span></div>{!schedule.timelineIds.length ? <div className="empty-command">请先选择时间线。</div> : <div className="weekly-grid" style={{ gridTemplateColumns: `minmax(110px, 140px) repeat(${days.length || 1}, minmax(180px, 1fr))` }}><div className="grid-head">课次</div>{days.map((day) => <div className="grid-head" key={day.id}>{DAYS[day.dayOfWeek?.[0] ? day.dayOfWeek[0] - 1 : 0]}</div>)}{Array.from({ length: rows }, (_, row) => <div className="weekly-row" key={`row-${row}`}><div className="time-cell"><strong>第 {row + 1} 节</strong><span>{days.find((day) => day.entries[row])?.entries[row]?.startTime ?? '--:--'}–{days.find((day) => day.entries[row])?.entries[row]?.endTime ?? '--:--'}</span></div>{days.map((day) => { const entry = day.entries[row]; return entry ? <Select key={day.id} aria-label={`${DAYS[day.dayOfWeek?.[0] ? day.dayOfWeek[0] - 1 : 0]} 第 ${row + 1} 节`} value={entry.subjectId ?? ''} onChange={(event) => setCell(day, entry, event.target.value)}><option value="">未设置</option>{schedule.subjects.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</Select> : <div className="schedule-empty-cell" key={day.id}>无时间段</div> })}</div>)}</div>}</div>
}
function SchedulePublishLibrary({ records, groups, classGroups, onPublish }: { records: ScheduleRecord[]; groups: Group[]; classGroups: ClassGroup[]; onPublish: (record: ScheduleRecord, ids: string[]) => void }) { const [selection, setSelection] = useState<Record<string, string[]>>({}); return <section className="publish-library data-section"><div className="section-heading"><h2>独立发布</h2><span>替换已保存课表的发布目标</span></div>{records.map((record) => { const ids = selection[record.id] ?? record.group_ids; return <article key={record.id}><div><strong>{record.name}</strong><span>r{record.revision}</span></div>{checks(groups, classGroups, ids, (value) => setSelection({ ...selection, [record.id]: value }), `schedule-publish-${record.id}`)}<button className="primary" onClick={() => onPublish(record, ids)}><Send24Regular />{ids.length ? '发布' : '取消发布'}</button></article>})}</section> }
