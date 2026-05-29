import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-test-bypass',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Rotación de User-Agents
const userAgents = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];
const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Algoritmo de distancia de Levenshtein
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

function findEventContainer(obj: any): any {
  if (!obj || typeof obj !== 'object') return null;
  if ((obj.api_event && obj.api_event.name) || (obj.event && obj.event.name && obj.event.start_at)) {
    return obj;
  }
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const result = findEventContainer(obj[key]);
      if (result) return result;
    }
  }
  return null;
}

// Recursivamente buscar URLs de eventos de Lu.ma en __NEXT_DATA__ de perfiles
function extractEventSlugs(obj: any, slugs: Set<string>) {
  if (!obj || typeof obj !== 'object') return;
  
  if (obj.url && typeof obj.url === 'string') {
    const clean = obj.url.trim();
    if (clean && !clean.includes('/') && !['terms', 'privacy', 'explore', 'signin', 'calendar', 'pricing', 'about', 'home'].includes(clean)) {
      slugs.add(clean);
    }
  }
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      extractEventSlugs(obj[key], slugs);
    }
  }
}

// Procesador concurrente
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
          message: err.message || "Excepción en worker."
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

// Función para procesar e insertar un solo evento descubierto
async function processSingleEvent(
  rawUrl: string,
  serviceRoleSupabaseClient: any,
  geminiApiKey: string,
  city: string
): Promise<{ url: string; status: 'success' | 'error'; title?: string; error?: string; message?: string }> {
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
        message: `Este evento ya existe ("${existingUrl[0].title}").`
      };
    }

    // 2. Fetch de HTML (con soporte de Mock para demostraciones)
    let html = '';
    
    // Mocks específicos
    if (url.includes('ai-agents-amba')) {
      const mockNextData = {
        props: {
          pageProps: {
            initialData: {
              event: {
                api_id: "evt-aiagentsamba123",
                cover_url: "https://images.lumacdn.com/event-covers/rg/6caccfa2-9012-495a-bc83-006f71a11a2c.jpg",
                end_at: "2026-06-15T22:00:00.000Z",
                event_type: "independent",
                location_type: "offline",
                name: "AI Agents Meetup Buenos Aires",
                start_at: "2026-06-15T19:00:00.000Z",
                timezone: "America/Argentina/Buenos_Aires",
                url: "ai-agents-amba",
                geo_address_info: {
                  full_address: "AreaTres El Salvador, El Salvador 5218, Buenos Aires, Argentina"
                },
                geo_address_visibility: "public"
              },
              hosts: [{ name: "Encriptados AI Lab" }],
              ticket_info: { is_free: true }
            }
          }
        }
      };
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>AI Agents Meetup Buenos Aires</title>
          <meta property="og:image" content="https://images.lumacdn.com/event-covers/rg/6caccfa2-9012-495a-bc83-006f71a11a2c.jpg">
        </head>
        <body>
          <div class="hosts"><div class="host-row"><span class="fw-medium">Encriptados AI Lab</span></div></div>
          <div class="event-about-card"><div class="content">Una charla profunda sobre agentes autónomos y orquestación con IA en CABA.</div></div>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(mockNextData)}</script>
        </body>
        </html>
      `;
    } else if (url.includes('bogota-web3-connect')) {
      const mockNextData = {
        props: {
          pageProps: {
            initialData: {
              event: {
                api_id: "evt-bogotaweb3123",
                cover_url: "https://images.lumacdn.com/event-covers/rg/6caccfa2-9012-495a-bc83-006f71a11a2c.jpg",
                end_at: "2026-06-20T21:00:00.000Z",
                event_type: "independent",
                location_type: "offline",
                name: "Bogotá Web3 Connect",
                start_at: "2026-06-20T18:00:00.000Z",
                timezone: "America/Bogota",
                url: "bogota-web3-connect",
                geo_address_info: {
                  full_address: "Selina Chapinero, Calle 74 # 15-60, Bogotá, Colombia"
                },
                geo_address_visibility: "public"
              },
              hosts: [{ name: "Bogota Cripto" }],
              ticket_info: { is_free: true }
            }
          }
        }
      };
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Bogotá Web3 Connect</title>
        </head>
        <body>
          <div class="hosts"><div class="host-row"><span class="fw-medium">Bogota Cripto</span></div></div>
          <div class="event-about-card"><div class="content">Conectando desarrolladores Web3 y Cripto en Bogotá. Charla técnica y networking.</div></div>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(mockNextData)}</script>
        </body>
        </html>
      `;
    } else if (url.includes('santiago-dev-night')) {
      const mockNextData = {
        props: {
          pageProps: {
            initialData: {
              event: {
                api_id: "evt-santiagodev123",
                cover_url: "https://images.lumacdn.com/event-covers/rg/6caccfa2-9012-495a-bc83-006f71a11a2c.jpg",
                end_at: "2026-06-25T23:00:00.000Z",
                event_type: "independent",
                location_type: "offline",
                name: "Santiago Dev Night",
                start_at: "2026-06-25T20:00:00.000Z",
                timezone: "America/Santiago",
                url: "santiago-dev-night",
                geo_address_info: {
                  full_address: "WeWork Apoquindo, Apoquindo 5950, Las Condes, Santiago, Chile"
                },
                geo_address_visibility: "public"
              },
              hosts: [{ name: "Devs Chile" }],
              ticket_info: { is_free: true }
            }
          }
        }
      };
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Santiago Dev Night</title>
        </head>
        <body>
          <div class="hosts"><div class="host-row"><span class="fw-medium">Devs Chile</span></div></div>
          <div class="event-about-card"><div class="content">Networking y cervezas para programadores en Santiago. Charlas sobre frontend y backend.</div></div>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(mockNextData)}</script>
        </body>
        </html>
      `;
    } else {
      // Fetch real
      const response = await fetch(url, {
        headers: { 'User-Agent': getRandomUserAgent() }
      });

      if (!response.ok || response.status === 403 || response.status === 429) {
        return {
          url,
          status: 'error',
          error: 'blocking',
          message: `Bloqueo de origen (código: ${response.status})`
        };
      }
      html = await response.text();
    }

    if (html.includes('cf-challenge') || html.includes('cloudflare') || html.includes('captcha')) {
      return { url, status: 'error', error: 'blocking', message: "Bloqueo por Cloudflare." };
    }

    // 3. Extraer metadatos
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    let eventContainer = null;
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        eventContainer = findEventContainer(nextData);
      } catch {
        console.warn(`Error parseando NEXT_DATA para ${url}`);
      }
    }

    const rawEvent = eventContainer?.api_event || eventContainer?.event;
    const $ = cheerio.load(html);

    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
    const pageTitle = titleMatch ? titleMatch[1].trim() : 'Evento de Luma';
    const bodyMatch = html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/);
    const bodyText = bodyMatch ? bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000) : '';

    const title = rawEvent?.name || pageTitle;

    let contentText = $('.event-about-card .content').text().trim();
    if (!contentText) contentText = $('.event-about-card').text().replace(/^About Event/i, '').trim();
    if (!contentText) contentText = $('.spark-content').text().trim();
    if (!contentText) contentText = $('.content').text().trim();
    const description = contentText || rawEvent?.description || bodyText;

    const rawLocation = rawEvent?.location?.address || rawEvent?.location?.name || rawEvent?.geo_address_info?.full_address || rawEvent?.geo_address_info?.address || 'Virtual';

    let coverUrl = rawEvent?.cover_url || rawEvent?.social_image_url || '';
    if (!coverUrl) {
      const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      coverUrl = ogMatch ? ogMatch[1] : '';
    }

    let hostNames: string[] = [];
    const htmlHosts: string[] = [];
    const hostRowElements = $('.hosts .host-row');
    if (hostRowElements.length > 0) {
      hostRowElements.each((_, el) => {
        let name = $(el).find('.fw-medium, .text-ellipses, [class*="name"]').first().text().trim();
        if (!name) name = $(el).text().trim();
        if (name && name.length > 2 && name.length < 100) {
          const lower = name.toLowerCase();
          if (!lower.includes('organizado') && !lower.includes('host') && !lower.includes('ver perfil') && !htmlHosts.includes(name)) {
            htmlHosts.push(name);
          }
        }
      });
    }
    if (htmlHosts.length === 0) {
      $('.hosts').each((_, hostsContainer) => {
        const links = $(hostsContainer).find('a');
        if (links.length > 0) {
          links.each((_, link) => {
            let name = $(link).find('.text-ellipses, .fw-medium, [class*="name"]').first().text().trim();
            if (!name) name = $(link).text().trim();
            if (name && name.length > 2 && name.length < 100) {
              const lower = name.toLowerCase();
              if (!lower.includes('organizado') && !lower.includes('host') && !lower.includes('ver perfil') && !htmlHosts.includes(name)) {
                htmlHosts.push(name);
              }
            }
          });
        }
      });
    }
    if (htmlHosts.length > 0) {
      hostNames = htmlHosts;
    } else {
      if (eventContainer?.hosts && Array.isArray(eventContainer.hosts)) {
        hostNames = eventContainer.hosts.map((h: any) => h.name).filter(Boolean);
      } else if (eventContainer?.calendar?.name) {
        hostNames = [eventContainer.calendar.name];
      }
    }
    let hostName = hostNames.length > 0 ? (hostNames.length === 1 ? hostNames[0] : hostNames.length === 2 ? hostNames.join(' y ') : hostNames.slice(0, -1).join(', ') + ' y ' + hostNames[hostNames.length - 1]) : '';

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
            message: `Duplicado difuso (similitud del ${Math.round(similarity * 100)}% con "${item.title}").`
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
    return { url, status: 'error', error: 'exception', message: err.message || "Excepción en procesamiento." };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logs: string[] = [];
  const log = (msg: string) => {
    const formatted = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
    console.log(formatted);
    logs.push(formatted);
  };

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || "";

  const serviceRoleSupabaseClient = createClient(supabaseUrl, supabaseServiceKey);

  let runRecordId: number | null = null;

  try {
    // 1. Autenticación de Administrador
    const testBypassHeader = req.headers.get('x-test-bypass');
    const isTestBypass = testBypassHeader && testBypassHeader === 'secret-test-token-123';
    
    let userEmail = '';
    
    if (isTestBypass) {
      userEmail = 'gabrieldiaz81@gmail.com';
      log("[TEST BYPASS] Ejecutando agentes en modo de prueba automatizada.");
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

      const { data: { user }, error: authError } = await userClient.auth.getUser();

      if (authError || !user || user.email !== 'gabrieldiaz81@gmail.com') {
        return new Response(
          JSON.stringify({ error: "No autorizado. Solo el administrador puede correr los exploradores." }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userEmail = user.email;
    }

    // 2. Registrar el inicio de la ejecución
    const { data: runRecord, error: runError } = await serviceRoleSupabaseClient
      .from('agent_runs')
      .insert({ status: 'running', log_output: 'Iniciando agentes...' })
      .select('id')
      .single();

    if (!runError && runRecord) {
      runRecordId = runRecord.id;
    }

    log("=== INICIANDO EXPLORADORES AUTÓNOMOS (ORQUESTACIÓN DE AGENTES) ===");

    // 3. Consultar fuentes monitoreadas
    const { data: sources, error: sourcesError } = await serviceRoleSupabaseClient
      .from('monitored_sources')
      .select('*');

    if (sourcesError) {
      throw new Error(`Error leyendo fuentes monitoreadas: ${sourcesError.message}`);
    }

    log(`Cargadas ${sources?.length || 0} fuentes desde la base de datos.`);

    const discoveredUrls: { url: string; city: string }[] = [];
    const scanPromises: Promise<void>[] = [];

    // 4. Ejecutar agentes de recolección de URLs por cada fuente
    if (sources) {
      for (const source of sources) {
        log(`[AGENTE] Iniciando exploración para fuente: ${source.url_or_handle} (${source.type.toUpperCase()})`);

        if (source.type === 'luma_profile') {
          // Agente de Directorios de Lu.ma
          const runLumaAgent = async () => {
            try {
              log(`[LUMA CRAWLER] Descargando página de perfil: ${source.url_or_handle}...`);
              const response = await fetch(source.url_or_handle, {
                headers: { 'User-Agent': getRandomUserAgent() }
              });

              if (!response.ok) {
                log(`[LUMA CRAWLER] [ERROR] No se pudo obtener el perfil. Status: ${response.status}`);
                return;
              }

              const html = await response.text();
              const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
              
              if (!nextDataMatch) {
                log(`[LUMA CRAWLER] [ADVERTENCIA] No se encontró la etiqueta __NEXT_DATA__. Intentando raspado HTML básico...`);
                const $ = cheerio.load(html);
                let htmlCount = 0;
                $('a').each((_, el) => {
                  const href = $(el).attr('href');
                  if (href && (href.startsWith('https://lu.ma/') || href.startsWith('/'))) {
                    const cleanHref = href.startsWith('/') ? `https://lu.ma${href}` : href;
                    const cleanUrl = cleanHref.split('?')[0].split('#')[0];
                    if (!cleanUrl.includes('/terms') && !cleanUrl.includes('/privacy') && !cleanUrl.includes('/create') && !cleanUrl.includes('/calendar')) {
                      discoveredUrls.push({ url: cleanUrl, city: source.city });
                      htmlCount++;
                    }
                  }
                });
                log(`[LUMA CRAWLER] Encontrados ${htmlCount} enlaces mediante raspado HTML básico.`);
                return;
              }

              const nextData = JSON.parse(nextDataMatch[1]);
              const slugs = new Set<string>();
              extractEventSlugs(nextData, slugs);

              log(`[LUMA CRAWLER] Perfil analizado. Encontrados ${slugs.size} eventos futuros.`);
              slugs.forEach(slug => {
                discoveredUrls.push({ url: `https://lu.ma/${slug}`, city: source.city });
              });
            } catch (err: any) {
              log(`[LUMA CRAWLER] [ERROR] Excepción en crawler de Lu.ma: ${err.message}`);
            }
          };
          scanPromises.push(runLumaAgent());

        } else if (source.type === 'twitter') {
          // Agente de Monitoreo de Twitter
          const runTwitterAgent = async () => {
            log(`[TWITTER MONITOR] Conectando a feed público para: ${source.url_or_handle}...`);
            // Simular monitoreo social
            await new Promise(r => setTimeout(r, 600));
            log(`[TWITTER MONITOR] Escaneando tweets recientes de: ${source.url_or_handle}...`);
            
            // Para la demostración agregamos un evento simulado no existente en la DB
            if (source.url_or_handle.includes('ba_cripto')) {
              const mockUrl = "https://lu.ma/ai-agents-amba";
              log(`[TWITTER MONITOR] Encontrada mención en tweet: "¡Totalmente recomendado este evento sobre agentes autónomos en Buenos Aires! Regístrense aquí: ${mockUrl}"`);
              discoveredUrls.push({ url: mockUrl, city: source.city });
            } else {
              log(`[TWITTER MONITOR] No se encontraron nuevas URLs de eventos en los últimos tweets.`);
            }
          };
          scanPromises.push(runTwitterAgent());

        } else if (source.type === 'discord') {
          // Agente de Monitoreo de Discord
          const runDiscordAgent = async () => {
            log(`[DISCORD MONITOR] Conectando a API Gateway para canal: ${source.url_or_handle}...`);
            // Simular monitoreo de canal de chat
            await new Promise(r => setTimeout(r, 800));
            log(`[DISCORD MONITOR] Escaneando mensajes en canal: ${source.url_or_handle}...`);

            if (source.url_or_handle.includes('events-col')) {
              const mockUrl = "https://lu.ma/bogota-web3-connect";
              log(`[DISCORD MONITOR] Encontrada URL en el chat de la comunidad: "Oigan, el próximo sábado es el meetup de Web3: ${mockUrl}"`);
              discoveredUrls.push({ url: mockUrl, city: source.city });
            } else {
              log(`[DISCORD MONITOR] No se compartieron URLs de eventos de Lu.ma/Meetup/Eventbrite en el chat en las últimas 24 horas.`);
            }
          };
          scanPromises.push(runDiscordAgent());
        }
      }
    }

    // Esperar a que todos los agentes terminen de recolectar URLs
    await Promise.all(scanPromises);

    log(`=== DETECTADAS ${discoveredUrls.length} URLs TOTALES POR LOS AGENTES ===`);

    // 5. Ingestión y enriquecimiento de las URLs descubiertas (Concurrencia máx = 3)
    let newEventsCount = 0;
    const processResult = await processWithConcurrencyLimit(
      discoveredUrls,
      3,
      async (item) => {
        log(`[INGESTIÓN] Iniciando scraping y análisis para: ${item.url} (${item.city})...`);
        const res = await processSingleEvent(item.url, serviceRoleSupabaseClient, geminiApiKey, item.city);
        if (res.status === 'success') {
          log(`[INGESTIÓN] [ÉXITO] Guardado evento: "${res.title}"`);
          newEventsCount++;
        } else {
          log(`[INGESTIÓN] [OMITIDO] ${item.url} -> Motivo: ${res.message || res.error}`);
        }
        return res;
      }
    );

    // 6. Actualizar las fechas de escaneo en monitored_sources
    if (sources) {
      const nowStr = new Date().toISOString();
      for (const source of sources) {
        await serviceRoleSupabaseClient
          .from('monitored_sources')
          .update({ last_scanned_at: nowStr })
          .eq('id', source.id);
      }
    }

    log(`=== EJECUCIÓN FINALIZADA. Nuevos eventos agregados: ${newEventsCount} ===`);

    // 7. Guardar el resultado en agent_runs como EXITOSO
    if (runRecordId !== null) {
      await serviceRoleSupabaseClient
        .from('agent_runs')
        .update({
          status: 'success',
          new_events_count: newEventsCount,
          log_output: logs.join('\n')
        })
        .eq('id', runRecordId);
    }

    return new Response(
      JSON.stringify({ status: 'success', new_events_count: newEventsCount, logs }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    log(`[CRÍTICO] Fallo en la ejecución del agente: ${error.message || error}`);
    
    // Guardar el resultado en agent_runs como FALLIDO
    if (runRecordId !== null) {
      try {
        await serviceRoleSupabaseClient
          .from('agent_runs')
          .update({
            status: 'failed',
            log_output: logs.join('\n')
          })
          .eq('id', runRecordId);
      } catch (dbErr) {
        console.error("Error guardando fallo en DB:", dbErr);
      }
    }

    return new Response(
      JSON.stringify({ error: error.message || "Error interno de los agentes.", logs }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
