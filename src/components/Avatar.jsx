import { useState } from 'react'

const SIZES = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-xs',
  lg: 'w-16 h-16 text-xl',
}

// Name to greet / show: nickname first, then full name.
export function displayName(profile, fallback = '') {
  return profile?.display_name || profile?.full_name || fallback
}

export default function Avatar({ profile, name, size = 'md' }) {
  const [broken, setBroken] = useState(false)
  const label = name || displayName(profile, '?')
  const cls = `${SIZES[size] || SIZES.md} rounded-full flex-shrink-0`
  if (profile?.avatar_url && !broken) {
    return <img src={profile.avatar_url} alt="" className={`${cls} object-cover`} onError={() => setBroken(true)} />
  }
  return (
    <div className={`${cls} bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold`} aria-hidden="true">
      {label.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}
