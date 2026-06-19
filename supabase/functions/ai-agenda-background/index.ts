import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createServiceClient, getGeminiApiKey } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================================
// PROMPTS CINEMATOGRÁFICOS POR ESTILO
// ============================================================================

const STYLE_PROMPTS: Record<string, string> = {
  dashboard: `
    Cinematic wide-angle photograph of an abstract soundwave visualization,
    deep purple (#8b5cf6) and electric blue (#3b82f6) neon lights reflecting on glossy dark surface,
    bokeh light effects in background creating depth and atmosphere,
    shallow depth of field with tack-sharp foreground elements,
    moody atmospheric lighting inspired by Blade Runner 2049 cinematography,
    ultra high resolution with incredible micro-detail,
    photorealistic render quality, as if shot on Sony A7R IV with Zeiss lens,
    dark ambient mood with subtle light rays cutting through haze,
    premium tech aesthetic suitable for modern dashboard interface
  `,
  
  agenda: `
    Abstract aerial photograph of geometric calendar-like grid patterns,
    illuminated by soft purple (#8b5cf6) and indigo (#6366f1) LED strip lighting,
    glass and brushed chrome materials with sophisticated subtle reflections,
    futuristic minimalist aesthetic with clean lines and perfect symmetry,
    cinematic color grading with lifted blacks and teal shadows,
    dramatic side lighting creating long elegant shadows,
    8K resolution with extraordinary fine detail,
    photorealistic architectural photography style like Architectural Digest,
    dark moody atmosphere perfect for productivity application
  `,
  
  contas: `
    Macro photograph of abstract golden (#f59e0b) light trails dancing on dark obsidian surface,
    emerald (#10b981) accent reflections adding visual interest and depth,
    long exposure light painting effect creating flowing organic forms,
    luxurious premium aesthetic reminiscent of high-end finance advertisements,
    shallow depth of field with creamy beautiful bokeh balls,
    dark background with dramatic rim lighting highlighting edges,
    shot on Hasselblad medium format camera for ultimate detail and color depth,
    ultra sharp micro-details visible in highlights,
    sophisticated wealth aesthetic without being ostentatious
  `,
  
  folha: `
    Abstract photograph of interconnected geometric nodes and flowing lines,
    soft purple (#8b5cf6) and cyan (#06b6d4) bioluminescent ethereal glow,
    resembling neural network visualization or elegant constellation map,
    dark infinite space-like background with subtle colorful nebula wisps,
    ethereal and professional corporate aesthetic balancing warmth and technology,
    volumetric god rays and atmospheric scattering effects,
    ray tracing quality lighting with perfect caustics and reflections,
    8K photorealistic render with particle effects,
    representing human connections and organizational harmony
  `,
  
  login: `
    Cinematic photograph of grand piano keys in dramatic chiaroscuro lighting,
    purple (#8b5cf6) and deep blue (#1e1b4b) color wash creating mood,
    theatrical smoke or atmospheric fog creating mysterious depth layers,
    single spotlight creating beautiful rim light on ivory keys,
    music studio professional photography aesthetic with vintage warmth,
    shallow depth of field focusing on key details with artistic blur,
    subtle film grain texture adding organic cinematic quality,
    moody jazz club atmosphere evoking creativity and artistry,
    shot on ARRI Alexa with vintage anamorphic lens flares,
    artistic abstract angle showing piano from unique perspective
  `,
  
  musica: `
    Abstract macro photograph of guitar strings vibrating in motion,
    captured with high-speed photography revealing invisible sound wave patterns,
    warm amber (#f59e0b) and cool purple (#8b5cf6) cross lighting creating contrast,
    extreme shallow depth of field with dreamy bokeh from distant stage lights,
    concert photography aesthetic capturing raw musical energy and emotion,
    8K resolution revealing every microscopic string texture detail,
    cinematic color grading inspired by La La Land and Whiplash cinematography,
    pure musical emotion and passion frozen in single frame,
    professional music photography for album cover quality
  `,
  
  notificacoes: `
    Abstract photograph of ripples expanding in dark water surface,
    illuminated from above by soft purple (#8b5cf6) and pink (#ec4899) lights,
    representing notification waves spreading outward in perfect circles,
    zen minimalist aesthetic with dramatic high contrast lighting,
    long exposure technique creating silky smooth water texture,
    dark moody atmosphere with reflection symmetry creating mirror effect,
    shot on Phase One IQ4 150MP medium format for ultimate resolution,
    contemplative and calming yet attention-grabbing visual metaphor,
    pure abstract beauty representing digital communication waves
  `,
  
  dark_abstract: `
    Abstract generative art photograph of flowing liquid metal in motion,
    iridescent purple (#8b5cf6), electric blue (#3b82f6), and black chrome colors,
    organic flowing forms resembling mercury or magnetic ferrofluid reacting,
    dramatic studio lighting setup with multiple colored gels creating rainbow reflections,
    ultra glossy mirror-like reflective surface catching every light beautifully,
    macro photography with extreme detail showing every ripple and wave,
    dark background isolating subject for maximum visual impact,
    luxury premium aesthetic suitable for high-end brand identity,
    8K resolution capturing impossible micro-details,
    pure abstract art that captivates and mesmerizes viewers
  `,
  
  landscape: `
    Cinematic epic landscape photograph captured at magical blue hour twilight,
    dramatic mountain silhouettes against perfectly gradient sky,
    purple (#8b5cf6) to deep blue (#1e1b4b) to black smooth color transition,
    subtle warm city lights twinkling in distant valley creating scale,
    low clouds or morning mist adding ethereal atmospheric depth layers,
    shot on large format 8x10 camera with perfect infinity focus throughout,
    National Geographic cover quality composition and technical excellence,
    dramatic yet serene mood balancing power and tranquility,
    pure nature majesty inspiring awe and contemplation
  `,
  
  studio: `
    Professional photography studio setup with dramatic lighting,
    deep purple (#8b5cf6) and blue (#3b82f6) gel lights creating color contrast,
    smoke machine haze revealing beautiful light beams and rays,
    sleek modern equipment silhouettes adding visual interest,
    reflective black acrylic floor creating mirror reflections,
    cinematic film set aesthetic with professional production value,
    shallow depth of field with gorgeous circular bokeh,
    moody creative atmosphere perfect for artistic applications,
    8K resolution capturing every atmospheric particle
  `,
  
  tech: `
    Abstract close-up photograph of circuit board patterns and microchips,
    illuminated by purple (#8b5cf6) and cyan (#06b6d4) diagnostic lights,
    extreme macro revealing incredible microscopic detail and textures,
    selective focus creating artistic depth and visual hierarchy,
    dark background with components emerging from shadows dramatically,
    futuristic cyberpunk aesthetic with neon accent lighting,
    photorealistic quality as if shot with electron microscope artistic mode,
    representing cutting-edge technology and digital innovation,
    premium tech brand aesthetic suitable for software applications
  `,
  
  ocean: `
    Abstract underwater photograph of light rays penetrating deep ocean,
    purple (#8b5cf6) and blue (#3b82f6) bioluminescent particles floating,
    dramatic god rays streaming down from surface creating depth,
    mysterious deep sea atmosphere with infinite darkness below,
    long exposure capturing flowing water movement as silk,
    National Geographic underwater photography excellence,
    8K resolution with perfect clarity despite underwater conditions,
    serene yet powerful ocean energy and endless depth,
    meditative calming aesthetic perfect for focus applications
  `,
  
  aurora: `
    Spectacular photograph of aurora borealis dancing across night sky,
    vibrant purple (#8b5cf6), green (#10b981), and blue (#3b82f6) curtains of light,
    silhouetted mountain range or forest treeline as foreground anchor,
    countless stars visible in crystal clear arctic sky,
    long exposure capturing ethereal movement of northern lights,
    shot in Iceland or Norway with professional astrophotography setup,
    8K resolution capturing every star and aurora detail,
    magical otherworldly atmosphere inspiring wonder and dreams,
    nature's most spectacular light show frozen in time
  `,
  
  coffee: `
    Artistic macro photograph of coffee being poured creating swirl patterns,
    warm amber (#f59e0b) and deep brown tones with purple (#8b5cf6) accent lighting,
    high-speed photography freezing liquid in impossible sculptural forms,
    steam rising creating atmospheric depth and warmth,
    shallow depth of field with creamy bokeh background,
    professional food photography lighting setup,
    dark moody cafe aesthetic with intimate atmosphere,
    8K resolution capturing every droplet and ripple detail,
    cozy productive morning energy perfect for work applications
  `,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

// ============================================================================
// BUILD CINEMATIC PROMPT
// ============================================================================

function buildCinematicPrompt(style: string, userPrompt: string): string {
  // Normalizar o estilo
  const styleKey = style.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  const stylePrompt = STYLE_PROMPTS[styleKey] || STYLE_PROMPTS.dark_abstract;
  
  // Limpar o prompt de estilo (remover quebras de linha extras)
  const cleanStylePrompt = stylePrompt
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join(" ");

  return `
Generate a single stunning, award-winning photograph with these exact specifications:

STYLE AND MOOD:
${cleanStylePrompt}

USER'S SPECIFIC REQUEST:
${userPrompt || "Create a beautiful abstract background suitable for modern application interface"}

ABSOLUTE REQUIREMENTS (CRITICAL - MUST FOLLOW):
1. NO text, letters, words, numbers, watermarks, signatures, or logos ANYWHERE in the image
2. NO recognizable human faces or identifiable people
3. Aspect ratio: 16:9 widescreen (1920x1080 ideal for desktop/laptop backgrounds)
4. Style: Photorealistic professional photography, NOT illustration, NOT cartoon, NOT digital art
5. Mood: Dark, moody, sophisticated, premium, professional
6. Contrast: Must work as application background with white/light UI text overlay
7. Left side should have darker/simpler area for potential sidebar overlay
8. Avoid pure white areas or blown highlights that would clash with UI

TECHNICAL QUALITY:
- Ultra high resolution: 8K detail level
- Professional photography standards
- Cinematic color grading with lifted blacks
- Perfect focus on key elements
- Natural film-like quality with subtle grain if appropriate

OUTPUT: Return the generated image as inlineData in the response.
  `.trim();
}

// ============================================================================
// GEMINI IMAGE GENERATION
// ============================================================================

async function generateImageBase64(args: { apiKey: string; model: string; prompt: string }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent?key=${args.apiKey}`;
  
  console.log(`🎨 Generating with model: ${args.model}`);
  console.log(`📝 Prompt length: ${args.prompt.length} chars`);
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: args.prompt }],
        },
      ],
      generationConfig: {
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
    const text = parts.find((p: any) => typeof p?.text === "string") as any;
    throw new Error(
      `No inline image returned. Parts: ${parts.map((p: any) => Object.keys(p || {}).join(",")).join(" | ")}; text: ${
        (text?.text || "").slice(0, 200)
      }`
    );
  }
  
  const mimeType = inline?.inlineData?.mimeType || "image/png";
  const b64 = inline?.inlineData?.data as string;
  
  console.log(`✅ Image generated: ${mimeType}, ${Math.round(b64.length / 1024)}KB base64`);
  
  return { mimeType, b64 };
}

async function generateWithFallbackModels(args: { apiKey: string; prompt: string; preferredModel?: string }) {
  const candidates = [
    args.preferredModel,
    "gemini-3-flash-preview",
    "gemini-2.5-flash-image",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-exp-image-generation",
  ].filter(Boolean) as string[];

  const errors: string[] = [];
  
  for (const model of candidates) {
    try {
      const out = await generateImageBase64({ 
        apiKey: args.apiKey, 
        model, 
        prompt: args.prompt 
      });
      return { ...out, model };
    } catch (e: any) {
      const errorMsg = `${model}: ${e?.message || "unknown error"}`;
      errors.push(errorMsg);
      console.warn(`⚠️ ${errorMsg}`);
    }
  }

  throw new Error(`All models failed. Details: ${errors.slice(0, 4).join(" | ")}`);
}

// ============================================================================
// PHOTO FALLBACK (Unsplash/Picsum)
// ============================================================================

async function downloadPhotoFromUnsplash(query: string) {
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
    console.warn(`Unsplash failed, trying Picsum: ${e?.message}`);
    const seed = crypto.randomUUID();
    const url = `https://picsum.photos/seed/${seed}/1920/1080`;
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Picsum error: ${res.status}`);
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = contentType.includes("png") ? "png" : "jpg";
    return { bytes, contentType, ext, sourceUrl: res.url };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    // Environment variables
    const SUPABASE_URL = ensureEnv("SUPABASE_URL");
    const SUPABASE_ANON_KEY = ensureEnv("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = ensureEnv("SUPABASE_SERVICE_ROLE_KEY");
    const GEMINI_API_KEY = await getGeminiApiKey(createServiceClient());

    // Validate user JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const promptUser = String(body?.prompt || "").trim();
    if (!promptUser) {
      return jsonResponse({ error: "prompt is required" }, 400);
    }

    const style = String(body?.style || "dark_abstract").trim();
    const provider = String(body?.provider || "gemini").trim(); // photo | gemini
    const model = String(body?.model || "gemini-3-flash-preview").trim();

    console.log(`🚀 Request: provider=${provider}, style=${style}, prompt="${promptUser.slice(0, 50)}..."`);

    let bytes: Uint8Array;
    let mimeType: string;
    let ext: string;
    let usedModel: string | null = null;
    let sourceUrl: string | null = null;

    if (provider === "photo") {
      // Real photos from Unsplash/Picsum
      const out = await downloadPhotoWithFallback(promptUser);
      bytes = out.bytes;
      mimeType = out.contentType;
      ext = out.ext;
      sourceUrl = out.sourceUrl;
    } else {
      // Nano Banana (Gemini Image Generation) with cinematic prompts
      const cinematicPrompt = buildCinematicPrompt(style, promptUser);
      
      const out = await generateWithFallbackModels({
        apiKey: GEMINI_API_KEY,
        preferredModel: model || undefined,
        prompt: cinematicPrompt,
      });
      
      mimeType = out.mimeType;
      bytes = decodeBase64(out.b64);
      ext = mimeType.includes("png") ? "png" : "jpg";
      usedModel = out.model;
    }

    // Upload to Supabase Storage
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { 
      auth: { persistSession: false } 
    });
    const userId = userData.user.id;
    const timestamp = Date.now();
    const key = `users/${userId}/${style}_${timestamp}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from("agenda-backgrounds")
      .upload(key, bytes, {
        contentType: mimeType,
        upsert: false,
      });
      
    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: publicData } = admin.storage
      .from("agenda-backgrounds")
      .getPublicUrl(key);
      
    const publicUrl = publicData?.publicUrl || null;
    if (!publicUrl) {
      throw new Error("Failed to build public URL");
    }

    console.log(`✅ Success: ${publicUrl}`);

    return jsonResponse({
      ok: true,
      key,
      publicUrl,
      mimeType,
      model: usedModel,
      provider,
      sourceUrl,
      style,
    });
    
  } catch (e: any) {
    console.error("❌ Error:", e?.message || e);
    return jsonResponse({ error: e?.message || "Unexpected error" }, 500);
  }
});
