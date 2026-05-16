import { useEffect, useState } from 'react'

/**
 * Returns a debounced copy of `value` that updates only after the user
 * pauses for `delay` ms. Use for live search inputs.
 */
export function useDebounce(value, delay = 200) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
