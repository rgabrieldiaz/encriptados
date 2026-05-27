import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Función para buscar recursivamente el objeto del evento en NEXT_DATA
function findEventInNextData(obj: any): any {
  if (!obj || typeof obj !== 'object') return null;
  
  if (obj.api_event && obj.api_event.name) {
    return obj.api_event;
  }
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const result = findEventInNextData(obj[key]);
      if (result) return result;
    }
  }
  return null;
}

serve(async (req) => {
  // Manejo de CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(
        JSON.stringify({ error: "Falta la URL del evento" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Procesando sugerencia para URL: ${url}`);

    // 1. Fetch de la página de Lu.ma
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `No se pudo acceder a la URL de Luma. Código: ${response.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await response.text();
    
    // 2. Extraer __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    let rawEvent = null;

    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        rawEvent = findEventInNextData(nextData);
      } catch (err) {
        console.warn("Error parseando __NEXT_DATA__ JSON:", err);
      }
    }

    // Fallbacks
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
    const pageTitle = titleMatch ? titleMatch[1].trim() : 'Evento de Luma';
    
    const bodyMatch = html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/);
    const bodyText = bodyMatch 
      ? bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000) 
      : '';

    const title = rawEvent?.name || pageTitle;
    const description = rawEvent?.description || bodyText;
    const rawLocation = rawEvent?.location?.address || rawEvent?.location?.name || 'Virtual';
    const rawDate = rawEvent?.start_at || 'Hoy';

    // 3. Enriquecer con Gemini
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
2. Estandariza la fecha "event_date" basada en la fecha provista "${rawDate}". Si está en formato ISO (ej: 2026-05-27T21:30:00.000Z), conviértela a la zona horaria local de Sudamérica (UTC-3).
3. Devuelve únicamente el objeto JSON bien formado sin rodeos de texto ni markdown.`;

    const userPrompt = `URL: ${url}
Título extraído: ${title}
Descripción extraída: ${description.slice(0, 1500)}
Ubicación cruda: ${rawLocation}
Fecha cruda: ${rawDate}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    const geminiRes = await fetch(geminiUrl, {
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
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API Error:", errText);
      return new Response(
        JSON.stringify({ error: "Error al invocar la API de Gemini" }),
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
        luma_url: url
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
