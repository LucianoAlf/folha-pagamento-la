import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const GEMINI_PRIMARY_MODEL_ID = "gemini-3-flash-preview";
export const GEMINI_FALLBACK_MODEL_ID = "gemini-2.5-flash";

export type GeminiCallResult = { text: string; modelUsed: string };

export type GeminiGenerationConfig = {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
};

type SupabaseAdminClient = ReturnType<typeof createClient>;

export function createServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service environment is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getSecretFromVault(supabaseAdmin: SupabaseAdminClient, name: string) {
  const { data, error } = await supabaseAdmin.rpc("get_vault_secret", {
    secret_name: name,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function getSecret(supabaseAdmin: SupabaseAdminClient, name: string) {
  const env = Deno.env.get(name);
  if (env && env.trim()) return env.trim();
  const fromVault = await getSecretFromVault(supabaseAdmin, name);
  if (fromVault && String(fromVault).trim()) return String(fromVault).trim();
  throw new Error(`${name} não configurado (Secrets ou Vault).`);
}

export async function getGeminiApiKey(supabaseAdmin?: SupabaseAdminClient) {
  const client = supabaseAdmin ?? createServiceClient();
  return getSecret(client, "GEMINI_API_KEY");
}

export async function callGeminiOnce(
  prompt: string,
  geminiKey: string,
  modelId: string,
  options?: { timeoutMs?: number; generationConfig?: GeminiGenerationConfig },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("gemini-timeout"), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options?.generationConfig?.temperature ?? 0.2,
            topP: options?.generationConfig?.topP ?? 0.9,
            topK: options?.generationConfig?.topK,
            maxOutputTokens: options?.generationConfig?.maxOutputTokens ?? 2048,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Gemini API error (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Gemini API timeout after ${timeoutMs}ms`);
    }
    if (err instanceof Error && err.message === "gemini-timeout") {
      throw new Error(`Gemini API timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function shouldTryFallbackModel(error: unknown) {
  const msg = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return (
    msg.includes("not found") ||
    msg.includes("not_found") ||
    msg.includes("models/") ||
    msg.includes("invalid model") ||
    msg.includes("model is not") ||
    (msg.includes("gemini api error") && msg.includes("404"))
  );
}

export async function callGeminiWithFallback(
  prompt: string,
  geminiKey: string,
  options?: { timeoutMs?: number; generationConfig?: GeminiGenerationConfig },
): Promise<GeminiCallResult> {
  try {
    const text = await callGeminiOnce(prompt, geminiKey, GEMINI_PRIMARY_MODEL_ID, options);
    return { text, modelUsed: GEMINI_PRIMARY_MODEL_ID };
  } catch (error) {
    if (!shouldTryFallbackModel(error)) throw error;
    console.warn(
      `[gemini] Primary model failed (${GEMINI_PRIMARY_MODEL_ID}), trying fallback (${GEMINI_FALLBACK_MODEL_ID})`,
    );
    const text = await callGeminiOnce(prompt, geminiKey, GEMINI_FALLBACK_MODEL_ID, options);
    return { text, modelUsed: GEMINI_FALLBACK_MODEL_ID };
  }
}

export function stripCodeFences(input: string): string {
  let s = (input || "").trim();
  s = s.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/g, "").trim();
  return s;
}

export function safeParseJsonFromText(text: string): unknown {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
