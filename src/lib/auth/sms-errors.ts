/**
 * Why a text message could not be sent, in words the site owner can act on.
 *
 * When Supabase fails to send a sign-in code it passes on the SMS provider's
 * own error, for example:
 *   "Error sending confirmation OTP to provider: The number +1… is unverified.
 *    Trial accounts cannot send messages to unverified numbers … More
 *    information: https://www.twilio.com/docs/errors/21608"
 * The number at the end identifies the cause. The common ones are translated
 * below; anything else is shown in the provider's own words.
 */

/** Twilio error number → what it means and what to do. */
const TWILIO_REASONS: Record<number, string> = {
  20003:
    "Twilio rejected the Account SID or Auth Token saved in Supabase. Copy both again from the Twilio Console home page into Supabase → Authentication → Phone. (This can also mean the Twilio account is suspended or out of credit.)",
  20008:
    "The Twilio details saved in Supabase are TEST credentials, which never send real texts. Use the live Account SID and Auth Token.",
  20404:
    "Twilio could not find the service. If the provider in Supabase is \"Twilio Verify\", the Service SID must start with VA and come from this same Twilio account. If it is plain \"Twilio\", it needs a Messaging Service SID (starts with MG) instead; switching the provider to Twilio Verify is the simpler fix.",
  21211: "Twilio says that phone number is not valid.",
  21408:
    "Your Twilio account is not allowed to text this country. In Twilio: Messaging → Settings → Geo permissions, enable United States.",
  21608:
    "Your Twilio account is still a trial, which can only text numbers you have verified in Twilio. Upgrade the Twilio account (add a payment method), or add this number under Phone Numbers → Verified Caller IDs.",
  21610: "This phone number replied STOP to this sender in the past. Text START to the sender's number to receive codes again.",
  21612: "Twilio cannot reach this number from the sender configured in Twilio.",
  21614: "That number cannot receive texts (it may be a landline).",
  21703: "The Twilio Messaging Service saved in Supabase has no phone number to send from. Simpler: switch the Supabase provider to Twilio Verify.",
  21704: "The Twilio Messaging Service saved in Supabase has no phone number to send from. Simpler: switch the Supabase provider to Twilio Verify.",
  21705: "The Messaging Service SID saved in Supabase is not valid. Simpler: switch the Supabase provider to Twilio Verify and use a Verify Service SID (starts with VA).",
  30032: "The toll-free sender number in Twilio has not been verified yet. Simpler: switch the Supabase provider to Twilio Verify.",
  30034:
    "US carriers block texts from unregistered numbers (\"A2P 10DLC\"). Either complete that registration in Twilio, or switch the Supabase provider to Twilio Verify, which does not need it.",
  60200: "Twilio did not accept the request. Check that the phone number is a real US mobile number.",
  60203: "Too many codes were requested for this number. Wait ten minutes and try again.",
  60205: "That number is a landline and cannot receive texts.",
  60223:
    "The SMS channel is switched off on your Twilio Verify service. In Twilio: Verify → Services → your service, enable SMS.",
  60410:
    "Twilio's Fraud Guard blocked texts to this number. In Twilio: Verify → Services → your service → Fraud Guard, review the blocked prefixes.",
  60605:
    "Twilio Verify is not allowed to text this country. In Twilio: Verify → Settings → Geo permissions, enable United States.",
};

/** Never put a phone number, a web address or an account identifier on the page. */
function tidy(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:AC|VA|MG|SM|VE)[0-9a-f]{32}\b/gi, "")
    .replace(/\+\d{10,15}|\(\d{3}\)\s?\d{3}-\d{4}|\b\d{10,11}\b/g, "that number")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function explainSmsFailure(message: string | null | undefined): string {
  const raw = (message ?? "").trim();
  const lead = "The text message could not be sent.";

  const code = Number(raw.match(/twilio\.com\/docs\/(?:api\/)?errors\/(\d{5})/i)?.[1] ?? NaN);
  if (TWILIO_REASONS[code]) return `${lead} Site owner: ${TWILIO_REASONS[code]} (Twilio error ${code})`;

  if (/unable to get sms provider|unsupported phone provider|sms provider/i.test(raw) && !/error sending/i.test(raw)) {
    return `${lead} Site owner: the Phone provider in Supabase is not fully set up. Open Authentication → Sign In / Providers → Phone, choose "Twilio Verify", fill in every field and save.`;
  }

  if (/dial tcp|no such host|timeout|deadline exceeded|connection refused|connection reset/i.test(raw)) {
    return `${lead} Supabase could not reach the SMS provider just now. Try again in a minute.`;
  }

  // Unknown cause: pass on the provider's own words, minus the wrapper and any link.
  const reason = tidy(
    raw
      .replace(/^.*?to provider:\s*/i, "")
      .replace(/\s*More information:.*$/i, ""),
  );
  const suffix = Number.isFinite(code) ? ` (Twilio error ${code})` : "";
  return reason ? `${lead} Site owner: the SMS provider said "${reason}"${suffix}.` : `${lead} Site owner: check the Phone provider settings in Supabase (README, step 4).`;
}
