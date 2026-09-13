/**
 * Single source of truth for the Groq model the platform calls.
 *
 * Groq periodically retires or Enterprise-gates model names (this constant
 * exists because "llama-3.3-70b-versatile" and before it "llama3-8b-8192" were
 * silently decommissioned/gated, breaking every AI feature at once). Keeping the
 * model in ONE place — overridable via the GROQ_MODEL env var — means the next
 * change is a single edit, not a hunt across nine files.
 *
 * Default: openai/gpt-oss-120b — a current Groq Production model with public
 * (non-Enterprise) pricing, 131k context and strong quality. Override in .env
 * with GROQ_MODEL=<id> if your key prefers another available model (confirm the
 * id via: GET https://api.groq.com/openai/v1/models).
 */
export const GROQ_MODEL: string = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

/** Groq's OpenAI-compatible chat-completions endpoint. */
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
