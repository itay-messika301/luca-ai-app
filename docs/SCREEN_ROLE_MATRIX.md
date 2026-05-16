# Screen × Role Access Matrix — Luca AI

Source of truth derived from:
- `src/App.jsx` — route → ProtectedRoute(allowedRoles)
- `src/components/layout/Sidebar.jsx` — nav items per role
- `supabase/migrations/*.sql` — RLS policies
- `supabase/migrations/007_sprint13_rls_audit.sql` — closes RLS gaps

Legend
- ✅ Full access (read + write per role's normal capabilities)
- 👁️ Read-only
- ❌ Blocked at route guard → redirects elsewhere
- 🔒 Reachable via URL but data filtered by RLS (only own records)

## Office routes

| Path                | workspace_owner | accountant | reviewer | end_client |
|---------------------|:---------------:|:----------:|:--------:|:----------:|
| `/dashboard`        | ✅              | ✅         | ✅       | ❌ → /client |
| `/clients`          | ✅              | ✅         | ❌       | ❌         |
| `/clients/:id`      | ✅              | ✅         | ❌       | ❌         |
| `/documents`        | ✅              | ✅         | 👁️ + status update | ❌ |
| `/documents?doc=`   | ✅              | ✅         | 👁️       | ❌         |
| `/review`           | ✅              | ✅         | ✅       | ❌         |
| `/export`           | ✅              | ✅         | ❌       | ❌         |
| `/settings`         | ✅              | ❌         | ❌       | ❌         |

## End-client routes

| Path                  | end_client | office roles |
|-----------------------|:----------:|:------------:|
| `/client`             | ✅         | ❌ → /dashboard |
| `/client/documents`   | 🔒 own client only | ❌    |
| `/client/upload`      | 🔒 own client only | ❌    |

## RLS quick reference (migration 007 applied)

| Table                | SELECT                                           | INSERT                            | UPDATE                              | DELETE                       |
|----------------------|--------------------------------------------------|-----------------------------------|-------------------------------------|------------------------------|
| workspaces           | members                                          | owner during onboarding           | owner                               | —                            |
| profiles             | self + workspace members                         | trigger only                      | self + owner on team members        | —                            |
| clients              | office: all in ws · end_client: own only         | owner+accountant                  | owner+accountant                    | owner only                   |
| documents            | office: all in ws · end_client: own client only  | owner+accountant + end_client own | owner+accountant + reviewer (status)| owner+accountant             |
| audit_log            | office                                            | system / workspace                | —                                   | —                            |
| workspace_invitations| owner manages · token holder reads pending      | owner                             | self-accept                         | owner                        |
| exports              | members                                           | owner+accountant                  | —                                   | —                            |
| approval_rules       | members                                           | owner                             | owner                               | —                            |
| approval_requests    | members                                           | owner+accountant                  | assigned reviewer or owner          | —                            |

## Smoke-test checklist (manual)

For each role, log in and verify:

### workspace_owner
- [ ] `/dashboard` loads
- [ ] `/clients` list shows all workspace clients
- [ ] `/clients/:id` opens — "Copy link" button copies URL
- [ ] `/documents` opens with ProcessTabs visible (3 tabs)
- [ ] `/documents?doc=:id` auto-opens side drawer for that doc
- [ ] `/documents?client=:id` pre-filters list to that client
- [ ] Drawer "→ business_name" link navigates to `/clients/:id`
- [ ] `/review` opens — "פתח במסמכים →" link navigates to `/documents?doc=:id`
- [ ] `/export` opens
- [ ] `/settings` opens
- [ ] Sidebar shows "תהליך מסמך" (unified entry) + review-count badge

### accountant
- [ ] All of the above except `/settings` redirects away
- [ ] Sub-tab "ייצוא" is visible inside ProcessTabs

### reviewer
- [ ] `/clients` blocked → redirects
- [ ] `/export` blocked → redirects
- [ ] `/review` works; can approve/reject
- [ ] Sub-tab "ייצוא" is HIDDEN inside ProcessTabs

### end_client
- [ ] Auto-redirects to `/client`
- [ ] Visiting `/documents` redirects away
- [ ] Visiting `/clients` redirects away
- [ ] `/client/documents` shows only their own client's docs (RLS verified)
- [ ] Cannot select other clients via URL param

## Deep-link shareability

| Resource           | URL pattern                          | Restored on visit                    |
|--------------------|--------------------------------------|--------------------------------------|
| Client card        | `/clients/:id`                       | Full page state                      |
| Document (drawer)  | `/documents?doc=:id`                 | Drawer auto-opens with that doc      |
| Client + filter    | `/documents?client=:id`              | Client filter pre-applied            |
| Combined           | `/documents?client=:cid&doc=:did`    | Both filter and drawer               |

All deep-links resolve only if the user is authorised to view that resource;
unauthorised users get redirected by ProtectedRoute or filtered out by RLS.
