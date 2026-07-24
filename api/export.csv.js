// api/export.csv.js
// Vercel Serverless Function – generate a CSV of the schedule data
// The function uses the same auth & role checks as /api/schedule.get and
// respects Supabase RLS, so the CSV only contains rows the caller may see.

const { verifyIdToken } = require('./auth.verify');
const { getUserInfo } = require('./role.check');
const { createClient } = require('@supabase/supabase-js');
const { createObjectCsvStringifier } = require('csv-writer');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function isAllowed(role) {
  const allowed = ['admin', 'director', 'pm', 'sup', 'hr']; // BA excluded
  return allowed.includes(role);
}

module.exports = async (req, res) => {
  try {
    // 1️⃣ Verify Firebase ID token
    const { uid } = await verifyIdToken(req);

    // 2️⃣ Get role & scopes
    const userInfo = await getUserInfo(uid);
    const { role } = userInfo;
    if (!isAllowed(role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // 3️⃣ Query schedule (RLS will filter rows automatically)
    const { data, error } = await supabase.from('schedule').select('*');
    if (error) throw new Error('Supabase error: ' + error.message);

    // 4️⃣ Build CSV string
    // Determine columns from the first row (if any)
    const columns = data.length
      ? Object.keys(data[0]).map((key) => ({ id: key, title: key }))
      : [];
    const csvStringifier = createObjectCsvStringifier({ header: columns });
    const header = csvStringifier.getHeaderString();
    const records = csvStringifier.stringifyRecords(data);
    const csvContent = header + records;

    // 5️⃣ Set headers & stream CSV back
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="schedule_${uid}.csv"`
    );
    res.status(200).send(csvContent);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: e.message || 'Internal server error' });
  }
};
