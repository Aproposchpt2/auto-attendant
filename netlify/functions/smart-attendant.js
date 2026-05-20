// netlify/functions/smart-attendant.js
// FlowDesk Pro — Smart Auto-Attendant
// Handles inbound PSTN calls via Twilio, routes via DTMF, logs to Supabase

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ROUTING_TABLE = {
  "1": { label: "Sales",   number: "+17028245663" },
  "2": { label: "Support", number: "+18882445737" },
  "3": { label: "Billing", number: "+17753508039" },
};

const GREETING_TEXT =
  "Thank you for calling FlowDesk Pro — Intelligent Workflow Automation. " +
  "Please listen carefully as our options have changed. " +
  "For Sales, press 1. " +
  "For Support, press 2. " +
  "For our Billing department, press 3. " +
  "To repeat these options, press 9.";

const INVALID_TEXT =
  "I'm sorry, that is not a valid option. Please try again.";

const TIMEOUT_FINAL_TEXT =
  "We're sorry we missed you. Please call back during business hours. Goodbye.";

// ─── TwiML Builders ────────────────────────────────────────────────────────

function buildMenuTwiML(isRepeat = false) {
  const intro = isRepeat ? "" : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/.netlify/functions/smart-attendant?action=route" method="POST" timeout="10" finishOnKey="">
    <Say voice="Polly.Joanna" language="en-US">${escapeXml(GREETING_TEXT)}</Say>
  </Gather>
  <Redirect method="POST">/.netlify/functions/smart-attendant?action=timeout_first</Redirect>
</Response>`;
}

function buildRouteTwiML(digit, callerNumber, callSid) {
  const dest = ROUTING_TABLE[digit];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">Please hold while we connect your call.</Say>
  <Dial callerId="${escapeXml(callerNumber || "+17027102622")}" action="/.netlify/functions/smart-attendant?action=dial_complete&amp;digit=${digit}" method="POST">
    <Number statusCallbackEvent="completed" statusCallback="/.netlify/functions/smart-attendant-status">${dest.number}</Number>
  </Dial>
</Response>`;
}

function buildInvalidTwiML() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">${escapeXml(INVALID_TEXT)}</Say>
  <Redirect method="POST">/.netlify/functions/smart-attendant</Redirect>
</Response>`;
}

function buildTimeoutFirstTwiML() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/.netlify/functions/smart-attendant?action=route" method="POST" timeout="10" finishOnKey="">
    <Say voice="Polly.Joanna" language="en-US">${escapeXml(GREETING_TEXT)}</Say>
  </Gather>
  <Redirect method="POST">/.netlify/functions/smart-attendant?action=timeout_final</Redirect>
</Response>`;
}

function buildTimeoutFinalTwiML() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">${escapeXml(TIMEOUT_FINAL_TEXT)}</Say>
  <Hangup/>
</Response>`;
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── Supabase Logging ──────────────────────────────────────────────────────

async function logCall(data) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await supabase
      .from("smart_attendant_logs")
      .upsert(data, { onConflict: "call_sid" });
    if (error) console.error("[Supabase] log error:", error.message);
  } catch (err) {
    console.error("[Supabase] unexpected error:", err);
  }
}

// ─── Parse form-encoded body ───────────────────────────────────────────────

function parseBody(body) {
  const params = {};
  if (!body) return params;
  body.split("&").forEach((pair) => {
    const [k, v] = pair.split("=").map(decodeURIComponent);
    params[k] = v;
  });
  return params;
}

// ─── Handler ───────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = { "Content-Type": "text/xml" };

  try {
    const qs = event.queryStringParameters || {};
    const action = qs.action || "menu";
    const body = parseBody(event.body || "");

    const callerNumber = body.From || body.Caller || "Unknown";
    const callSid = body.CallSid || "unknown";
    const digit = body.Digits || qs.digit || "";

    // Log the initial call (upsert so later steps update the same row)
    if (action === "menu") {
      await logCall({
        call_sid: callSid,
        caller_number: callerNumber,
        option_selected: null,
        routed_to: null,
        call_duration: null,
        status: "answered",
      });
      return { statusCode: 200, headers, body: buildMenuTwiML() };
    }

    if (action === "route") {
      if (digit === "9") {
        return { statusCode: 200, headers, body: buildMenuTwiML(true) };
      }
      if (ROUTING_TABLE[digit]) {
        const dest = ROUTING_TABLE[digit];
        await logCall({
          call_sid: callSid,
          caller_number: callerNumber,
          option_selected: digit,
          routed_to: dest.label + " " + dest.number,
          status: "routing",
        });
        return {
          statusCode: 200,
          headers,
          body: buildRouteTwiML(digit, callerNumber, callSid),
        };
      }
      // Invalid digit
      return { statusCode: 200, headers, body: buildInvalidTwiML() };
    }

    if (action === "dial_complete") {
      const dialStatus = body.DialCallStatus || "unknown";
      const duration = parseInt(body.DialCallDuration || "0", 10);
      const routedDigit = qs.digit || digit;
      const dest = ROUTING_TABLE[routedDigit];
      await logCall({
        call_sid: callSid,
        caller_number: callerNumber,
        option_selected: routedDigit,
        routed_to: dest ? dest.label + " " + dest.number : "Unknown",
        call_duration: duration,
        status: dialStatus,
      });
      // After dial completes, hang up gracefully
      return {
        statusCode: 200,
        headers,
        body: `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
      };
    }

    if (action === "timeout_first") {
      return { statusCode: 200, headers, body: buildTimeoutFirstTwiML() };
    }

    if (action === "timeout_final") {
      await logCall({
        call_sid: callSid,
        caller_number: callerNumber,
        option_selected: null,
        routed_to: null,
        status: "no_input",
      });
      return { statusCode: 200, headers, body: buildTimeoutFinalTwiML() };
    }

    // Fallback — serve menu
    return { statusCode: 200, headers, body: buildMenuTwiML() };
  } catch (err) {
    console.error("[smart-attendant] fatal error:", err);
    return {
      statusCode: 200,
      headers,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We're experiencing technical difficulties. Please try your call again. Goodbye.</Say>
  <Hangup/>
</Response>`,
    };
  }
};
