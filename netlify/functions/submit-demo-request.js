'use strict';

// submit-demo-request.js — FlowDesk Pro Auto-Attendant
// Handles demo request form submissions.
// Saves to Supabase, sends owner + user emails, sends SMS if consented.

const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const TWILIO_COMPLIANCE = '\nReply STOP to unsubscribe. Reply HELP for help. Msg & data rates may apply. AI4 Businesses aiflowdeskpro.com';

function jsonRes(statusCode, payload) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(payload) };
}

function safe(v, fb = '') { return (v === null || v === undefined) ? fb : String(v).trim(); }
function esc(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safe(v).toLowerCase()); }
function asConsent(v) { return v === 'yes' || v === true || v === 1 || String(v).toLowerCase() === 'true'; }

function httpsPost(urlStr, headers, body) {
  const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
      headers: { ...headers, 'Content-Length': buf.length } }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Timeout')));
    req.write(buf);
    req.end();
  });
}

async function supabaseInsert(table, record) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  const res = await httpsPost(`${url.replace(/\/$,'')}/rest/v1/${table}`, {
    apikey: key, Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json', Prefer: 'return=representation',
  }, record);
  if (res.status < 200 || res.status >= 300) throw new Error(`Supabase ${res.status}: ${res.body}`);
  try { const d = JSON.parse(res.body); return Array.isArray(d) ? d[0] : d; } catch { return {}; }
}

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  await httpsPost('https://api.resend.com/emails', {
    Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
  }, {
    from: process.env.RESEND_FROM_EMAIL || 'FlowDesk Pro <notifications@aiflowdeskpro.com>',
    to, subject, html,
  });
}

async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER || '+17253305102';
  if (!sid || !token || !to) return;
  const payload = new URLSearchParams({ To: to, From: from, Body: body + TWILIO_COMPLIANCE }).toString();
  await httpsPost(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
    'Content-Type': 'application/x-www-form-urlencoded',
  }, payload);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return jsonRes(405, { ok: false, error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '{}')); }
  catch { return jsonRes(400, { ok: false, error: 'Invalid JSON' }); }

  const businessName = safe(body.business_name);
  const contactName  = safe(body.contact_name);
  const phone        = safe(body.phone);
  const email        = safe(body.email).toLowerCase();
  const smsConsent   = asConsent(body.sms_consent);
  const demoSite     = safe(body.demo_site, 'auto-attendant.aiflowdeskpro.com');
  const firstName    = contactName.split(' ')[0] || 'there';

  if (!businessName) return jsonRes(400, { ok: false, error: 'business_name is required' });
  if (!contactName)  return jsonRes(400, { ok: false, error: 'contact_name is required' });
  if (!phone || phone.replace(/\D/g,'').length < 10) return jsonRes(400, { ok: false, error: 'Valid phone is required' });
  if (!email || !isEmail(email)) return jsonRes(400, { ok: false, error: 'Valid email is required' });

  let leadId = null;

  // Save to Supabase
  try {
    const inserted = await supabaseInsert('demo_requests', {
      business_name: businessName,
      contact_name: contactName,
      phone,
      email,
      sms_consent: smsConsent,
      demo_site: demoSite,
      created_at: new Date().toISOString(),
    });
    leadId = inserted?.id || null;
  } catch (err) {
    console.error('[auto-attendant submit-demo-request] Supabase:', err.message);
  }

  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL || 'jmitchell@aproposgroupllc.com';

  // Owner email
  try {
    await sendEmail({
      to: ownerEmail,
      subject: `New Auto-Attendant Demo: ${businessName}`,
      html: `<div style="font-family:Arial,sans-serif;background:#07111f;color:#f5f8ff;padding:28px;border-radius:16px;max-width:600px;margin:0 auto">
        <div style="color:#4F6EF7;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;margin-bottom:14px">FlowDesk Pro — Auto-Attendant Demo</div>
        <h2 style="color:#fff;margin:0 0 12px">New Demo Request: ${esc(businessName)}</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:7px;color:#90A3BC;width:120px">Name</td><td style="padding:7px;color:#fff">${esc(contactName)}</td></tr>
          <tr><td style="padding:7px;color:#90A3BC">Email</td><td style="padding:7px;color:#4F6EF7">${esc(email)}</td></tr>
          <tr><td style="padding:7px;color:#90A3BC">Phone</td><td style="padding:7px;color:#fff">${esc(phone)}</td></tr>
          <tr><td style="padding:7px;color:#90A3BC">SMS Consent</td><td style="padding:7px;color:${smsConsent ? '#55E6A5' : '#90A3BC'}">${smsConsent ? 'Yes' : 'No'}</td></tr>
        </table>
      </div>`,
    });
  } catch (err) { console.error('Owner email failed:', err.message); }

  // User confirmation email
  try {
    await sendEmail({
      to: email,
      subject: `Your FlowDesk Pro Auto-Attendant demo is confirmed`,
      html: `<div style="font-family:Arial,sans-serif;background:#07111f;color:#f5f8ff;padding:32px;border-radius:16px;max-width:560px;margin:0 auto">
        <div style="color:#4F6EF7;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:800;margin-bottom:18px">FlowDesk Pro Smart Auto-Attendant</div>
        <h2 style="color:#fff;margin:0 0 10px">Demo confirmed, ${esc(firstName)}.</h2>
        <p style="color:#a8b8d0;line-height:1.75;margin-bottom:20px">We've received your demo request for <strong style="color:#4F6EF7">${esc(businessName)}</strong>. Our team will be in touch within one business day.</p>
        <a href="https://auto-attendant.aiflowdeskpro.com" style="display:inline-block;background:linear-gradient(135deg,#4F6EF7,#7C3AED);color:#fff;font-weight:700;text-decoration:none;border-radius:10px;padding:13px 22px;font-size:13px">Explore Auto-Attendant →</a>
        <p style="font-size:11px;color:#586880;margin-top:22px">FlowDesk Pro · Apropos Group LLC · Las Vegas, NV</p>
      </div>`,
    });
  } catch (err) { console.error('User email failed:', err.message); }

  // SMS if consented
  if (smsConsent && phone) {
    try {
      await sendSms(phone, `Hi ${firstName}, your FlowDesk Pro Smart Auto-Attendant demo for ${businessName} is confirmed. We'll reach out within one business day.`);
    } catch (err) { console.error('SMS failed:', err.message); }
  }

  return jsonRes(200, { ok: true, lead_id: leadId });
};
