import { useEffect, useMemo, useState } from 'react'
import {
  Add24Regular,
  ArrowDownload24Regular,
  Copy24Regular,
  Delete24Regular,
  ArrowUpload24Regular,
  Save24Regular,
  Send24Regular,
} from '@fluentui/react-icons'
import { api, type Group, type ScheduleRecord } from './api'

type WeekSelector = 'all' | number | number[] | null
type Subject = { id: string; name: string; simplifiedName?: string; teacher?: string; icon?: string; color?: string; location?: string; isLocalClassroom: boolean }
type Entry = { id: string; type: 'class' | 'break' | 'activity' | 'free'; startTime: string; endTime: string; subjectId?: string; title?: string }
type Timeline = { id: string; entries: Entry[]; dayOfWeek?: number[]; weeks?: WeekSelector; date?: string }
type Override = { id: string; entryId: string; dayOfWeek?: number[]; weeks?: WeekSelector; subjectId?: string; title?: string; startTime?: string; endTime?: string }
type Schedule = { meta: { id: string; version: 1; maxWeekCycle: number; startDate: string }; subjects: Subject[]; days: Timeline[]; overrides: Override[] }
type Tab = 'timeline' | 'schedule' | 'subjects'
type Props = { organizationId: string; groups: Group[]; onComplete: (message: string, tone?: 'success' | 'error') => void }

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'chinese', name: '语文', simplifiedName: '语', icon: 'ic_fluent_book_20_regular', color: '#FF5722', isLocalClassroom: true },
  { id: 'math', name: '数学', simplifiedName: '数', icon: 'ic_fluent_ruler_20_regular', color: '#3F51B5', isLocalClassroom: true },
  { id: 'english', name: '英语', simplifiedName: '英', icon: 'ic_fluent_text_list_abc_uppercase_ltr_20_filled', color: '#2196F3', isLocalClassroom: true },
  { id: 'politics', name: '政治', simplifiedName: '政', icon: 'ic_fluent_book_globe_20_regular', color: '#9C27B0', isLocalClassroom: true },
  { id: 'history', name: '历史', simplifiedName: '史', icon: 'ic_fluent_clock_20_regular', color: '#795548', isLocalClassroom: true },
  { id: 'physics', name: '物理', simplifiedName: '物', icon: 'ic_fluent_lightbulb_filament_20_regular', color: '#00BCD4', isLocalClassroom: true },
  { id: 'chemistry', name: '化学', simplifiedName: '化', icon: 'ic_fluent_hexagon_three_20_regular', color: '#4CAF50', isLocalClassroom: true },
  { id: 'biology', name: '生物', simplifiedName: '生', icon: 'ic_fluent_leaf_three_20_regular', color: '#8BC34A', isLocalClassroom: true },
  { id: 'geography', name: '地理', simplifiedName: '地', icon: 'ic_fluent_earth_20_regular', color: '#009688', isLocalClassroom: true },
  { id: 'music', name: '音乐', simplifiedName: '音', icon: 'ic_fluent_music_note_2_20_regular', color: '#E91E63', isLocalClassroom: true },
  { id: 'art', name: '美术', simplifiedName: '美', icon: 'ic_fluent_draw_shape_20_regular', color: '#F44336', isLocalClassroom: true },
  { id: 'psychology', name: '心理', simplifiedName: '心', icon: 'ic_fluent_brain_sparkle_20_regular', color: '#FF9800', isLocalClassroom: true },
  { id: 'pe', name: '体育', simplifiedName: '体', icon: 'ic_fluent_person_running_20_regular', color: '#CDDC39', isLocalClassroom: false },
  { id: 'it', name: '信息技术', simplifiedName: '信', icon: 'ic_fluent_laptop_20_regular', color: '#607D8B', isLocalClassroom: true },
  { id: 'generaltech', name: '通用技术', simplifiedName: '通', icon: 'ic_fluent_wrench_settings_20_regular', color: '#FF9800', isLocalClassroom: true },
  { id: 'elective', name: '选修', simplifiedName: '选', icon: 'ic_fluent_sign_out_20_regular', color: '#9E9E9E', isLocalClassroom: false },
  { id: 'selfstudy', name: '自学', simplifiedName: '自', icon: 'ic_fluent_notebook_20_regular', color: '#607D8B', isLocalClassroom: true },
  { id: 'club', name: '社团', simplifiedName: '社', icon: 'ic_fluent_people_team_20_regular', color: '#673AB7', isLocalClassroom: true },
  { id: 'classmeeting', name: '班会', simplifiedName: '会', icon: 'ic_fluent_chat_20_regular', color: '#3F51B5', isLocalClassroom: true },
  { id: 'weeklytest', name: '周测', simplifiedName: '测', icon: 'ic_fluent_clipboard_20_regular', color: '#FF5722', isLocalClassroom: true },
]

function emptySchedule(): Schedule {
  return {
    meta: { id: crypto.randomUUID(), version: 1, maxWeekCycle: 2, startDate: new Date().toISOString().slice(0, 10) },
    subjects: structuredClone(DEFAULT_SUBJECTS),
    days: [{ id: crypto.randomUUID(), dayOfWeek: [1, 2, 3, 4, 5], weeks: 'all', entries: [] }],
    overrides: [],
  }
}

function normalizeSchedule(schedule: Schedule): Schedule {
  const overrideSubjectEntryIds = new Set(
    (schedule.overrides ?? [])
      .filter((override) => Boolean(override.subjectId))
      .map((override) => override.entryId),
  )
  return {
    ...schedule,
    subjects: schedule.subjects?.length ? schedule.subjects : structuredClone(DEFAULT_SUBJECTS),
    days: (schedule.days ?? []).map((day) => ({
      ...day,
      entries: day.entries.map((entry) => ({
        ...entry,
        subjectId: entry.subjectId?.trim() || undefined,
        title: entry.title?.trim() || (entry.subjectId || overrideSubjectEntryIds.has(entry.id) ? undefined : crypto.randomUUID()),
      })),
    })),
    overrides: schedule.overrides ?? [],
  }
}

function checks(groups: Group[], selected: string[], setSelected: (ids: string[]) => void) {
  return <div className="checks">{groups.map((group) => <label key={group.id}><input type="checkbox" checked={selected.includes(group.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, group.id] : selected.filter((id) => id !== group.id))} />{group.name}</label>)}</div>
}

export function ScheduleWorkspace({ organizationId, groups, onComplete }: Props) {
  const [records, setRecords] = useState<ScheduleRecord[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('新课表')
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule)
  const [tab, setTab] = useState<Tab>('timeline')
  const [publishGroups, setPublishGroups] = useState<string[]>([])
  const [week, setWeek] = useState(1)

  const load = () => { if (organizationId) void api.schedules(organizationId).then(setRecords).catch(() => undefined) }
  useEffect(load, [organizationId])

  function reset() { setEditingId(null); setName('新课表'); setSchedule(emptySchedule()); setPublishGroups([]); setTab('timeline') }
  function edit(record: ScheduleRecord) { setEditingId(record.id); setName(record.name); setSchedule(normalizeSchedule(structuredClone(record.schedule) as unknown as Schedule)); setPublishGroups(record.group_ids); setTab('timeline') }
  async function importSchedule(file: File | undefined) {
    if (!file) return
    try {
      if (/\.ya?ml$/i.test(file.name)) {
        const anchorDate = schedule.meta.startDate
        const result = await api.importCses(await file.text(), anchorDate)
        setEditingId(null)
        setName(result.name || file.name.replace(/\.ya?ml$/i, ''))
        setSchedule(normalizeSchedule(structuredClone(result.schedule) as unknown as Schedule))
        setPublishGroups([])
        setTab('timeline')
        const warnings = result.warnings.length ? `；注意：${result.warnings.join('；')}` : ''
        onComplete(`已按开学日期 ${anchorDate} 导入 CSES 课表“${result.name}”${warnings}`)
        return
      }
      const imported = JSON.parse(await file.text()) as Record<string, unknown>
      const candidate = ('schedule' in imported ? imported.schedule : imported) as Partial<Schedule>
      if (!candidate.meta || !Array.isArray(candidate.subjects) || !Array.isArray(candidate.days) || !Array.isArray(candidate.overrides)) {
        throw new Error('文件不是有效的 Class Widgets 2 课表')
      }
      const normalized = normalizeSchedule(structuredClone(candidate) as Schedule)
      setEditingId(null)
      setName(file.name.replace(/\.json$/i, '') || '导入的课表')
      setSchedule(normalized)
      setPublishGroups([])
      setTab('timeline')
      onComplete(`已导入课表“${file.name}”，保存后生效`)
    } catch (error) {
      onComplete(error instanceof Error ? error.message : '课表导入失败', 'error')
    }
  }
  async function exportCses() {
    try {
      const scheduleName = name.trim() || '课表'
      const result = await api.exportCses(scheduleName, normalizeSchedule(schedule))
      const url = URL.createObjectURL(new Blob([result.content], { type: 'application/x-yaml' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${scheduleName}.yaml`
      anchor.click()
      URL.revokeObjectURL(url)
      const warnings = result.warnings.length ? `，注意：${result.warnings.join('；')}` : ''
      onComplete(`已导出 CSES 文件“${scheduleName}.yaml”${warnings}`)
    } catch (error) {
      onComplete(error instanceof Error ? error.message : 'CSES 导出失败', 'error')
    }
  }
  async function save() {
    try {
      const result = editingId
        ? await api.updateSchedule(editingId, { name: name.trim() || crypto.randomUUID(), schedule: normalizeSchedule(schedule) })
        : await api.publishSchedule({ organization_id: organizationId, name: name.trim() || crypto.randomUUID(), schedule: normalizeSchedule(schedule), group_ids: [] })
      onComplete(`${editingId ? '新修订' : '课表草稿'} r${result.revision} 已保存`)
      setEditingId(result.id); load()
    } catch (error) { onComplete(error instanceof Error ? error.message : '保存失败', 'error') }
  }
  async function saveAndPublish() {
    if (!publishGroups.length) return
    try {
      const saved = editingId
        ? await api.updateSchedule(editingId, { name: name.trim() || crypto.randomUUID(), schedule: normalizeSchedule(schedule) })
        : await api.publishSchedule({ organization_id: organizationId, name: name.trim() || crypto.randomUUID(), schedule: normalizeSchedule(schedule), group_ids: [] })
      await api.assignSchedule(saved.id, publishGroups)
      setEditingId(saved.id); onComplete(`课表 r${saved.revision} 已保存并发布`); load()
    } catch (error) { onComplete(error instanceof Error ? error.message : '发布失败', 'error') }
  }
  async function clone(record: ScheduleRecord) {
    try { const result = await api.cloneSchedule(record.id, `${record.name} - 副本`); onComplete(`副本 r${result.revision} 已保存`); load() } catch (error) { onComplete(error instanceof Error ? error.message : '克隆失败', 'error') }
  }
  async function publish(record: ScheduleRecord, ids: string[]) {
    try { await api.assignSchedule(record.id, ids); onComplete(ids.length ? `“${record.name}”已发布到 ${ids.length} 个分组` : `“${record.name}”已取消发布`); load() } catch (error) { onComplete(error instanceof Error ? error.message : '发布失败', 'error') }
  }

  return <div className="schedule-workspace">
    <section className="resource-sidebar data-section">
      <div className="section-heading"><h2>课表资源</h2><button onClick={reset}><Add24Regular />新建</button></div>
      <div className="resource-nav">{records.map((record) => <article className={editingId === record.id ? 'selected' : ''} key={record.id}><button className="resource-main" onClick={() => edit(record)}><strong>{record.name}</strong><span>r{record.revision} · {record.group_ids.length ? `${record.group_ids.length} 个分组` : '草稿'}</span></button><button title="克隆" onClick={() => void clone(record)}><Copy24Regular /></button></article>)}</div>
    </section>
    <section className="schedule-editor form-section">
      <div className="editor-commandbar"><div><input aria-label="课表名称" value={name} onChange={(event) => setName(event.target.value)} /><span>{editingId ? '编辑现有课表；保存时创建新修订' : '尚未保存的课表'}</span></div><label className="import-button"><ArrowUpload24Regular />导入 JSON / CSES<input type="file" accept="application/json,.json,.yaml,.yml" onChange={(event) => { void importSchedule(event.target.files?.[0]); event.target.value = '' }} /></label><button onClick={() => void exportCses()}><ArrowDownload24Regular />导出 CSES</button><button onClick={() => void save()}><Save24Regular />仅保存</button><button className="primary" disabled={!publishGroups.length} onClick={() => void saveAndPublish()}><Send24Regular />保存并发布</button></div>
      <div className="meta-strip"><label>开学日期<input type="date" value={schedule.meta.startDate} onChange={(event) => setSchedule({ ...schedule, meta: { ...schedule.meta, startDate: event.target.value } })} /></label><label>最大周循环<input type="number" min={1} max={52} value={schedule.meta.maxWeekCycle} onChange={(event) => setSchedule({ ...schedule, meta: { ...schedule.meta, maxWeekCycle: Number(event.target.value) } })} /></label><fieldset><legend>发布目标</legend>{checks(groups, publishGroups, setPublishGroups)}</fieldset></div>
      <div className="editor-tabs"><button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>1. 时间线</button><button className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>2. 课表</button><button className={tab === 'subjects' ? 'active' : ''} onClick={() => setTab('subjects')}>3. 科目</button></div>
      {tab === 'timeline' && <TimelineEditor schedule={schedule} setSchedule={setSchedule} />}
      {tab === 'schedule' && <WeeklyEditor schedule={schedule} setSchedule={setSchedule} week={week} setWeek={setWeek} />}
      {tab === 'subjects' && <SubjectsEditor schedule={schedule} setSchedule={setSchedule} />}
    </section>
    <SchedulePublishLibrary records={records} groups={groups} onPublish={publish} />
  </div>
}

function TimelineEditor({ schedule, setSchedule }: { schedule: Schedule; setSchedule: (value: Schedule) => void }) {
  const [selectedId, setSelectedId] = useState(schedule.days[0]?.id ?? '')
  const selected = schedule.days.find((day) => day.id === selectedId) ?? schedule.days[0]
  function updateDay(next: Timeline) { setSchedule({ ...schedule, days: schedule.days.map((day) => day.id === next.id ? next : day) }) }
  function addDay() { const day: Timeline = { id: crypto.randomUUID(), dayOfWeek: [1], weeks: 'all', entries: [] }; setSchedule({ ...schedule, days: [...schedule.days, day] }); setSelectedId(day.id) }
  function cloneDay() { if (!selected) return; const day = structuredClone(selected); day.id = crypto.randomUUID(); day.entries = day.entries.map((entry) => ({ ...entry, id: crypto.randomUUID() })); setSchedule({ ...schedule, days: [...schedule.days, day] }); setSelectedId(day.id) }
  function removeDay() { if (!selected) return; setSchedule({ ...schedule, days: schedule.days.filter((day) => day.id !== selected.id), overrides: schedule.overrides.filter((override) => !selected.entries.some((entry) => entry.id === override.entryId)) }); setSelectedId('') }
  function addEntry() { if (!selected) return; updateDay({ ...selected, entries: [...selected.entries, { id: crypto.randomUUID(), type: 'class', startTime: '08:00', endTime: '08:40', subjectId: schedule.subjects[0]?.id }] }) }
  function updateEntry(id: string, patch: Partial<Entry>) { if (selected) updateDay({ ...selected, entries: selected.entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry).sort((a, b) => a.startTime.localeCompare(b.startTime)) }) }
  function removeEntry(id: string) { if (selected) { updateDay({ ...selected, entries: selected.entries.filter((entry) => entry.id !== id) }); setSchedule({ ...schedule, days: schedule.days.map((day) => day.id === selected.id ? { ...selected, entries: selected.entries.filter((entry) => entry.id !== id) } : day), overrides: schedule.overrides.filter((override) => override.entryId !== id) }) } }
  return <div className="timeline-editor"><aside><div className="pane-heading"><strong>日程规则</strong><button onClick={addDay}><Add24Regular /></button></div>{schedule.days.map((day, index) => <button className={selected?.id === day.id ? 'selected' : ''} key={day.id} onClick={() => setSelectedId(day.id)}><strong>时间线 {index + 1}</strong><span>{day.date || day.dayOfWeek?.map((value) => DAY_NAMES[value - 1]).join('、') || '未指定日期'} · {day.weeks === 'all' ? '每周' : `循环第 ${String(day.weeks)} 周`}</span></button>)}</aside>{selected ? <div className="timeline-detail"><div className="pane-heading"><strong>时间线规则</strong><div><button onClick={cloneDay}><Copy24Regular />复制</button><button onClick={removeDay}><Delete24Regular />删除</button></div></div><div className="timeline-rule"><label>规则类型<select value={selected.date ? 'date' : 'week'} onChange={(event) => updateDay(event.target.value === 'date' ? { ...selected, date: new Date().toISOString().slice(0, 10), dayOfWeek: undefined, weeks: 'all' } : { ...selected, date: undefined, dayOfWeek: [1], weeks: 'all' })}><option value="week">按星期</option><option value="date">按日期</option></select></label>{selected.date ? <label>指定日期<input type="date" value={selected.date} onChange={(event) => updateDay({ ...selected, date: event.target.value })} /></label> : <><fieldset><legend>星期</legend><div className="day-pills">{DAY_NAMES.map((label, index) => <label key={label}><input type="checkbox" checked={selected.dayOfWeek?.includes(index + 1)} onChange={(event) => updateDay({ ...selected, dayOfWeek: event.target.checked ? [...(selected.dayOfWeek ?? []), index + 1] : selected.dayOfWeek?.filter((day) => day !== index + 1) })} />{label}</label>)}</div></fieldset><label>周循环<select value={selected.weeks === 'all' ? 'all' : typeof selected.weeks === 'number' ? String(selected.weeks) : 'custom'} onChange={(event) => updateDay({ ...selected, weeks: event.target.value === 'all' ? 'all' : Number(event.target.value) })}><option value="all">每周</option>{Array.from({ length: schedule.meta.maxWeekCycle }, (_, index) => <option key={index + 1} value={index + 1}>循环第 {index + 1} 周</option>)}</select></label></>}</div><div className="pane-heading"><strong>时间条目</strong><button onClick={addEntry}><Add24Regular />添加条目</button></div><div className="entry-cards">{selected.entries.map((entry) => <div className="timeline-entry" key={entry.id}><select value={entry.type} onChange={(event) => updateEntry(entry.id, { type: event.target.value as Entry['type'] })}><option value="class">课程</option><option value="break">课间</option><option value="activity">活动</option><option value="free">空闲</option></select><input type="time" value={entry.startTime} onChange={(event) => updateEntry(entry.id, { startTime: event.target.value })} /><span>至</span><input type="time" value={entry.endTime} onChange={(event) => updateEntry(entry.id, { endTime: event.target.value })} /><select value={entry.subjectId ?? ''} disabled={entry.type !== 'class'} onChange={(event) => updateEntry(entry.id, { subjectId: event.target.value || undefined })}><option value="">未选择科目</option>{schedule.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><input placeholder="自定义标题" value={entry.title ?? ''} onChange={(event) => updateEntry(entry.id, { title: event.target.value || undefined })} /><button onClick={() => removeEntry(entry.id)}><Delete24Regular /></button></div>)}</div></div> : <div className="empty-command">新建一个时间线开始编辑</div>}</div>
}

function WeeklyEditor({ schedule, setSchedule, week, setWeek }: { schedule: Schedule; setSchedule: (value: Schedule) => void; week: number; setWeek: (value: number) => void }) {
  const entries = useMemo(() => { const map = new Map<string, Entry>(); schedule.days.forEach((day) => day.entries.forEach((entry) => map.set(entry.id, entry))); return [...map.values()].sort((a, b) => a.startTime.localeCompare(b.startTime)) }, [schedule.days])
  function applicable(override: Override, entryId: string, day: number) { if (override.entryId !== entryId || (override.dayOfWeek?.length && !override.dayOfWeek.includes(day))) return false; return override.weeks === 'all' || override.weeks == null || override.weeks === week || Array.isArray(override.weeks) && override.weeks.includes(week) }
  function value(entry: Entry, day: number) { const override = schedule.overrides.find((item) => applicable(item, entry.id, day)); return override?.subjectId ?? entry.subjectId ?? '' }
  function setCell(entry: Entry, day: number, subjectId: string) { const index = schedule.overrides.findIndex((item) => item.entryId === entry.id && item.dayOfWeek?.length === 1 && item.dayOfWeek[0] === day && item.weeks === week); const overrides = [...schedule.overrides]; if (!subjectId) { if (index >= 0) overrides.splice(index, 1) } else { const next: Override = { id: index >= 0 ? overrides[index].id : crypto.randomUUID(), entryId: entry.id, dayOfWeek: [day], weeks: week, subjectId }; if (index >= 0) overrides[index] = next; else overrides.push(next) } setSchedule({ ...schedule, overrides }) }
  return <div className="weekly-editor"><div className="week-toolbar"><button disabled={week <= 1} onClick={() => setWeek(week - 1)}>上一周</button><strong>循环第 {week} 周</strong><button disabled={week >= schedule.meta.maxWeekCycle} onClick={() => setWeek(week + 1)}>下一周</button><span>点击单元格选择科目；不同周可单独覆盖。</span></div><div className="weekly-grid"><div className="grid-head">时间</div>{DAY_NAMES.map((day) => <div className="grid-head" key={day}>{day}</div>)}{entries.map((entry) => <div className="weekly-row" key={entry.id}><div className="time-cell"><strong>{entry.title || (entry.type === 'class' ? '课程' : entry.type)}</strong><span>{entry.startTime}–{entry.endTime}</span></div>{DAY_NAMES.map((_day, index) => { const subjectId = value(entry, index + 1); const subject = schedule.subjects.find((item) => item.id === subjectId); return <select aria-label={`${DAY_NAMES[index]} ${entry.startTime}`} style={{ borderLeftColor: subject?.color ?? 'transparent' }} key={index} value={subjectId} onChange={(event) => setCell(entry, index + 1, event.target.value)}><option value="">未设置</option>{schedule.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> })}</div>)}</div></div>
}

function SubjectsEditor({ schedule, setSchedule }: { schedule: Schedule; setSchedule: (value: Schedule) => void }) {
  function add() { setSchedule({ ...schedule, subjects: [...schedule.subjects, { id: crypto.randomUUID(), name: '新科目', color: '#13b4d6', isLocalClassroom: true }] }) }
  function update(id: string, patch: Partial<Subject>) { setSchedule({ ...schedule, subjects: schedule.subjects.map((subject) => subject.id === id ? { ...subject, ...patch } : subject) }) }
  function remove(id: string) { setSchedule({ ...schedule, subjects: schedule.subjects.filter((subject) => subject.id !== id), days: schedule.days.map((day) => ({ ...day, entries: day.entries.map((entry) => entry.subjectId === id ? { ...entry, subjectId: undefined } : entry) })), overrides: schedule.overrides.filter((override) => override.subjectId !== id) }) }
  return <div className="subjects-editor"><div className="pane-heading"><strong>科目库</strong><div><button onClick={() => setSchedule({ ...schedule, subjects: structuredClone(DEFAULT_SUBJECTS) })}>恢复默认</button><button onClick={add}><Add24Regular />添加科目</button></div></div><div className="subject-grid">{schedule.subjects.map((subject) => <article key={subject.id} style={{ borderTopColor: subject.color ?? '#13b4d6' }}><div className="subject-card-title"><input type="color" value={subject.color ?? '#13b4d6'} onChange={(event) => update(subject.id, { color: event.target.value })} /><strong>{subject.name}</strong><button onClick={() => remove(subject.id)}><Delete24Regular /></button></div><label>名称<input value={subject.name} onChange={(event) => update(subject.id, { name: event.target.value })} /></label><label>简称<input value={subject.simplifiedName ?? ''} onChange={(event) => update(subject.id, { simplifiedName: event.target.value || undefined })} /></label><label>教师<input value={subject.teacher ?? ''} onChange={(event) => update(subject.id, { teacher: event.target.value || undefined })} /></label><label>图标<input value={subject.icon ?? ''} onChange={(event) => update(subject.id, { icon: event.target.value || undefined })} /></label><label>教室<input value={subject.location ?? ''} onChange={(event) => update(subject.id, { location: event.target.value || undefined })} /></label><label className="inline-check"><input type="checkbox" checked={subject.isLocalClassroom} onChange={(event) => update(subject.id, { isLocalClassroom: event.target.checked })} />本班教室课程</label></article>)}</div></div>
}

function SchedulePublishLibrary({ records, groups, onPublish }: { records: ScheduleRecord[]; groups: Group[]; onPublish: (record: ScheduleRecord, ids: string[]) => void }) {
  const [selection, setSelection] = useState<Record<string, string[]>>({})
  return <section className="publish-library data-section"><div className="section-heading"><h2>独立发布</h2><span>替换已保存课表的发布目标；清空可取消发布</span></div>{records.map((record) => { const ids = selection[record.id] ?? record.group_ids; return <article key={record.id}><div><strong>{record.name}</strong><span>r{record.revision}</span></div>{checks(groups, ids, (value) => setSelection({ ...selection, [record.id]: value }))}<button className="primary" onClick={() => onPublish(record, ids)}><Send24Regular />{ids.length ? '发布' : '取消发布'}</button></article> })}</section>
}
