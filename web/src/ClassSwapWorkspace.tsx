import { useEffect, useMemo, useState } from 'react'
import { ArrowSync24Regular, CalendarSync24Regular, Dismiss24Regular, Send24Regular } from '@fluentui/react-icons'
import { Button, Select } from '@fluentui/react-components'
import { api, type ClassSwapPreparation, type ClassSwapSession, type Device, type Group } from './api'

type Subject = { id: string; name: string }
type Entry = { id: string; type: string; startTime: string; endTime: string; subjectId?: string; title?: string }
type Timeline = { entries: Entry[]; dayOfWeek?: number[]; weeks?: 'all' | number | number[] | null }
type Schedule = { meta: { maxWeekCycle: number }; subjects: Subject[]; days: Timeline[] }
type Props = { organizationId: string; groups: Group[]; devices: Device[]; onComplete: (message: string, tone?: 'success' | 'error') => void }

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function applies(weeks: Timeline['weeks'], week: number, max: number) {
  if (weeks == null || weeks === 'all') return true
  if (Array.isArray(weeks)) return weeks.includes(week)
  return week >= weeks && (week - weeks) % max === 0
}

export function ClassSwapWorkspace({ organizationId, groups, devices, onComplete }: Props) {
  const [groupFilter, setGroupFilter] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [preparation, setPreparation] = useState<ClassSwapPreparation | null>(null)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [day, setDay] = useState(new Date().getDay() || 7)
  const [week, setWeek] = useState(1)
  const [operation, setOperation] = useState<'apply_today' | 'swap' | 'replace'>('apply_today')
  const [entryA, setEntryA] = useState('')
  const [entryB, setEntryB] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [sessions, setSessions] = useState<ClassSwapSession[]>([])

  const availableDevices = useMemo(() => devices.filter((device) => !device.revoked && (!groupFilter || device.group_id === groupFilter)), [devices, groupFilter])
  const selectedDevice = devices.find((device) => device.id === deviceId)
  const loadSessions = () => { if (organizationId) void api.classSwaps(organizationId).then(setSessions).catch(() => undefined) }
  useEffect(loadSessions, [organizationId])
  useEffect(() => { if (!availableDevices.some((device) => device.id === deviceId)) setDeviceId(availableDevices[0]?.id ?? '') }, [availableDevices, deviceId])

  const resetPreparation = () => { setRequestId(''); setPreparation(null); setSchedule(null); setEntryA(''); setEntryB(''); setSubjectId('') }
  const entries = useMemo(() => {
    if (!schedule) return []
    return schedule.days.find((item) => (item.dayOfWeek ?? []).includes(day) && applies(item.weeks, week, schedule.meta.maxWeekCycle))?.entries.filter((entry) => entry.type === 'class' || entry.type === 'activity') ?? []
  }, [schedule, day, week])
  const subjectName = (entry: Entry) => schedule?.subjects.find((subject) => subject.id === entry.subjectId)?.name ?? entry.title ?? '未命名'

  async function prepare() {
    if (!deviceId) return
    try {
      const result = await api.prepareClassSwap(deviceId)
      setRequestId(result.request_id); setPreparation(null); setSchedule(null)
      onComplete(`已请求 ${selectedDevice?.name ?? '设备'} 上传当前课表`)
      window.setTimeout(() => void refreshPreparation(result.request_id), 1200)
    } catch (error) { onComplete(error instanceof Error ? error.message : '请求课表失败', 'error') }
  }
  async function refreshPreparation(id = requestId) {
    if (!id || !deviceId) return
    try {
      const result = await api.classSwapPreparation(id, deviceId)
      setPreparation(result)
      if (result.ready) {
        const snapshot = await api.classSwapSnapshot(deviceId, id)
        const uploaded = snapshot.schedule as unknown as Schedule
        setSchedule(uploaded)
        setWeek((current) => Math.min(current, uploaded.meta.maxWeekCycle))
      }
    } catch (error) { onComplete(error instanceof Error ? error.message : '刷新上传状态失败', 'error') }
  }
  async function submit() {
    if (!requestId || !deviceId || !preparation?.ready) return
    try {
      await api.createClassSwap({ device_id: deviceId, request_id: requestId, operation, day_of_week: day, week_of_cycle: week, entry_id_a: operation === 'swap' ? entryA : '', entry_id_b: operation === 'swap' ? entryB : '', entry_id: operation === 'replace' ? entryA : '', subject_id: operation === 'replace' ? subjectId : '' })
      onComplete(`已向 ${selectedDevice?.name ?? '设备'} 下发临时换课`); loadSessions()
    } catch (error) { onComplete(error instanceof Error ? error.message : '下发失败', 'error') }
  }
  async function restore(id: string) {
    try { await api.restoreClassSwap(id); onComplete('已向该设备下发恢复事件'); loadSessions() }
    catch (error) { onComplete(error instanceof Error ? error.message : '恢复失败', 'error') }
  }

  const active = sessions.filter((session) => session.device_id === deviceId && session.status === 'active')
  return <div className="workspace-stack">
    <section className="panel"><div className="panel-heading"><div><h2>获取设备课表</h2><p>临时换课只影响选中的一台设备，分组仅用于筛选设备。</p></div></div>
      <div className="form-grid"><label>分组筛选<Select value={groupFilter} onChange={(_, data) => { setGroupFilter(data.value); resetPreparation() }}><option value="">全部分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></label><label>目标设备<Select value={deviceId} onChange={(_, data) => { setDeviceId(data.value); resetPreparation() }}>{availableDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</Select></label></div>
      <div className="button-row"><Button appearance="primary" icon={<CalendarSync24Regular />} disabled={!deviceId} onClick={() => void prepare()}>获取该设备课表</Button><Button icon={<ArrowSync24Regular />} disabled={!requestId} onClick={() => void refreshPreparation()}>刷新上传状态</Button></div>
      {preparation && <div className="checks"><label><span className={preparation.ready ? 'status-dot online' : 'status-dot'} />{preparation.device_name} · {preparation.ready ? '已上传' : '等待中'}</label></div>}
    </section>
    {schedule && <section className="panel"><div className="panel-heading"><div><h2>创建换课事件</h2><p>事件只会下发到 {selectedDevice?.name ?? '当前设备'}。</p></div></div>
      <div className="form-grid"><label>来源星期<Select value={String(day)} onChange={(_, data) => setDay(Number(data.value))}>{DAYS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</Select></label><label>周期周<Select value={String(week)} onChange={(_, data) => setWeek(Number(data.value))}>{Array.from({ length: schedule.meta.maxWeekCycle }, (_, index) => <option key={index + 1} value={index + 1}>第 {index + 1} 周</option>)}</Select></label><label>操作<Select value={operation} onChange={(_, data) => setOperation(data.value as typeof operation)}><option value="apply_today">整天替换</option><option value="swap">两节互换</option><option value="replace">单节替换</option></Select></label></div>
      <div className="schedule-grid">{entries.map((entry) => <div className="schedule-entry" key={entry.id}><strong>{subjectName(entry)}</strong><span>{entry.startTime}–{entry.endTime}</span><small>{entry.id}</small></div>)}</div>
      {operation !== 'apply_today' && <div className="form-grid"><label>{operation === 'swap' ? '第一节课' : '要替换的课'}<Select value={entryA} onChange={(_, data) => setEntryA(data.value)}><option value="">请选择</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{subjectName(entry)} · {entry.startTime}</option>)}</Select></label>{operation === 'swap' ? <label>第二节课<Select value={entryB} onChange={(_, data) => setEntryB(data.value)}><option value="">请选择</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{subjectName(entry)} · {entry.startTime}</option>)}</Select></label> : <label>替换为<Select value={subjectId} onChange={(_, data) => setSubjectId(data.value)}><option value="">请选择科目</option>{schedule.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</Select></label>}</div>}
      <Button appearance="primary" icon={<Send24Regular />} disabled={!preparation?.ready || (operation === 'swap' && (!entryA || !entryB || entryA === entryB)) || (operation === 'replace' && (!entryA || !subjectId))} onClick={() => void submit()}>下发到该设备</Button>
    </section>}
    {active.length > 0 && <section className="panel"><div className="panel-heading"><div><h2>该设备今天的临时换课</h2><p>共 {active.reduce((sum, session) => sum + session.operations.length, 0)} 个操作。</p></div></div>{active.map((session) => <div className="list-row" key={session.id}><div><strong>{selectedDevice?.name}</strong><span>{session.operations.length} 个换课操作</span></div><Button icon={<Dismiss24Regular />} onClick={() => void restore(session.id)}>立即恢复该设备</Button></div>)}</section>}
  </div>
}
