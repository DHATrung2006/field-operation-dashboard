// api/auth.verify.js
// Vercel Serverless Function – verify Firebase ID token and return UID

const admin = require('firebase-admin');

// Initialize Firebase Admin only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
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
