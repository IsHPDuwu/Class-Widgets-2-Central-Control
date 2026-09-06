import { useEffect, useState } from 'react'
import { Add24Regular, ArrowUpload24Regular, Copy24Regular, Save24Regular, Send24Regular } from '@fluentui/react-icons'
import { api, type ClassGroup, type Group, type PolicyRecord } from './api'
import { ClassSelector } from './ClassSelector'

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
  { section: '交互', key: 'interactions.hover_fade', label: '悬停淡出', kind: 'boolean' },
  { section: '交互', key: 'interactions.hide.state', label: '启用自动隐藏', kind: 'boolean' },
  { section: '交互', key: 'interactions.hide.in_class', label: '上课时隐藏', kind: 'boolean' },
  { section: '交互', key: 'interactions.hide.clicked', label: '点击时隐藏', kind: 'boolean' },
  { section: '交互', key: 'interactions.hide.maximized', label: '窗口最大化时隐藏', kind: 'boolean' },
  { section: '交互', key: 'interactions.hide.fullscreen', label: '全屏时隐藏', kind: 'boolean' },
  { section: '交互', key: 'interactions.hide.mini_mode', label: '迷你模式时隐藏', kind: 'boolean' },
  { section: '插件', key: 'plugins.enabled', label: '已启用插件 ID', kind: 'json' },
  { section: '插件', key: 'plugins.configs', label: '全部插件配置', kind: 'json', hint: 'JSON 对象；可显式控制各插件的动态配置' },
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

  return <div className="config-workspace"><section className="resource-sidebar data-section"><div className="section-heading"><h2>配置资源</h2><button onClick={reset}><Add24Regular />新建</button></div><div className="resource-nav">{records.map((record) => <article className={editingId === record.id ? 'selected' : ''} key={record.id}><button className="resource-main" onClick={() => edit(record)}><strong>{record.name}</strong><span>r{record.revision} · {record.group_ids.length ? `${record.group_ids.length} 个班级` : '草稿'}</span></button><button title="克隆" onClick={() => void clone(record)}><Copy24Regular /></button></article>)}</div></section><section className="config-editor form-section"><div className="editor-commandbar"><div><input aria-label="配置名称" value={name} onChange={(event) => setName(event.target.value)} /><span>所有 RootConfig 键均已显性列出；启用后才下发</span></div><label className="import-button"><ArrowUpload24Regular />导入 JSON<input type="file" accept="application/json,.json" onChange={(event) => { void importConfig(event.target.files?.[0]); event.target.value = '' }} /></label><button onClick={() => void save(false)}><Save24Regular />仅保存</button><button className="primary" disabled={!publishGroups.length} onClick={() => void save(true)}><Send24Regular />保存并发布</button></div><div className="meta-strip"><label className="setting-row"><div><strong>课表只读</strong><span>独立于配置键生效</span></div><input type="checkbox" role="switch" checked={readonly} onChange={(event) => setReadonly(event.target.checked)} /></label><fieldset><legend>发布目标</legend><ClassSelector groups={groups} classGroups={classGroups} selected={publishGroups} onChange={setPublishGroups} idPrefix="policy-target" /></fieldset></div><div className="config-sections">{sections.map((item) => <button className={section === item ? 'active' : ''} key={item} onClick={() => setSection(item)}>{item}<span>{CONFIG_FIELDS.filter((field) => field.section === item && managed.has(field.key)).length}/{CONFIG_FIELDS.filter((field) => field.section === item).length}</span></button>)}</div><div className="explicit-config-list">{CONFIG_FIELDS.filter((field) => field.section === section).map((field) => { const enabled = managed.has(field.key); const value = values[field.key] ?? displayValue(defaultValue(field.kind), field.kind); return <article key={field.key} className={enabled ? 'managed' : ''}><label className="manage-toggle"><input type="checkbox" checked={enabled} onChange={(event) => { const next = new Set(managed); if (event.target.checked) { next.add(field.key); setValues({ ...values, [field.key]: value }) } else { next.delete(field.key); const locks = new Set(locked); locks.delete(field.key); setLocked(locks) } setManaged(next) }} /><div><strong>{field.label}</strong><code>{field.key}</code>{field.hint && <span>{field.hint}</span>}</div></label><div className="config-control">{field.kind === 'boolean' ? <select disabled={!enabled} value={value} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}><option value="true">开启</option><option value="false">关闭</option></select> : field.kind === 'json' ? <textarea disabled={!enabled} value={value} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} /> : <input disabled={!enabled} type={field.kind === 'number' ? 'number' : 'text'} step="any" value={value} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />}<label className="inline-check"><input type="checkbox" disabled={!enabled} checked={locked.has(field.key)} onChange={(event) => { const next = new Set(locked); if (event.target.checked) next.add(field.key); else next.delete(field.key); setLocked(next) }} />锁定客户端修改</label></div></article> })}</div></section><ConfigPublishLibrary records={records} groups={groups} classGroups={classGroups} onPublish={publish} /></div>
}

function ConfigPublishLibrary({ records, groups, classGroups, onPublish }: { records: PolicyRecord[]; groups: Group[]; classGroups: ClassGroup[]; onPublish: (record: PolicyRecord, ids: string[]) => void }) { const [selection, setSelection] = useState<Record<string, string[]>>({}); return <section className="publish-library data-section"><div className="section-heading"><h2>独立发布</h2><span>替换配置发布目标；清空可取消发布</span></div>{records.map((record) => { const ids = selection[record.id] ?? record.group_ids; return <article key={record.id}><div><strong>{record.name}</strong><span>r{record.revision}</span></div><ClassSelector groups={groups} classGroups={classGroups} selected={ids} onChange={(value) => setSelection({ ...selection, [record.id]: value })} idPrefix={`policy-publish-${record.id}`} /><button className="primary" onClick={() => onPublish(record, ids)}><Send24Regular />{ids.length ? '发布' : '取消发布'}</button></article> })}</section> }
