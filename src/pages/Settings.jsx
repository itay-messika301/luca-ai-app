import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Settings as SettingsIcon, Users, Building2, Trash2, UserPlus, Mail,
  ChevronDown, Shield, ClipboardCheck, Link2, BookOpen, Plus, X,
  AlertCircle, CheckCircle, Download, Loader2
} from 'lucide-react'

const ROLE_LABELS = {
  workspace_owner: 'בעל משרד',
  accountant:      'רואה חשבון',
  reviewer:        'מאשר',
}

const ROLE_COLORS = {
  workspace_owner: 'bg-violet-500/15 text-violet-300',
  accountant:      'bg-blue-500/15 text-blue-300',
  reviewer:        'bg-green-500/15 text-green-300',
}

const TABS = [
  { id: 'workspace',   label: 'משרד',         icon: Building2 },
  { id: 'users',       label: 'צוות',          icon: Users },
  { id: 'validation',  label: 'כללי ביקורת',  icon: Shield },
  { id: 'approvals',   label: 'כללי אישור',   icon: ClipboardCheck },
  { id: 'erp',         label: 'חיבור ERP',    icon: Link2 },
  { id: 'audit',       label: 'יומן פעולות',  icon: BookOpen },
]

export default function Settings() {
  const { profile, workspace, refreshProfile } = useAuth()
  const [activeTab, setActiveTab] = useState('workspace')

  return (
    <div className="p-6 max-w-5xl" dir="rtl">
      <h1 className="text-slate-900 dark:text-white text-2xl font-bold mb-6">הגדרות</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-slate-200 dark:border-white/10 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeTab === id
                ? 'border-blue-500 text-slate-900 dark:text-white'
                : 'border-transparent text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/70'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'workspace'  && <WorkspaceTab  workspace={workspace} refreshProfile={refreshProfile} />}
      {activeTab === 'users'      && <UsersTab       workspace={workspace} profile={profile} />}
      {activeTab === 'validation' && <ValidationTab  workspace={workspace} />}
      {activeTab === 'approvals'  && <ApprovalsTab   workspace={workspace} />}
      {activeTab === 'erp'        && <ERPTab         workspace={workspace} />}
      {activeTab === 'audit'      && <AuditTab       workspace={workspace} />}
    </div>
  )
}

/* ───────────── Workspace Tab ───────────── */
function WorkspaceTab({ workspace, refreshProfile }) {
  const [name,    setName]    = useState(workspace?.name    || '')
  const [phone,   setPhone]   = useState(workspace?.phone   || '')
  const [saving,  setSaving]  = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    setName(workspace?.name  || '')
    setPhone(workspace?.phone || '')
  }, [workspace])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const { error } = await supabase
      .from('workspaces')
      .update({ name: name.trim(), phone: phone.trim() })
      .eq('id', workspace?.id)
    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: 'שגיאה: ' + error.message })
    } else {
      setMessage({ type: 'success', text: 'הפרטים עודכנו בהצלחה' })
      await refreshProfile()
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <h2 className="text-slate-900 dark:text-white font-semibold mb-4">פרטי המשרד</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">שם המשרד</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="שם המשרד"
              required
            />
          </div>
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">טלפון</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="050-0000000"
            />
          </div>
          {message && (
            <p className={`text-sm ${message.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'שומר...' : 'שמור שינויים'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ───────────── Users Tab ───────────── */
function UsersTab({ workspace, profile }) {
  const [members,     setMembers]     = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showInvite,  setShowInvite]  = useState(false)

  useEffect(() => { if (workspace?.id) loadData() }, [workspace?.id])

  async function loadData() {
    setLoading(true)
    const [membersRes, invitationsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, created_at')
        .eq('workspace_id', workspace.id).neq('id', profile.id).order('created_at'),
      supabase.from('workspace_invitations').select('*')
        .eq('workspace_id', workspace.id).eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])
    setMembers(membersRes.data || [])
    setInvitations(invitationsRes.data || [])
    setLoading(false)
  }

  async function changeRole(userId, newRole) {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (!error) setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m))
  }

  async function removeMember(userId) {
    if (!window.confirm('האם להסיר את המשתמש מהמשרד?')) return
    const { error } = await supabase.from('profiles')
      .update({ workspace_id: null, role: 'end_client' }).eq('id', userId)
    if (!error) setMembers(prev => prev.filter(m => m.id !== userId))
  }

  async function cancelInvitation(invId) {
    const { error } = await supabase.from('workspace_invitations')
      .update({ status: 'cancelled' }).eq('id', invId)
    if (!error) setInvitations(prev => prev.filter(i => i.id !== invId))
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
        <h2 className="text-slate-900 dark:text-white font-semibold mb-4">חברי הצוות</h2>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            <MemberRow name={profile?.full_name || '—'} role={profile?.role} isCurrentUser />
            {members.map(m => (
              <MemberRow
                key={m.id}
                name={m.full_name || '—'}
                role={m.role}
                onChangeRole={r => changeRole(m.id, r)}
                onRemove={() => removeMember(m.id)}
              />
            ))}
            {members.length === 0 && (
              <p className="text-slate-400 dark:text-white/30 text-sm py-2">אין עדיין חברי צוות נוספים</p>
            )}
          </div>
        )}
        <button
          onClick={() => setShowInvite(true)}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          הזמן חבר צוות
        </button>
      </div>

      {invitations.length > 0 && (
        <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
          <h2 className="text-slate-900 dark:text-white font-semibold mb-4">הזמנות ממתינות</h2>
          <div className="space-y-2">
            {invitations.map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-white/3">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-slate-400 dark:text-white/30 flex-shrink-0" />
                  <div>
                    <p className="text-slate-700 dark:text-white/80 text-sm">{inv.email}</p>
                    <p className="text-slate-400 dark:text-white/30 text-xs">{ROLE_LABELS[inv.role]}</p>
                  </div>
                </div>
                <button onClick={() => cancelInvitation(inv.id)}
                  className="text-slate-400 dark:text-white/30 hover:text-red-400 transition-colors p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <InviteModal
          workspace={workspace}
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); loadData() }}
        />
      )}
    </div>
  )
}

function MemberRow({ name, role, isCurrentUser, onChangeRole, onRemove }) {
  const initials = (name || '?').charAt(0).toUpperCase()
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-white/3 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-slate-900 dark:text-white text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        <p className="text-slate-700 dark:text-white/80 text-sm font-medium">
          {name}
          {isCurrentUser && <span className="text-slate-400 dark:text-white/30 text-xs mr-2">(אתה)</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!isCurrentUser && role !== 'workspace_owner' ? (
          <div className="relative">
            <select value={role} onChange={e => onChangeRole(e.target.value)}
              className="appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-7 pr-3 py-1 text-slate-600 dark:text-white/70 text-xs focus:outline-none focus:border-blue-500 cursor-pointer">
              <option value="accountant">רואה חשבון</option>
              <option value="reviewer">מאשר</option>
            </select>
            <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-white/30 pointer-events-none" />
          </div>
        ) : (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[role] || 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/50'}`}>
            {ROLE_LABELS[role] || role}
          </span>
        )}
        {!isCurrentUser && (
          <button onClick={onRemove} className="text-slate-400 dark:text-white/20 hover:text-red-400 transition-colors p-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/* ───────────── Validation Tab ───────────── */
function ValidationTab({ workspace }) {
  const [allocationThreshold, setAllocationThreshold] = useState(5000)
  const [dupeSensitivity,     setDupeSensitivity]     = useState('vendor_invoice')
  const [saving,              setSaving]              = useState(false)
  const [message,             setMessage]             = useState(null)

  useEffect(() => {
    if (!workspace?.id) return
    supabase.from('workspaces').select('settings').eq('id', workspace.id).single()
      .then(({ data }) => {
        if (data?.settings?.validation) {
          const v = data.settings.validation
          if (v.allocation_threshold != null) setAllocationThreshold(v.allocation_threshold)
          if (v.dupe_sensitivity)             setDupeSensitivity(v.dupe_sensitivity)
        }
      })
  }, [workspace?.id])

  async function save() {
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.from('workspaces')
      .update({
        settings: {
          validation: {
            allocation_threshold: Number(allocationThreshold),
            dupe_sensitivity:     dupeSensitivity,
          }
        }
      })
      .eq('id', workspace.id)
    setSaving(false)
    setMessage(error
      ? { type: 'error', text: 'שגיאה: ' + error.message }
      : { type: 'success', text: 'הגדרות עודכנו' }
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <h2 className="text-slate-900 dark:text-white font-semibold mb-1">כללי ביקורת ישראלים</h2>
        <p className="text-slate-400 dark:text-white/40 text-xs mb-5">הגדר ספי ביקורת מותאמים אישית</p>

        <div className="space-y-5">
          <div>
            <label className="block text-slate-500 dark:text-white/60 text-sm mb-1">
              סף מספר הקצאה (ברירת מחדל: ₪5,000)
            </label>
            <p className="text-slate-400 dark:text-white/30 text-xs mb-2">
              חשבוניות מעל סכום זה יחויבו במספר הקצאה מרשות המסים
            </p>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-white/50 text-sm">₪</span>
              <input
                type="number"
                value={allocationThreshold}
                onChange={e => setAllocationThreshold(e.target.value)}
                min={0}
                step={100}
                className="w-36 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-500 dark:text-white/60 text-sm mb-1">רגישות זיהוי כפילויות</label>
            <p className="text-slate-400 dark:text-white/30 text-xs mb-2">
              בחר את הקריטריונים לזיהוי חשבוניות כפולות
            </p>
            <div className="relative max-w-xs">
              <select
                value={dupeSensitivity}
                onChange={e => setDupeSensitivity(e.target.value)}
                className="w-full appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 pl-8 py-2 text-slate-900 dark:text-white text-sm focus:outline-none cursor-pointer"
              >
                <option value="vendor_invoice">ספק + מספר חשבונית</option>
                <option value="vendor_invoice_amount">ספק + מספר חשבונית + סכום</option>
                <option value="invoice_only">מספר חשבונית בלבד</option>
              </select>
              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-white/30 pointer-events-none" />
            </div>
          </div>
        </div>

        {message && (
          <p className={`text-sm mt-4 ${message.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
            {message.text}
          </p>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="mt-5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? 'שומר...' : 'שמור'}
        </button>
      </div>
    </div>
  )
}

/* ───────────── Approval Rules Tab ───────────── */
function ApprovalsTab({ workspace }) {
  const [rules,      setRules]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showAdd,    setShowAdd]    = useState(false)

  useEffect(() => { if (workspace?.id) loadRules() }, [workspace?.id])

  async function loadRules() {
    setLoading(true)
    const { data } = await supabase.from('approval_rules')
      .select('*').eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
    setRules(data || [])
    setLoading(false)
  }

  async function toggleRule(ruleId, isActive) {
    await supabase.from('approval_rules').update({ is_active: !isActive }).eq('id', ruleId)
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, is_active: !isActive } : r))
  }

  async function deleteRule(ruleId) {
    if (!window.confirm('למחוק כלל זה?')) return
    await supabase.from('approval_rules').delete().eq('id', ruleId)
    setRules(prev => prev.filter(r => r.id !== ruleId))
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-900 dark:text-white font-semibold">כללי אישור</h2>
          <p className="text-slate-400 dark:text-white/40 text-xs mt-0.5">הגדר מתי מסמכים ידרשו אישור ידני</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          כלל חדש
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-blue-400 animate-spin" /></div>
      ) : rules.length === 0 ? (
        <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-8 text-center">
          <ClipboardCheck className="w-8 h-8 text-slate-300 dark:text-white/15 mx-auto mb-2" />
          <p className="text-slate-400 dark:text-white/30 text-sm">אין כללי אישור מוגדרים</p>
          <p className="text-slate-400 dark:text-white/20 text-xs mt-1">כל המסמכים המאושרים עוברים ישירות</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
              rule.is_active ? 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10' : 'bg-white/2 border-slate-100 dark:border-white/5 opacity-60'
            }`}>
              <div className="flex-1">
                <p className="text-slate-700 dark:text-white/80 text-sm font-medium">{rule.name}</p>
                <p className="text-slate-400 dark:text-white/40 text-xs mt-0.5">
                  {rule.trigger_type === 'amount_threshold'
                    ? `חשבוניות מעל ₪${Number(rule.threshold_amount || 0).toLocaleString('he-IL')}`
                    : 'כל המסמכים'
                  }
                  {' · '}
                  {(rule.stages || []).length} שלב/י אישור
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleRule(rule.id, rule.is_active)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    rule.is_active
                      ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-white/30 hover:bg-slate-200 dark:hover:bg-white/10'
                  }`}
                >
                  {rule.is_active ? 'פעיל' : 'כבוי'}
                </button>
                <button onClick={() => deleteRule(rule.id)}
                  className="text-slate-400 dark:text-white/20 hover:text-red-400 transition-colors p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddRuleModal
          workspace={workspace}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadRules() }}
        />
      )}
    </div>
  )
}

function AddRuleModal({ workspace, onClose, onSaved }) {
  const [name,      setName]      = useState('')
  const [trigger,   setTrigger]   = useState('amount_threshold')
  const [threshold, setThreshold] = useState(10000)
  const [stages,    setStages]    = useState([{ role: 'reviewer', timeout_hours: 48 }])
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)

  function addStage() {
    setStages(s => [...s, { role: 'workspace_owner', timeout_hours: 24 }])
  }
  function removeStage(i) {
    setStages(s => s.filter((_, idx) => idx !== i))
  }
  function updateStage(i, field, val) {
    setStages(s => s.map((st, idx) => idx === i ? { ...st, [field]: val } : st))
  }

  async function save() {
    if (!name.trim() || stages.length === 0) { setError('נדרש שם ולפחות שלב אחד'); return }
    setSaving(true)
    const { error: err } = await supabase.from('approval_rules').insert({
      workspace_id:     workspace.id,
      name:             name.trim(),
      trigger_type:     trigger,
      threshold_amount: trigger === 'amount_threshold' ? Number(threshold) : null,
      stages,
    })
    setSaving(false)
    if (err) { setError(err.message) } else { onSaved() }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-slate-900 dark:text-white font-bold text-lg mb-5">כלל אישור חדש</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">שם הכלל</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="לדוגמה: אישור חשבוניות גדולות"
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">תנאי הפעלה</label>
            <div className="relative">
              <select value={trigger} onChange={e => setTrigger(e.target.value)}
                className="w-full appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 pl-8 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none cursor-pointer">
                <option value="amount_threshold">מעל סכום מסוים</option>
                <option value="always">כל המסמכים</option>
              </select>
              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-white/30 pointer-events-none" />
            </div>
          </div>

          {trigger === 'amount_threshold' && (
            <div>
              <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">סף סכום (₪)</label>
              <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)}
                min={0} step={1000}
                className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 font-mono" />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-slate-500 dark:text-white/50 text-xs">שלבי אישור</label>
              <button onClick={addStage} className="text-blue-400 text-xs hover:text-blue-300 flex items-center gap-1">
                <Plus className="w-3 h-3" /> הוסף שלב
              </button>
            </div>
            <div className="space-y-2">
              {stages.map((stage, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-slate-400 dark:text-white/30 text-xs w-5">{i + 1}.</span>
                  <select value={stage.role} onChange={e => updateStage(i, 'role', e.target.value)}
                    className="flex-1 appearance-none bg-transparent text-slate-900 dark:text-white text-xs focus:outline-none cursor-pointer">
                    <option value="reviewer">מאשר</option>
                    <option value="workspace_owner">בעל משרד</option>
                  </select>
                  <span className="text-slate-400 dark:text-white/30 text-xs">תוך</span>
                  <input type="number" value={stage.timeout_hours}
                    onChange={e => updateStage(i, 'timeout_hours', Number(e.target.value))}
                    min={1} className="w-14 bg-transparent text-slate-900 dark:text-white text-xs font-mono focus:outline-none text-center" />
                  <span className="text-slate-400 dark:text-white/30 text-xs">ש'</span>
                  {stages.length > 1 && (
                    <button onClick={() => removeStage(i)} className="text-slate-400 dark:text-white/20 hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'שומר...' : 'שמור כלל'}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white/70 rounded-lg text-sm transition-colors">
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────── ERP Tab ───────────── */
function ERPTab({ workspace }) {
  const [hashUrl,  setHashUrl]  = useState('')
  const [hashUser, setHashUser] = useState('')
  const [priUrl,   setPriUrl]   = useState('')
  const [priUser,  setPriUser]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [message,  setMessage]  = useState(null)

  useEffect(() => {
    if (!workspace?.id) return
    supabase.from('workspaces').select('settings').eq('id', workspace.id).single()
      .then(({ data }) => {
        const erp = data?.settings?.erp || {}
        setHashUrl(erp.hashavshevet_url  || '')
        setHashUser(erp.hashavshevet_user || '')
        setPriUrl(erp.priority_url        || '')
        setPriUser(erp.priority_user      || '')
      })
  }, [workspace?.id])

  async function save() {
    setSaving(true)
    setMessage(null)
    const { data: current } = await supabase.from('workspaces').select('settings').eq('id', workspace.id).single()
    const settings = { ...(current?.settings || {}), erp: {
      hashavshevet_url:  hashUrl.trim(),
      hashavshevet_user: hashUser.trim(),
      priority_url:      priUrl.trim(),
      priority_user:     priUser.trim(),
    }}
    const { error } = await supabase.from('workspaces').update({ settings }).eq('id', workspace.id)
    setSaving(false)
    setMessage(error
      ? { type: 'error', text: 'שגיאה: ' + error.message }
      : { type: 'success', text: 'הגדרות ERP נשמרו. הסיסמאות מוגדרות ב-Vercel Environment Variables.' }
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm">
        <p className="text-blue-300 font-medium mb-1">הגדרת סיסמאות</p>
        <p className="text-blue-200/60 text-xs">
          מטעמי אבטחה, סיסמאות ה-ERP מוגדרות ב-Vercel כמשתני סביבה:{' '}
          <code className="font-mono text-blue-300">PRIORITY_API_PASS</code>,{' '}
          <code className="font-mono text-blue-300">HASHAVSHEVET_PASS</code>.
        </p>
      </div>

      {/* Hashavshevet */}
      <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
        <h3 className="text-slate-900 dark:text-white font-semibold mb-4">חשבשבת</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1">כתובת שרת</label>
            <input value={hashUrl} onChange={e => setHashUrl(e.target.value)}
              placeholder="https://hashavshevet.example.com"
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1">שם משתמש</label>
            <input value={hashUser} onChange={e => setHashUser(e.target.value)}
              placeholder="מספר חברה / שם משתמש"
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
        </div>
      </div>

      {/* Priority */}
      <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
        <h3 className="text-slate-900 dark:text-white font-semibold mb-4">Priority</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1">OData URL</label>
            <input value={priUrl} onChange={e => setPriUrl(e.target.value)}
              placeholder="https://priority.example.com/odata/priority/..."
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1">שם משתמש</label>
            <input value={priUser} onChange={e => setPriUser(e.target.value)}
              placeholder="שם משתמש Priority"
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
          {message.text}
        </p>
      )}

      <button onClick={save} disabled={saving}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors">
        {saving ? 'שומר...' : 'שמור הגדרות ERP'}
      </button>
    </div>
  )
}

/* ───────────── Audit Log Tab ───────────── */
function AuditTab({ workspace }) {
  const [logs,      setLogs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('')
  const [page,      setPage]      = useState(0)

  const PAGE_SIZE = 50

  useEffect(() => {
    if (workspace?.id) loadLogs()
  }, [workspace?.id, filter, page])

  async function loadLogs() {
    setLoading(true)
    let query = supabase
      .from('audit_log')
      .select('*, profiles(full_name)')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filter) query = query.ilike('action', `%${filter}%`)

    const { data } = await query
    setLogs(data || [])
    setLoading(false)
  }

  function exportCSV() {
    const rows = ['\ufeffתאריך;פעולה;סוג;מזהה;משתמש;ערך']
    logs.forEach(l => {
      rows.push([
        new Date(l.created_at).toLocaleString('he-IL'),
        l.action,
        l.entity_type,
        l.entity_id,
        l.profiles?.full_name || l.performed_by || '',
        JSON.stringify(l.new_value || {}),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    })
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `audit_log_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const ACTION_COLORS = {
    ai_process:           'text-blue-400',
    approve:              'text-green-400',
    reject:               'text-red-400',
    edit_field:           'text-yellow-400',
    export_excel:         'text-violet-400',
    export_hashavshevet:  'text-violet-400',
    export_priority:      'text-violet-400',
    approval_approved:    'text-green-400',
    approval_rejected:    'text-red-400',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-900 dark:text-white font-semibold">יומן פעולות</h2>
          <p className="text-slate-400 dark:text-white/40 text-xs mt-0.5">רשומות audit בלתי-ניתנות לשינוי</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white rounded-lg text-sm transition-all">
          <Download className="w-3.5 h-3.5" />
          ייצא CSV
        </button>
      </div>

      <input
        value={filter}
        onChange={e => { setFilter(e.target.value); setPage(0) }}
        placeholder="סנן לפי פעולה..."
        className="w-full max-w-xs bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-8 h-8 text-slate-300 dark:text-white/15 mx-auto mb-2" />
          <p className="text-slate-400 dark:text-white/30 text-sm">אין פעולות לתצוגה</p>
        </div>
      ) : (
        <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-white/3 border-b border-slate-100 dark:border-white/8">
              <tr>
                <th className="text-right text-slate-400 dark:text-white/40 font-medium px-4 py-2.5">תאריך</th>
                <th className="text-right text-slate-400 dark:text-white/40 font-medium px-4 py-2.5">פעולה</th>
                <th className="text-right text-slate-400 dark:text-white/40 font-medium px-4 py-2.5">סוג</th>
                <th className="text-right text-slate-400 dark:text-white/40 font-medium px-4 py-2.5">משתמש</th>
                <th className="text-right text-slate-400 dark:text-white/40 font-medium px-4 py-2.5">פרטים</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                  <td className="px-4 py-2.5 text-slate-400 dark:text-white/40 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('he-IL')}
                  </td>
                  <td className={`px-4 py-2.5 font-medium ${ACTION_COLORS[log.action] || 'text-slate-500 dark:text-white/60'}`}>
                    {log.action}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 dark:text-white/40">{log.entity_type}</td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-white/60">
                    {log.profiles?.full_name || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 dark:text-white/30 max-w-xs truncate">
                    {log.new_value ? JSON.stringify(log.new_value) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/8">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors text-xs"
            >
              הקודם
            </button>
            <span className="text-slate-400 dark:text-white/30 text-xs">עמוד {page + 1}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={logs.length < PAGE_SIZE}
              className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors text-xs"
            >
              הבא
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────── Invite Modal ───────────── */
function InviteModal({ workspace, onClose, onInvited }) {
  const { profile } = useAuth()
  const [email,   setEmail]   = useState('')
  const [role,    setRole]    = useState('accountant')
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState(null)

  async function sendInvitation(e) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/invite-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body:    JSON.stringify({
          email:         email.trim().toLowerCase(),
          role,
          workspaceId:   workspace.id,
          workspaceName: workspace.name,
          inviterName:   profile?.full_name || 'בעל המשרד',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה בשליחת ההזמנה')
      onInvited()
    } catch (err) {
      setError(err.message)
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-slate-900 dark:text-white font-bold text-lg mb-5">הזמן חבר צוות</h2>
        <form onSubmit={sendInvitation} className="space-y-4">
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">כתובת מייל</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="name@firm.co.il" required />
          </div>
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">תפקיד</label>
            <div className="relative">
              <select value={role} onChange={e => setRole(e.target.value)}
                className="w-full appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 pl-9 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none cursor-pointer">
                <option value="accountant">רואה חשבון</option>
                <option value="reviewer">מאשר</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-white/30 pointer-events-none" />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={sending}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors">
              {sending ? 'שולח...' : 'שלח הזמנה'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white/70 rounded-lg text-sm transition-colors">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
