import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Settings as SettingsIcon, Users, Building2, Trash2, UserPlus, Mail, ChevronDown } from 'lucide-react'

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
  { id: 'workspace', label: 'משרד',  icon: Building2 },
  { id: 'users',     label: 'צוות',  icon: Users },
]

export default function Settings() {
  const { profile, workspace, refreshProfile } = useAuth()
  const [activeTab, setActiveTab] = useState('workspace')

  return (
    <div className="p-6 max-w-4xl" dir="rtl">
      <h1 className="text-white text-2xl font-bold mb-6">הגדרות</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-white/10">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'workspace' && (
        <WorkspaceTab workspace={workspace} refreshProfile={refreshProfile} />
      )}
      {activeTab === 'users' && (
        <UsersTab workspace={workspace} profile={profile} />
      )}
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
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-4">פרטי המשרד</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-white/50 text-xs mb-1.5">שם המשרד</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="שם המשרד"
              required
            />
          </div>
          <div>
            <label className="block text-white/50 text-xs mb-1.5">טלפון</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
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
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
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

  useEffect(() => {
    if (workspace?.id) loadData()
  }, [workspace?.id])

  async function loadData() {
    setLoading(true)

    const [membersRes, invitationsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role, created_at')
        .eq('workspace_id', workspace.id)
        .neq('id', profile.id) // exclude self
        .order('created_at'),
      supabase
        .from('workspace_invitations')
        .select('*')
        .eq('workspace_id', workspace.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])

    setMembers(membersRes.data || [])
    setInvitations(invitationsRes.data || [])
    setLoading(false)
  }

  async function changeRole(userId, newRole) {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (!error) setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m))
  }

  async function removeMember(userId) {
    if (!window.confirm('האם להסיר את המשתמש מהמשרד?')) return
    const { error } = await supabase
      .from('profiles')
      .update({ workspace_id: null, role: 'end_client' })
      .eq('id', userId)

    if (!error) setMembers(prev => prev.filter(m => m.id !== userId))
  }

  async function cancelInvitation(invId) {
    const { error } = await supabase
      .from('workspace_invitations')
      .update({ status: 'cancelled' })
      .eq('id', invId)

    if (!error) setInvitations(prev => prev.filter(i => i.id !== invId))
  }

  return (
    <div className="space-y-6">
      {/* Self row */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">חברי הצוות</h2>

        {loading ? (
          <div className="py-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {/* Current user */}
            <MemberRow
              name={profile?.full_name || '—'}
              role={profile?.role}
              isCurrentUser
            />
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
              <p className="text-white/30 text-sm py-2">אין עדיין חברי צוות נוספים</p>
            )}
          </div>
        )}

        <button
          onClick={() => setShowInvite(true)}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          הזמן חבר צוות
        </button>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">הזמנות ממתינות</h2>
          <div className="space-y-2">
            {invitations.map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-white/3">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-white/30 flex-shrink-0" />
                  <div>
                    <p className="text-white/80 text-sm">{inv.email}</p>
                    <p className="text-white/30 text-xs">{ROLE_LABELS[inv.role]}</p>
                  </div>
                </div>
                <button
                  onClick={() => cancelInvitation(inv.id)}
                  className="text-white/30 hover:text-red-400 transition-colors p-1"
                  title="בטל הזמנה"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite modal */}
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
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-white/3 hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="text-white/80 text-sm font-medium">
            {name}
            {isCurrentUser && <span className="text-white/30 text-xs mr-2">(אתה)</span>}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isCurrentUser && role !== 'workspace_owner' ? (
          <div className="relative">
            <select
              value={role}
              onChange={e => onChangeRole(e.target.value)}
              className="appearance-none bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-1 text-white/70 text-xs focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="accountant">רואה חשבון</option>
              <option value="reviewer">מאשר</option>
            </select>
            <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none" />
          </div>
        ) : (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[role] || 'bg-white/10 text-white/50'}`}>
            {ROLE_LABELS[role] || role}
          </span>
        )}

        {!isCurrentUser && (
          <button
            onClick={onRemove}
            className="text-white/20 hover:text-red-400 transition-colors p-1"
            title="הסר מהמשרד"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/* ───────────── Invite Modal ───────────── */
function InviteModal({ workspace, onClose, onInvited }) {
  const { user, profile } = useAuth()
  const [email,    setEmail]    = useState('')
  const [role,     setRole]     = useState('accountant')
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState(null)

  async function sendInvitation(e) {
    e.preventDefault()
    setSending(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
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
      <div className="bg-[#111117] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-white font-bold text-lg mb-5">הזמן חבר צוות</h2>

        <form onSubmit={sendInvitation} className="space-y-4">
          <div>
            <label className="block text-white/50 text-xs mb-1.5">כתובת מייל</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="name@firm.co.il"
              required
            />
          </div>
          <div>
            <label className="block text-white/50 text-xs mb-1.5">תפקיד</label>
            <div className="relative">
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-3 pl-9 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="accountant">רואה חשבון</option>
                <option value="reviewer">מאשר</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={sending}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {sending ? 'שולח...' : 'שלח הזמנה'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-lg text-sm transition-colors"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
