import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export const ROLES = {
  ADMIN: 'admin',
  OFFICE_MANAGER: 'office_manager',
  OFFICE_EMPLOYEE: 'office_employee',
  END_CLIENT: 'end_client',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // Listen for auth changes
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
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      setProfile(data)
    } catch (err) {
      console.error('Error fetching profile:', err)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const refreshProfile = () => {
    if (user) fetchProfile(user.id)
  }

  const role = profile?.role ?? null
  const isAdmin = role === ROLES.ADMIN
  const isOfficeManager = role === ROLES.OFFICE_MANAGER
  const isOfficeEmployee = role === ROLES.OFFICE_EMPLOYEE
  const isEndClient = role === ROLES.END_CLIENT
  const isOfficeUser = isAdmin || isOfficeManager || isOfficeEmployee

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      role,
      isAdmin,
      isOfficeManager,
      isOfficeEmployee,
      isEndClient,
      isOfficeUser,
      signIn,
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
