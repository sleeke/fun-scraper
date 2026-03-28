export const GENRE_EMOJI = {
  'hip-hop': '🎤',
  electronic: '🎛️',
  jazz: '🎷',
  rock: '🎸',
  pop: '🎵',
  classical: '🎻',
  country: '🪕',
  reggae: '🌴',
  latin: '💃',
};

export const SOURCE_LABELS = {
  blueprint: 'Blueprint',
  ticketmaster: 'Ticketmaster',
  celebrities: 'Celebrities',
  redroom: 'Red Room',
  fortune: 'Fortune Sound',
  industrial236: 'Industrial 236',
  residentadvisor: 'Resident Advisor',
  thisisblueprint: 'This Is Blueprint',
  manual: 'Manual',
};

export function formatPrice(event) {
  if (event.price_text) return event.price_text;
  if (event.price_min === 0 && event.price_max === 0) return 'Free';
  if (event.price_min != null) {
    return event.price_max && event.price_max !== event.price_min
      ? `$${event.price_min}–$${event.price_max}`
      : `$${event.price_min}`;
  }
  return null;
}

/**
 * Format a date string to include the day of week.
 * Accepts YYYY-MM-DD or any parseable date string.
 * Returns e.g. "Sat, Mar 29, 2025" or the original string if it can't be parsed.
 */
export function formatDateWithWeekday(dateStr) {
  if (!dateStr) return null;
  // Try parsing as YYYY-MM-DD first (treat as local date to avoid UTC shift)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let d;
  if (isoMatch) {
    d = new Date(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10) - 1,
      parseInt(isoMatch[3], 10),
    );
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-CA', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
