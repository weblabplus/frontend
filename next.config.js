/** @type {import('next').NextConfig} */
const DEPLOYED_API_URL = 'https://medilab-api.onrender.com/api';

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim();
const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === 'production' : isVercel;
const pointsToLocalhost = /:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(apiUrl);

// Το NEXT_PUBLIC_API_URL «ψήνεται» στο bundle κατά το build. Αν σε production deploy
// δείχνει σε localhost, ο browser θα αποτυγχάνει σε κάθε κλήση (CORS / ERR_CONNECTION_REFUSED),
// οπότε σταματάμε το build αντί να ανεβάσουμε σπασμένο site.
if (isProduction && pointsToLocalhost) {
  throw new Error(
    `NEXT_PUBLIC_API_URL points to localhost (${apiUrl}). ` +
      `Set it to the deployed backend, e.g. ${DEPLOYED_API_URL}, in the Vercel environment variables.`
  );
}

// Αν στο Vercel δεν έχει οριστεί καθόλου, χρησιμοποιούμε το deployed backend ώστε το
// deployment να δουλεύει χωρίς επιπλέον ρύθμιση. Τοπικά μένει το default του api.ts.
const effectiveApiUrl = apiUrl || (isVercel ? DEPLOYED_API_URL : '');

module.exports = {
  env: effectiveApiUrl ? { NEXT_PUBLIC_API_URL: effectiveApiUrl } : {},
};
