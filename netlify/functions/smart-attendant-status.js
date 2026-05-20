// netlify/functions/smart-attendant-status.js
// FlowDesk Pro — Smart Auto-Attendant Status Callback
// Handles Twilio call status webhooks; updates Supabase, fires Resend email alert

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_TO_EMAIL = process.env.RESEND_TO_EMAIL || "support@aproposgroupllc.com";
const ALERT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "alerts@aiflowdeskpro.com";

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseBody(body) {
  const params = {};
  if (!body) return params;
  body.split("&").forEach((pair) => {
    const [k, v] = pair.split("=").map(decodeURIComponent);
    params[k] = v;
  });
  return params;
}

function formatDuration(seconds) {
  const s = parseInt(seconds || "0", 10);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function formatPhone(number) {
  // Basic US formatting: +17025551234 → (702) 555-1234
  if (!number) return "Unknown";
  const digits = number.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return number;
}

// ─── Supabase Update ───────────────────────────────────────────────────────

async function updateCallLog(callSid, updates) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase
      .from("smart_attendant_logs")
      .upsert({ call_sid: callSid, ...updates }, { onConflict: "call_sid" })
      .select()
      .single();
    if (error) {
      console.error("[Supabase] update error:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[Supabase] unexpected error:", err);
    return null;
  }
}

// ─── Resend Email Alert ────────────────────────────────────────────────────

async function sendEmailAlert(callData) {
  if (!RESEND_API_KEY) {
    console.warn("[Resend] RESEND_API_KEY not set — skipping email alert");
    return;
  }

  const {
    caller_number,
    option_selected,
    routed_to,
    call_duration,
    status,
    created_at,
  } = callData;

  const deptMap = { "1": "Sales", "2": "Support", "3": "Billing" };
  const dept = deptMap[option_selected] || "N/A";
  const callerFormatted = formatPhone(caller_number);
  const durationFormatted = formatDuration(call_duration);
  const timestamp = created_at
    ? new Date(created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    : new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Smart Auto-Attendant Call Alert</title></head>
<body style="font-family:Inter,sans-serif;background:#0d1117;color:#e6edf3;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#161b22;border-radius:12px;border:1px solid #30363d;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#4F6EF7,#7C3AED);padding:24px 32px;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">
        📞 Smart Auto-Attendant — Call Completed
      </h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">FlowDesk Pro · aiflowdeskpro.com</p>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px 0;color:#8b949e;font-size:13px;width:140px;">Caller</td>
          <td style="padding:10px 0;font-weight:600;font-size:15px;">${callerFormatted}</td>
        </tr>
        <tr style="border-top:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">Department</td>
          <td style="padding:10px 0;font-weight:600;">
            <span style="background:#4F6EF720;color:#4F6EF7;padding:3px 10px;border-radius:20px;font-size:13px;">
              ${dept} (Option ${option_selected || "N/A"})
            </span>
          </td>
        </tr>
        <tr style="border-top:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">Routed To</td>
          <td style="padding:10px 0;font-weight:600;font-size:14px;">${routed_to || "Not connected"}</td>
        </tr>
        <tr style="border-top:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">Duration</td>
          <td style="padding:10px 0;font-weight:600;">${durationFormatted}</td>
        </tr>
        <tr style="border-top:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">Status</td>
          <td style="padding:10px 0;font-weight:600;text-transform:capitalize;">${status || "completed"}</td>
        </tr>
        <tr style="border-top:1px solid #21262d;">
          <td style="padding:10px 0;color:#8b949e;font-size:13px;">Time (PST)</td>
          <td style="padding:10px 0;font-size:13px;color:#8b949e;">${timestamp}</td>
        </tr>
      </table>
    </div>
    <div style="padding:16px 32px;background:#0d1117;border-top:1px solid #21262d;">
      <p style="margin:0;font-size:12px;color:#484f58;">
        FlowDesk Pro Smart Auto-Attendant · <a href="https://aiflowdeskpro.com" style="color:#4F6EF7;text-decoration:none;">aiflowdeskpro.com</a>
        · <a href="mailto:support@aproposgroupllc.com" style="color:#4F6EF7;text-decoration:none;">support@aproposgroupllc.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ALERT_FROM_EMAIL,
        to: [ALERT_TO_EMAIL],
        subject: `📞 Smart Auto-Attendant Call — ${callerFormatted} → ${dept}`,
        html,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[Resend] email error:", JSON.stringify(data));
    } else {
      console.log("[Resend] email sent:", data.id);
    }
  } catch (err) {
    console.error("[Resend] fetch error:", err);
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // Twilio status callbacks always use POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = parseBody(event.body || "");

    const callSid = body.CallSid || "unknown";
    const callStatus = body.CallStatus || "unknown";
    const callDuration = parseInt(body.CallDuration || "0", 10);
    const callerNumber = body.From || body.Caller || "Unknown";
    const timestamp = new Date().toISOString();

    console.log(
      `[smart-attendant-status] SID=${callSid} status=${callStatus} duration=${callDuration}s caller=${callerNumber}`
    );

    // Update the Supabase record with final status + duration
    const updated = await updateCallLog(callSid, {
      caller_number: callerNumber,
      call_duration: callDuration,
      status: callStatus,
      created_at: timestamp,
    });

    // Fire email alert on completed calls
    if (callStatus === "completed" && updated) {
      await sendEmailAlert(updated);
    }

    // Twilio expects a 204 or 200 with empty body for status callbacks
    return { statusCode: 204, body: "" };
  } catch (err) {
    console.error("[smart-attendant-status] fatal error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
