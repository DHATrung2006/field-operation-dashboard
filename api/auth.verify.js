// api/auth.verify.js
// Vercel Serverless Function – verify Firebase ID token and return UID

const firebaseAdmin = require('firebase-admin');
const admin = firebaseAdmin.default || firebaseAdmin;

// Initialize Firebase Admin only once. On Vercel, set FIREBASE_SERVICE_ACCOUNT
// to the JSON service-account object (kept server-side as an environment secret).
if (!admin.getApps().length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      admin.initializeApp({ credential: admin.cert(serviceAccount) });
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ.');
    }
  } else {
    admin.initializeApp({ credential: admin.applicationDefault() });
  }
}

/**
 * Middleware‑style helper used by other API routes.
 * Expects `Authorization: Bearer <ID_TOKEN>` header.
 * Returns an object { uid, token } on success or throws an error.
 */
async function verifyIdToken(req) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    const err = new Error('Missing or malformed Authorization header');
    err.status = 401;
    throw err;
  }
  const idToken = match[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return { uid: decoded.uid, token: decoded };
  } catch (e) {
    const err = new Error('Invalid Firebase ID token');
    err.status = 401;
    throw err;
  }
}

module.exports = { verifyIdToken };
