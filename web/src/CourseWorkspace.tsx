import { useEffect, useState } from 'react'
import { Add24Regular, Delete24Regular, Save24Regular } from '@fluentui/react-icons'
import { Button, Card, CardHeader, Checkbox, Field, Input, Text, mergeClasses } from '@fluentui/react-components'
import { api, type CourseRecord } from './api'
import { useWorkspaceStyles } from './styles/workspaceStyles'

type Props = { organizationId: string; onComplete: (message: string, tone?: 'success' | 'error') => void }
type Course = Omit<CourseRecord, 'organization_id' | 'created_at' | 'updated_at'>

const DEFAULT_COLOR = '#13b4d6'

export function CourseWorkspace({ organizationId, onComplete }: Props) {
  const styles = useWorkspaceStyles()
  const [courses, setCourses] = useState<CourseRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<Course>({ id: crypto.randomUUID(), name: '新课程', isLocalClassroom: true })

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
  }
  function reset() { setSelectedId(''); setDraft({ id: crypto.randomUUID(), name: '新课程', isLocalClassroom: true }) }
  function update(patch: Partial<Course>) { setDraft((value) => ({ ...value, ...patch })) }
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
          <Field label="颜色" hint="例如 #13b4d6"><Input value={draft.color ?? DEFAULT_COLOR} onChange={(_, data) => update({ color: data.value })} /></Field>
          <Checkbox checked={draft.isLocalClassroom} onChange={(_, data) => update({ isLocalClassroom: !!data.checked })} label="本班教室课程" />
        </div>
      </Card>
    </div>
  </div>
}
