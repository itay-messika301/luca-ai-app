// Per-client access for office employees (migration 014).
// Returns null when the caller sees every client of the workspace,
// otherwise a Set of allowed client ids.
export async function allowedClientIds(supabaseAdmin, userId, profile) {
  if (!profile) return new Set()
  if (profile.role === 'workspace_owner') return null
  if (profile.role === 'workspace_employee' && (profile.client_access || 'all') === 'all') return null
  const { data } = await supabaseAdmin
    .from('staff_clients')
    .select('client_id')
    .eq('user_id', userId)
  return new Set((data || []).map(r => r.client_id))
}
