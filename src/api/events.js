/**
 * API para eventos de Encriptados.
 * Consulta la base de datos en Supabase para obtener los eventos sugeridos reales.
 */

// Configuración de Supabase (Cliente público / anon)
const supabaseUrl = "https://lzylaqhjrcfflrbucjdv.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eWxhcWhqcmNmZmxyYnVjamR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MzE0NDgsImV4cCI6MjA5NTQwNzQ0OH0.xNW1E3YzQ7j-mfsdueYVBgxbHwK9QAHymSlB4dtLt5Q";

export const supabase = window.supabase 
  ? window.supabase.createClient(supabaseUrl, supabaseKey) 
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
