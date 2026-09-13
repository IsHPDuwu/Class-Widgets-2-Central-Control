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
  Search24Regular,
  ShieldLock24Regular,
  Filter24Regular,
  WeatherMoon24Regular,
  SignOut24Regular,
} from '@fluentui/react-icons'
import { Badge, Button, Checkbox, DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow, Dropdown, Field, Input, Option, Select, Tab, TabList, TableCellLayout, Text, Textarea, createTableColumn } from '@fluentui/react-components'
import { api, getAdminKey, getSessionToken, setAdminKey, setSessionToken, type AdminUser, type CommandRecord, type Device, type DiagnosticDetail, type Group, type OAuthProviderPublic, type Organization, type Principal } from './api'
import { ScheduleWorkspace } from './ScheduleWorkspace'
import { TimelineWorkspace } from './TimelineWorkspace'
import { CrossGroupScheduleWorkspace } from './CrossGroupScheduleWorkspace'
import { CourseWorkspace } from './CourseWorkspace'
import { ConfigWorkspace } from './ConfigWorkspace'
import { AutomationWorkspace } from './AutomationWorkspace'
import { ClassSwapWorkspace } from './ClassSwapWorkspace'
import { AccessManagement } from './AccessManagement'
import { ClassGroupWorkspace } from './ClassGroupWorkspace'
import { OAuthProviderManagement } from './OAuthProviderManagement'
import centralControlIcon from './assets/cw2-jikong.png'
type ThemeMode = 'system' | 'light' | 'dark'
import './App.css'

type View = 'overview' | 'devices' | 'groups' | 'class-groups' | 'schedule' | 'timelines' | 'courses' | 'cross-schedule' | 'class-swap' | 'policy' | 'commands' | 'automation' | 'logs' | 'tenants'
type Notice = { tone: 'success' | 'error'; message: string } | null

const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof Desktop24Regular }> = [
  { id: 'overview', label: '总览', icon: AppsListDetail24Regular },
  { id: 'devices', label: '设备', icon: Desktop24Regular },
  { id: 'groups', label: '班级与配对', icon: Organization24Regular },
  { id: 'class-groups', label: '分组管理', icon: PeopleTeam24Regular },
  { id: 'schedule', label: '课表发布', icon: CalendarLtr24Regular },
  { id: 'timelines', label: '时间线', icon: CalendarLtr24Regular },
  { id: 'courses', label: '课表课程', icon: DocumentBulletList24Regular },
  { id: 'cross-schedule', label: '按天排课', icon: CalendarSync24Regular },
  { id: 'class-swap', label: '临时换课', icon: CalendarSync24Regular },
  { id: 'policy', label: '策略', icon: ShieldLock24Regular },
  { id: 'commands', label: '命令', icon: Code24Regular },
  { id: 'automation', label: '自动化', icon: ArrowRepeatAll24Regular },
  { id: 'logs', label: '客户端日志', icon: DocumentBulletList24Regular },
]

const VIEW_TITLES: Record<View, [string, string]> = {
  overview: ['运行总览', '设备连接与配置下发状态'],
  devices: ['设备', '检查终端状态、版本和配置修订'],
  groups: ['班级与配对', '组织终端并生成一次性配对码'],
  'class-groups': ['分组管理', '将多个班级整理为可快捷选择的分组'],
  schedule: ['课表发布', '校验并向选定班级发布课表'],
  timelines: ['时间线', '维护可复用的上课时间结构'],
  courses: ['课表课程', '配置课表可使用的课程信息'],
  'cross-schedule': ['按天排课', '按公共时间线为多个班级逐天安排课程'],
  'class-swap': ['临时换课', '获取客户端单双周课表并下发换课事件'],
  policy: ['策略', '统一锁定终端的受管设置'],
  commands: ['命令', '向班级或单台设备下发受限操作'],
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
  const [classGroups, setClassGroups] = useState<import('./api').ClassGroup[]>([])
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
      const [nextGroups, nextDevices, nextClassGroups] = await Promise.all([
        api.groups(nextOrganizationId), api.devices(nextOrganizationId), api.classGroups(nextOrganizationId),
      ])
      setGroups(nextGroups)
      setDevices(nextDevices)
      setClassGroups(nextClassGroups)
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
      <div className="brand"><div className="brand-mark"><img src={centralControlIcon} alt="集控" /></div><div><Text className="brand-title" weight="semibold">集控</Text><Text size={200}>Class Widgets</Text></div></div>
      <TabList className="nav-list" vertical selectedValue={view} onTabSelect={(_, data) => { setView(data.value as View); setMobileNav(false) }} aria-label="主导航">{navItems.map((item) => { const Icon = item.icon; return <Tab key={item.id} value={item.id} icon={<Icon />}>{item.label}</Tab> })}</TabList>
      <div className="sidebar-footer"><span className={connected ? 'status-dot online' : 'status-dot'} /><span>{connected ? '服务已连接' : '服务未连接'}</span></div>
    </aside>
    <main>
      <header className="topbar">
        <Button className="menu-button" appearance="subtle" icon={<Navigation24Regular />} aria-label="打开导航" onClick={() => setMobileNav(!mobileNav)} />
        <div className="toolbar-select"><Organization24Regular /><Select aria-label="当前组织" value={organizationId} onChange={(_, data) => setOrganizationId(data.value)}>{organizations.length === 0 && <option value="">未选择组织</option>}{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</Select></div>
        <div className="toolbar-select theme-picker"><WeatherMoon24Regular /><Select aria-label="颜色模式" value={themeMode} onChange={(_, data) => onThemeModeChange(data.value as ThemeMode)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></Select></div>
        <Button appearance="subtle" icon={<ArrowClockwise24Regular />} aria-label="刷新" disabled={loading} onClick={() => void refresh()} />
        <Button appearance="subtle" icon={<SignOut24Regular />} aria-label="退出登录" title="退出登录" onClick={() => void logout()} />
      </header>
      <div className="page">
        <section className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div></section>
        {notice && <div className={`notice ${notice.tone}`}>{notice.tone === 'success' ? <CheckmarkCircle20Filled /> : <DismissCircle20Filled />}<span>{notice.message}</span></div>}
          {view === 'overview' && <Overview devices={devices} groups={groups} organizations={organizations} onComplete={complete} />}
        {view === 'devices' && <DevicesView devices={devices} groups={groups} onComplete={complete} />}
        {view === 'groups' && <GroupsView organizationId={organizationId} groups={groups} onComplete={complete} />}
        {view === 'class-groups' && <ClassGroupWorkspace organizationId={organizationId} groups={groups} onComplete={complete} />}
        {view === 'schedule' && <ScheduleWorkspace organizationId={organizationId} groups={groups} classGroups={classGroups} onComplete={complete} />}
        {view === 'timelines' && <TimelineWorkspace organizationId={organizationId} onComplete={complete} />}
        {view === 'courses' && <CourseWorkspace organizationId={organizationId} onComplete={complete} />}
        {view === 'cross-schedule' && <CrossGroupScheduleWorkspace organizationId={organizationId} groups={groups} classGroups={classGroups} onComplete={complete} />}
        {view === 'class-swap' && <ClassSwapWorkspace organizationId={organizationId} groups={groups} devices={devices} onComplete={complete} />}
        {view === 'policy' && <ConfigWorkspace organizationId={organizationId} groups={groups} classGroups={classGroups} onComplete={complete} />}
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
  const usernameValid = /^[A-Za-z0-9_.-]+$/.test(username.trim())
  const passwordTooShort = password.length > 0 && password.length < 12
  const passwordTooLong = password.length > 200
  return (
    <div className="login-page">
      <div className="login-banner">
        <div className="login-banner-copy">
          <img src={centralControlIcon} alt="Class Widgets" />
          <Text weight="semibold">Class Widgets</Text>
          <span>集中管理平台</span>
          <p>统一管理设备、课表、策略与自动化任务。</p>
        </div>
      </div>
      <div className="login-card">
        <div className="login-heading">
          <h1>{registering ? '创建租户账号' : '登录集控'}</h1>
          <p>{mode === 'admin' ? '平台管理员使用管理密钥进入后台。' : registering ? '注册后将创建一个新的租户及管理员账号。' : '租户成员使用账号、密码或组织身份源登录。'}</p>
        </div>
        {!registering && (
          <div className="segmented login-segment">
            <Button type="button" className={mode === 'tenant' ? 'selected' : ''} onClick={() => setMode('tenant')}>租户登录</Button>
            <Button type="button" className={mode === 'admin' ? 'selected' : ''} onClick={() => setMode('admin')}>管理员登录</Button>
          </div>
        )}
        {registering ? (
          <form onSubmit={register}>
            <Field label="租户名称" required hint="1–120 个字符，例如：示范中学">
              <Input value={organizationName} maxLength={120} onChange={(_, data) => setOrganizationName(data.value)} placeholder="例如：示范中学" />
            </Field>
            <Field
              label="管理员用户名"
              required
              hint="1–80 个字符，仅支持字母、数字、下划线、点与连字符。"
              validationState={username.length > 0 && !usernameValid ? 'error' : undefined}
              validationMessage={username.length > 0 && !usernameValid ? '只能包含字母、数字、下划线、点或连字符。' : undefined}
            >
              <Input value={username} maxLength={80} onChange={(_, data) => onUsernameChange(data.value)} placeholder="例如：admin" />
            </Field>
            <Field
              label="密码"
              required
              hint="12–200 个字符，请使用足够复杂的密码。"
              validationState={passwordTooShort || passwordTooLong ? 'error' : password.length >= 12 ? 'success' : undefined}
              validationMessage={passwordTooShort ? `密码至少需要 12 个字符，当前 ${password.length} 个。` : passwordTooLong ? '密码不能超过 200 个字符。' : password.length >= 12 ? '密码长度符合要求。' : undefined}
            >
              <Input type="password" value={password} maxLength={200} onChange={(_, data) => onPasswordChange(data.value)} placeholder="至少 12 个字符" />
            </Field>
            <Button appearance="primary" type="submit" disabled={!organizationName.trim() || !username.trim() || !usernameValid || password.length < 12 || passwordTooLong || loading}>注册</Button>
            <Button appearance="subtle" type="button" onClick={() => setRegistering(false)}>返回登录</Button>
          </form>
        ) : mode === 'admin' ? (
          <form onSubmit={onAdminLogin}>
            <Field label="管理员密钥" required hint="平台管理员密钥可在部署配置中查看或重置。">
              <Input type="password" value={adminKey} onChange={(_, data) => onAdminKeyChange(data.value)} placeholder="输入平台管理员密钥" />
            </Field>
            <Button appearance="primary" type="submit" disabled={!adminKey.trim() || loading}>管理员登录</Button>
          </form>
        ) : (
          <>
            <form onSubmit={onTenantLogin}>
              <Field label="用户名" required hint="使用注册时创建的租户账号。">
                <Input value={username} maxLength={80} onChange={(_, data) => onUsernameChange(data.value)} placeholder="用户名" />
              </Field>
              <Field
                label="密码"
                required
                hint="至少 12 个字符。"
                validationState={passwordTooShort ? 'error' : undefined}
                validationMessage={passwordTooShort ? `密码至少需要 12 个字符，当前 ${password.length} 个。` : undefined}
              >
                <Input type="password" value={password} maxLength={200} onChange={(_, data) => onPasswordChange(data.value)} placeholder="至少 12 个字符" />
              </Field>
              <Button appearance="primary" type="submit" disabled={!username.trim() || password.length < 12 || passwordTooLong || loading}>登录</Button>
              {registrationAllowed && <Button appearance="subtle" type="button" onClick={() => setRegistering(true)}>注册新租户</Button>}
            </form>
            {oauthProviders.length > 0 && (
              <div className="oauth-login-options">
                <span>或使用组织身份源</span>
                {oauthProviders.map((provider) => (
                  <Button key={provider.key} appearance="outline" icon={<ShieldLock24Regular />} onClick={() => { window.location.href = `/api/v1/auth/oauth/${encodeURIComponent(provider.key)}/start?return_path=${encodeURIComponent('/')}` }}>使用 {provider.name} 登录</Button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
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
  const usernameValid = /^[A-Za-z0-9_.-]+$/.test(username.trim())
  const passwordTooShort = password.length > 0 && password.length < 12
  const passwordTooLong = password.length > 200
  return (
    <div className="login-page">
      <div className="login-banner">
        <div className="login-banner-copy">
          <img src={centralControlIcon} alt="Class Widgets" />
          <Text weight="semibold">Class Widgets</Text>
          <span>完成账号设置</span>
          <p>这是该身份源首次登录，请选择账号处理方式。</p>
        </div>
      </div>
      <div className="login-card">
        <div className="login-heading">
          <h1>完成 OAuth 登录</h1>
          <p>未找到对应的集控账号。</p>
        </div>
        <div className="segmented login-segment">
          <Button type="button" className={mode === 'register' ? 'selected' : ''} onClick={() => setMode('register')}>注册新账号</Button>
          <Button type="button" className={mode === 'bind' ? 'selected' : ''} onClick={() => setMode('bind')}>绑定已有账号</Button>
        </div>
        {error && <div className="notice error">{error}</div>}
        <form onSubmit={submit}>
          <Field
            label="集控用户名"
            required
            hint={mode === 'bind' ? '输入已有的集控用户名，用于与当前身份源绑定。' : '1–80 个字符，仅支持字母、数字、下划线、点与连字符。'}
            validationState={username.length > 0 && !usernameValid ? 'error' : undefined}
            validationMessage={username.length > 0 && !usernameValid ? '只能包含字母、数字、下划线、点或连字符。' : undefined}
          >
            <Input value={username} maxLength={80} onChange={(_, data) => setUsername(data.value)} placeholder={mode === 'bind' ? '输入已有用户名' : '设置用户名'} />
          </Field>
          <Field
            label="密码"
            required
            hint={mode === 'bind' ? '输入该集控账号的现有密码，用于验证身份。' : '12–200 个字符，请使用足够复杂的密码。'}
            validationState={passwordTooShort || passwordTooLong ? 'error' : undefined}
            validationMessage={passwordTooShort ? `密码至少需要 12 个字符，当前 ${password.length} 个。` : passwordTooLong ? '密码不能超过 200 个字符。' : undefined}
          >
            <Input type="password" value={password} maxLength={200} onChange={(_, data) => setPassword(data.value)} placeholder={mode === 'bind' ? '验证已有密码' : '至少 12 个字符'} />
          </Field>
          {mode === 'register' && (
            <Field label="新建组织名称" required hint="1–120 个字符，例如：示范中学">
              <Input value={organizationName} maxLength={120} onChange={(_, data) => setOrganizationName(data.value)} placeholder="例如：示范中学" />
            </Field>
          )}
          <Button appearance="primary" type="submit" disabled={loading || !username.trim() || !usernameValid || password.length < 12 || passwordTooLong || (mode === 'register' && !organizationName.trim())}>
            {mode === 'bind' ? '验证并绑定' : '创建账号并继续'}
          </Button>
        </form>
      </div>
    </div>
  )
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
  function organizationChecks(ids: string[], change: (value: string[]) => void) { return <div className="checks">{organizations.map((organization) => <Checkbox key={organization.id} label={organization.name} checked={ids.includes(organization.id)} onChange={(_, data) => change(data.checked ? [...ids, organization.id] : ids.filter((id) => id !== organization.id))} />)}</div> }
  return <div className="tenant-layout"><section className="form-section"><h2>总设置</h2><p>控制是否允许未登录用户在登录页注册新租户。</p><Checkbox label="允许公开注册" checked={allowRegistration} onChange={(_, data) => { const enabled = Boolean(data.checked); setAllowRegistration(enabled); void api.updateRegistrationSetting(enabled).then(() => onComplete(enabled ? '已允许公开注册' : '已关闭公开注册')).catch((error) => onComplete(error instanceof Error ? error.message : '保存设置失败', 'error')) }} /></section><section className="form-section"><h2>新建租户</h2><p>每个租户拥有独立的班级、设备、课表、策略、命令和日志。</p><form onSubmit={createTenant}><Field label="租户名称" required hint="1-120 个字符，例如：示范中学"><Input value={tenantName} maxLength={120} onChange={(_, data) => setTenantName(data.value)} placeholder="例如：示范中学" /></Field><Button appearance="primary" type="submit" disabled={!tenantName.trim()}><Add24Regular />创建租户</Button></form></section><section className="form-section"><h2>新建成员</h2><p>创建后可在下方权限树中精细授权。</p><form onSubmit={createMember}><Field label="用户名" required hint="1-80 个字符，仅支持字母、数字、下划线、点与连字符。"><Input value={username} maxLength={80} onChange={(_, data) => setUsername(data.value)} /></Field><Field label="密码" required hint="12-200 个字符。"><Input type="password" maxLength={200} value={password} onChange={(_, data) => setPassword(data.value)} placeholder="至少 12 个字符" /></Field><Field label="初始模板" required hint="决定该成员创建时获得的默认权限范围。"><Dropdown selectedOptions={[role]} onOptionSelect={(_, data) => setRole(data.optionValue ?? "viewer")}><Option value="viewer">只读</Option><Option value="operator">操作员</Option><Option value="admin">租户管理员</Option></Dropdown></Field><Field label="初始组织范围" hint="留空表示稍后在权限树中授权。">{organizationChecks(selected, setSelected)}</Field><Button appearance="primary" type="submit" disabled={!username.trim() || password.length < 12}><PeopleTeam24Regular />创建成员</Button></form></section><section className="data-section tenant-members"><div className="section-heading"><h2>成员与租户授权</h2><span>{users.length} 名成员</span></div>{users.length === 0 && <div className="empty-command">暂无租户成员</div>}{users.map((user) => <TenantMemberRow key={user.id} user={user} organizations={organizations} onAssign={assign} />)}</section><section className="span-all"><AccessManagement organizations={organizations} groups={groups} devices={devices} users={users} onUsersChanged={load} onComplete={onComplete} /></section><section className="span-all"><OAuthProviderManagement onComplete={onComplete} /></section></div>
}

function TenantMemberRow({ user, organizations, onAssign }: { user: AdminUser; organizations: Organization[]; onAssign: (user: AdminUser, ids: string[]) => void }) {
  const [ids, setIds] = useState(user.organization_ids)
  useEffect(() => setIds(user.organization_ids), [user.organization_ids])
  return <article className="tenant-member"><div><Text weight="semibold">{user.username}</Text><Text size={200}>{user.role} · {user.disabled ? '已停用' : '启用'}</Text></div><div className="checks">{organizations.map((organization) => <Checkbox key={organization.id} label={organization.name} checked={ids.includes(organization.id)} onChange={(_, data) => setIds(data.checked ? [...ids, organization.id] : ids.filter((id) => id !== organization.id))} />)}</div><Button appearance="primary" onClick={() => onAssign(user, ids)}>保存授权</Button></article>
}

function Overview({ devices, groups, organizations, onComplete }: { devices: Device[]; groups: Group[]; organizations: Organization[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const online = devices.filter(isOnline).length
  const drifted = devices.filter((device) => { const group = groups.find((item) => item.id === device.group_id); return group && (device.schedule_revision < group.schedule_revision || device.policy_revision < group.policy_revision) }).length
  return <>{organizations.length === 0 && <OrganizationSetup onComplete={onComplete} />}<div className="metrics"><Metric label="设备总数" value={devices.length} detail={`${groups.length} 个班级`} /><Metric label="在线" value={online} detail={devices.length ? `${Math.round(online / devices.length * 100)}% 可用` : '等待设备配对'} tone="green" /><Metric label="配置漂移" value={drifted} detail={drifted ? '等待终端同步' : '修订状态一致'} tone={drifted ? 'amber' : undefined} /><Metric label="离线" value={devices.length - online} detail="超过 45 秒未上报" /></div><DeviceTable devices={devices.slice(0, 8)} groups={groups} title="最近设备" /></>
}

function OrganizationSetup({ onComplete }: { onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const [name, setName] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); try { await api.createOrganization(name); onComplete('组织已创建') } catch (error) { onComplete(error instanceof Error ? error.message : '创建失败', 'error') } }
  return <form className="organization-setup" onSubmit={submit}><Organization24Regular /><div className="organization-setup-copy"><Text weight="semibold">创建首个组织</Text><Text size={200}>组织是班级、课表和策略的管理边界。</Text></div><div className="organization-setup-actions"><Input value={name} onChange={(_, data) => setName(data.value)} placeholder="例如：示范中学" /><Button appearance="primary" disabled={!name.trim()}><Add24Regular />创建</Button></div></form>
}

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: string }) {
  return <article className={`metric ${tone ?? ''}`}><Text size={200}>{label}</Text><Text className="metric-value" weight="semibold">{value}</Text><Text size={200}>{detail}</Text></article>
}

function DevicesView({ devices, groups, onComplete }: { devices: Device[]; groups: Group[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const [query, setQuery] = useState('')
  const filtered = devices.filter((device) => device.name.toLowerCase().includes(query.toLowerCase()))
  async function move(deviceId: string, groupId: string) { try { await api.moveDevice(deviceId, groupId); onComplete('设备班级已更新') } catch (error) { onComplete(error instanceof Error ? error.message : '换组失败', 'error') } }
  async function remove(deviceId: string, deviceName: string) {
    if (!window.confirm(`确定删除设备“${deviceName}”？删除后该设备需要重新配对。`)) return
    try { await api.deleteDevice(deviceId); onComplete('设备已删除') } catch (error) { onComplete(error instanceof Error ? error.message : '删除设备失败', 'error') }
  }
  return <><div className="toolbar"><Input className="search" contentBefore={<Search24Regular />} placeholder="搜索设备名称" value={query} onChange={(_, data) => setQuery(data.value)} /><span>{filtered.length} 台设备</span></div><DeviceTable devices={filtered} groups={groups} title="全部设备" onMove={move} onDelete={remove} /></>
}

function DeviceTable({ devices, groups, title, onMove, onDelete }: { devices: Device[]; groups: Group[]; title: string; onMove?: (deviceId: string, groupId: string) => void; onDelete?: (deviceId: string, deviceName: string) => void }) {
  const DeviceBody = DataGridBody<Device>
  const DeviceRow = DataGridRow<Device>
  const columns = [
    createTableColumn<Device>({
      columnId: 'name',
      renderHeaderCell: () => '设备',
      renderCell: (device) => <TableCellLayout media={<Desktop24Regular />} description={device.id.slice(0, 8)}>{device.name}</TableCellLayout>,
    }),
    createTableColumn<Device>({
      columnId: 'state',
      renderHeaderCell: () => '状态',
      renderCell: (device) => <Badge appearance="tint" color={device.revoked ? 'danger' : isOnline(device) ? 'success' : 'informative'}>{device.revoked ? '已撤销' : isOnline(device) ? '在线' : '离线'}</Badge>,
    }),
    createTableColumn<Device>({
      columnId: 'group',
      renderHeaderCell: () => '班级',
      renderCell: (device) => onMove
        ? <Dropdown aria-label={`调整 ${device.name} 的班级`} selectedOptions={[device.group_id]} onOptionSelect={(_, data) => data.optionValue && onMove(device.id, data.optionValue)} style={{ minWidth: 140 }}>{groups.map((group) => <Option key={group.id} value={group.id}>{group.name}</Option>)}</Dropdown>
        : groups.find((group) => group.id === device.group_id)?.name ?? '未知',
    }),
    createTableColumn<Device>({
      columnId: 'lesson',
      renderHeaderCell: () => '当前课程',
      renderCell: (device) => device.current_title || device.current_status || '-',
    }),
    createTableColumn<Device>({
      columnId: 'version',
      renderHeaderCell: () => '应用 / 插件',
      renderCell: (device) => `${device.app_version || '-'} / ${device.plugin_version || '-'}`,
    }),
    createTableColumn<Device>({
      columnId: 'revision',
      renderHeaderCell: () => '课表 / 策略',
      renderCell: (device) => `r${device.schedule_revision} / r${device.policy_revision}`,
    }),
    createTableColumn<Device>({
      columnId: 'lastSeen',
      renderHeaderCell: () => '最后连接',
      renderCell: (device) => relativeTime(device.last_seen),
    }),
    ...(onDelete ? [createTableColumn<Device>({
      columnId: 'actions',
      renderHeaderCell: () => '操作',
      renderCell: (device) => <Button appearance="subtle" icon={<Delete24Regular />} aria-label={`删除设备 ${device.name}`} title="删除设备" onClick={() => onDelete(device.id, device.name)} />,
    })] : []),
  ]
  return <section className="data-section"><div className="section-heading"><h2>{title}</h2><span>{devices.length} 项</span></div><div className="table-wrap"><DataGrid items={devices} columns={columns} getRowId={(device) => device.id} focusMode="composite"><DataGridHeader><DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader><DeviceBody>{({ item }) => <DeviceRow key={item.id}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DeviceRow>}</DeviceBody></DataGrid></div>{devices.length === 0 && <div className="empty">暂无设备</div>}</section>
}

function GroupsView({ organizationId, groups, onComplete }: { organizationId: string; groups: Group[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [pairing, setPairing] = useState<{ code: string; expires_at: string } | null>(null)
  async function createGroup(event: FormEvent) { event.preventDefault(); try { await api.createGroup(organizationId, name); setName(''); onComplete('班级已创建') } catch (error) { onComplete(error instanceof Error ? error.message : '创建失败', 'error') } }
  async function createCode() { try { const result = await api.createPairingCode(groupId, 15); setPairing(result); onComplete('一次性配对码已生成') } catch (error) { onComplete(error instanceof Error ? error.message : '生成失败', 'error') } }
  return <div className="two-column"><section className="form-section"><h2>新建班级</h2><p>设备配对后将继承该班级的课表和策略。</p><form onSubmit={createGroup}><Field label="班级名称" required hint="例如：高一教学楼。同一组织内建议保持唯一。"><Input value={name} onChange={(_, data) => setName(data.value)} placeholder="例如：高一教学楼" /></Field><Button appearance="primary" type="submit" disabled={!organizationId || !name.trim()}><Add24Regular />创建班级</Button></form></section><section className="form-section"><h2>设备配对</h2><p>配对码有效 15 分钟，使用一次后立即失效。</p><Field label="目标班级" required hint="配对成功后设备将继承该班级的课表与策略。"><Dropdown selectedOptions={[groupId]} onOptionSelect={(_, data) => setGroupId(data.optionValue ?? "")} placeholder="选择班级">{groups.map((group) => <Option key={group.id} value={group.id}>{group.name}</Option>)}</Dropdown></Field><Button appearance="primary" disabled={!groupId} onClick={() => void createCode()}><Key24Regular />生成配对码</Button>{pairing && <div className="pairing-code"><Text className="pairing-code-value" weight="semibold">{pairing.code}</Text><Text size={200}>有效至 {new Date(pairing.expires_at).toLocaleTimeString('zh-CN')}</Text></div>}</section><section className="data-section span-all"><div className="section-heading"><h2>班级</h2><span>{groups.length} 项</span></div><div className="group-grid">{groups.map((group) => <article className="group-row" key={group.id}><Organization24Regular /><div><Text weight="semibold">{group.name}</Text><span>课表 r{group.schedule_revision} · 策略 r{group.policy_revision}</span></div></article>)}</div></section></div>
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
  return <div className="command-layout"><section className="form-section command-form"><form onSubmit={submit}><div className="segmented"><Button type="button" className={targetKind === 'group' ? 'selected' : ''} onClick={() => { setTargetKind('group'); setTargetId('') }}>班级</Button><Button type="button" className={targetKind === 'device' ? 'selected' : ''} onClick={() => { setTargetKind('device'); setTargetId('') }}>单台设备</Button></div><Field label="目标" required hint={targetKind === 'group' ? '命令将下发给该班级下的全部设备。' : '命令仅下发给选中的单台设备。'}><Dropdown selectedOptions={[targetId]} onOptionSelect={(_, data) => setTargetId(data.optionValue ?? "")} placeholder="选择目标">{targets.map((target) => <Option key={target.id} value={target.id}>{target.name}</Option>)}</Dropdown></Field><Field label="操作" required hint="选择要下发给客户端的命令类型。"><Dropdown selectedOptions={[type]} onOptionSelect={(_, data) => setType(data.optionValue ?? "refresh_status")}><Option value="refresh_status">立即刷新状态</Option><Option value="restart_app">重启 Class Widgets</Option><Option value="upload_diagnostics">上传诊断信息</Option><Option value="show_notification">显示通知</Option><Option value="trigger_action">触发 Action</Option></Dropdown></Field>{type === 'show_notification' && <><Field label="通知标题" required hint="显示在客户端通知卡片顶部的标题。"><Input value={title} onChange={(_, data) => setTitle(data.value)} /></Field><Field label="通知内容" hint="支持多行文本。"><Textarea value={message} onChange={(_, data) => setMessage(data.value)} /></Field></>}{type === 'trigger_action' && <Field label="Action ID" required hint="由客户端插件注册的动作标识，例如 com.hpdnya.ea2c.convert_today。"><Input value={actionId} onChange={(_, data) => setActionId(data.value)} placeholder="例如：com.hpdnya.ea2c.convert_today" /></Field>}<div className="form-actions"><span>命令将在设备下次 10 秒轮询时获取。</span><Button appearance="primary" disabled={!targetId || (type === 'trigger_action' && !actionId.trim())}><Code24Regular />下发命令</Button></div></form></section><CommandHistory commands={commands} groups={groups} devices={devices} /></div>
}

function CommandHistory({ commands, groups, devices }: { commands: CommandRecord[]; groups: Group[]; devices: Device[] }) {
  const labels: Record<string, string> = { refresh_status: '刷新状态', restart_app: '重启应用', upload_diagnostics: '上传诊断', show_notification: '显示通知', trigger_action: '触发 Action' }
  return <section className="data-section command-history"><div className="section-heading"><h2>最近命令</h2><span>{commands.length} 项</span></div><div className="command-list">{commands.length === 0 && <div className="empty-command">暂无命令</div>}{commands.map((command) => { const target = command.group_id ? groups.find((item) => item.id === command.group_id)?.name : devices.find((item) => item.id === command.device_id)?.name; const succeeded = command.acknowledgements.filter((item) => item.status === 'succeeded').length; const failed = command.acknowledgements.filter((item) => item.status === 'failed').length; return <article key={command.id} className="command-row"><Code24Regular /><div><Text weight="semibold">{labels[command.type] ?? command.type}</Text><Text size={200}>{target ?? '未知目标'} · #{command.cursor}</Text></div><div className="ack-summary"><span className="ack-success">{succeeded} 成功</span><span className={failed ? 'ack-failed' : ''}>{failed} 失败</span><Text size={200}>{relativeTime(command.created_at)}</Text></div></article> })}</div></section>
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
  return <div className="logs-layout"><section className="data-section report-list"><div className="section-heading"><h2>诊断报告</h2><span>{reports.length} 项</span></div>{reports.length === 0 && <div className="empty-command">暂无报告，可向设备下发“上传诊断”命令。</div>}{reports.map((report) => <Button appearance="transparent" className={detail?.id === report.id ? 'report-row selected' : 'report-row'} key={report.id} onClick={() => void open(report.id)}><DocumentBulletList24Regular /><div><Text weight="semibold">{report.device_name}</Text><Text size={200}>{report.log_count} 条日志 · {relativeTime(report.created_at)}</Text></div></Button>)}</section><section className="data-section log-viewer"><div className="section-heading"><h2>{detail ? `${detail.device_name} 的日志` : '日志详情'}</h2>{detail && <Input className="search" contentBefore={<Filter24Regular />} placeholder="过滤级别或内容" value={filter} onChange={(_, data) => setFilter(data.value)} />}</div>{!detail && <div className="empty-command">选择一份诊断报告查看客户端动态上报日志。</div>}{detail?.last_error && <div className="notice error"><DismissCircle20Filled /><span>{detail.last_error}</span></div>}<div className="log-lines">{logs.map((log, index) => <div className={`log-line level-${log.level.toLowerCase()}`} key={`${log.time}-${index}`}><time>{log.time}</time><Text weight="semibold">{log.level}</Text><pre>{log.message}</pre></div>)}</div></section></div>
}

export default App
