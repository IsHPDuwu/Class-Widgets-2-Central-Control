import { useEffect, useState } from 'react'
import { Button, Card, CardHeader, Checkbox, Dropdown, Field, Input, Option, Switch, Text, Textarea, mergeClasses } from '@fluentui/react-components'
import { Add24Regular, ArrowUpload24Regular, Copy24Regular, Save24Regular, Send24Regular } from '@fluentui/react-icons'
import { api, type ClassGroup, type Group, type PolicyRecord } from './api'
import { ClassSelector } from './ClassSelector'
import { useWorkspaceStyles } from './styles/workspaceStyles'

type Kind = 'boolean' | 'number' | 'string' | 'json'
type ConfigField = { key: string; label: string; section: string; kind: Kind; hint?: string }
type Props = { organizationId: string; groups: Group[]; classGroups: ClassGroup[]; onComplete: (message: string, tone?: 'success' | 'error') => void }

const CONFIG_FIELDS: ConfigField[] = [
  { section: '应用', key: 'app.debug_mode', label: '调试模式', kind: 'boolean' },
  { section: '应用', key: 'app.no_logs', label: '禁用日志', kind: 'boolean' },
  { section: '应用', key: 'app.version', label: '版本标识', kind: 'string', hint: '通常由应用自动维护' },
  { section: '应用', key: 'app.channel', label: '更新通道', kind: 'string' },
  { section: '应用', key: 'app.tutorial_completed', label: '已完成初始化', kind: 'boolean' },
  { section: '应用', key: 'app.auto_startup', label: '开机自启', kind: 'boolean' },
  { section: '语言', key: 'locale.language', label: '界面语言', kind: 'string', hint: '如 zh_CN、en_US' },
  { section: '课表', key: 'schedule.current_schedule', label: '当前课表名称', kind: 'string' },
  { section: '课表', key: 'schedule.preparation_time', label: '预备时间（分钟）', kind: 'number' },
  { section: '课表', key: 'schedule.default_duration.class_', label: '默认课程时长', kind: 'number' },
  { section: '课表', key: 'schedule.default_duration.break_', label: '默认课间时长', kind: 'number' },
  { section: '课表', key: 'schedule.default_duration.activity', label: '默认活动时长', kind: 'number' },
  { section: '课表', key: 'schedule.time_offset', label: '时间偏移', kind: 'number' },
  { section: '课表', key: 'schedule.reschedule_day', label: '调休记录', kind: 'json' },
  { section: '课表', key: 'schedule.class_swap', label: '临时换课记录', kind: 'json' },
  { section: '外观', key: 'preferences.current_theme', label: '当前主题', kind: 'string' },
  { section: '外观', key: 'preferences.scale_factor', label: '缩放比例', kind: 'number' },
  { section: '外观', key: 'preferences.opacity', label: '不透明度', kind: 'number' },
  { section: '外观', key: 'preferences.widgets_anchor', label: '组件锚点', kind: 'string', hint: 'top_left / top_center / top_right / bottom_left / bottom_center / bottom_right' },
  { section: '外观', key: 'preferences.widgets_offset_x', label: '组件水平偏移', kind: 'number' },
  { section: '外观', key: 'preferences.widgets_offset_y', label: '组件垂直偏移', kind: 'number' },
  { section: '外观', key: 'preferences.widgets_layer', label: '组件层级', kind: 'string', hint: 'top / bottom / normal' },
  { section: '外观', key: 'preferences.display', label: '显示器', kind: 'string' },
  { section: '外观', key: 'preferences.mini_mode', label: '迷你模式', kind: 'boolean' },
  { section: '外观', key: 'preferences.lighting_effect', label: '光影效果', kind: 'boolean' },
  { section: '外观', key: 'preferences.widgets_presets', label: '组件预设', kind: 'json' },
  { section: '外观', key: 'preferences.current_preset', label: '当前组件预设', kind: 'string' },
  { section: '外观', key: 'preferences.font', label: '字体', kind: 'string' },
  { section: '外观', key: 'preferences.font_weight', label: '字重', kind: 'number' },
  { section: '网络', key: 'network.mirrors', label: '镜像地址', kind: 'json' },
  { section: '网络', key: 'network.current_mirror', label: '当前镜像', kind: 'string' },
  { section: '网络', key: 'network.mirror_enabled', label: '启用镜像', kind: 'boolean' },
  { section: '网络', key: 'network.releases_url', label: '更新清单地址', kind: 'string' },
  { section: '网络', key: 'network.auto_check_updates', label: '自动检查更新', kind: 'boolean' },
  { section: '通知', key: 'notifications.enabled', label: '启用通知', kind: 'boolean' },
  { section: '通知', key: 'notifications.default_sound', label: '默认声音', kind: 'string' },
  { section: '通知', key: 'notifications.volume', label: '通知音量', kind: 'number' },
  { section: '通知', key: 'notifications.providers', label: '通知提供者配置', kind: 'json' },
  { section: '通知', key: 'notifications.default_duration', label: '默认显示时长（毫秒）', kind: 'number' },
  { section: '通知', key: 'notifications.level_sounds', label: '分级提示音', kind: 'json' },
]

function defaultValue(kind: Kind) { return kind === 'boolean' ? false : kind === 'number' ? 0 : kind === 'json' ? {} : '' }
function displayValue(value: unknown, kind: Kind) { if (kind === 'json') return JSON.stringify(value ?? {}, null, 2); return String(value ?? '') }
function parseValue(value: string, kind: Kind) { if (kind === 'boolean') return value === 'true'; if (kind === 'number') return Number(value); if (kind === 'json') return JSON.parse(value); return value }

function getNestedValue(source: Record<string, unknown>, key: string): { found: boolean; value?: unknown } {
  let value: unknown = source
  for (const part of key.split('.')) {
    if (!value || typeof value !== 'object' || !(part in value)) return { found: false }
    value = (value as Record<string, unknown>)[part]
  }
  return { found: true, value }
}

export function ConfigWorkspace({ organizationId, groups, classGroups, onComplete }: Props) {
  const styles = useWorkspaceStyles()
  const [records, setRecords] = useState<PolicyRecord[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('新配置')
  const [values, setValues] = useState<Record<string, string>>({})
    const [managed, setManaged] = useState<Set<string>>(new Set())
  const [locked, setLocked] = useState<Set<string>>(new Set())
  const [readonly, setReadonly] = useState(true)
  const [publishGroups, setPublishGroups] = useState<string[]>([])
  const [section, setSection] = useState(CONFIG_FIELDS[0].section)
  const sections = [...new Set(CONFIG_FIELDS.map((field) => field.section))]
  const load = () => { if (organizationId) void api.policies(organizationId).then(setRecords).catch(() => undefined) }
  useEffect(load, [organizationId])

  function reset() { setEditingId(null); setName('新配置'); setValues({}); setManaged(new Set()); setLocked(new Set()); setReadonly(true); setPublishGroups([]) }
  function edit(record: PolicyRecord) { const next: Record<string, string> = {}; CONFIG_FIELDS.forEach((field) => { if (field.key in record.policy.overrides) next[field.key] = displayValue(record.policy.overrides[field.key], field.kind) }); setEditingId(record.id); setName(record.name); setValues(next); setManaged(new Set(Object.keys(record.policy.overrides))); setLocked(new Set(record.policy.locked_keys)); setReadonly(record.policy.schedule_readonly); setPublishGroups(record.group_ids) }
  async function importConfig(file: File | undefined) {
    if (!file) return
    try {
      const imported = JSON.parse(await file.text()) as Record<string, unknown>
      const wrappedPolicy = imported.policy && typeof imported.policy === 'object' ? imported.policy as Record<string, unknown> : null
      const overrides = wrappedPolicy?.overrides && typeof wrappedPolicy.overrides === 'object' ? wrappedPolicy.overrides as Record<string, unknown> : null
      const next: Record<string, string> = {}
      const nextManaged = new Set<string>()
      for (const field of CONFIG_FIELDS) {
        const result = overrides && field.key in overrides ? { found: true, value: overrides[field.key] } : getNestedValue(imported, field.key)
        if (result.found) { next[field.key] = displayValue(result.value, field.kind); nextManaged.add(field.key) }
      }
      if (!nextManaged.size) throw new Error('文件中没有可导入的 Class Widgets 配置项')
      setEditingId(null); setName(file.name.replace(/\.json$/i, '') || '导入的配置'); setValues(next); setManaged(nextManaged)
      setLocked(new Set(Array.isArray(wrappedPolicy?.locked_keys) ? wrappedPolicy.locked_keys.filter((key): key is string => typeof key === 'string' && nextManaged.has(key)) : []))
      setReadonly(typeof wrappedPolicy?.schedule_readonly === 'boolean' ? wrappedPolicy.schedule_readonly : true); setPublishGroups([])
      onComplete(`已导入 ${nextManaged.size} 项配置，保存后生效`)
    } catch (error) { onComplete(error instanceof Error ? error.message : '配置导入失败', 'error') }
  }
  function payload() { const overrides: Record<string, unknown> = {}; for (const key of managed) { const field = CONFIG_FIELDS.find((item) => item.key === key)!; overrides[key] = parseValue(values[key] ?? displayValue(defaultValue(field.kind), field.kind), field.kind) } return { overrides, locked_keys: [...locked].filter((key) => managed.has(key)), schedule_readonly: readonly } }
  async function save(publish: boolean) { try { const result = editingId ? await api.updatePolicy(editingId, { name, policy: payload() }) : await api.publishPolicy({ organization_id: organizationId, name, policy: payload(), group_ids: [] }); if (publish) await api.assignPolicy(result.id, publishGroups); setEditingId(result.id); onComplete(`配置 r${result.revision} 已${publish ? '保存并发布' : '保存'}`); load() } catch (error) { onComplete(error instanceof Error ? error.message : '保存失败', 'error') } }
  async function clone(record: PolicyRecord) { try { const result = await api.clonePolicy(record.id, `${record.name} - 副本`); onComplete(`配置副本 r${result.revision} 已保存`); load() } catch (error) { onComplete(error instanceof Error ? error.message : '克隆失败', 'error') } }
  async function publish(record: PolicyRecord, ids: string[]) { try { await api.assignPolicy(record.id, ids); onComplete(ids.length ? `“${record.name}”已发布` : `“${record.name}”已取消发布`); load() } catch (error) { onComplete(error instanceof Error ? error.message : '发布失败', 'error') } }

  const activeFields = CONFIG_FIELDS.filter((field) => field.section === section)
  return <div className={styles.layout}>
    <Card className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <Text weight="semibold">配置资源</Text>
        <Button appearance="subtle" icon={<Add24Regular />} onClick={reset}>新建</Button>
      </div>
      <div className={styles.nav}>
        {records.map((record) => <div className={styles.row} key={record.id}>
          <Button
            appearance="subtle"
            className={mergeClasses(styles.navButton, styles.grow, editingId === record.id && styles.navButtonSelected)}
            onClick={() => edit(record)}
          >
            <span className={styles.navButtonCopy}>
              <Text weight="semibold" block>{record.name}</Text>
              <Text className={styles.navButtonMeta} size={200} block>r{record.revision} · {record.group_ids.length ? `${record.group_ids.length} 个班级` : '草稿'}</Text>
            </span>
          </Button>
          <Button appearance="subtle" title="克隆" icon={<Copy24Regular />} onClick={() => void clone(record)} />
        </div>)}
        {records.length === 0 && <div className={styles.empty}>暂无配置</div>}
      </div>
    </Card>
    <div className={styles.main}>
      <Card>
        <CardHeader header={<Text as="h2" weight="semibold" size={400}>{editingId ? '编辑配置' : '新建配置'}</Text>} />
        <div className={styles.commandBar}>
          <Field className={styles.commandBarField} label="配置名称" hint="所有 RootConfig 键均已显性列出；启用后才下发"><Input value={name} onChange={(_, data) => setName(data.value)} /></Field>
          <div className={styles.commandBarActions}>
            <Button appearance="outline" icon={<ArrowUpload24Regular />} className={styles.fileButton}>导入 JSON<input type="file" accept="application/json,.json" onChange={(event) => { void importConfig(event.target.files?.[0]); event.target.value = '' }} /></Button>
            <Button appearance="outline" icon={<Save24Regular />} onClick={() => void save(false)}>仅保存</Button>
            <Button appearance="primary" disabled={!publishGroups.length} icon={<Send24Regular />} onClick={() => void save(true)}>保存并发布</Button>
          </div>
        </div>
        <div className={styles.row}>
          <div className={mergeClasses(styles.stack, styles.grow)}><Text weight="semibold" block>课表只读</Text><Text className={styles.muted} size={200} block>独立于配置键生效</Text></div>
          <Switch checked={readonly} label="课表只读" onChange={(_, data) => setReadonly(data.checked)} />
        </div>
        <Field label="发布目标">
          <ClassSelector groups={groups} classGroups={classGroups} selected={publishGroups} onChange={setPublishGroups} idPrefix="policy-target" />
        </Field>
      </Card>
      <Card>
        <CardHeader
          header={<Text as="h2" weight="semibold" size={400}>配置项</Text>}
        />
        <div className={styles.commandBarActions} style={{ justifyContent: 'flex-start' }}>
          {sections.map((item) => <Button key={item} appearance={section === item ? 'primary' : 'subtle'} onClick={() => setSection(item)}>{item} {CONFIG_FIELDS.filter((field) => field.section === item && managed.has(field.key)).length}/{CONFIG_FIELDS.filter((field) => field.section === item).length}</Button>)}
        </div>
        <div className={styles.main}>
          {activeFields.map((field) => {
            const enabled = managed.has(field.key)
            const value = values[field.key] ?? displayValue(defaultValue(field.kind), field.kind)
            return <div className={mergeClasses(styles.row, styles.fieldRow)} key={field.key}>
              <div className={styles.row}>
                <Checkbox
                  checked={enabled}
                  aria-label={`下发 ${field.label}`}
                  onChange={(_, data) => { const next = new Set(managed); if (data.checked) { next.add(field.key); setValues({ ...values, [field.key]: value }) } else { next.delete(field.key); const locks = new Set(locked); locks.delete(field.key); setLocked(locks) } setManaged(next) }}
                />
                <div className={styles.stack}><Text weight="semibold" block>{field.label}</Text><Text className={styles.mono} size={200} block>{field.key}</Text>{field.hint && <Text className={styles.muted} size={200} block>{field.hint}</Text>}</div>
              </div>
              <div className={styles.grow}>
                {field.kind === 'boolean'
                  ? <Dropdown disabled={!enabled} aria-label={`${field.label} 取值`} selectedOptions={[value]} onOptionSelect={(_, data) => setValues({ ...values, [field.key]: data.optionValue ?? 'false' })}><Option value="true">开启</Option><Option value="false">关闭</Option></Dropdown>
                  : field.kind === 'json'
                    ? <Textarea textarea={{ style: { minHeight: '90px' } }} disabled={!enabled} aria-label={`${field.label} JSON 取值`} value={value} onChange={(_, data) => setValues({ ...values, [field.key]: data.value })} />
                    : <Input disabled={!enabled} aria-label={`${field.label} 取值`} type={field.kind === 'number' ? 'number' : 'text'} step="any" value={value} onChange={(_, data) => setValues({ ...values, [field.key]: data.value })} />}
              </div>
              <Checkbox disabled={!enabled} checked={locked.has(field.key)} label="锁定客户端修改" onChange={(_, data) => { const next = new Set(locked); if (data.checked) next.add(field.key); else next.delete(field.key); setLocked(next) }} />
            </div>
          })}
        </div>
      </Card>
      <ConfigPublishLibrary records={records} groups={groups} classGroups={classGroups} onPublish={publish} />
    </div>
  </div>
}

function ConfigPublishLibrary({ records, groups, classGroups, onPublish }: { records: PolicyRecord[]; groups: Group[]; classGroups: ClassGroup[]; onPublish: (record: PolicyRecord, ids: string[]) => void }) {
  const styles = useWorkspaceStyles()
  const [selection, setSelection] = useState<Record<string, string[]>>({})
  return <Card>
    <CardHeader header={<Text as="h2" weight="semibold" size={400}>独立发布</Text>} description={<Text size={200}>替换配置发布目标；清空可取消发布</Text>} />
    <div className={styles.main}>
      {records.map((record) => {
        const ids = selection[record.id] ?? record.group_ids
        return <div className={styles.row} key={record.id}>
          <div className={mergeClasses(styles.stack, styles.grow)}><Text weight="semibold" block>{record.name}</Text><Text className={styles.muted} size={200} block>r{record.revision}</Text></div>
          <ClassSelector groups={groups} classGroups={classGroups} selected={ids} onChange={(value) => setSelection({ ...selection, [record.id]: value })} idPrefix={`policy-publish-${record.id}`} />
          <Button appearance="primary" icon={<Send24Regular />} onClick={() => onPublish(record, ids)}>{ids.length ? '发布' : '取消发布'}</Button>
        </div>
      })}
      {records.length === 0 && <div className={styles.empty}>暂无配置可发布</div>}
    </div>
  </Card>
}
