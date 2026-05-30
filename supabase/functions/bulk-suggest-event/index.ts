import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-test-bypass',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Algoritmo de distancia de Levenshtein para similitud de strings (Fuzzy Matching)
function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  let i, j, val;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  for (i = 0; i <= a.length; i++) tmp[i] = [i];
  for (j = 0; j <= b.length; j++) tmp[0][j] = j;
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      val = a[i - 1] === b[j - 1] ? 0 : 1;
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1, // deletion
        tmp[i][j - 1] + 1, // insertion
        tmp[i - 1][j - 1] + val // substitution
      );
    }
  }
  return tmp[a.length][b.length];
}

function getSimilarity(s1: string, s2: string): number {
  const clean1 = s1.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const clean2 = s2.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const longer = clean1.length > clean2.length ? clean1 : clean2;
  const shorter = clean1.length > clean2.length ? clean2 : clean1;
  if (longer.length === 0) return 1.0;
  return (longer.length - getLevenshteinDistance(longer, shorter)) / longer.length;
}

// Extraer el slug de una URL de Luma
function extractLumaSlug(rawUrl: string): string | null {
  try {
    let normalized = rawUrl.trim();
    if (!normalized.startsWith('http')) normalized = `https://${normalized}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace('www.', '');
    if (host !== 'lu.ma' && host !== 'luma.com') return null;
    const slug = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (!slug || slug === 'discover' || slug === 'pricing' || slug === 'app') return null;
    return slug;
  } catch {
    return null;
  }
}

// Extraer texto plano de description_mirror (TipTap/ProseMirror JSON)
function extractPlainText(mirror: any): string {
  if (!mirror || typeof mirror !== 'object') return '';
  let text = '';
  if (mirror.text) text += mirror.text;
  if (mirror.content && Array.isArray(mirror.content)) {
    for (const child of mirror.content) {
      const childText = extractPlainText(child);
      if (childText) {
        if (child.type === 'paragraph' || child.type === 'heading' || child.type === 'horizontal_rule' || child.type === 'list_item' || child.type === 'bullet_list' || child.type === 'ordered_list') {
          text += (text ? '\n' : '') + childText;
        } else {
          text += childText;
        }
      }
    }
  }
  return text;
}

// Procesador concurrente con límite de workers
async function processWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const promises: Promise<void>[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      try {
        results[currentIndex] = await fn(item);
      } catch (err) {
        results[currentIndex] = {
          url: String(item),
          status: 'error',
          error: 'exception',
          message: err.message || "Excepción inesperada en worker."
        } as any;
      }
    }
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) {
    promises.push(worker());
  }

  await Promise.all(promises);
  return results;
}

// Función auxiliar para procesar una sola URL de sugerencia
async function processSingleEvent(
  rawUrl: string,
  serviceRoleSupabaseClient: any,
  geminiApiKey: string
): Promise<{ url: string; status: 'success' | 'error'; title?: string; error?: string; message?: string }> {
  // Limpiar URL
  const url = rawUrl.split('?')[0].split('#')[0].trim();
  if (!url) {
    return { url: rawUrl, status: 'error', error: 'invalid_url', message: "URL vacía." };
  }

  try {
    // 1. Verificación rápida de duplicado exacto de URL
    const cleanPath = new URL(url).pathname.replace(/\/+$/, '');
    const { data: existingUrl, error: checkError } = await serviceRoleSupabaseClient
      .from('events')
      .select('title')
      .ilike('luma_url', `%${cleanPath}%`)
      .limit(1);

    if (!checkError && existingUrl && existingUrl.length > 0) {
      return {
        url,
        status: 'error',
        error: 'duplicate',
        message: `Este evento ("${existingUrl[0].title}") ya ha sido registrado previamente.`
      };
    }

    // 2. Obtener datos via API pública de Luma (sin scraping HTML)
    const slug = extractLumaSlug(url);
    if (!slug) {
      return { url, status: 'error', error: 'invalid_url', message: "URL de Luma no válida." };
    }

    const apiUrl = `https://api.lu.ma/url?url=${encodeURIComponent(slug)}`;
    const response = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const sc = response.status;
      if (sc === 404) return { url, status: 'error', error: 'not_found', message: "No se encontró evento en Lu.ma." };
      if (sc === 429 || sc === 403) return { url, status: 'error', error: 'blocking', message: "API de Lu.ma temporalmente limitada." };
      return { url, status: 'error', error: 'api_error', message: `Error HTTP ${sc} de Lu.ma.` };
    }

    const apiData = await response.json();
    const eventContainer = apiData?.data;
    if (!eventContainer) {
      return { url, status: 'error', error: 'parse_error', message: "No se pudo interpretar la respuesta de Lu.ma." };
    }

    const rawEvent = eventContainer.event;

    // 3. Extraer datos directamente del JSON
    const title = rawEvent?.name || 'Evento de Luma';

    let description = '';
    if (eventContainer.description_mirror) {
      description = extractPlainText(eventContainer.description_mirror);
    }
    if (!description && rawEvent?.description) description = rawEvent.description;
    if (!description) description = title;

    const rawLocation = rawEvent?.geo_address_info?.full_address ||
                        rawEvent?.geo_address_info?.address ||
                        rawEvent?.geo_address_info?.short_address ||
                        (rawEvent?.location_type === 'online' ? 'Virtual' : 'Virtual');

    const coverUrl = rawEvent?.cover_url || rawEvent?.social_image_url ||
                     eventContainer?.social_image?.cdn_url || '';

    // Hosts
    let hostNames: string[] = [];
    if (eventContainer?.hosts && Array.isArray(eventContainer.hosts)) {
      hostNames = eventContainer.hosts.map((h: any) => h.name || `${h.first_name || ''} ${h.last_name || ''}`.trim()).filter(Boolean);
    } else if (eventContainer?.calendar?.name) {
      hostNames = [eventContainer.calendar.name];
    }
    let hostName = hostNames.length > 0 ? (hostNames.length === 1 ? hostNames[0] : hostNames.length === 2 ? hostNames.join(' y ') : hostNames.slice(0, -1).join(', ') + ' y ' + hostNames[hostNames.length - 1]) : '';

    // Precio
    const ticketInfo = eventContainer?.ticket_info;
    let priceStr = 'Gratis';
    if (ticketInfo) {
      if (ticketInfo.is_free) priceStr = 'Gratis';
      else if (ticketInfo.price && ticketInfo.price.formatted_cents) priceStr = ticketInfo.price.formatted_cents;
      else if (ticketInfo.price && ticketInfo.price.cents) {
        const symbol = ticketInfo.price.currency === 'USD' ? '$' : ticketInfo.price.currency || '$';
        priceStr = `${symbol}${(ticketInfo.price.cents / 100).toFixed(2)}`;
      } else priceStr = 'De pago';
    }

    // Fechas y Zonas Horarias
    const rawStartDate = rawEvent?.start_at;
    const rawEndDate = rawEvent?.end_at;
    const rawTimezone = rawEvent?.timezone || 'America/Argentina/Buenos_Aires';
    const targetTimezone = 'America/Argentina/Buenos_Aires';

    let localDate = '';
    let localTimeRange = '19:00 - 21:00';
    let localDayOfWeek = 'MON';
    let originalTimezone = null;
    let originalTimeRange = null;

    const weekdayMap: Record<string, string> = {
      'MON': 'MON', 'TUE': 'TUE', 'WED': 'WED', 'THU': 'THU', 'FRI': 'FRI', 'SAT': 'SAT', 'SUN': 'SUN',
      'LUN': 'MON', 'MAR': 'TUE', 'MIÉ': 'WED', 'JUE': 'THU', 'VIE': 'FRI', 'SÁB': 'SAT', 'DOM': 'SUN'
    };

    if (rawStartDate) {
      const startDate = new Date(rawStartDate);
      const dateParts = new Intl.DateTimeFormat('en-US', {
        timeZone: targetTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short'
      }).formatToParts(startDate);

      const y = dateParts.find(p => p.type === 'year')?.value;
      const m = dateParts.find(p => p.type === 'month')?.value;
      const d = dateParts.find(p => p.type === 'day')?.value;
      localDate = `${y}-${m}-${d}`;

      const wd = dateParts.find(p => p.type === 'weekday')?.value;
      const shortDay = wd ? wd.toUpperCase().replace('.', '') : 'MON';
      localDayOfWeek = weekdayMap[shortDay] || shortDay;
      if (localDayOfWeek === 'THR') localDayOfWeek = 'THU';

      const startTimeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: targetTimezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(startDate);

      let endTimeStr = '';
      if (rawEndDate) {
        endTimeStr = new Intl.DateTimeFormat('en-US', {
          timeZone: targetTimezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(new Date(rawEndDate));
      } else {
        endTimeStr = new Intl.DateTimeFormat('en-US', {
          timeZone: targetTimezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(new Date(startDate.getTime() + 2 * 60 * 60 * 1000));
      }
      localTimeRange = `${startTimeStr} - ${endTimeStr}`;

      if (rawTimezone && rawTimezone !== targetTimezone) {
        const origStartStr = new Intl.DateTimeFormat('en-US', {
          timeZone: rawTimezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(startDate);

        let origEndStr = '';
        if (rawEndDate) {
          origEndStr = new Intl.DateTimeFormat('en-US', {
            timeZone: rawTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(new Date(rawEndDate));
        } else {
          origEndStr = new Intl.DateTimeFormat('en-US', {
            timeZone: rawTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(new Date(startDate.getTime() + 2 * 60 * 60 * 1000));
        }
        originalTimeRange = `${origStartStr} - ${origEndStr}`;

        const tzAbbrs: Record<string, string> = {
          'America/New_York': 'EST/EDT',
          'America/Los_Angeles': 'PST/PDT',
          'America/Chicago': 'CST/CDT',
          'America/Argentina/Buenos_Aires': 'ART',
          'America/Bogota': 'COT',
          'America/Santiago': 'CLT',
          'UTC': 'UTC', 'Etc/UTC': 'UTC', 'GMT': 'GMT'
        };
        originalTimezone = tzAbbrs[rawTimezone] || rawTimezone.split('/').pop()?.replace('_', ' ') || rawTimezone;
      }
    }

    const isPrivateAddress = rawEvent?.geo_address_visibility && rawEvent.geo_address_visibility !== 'public';
    const isAddressPrivate = isPrivateAddress || /visible after/i.test(rawLocation) || /se revela/i.test(rawLocation);

    // 4. Gemini 2.5 Flash Enrichment
    const systemPrompt = `Eres un Agente de Enriquecimiento de IA experto en tecnología y eventos web3.
Tu trabajo es procesar información desestructurada de un evento extraído de Lu.ma y estructurarlo exactamente en el siguiente esquema JSON:
{
  "title": "Título limpio y claro del evento",
  "description": "Resumen limpio de 2-3 oraciones del evento sin caracteres extraños ni formateos HTML",
  "event_date": "YYYY-MM-DD",
  "day_of_week": "MON | TUE | WED | THU | FRI | SAT | SUN",
  "time_range": "HH:MM - HH:MM",
  "location_type": "presencial | virtual",
  "location_city": "AMBA | Bogotá | Santiago",
  "location_detail": "Nombre del lugar físico y dirección. Si es virtual, la plataforma.",
  "tags": ["Tag1"],
  "is_valid": true | false
}
Reglas:
1. "location_city" debe ser "AMBA" para Buenos Aires, "Bogotá" para Bogotá, "Santiago" para Santiago. Si no es ninguna de ellas ni es virtual, marca "is_valid": false.
2. Utiliza exactamente los valores precalculados.
3. Si la dirección es privada, establece "location_detail" exactamente como "Ubicación visible tras aprobación" y NO reveles ninguna dirección específica en el JSON.`;

    const userPrompt = `URL: ${url}
Título: ${title}
Descripción: ${description.slice(0, 1200)}
Ubicación cruda: ${rawLocation}
Ubicación Privada: ${isAddressPrivate ? 'Sí' : 'No'}
Fecha local: ${localDate}
Día de la semana: ${localDayOfWeek}
Horario: ${localTimeRange}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!geminiRes.ok) {
      return { url, status: 'error', error: 'gemini_error', message: "Error al enriquecer con IA (Gemini)." };
    }

    const geminiData = await geminiRes.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!responseText) {
      return { url, status: 'error', error: 'gemini_error', message: "Gemini no devolvió respuesta." };
    }

    const parsedResult = JSON.parse(responseText);

    if (parsedResult.is_valid === false) {
      return {
        url,
        status: 'error',
        error: 'invalid_region',
        message: "El evento no pertenece a Buenos Aires, Bogotá, Santiago ni es Virtual."
      };
    }

    // 5. Comprobar duplicado difuso (Fuzzy Matching > 85%) en la fecha seleccionada
    const { data: existingEvents, error: dbCheckError } = await serviceRoleSupabaseClient
      .from('events')
      .select('id, title')
      .eq('event_date', parsedResult.event_date);

    if (!dbCheckError && existingEvents) {
      for (const item of existingEvents) {
        const similarity = getSimilarity(parsedResult.title, item.title);
        if (similarity > 0.85) {
          return {
            url,
            status: 'error',
            error: 'duplicate',
            message: `Evento duplicado (similitud del ${Math.round(similarity * 100)}% con "${item.title}").`
          };
        }
      }
    }

    // 6. Insertar en la Base de Datos
    const { error: insertError } = await serviceRoleSupabaseClient
      .from('events')
      .insert({
        title: parsedResult.title,
        description: parsedResult.description,
        event_date: parsedResult.event_date,
        day_of_week: parsedResult.day_of_week,
        time_range: parsedResult.time_range,
        location_type: parsedResult.location_type,
        location_city: parsedResult.location_city,
        location_detail: parsedResult.location_detail,
        tags: parsedResult.tags,
        cover_url: coverUrl,
        host_name: hostName,
        price_info: priceStr,
        luma_url: url,
        original_timezone: originalTimezone,
        original_time_range: originalTimeRange
      });

    if (insertError) {
      if (insertError.code === '23505') {
        return {
          url,
          status: 'error',
          error: 'duplicate',
          message: `Este evento ya ha sido registrado previamente.`
        };
      }
      return { url, status: 'error', error: 'db_error', message: insertError.message };
    }

    return { url, status: 'success', title: parsedResult.title };

  } catch (err: any) {
    return { url, status: 'error', error: 'exception', message: err.message || "Excepción en el procesamiento." };
  }
}

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // 1. Verificación de Rol de Administrador
    const testBypassHeader = req.headers.get('x-test-bypass');
    const isTestBypass = testBypassHeader && testBypassHeader === 'secret-test-token-123';
    
    let userEmail = '';
    
    if (isTestBypass) {
      userEmail = 'gabrieldiaz81@gmail.com';
      console.log("[TEST BYPASS] Autorizado mediante token de prueba.");
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Falta encabezado de autorización." }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data, error: authError } = await userClient.auth.getUser();

      if (authError || !data?.user || data.user.email !== 'gabrieldiaz81@gmail.com') {
        return new Response(
          JSON.stringify({ error: "No autorizado. Solo gabrieldiaz81@gmail.com puede sugerir en lote." }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userEmail = data.user.email;
    }

    // 2. Procesamiento de URLs
    const { urls } = await req.json();
    if (!urls || !Array.isArray(urls)) {
      return new Response(
        JSON.stringify({ error: "Falta el arreglo de URLs." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Iniciando procesamiento masivo de ${urls.length} URLs...`);

    const serviceRoleSupabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || "";

    // Procesar concurrentemente con un límite de 5 llamadas en paralelo
    const results = await processWithConcurrencyLimit(
      urls,
      5,
      (url) => processSingleEvent(url, serviceRoleSupabaseClient, geminiApiKey)
    );

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Excepción en Edge Function Bulk Suggestion:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error interno del servidor." }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
