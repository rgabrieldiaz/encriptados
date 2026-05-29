/**
 * API para eventos de Encriptados.
 * Consulta la base de datos en Supabase para obtener los eventos sugeridos reales.
 */

// Configuración de Supabase (Cliente público / anon)
const supabaseUrl = "https://lzylaqhjrcfflrbucjdv.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eWxhcWhqcmNmZmxyYnVjamR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MzE0NDgsImV4cCI6MjA5NTQwNzQ0OH0.xNW1E3YzQ7j-mfsdueYVBgxbHwK9QAHymSlB4dtLt5Q";

// Cargar token de bypass para pruebas si existe en localStorage
const testBypassToken = typeof window !== 'undefined' ? localStorage.getItem('sb-test-bypass') : null;
const clientOptions = testBypassToken ? {
  global: {
    headers: {
      'x-test-bypass': testBypassToken
    }
  }
} : {};

export const supabase = window.supabase 
  ? window.supabase.createClient(supabaseUrl, supabaseKey, clientOptions) 
  : null;

/**
 * Obtiene los eventos filtrados por ciudad y con fechas mapeadas dinámicamente.
 * Consulta primero la base de datos de Supabase. Si está vacía o hay un error,
 * recurre a los eventos mock como fallback de resiliencia.
 *
 * @param {string} city Ciudad seleccionada
 * @param {Date} referenceDate Fecha de referencia del calendario
 */
export async function getEvents(city, referenceDate = new Date(), startDateInput = null, endDateInput = null) {
  let startDateStr, endDateStr;

  if (startDateInput && endDateInput) {
    startDateStr = startDateInput;
    endDateStr = endDateInput;
  } else {
    // Rango de consulta por defecto: +/- 35 días de la fecha de referencia
    const startDate = new Date(referenceDate);
    startDate.setDate(startDate.getDate() - 35);
    const endDate = new Date(referenceDate);
    endDate.setDate(endDate.getDate() + 35);

    startDateStr = startDate.toISOString().split('T')[0];
    endDateStr = endDate.toISOString().split('T')[0];
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('location_city', city)
        .gte('event_date', startDateStr)
        .lte('event_date', endDateStr);

      if (error) {
        console.error("Error al consultar eventos en Supabase:", error.message);
        return [];
      }

      if (data) {
        const dbEvents = data.map(e => ({
          id: e.id,
          title: e.title,
          dayOfWeek: e.day_of_week,
          time: e.time_range,
          location_type: e.location_type,
          location_city: e.location_city,
          location_detail: e.location_detail,
          tags: e.tags,
          description: e.description,
          date: e.event_date, // Formato YYYY-MM-DD
          cover_url: e.cover_url,
          host_name: e.host_name,
          price_info: e.price_info,
          luma_url: e.luma_url,
          original_timezone: e.original_timezone,
          original_time_range: e.original_time_range
        }));
        console.log(`Cargados ${dbEvents.length} eventos reales desde Supabase para ${city} en rango [${startDateStr} - ${endDateStr}].`);
        return dbEvents;
      }
    } catch (err) {
      console.error("Excepción al consultar Supabase:", err);
    }
  }

  return [];
}

/**
 * Simula la detección de ubicación del usuario basada en IP.
 */
export async function detectUserLocation() {
  // Por ahora solo detectamos Buenos Aires (AMBA) ya que otras ciudades aún no están disponibles
  return {
    city: "AMBA",
    cityName: "Buenos Aires (AMBA)"
  };
}

/**
 * Envía un listado de URLs de Luma a la Edge Function de procesamiento masivo.
 * @param {string[]} urls Arreglo de URLs a procesar
 */
export async function bulkSuggestEvents(urls) {
  if (supabase) {
    const { data, error } = await supabase.functions.invoke('bulk-suggest-event', {
      body: { urls }
    });
    if (error) throw error;
    return data;
  }
  throw new Error("Cliente de Supabase no disponible.");
}

/**
 * Dispara la ejecución del Agente de Exploración Autónoma.
 */
export async function runAgents() {
  if (supabase) {
    const { data, error } = await supabase.functions.invoke('run-agents');
    if (error) throw error;
    return data;
  }
  throw new Error("Cliente de Supabase no disponible.");
}

/**
 * Obtiene el listado de fuentes de eventos monitoreadas.
 */
export async function getMonitoredSources() {
  if (supabase) {
    const { data, error } = await supabase
      .from('monitored_sources')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return [];
}

/**
 * Agrega una nueva fuente de monitoreo.
 * @param {string} type Tipo de fuente ('luma_profile', 'twitter', 'discord')
 * @param {string} urlOrHandle URL o ID de usuario de Twitter/canal de Discord
 * @param {string} city Ciudad del evento ('AMBA', 'Bogotá', 'Santiago')
 */
export async function addMonitoredSource(type, urlOrHandle, city) {
  if (supabase) {
    const { data, error } = await supabase
      .from('monitored_sources')
      .insert({ type, url_or_handle: urlOrHandle, city })
      .select();
    if (error) throw error;
    return data[0];
  }
  throw new Error("Cliente de Supabase no disponible.");
}

/**
 * Elimina una fuente de monitoreo.
 * @param {number} id Identificador único de la fuente
 */
export async function deleteMonitoredSource(id) {
  if (supabase) {
    const { error } = await supabase
      .from('monitored_sources')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }
  throw new Error("Cliente de Supabase no disponible.");
}

/**
 * Obtiene el historial de ejecuciones de los agentes.
 */
export async function getAgentRuns() {
  if (supabase) {
    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    return data;
  }
  return [];
}
