import { useEffect, useState } from 'react'
import { Add24Regular, Delete24Regular, Save24Regular } from '@fluentui/react-icons'
import { Button, Card, CardHeader, Checkbox, Field, Input, Text, mergeClasses } from '@fluentui/react-components'
import { api, type ClassGroup, type Group } from './api'
import { useWorkspaceStyles } from './styles/workspaceStyles'

type Props = { organizationId: string; groups: Group[]; onComplete: (message: string, tone?: 'success' | 'error') => void }

export function ClassGroupWorkspace({ organizationId, groups, onComplete }: Props) {
  const styles = useWorkspaceStyles()
  const [items, setItems] = useState<ClassGroup[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('新分组')
  const [memberIds, setMemberIds] = useState<string[]>([])

  async function load() {
    if (!organizationId) return
    try { setItems(await api.classGroups(organizationId)) } catch (error) { onComplete(error instanceof Error ? error.message : '加载分组失败', 'error') }
  }
  useEffect(() => { void load() }, [organizationId])

  function reset() { setSelectedId(''); setName('新分组'); setMemberIds([]) }
  function open(item: ClassGroup) { setSelectedId(item.id); setName(item.name); setMemberIds(item.group_ids) }
  function toggle(id: string, checked: boolean) { setMemberIds((value) => checked ? [...new Set([...value, id])] : value.filter((item) => item !== id)) }
  async function save() {
    if (!name.trim()) return
    try {
      const result = selectedId ? await api.updateClassGroup(selectedId, name.trim(), memberIds) : await api.createClassGroup(organizationId, name.trim(), memberIds)
      open(result); await load(); onComplete('分组已保存')
    } catch (error) { onComplete(error instanceof Error ? error.message : '保存分组失败', 'error') }
  }
  async function remove() {
    if (!selectedId || !window.confirm(`确定删除分组“${name}”？`)) return
    try { await api.deleteClassGroup(selectedId); reset(); await load(); onComplete('分组已删除') } catch (error) { onComplete(error instanceof Error ? error.message : '删除分组失败', 'error') }
  }

  return <div className={styles.layout}>
    <Card className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <Text weight="semibold">分组</Text>
        <Button appearance="subtle" icon={<Add24Regular />} onClick={reset}>新建</Button>
      </div>
      <div className={styles.nav}>
        {items.map((item) => <Button
          key={item.id}
          appearance="subtle"
          className={mergeClasses(styles.navButton, selectedId === item.id && styles.navButtonSelected)}
          onClick={() => open(item)}
        >
          <span className={styles.navButtonCopy}>
            <Text weight="semibold" block>{item.name}</Text>
            <Text className={styles.navButtonMeta} size={200} block>{item.group_ids.length} 个班级</Text>
          </span>
        </Button>)}
        {items.length === 0 && <div className={styles.empty}>暂无分组</div>}
      </div>
    </Card>
    <div className={styles.main}>
      <Card>
        <CardHeader header={<Text as="h2" weight="semibold" size={400}>{selectedId ? '编辑分组' : '新建分组'}</Text>} />
        <div className={styles.commandBar}>
          <Field label="分组名称" className={styles.commandBarField}><Input value={name} onChange={(_, data) => setName(data.value)} /></Field>
          <div className={styles.commandBarActions}>
            <Button appearance="secondary" icon={<Delete24Regular />} disabled={!selectedId} onClick={() => void remove()}>删除</Button>
            <Button appearance="primary" icon={<Save24Regular />} onClick={() => void save()}>保存</Button>
          </div>
        </div>
        <Field label="包含的班级">
          <div className={styles.checks}>{groups.map((group) => <Checkbox key={group.id} checked={memberIds.includes(group.id)} onChange={(_, data) => toggle(group.id, data.checked === true)} label={group.name} />)}</div>
        </Field>
      </Card>
    </div>
  </div>
}
