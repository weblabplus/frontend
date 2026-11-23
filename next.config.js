/** @type {import('next').NextConfig} */
const DEPLOYED_API_URL = 'https://medilab-api.onrender.com/api';

const LOCAL_API_URL = 'http://localhost:3001/api';

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
const isVercel = Boolean(process.env.VERCEL);
const pointsToLocalhost = /:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(apiUrl);

// Το NEXT_PUBLIC_API_URL «ψήνεται» στο bundle κατά το build. Σε Vercel λοιπόν δεν έχει
// νόημα η τιμή του .env.local: αν λείπει ή δείχνει σε localhost, χρησιμοποιούμε το
// deployed backend. Έτσι μια λάθος environment variable δεν σπάει ποτέ το deployment.
let effectiveApiUrl = apiUrl;
if (isVercel && (!apiUrl || pointsToLocalhost)) {
  console.warn(
    `[next.config] NEXT_PUBLIC_API_URL=${apiUrl || '(κενό)'} δεν είναι προσβάσιμο από τον browser· ` +
      `χρησιμοποιείται ${DEPLOYED_API_URL}. Διόρθωσε την Environment Variable στο Vercel και κάνε Redeploy.`
  );
  effectiveApiUrl = DEPLOYED_API_URL;
}

// Τοπικά (next dev / next start) μένει ό,τι ορίζει το .env.local — ή το default του api.ts.
if (!effectiveApiUrl) effectiveApiUrl = LOCAL_API_URL;

module.exports = {
  env: { NEXT_PUBLIC_API_URL: effectiveApiUrl },
};
