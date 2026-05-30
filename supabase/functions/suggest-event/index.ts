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

// Extraer el slug de una URL de Luma (ej: "https://lu.ma/blitzbuenosaires" -> "blitzbuenosaires")
function extractLumaSlug(rawUrl: string): string | null {
  try {
    // Normalize URL
    let normalized = rawUrl.trim();
    if (!normalized.startsWith('http')) {
      normalized = `https://${normalized}`;
    }
    const parsed = new URL(normalized);
    
    // Accept lu.ma and luma.com domains
    const host = parsed.hostname.replace('www.', '');
    if (host !== 'lu.ma' && host !== 'luma.com') {
      return null;
    }
    
    // The slug is the path without leading/trailing slashes
    const slug = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (!slug || slug === 'discover' || slug === 'pricing' || slug === 'app') {
      return null;
    }
    
    return slug;
  } catch {
    return null;
  }
}

// Extraer texto plano de la description_mirror (TipTap/ProseMirror JSON)
function extractPlainText(mirror: any): string {
  if (!mirror || typeof mirror !== 'object') return '';
  let text = '';
  if (mirror.text) text += mirror.text;
  if (mirror.content && Array.isArray(mirror.content)) {
    for (const child of mirror.content) {
      const childText = extractPlainText(child);
      if (childText) {
        // Add paragraph/heading separator
        if (child.type === 'paragraph' || child.type === 'heading' || child.type === 'horizontal_rule') {
          text += (text ? '\n' : '') + childText;
        } else if (child.type === 'list_item' || child.type === 'bullet_list' || child.type === 'ordered_list') {
          text += (text ? '\n' : '') + childText;
        } else {
          text += childText;
        }
      }
    }
  }
  return text;
}

serve(async (req) => {
  // Manejo de CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let { url } = await req.json();
    if (!url) {
      return new Response(
        JSON.stringify({ error: "Falta la URL del evento" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean URL query parameters and hashes (such as ?tk=)
    url = url.split('?')[0].split('#')[0];

    console.log(`Procesando sugerencia para URL: ${url}`);

    // 1. Extraer slug y obtener datos via API pública de Luma (no scraping HTML)
    const slug = extractLumaSlug(url);
    if (!slug) {
      return new Response(
        JSON.stringify({ error: "URL no válida. Por favor, ingresa una URL de evento de Lu.ma (ej: https://lu.ma/mi-evento)" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout

    let apiData: any;
    try {
      const apiUrl = `https://api.lu.ma/url?url=${encodeURIComponent(slug)}`;
      console.log(`Consultando API de Luma: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const statusCode = response.status;
        if (statusCode === 404) {
          return new Response(
            JSON.stringify({ error: "not_found", message: "No se encontró un evento con esa URL en Lu.ma. Verifica que el enlace sea correcto." }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (statusCode === 429 || statusCode === 403) {
          return new Response(
            JSON.stringify({ error: "blocking", message: "La API de Lu.ma está temporalmente limitada. Intenta de nuevo en unos minutos." }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: `api_error`, message: `Error al consultar Lu.ma (HTTP ${statusCode})` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      apiData = await response.json();
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: "timeout", message: "La API de Lu.ma tardó demasiado en responder. Por favor, intenta de nuevo." }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw fetchErr;
    }

    // Validate we got event data
    const eventContainer = apiData?.data;
    if (!eventContainer) {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "No se pudo interpretar la respuesta de Lu.ma." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawEvent = eventContainer.event;

    // 2. Extraer datos directamente del JSON de la API (sin scraping HTML)
    const title = rawEvent?.name || 'Evento de Luma';
    
    // Descripción: extraer de description_mirror (TipTap JSON) o fallback
    let description = '';
    if (eventContainer.description_mirror) {
      description = extractPlainText(eventContainer.description_mirror);
    }
    if (!description && rawEvent?.description) {
      description = rawEvent.description;
    }
    if (!description) {
      description = title;
    }

    const rawLocation = rawEvent?.geo_address_info?.full_address || 
                        rawEvent?.geo_address_info?.address ||
                        rawEvent?.geo_address_info?.short_address ||
                        (rawEvent?.location_type === 'online' ? 'Virtual' : 'Virtual');

    // 3. Extracción de Flyer, Host, y Precio directamente del JSON
    const coverUrl = rawEvent?.cover_url || rawEvent?.social_image_url || 
                     eventContainer?.social_image?.cdn_url || '';

    // Hosts directamente del array de la API
    let hostNames: string[] = [];
    if (eventContainer?.hosts && Array.isArray(eventContainer.hosts)) {
      hostNames = eventContainer.hosts.map((h: any) => h.name || `${h.first_name || ''} ${h.last_name || ''}`.trim()).filter(Boolean);
    } else if (eventContainer?.calendar?.name) {
      hostNames = [eventContainer.calendar.name];
    }

    let hostName = '';
    if (hostNames.length > 0) {
      if (hostNames.length === 1) {
        hostName = hostNames[0];
      } else if (hostNames.length === 2) {
        hostName = hostNames.join(' y ');
      } else {
        hostName = hostNames.slice(0, -1).join(', ') + ' y ' + hostNames[hostNames.length - 1];
      }
    }

    const ticketInfo = eventContainer?.ticket_info;
    let priceStr = 'Gratis';
    if (ticketInfo) {
      if (ticketInfo.is_free) {
        priceStr = 'Gratis';
      } else if (ticketInfo.price && ticketInfo.price.formatted_cents) {
        priceStr = ticketInfo.price.formatted_cents;
      } else if (ticketInfo.price && ticketInfo.price.cents) {
        const symbol = ticketInfo.price.currency === 'USD' ? '$' : ticketInfo.price.currency || '$';
        priceStr = `${symbol}${(ticketInfo.price.cents / 100).toFixed(2)}`;
      } else {
        priceStr = 'De pago';
      }
    }


    // 4. Fechas y Horas locales precalculadas a ART (User target timezone)
    const rawStartDate = rawEvent?.start_at;
    const rawEndDate = rawEvent?.end_at;
    const rawTimezone = rawEvent?.timezone || 'America/Argentina/Buenos_Aires';
    const targetTimezone = 'America/Argentina/Buenos_Aires'; // Local timezone de Encriptados

    let localDate = '';
    let localTimeRange = '19:00 - 21:00';
    let localDayOfWeek = 'MON';
    
    let originalTimezone = null;
    let originalTimeRange = null;

    const weekdayMap: Record<string, string> = {
      'MON': 'MON', 'TUE': 'TUE', 'WED': 'WED', 'THU': 'THU', 'FRI': 'FRI', 'SAT': 'SAT', 'SUN': 'SUN',
      'LUN': 'MON', 'MAR': 'TUE', 'MIÉ': 'WED', 'JUE': 'THU', 'VIE': 'FRI', 'SÁB': 'SAT', 'DOM': 'SUN',
      'MON.': 'MON', 'TUE.': 'TUE', 'WED.': 'WED', 'THU.': 'THU', 'FRI.': 'FRI', 'SAT.': 'SAT', 'SUN.': 'SUN'
    };

    if (rawStartDate) {
      try {
        const startDate = new Date(rawStartDate);
        
        // Date: YYYY-MM-DD in target timezone (ART)
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

        // Time range in target timezone (ART)
        const startTimeStr = new Intl.DateTimeFormat('en-US', {
          timeZone: targetTimezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(startDate);

        let endTimeStr = '';
        if (rawEndDate) {
          const endDate = new Date(rawEndDate);
          endTimeStr = new Intl.DateTimeFormat('en-US', {
            timeZone: targetTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(endDate);
        } else {
          // Default 2 hours
          const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
          endTimeStr = new Intl.DateTimeFormat('en-US', {
            timeZone: targetTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(endDate);
        }

        localTimeRange = `${startTimeStr} - ${endTimeStr}`;

        // Si la zona horaria original es diferente de ART, calcular rango de hora original
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
            'UTC': 'UTC',
            'Etc/UTC': 'UTC',
            'GMT': 'GMT'
          };
          originalTimezone = tzAbbrs[rawTimezone] || rawTimezone.split('/').pop()?.replace('_', ' ') || rawTimezone;
        }
      } catch (err) {
        console.error("Error al precalcular las fechas con la zona horaria:", err);
      }
    }

    // 5. Regla de Privacidad de Ubicación
    const isPrivateAddress = rawEvent?.geo_address_visibility && rawEvent.geo_address_visibility !== 'public';
    const rawLocationStr = rawLocation || '';
    const isAddressPrivate = isPrivateAddress || 
                             /visible after/i.test(rawLocationStr) || 
                             /se revela/i.test(rawLocationStr) ||
                             /tras aprobación/i.test(rawLocationStr);

    // 6. Enriquecer con Gemini 2.5 Flash
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Falta la clave GEMINI_API_KEY en el servidor" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `Eres un Agente de Enriquecimiento de IA experto en tecnología y eventos web3.
Tu trabajo es procesar información desestructurada de un evento extraído de Lu.ma y estructurarlo exactamente en el siguiente esquema JSON:

{
  "title": "Título limpio y claro del evento",
  "description": "Resumen limpio de 2-3 oraciones del evento sin caracteres extraños ni formateos HTML",
  "event_date": "YYYY-MM-DD (Fecha de inicio del evento)",
  "day_of_week": "MON | TUE | WED | THU | FRI | SAT | SUN (Día de la semana de inicio correspondiente en inglés de 3 letras)",
  "time_range": "HH:MM - HH:MM (Rango de hora en formato 24hs. Si no hay hora final, asume 2 horas de duración. Si no hay hora en absoluto, usa '19:00 - 21:00')",
  "location_type": "presencial | virtual",
  "location_city": "AMBA | Bogotá | Santiago",
  "location_detail": "Nombre del lugar físico y dirección (ej: 'WeWork Corrientes 800, CABA'). Si es virtual, usa el enlace o plataforma (ej: 'Discord & YouTube Live')",
  "tags": ["Tag1", "Tag2"] (Lista de tags. Permitidos: 'CRIPTO', 'IA', 'FINTECH', 'INVESTMENT'. Mapea al menos uno y máximo tres basados en el contenido),
  "is_valid": true | false (Verdadero si el evento ocurre dentro del Área Metropolitana de Buenos Aires / CABA para AMBA, Bogotá para Bogotá, Santiago para Santiago, o si es 100% Virtual. Si es un evento presencial en otra ciudad no listada, marca false)
}

Reglas críticas:
1. "location_city" debe ser "AMBA" si la ubicación es en Buenos Aires (CABA, Buenos Aires, AMBA, Argentina). Usa "Bogotá" para Bogotá (Colombia) y "Santiago" para Santiago (Chile). Si no coincide con ninguna y no es virtual, marca "is_valid": false.
2. Utiliza exactamente el valor de "Fecha local precalculada" en "event_date".
3. Utiliza exactamente el valor de "Día de la semana precalculado" en "day_of_week".
4. Utiliza exactamente el valor de "Rango horario precalculado" en "time_range".
5. Regla de Privacidad de Ubicación: Si "Ubicación Privada" es "Sí", debes establecer "location_detail" exactamente como "Ubicación visible tras aprobación" y NO revelar ninguna calle o dirección específica en el JSON.
6. Devuelve únicamente el objeto JSON bien formado sin rodeos de texto ni markdown.`;

    const userPrompt = `URL: ${url}
    Título extraído: ${title}
    Descripción extraída: ${(description || '').slice(0, 1500)}
    Ubicación cruda: ${rawLocation}
    Ubicación Privada: ${isAddressPrivate ? 'Sí' : 'No'}
    Fecha local precalculada: ${localDate}
    Día de la semana precalculado: ${localDayOfWeek}
    Rango horario precalculado: ${localTimeRange}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    const geminiController = new AbortController();
    const geminiTimeoutId = setTimeout(() => geminiController.abort(), 15000); // 15 seconds timeout

    let geminiRes;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: userPrompt }
              ]
            }
          ],
          systemInstruction: {
            parts: [
              { text: systemPrompt }
            ]
          },
          generationConfig: {
            responseMimeType: "application/json"
          }
        }),
        signal: geminiController.signal
      });
    } catch (geminiErr: any) {
      if (geminiErr.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: "Error de Gemini: La API de IA no respondió a tiempo." }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw geminiErr;
    } finally {
      clearTimeout(geminiTimeoutId);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API Error:", errText);
      let errorDetail = "Error al invocar la API de Gemini";
      try {
        const parsed = JSON.parse(errText);
        errorDetail = parsed.error?.message || parsed.error || errText;
      } catch {
        errorDetail = errText || errorDetail;
      }
      return new Response(
        JSON.stringify({ error: `Error de Gemini: ${errorDetail}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiRes.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!responseText) {
      return new Response(
        JSON.stringify({ error: "Gemini no devolvió una respuesta válida" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsedResult = JSON.parse(responseText);

    if (parsedResult.is_valid === false) {
      return new Response(
        JSON.stringify({ 
          error: "Este evento no pertenece a las regiones cubiertas (Buenos Aires, Bogotá, Santiago) ni es virtual.", 
          details: parsedResult 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detección de duplicados mediante Fuzzy Matching (Levenshtein > 85%) en la fecha seleccionada
    if (parsedResult.is_valid !== false) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
      
      if (supabaseUrl && supabaseKey) {
        try {
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { data: existingEvents, error: checkError } = await supabase
            .from('events')
            .select('id, title, luma_url')
            .eq('event_date', parsedResult.event_date);
          
          if (!checkError && existingEvents) {
            for (const item of existingEvents) {
              const similarity = getSimilarity(parsedResult.title, item.title);
              if (similarity > 0.85) {
                console.log(`Duplicado detectado por similitud (${Math.round(similarity * 100)}%): "${parsedResult.title}" vs "${item.title}"`);
                return new Response(
                  JSON.stringify({ 
                    error: "duplicate",
                    message: `Este evento ya ha sido registrado previamente (similitud del ${Math.round(similarity * 100)}% con "${item.title}").` 
                  }),
                  { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
            }
          }
        } catch (dbErr) {
          console.error("Error al consultar duplicados en Supabase:", dbErr);
        }
      }
    }

    // Retornar el evento estructurado exitosamente
    return new Response(
      JSON.stringify({
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
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Excepción en la Edge Function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
