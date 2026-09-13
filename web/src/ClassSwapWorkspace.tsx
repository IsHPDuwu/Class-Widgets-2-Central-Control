import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight24Regular,
  ArrowSwap24Regular,
  ArrowSync24Regular,
  CalendarSync24Regular,
  Checkmark24Regular,
  Dismiss24Regular,
} from '@fluentui/react-icons'
import { Badge, Button, Card, Field, Select, Spinner, Text, mergeClasses, tokens } from '@fluentui/react-components'
import { api, type ClassSwapPreparation, type ClassSwapSession, type Device, type Group } from './api'
import { useWorkspaceStyles } from './styles/workspaceStyles'

type Subject = { id: string; name: string; color?: string; icon?: string }
type Entry = { id: string; type: string; startTime: string; endTime: string; subjectId?: string; title?: string }
type WeekSelector = 'all' | number | number[] | null
type Timeline = { entries: Entry[]; dayOfWeek?: number[]; weeks?: WeekSelector }
type Override = { entryId: string; dayOfWeek?: number[]; weeks?: WeekSelector; subjectId?: string; title?: string; startTime?: string; endTime?: string }
type Schedule = { meta: { maxWeekCycle: number }; subjects: Subject[]; days: Timeline[]; overrides?: Override[] }
type Props = { organizationId: string; groups: Group[]; devices: Device[]; onComplete: (message: string, tone?: 'success' | 'error') => void }

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function applies(selector: WeekSelector | undefined, week: number, max: number) {
  if (selector == null || selector === 'all') return true
  if (Array.isArray(selector)) return selector.includes(week)
  return week >= selector && (week - selector) % max === 0
}

export function ClassSwapWorkspace({ organizationId, groups, devices, onComplete }: Props) {
  const styles = useWorkspaceStyles()
  const [groupFilter, setGroupFilter] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [preparation, setPreparation] = useState<ClassSwapPreparation | null>(null)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [day, setDay] = useState(new Date().getDay() || 7)
  const [week, setWeek] = useState(1)
  const [sourceId, setSourceId] = useState('')
  const [targetEntryId, setTargetEntryId] = useState('')
  const [targetSubjectId, setTargetSubjectId] = useState('')
  const [optimisticSubjects, setOptimisticSubjects] = useState<Record<string, Pick<Entry, 'subjectId' | 'title'>>>({})
  const [lastSwapText, setLastSwapText] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState<ClassSwapSession[]>([])

  const availableDevices = useMemo(
    () => devices.filter((device) => !device.revoked && (!groupFilter || device.group_id === groupFilter)),
    [devices, groupFilter],
  )
  const selectedDevice = devices.find((device) => device.id === deviceId)
  const loadSessions = () => { if (organizationId) void api.classSwaps(organizationId).then(setSessions).catch(() => undefined) }
  useEffect(loadSessions, [organizationId])
  useEffect(() => {
    if (!availableDevices.some((device) => device.id === deviceId)) setDeviceId(availableDevices[0]?.id ?? '')
  }, [availableDevices, deviceId])

  const resetSelection = () => { setSourceId(''); setTargetEntryId(''); setTargetSubjectId('') }
  const resetPreparation = () => {
    setRequestId('')
    setPreparation(null)
    setSchedule(null)
    setOptimisticSubjects({})
    setLastSwapText('')
    resetSelection()
  }
  const previewKey = (entryId: string) => `${day}:${week}:${entryId}`
  const entries = useMemo(() => {
    if (!schedule) return []
    const timeline = schedule.days.find((item) => (item.dayOfWeek ?? []).includes(day) && applies(item.weeks, week, schedule.meta.maxWeekCycle))
    if (!timeline) return []
    return timeline.entries
      .filter((entry) => entry.type === 'class' || entry.type === 'activity')
      .map((entry) => {
        const effective = { ...entry }
        for (const override of schedule.overrides ?? []) {
          if (override.entryId !== entry.id) continue
          if (override.dayOfWeek?.length && !override.dayOfWeek.includes(day)) continue
          if (!applies(override.weeks, week, schedule.meta.maxWeekCycle)) continue
          if (override.subjectId) effective.subjectId = override.subjectId
          if (override.title) effective.title = override.title
          if (override.startTime) effective.startTime = override.startTime
          if (override.endTime) effective.endTime = override.endTime
        }
        return { ...effective, ...optimisticSubjects[`${day}:${week}:${entry.id}`] }
      })
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
  }, [schedule, day, week, optimisticSubjects])

  const subjectById = (id?: string) => schedule?.subjects.find((subject) => subject.id === id)
  const entryName = (entry?: Entry) => subjectById(entry?.subjectId)?.name || entry?.title || '未设置课程'
  const source = entries.find((entry) => entry.id === sourceId)
  const targetEntry = entries.find((entry) => entry.id === targetEntryId)
  const targetSubject = subjectById(targetSubjectId)
  const ready = Boolean(source && (targetEntry || targetSubject))
  const guide = !source
    ? '点击左侧课程开始换课'
    : !ready
      ? '再选一节课程进行互换，或从右侧选择科目进行替换'
      : targetEntry
        ? `${entryName(source)} ⇌ ${entryName(targetEntry)}？`
        : `${entryName(source)} → ${targetSubject?.name}？`

  async function prepare() {
    if (!deviceId) return
    setLoading(true)
    try {
      const result = await api.prepareClassSwap(deviceId)
      setRequestId(result.request_id)
      setPreparation(null)
      setSchedule(null)
      setOptimisticSubjects({})
      onComplete(`已请求 ${selectedDevice?.name ?? '设备'} 上传当前课表`)
      window.setTimeout(() => void refreshPreparation(result.request_id), 1200)
    } catch (error) {
      onComplete(error instanceof Error ? error.message : '请求课表失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function refreshPreparation(id = requestId) {
    if (!id || !deviceId) return
    setLoading(true)
    try {
      const result = await api.classSwapPreparation(id, deviceId)
      setPreparation(result)
      if (result.ready) {
        const snapshot = await api.classSwapSnapshot(deviceId, id)
        const uploaded = snapshot.schedule as unknown as Schedule
        setSchedule(uploaded)
        setWeek((current) => Math.min(current, uploaded.meta.maxWeekCycle))
      }
    } catch (error) {
      onComplete(error instanceof Error ? error.message : '刷新上传状态失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  function selectEntry(entry: Entry) {
    if (!sourceId) {
      setSourceId(entry.id)
      return
    }
    if (sourceId === entry.id) {
      resetSelection()
      return
    }
    setTargetEntryId(entry.id)
    setTargetSubjectId('')
  }

  function selectSubject(subject: Subject) {
    if (!sourceId) return
    setTargetSubjectId(subject.id)
    setTargetEntryId('')
  }

  async function applyWholeDay() {
    if (!requestId || !deviceId || !preparation?.ready) return
    try {
      await api.createClassSwap({ device_id: deviceId, request_id: requestId, operation: 'apply_today', day_of_week: day, week_of_cycle: week })
      setLastSwapText(`${DAYS[day - 1]} · 第 ${week} 周 → 今天`)
      onComplete(`已向 ${selectedDevice?.name ?? '设备'} 下发整天课表`)
      loadSessions()
    } catch (error) {
      onComplete(error instanceof Error ? error.message : '下发失败', 'error')
    }
  }

  async function commitSwap() {
    if (!requestId || !deviceId || !preparation?.ready || !source || !ready) return
    try {
      if (targetEntry) {
        await api.createClassSwap({ device_id: deviceId, request_id: requestId, operation: 'swap', day_of_week: day, week_of_cycle: week, entry_id_a: source.id, entry_id_b: targetEntry.id })
        setOptimisticSubjects((current) => ({
          ...current,
          [previewKey(source.id)]: { subjectId: targetEntry.subjectId, title: targetEntry.title },
          [previewKey(targetEntry.id)]: { subjectId: source.subjectId, title: source.title },
        }))
        setLastSwapText(`${entryName(source)} ⇌ ${entryName(targetEntry)}`)
      } else if (targetSubject) {
        await api.createClassSwap({ device_id: deviceId, request_id: requestId, operation: 'replace', day_of_week: day, week_of_cycle: week, entry_id: source.id, subject_id: targetSubject.id })
        setOptimisticSubjects((current) => ({ ...current, [previewKey(source.id)]: { subjectId: targetSubject.id, title: undefined } }))
        setLastSwapText(`${entryName(source)} → ${targetSubject.name}`)
      }
      resetSelection()
      onComplete(`已向 ${selectedDevice?.name ?? '设备'} 下发临时换课，可继续选择课程`)
      loadSessions()
    } catch (error) {
      onComplete(error instanceof Error ? error.message : '下发失败', 'error')
    }
  }

  async function restore(id: string) {
    try {
      await api.restoreClassSwap(id)
      setOptimisticSubjects({})
      resetSelection()
      onComplete('已向该设备下发恢复事件')
      loadSessions()
    } catch (error) {
      onComplete(error instanceof Error ? error.message : '恢复失败', 'error')
    }
  }

  const active = sessions.filter((session) => session.device_id === deviceId && session.status === 'active')
  const operationCount = active.reduce((sum, session) => sum + session.operations.length, 0)

  return <div className={styles.stackLayout}>
    <Card>
      <div className={styles.cardHeading}>
        <div className={styles.stack}><Text weight="semibold" size={400} block>临时换课</Text><Text className={styles.muted} size={200} block>选择设备并读取它当前使用的课表</Text></div>
        {preparation && <Badge appearance="tint" color={preparation.ready ? 'success' : 'informative'}>{preparation.ready ? '课表已同步' : '等待设备上传'}</Badge>}
      </div>
      <div className={styles.row}>
        <Field label="班级筛选"><Select value={groupFilter} onChange={(_, data) => { setGroupFilter(data.value); resetPreparation() }}><option value="">全部班级</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field>
        <Field label="目标设备"><Select value={deviceId} onChange={(_, data) => { setDeviceId(data.value); resetPreparation() }}>{availableDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</Select></Field>
        <div className={styles.commandBarActions}><Button appearance="primary" icon={<CalendarSync24Regular />} disabled={!deviceId || loading} onClick={() => void prepare()}>获取设备课表</Button><Button appearance="secondary" icon={<ArrowSync24Regular />} disabled={!requestId || loading} onClick={() => void refreshPreparation()}>刷新</Button></div>
      </div>
      {loading && <Spinner size="tiny" label="正在与设备同步" />}
    </Card>

    {schedule && <Card>
      <div className={styles.cardHeading}>
        <div className={styles.row}>
          <Field label="来源星期"><Select value={String(day)} onChange={(_, data) => { setDay(Number(data.value)); resetSelection() }}>{DAYS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</Select></Field>
          <Field label="周期周"><Select value={String(week)} onChange={(_, data) => { setWeek(Number(data.value)); resetSelection() }}>{Array.from({ length: schedule.meta.maxWeekCycle }, (_, index) => <option key={index + 1} value={index + 1}>{schedule.meta.maxWeekCycle === 2 ? (index === 0 ? '单周' : '双周') : `第 ${index + 1} 周`}</option>)}</Select></Field>
        </div>
        <Button appearance="secondary" icon={<CalendarSync24Regular />} onClick={() => void applyWholeDay()}>整天应用到今天</Button>
      </div>

      <div className={styles.picker}>
        <section>
          <div className={styles.paneTitle}><div className={styles.stack}><Text weight="semibold" block>当天课程</Text><Text className={styles.muted} size={200} block>点击选择要换的课程</Text></div><Badge appearance="outline">{entries.length} 节</Badge></div>
          <div className={styles.entryList}>
            {entries.map((entry) => {
              const selected = entry.id === sourceId || entry.id === targetEntryId
              const subject = subjectById(entry.subjectId)
              return <Button appearance="subtle" className={mergeClasses(styles.entry, selected && styles.entrySelected)} key={entry.id} onClick={() => selectEntry(entry)}>
                <span className={styles.swatch} role="img" aria-label={`${subject?.name ?? '课程'} 标识色`} style={{ background: subject?.color || tokens.colorBrandBackground }} />
                <span className={styles.stack}><Text weight="semibold" block>{entryName(entry)}</Text><Text className={styles.muted} size={200} block>{entry.startTime} – {entry.endTime}</Text></span>
                {entry.id === sourceId && <Badge appearance="filled" color="brand">源课程</Badge>}
                {entry.id === targetEntryId && <Badge appearance="tint" color="brand">互换目标</Badge>}
              </Button>
            })}
            {entries.length === 0 && <div className={styles.empty}>该星期和周期周没有课程</div>}
          </div>
        </section>

        <section>
          <div className={styles.paneTitle}><div className={styles.stack}><Text weight="semibold" block>全部科目</Text><Text className={styles.muted} size={200} block>替换为指定科目</Text></div></div>
          <div className={styles.entryList}>
            {schedule.subjects.map((subject) => <Button appearance="subtle" className={mergeClasses(styles.entry, targetSubjectId === subject.id && styles.entrySelected)} disabled={!sourceId} key={subject.id} onClick={() => selectSubject(subject)}>
              <span className={styles.swatch} role="img" aria-label={`${subject.name} 标识色`} style={{ background: subject.color || tokens.colorBrandBackground }} />
              <Text>{subject.name}</Text>
              {targetSubjectId === subject.id && <Checkmark24Regular />}
            </Button>)}
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <div className={styles.row}>{lastSwapText && <><Checkmark24Regular /><Text>上次操作：{lastSwapText}</Text></>}</div>
        <div className={mergeClasses(styles.guide, ready && styles.guideReady)}>{targetEntry ? <ArrowSwap24Regular /> : ready ? <ArrowRight24Regular /> : null}<Text>{guide}</Text></div>
        <div className={styles.commandBarActions}><Button appearance="secondary" onClick={resetSelection}>{source ? '取消选择' : '取消'}</Button>{ready && <Button appearance="primary" icon={<Checkmark24Regular />} onClick={() => void commitSwap()}>确认换课</Button>}</div>
      </div>
    </Card>}

    {active.length > 0 && <Card>
      <div className={styles.cardHeading}>
        <div className={styles.stack}><Text weight="semibold" block>该设备今天的临时换课</Text><Text className={styles.muted} size={200} block>已下发 {operationCount} 个操作，可继续换课或统一恢复。</Text></div>
        <Button appearance="secondary" icon={<Dismiss24Regular />} onClick={() => void restore(active[0].id)}>立即恢复该设备</Button>
      </div>
    </Card>}
  </div>
}
