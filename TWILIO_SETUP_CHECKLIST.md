# Twilio Console Setup Checklist
## FlowDesk Pro — Smart Auto-Attendant
**Demo Number:** (702) 710-2622  
**Webhook Base:** `https://aiflowdeskpro.com/.netlify/functions`

---

## Step 1 — Log Into Twilio Console

1. Go to [https://console.twilio.com](https://console.twilio.com)
2. Sign in with your Twilio account credentials
3. Make sure you are in the correct **Account** (check the account name top-left)

---

## Step 2 — Locate Your Phone Number

1. In the left sidebar, go to **Phone Numbers → Manage → Active Numbers**
2. Find **(702) 710-2622** in the list
3. Click the number to open its configuration page

---

## Step 3 — Configure the Voice Webhook

On the number's configuration page, scroll to the **Voice Configuration** section:

| Field | Value |
|---|---|
| **Configure with** | Webhook, TwiML Bin, Function, Studio Flow, or Proxy Service |
| **A call comes in** | `Webhook` |
| **URL** | `https://aiflowdeskpro.com/.netlify/functions/smart-attendant` |
| **HTTP Method** | `POST` |

> ⚠️ Make sure the URL does **not** have a trailing slash.

---

## Step 4 — Configure the Status Callback

Still on the same number configuration page, find the **Call Status Changes** field (sometimes labeled **Status Callback URL**):

| Field | Value |
|---|---|
| **Status Callback URL** | `https://aiflowdeskpro.com/.netlify/functions/smart-attendant-status` |
| **HTTP Method** | `POST` |

> This fires when any call on this number changes status (ringing → in-progress → completed).

---

## Step 5 — Save Configuration

1. Scroll to the bottom of the number configuration page
2. Click **Save Configuration**
3. You should see a green confirmation banner

---

## Step 6 — Verify Netlify Environment Variables

In your **Netlify Dashboard → Site Settings → Environment Variables**, confirm the following are set:

| Variable | Required By |
|---|---|
| `SUPABASE_URL` | smart-attendant.js, smart-attendant-status.js |
| `SUPABASE_SERVICE_KEY` | smart-attendant.js, smart-attendant-status.js |
| `SUPABASE_PUBLISHABLE_KEY` | smart-attendant-demo.html (client-side) |
| `RESEND_API_KEY` | smart-attendant-status.js |
| `RESEND_FROM_EMAIL` | smart-attendant-status.js |
| `RESEND_TO_EMAIL` | smart-attendant-status.js |
| `TWILIO_ACCOUNT_SID` | Reference / future use |
| `TWILIO_AUTH_TOKEN` | Reference / future use |
| `TWILIO_ALERT_PHONE` | Reference / SMS alerts if added |

> After adding or changing env vars, trigger a **redeploy** in Netlify so the functions pick them up.

---

## Step 7 — Deploy & Verify Functions Are Live

1. In Netlify, go to **Functions** tab
2. Confirm you see:
   - `smart-attendant`
   - `smart-attendant-status`
3. If they do not appear, check that files are in `netlify/functions/` and redeploy

---

## Step 8 — Test the Configuration

### Option A — Call the number directly
1. Dial **(702) 710-2622** from any phone
2. You should hear: *"Thank you for calling FlowDesk Pro — Intelligent Workflow Automation…"*
3. Press **1**, **2**, or **3** and verify the call routes to the correct number
4. Press **9** to confirm the menu repeats
5. Stay silent for 10+ seconds twice to confirm the timeout / goodbye flow

### Option B — Twilio Test Tool
1. In Twilio Console, go to **Phone Numbers → Manage → Active Numbers**
2. Click the number → **Test** (if available in your plan)
3. Simulate an inbound call and observe the call flow

### Option C — Twilio Debugger
1. Go to **Monitor → Logs → Errors** in Twilio Console
2. Make a test call
3. If anything fails, errors and webhook logs appear here with full request/response details

---

## Step 9 — Verify Supabase Logging

1. Open your **Supabase Dashboard → Table Editor → smart_attendant_logs**
2. Make a test call
3. Confirm a new row appears with:
   - `caller_number` — your caller ID
   - `option_selected` — the digit you pressed
   - `routed_to` — the department + number
   - `status` — should update to `completed` after the call ends

---

## Step 10 — Verify Email Alerts

1. After a completed test call, check the inbox for `RESEND_TO_EMAIL`
2. You should receive an alert email within ~30 seconds of the call completing
3. If not received, check:
   - `RESEND_API_KEY` is set correctly in Netlify
   - `RESEND_FROM_EMAIL` is a verified sender domain in your Resend account
   - Netlify Function logs for `smart-attendant-status` (Functions tab → select function → Logs)

---

## Step 11 — Verify the Demo Page Live Feed

1. Open `https://aiflowdeskpro.com/smart-attendant-demo.html` (or wherever deployed)
2. Make a test call
3. Confirm the call row appears in the live log table within a few seconds
4. Confirm stats (Total Calls, Calls Today, Avg Duration) update correctly

---

## Quick Reference — URLs

| Purpose | URL |
|---|---|
| Main webhook (inbound call) | `https://aiflowdeskpro.com/.netlify/functions/smart-attendant` |
| Status callback | `https://aiflowdeskpro.com/.netlify/functions/smart-attendant-status` |
| Demo landing page | `https://aiflowdeskpro.com/smart-attendant-demo.html` |

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Call connects but no audio | Twilio webhook URL typo; function not deployed |
| Invalid option loops | Function deployed but Supabase env vars missing |
| No rows in Supabase | `SUPABASE_URL` or `SUPABASE_SERVICE_KEY` wrong |
| No email alert | `RESEND_API_KEY` wrong; from-domain not verified in Resend |
| Demo page shows "not configured" | `SUPABASE_PUBLISHABLE_KEY` not set or page not redeployed |
| Status callback not firing | Status Callback URL not saved in Twilio console |

---

*FlowDesk Pro · Smart Auto-Attendant · support@aproposgroupllc.com*
