// One place that decides what each user may do in the UI.
// The database (RLS) enforces the same rules; this only hides what would fail.

const OFFICE = ['workspace_owner', 'workspace_employee']

export const isOffice = profile => OFFICE.includes(profile?.role)

// Office staff with edit rights (owner always; employees unless read-only)
export const canEdit = profile =>
  profile?.role === 'workspace_owner' ||
  (profile?.role === 'workspace_employee' && profile?.access_level !== 'read')

// Office staff with edit rights, and end clients for their own businesses
export const canUpload = profile =>
  canEdit(profile) || profile?.role === 'end_client'
