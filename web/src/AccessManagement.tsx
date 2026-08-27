import { useEffect, useMemo, useState } from 'react'
import { ChevronDown20Regular, ChevronRight20Regular, Save24Regular, ShieldLock24Regular } from '@fluentui/react-icons'
import { Badge, Button, Checkbox, Dropdown, Field, Option, Spinner, Switch, Text } from '@fluentui/react-components'
import { api, type AdminUser, type Device, type Group, type Organization, type PermissionCatalog, type PermissionGrant } from './api'

type Props = { organizations: Organization[]; groups: Group[]; devices: Device[]; users: AdminUser[]; onUsersChanged: () => void; onComplete: (message: string, tone?: 'success' | 'error') => void }
type Scope = { type: 'organization' | 'group' | 'device'; id: string | null; label: string }

export function AccessManagement({ organizations, groups, devices, users, onUsersChanged, onComplete }: Props) {
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null)
  const [userId, setUserId] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [grants, setGrants] = useState<PermissionGrant[]>([])
  const [active, setActive] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [scope, setScope] = useState<Scope>({ type: 'organization', id: null, label: '整个组织' })
  const [loading, setLoading] = useState(false)
  const selectedUser = users.find((user) => user.id === userId)

  useEffect(() => { void api.permissionCatalog().then(setCatalog).catch(() => undefined) }, [])
  useEffect(() => {
    if (!userId && users[0]) setUserId(users[0].id)
  }, [users, userId])
  useEffect(() => {
    if (!organizationId && organizations[0]) setOrganizationId(organizations[0].id)
  }, [organizations, organizationId])
  useEffect(() => setScope({ type: 'organization', id: null, label: '整个组织' }), [organizationId])
  useEffect(() => {
    if (!userId) return
    setLoading(true)
    void api.userGrants(userId).then((result) => {
      setGrants(result.grants)
      setActive(result.authorization_status === 'active')
    }).catch((error) => onComplete(error instanceof Error ? error.message : '加载权限失败', 'error')).finally(() => setLoading(false))
  }, [userId, onComplete])

  const organizationGrants = useMemo(() => grants.filter((grant) => grant.organization_id === organizationId), [grants, organizationId])
  const organizationGroups = useMemo(() => groups.filter((group) => group.organization_id === organizationId), [groups, organizationId])
  const scopeMatches = (grant: PermissionGrant, target = scope) => grant.organization_id === organizationId && grant.resource_type === target.type && grant.resource_id === target.id
  const checked = (key: string, platform = false, target = scope) => grants.some((grant) => grant.permission_key === key && (platform ? grant.resource_type === 'platform' : scopeMatches(grant, target)))
  const moduleState = (keys: string[], target = scope) => {
    const count = keys.filter((key) => checked(key, false, target)).length
    return count === 0 ? false : count === keys.length ? true : 'mixed'
  }
  function setPermission(key: string, enabled: boolean, platform = false) {
    setGrants((current) => enabled
      ? [...current.filter((grant) => !(grant.permission_key === key && (platform ? grant.resource_type === 'platform' : scopeMatches(grant)))), { permission_key: key, organization_id: platform ? null : organizationId, resource_type: platform ? 'platform' : scope.type, resource_id: platform ? null : scope.id }]
      : current.filter((grant) => !(grant.permission_key === key && (platform ? grant.resource_type === 'platform' : scopeMatches(grant)))))
  }
  function setModule(keys: string[], enabled: boolean) { keys.forEach((key) => setPermission(key, enabled)) }
  function toggleExpanded(key: string) { setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next }) }
  function applyTemplate(template: 'viewer' | 'operator' | 'admin') {
    if (!catalog || !organizationId) return
    const allowed = template === 'viewer' ? new Set(['view']) : template === 'operator' ? new Set(['view', 'create', 'update', 'execute', 'restore', 'pair', 'publish', 'assign']) : null
    const replacement = catalog.organization.flatMap((module) => module.actions.filter((action) => !allowed || allowed.has(action.action)).map((action) => ({ permission_key: action.key, organization_id: organizationId, resource_type: 'organization' as const, resource_id: null })))
    setGrants((current) => [...current.filter((grant) => grant.organization_id !== organizationId), ...replacement])
  }
  function chooseScope(next: Scope) { setScope(next); setExpanded((current) => new Set(current).add('organization')) }
  async function save() {
    if (!userId) return
    setLoading(true)
    try {
      await api.setUserGrants(userId, grants, active ? 'active' : 'pending')
      onComplete('用户权限已保存')
      onUsersChanged()
    } catch (error) { onComplete(error instanceof Error ? error.message : '保存权限失败', 'error') }
    finally { setLoading(false) }
  }

  return <section className="access-management">
    <div className="access-toolbar">
      <Field label="成员"><Dropdown value={selectedUser?.display_name || selectedUser?.username || ''} selectedOptions={userId ? [userId] : []} onOptionSelect={(_, data) => setUserId(String(data.optionValue))}>{users.map((user) => <Option key={user.id} value={user.id} text={user.display_name || user.username}>{user.display_name || user.username}{user.authorization_status === 'pending' ? '（待授权）' : ''}</Option>)}</Dropdown></Field>
      <Field label="组织"><Dropdown value={organizations.find((item) => item.id === organizationId)?.name || ''} selectedOptions={organizationId ? [organizationId] : []} onOptionSelect={(_, data) => setOrganizationId(String(data.optionValue))}>{organizations.map((organization) => <Option key={organization.id} value={organization.id}>{organization.name}</Option>)}</Dropdown></Field>
      <Switch checked={active} onChange={(_, data) => setActive(data.checked)} label={active ? '账号已激活' : '待授权'} />
      <div className="access-template-actions"><Button onClick={() => applyTemplate('viewer')}>只读模板</Button><Button onClick={() => applyTemplate('operator')}>操作员模板</Button><Button onClick={() => applyTemplate('admin')}>组织管理员模板</Button></div>
    </div>
    {loading && <Spinner size="tiny" />}
    {catalog && <div className="permission-tree" role="tree" aria-label="权限树">
      <div className="permission-root"><ShieldLock24Regular /><Text weight="semibold">{selectedUser?.display_name || selectedUser?.username || '请选择成员'}</Text><Badge appearance="tint">{grants.length} 项授权</Badge></div>
      <div className="permission-branch">
        <button className="tree-expander" onClick={() => toggleExpanded('platform')}>{expanded.has('platform') ? <ChevronDown20Regular /> : <ChevronRight20Regular />}<strong>平台权限</strong></button>
        {expanded.has('platform') && <div className="permission-children">{catalog.platform.map((item) => <Checkbox key={item.key} label={item.label} checked={checked(item.key, true)} onChange={(_, data) => setPermission(item.key, Boolean(data.checked), true)} />)}</div>}
      </div>
      <div className="permission-branch">
        <button className="tree-expander" onClick={() => toggleExpanded('organization')}>{expanded.has('organization') ? <ChevronDown20Regular /> : <ChevronRight20Regular />}<strong>{organizations.find((item) => item.id === organizationId)?.name || '组织权限'}</strong><span>{organizationGrants.length} 项</span></button>
        {expanded.has('organization') && <div className="permission-resource-layout"><div className="permission-resources"><button className={`permission-resource ${scope.type === 'organization' ? 'selected' : ''}`} onClick={() => chooseScope({ type: 'organization', id: null, label: '整个组织' })}>整个组织</button>{organizationGroups.map((group) => <div key={group.id} className="permission-resource-group"><button className={`permission-resource ${scope.type === 'group' && scope.id === group.id ? 'selected' : ''}`} onClick={() => chooseScope({ type: 'group', id: group.id, label: group.name })}>{group.name}</button><div>{devices.filter((device) => device.group_id === group.id).map((device) => <button key={device.id} className={`permission-resource device ${scope.type === 'device' && scope.id === device.id ? 'selected' : ''}`} onClick={() => chooseScope({ type: 'device', id: device.id, label: device.name })}>{device.name}</button>)}</div></div>)}</div><div className="permission-children modules"><Text weight="semibold">当前范围：{scope.label}</Text>{catalog.organization.map((module) => {
          const keys = module.actions.map((action) => action.key)
          const open = expanded.has(module.key)
          const supported = module.resource_types.includes(scope.type)
          return <div className={`permission-module ${supported ? '' : 'unsupported'}`} key={module.key}><div className="permission-module-row"><button className="tree-expander" disabled={!supported} onClick={() => toggleExpanded(module.key)}>{open ? <ChevronDown20Regular /> : <ChevronRight20Regular />}</button><Checkbox disabled={!supported} label={module.label} checked={supported ? moduleState(keys) : false} onChange={(_, data) => setModule(keys, Boolean(data.checked))} /></div>{open && supported && <div className="permission-actions">{module.actions.map((action) => <Checkbox key={action.key} label={action.label} checked={checked(action.key)} onChange={(_, data) => setPermission(action.key, Boolean(data.checked))} />)}</div>}</div>
        })}</div></div>}
      </div>
    </div>}
    <div className="access-save"><Text size={200}>父节点勾选会授予该模块全部动作；组织授权向分组和设备继承。</Text><Button appearance="primary" icon={<Save24Regular />} disabled={!userId || loading} onClick={() => void save()}>保存权限</Button></div>
  </section>
}
