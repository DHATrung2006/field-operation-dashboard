// api/schedule.get.js
// Vercel Serverless Function – return schedule data respecting RBAC & RLS

const { verifyIdToken } = require('./auth.verify');
const { getUserInfo } = require('./role.check');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Helper to check whether a user with given role & scopes is allowed
 * to access schedule data. Returns true/false. The actual row‑level
 * restriction is enforced by Supabase RLS, but we also block the call
 * for roles that have no permission at all (e.g., BA).
 */
function isAllowed(role) {
  const allowed = ['admin', 'director', 'pm', 'sup', 'hr']; // BA excluded
  return allowed.includes(role);
}

module.exports = async (req, res) => {
  try {
    // 1️⃣ Verify Firebase token
    const { uid } = await verifyIdToken(req);

    // 2️⃣ Fetch role & scopes from Supabase `users` table
    const userInfo = await getUserInfo(uid);
    const { role } = userInfo;

    // 3️⃣ Quick deny if role not permitted at all
    if (!isAllowed(role)) {
      res.status(403).json({ error: 'Forbidden: role not allowed to read schedule' });
      return;
    }

    // 4️⃣ Query schedule – RLS will automatically filter rows based on
    //    the policies we set in Supabase (they can reference auth.uid).
    const { data, error } = await supabase.from('schedule').select('*');
    if (error) {
      throw new Error('Supabase query error: ' + error.message);
    }

    res.status(200).json({ schedule: data, role, scopes: userInfo });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: e.message || 'Internal server error' });
  }
};
