/**
 * Israeli entity registration number validation
 * Validates ח.פ (company) / ע.מ (VAT) 9-digit numbers
 * Algorithm: Luhn-style with alternating weights 1,2,1,2...
 */
export function validateRegistrationNumber(num) {
  const s = String(num).replace(/\D/g, '')
  if (s.length !== 9) return { valid: false, message: 'מספר ח.פ חייב להיות 9 ספרות' }

  let sum = 0
  for (let i = 0; i < 9; i++) {
    let d = parseInt(s[i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }

  if (sum % 10 !== 0) return { valid: false, message: 'מספר ח.פ אינו תקין (ספרת ביקורת שגויה)' }
  return { valid: true, message: null }
}

/**
 * Parse and validate a CSV row's registration number
 * Returns the normalized 9-digit string or null
 */
export function normalizeRegistrationNumber(num) {
  const s = String(num || '').replace(/\D/g, '').padStart(9, '0')
  return s.length === 9 ? s : null
}

/**
 * Validate Israeli phone number (basic: 10 digits, starts with 0)
 */
export function validateIsraeliPhone(phone) {
  const s = String(phone || '').replace(/[\s\-().]/g, '')
  if (!s) return { valid: true, message: null } // optional
  if (!/^0\d{8,9}$/.test(s)) return { valid: false, message: 'מספר טלפון לא תקין' }
  return { valid: true, message: null }
}

/**
 * Parse a CSV string into an array of row objects.
 * Handles quoted fields and Hebrew characters.
 * Returns { headers, rows } where rows is array of objects.
 */
export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }

  const parseRow = (line) => {
    const cols = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        cols.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    cols.push(current.trim())
    return cols
  }

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'))
  const rows = lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const cols = parseRow(line)
      return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
    })

  return { headers, rows }
}

/**
 * Expected CSV column names (flexible matching)
 */
const FIELD_ALIASES = {
  registration_number: ['registration_number', 'mispar_cp', 'ח.פ', 'מספר_חברה', 'company_id', 'reg_number', 'id_number'],
  business_name:       ['business_name', 'name', 'שם_חברה', 'company_name', 'עסק'],
  owner_name:          ['owner_name', 'owner', 'בעלים', 'contact_name', 'contact'],
  reporting_cycle:     ['reporting_cycle', 'cycle', 'דיווח', 'report_cycle'],
}

export function mapCSVRow(row) {
  const result = {}
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const key = Object.keys(row).find(k => k === alias || k.replace(/\s+/g, '_') === alias)
      if (key !== undefined) {
        result[field] = row[key]
        break
      }
    }
  }
  return result
}

/**
 * Validate and enrich a mapped CSV row
 * Returns { data, errors, warnings }
 */
export function validateCSVRow(mapped, index, existingNumbers = new Set()) {
  const errors = []
  const warnings = []

  const reg = normalizeRegistrationNumber(mapped.registration_number)
  if (!reg) {
    errors.push(`שורה ${index + 1}: מספר ח.פ חסר`)
  } else {
    const check = validateRegistrationNumber(reg)
    if (!check.valid) errors.push(`שורה ${index + 1}: ${check.message}`)
    if (existingNumbers.has(reg)) warnings.push(`שורה ${index + 1}: מספר ח.פ ${reg} כבר קיים במערכת`)
  }

  if (!mapped.business_name?.trim()) {
    errors.push(`שורה ${index + 1}: שם עסק חסר`)
  }

  const cycle = (mapped.reporting_cycle || '').toLowerCase()
  const normalizedCycle = cycle.includes('bimonth') || cycle.includes('דו') ? 'bimonthly' : 'monthly'

  return {
    data: {
      registration_number: reg,
      business_name:       mapped.business_name?.trim() || '',
      owner_name:          mapped.owner_name?.trim() || null,
      reporting_cycle:     normalizedCycle,
    },
    errors,
    warnings,
  }
}
