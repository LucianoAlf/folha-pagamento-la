import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ensureEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function decodeBase64(b64: string): Uint8Array {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type GeminiImagePart =
  | { inlineData?: { mimeType?: string; data?: string } }
  | { text?: string };

async function generateImageBase64(args: { apiKey: string; model: string; prompt: string }) {
  // Observação: modelos de imagem podem variar; mantemos parser robusto de inlineData.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent?key=${args.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: args.prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.35,
        topP: 0.9,
        maxOutputTokens: 1024,
        // Alguns modelos suportam imagem via responseModalities
        responseModalities: ["IMAGE", "TEXT"],
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini API error: ${res.status} ${txt?.slice?.(0, 300) || ""}`);
  }

  const data = await res.json();
  const parts: GeminiImagePart[] = data?.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((p: any) => !!p?.inlineData?.data) as any;
  if (!inline?.inlineData?.data) {
    // fallback: alguns modelos retornam base64 dentro de texto (raro). Mantemos debug mínimo.
    const text = parts.find((p: any) => typeof p?.text === "string") as any;
    throw new Error(
      `No inline image returned by model. Parts keys: ${parts.map((p: any) => Object.keys(p || {}).join(",")).join(" | ")}; text: ${
        (text?.text || "").slice(0, 140)
      }`
    );
  }
  const mimeType = inline?.inlineData?.mimeType || "image/png";
  const b64 = inline?.inlineData?.data as string;
  return { mimeType, b64 };
}

async function generateWithFallbackModels(args: { apiKey: string; prompt: string; preferredModel?: string }) {
  const candidates = [
    args.preferredModel,
    // comuns para setups "preview/exp" (podem variar por projeto/conta)
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-exp-image-generation",
    "gemini-2.0-flash-image-generation",
    // alguns projetos chamam assim
    "gemini-3-flash-preview-image-generation",
  ].filter(Boolean) as string[];

  const errors: string[] = [];
  for (const m of candidates) {
    try {
      const out = await generateImageBase64({ apiKey: args.apiKey, model: m, prompt: args.prompt });
      return { ...out, model: m };
    } catch (e: any) {
      errors.push(`${m}: ${e?.message || "error"}`);
    }
  }

  throw new Error(`Nenhum modelo de imagem respondeu com inlineData. Detalhes: ${errors.slice(0, 6).join(" | ")}`);
}

async function downloadPhotoFromUnsplash(query: string) {
  // Sem key (MVP): Unsplash Source faz redirect para uma foto real.
  // Obs: é conteúdo público e pode variar; nós salvamos no Storage para ficar estável.
  const q = encodeURIComponent(query.trim().replace(/\s+/g, ","));
  const url = `https://source.unsplash.com/1920x1080/?${q}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Unsplash error: ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  const ext = contentType.includes("png") ? "png" : "jpg";
  return { bytes, contentType, ext, sourceUrl: res.url };
}

async function downloadPhotoWithFallback(query: string) {
  try {
    return await downloadPhotoFromUnsplash(query);
  } catch (e: any) {
    // Fallback para fotos reais sem API key (não tem busca por termo, mas evita ficar indisponível).
    const seed = crypto.randomUUID();
    const url = `https://picsum.photos/seed/${seed}/1920/1080`;
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`${e?.message || "Unsplash failed"} | Picsum error: ${res.status}`);
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = contentType.includes("png") ? "png" : "jpg";
    return { bytes, contentType, ext, sourceUrl: res.url };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization header" }, 401);

    const SUPABASE_URL = ensureEnv("SUPABASE_URL");
    const SUPABASE_ANON_KEY = ensureEnv("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = ensureEnv("SUPABASE_SERVICE_ROLE_KEY");
    const GEMINI_API_KEY = ensureEnv("GEMINI_API_KEY");

    // Valida usuário (JWT)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Invalid token" }, 401);

    const body = await req.json().catch(() => ({}));
    const promptUser = String(body?.prompt || "").trim();
    if (!promptUser) return jsonResponse({ error: "prompt is required" }, 400);

    const style = String(body?.style || "landscape").trim();
    const provider = String(body?.provider || "photo").trim(); // photo | gemini
    const model = String(body?.model || "").trim();

    let bytes: Uint8Array;
    let mimeType: string;
    let ext: string;
    let usedModel: string | null = null;
    let sourceUrl: string | null = null;

    if (provider === "photo") {
      // Fotos reais
      const out = await downloadPhotoWithFallback(promptUser);
      bytes = out.bytes;
      mimeType = out.contentType;
      ext = out.ext;
      sourceUrl = out.sourceUrl;
    } else {
      // IA (fallback)
      const systemPrompt = [
        "Você é um gerador de imagens para fundos de aplicativo (Agenda).",
        "Requisitos:",
        "- Gere UMA imagem (sem texto, sem letras, sem logotipos, sem marcas d'água).",
        "- Estilo: fotográfico realista (DSLR), sem aparência de ilustração.",
        "- Priorize legibilidade: contraste moderado, sem áreas brancas estouradas.",
        "- Formato ideal: 16:9 (background de desktop).",
        "- Não inclua pessoas com rostos reconhecíveis.",
        "",
        `Tema: ${style}`,
        `Pedido do usuário: ${promptUser}`,
        "",
        "Retorne a imagem no formato inlineData.",
      ].join("\n");

      const out = await generateWithFallbackModels({
        apiKey: GEMINI_API_KEY,
        preferredModel: model || undefined,
        prompt: systemPrompt,
      });
      mimeType = out.mimeType;
      bytes = decodeBase64(out.b64);
      ext = mimeType.includes("png") ? "png" : "jpg";
      usedModel = out.model;
    }

    // Upload via service role
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const userId = userData.user.id;
    const key = `users/${userId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await admin.storage.from("agenda-backgrounds").upload(key, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: pub } = admin.storage.from("agenda-backgrounds").getPublicUrl(key);
    const publicUrl = pub?.publicUrl || null;
    if (!publicUrl) throw new Error("Failed to build public URL");

    return jsonResponse({
      ok: true,
      key,
      publicUrl,
      mimeType,
      model: usedModel,
      provider,
      sourceUrl,
    });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || "Unexpected error" }, 500);
  }
});

