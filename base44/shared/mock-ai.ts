/** When the SKIP_AI secret is set to "true", AI-calling functions return canned data
 * instead of making a real (credit-metered) model call. Used only for verifying a
 * function's surrounding logic (auth, membership checks, entity writes, error
 * handling) after code changes — never for the user's own real usage. Toggle via
 * `base44 secrets set SKIP_AI true` / `base44 secrets delete SKIP_AI`. */
export function skipAi(): boolean {
  return Deno.env.get("SKIP_AI") === "true";
}
