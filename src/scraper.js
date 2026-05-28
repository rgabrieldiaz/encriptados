import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Inicializar clientes de forma perezosa
let supabase = null;
let geminiModel = null;

function ensureClientsInitialized() {
  if (supabase && geminiModel) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.GEMINI_API_KEY) {
    console.error('\n❌ ERROR: Faltan variables de entorno requeridas en el archivo .env o en el sistema:\n');
    if (!process.env.SUPABASE_URL) console.error('- SUPABASE_URL');
    if (!process.env.SUPABASE_ANON_KEY) console.error('- SUPABASE_ANON_KEY');
    if (!process.env.GEMINI_API_KEY) console.error('- GEMINI_API_KEY');
    console.error('\nPor favor, configura tu archivo .env o las variables de entorno de tu sistema.\n');
    process.exit(1);
  }

  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { responseMimeType: 'application/json' }
  });
}

// Comunidades Lu.ma a rastrear
const communities = [
  { city: 'AMBA', url: 'https://lu.ma/chc_buenosaires' },
  { city: 'AMBA', url: 'https://lu.ma/solana-ba' },
  { city: 'AMBA', url: 'https://lu.ma/buenosaires' },
  { city: 'Bogotá', url: 'https://lu.ma/bogota' },
  { city: 'Santiago', url: 'https://lu.ma/santiago' }
];

// Días de la semana en formato interno
const daysOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

async function runScraper() {
  console.log('=== INICIANDO ROBOT EXTRACTOR DE ENCRIPTADOS ===');
  ensureClientsInitialized();

  // 1. Obtener URLs de eventos ya almacenados para evitar duplicar scrape
  console.log('Obteniendo enlaces existentes de la base de datos...');
  const { data: existingEvents, error: dbError } = await supabase
    .from('events')
    .select('luma_url');
  
  if (dbError) {
    console.error('Error al consultar Supabase:', dbError);
    process.exit(1);
  }
  
  const scrapedUrls = new Set(existingEvents.map(e => e.luma_url));
  console.log(`Se encontraron ${scrapedUrls.size} eventos existentes en la base de datos.`);

  // 2. Iniciar navegador Headless
  console.log('Levantando navegador headless...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const discoveredUrls = [];

  for (const community of communities) {
    console.log(`Rastreando comunidad: ${community.url} (${community.city})...`);
    try {
      await page.goto(community.url, { waitUntil: 'networkidle', timeout: 60000 });
      
      // Simular scroll hacia abajo para cargar eventos dinámicos (lazy loading)
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
        await page.waitForTimeout(1500);
      }

      // Obtener el HTML completo de la página
      const content = await page.content();
      const $ = cheerio.load(content);
      
      // Extraer todos los enlaces
      $('a').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href) {
          // Normalizar URL de Lu.ma
          let fullUrl = href;
          if (href.startsWith('/')) {
            fullUrl = `https://lu.ma${href}`;
          }
          
          // Filtrar enlaces de eventos (ej: lu.ma/xxxx o lu.ma/event/xxxx)
          const isLumaUrl = fullUrl.startsWith('https://lu.ma/');
          const isIgnored = ['/terms', '/privacy', '/home', '/create', '/explore', '/signin', '/calendar', '/pricing', '/about', '/communit'].some(p => fullUrl.includes(p));
          
          if (isLumaUrl && !isIgnored) {
            // Limpiar query params (?tk=, etc)
            const cleanUrl = fullUrl.split('?')[0];
            if (!discoveredUrls.includes(cleanUrl) && !scrapedUrls.has(cleanUrl)) {
              discoveredUrls.push({ url: cleanUrl, city: community.city });
            }
          }
        }
      });
    } catch (e) {
      console.error(`Error al raspar la comunidad ${community.url}:`, e);
    }
  }

  await browser.close();
  console.log(`Descubiertos ${discoveredUrls.length} eventos nuevos potenciales para procesar.`);

  // 3. Raspado y Enriquecimiento de cada evento individual
  let successCount = 0;
  
  for (const item of discoveredUrls) {
    console.log(`Procesando evento: ${item.url}...`);
    try {
      const eventData = await scrapeSingleLumaEvent(item.url, item.city);
      if (eventData) {
        console.log(`Guardando evento en base de datos: "${eventData.title}"...`);
        const { error: insertError } = await supabase
          .from('events')
          .insert(eventData);
        
        if (insertError) {
          console.error(`Error al insertar en Supabase para ${item.url}:`, insertError.message);
        } else {
          console.log(`¡Evento "${eventData.title}" insertado con éxito!`);
          successCount++;
        }
      }
    } catch (err) {
      console.error(`Error al procesar el evento ${item.url}:`, err);
    }
    // Pausa breve para evitar bloqueos de IP
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`=== SCRAPER FINALIZADO. Eventos procesados y guardados con éxito: ${successCount} ===`);
}

/**
 * Raspa y procesa un único evento de Lu.ma en base a su HTML y script NEXT_DATA.
 */
export async function scrapeSingleLumaEvent(url, defaultCity = 'AMBA') {
  ensureClientsInitialized();
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      console.warn(`No se pudo obtener el evento ${url}. Código de estado: ${res.status}`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const nextDataText = $('#__NEXT_DATA__').html();

    let rawEvent = null;

    if (nextDataText) {
      try {
        const nextData = JSON.parse(nextDataText);
        
        // Buscar el objeto del evento recursivamente dentro de NEXT_DATA
        rawEvent = findEventInNextData(nextData);
      } catch (parseErr) {
        console.warn('Error al parsear __NEXT_DATA__ JSON, usando fallback de texto:', parseErr.message);
      }
    }

    // Fallback si no encontramos NEXT_DATA estructurado
    const pageTitle = $('title').text() || 'Evento de Luma';
    const pageText = $('body').text() || '';

    // Enviar datos al Agente de IA (Gemini) para clasificar y normalizar
    const eventDetails = await enrichEventWithAI({
      url,
      defaultCity,
      title: rawEvent?.name || pageTitle,
      description: rawEvent?.description || pageText.slice(0, 3000),
      rawLocation: rawEvent?.location?.address || 
                   rawEvent?.location?.name || 
                   rawEvent?.geo_address_info?.full_address || 
                   rawEvent?.geo_address_info?.address || 
                   'Virtual',
      rawDate: rawEvent?.start_at || 'Hoy'
    });

    return eventDetails;
  } catch (error) {
    console.error(`Excepción en scrapeSingleLumaEvent para ${url}:`, error);
    return null;
  }
}

/**
 * Busca recursivamente una estructura de evento en el JSON de NextJS.
 */
function findEventInNextData(obj) {
  if (!obj || typeof obj !== 'object') return null;
  
  if (obj.api_event && obj.api_event.name) {
    return obj.api_event;
  }

  if (obj.event && obj.event.name && obj.event.start_at) {
    return obj.event;
  }
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const result = findEventInNextData(obj[key]);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Agente de Enriquecimiento que consulta a la API de Gemini para estructurar el evento.
 */
async function enrichEventWithAI({ url, defaultCity, title, description, rawLocation, rawDate }) {
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
2. Estandariza la fecha "event_date" basada en la fecha provista "\${rawDate}". Si está en formato ISO (ej: 2026-05-27T21:30:00.000Z), conviértela a la zona horaria local de Sudamérica (UTC-3).
3. Devuelve únicamente el objeto JSON bien formado sin rodeos de texto ni markdown.`;

  const userPrompt = `URL: \${url}
Ciudad de origen asumida: \${defaultCity}
Título extraído: \${title}
Descripción extraída: \${description.slice(0, 1500)}
Ubicación cruda: \${rawLocation}
Fecha cruda: \${rawDate}`;

  try {
    const chat = geminiModel.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: "Entendido, procesaré los eventos en base a las reglas y devolveré solo JSON." }] }
      ]
    });

    const response = await chat.sendMessage(userPrompt);
    const text = response.response.text().trim();
    
    // Parsear el JSON devuelto por Gemini
    const result = JSON.parse(text);
    
    if (result.is_valid === false) {
      console.warn(`Evento descartado por geofiltro (no válido para la ciudad asumida): "\${title}" en "\${rawLocation}"`);
      return null;
    }

    // Retornar en el formato de nuestra tabla Postgres
    return {
      title: result.title,
      description: result.description,
      event_date: result.event_date,
      day_of_week: result.day_of_week,
      time_range: result.time_range,
      location_type: result.location_type,
      location_city: result.location_city,
      location_detail: result.location_detail,
      tags: result.tags,
      luma_url: url
    };
  } catch (err) {
    console.error('Error al llamar a Gemini o parsear la respuesta:', err.message);
    return null;
  }
}

// Ejecutar si se corre directamente
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  runScraper();
}
