// Προσωπικό link online ραντεβού: <booking-url>?ref=<token>

const BOOKING_URL = (process.env.NEXT_PUBLIC_BOOKING_URL || '').trim();

export function getBookingAppUrl(): string {
  return BOOKING_URL;
}

export function buildBookingLink(token?: string | null): string {
  if (!BOOKING_URL) return '';
  if (!token) return BOOKING_URL;
  const separator = BOOKING_URL.includes('?') ? '&' : '?';
  return `${BOOKING_URL}${separator}ref=${encodeURIComponent(token)}`;
}
