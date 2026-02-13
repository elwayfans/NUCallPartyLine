/**
 * Normalize a phone number to E.164 format
 * Assumes US numbers if no country code is provided
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Handle US numbers
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Handle numbers that already have country code
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Return with + prefix if it looks like an international number
  if (digits.length > 10) {
    return `+${digits}`;
  }

  // Return as-is if we can't normalize
  return phone;
}

/**
 * Validate that a phone number is in a valid format
 */
export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  // Basic E.164 validation: starts with + and has 10-15 digits
  return /^\+\d{10,15}$/.test(normalized);
}

/**
 * Format a phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  // Format US numbers
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone;
}
