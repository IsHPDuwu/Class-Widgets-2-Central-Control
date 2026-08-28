import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Add24Regular,
  AppsListDetail24Regular,
  ArrowRepeatAll24Regular,
  ArrowClockwise24Regular,
  CalendarLtr24Regular,
  CalendarSync24Regular,
  CheckmarkCircle20Filled,
  Code24Regular,
  Delete24Regular,
  Desktop24Regular,
  DismissCircle20Filled,
  DocumentBulletList24Regular,
  Key24Regular,
  Navigation24Regular,
  Organization24Regular,
  PeopleTeam24Regular,
  ShieldLock24Regular,
  WeatherMoon24Regular,
  SignOut24Regular,
} from '@fluentui/react-icons'
import { Button, Checkbox, Select, Tab, TabList } from '@fluentui/react-components'
import { api, getAdminKey, getSessionToken, setAdminKey, setSessionToken, type AdminUser, type CommandRecord, type Device, type DiagnosticDetail, type Group, type OAuthProviderPublic, type Organization, type Principal } from './api'
import { ScheduleWorkspace } from './ScheduleWorkspace'
import { ConfigWorkspace } from './ConfigWorkspace'
import { AutomationWorkspace } from './AutomationWorkspace'
import { ClassSwapWorkspace } from './ClassSwapWorkspace'
import { AccessManagement } from './AccessManagement'
import { OAuthProviderManagement } from './OAuthProviderManagement'
import centralControlIcon from './assets/cw2-jikong.png'
type ThemeMode = 'system' | 'light' | 'dark'
import './App.css'

type View = 'overview' | 'devices' | 'groups' | 'schedule' | 'class-swap' | 'policy' | 'commands' | 'automation' | 'logs' | 'tenants'
type Notice = { tone: 'success' | 'error'; message: string } | null

const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof Desktop24Regular }> = [
  { id: 'overview', label: '总览', icon: AppsListDetail24Regular },
  { id: 'devices', label: '设备', icon: Desktop24Regular },
  { id: 'groups', label: '分组与配对', icon: Organization24Regular },
  { id: 'schedule', label: '课表发布', icon: CalendarLtr24Regular },
  { id: 'class-swap', label: '临时换课', icon: CalendarSync24Regular },
  { id: 'policy', label: '策略', icon: ShieldLock24Regular },
  { id: 'commands', label: '命令', icon: Code24Regular },
  { id: 'automation', label: '自动化', icon: ArrowRepeatAll24Regular },
  { id: 'logs', label: '客户端日志', icon: DocumentBulletList24Regular },
]

const VIEW_TITLES: Record<View, [string, string]> = {
  overview: ['运行总览', '设备连接与配置下发状态'],
  devices: ['设备', '检查终端状态、版本和配置修订'],
  groups: ['分组与配对', '组织终端并生成一次性配对码'],
  schedule: ['课表发布', '校验并向选定分组发布课表'],
  'class-swap': ['临时换课', '获取客户端单双周课表并下发换课事件'],
  policy: ['策略', '统一锁定终端的受管设置'],
  commands: ['命令', '向分组或单台设备下发受限操作'],
  automation: ['自动化', '按服务器时间和设备条件自动执行动作'],
  logs: ['客户端日志', '查看终端动态上报的诊断与日志'],
  tenants: ['租户管理', '创建租户账号并配置可访问的组织范围'],
}

function isOnline(device: Device) {
  if (!device.last_seen || device.revoked) return false
  return Date.now() - new Date(device.last_seen).getTime() < 45_000
}

function relativeTime(value: string | null) {
  if (!value) return '从未连接'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds} 秒前`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  return `${Math.floor(seconds / 3600)} 小时前`
}

function App({ themeMode, onThemeModeChange }: { themeMode: ThemeMode; onThemeModeChange: (mode: ThemeMode) => void }) {
  const [view, setView] = useState<View>('overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [adminKey, updateAdminKey] = useState(getAdminKey())
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [oauthPending, setOauthPending] = useState(false)

  const refresh = useCallback(async () => {
    if (!getAdminKey() && !getSessionToken()) { setConnected(false); return }
    if (oauthPending) { setConnected(true); return }
    setLoading(true)
    try {
      const [nextPrincipal, nextOrganizations] = await Promise.all([api.me(), api.organizations()])
      setPrincipal(nextPrincipal)
      setOrganizations(nextOrganizations)
      const nextOrganizationId = nextOrganizations.some((organization) => organization.id === organizationId)
        ? organizationId
        : nextOrganizations[0]?.id ?? ''
      setOrganizationId(nextOrganizationId)
      if (!nextOrganizationId) {
        setGroups([])
        setDevices([])
        setConnected(true)
        setNotice(null)
        return
      }
      const [nextGroups, nextDevices] = await Promise.all([
        api.groups(nextOrganizationId), api.devices(nextOrganizationId),
      ])
      setGroups(nextGroups)
      setDevices(nextDevices)
      setConnected(true)
      setNotice(null)
    } catch (error) {
      setAdminKey('')
      setSessionToken('')
      setConnected(false)
      setPrincipal(null)
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : '无法连接服务' })
    } finally {
      setLoading(false)
    }
  }, [oauthPending, organizationId])

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search)
    const exchangeCode = window.location.pathname === '/oauth/callback' ? parameters.get('code') : null
    if (exchangeCode) {
      void api.exchangeOAuthCode(exchangeCode).then((result) => {
        setSessionToken(result.token)
        setAdminKey('')
        window.history.replaceState({}, '', parameters.get('return_path') || '/')
        void api.me().then((nextPrincipal) => {
          setPrincipal(nextPrincipal)
          if (nextPrincipal.authorization_status === 'pending') {
            setOauthPending(true)
            setConnected(true)
          } else void refresh()
        })
      }).catch((error) => setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'OIDC 登录失败' }))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 10_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  function connect(event: FormEvent) {
    event.preventDefault()
    setSessionToken('')
    setAdminKey(adminKey.trim())
    void refresh()
  }

  async function login(event: FormEvent) {
    event.preventDefault()
    try {
      const result = await api.login(username.trim(), password)
      setSessionToken(result.token)
      setAdminKey('')
      await refresh()
      setPassword('')
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : '登录失败' })
    }
  }

  function complete(message: string, tone: 'success' | 'error' = 'success') {
    setNotice({ tone, message })
    if (tone === 'success') void refresh()
  }

  async function logout() {
    try { if (getSessionToken()) await api.logout() } catch { /* 本地凭据仍需清理 */ }
    setSessionToken('')
    setAdminKey('')
    updateAdminKey('')
    setPrincipal(null)
    setConnected(false)
  }

  const [title, subtitle] = VIEW_TITLES[view]
  const navItems = principal?.platform_admin || principal?.permissions.some((permission) => permission.startsWith('platform.'))
    ? [...NAV_ITEMS, { id: 'tenants' as const, label: '租户管理', icon: PeopleTeam24Regular }]
    : NAV_ITEMS

  if (!connected) return <LoginPage adminKey={adminKey} onAdminKeyChange={updateAdminKey} username={username} password={password} onUsernameChange={setUsername} onPasswordChange={setPassword} onAdminLogin={connect} onTenantLogin={login} loading={loading} onComplete={complete} />
  if (oauthPending) return <OAuthCompletionPage onComplete={() => { setOauthPending(false); void refresh() }} />
  return <div className="app-shell">
    <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark"><img src={centralControlIcon} alt="集控" /></div><div><strong>集控</strong><span>Class Widgets</span></div></div>
      <TabList className="nav-list" vertical selectedValue={view} onTabSelect={(_, data) => { setView(data.value as View); setMobileNav(false) }} aria-label="主导航">{navItems.map((item) => { const Icon = item.icon; return <Tab key={item.id} value={item.id} icon={<Icon />}>{item.label}</Tab> })}</TabList>
      <div className="sidebar-footer"><span className={connected ? 'status-dot online' : 'status-dot'} /><span>{connected ? '服务已连接' : '服务未连接'}</span></div>
    </aside>
    <main>
      <header className="topbar">
        <Button className="menu-button" appearance="subtle" icon={<Navigation24Regular />} aria-label="打开导航" onClick={() => setMobileNav(!mobileNav)} />
        <label className="toolbar-select"><Organization24Regular /><Select aria-label="当前组织" value={organizationId} onChange={(_, data) => setOrganizationId(data.value)}>{organizations.length === 0 && <option value="">未选择组织</option>}{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</Select></label>
        <label className="toolbar-select theme-picker"><WeatherMoon24Regular /><Select aria-label="颜色模式" value={themeMode} onChange={(_, data) => onThemeModeChange(data.value as ThemeMode)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></Select></label>
        <Button appearance="subtle" icon={<ArrowClockwise24Regular />} aria-label="刷新" disabled={loading} onClick={() => void refresh()} />
        <Button appearance="subtle" icon={<SignOut24Regular />} aria-label="退出登录" title="退出登录" onClick={() => void logout()} />
      </header>
      <div className="page">
        <section className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div></section>
        {notice && <div className={`notice ${notice.tone}`}>{notice.tone === 'success' ? <CheckmarkCircle20Filled /> : <DismissCircle20Filled />}<span>{notice.message}</span></div>}
          {view === 'overview' && <Overview devices={devices} groups={groups} organizations={organizations} onComplete={complete} />}
        {view === 'devices' && <DevicesView devices={devices} groups={groups} onComplete={complete} />}
        {view === 'groups' && <GroupsView organizationId={organizationId} groups={groups} onComplete={complete} />}
        {view === 'schedule' && <ScheduleWorkspace organizationId={organizationId} groups={groups} onComplete={complete} />}
        {view === 'class-swap' && <ClassSwapWorkspace organizationId={organizationId} groups={groups} devices={devices} onComplete={complete} />}
        {view === 'policy' && <ConfigWorkspace organizationId={organizationId} groups={groups} onComplete={complete} />}
        {view === 'commands' && <CommandsView organizationId={organizationId} groups={groups} devices={devices} onComplete={complete} />}
        {view === 'automation' && <AutomationWorkspace organizationId={organizationId} groups={groups} devices={devices} onComplete={complete} />}
        {view === 'logs' && <LogsView organizationId={organizationId} />}
        {view === 'tenants' && (principal?.platform_admin || principal?.permissions.some((permission) => permission.startsWith('platform.'))) && <TenantManagement organizations={organizations} groups={groups} devices={devices} onComplete={complete} />}
      </div>
    </main>
  </div>
}

function LoginPage({ adminKey, onAdminKeyChange, username, password, onUsernameChange, onPasswordChange, onAdminLogin, onTenantLogin, loading, onComplete }: { adminKey: string; onAdminKeyChange: (value: string) => void; username: string; password: string; onUsernameChange: (value: string) => void; onPasswordChange: (value: string) => void; onAdminLogin: (event: FormEvent) => void; onTenantLogin: (event: FormEvent) => void; loading: boolean; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const [mode, setMode] = useState<'tenant' | 'admin'>('tenant')
  const [registering, setRegistering] = useState(false)
  const [registrationAllowed, setRegistrationAllowed] = useState(false)
  const [organizationName, setOrganizationName] = useState('')
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderPublic[]>([])
  useEffect(() => { api.registrationStatus().then((result) => setRegistrationAllowed(result.allow_registration)).catch(() => setRegistrationAllowed(false)) }, [])
  useEffect(() => { api.oauthProvidersPublic().then(setOauthProviders).catch(() => setOauthProviders([])) }, [])
  async function register(event: FormEvent) { event.preventDefault(); try { await api.register({ organization_name: organizationName.trim(), username: username.trim(), password }); setRegistering(false); onComplete('注册成功，请登录'); setOrganizationName('') } catch (error) { onComplete(error instanceof Error ? error.message : '注册失败', 'error') } }
  return <div className="login-page"><div className="login-banner"><div className="login-banner-copy"><img src={centralControlIcon} alt="Class Widgets" /><strong>Class Widgets</strong><span>集中管理平台</span><p>统一管理设备、课表、策略与自动化任务。</p></div></div><div className="login-card"><div className="login-heading"><h1>{registering ? '创建租户账号' : '登录集控'}</h1><p>{mode === 'admin' ? '平台管理员使用管理密钥进入后台。' : registering ? '注册后将创建一个新的租户及管理员账号。' : '租户成员使用账号、密码或组织身份源登录。'}</p></div>{!registering && <div className="segmented login-segment"><button type="button" className={mode === 'tenant' ? 'selected' : ''} onClick={() => setMode('tenant')}>租户登录</button><button type="button" className={mode === 'admin' ? 'selected' : ''} onClick={() => setMode('admin')}>管理员登录</button></div>}{registering ? <form onSubmit={register}><label>租户名称<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="例如：示范中学" /></label><label>管理员用户名<input value={username} onChange={(event) => onUsernameChange(event.target.value)} /></label><label>密码<input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="至少 12 个字符" /></label><Button appearance="primary" type="submit" disabled={!organizationName.trim() || !username.trim() || password.length < 12 || loading}>注册</Button><Button appearance="subtle" type="button" onClick={() => setRegistering(false)}>返回登录</Button></form> : mode === 'admin' ? <form onSubmit={onAdminLogin}><label>管理员密钥<input type="password" value={adminKey} onChange={(event) => onAdminKeyChange(event.target.value)} placeholder="输入平台管理员密钥" /></label><Button appearance="primary" type="submit" disabled={!adminKey.trim() || loading}>管理员登录</Button></form> : <><form onSubmit={onTenantLogin}><label>用户名<input value={username} onChange={(event) => onUsernameChange(event.target.value)} /></label><label>密码<input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label><Button appearance="primary" type="submit" disabled={!username.trim() || password.length < 12 || loading}>登录</Button>{registrationAllowed && <Button appearance="subtle" type="button" onClick={() => setRegistering(true)}>注册新租户</Button>}</form>{oauthProviders.length > 0 && <div className="oauth-login-options"><span>或使用组织身份源</span>{oauthProviders.map((provider) => <Button key={provider.key} appearance="outline" icon={<ShieldLock24Regular />} onClick={() => { window.location.href = `/api/v1/auth/oauth/${encodeURIComponent(provider.key)}/start?return_path=${encodeURIComponent('/')}` }}>使用 {provider.name} 登录</Button>)}</div>}</>}</div></div>
}

 function ConnectionPanel_UNUSED_REMOVED({ value, onChange, onSubmit, username, password, onUsernameChange, onPasswordChange, onLogin, loading }: { value: string; onChange: (value: string) => void; onSubmit: (event: FormEvent) => void; username: string; password: string; onUsernameChange: (value: string) => void; onPasswordChange: (value: string) => void; onLogin: (event: FormEvent) => void; loading: boolean }) {
  return <div className="connection-panel"><Key24Regular /><div><strong>连接管理服务</strong><span>平台管理员可使用密钥；租户成员使用账号登录。</span></div><form onSubmit={onSubmit}><input type="password" aria-label="管理员密钥" placeholder="输入平台管理员密钥" value={value} onChange={(event) => onChange(event.target.value)} /><button className="primary" disabled={!value.trim() || loading}>密钥连接</button></form><form onSubmit={onLogin}><input aria-label="用户名" placeholder="用户名" value={username} onChange={(event) => onUsernameChange(event.target.value)} /><input type="password" aria-label="密码" placeholder="密码" value={password} onChange={(event) => onPasswordChange(event.target.value)} /><button className="primary" disabled={!username.trim() || password.length < 12 || loading}>账号登录</button></form></div>
}

void ConnectionPanel_UNUSED_REMOVED

function OAuthCompletionPage({ onComplete }: { onComplete: () => void }) {
  const [mode, setMode] = useState<'register' | 'bind'>('register')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const result = await api.completeOAuth({ mode, username: username.trim(), password, ...(mode === 'register' ? { organization_name: organizationName.trim() } : {}) })
      if (result.token) setSessionToken(result.token)
      onComplete()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败') } finally { setLoading(false) }
  }
  return <div className="login-page"><div className="login-banner"><div className="login-banner-copy"><img src={centralControlIcon} alt="Class Widgets" /><strong>Class Widgets</strong><span>完成账号设置</span><p>这是该身份源首次登录，请选择账号处理方式。</p></div></div><div className="login-card"><div className="login-heading"><h1>完成 OAuth 登录</h1><p>未找到对应的集控账号。</p></div><div className="segmented login-segment"><button type="button" className={mode === 'register' ? 'selected' : ''} onClick={() => setMode('register')}>注册新账号</button><button type="button" className={mode === 'bind' ? 'selected' : ''} onClick={() => setMode('bind')}>绑定已有账号</button></div>{error && <div className="notice error">{error}</div>}<form onSubmit={submit}><label>集控用户名<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder={mode === 'bind' ? '输入已有用户名' : '设置用户名'} /></label><label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'bind' ? '验证已有密码' : '至少 12 个字符'} /></label>{mode === 'register' && <label>新建组织名称<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="例如：示范中学" /></label>}<Button appearance="primary" type="submit" disabled={loading || !username.trim() || password.length < 12 || (mode === 'register' && !organizationName.trim())}>{mode === 'bind' ? '验证并绑定' : '创建账号并继续'}</Button></form></div></div>
}

function TenantManagement({ organizations, groups, devices, onComplete }: { organizations: Organization[]; groups: Group[]; devices: Device[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [tenantName, setTenantName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('operator')
  const [selected, setSelected] = useState<string[]>([])
  const [allowRegistration, setAllowRegistration] = useState(false)
  useEffect(() => { void api.registrationSetting().then((setting) => setAllowRegistration(setting.allow_registration)).catch(() => undefined) }, [])
  const load = useCallback(() => api.users().then(setUsers).catch((error) => onComplete(error instanceof Error ? error.message : '加载成员失败', 'error')), [onComplete])
  useEffect(() => { void load() }, [load])
  async function createTenant(event: FormEvent) { event.preventDefault(); try { await api.createOrganization(tenantName.trim()); setTenantName(''); onComplete('租户已创建') } catch (error) { onComplete(error instanceof Error ? error.message : '创建租户失败', 'error') } }
  async function createMember(event: FormEvent) { event.preventDefault(); try { await api.createUser({ username: username.trim(), password, role, organization_ids: selected }); setUsername(''); setPassword(''); setSelected([]); onComplete('租户成员已创建'); load() } catch (error) { onComplete(error instanceof Error ? error.message : '创建成员失败', 'error') } }
  async function assign(user: AdminUser, ids: string[]) { try { await api.assignUserOrganizations(user.id, ids); onComplete(`“${user.username}”的租户范围已更新`); load() } catch (error) { onComplete(error instanceof Error ? error.message : '更新授权失败', 'error') } }
  function organizationChecks(ids: string[], change: (value: string[]) => void) { return <div className="checks">{organizations.map((organization) => <label key={organization.id}><input type="checkbox" checked={ids.includes(organization.id)} onChange={(event) => change(event.target.checked ? [...ids, organization.id] : ids.filter((id) => id !== organization.id))} />{organization.name}</label>)}</div> }
  return <div className="tenant-layout"><section className="form-section"><h2>总设置</h2><p>控制是否允许未登录用户在登录页注册新租户。</p><Checkbox label="允许公开注册" checked={allowRegistration} onChange={(_, data) => { const enabled = Boolean(data.checked); setAllowRegistration(enabled); void api.updateRegistrationSetting(enabled).then(() => onComplete(enabled ? '已允许公开注册' : '已关闭公开注册')).catch((error) => onComplete(error instanceof Error ? error.message : '保存设置失败', 'error')) }} /></section><section className="form-section"><h2>新建租户</h2><p>每个租户拥有独立的分组、设备、课表、策略、命令和日志。</p><form onSubmit={createTenant}><label>租户名称<input value={tenantName} onChange={(event) => setTenantName(event.target.value)} placeholder="例如：示范中学" /></label><button className="primary" disabled={!tenantName.trim()}><Add24Regular />创建租户</button></form></section><section className="form-section"><h2>新建成员</h2><p>创建后可在下方权限树中精细授权。</p><form onSubmit={createMember}><label>用户名<input value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 12 个字符" /></label><label>初始模板<select value={role} onChange={(event) => setRole(event.target.value)}><option value="viewer">只读</option><option value="operator">操作员</option><option value="admin">租户管理员</option></select></label><fieldset><legend>初始组织范围</legend>{organizationChecks(selected, setSelected)}</fieldset><button className="primary" disabled={!username.trim() || password.length < 12}><PeopleTeam24Regular />创建成员</button></form></section><section className="data-section tenant-members"><div className="section-heading"><h2>成员与租户授权</h2><span>{users.length} 名成员</span></div>{users.length === 0 && <div className="empty-command">暂无租户成员</div>}{users.map((user) => <TenantMemberRow key={user.id} user={user} organizations={organizations} onAssign={assign} />)}</section><section className="span-all"><AccessManagement organizations={organizations} groups={groups} devices={devices} users={users} onUsersChanged={load} onComplete={onComplete} /></section><section className="span-all"><OAuthProviderManagement onComplete={onComplete} /></section></div>
}

function TenantMemberRow({ user, organizations, onAssign }: { user: AdminUser; organizations: Organization[]; onAssign: (user: AdminUser, ids: string[]) => void }) {
  const [ids, setIds] = useState(user.organization_ids)
  useEffect(() => setIds(user.organization_ids), [user.organization_ids])
  return <article className="tenant-member"><div><strong>{user.username}</strong><span>{user.role} · {user.disabled ? '已停用' : '启用'}</span></div><div className="checks">{organizations.map((organization) => <label key={organization.id}><input type="checkbox" checked={ids.includes(organization.id)} onChange={(event) => setIds(event.target.checked ? [...ids, organization.id] : ids.filter((id) => id !== organization.id))} />{organization.name}</label>)}</div><button className="primary" onClick={() => onAssign(user, ids)}>保存授权</button></article>
}

function Overview({ devices, groups, organizations, onComplete }: { devices: Device[]; groups: Group[]; organizations: Organization[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const online = devices.filter(isOnline).length
  const drifted = devices.filter((device) => { const group = groups.find((item) => item.id === device.group_id); return group && (device.schedule_revision < group.schedule_revision || device.policy_revision < group.policy_revision) }).length
  return <>{organizations.length === 0 && <OrganizationSetup onComplete={onComplete} />}<div className="metrics"><Metric label="设备总数" value={devices.length} detail={`${groups.length} 个分组`} /><Metric label="在线" value={online} detail={devices.length ? `${Math.round(online / devices.length * 100)}% 可用` : '等待设备配对'} tone="green" /><Metric label="配置漂移" value={drifted} detail={drifted ? '等待终端同步' : '修订状态一致'} tone={drifted ? 'amber' : undefined} /><Metric label="离线" value={devices.length - online} detail="超过 45 秒未上报" /></div><DeviceTable devices={devices.slice(0, 8)} groups={groups} title="最近设备" /></>
}

function OrganizationSetup({ onComplete }: { onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const [name, setName] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); try { await api.createOrganization(name); onComplete('组织已创建') } catch (error) { onComplete(error instanceof Error ? error.message : '创建失败', 'error') } }
  return <form className="organization-setup" onSubmit={submit}><Organization24Regular /><div className="organization-setup-copy"><strong>创建首个组织</strong><span>组织是分组、课表和策略的管理边界。</span></div><div className="organization-setup-actions"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：示范中学" /><button className="primary" disabled={!name.trim()}><Add24Regular />创建</button></div></form>
}

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: string }) {
  return <article className={`metric ${tone ?? ''}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function DevicesView({ devices, groups, onComplete }: { devices: Device[]; groups: Group[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const [query, setQuery] = useState('')
  const filtered = devices.filter((device) => device.name.toLowerCase().includes(query.toLowerCase()))
  async function move(deviceId: string, groupId: string) { try { await api.moveDevice(deviceId, groupId); onComplete('设备分组已更新') } catch (error) { onComplete(error instanceof Error ? error.message : '换组失败', 'error') } }
  async function remove(deviceId: string, deviceName: string) {
    if (!window.confirm(`确定删除设备“${deviceName}”？删除后该设备需要重新配对。`)) return
    try { await api.deleteDevice(deviceId); onComplete('设备已删除') } catch (error) { onComplete(error instanceof Error ? error.message : '删除设备失败', 'error') }
  }
  return <><div className="toolbar"><input className="search" placeholder="搜索设备名称" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{filtered.length} 台设备</span></div><DeviceTable devices={filtered} groups={groups} title="全部设备" onMove={move} onDelete={remove} /></>
}

function DeviceTable({ devices, groups, title, onMove, onDelete }: { devices: Device[]; groups: Group[]; title: string; onMove?: (deviceId: string, groupId: string) => void; onDelete?: (deviceId: string, deviceName: string) => void }) {
  return <section className="data-section"><div className="section-heading"><h2>{title}</h2><span>{devices.length} 项</span></div><div className="table-wrap"><table><thead><tr><th>设备</th><th>状态</th><th>分组</th><th>当前课程</th><th>应用 / 插件</th><th>课表 / 策略</th><th>最后连接</th>{onDelete && <th>操作</th>}</tr></thead><tbody>{devices.length === 0 && <tr><td colSpan={onDelete ? 8 : 7} className="empty">暂无设备</td></tr>}{devices.map((device) => <tr key={device.id}><td><strong>{device.name}</strong><small>{device.id.slice(0, 8)}</small></td><td><span className={`state ${isOnline(device) ? 'online' : ''}`}><i />{device.revoked ? '已撤销' : isOnline(device) ? '在线' : '离线'}</span></td><td>{onMove ? <select aria-label={`调整 ${device.name} 的分组`} value={device.group_id} onChange={(event) => onMove(device.id, event.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select> : groups.find((group) => group.id === device.group_id)?.name ?? '未知'}</td><td>{device.current_title || device.current_status || '-'}</td><td>{device.app_version || '-'} / {device.plugin_version || '-'}</td><td>r{device.schedule_revision} / r{device.policy_revision}</td><td>{relativeTime(device.last_seen)}</td>{onDelete && <td><Button appearance="subtle" icon={<Delete24Regular />} aria-label={`删除设备 ${device.name}`} title="删除设备" onClick={() => onDelete(device.id, device.name)} /></td>}</tr>)}</tbody></table></div></section>
}

function GroupsView({ organizationId, groups, onComplete }: { organizationId: string; groups: Group[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [pairing, setPairing] = useState<{ code: string; expires_at: string } | null>(null)
  async function createGroup(event: FormEvent) { event.preventDefault(); try { await api.createGroup(organizationId, name); setName(''); onComplete('分组已创建') } catch (error) { onComplete(error instanceof Error ? error.message : '创建失败', 'error') } }
  async function createCode() { try { const result = await api.createPairingCode(groupId, 15); setPairing(result); onComplete('一次性配对码已生成') } catch (error) { onComplete(error instanceof Error ? error.message : '生成失败', 'error') } }
  return <div className="two-column"><section className="form-section"><h2>新建分组</h2><p>设备配对后将继承该分组的课表和策略。</p><form onSubmit={createGroup}><label>分组名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：高一教学楼" /></label><button className="primary" disabled={!organizationId || !name.trim()}><Add24Regular />创建分组</button></form></section><section className="form-section"><h2>设备配对</h2><p>配对码有效 15 分钟，使用一次后立即失效。</p><label>目标分组<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">选择分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><button className="primary" disabled={!groupId} onClick={() => void createCode()}><Key24Regular />生成配对码</button>{pairing && <div className="pairing-code"><strong>{pairing.code}</strong><span>有效至 {new Date(pairing.expires_at).toLocaleTimeString('zh-CN')}</span></div>}</section><section className="data-section span-all"><div className="section-heading"><h2>分组</h2><span>{groups.length} 项</span></div><div className="group-grid">{groups.map((group) => <article className="group-row" key={group.id}><Organization24Regular /><div><strong>{group.name}</strong><span>课表 r{group.schedule_revision} · 策略 r{group.policy_revision}</span></div></article>)}</div></section></div>
}

function CommandsView({ organizationId, groups, devices, onComplete }: { organizationId: string; groups: Group[]; devices: Device[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const [targetKind, setTargetKind] = useState<'group' | 'device'>('group')
  const [targetId, setTargetId] = useState('')
  const [type, setType] = useState('refresh_status')
  const [title, setTitle] = useState('来自集控的通知')
  const [message, setMessage] = useState('')
  const [actionId, setActionId] = useState('')
  const [commands, setCommands] = useState<CommandRecord[]>([])
  useEffect(() => {
    if (!organizationId) {
      setCommands([])
      return
    }
    let active = true
    const load = () => api.commands(organizationId).then((items) => {
      if (active) setCommands(items)
    }).catch(() => undefined)
    void load()
    const timer = window.setInterval(load, 10_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [organizationId])
  async function submit(event: FormEvent) { event.preventDefault(); try { const payload = type === 'show_notification' ? { title, message } : type === 'trigger_action' ? { action_id: actionId.trim() } : {}; const result = await api.createCommand({ type, [`${targetKind}_id`]: targetId, payload, expires_in_seconds: 300 }); onComplete(`命令 #${result.cursor} 已进入下发队列`) } catch (error) { onComplete(error instanceof Error ? error.message : '下发失败', 'error') } }
  const targets = targetKind === 'group' ? groups : devices
  return <div className="command-layout"><section className="form-section command-form"><form onSubmit={submit}><div className="segmented"><button type="button" className={targetKind === 'group' ? 'selected' : ''} onClick={() => { setTargetKind('group'); setTargetId('') }}>分组</button><button type="button" className={targetKind === 'device' ? 'selected' : ''} onClick={() => { setTargetKind('device'); setTargetId('') }}>单台设备</button></div><label>目标<select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">选择目标</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label><label>操作<select value={type} onChange={(event) => setType(event.target.value)}><option value="refresh_status">立即刷新状态</option><option value="restart_app">重启 Class Widgets</option><option value="upload_diagnostics">上传诊断信息</option><option value="show_notification">显示通知</option><option value="trigger_action">触发 Action</option></select></label>{type === 'show_notification' && <><label>通知标题<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>通知内容<textarea value={message} onChange={(event) => setMessage(event.target.value)} /></label></>}{type === 'trigger_action' && <label>Action ID<input value={actionId} onChange={(event) => setActionId(event.target.value)} placeholder="例如：com.hpdnya.ea2c.convert_today" /></label>}<div className="form-actions"><span>命令将在设备下次 10 秒轮询时获取。</span><button className="primary" disabled={!targetId || (type === 'trigger_action' && !actionId.trim())}><Code24Regular />下发命令</button></div></form></section><CommandHistory commands={commands} groups={groups} devices={devices} /></div>
}

function CommandHistory({ commands, groups, devices }: { commands: CommandRecord[]; groups: Group[]; devices: Device[] }) {
  const labels: Record<string, string> = { refresh_status: '刷新状态', restart_app: '重启应用', upload_diagnostics: '上传诊断', show_notification: '显示通知', trigger_action: '触发 Action' }
  return <section className="data-section command-history"><div className="section-heading"><h2>最近命令</h2><span>{commands.length} 项</span></div><div className="command-list">{commands.length === 0 && <div className="empty-command">暂无命令</div>}{commands.map((command) => { const target = command.group_id ? groups.find((item) => item.id === command.group_id)?.name : devices.find((item) => item.id === command.device_id)?.name; const succeeded = command.acknowledgements.filter((item) => item.status === 'succeeded').length; const failed = command.acknowledgements.filter((item) => item.status === 'failed').length; return <article key={command.id} className="command-row"><Code24Regular /><div><strong>{labels[command.type] ?? command.type}</strong><span>{target ?? '未知目标'} · #{command.cursor}</span></div><div className="ack-summary"><span className="ack-success">{succeeded} 成功</span><span className={failed ? 'ack-failed' : ''}>{failed} 失败</span><small>{relativeTime(command.created_at)}</small></div></article> })}</div></section>
}

function LogsView({ organizationId }: { organizationId: string }) {
  const [reports, setReports] = useState<Awaited<ReturnType<typeof api.diagnostics>>>([])
  const [detail, setDetail] = useState<DiagnosticDetail | null>(null)
  const [filter, setFilter] = useState('')
  const load = useCallback(() => api.diagnostics(organizationId).then(setReports).catch(() => undefined), [organizationId])
  useEffect(() => {
    if (!organizationId) {
      setReports([])
      setDetail(null)
      return
    }
    setDetail(null)
    void load()
    const timer = window.setInterval(load, 10_000)
    return () => window.clearInterval(timer)
  }, [load, organizationId])
  async function open(id: string) { setDetail(await api.diagnostic(id)) }
  const logs = detail?.logs.filter((log) => `${log.level} ${log.message}`.toLowerCase().includes(filter.toLowerCase())) ?? []
  return <div className="logs-layout"><section className="data-section report-list"><div className="section-heading"><h2>诊断报告</h2><span>{reports.length} 项</span></div>{reports.length === 0 && <div className="empty-command">暂无报告，可向设备下发“上传诊断”命令。</div>}{reports.map((report) => <button className={detail?.id === report.id ? 'report-row selected' : 'report-row'} key={report.id} onClick={() => void open(report.id)}><DocumentBulletList24Regular /><div><strong>{report.device_name}</strong><span>{report.log_count} 条日志 · {relativeTime(report.created_at)}</span></div></button>)}</section><section className="data-section log-viewer"><div className="section-heading"><h2>{detail ? `${detail.device_name} 的日志` : '日志详情'}</h2>{detail && <input className="search" placeholder="过滤级别或内容" value={filter} onChange={(event) => setFilter(event.target.value)} />}</div>{!detail && <div className="empty-command">选择一份诊断报告查看客户端动态上报日志。</div>}{detail?.last_error && <div className="notice error"><DismissCircle20Filled /><span>{detail.last_error}</span></div>}<div className="log-lines">{logs.map((log, index) => <div className={`log-line level-${log.level.toLowerCase()}`} key={`${log.time}-${index}`}><time>{log.time}</time><strong>{log.level}</strong><pre>{log.message}</pre></div>)}</div></section></div>
}

export default App
