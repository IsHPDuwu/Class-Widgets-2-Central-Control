import { useEffect, useState, type FormEvent } from 'react'
import { Add24Regular, ArrowRepeatAll24Regular, Delete24Regular, Save24Regular } from '@fluentui/react-icons'
import { Button, Card, CardHeader, Checkbox, Dropdown, Field, Input, Option, Text, mergeClasses } from '@fluentui/react-components'
import { api, type AutomationRule, type Device, type Group, type PolicyRecord, type ScheduleRecord } from './api'
import { useWorkspaceStyles } from './styles/workspaceStyles'

type Props = { organizationId: string; groups: Group[]; devices: Device[]; onComplete: (message: string, tone?: 'success' | 'error') => void }

const emptyRule = (organizationId: string): Record<string, unknown> => ({
  organization_id: organizationId, name: '', enabled: true, trigger_type: 'daily', scheduled_time: '08:00',
  weekdays: [1], run_date: null, condition_operator: 'and', conditions: [], delay_seconds: 0,
  group_id: '', device_id: '', action: { type: 'command', payload: { command_type: 'refresh_status' } },
})

export function AutomationWorkspace({ organizationId, groups, devices, onComplete }: Props) {
  const styles = useWorkspaceStyles()
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [policies, setPolicies] = useState<PolicyRecord[]>([])
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<Record<string, any>>(emptyRule(organizationId))
  const [actionPayload, setActionPayload] = useState<Record<string, any>>({ command_type: 'refresh_status' })
  const [targetKind, setTargetKind] = useState<'group' | 'device'>('group')
  const load = () => Promise.all([api.automations(organizationId), api.policies(organizationId), api.schedules(organizationId)]).then(([items, policyItems, scheduleItems]) => { setRules(items); setPolicies(policyItems); setSchedules(scheduleItems); if (!selectedId && items[0]) select(items[0]) }).catch((error) => onComplete(error instanceof Error ? error.message : '加载自动化失败', 'error'))
  useEffect(() => { if (organizationId) void load() }, [organizationId])
  function select(rule: AutomationRule) { setSelectedId(rule.id); setDraft({ ...rule, action: undefined, actionType: rule.action.type, group_id: rule.group_id ?? '', device_id: rule.device_id ?? '' }); setActionPayload({ ...rule.action.payload }) ; setTargetKind(rule.group_id ? 'group' : 'device') }
  function update(key: string, value: unknown) { setDraft((current) => ({ ...current, [key]: value })) }
  async function save(event: FormEvent) { event.preventDefault(); try { const body = { ...draft, group_id: targetKind === 'group' ? draft.group_id : null, device_id: targetKind === 'device' ? draft.device_id : null, action: { type: draft.actionType ?? 'command', payload: actionPayload } }; if (selectedId) await api.updateAutomation(selectedId, body); else await api.createAutomation(body); onComplete('自动化已保存'); setSelectedId(''); await load() } catch (error) { onComplete(error instanceof Error ? error.message : '保存自动化失败', 'error') } }
  async function remove() { if (!selectedId || !window.confirm('确定删除此自动化规则？')) return; try { await api.deleteAutomation(selectedId); setSelectedId(''); setDraft(emptyRule(organizationId)); onComplete('自动化已删除'); await load() } catch (error) { onComplete(error instanceof Error ? error.message : '删除自动化失败', 'error') } }
  const targets = targetKind === 'group' ? groups : devices
  return <div className={styles.layout}>
    <Card className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <Text weight="semibold">自动化规则</Text>
        <Button appearance="subtle" icon={<Add24Regular />} aria-label="新建自动化" onClick={() => { setSelectedId(''); setDraft(emptyRule(organizationId)); setActionPayload({ command_type: 'refresh_status' }) }} />
      </div>
      <div className={styles.nav}>
        {rules.map((rule) => <Button appearance="subtle" className={mergeClasses(styles.navButton, selectedId === rule.id && styles.navButtonSelected)} key={rule.id} onClick={() => select(rule)} icon={<ArrowRepeatAll24Regular />}>
          <span className={styles.navButtonCopy}><Text weight="semibold" block>{rule.name}</Text><Text className={styles.navButtonMeta} size={200} block>{rule.enabled ? '已启用' : '已停用'} · {rule.trigger_type}</Text></span>
        </Button>)}
        {rules.length === 0 && <div className={styles.empty}>暂无自动化规则</div>}
      </div>
    </Card>
    <div className={styles.main}>
    <Card>
    <CardHeader header={<Text as="h2" weight="semibold" size={400}>{selectedId ? '编辑自动化' : '新建自动化'}</Text>} />
    <form className={styles.fields} onSubmit={save}>
<Field label="名称" required hint={selectedId ? undefined : '为规则取一个便于识别的名称。'}>
  <Input value={draft.name ?? ''} onChange={(_, data) => update('name', data.value)} placeholder="例如：早读上课提醒" />
</Field>
<Field label="触发方式" required hint="决定规则在什么时间点执行。">
  <Dropdown selectedOptions={[draft.trigger_type]} onOptionSelect={(_, data) => update('trigger_type', data.optionValue ?? 'daily')}>
    <Option value="daily">每日</Option>
    <Option value="weekly">每周</Option>
    <Option value="date">特定日期</Option>
    <Option value="online">客户端上线</Option>
  </Dropdown>
</Field>
{draft.trigger_type !== 'online' && <Field label="时间" required hint="按服务器时间执行，格式 24 小时制。">
  <Input type="time" value={draft.scheduled_time ?? ''} onChange={(_, data) => update('scheduled_time', data.value)} />
</Field>}
{draft.trigger_type === 'weekly' && <Field label="星期" required hint="多个星期用英文逗号分隔，1=周一，7=周日。">
  <Input value={(draft.weekdays ?? []).join(',')} placeholder="1=周一，7=周日" onChange={(_, data) => update('weekdays', data.value.split(',').map(Number).filter(Boolean))} />
</Field>}
{draft.trigger_type === 'date' && <Field label="日期" required>
  <Input type="date" value={draft.run_date ?? ''} onChange={(_, data) => update('run_date', data.value)} />
</Field>}
<Field label="目标范围" required hint="可对设备班级或单台设备执行。">
  <Dropdown selectedOptions={[targetKind]} onOptionSelect={(_, data) => setTargetKind((data.optionValue ?? 'group') as 'group' | 'device')}>
    <Option value="group">设备班级</Option>
    <Option value="device">单台设备</Option>
  </Dropdown>
</Field>
<Field label="目标" required>
  <Dropdown selectedOptions={[targetKind === 'group' ? (draft.group_id ?? '') : (draft.device_id ?? '')]} onOptionSelect={(_, data) => update(targetKind === 'group' ? 'group_id' : 'device_id', data.optionValue ?? '')} placeholder="选择目标">
    {targets.map((target) => <Option key={target.id} value={target.id}>{target.name}</Option>)}
  </Dropdown>
</Field>
<Field label="延迟秒数" hint="触发后等待该秒数再执行，0 表示立即执行。">
  <Input type="number" min="0" value={String(draft.delay_seconds ?? 0)} onChange={(_, data) => update('delay_seconds', Number(data.value))} />
</Field>
<Field label="动作" required>
  <Dropdown selectedOptions={[draft.actionType ?? 'command']} onOptionSelect={(_, data) => update('actionType', data.optionValue ?? 'command')}>
    <Option value="command">发送命令</Option>
    <Option value="config">下发已保存配置</Option>
    <Option value="schedule">下发已保存课表</Option>
  </Dropdown>
</Field>
{(draft.actionType ?? 'command') === 'command' && <><Field label="命令类型" required>
  <Dropdown selectedOptions={[actionPayload.command_type ?? 'refresh_status']} onOptionSelect={(_, data) => setActionPayload({ ...actionPayload, command_type: data.optionValue ?? 'refresh_status' })}>
    <Option value="refresh_status">刷新状态</Option>
    <Option value="restart_app">重启应用</Option>
    <Option value="upload_diagnostics">上传诊断</Option>
    <Option value="show_notification">显示通知</Option>
    <Option value="trigger_action">触发 Action</Option>
  </Dropdown>
</Field>{actionPayload.command_type === 'trigger_action' && <Field label="Action ID" required hint="客户端插件注册的 Action 标识。">
  <Input value={actionPayload.action_id ?? ''} onChange={(_, data) => setActionPayload({ ...actionPayload, action_id: data.value })} />
</Field>}</>}
{(draft.actionType ?? 'command') === 'schedule' && <Field label="已保存课表" required>
  <Dropdown selectedOptions={[actionPayload.schedule_id ?? '']} onOptionSelect={(_, data) => setActionPayload({ ...actionPayload, schedule_id: data.optionValue ?? '' })} placeholder="选择已保存课表">
    {schedules.map((schedule) => <Option key={schedule.id} value={schedule.id} text={`${schedule.name}（r${schedule.revision}）`}>{schedule.name}（r{schedule.revision}）</Option>)}
  </Dropdown>
</Field>}
{(draft.actionType ?? 'command') === 'config' && <Field label="已保存配置" required>
  <Dropdown selectedOptions={[actionPayload.policy_id ?? '']} onOptionSelect={(_, data) => setActionPayload({ ...actionPayload, policy_id: data.optionValue ?? '' })} placeholder="选择已保存配置">
    {policies.map((policy) => <Option key={policy.id} value={policy.id} text={`${policy.name}（r${policy.revision}）`}>{policy.name}（r{policy.revision}）</Option>)}
  </Dropdown>
</Field>}
<Checkbox label="启用规则" checked={Boolean(draft.enabled)} onChange={(_, data) => update('enabled', Boolean(data.checked))} /><div className={styles.commandBarActions}><Button appearance="subtle" icon={<Delete24Regular />} aria-label="删除自动化" title="删除自动化" disabled={!selectedId} onClick={() => void remove()} /><Button appearance="primary" icon={<Save24Regular />} type="submit">保存</Button></div></form>
    </Card>
    </div>
  </div>
}