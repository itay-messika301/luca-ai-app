import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// Safely claim end_client contact rows. supabase.rpc() returns a PostgrestBuilder
// (a thenable, not a real Promise), so it has no .catch — awaiting it and
// inspecting { error } is the correct pattern. Missing RPC or RLS denials are
// swallowed so they never break the login/profile flow.
async function claimEndClientContacts() {
  try {
    const { error } = await supabase.rpc('claim_end_client_contacts')
    if (error) console.warn('claim_end_client_contacts:', error.message)
  } catch (err) {
    console.warn('claim_end_client_contacts threw:', err)
  }
}

export const ROLES = {
  WORKSPACE_OWNER:    'workspace_owner',
  WORKSPACE_EMPLOYEE: 'workspace_employee',
  END_CLIENT:         'end_client',
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, workspaces(*)')
        .eq('id', userId)
        .single()

      if (error) throw error

      // If user has no workspace yet, check for a pending invitation and auto-accept it.
      // This handles the case where a team member signs in directly instead of via invitation link.
      if (data && !data.workspace_id) {
        // SECURITY DEFINER RPC (migration 013): validates the login email and
        // sets role + workspace server-side. Returns the new role or null.
        try {
          const { data: acceptedRole, error: accErr } = await supabase.rpc('accept_my_pending_invitation')
          if (accErr) console.warn('accept_my_pending_invitation:', accErr.message)
          if (acceptedRole) {
            const { data: updated } = await supabase
              .from('profiles')
              .select('*, workspaces(*)')
              .eq('id', userId)
              .single()
            if (updated) {
              setProfile(updated)
              return
            }
          }
        } catch (err) {
          console.warn('accept_my_pending_invitation threw:', err)
        }
      }

      // For end_clients on every login: ensure client_contacts.accepted_at is set
      // and user_clients linkage is populated. This fixes status display from
      // "הזמנה נשלחה" to "מחובר" once the user has actually signed in, even
      // if they bypassed the /accept-invitation flow on first entry.
      if (data?.role === 'end_client') {
        await claimEndClientContacts()
      }

      setProfile(data)
    } catch (err) {
      console.error('Error fetching profile:', err)
    } finally {
      setLoading(false)
    }
  }

  // Google OAuth — opens Google sign-in redirect
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  }

  // Magic Link — pre-validates email via server before sending OTP
  const signInWithMagicLink = async (email) => {
    const res = await fetch('/api/send-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'שגיאה בשליחת הקישור')
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  const role              = profile?.role ?? null
  const workspace         = profile?.workspaces ?? null
  const isWorkspaceOwner  = role === ROLES.WORKSPACE_OWNER
  const isEmployee        = role === ROLES.WORKSPACE_EMPLOYEE
  const isEndClient       = role === ROLES.END_CLIENT
  const isOfficeUser      = isWorkspaceOwner || isEmployee
  const isSuperAdmin      = !!profile?.is_super_admin
  const hasWorkspace      = !!profile?.workspace_id

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      workspace,
      loading,
      role,
      isWorkspaceOwner,
      isEmployee,
      isEndClient,
      isOfficeUser,
      isSuperAdmin,
      hasWorkspace,
      signInWithGoogle,
      signInWithMagicLink,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
