export type Organization = { id: string; name: string }
export type Principal = { id: string; username: string; role: string; platform_admin: boolean; organization_ids: string[]; authorization_status: 'pending' | 'active'; permissions: string[] }
export type AdminUser = { id: string; username: string; role: string; disabled: boolean; organization_ids: string[]; display_name: string; email: string; authorization_status: 'pending' | 'active'; has_password: boolean }
export type RegistrationSetting = { allow_registration: boolean }
export type OAuthProviderPublic = { key: string; name: string }
export type OAuthProvider = OAuthProviderPublic & { id: string; issuer_url: string; client_id: string; has_client_secret: boolean; scopes: string; enabled: boolean; allow_signup: boolean; created_at: string; updated_at: string }
export type PermissionGrant = { permission_key: string; organization_id: string | null; resource_type: 'platform' | 'organization' | 'group' | 'device'; resource_id: string | null }
export type PermissionCatalog = { platform: Array<{ key: string; label: string }>; organization: Array<{ key: string; label: string; resource_types: string[]; actions: Array<{ key: string; action: string; label: string }> }> }

export type Group = {
  id: string
  organization_id: string
  name: string
  schedule_revision: number
  policy_revision: number
}

export type Device = {
  id: string
  group_id: string
  name: string
  last_seen: string | null
  app_version: string
  plugin_version: string
  current_status: string
  current_title: string
  schedule_revision: number
  policy_revision: number
  revoked: boolean
}

export type CommandRecord = {
  id: string
  cursor: number
  type: string
  group_id: string | null
  device_id: string | null
  created_at: string
  expires_at: string
  acknowledgements: Array<{
    device_id: string
    device_name: string
    status: string
    error_code: string
    message: string
    updated_at: string
  }>
}

export type ScheduleRecord = {
  id: string
  name: string
  revision: number
  schedule: Record<string, unknown>
  group_ids: string[]
  created_at: string
}

export type ClassSwapPreparation = {
  request_id: string
  device_id: string
  device_name: string
  ready: boolean
  schedule_hash: string
  uploaded_at: string | null
}

export type ClassSwapSnapshot = {
  device_id: string
  request_id: string
  schedule_hash: string
  schedule: Record<string, unknown>
  uploaded_at: string
}

export type ClassSwapSession = {
  id: string
  device_id: string
  effective_date: string
  status: string
  operations: Array<Record<string, unknown>>
  created_at: string
  restored_at: string | null
}

export type PolicyRecord = {
  id: string
  name: string
  revision: number
  policy: { overrides: Record<string, unknown>; locked_keys: string[]; schedule_readonly: boolean }
  group_ids: string[]
  created_at: string
}

export type AutomationRule = {
  id: string
  organization_id: string
  name: string
  enabled: boolean
  trigger_type: 'daily' | 'weekly' | 'date' | 'online'
  scheduled_time: string | null
  weekdays: number[]
  run_date: string | null
  condition_operator: 'and' | 'or'
  conditions: Array<{ type: 'online' | 'status'; value?: string }>
  delay_seconds: number
  group_id: string | null
  device_id: string | null
  action: { type: 'command' | 'config' | 'schedule'; payload: Record<string, unknown> }
  created_at: string
  updated_at: string
}

export type DiagnosticSummary = {
  id: string
  device_id: string
  device_name: string
  app_version: string
  plugin_version: string
  created_at: string
  log_count: number
}

export type DiagnosticDetail = DiagnosticSummary & {
  last_error: string
  logs: Array<{ time: string; level: string; message: string }>
}

type JsonBody = Record<string, unknown>

const API_ROOT = '/api/v1/admin'
const ADMIN_KEY_STORAGE = 'cw-central-control-admin-key'
const SESSION_TOKEN_STORAGE = 'cw-central-control-session-token'

export function getAdminKey() {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? ''
}

export function setAdminKey(value: string) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, value)
}

export function getSessionToken() {
  return sessionStorage.getItem(SESSION_TOKEN_STORAGE) ?? ''
}

export function setSessionToken(value: string) {
  if (value) sessionStorage.setItem(SESSION_TOKEN_STORAGE, value)
  else sessionStorage.removeItem(SESSION_TOKEN_STORAGE)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(getSessionToken() ? { Authorization: `Bearer ${getSessionToken()}` } : { 'X-Admin-Key': getAdminKey() }),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? `请求失败 (${response.status})`)
  }
  return response.status === 204 ? (undefined as T) : response.json()
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/auth${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? `请求失败 (${response.status})`)
  }
  return response.json()
}

async function protectedAuthRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/auth${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(getSessionToken() ? { Authorization: `Bearer ${getSessionToken()}` } : { 'X-Admin-Key': getAdminKey() }),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? `请求失败 (${response.status})`)
  }
  return response.json()
}

function post<T>(path: string, body: JsonBody) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

function put<T>(path: string, body: JsonBody) {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

function patch<T>(path: string, body: JsonBody) {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

export const api = {
  login: (username: string, password: string) => authRequest<{ token: string; expires_at: string; role: string }>('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  oauthProvidersPublic: () => authRequest<OAuthProviderPublic[]>('/oauth/providers'),
  exchangeOAuthCode: (code: string) => authRequest<{ token: string }>('/oauth/exchange', { method: 'POST', body: JSON.stringify({ code }) }),
  logout: () => protectedAuthRequest<void>('/logout', { method: 'POST' }),
  registrationStatus: () => authRequest<RegistrationSetting>('/registration-status'),
  register: (body: JsonBody) => authRequest<{ username: string; organization_id: string }>('/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => protectedAuthRequest<Principal>('/me'),
  users: () => protectedAuthRequest<AdminUser[]>('/users'),
  permissionCatalog: () => protectedAuthRequest<PermissionCatalog>('/permissions/catalog'),
  userGrants: (id: string) => protectedAuthRequest<{ user_id: string; authorization_status: 'pending' | 'active'; grants: PermissionGrant[] }>(`/users/${id}/grants`),
  setUserGrants: (id: string, grants: PermissionGrant[], authorizationStatus: 'pending' | 'active') => protectedAuthRequest<{ user_id: string; authorization_status: 'pending' | 'active'; grants: PermissionGrant[] }>(`/users/${id}/grants`, { method: 'PUT', body: JSON.stringify({ grants, authorization_status: authorizationStatus }) }),
  oauthProviders: () => protectedAuthRequest<OAuthProvider[]>('/oauth/providers/manage'),
  createOAuthProvider: (body: JsonBody) => protectedAuthRequest<OAuthProvider>('/oauth/providers/manage', { method: 'POST', body: JSON.stringify(body) }),
  updateOAuthProvider: (id: string, body: JsonBody) => protectedAuthRequest<OAuthProvider>(`/oauth/providers/manage/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  testOAuthProvider: (id: string) => protectedAuthRequest<{ ok: boolean }>(`/oauth/providers/manage/${id}/test`, { method: 'POST' }),
  registrationSetting: () => request<RegistrationSetting>('/settings/registration'),
  updateRegistrationSetting: (allowRegistration: boolean) => request<RegistrationSetting>('/settings/registration', { method: 'PUT', body: JSON.stringify({ allow_registration: allowRegistration }) }),
  createUser: (body: JsonBody) => protectedAuthRequest<AdminUser>('/users', { method: 'POST', body: JSON.stringify(body) }),
  assignUserOrganizations: (id: string, organizationIds: string[]) => protectedAuthRequest<{ id: string; organization_ids: string[] }>(`/users/${id}/organizations`, { method: 'PUT', body: JSON.stringify({ organization_ids: organizationIds }) }),
  organizations: () => request<Organization[]>('/organizations'),
  groups: (organizationId: string) => request<Group[]>(`/groups?organization_id=${encodeURIComponent(organizationId)}`),
  devices: (organizationId: string) => request<Device[]>(`/devices?organization_id=${encodeURIComponent(organizationId)}`),
  commands: (organizationId: string) => request<CommandRecord[]>(`/commands?organization_id=${encodeURIComponent(organizationId)}`),
  schedules: (organizationId: string) => request<ScheduleRecord[]>(`/schedules?organization_id=${encodeURIComponent(organizationId)}`),
  policies: (organizationId: string) => request<PolicyRecord[]>(`/policies?organization_id=${encodeURIComponent(organizationId)}`),
  diagnostics: (organizationId: string) => request<DiagnosticSummary[]>(`/diagnostics?organization_id=${encodeURIComponent(organizationId)}`),
  diagnostic: (id: string) => request<DiagnosticDetail>(`/diagnostics/${id}`),
  createOrganization: (name: string) => post<Organization>('/organizations', { name }),
  createGroup: (organizationId: string, name: string) =>
    post<Group>('/groups', { organization_id: organizationId, name }),
  createPairingCode: (groupId: string, expiresInMinutes: number) =>
    post<{ code: string; expires_at: string }>(`/groups/${groupId}/pairing-codes`, {
      expires_in_minutes: expiresInMinutes,
    }),
  publishSchedule: (body: JsonBody) => post<{ id: string; revision: number }>('/schedules', body),
  publishPolicy: (body: JsonBody) => post<{ id: string; revision: number }>('/policies', body),
  updateSchedule: (id: string, body: JsonBody) => put<{ id: string; revision: number; group_ids: string[] }>(`/schedules/${id}`, body),
  updatePolicy: (id: string, body: JsonBody) => put<{ id: string; revision: number; group_ids: string[] }>(`/policies/${id}`, body),
  cloneSchedule: (id: string, name: string) => post<{ id: string; revision: number }>(`/schedules/${id}/clone`, { name }),
  clonePolicy: (id: string, name: string) => post<{ id: string; revision: number }>(`/policies/${id}/clone`, { name }),
  assignSchedule: (id: string, groupIds: string[]) => put(`/schedules/${id}/groups`, { group_ids: groupIds }),
  assignPolicy: (id: string, groupIds: string[]) => put(`/policies/${id}/groups`, { group_ids: groupIds }),
  prepareClassSwap: (deviceId: string) => post<{ request_id: string; device_id: string }>('/class-swaps/prepare', { device_id: deviceId }),
  classSwapPreparation: (requestId: string, deviceId: string) => request<ClassSwapPreparation>(`/class-swaps/preparations/${encodeURIComponent(requestId)}?device_id=${encodeURIComponent(deviceId)}`),
  classSwapSnapshot: (deviceId: string, requestId: string) => request<ClassSwapSnapshot>(`/class-swaps/snapshots/${encodeURIComponent(deviceId)}?request_id=${encodeURIComponent(requestId)}`),
  classSwaps: (organizationId: string) => request<ClassSwapSession[]>(`/class-swaps?organization_id=${encodeURIComponent(organizationId)}`),
  createClassSwap: (body: JsonBody) => post<{ id: string; command_id: string }>('/class-swaps', body),
  restoreClassSwap: (id: string) => post<{ id: string; status: string; command_id: string | null }>(`/class-swaps/${id}/restore`, {}),
  moveDevice: (id: string, groupId: string) => patch(`/devices/${id}/group`, { group_id: groupId }),
  deleteDevice: (id: string) => request<void>(`/devices/${id}`, { method: 'DELETE' }),
  automations: (organizationId: string) => request<AutomationRule[]>(`/automations?organization_id=${encodeURIComponent(organizationId)}`),
  createAutomation: (body: JsonBody) => post<AutomationRule>('/automations', body),
  updateAutomation: (id: string, body: JsonBody) => request<AutomationRule>(`/automations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteAutomation: (id: string) => request<void>(`/automations/${id}`, { method: 'DELETE' }),
  setAutomationEnabled: (id: string, enabled: boolean) => request<AutomationRule>(`/automations/${id}/enabled?enabled=${enabled}`, { method: 'PATCH' }),
  automationRuns: (id: string) => request<Array<{ id: string; device_id: string; status: string; reason: string; command_id: string | null; finished_at: string | null }>>(`/automations/${id}/runs`),
  createCommand: (body: JsonBody) => post<{ id: string; cursor: number }>('/commands', body),
}