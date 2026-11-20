// Firestore and Auth admin handles, created on first use so cold starts stay fast.

let cached = null;

function admin() {
  if (!cached) {
    const { initializeApp, getApps } = require('firebase-admin/app');
    // Look for the default app by name: the functions runtime can create named apps of its own.
    if (!getApps().some((a) => a.name === '[DEFAULT]')) initializeApp();
    const firestore = require('firebase-admin/firestore');
    const { getAuth } = require('firebase-admin/auth');
    cached = {
      db: firestore.getFirestore(),
      FieldValue: firestore.FieldValue,
      auth: getAuth(),
    };
  }
  return cached;
}

module.exports = { admin };
