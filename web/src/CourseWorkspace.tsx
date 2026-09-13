import { useEffect, useState } from 'react'
import { Add24Regular, Delete24Regular, Save24Regular } from '@fluentui/react-icons'
import { Button, Card, CardHeader, Checkbox, ColorArea, ColorPicker, ColorSlider, Field, Input, Popover, PopoverSurface, PopoverTrigger, Text, mergeClasses } from '@fluentui/react-components'
import { api, type CourseRecord } from './api'
import { useWorkspaceStyles } from './styles/workspaceStyles'

type Props = { organizationId: string; onComplete: (message: string, tone?: 'success' | 'error') => void }
type Course = Omit<CourseRecord, 'organization_id' | 'created_at' | 'updated_at'>

const DEFAULT_COLOR = '#13b4d6'

function hexToHsv(value: string) {
  const hex = value.replace('#', '')
  const number = Number.parseInt(hex.length === 3 ? hex.split('').map((item) => item + item).join('') : hex, 16)
  const r = ((number >> 16) & 255) / 255
  const g = ((number >> 8) & 255) / 255
  const b = (number & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta) h = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4)
  if (h < 0) h += 360
  return { h, s: max ? delta / max : 0, v: max, a: 1 }
}

function hsvToHex({ h, s, v }: { h: number; s: number; v: number }) {
  const c = v * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return `#${[r, g, b].map((item) => Math.round((item + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

const HEX_PATTERN = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function normalizeHex(value: string) {
  const hex = value.trim().replace(/^#?/, '#')
  if (!HEX_PATTERN.test(hex)) return undefined
  const body = hex.slice(1)
  return body.length === 3 ? `#${body.split('').map((item) => item + item).join('')}` : hex
}

export function CourseWorkspace({ organizationId, onComplete }: Props) {
  const styles = useWorkspaceStyles()
  const [courses, setCourses] = useState<CourseRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<Course>({ id: crypto.randomUUID(), name: '新课程', isLocalClassroom: true })
  const [hexInput, setHexInput] = useState(DEFAULT_COLOR)

  async function load() {
    if (!organizationId) return
    try {
      const next = await api.courses(organizationId)
      setCourses(next)
      if (!selectedId && next[0]) open(next[0])
    } catch { /* 父级负责处理鉴权失败 */ }
  }
  useEffect(() => { void load() }, [organizationId])

  function open(course: CourseRecord) {
    setSelectedId(course.id)
    setDraft({ id: course.id, name: course.name, simplifiedName: course.simplifiedName, teacher: course.teacher, icon: course.icon, color: course.color, location: course.location, isLocalClassroom: course.isLocalClassroom })
    setHexInput(course.color ?? DEFAULT_COLOR)
  }
  function reset() { setSelectedId(''); setDraft({ id: crypto.randomUUID(), name: '新课程', isLocalClassroom: true }); setHexInput(DEFAULT_COLOR) }
  function update(patch: Partial<Course>) { setDraft((value) => ({ ...value, ...patch })) }
  function applyColor(color: string) { setDraft((value) => ({ ...value, color })); setHexInput(color) }
  async function save() {
    try {
      const result = selectedId ? await api.updateCourse(selectedId, { course: draft }) : await api.createCourse({ organization_id: organizationId, course: draft })
      setSelectedId(result.id); open(result); onComplete('课表课程已保存'); await load()
    } catch (error) { onComplete(error instanceof Error ? error.message : '保存课程失败', 'error') }
  }
  async function remove() {
    if (!selectedId || !window.confirm(`确定删除课程“${draft.name}”？`)) return
    try { await api.deleteCourse(selectedId); onComplete('课表课程已删除'); reset(); await load() } catch (error) { onComplete(error instanceof Error ? error.message : '删除课程失败', 'error') }
  }

  return <div className={styles.layout}>
    <Card className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <Text weight="semibold">课表课程</Text>
        <Button appearance="subtle" icon={<Add24Regular />} onClick={reset}>新建</Button>
      </div>
      <div className={styles.nav}>
        {courses.map((course) => <Button
          key={course.id}
          appearance="subtle"
          className={mergeClasses(styles.navButton, selectedId === course.id && styles.navButtonSelected)}
          onClick={() => open(course)}
        >
          <span className={styles.navButtonCopy}>
            <Text weight="semibold" block>{course.name}</Text>
            <Text className={styles.navButtonMeta} size={200} block>{course.teacher || course.location || '未填写附加信息'}</Text>
          </span>
        </Button>)}
        {courses.length === 0 && <div className={styles.empty}>暂无课程</div>}
      </div>
    </Card>
    <div className={styles.main}>
      <Card>
        <CardHeader header={<Text as="h2" weight="semibold" size={400}>{selectedId ? '编辑课程' : '新建课程'}</Text>} />
        <div className={styles.commandBar}>
          <Field label="课程名称" className={styles.commandBarField}><Input value={draft.name} onChange={(_, data) => update({ name: data.value })} /></Field>
          <div className={styles.commandBarActions}>
            <Button appearance="secondary" icon={<Delete24Regular />} disabled={!selectedId} onClick={() => void remove()}>删除</Button>
            <Button appearance="primary" icon={<Save24Regular />} onClick={() => void save()}>保存</Button>
          </div>
        </div>
      </Card>
      <Card className={styles.main} style={{ borderTopColor: draft.color ?? DEFAULT_COLOR, borderTopWidth: '4px', borderTopStyle: 'solid' }}>
        <CardHeader header={<Text as="h2" weight="semibold" size={400}>课程属性</Text>} />
        <div className={styles.fields}>
          <Field label="名称"><Input value={draft.name} onChange={(_, data) => update({ name: data.value })} /></Field>
          <Field label="简称"><Input value={draft.simplifiedName ?? ''} onChange={(_, data) => update({ simplifiedName: data.value || undefined })} /></Field>
          <Field label="教师"><Input value={draft.teacher ?? ''} onChange={(_, data) => update({ teacher: data.value || undefined })} /></Field>
          <Field label="教室"><Input value={draft.location ?? ''} onChange={(_, data) => update({ location: data.value || undefined })} /></Field>
          <Field label="图标"><Input value={draft.icon ?? ''} onChange={(_, data) => update({ icon: data.value || undefined })} /></Field>
          <Field label="颜色" hint="选择课程在课表中的显示颜色">
            <Popover trapFocus>
              <PopoverTrigger disableButtonEnhancement>
                <div className={styles.colorTrigger} role="button" tabIndex={0} aria-label="选择课程颜色">
                  <span className={styles.colorSwatch} style={{ backgroundColor: draft.color ?? DEFAULT_COLOR }} aria-hidden="true" />
                  <Text size={300}>{hexInput}</Text>
                </div>
              </PopoverTrigger>
              <PopoverSurface>
                <div className={styles.colorPanel}>
                  <ColorPicker color={hexToHsv(draft.color ?? DEFAULT_COLOR)} onColorChange={(_, data) => applyColor(hsvToHex(data.color))}>
                    <ColorArea inputX={{ 'aria-label': '饱和度' }} inputY={{ 'aria-label': '亮度' }} />
                    <ColorSlider aria-label="色相" />
                  </ColorPicker>
                  <Field label="HEX" validationState={normalizeHex(hexInput) ? undefined : 'error'} validationMessage={normalizeHex(hexInput) ? undefined : '请输入 #RGB 或 #RRGGBB 格式的颜色。'}>
                    <Input
                      value={hexInput}
                      maxLength={7}
                      placeholder="#13b4d6"
                      onChange={(_, data) => {
                        setHexInput(data.value)
                        const normalized = normalizeHex(data.value)
                        if (normalized) setDraft((value) => ({ ...value, color: normalized }))
                      }}
                    />
                  </Field>
                </div>
              </PopoverSurface>
            </Popover>
          </Field>
          <Checkbox checked={draft.isLocalClassroom} onChange={(_, data) => update({ isLocalClassroom: !!data.checked })} label="本班教室课程" />
        </div>
      </Card>
    </div>
  </div>
}
