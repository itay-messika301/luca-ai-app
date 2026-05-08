import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export const ROLES = {
  WORKSPACE_OWNER: 'workspace_owner',
  ACCOUNTANT:      'accountant',
  REVIEWER:        'reviewer',
  END_CLIENT:      'end_client',
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
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (currentUser?.email) {
          const { data: inv } = await supabase
            .from('workspace_invitations')
            .select('*')
            .eq('email', currentUser.email)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .maybeSingle()

          if (inv) {
            await Promise.all([
              supabase.from('workspace_invitations')
                .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                .eq('id', inv.id),
              supabase.from('profiles')
                .update({ role: inv.role, workspace_id: inv.workspace_id })
                .eq('id', userId),
            ])
            const { data: updated } = await supabase
              .from('profiles')
              .select('*, workspaces(*)')
              .eq('id', userId)
              .single()
            if (updated) { setProfile(updated); return }
          }
        }
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

  const refreshProfile = () => {
    if (user) fetchProfile(user.id)
  }

  const role             = profile?.role ?? null
  const workspace        = profile?.workspaces ?? null
  const isWorkspaceOwner = role === ROLES.WORKSPACE_OWNER
  const isAccountant     = role === ROLES.ACCOUNTANT
  const isReviewer       = role === ROLES.REVIEWER
  const isEndClient      = role === ROLES.END_CLIENT
  const isOfficeUser     = isWorkspaceOwner || isAccountant || isReviewer
  const hasWorkspace     = !!profile?.workspace_id

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      workspace,
      loading,
      role,
      isWorkspaceOwner,
      isAccountant,
      isReviewer,
      isEndClient,
      isOfficeUser,
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
