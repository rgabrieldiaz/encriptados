/**
 * Mock API para eventos de Encriptados.
 * Simula la respuesta JSON que extraerán los robots de Luma.
 */

export const mockEvents = [
  // --- EVENTOS EN BUENOS AIRES (AMBA) ---
  {
    id: 1,
    title: "Cripto Fest Buenos Aires 2026",
    dayOfWeek: "WED", // Miércoles
    time: "18:30 - 22:00",
    location_type: "presencial",
    location_city: "AMBA",
    location_detail: "Espacio Palermo, CABA",
    tags: ["CRIPTO", "FINTECH"],
    description: "El encuentro cripto más grande del año en Argentina. Charlas con referentes, networking y zona de stands."
  },
  {
    id: 2,
    title: "IA y el Futuro de Fintech",
    dayOfWeek: "FRI", // Viernes
    time: "19:00 - 21:30",
    location_type: "presencial",
    location_city: "AMBA",
    location_detail: "Torre Galicia, Microcentro",
    tags: ["IA", "FINTECH", "INVESTMENT"],
    description: "Panel de discusión sobre la convergencia de modelos masivos de IA aplicados a finanzas y automatización de portafolios."
  },
  {
    id: 3,
    title: "Ethereum Argentina Meetup",
    dayOfWeek: "MON", // Lunes
    time: "19:00 - 22:00",
    location_type: "presencial",
    location_city: "AMBA",
    location_detail: "Área Tres, Palermo Soho",
    tags: ["CRIPTO", "INVESTMENT"],
    description: "Reunión de desarrolladores, entusiastas y creadores sobre la red Ethereum y soluciones Layer 2."
  },
  {
    id: 4,
    title: "Cumbre de Ciberseguridad DeFi",
    dayOfWeek: "TUE", // Martes
    time: "15:00 - 18:00",
    location_type: "virtual",
    location_city: "AMBA",
    location_detail: "Discord Oficial & YouTube Live",
    tags: ["CRIPTO"],
    description: "Análisis de vectores de ataque en Smart Contracts de préstamos y mejores prácticas de auditoría."
  },
  {
    id: 5,
    title: "Startup Pitch Day Latam",
    dayOfWeek: "SAT", // Sábado
    time: "14:00 - 19:30",
    location_type: "presencial",
    location_city: "AMBA",
    location_detail: "Centro Cultural Konex, CABA",
    tags: ["INVESTMENT", "FINTECH"],
    description: "Las startups fintech e IA más prometedoras de la región presentan sus proyectos ante fondos de VC globales."
  },

  // --- EVENTOS EN BOGOTÁ ---
  {
    id: 6,
    title: "DeFi & Web3 Bogotá Summit",
    dayOfWeek: "MON", // Lunes
    time: "18:00 - 21:30",
    location_type: "presencial",
    location_city: "Bogotá",
    location_detail: "HubBOG, Bogotá",
    tags: ["CRIPTO", "FINTECH"],
    description: "Explorando la adopción de protocolos financieros descentralizados y billeteras web3 en el ecosistema colombiano."
  },
  {
    id: 7,
    title: "Taller Práctico: Modelos de Lenguaje Aplicados",
    dayOfWeek: "WED", // Miércoles
    time: "19:00 - 21:00",
    location_type: "virtual",
    location_city: "Bogotá",
    location_detail: "Google Meet & GitHub Spaces",
    tags: ["IA"],
    description: "Desarrollo paso a paso de agentes inteligentes utilizando APIs de modelos de lenguaje de última generación."
  },
  {
    id: 8,
    title: "Inversión y Capital de Riesgo Cripto",
    dayOfWeek: "THU", // Jueves
    time: "18:30 - 21:00",
    location_type: "presencial",
    location_city: "Bogotá",
    location_detail: "WeWork Calle 93, Bogotá",
    tags: ["CRIPTO", "INVESTMENT"],
    description: "Reunión privada para inversores y fundadores interesados en rondas de financiación basadas en tokens y equity."
  },
  {
    id: 9,
    title: "Hackathon Fintech Bogotá 2026",
    dayOfWeek: "SAT", // Sábado
    time: "09:00 - 20:00",
    location_type: "presencial",
    location_city: "Bogotá",
    location_detail: "Plaza Hub, Bogotá",
    tags: ["FINTECH", "IA"],
    description: "Una jornada intensiva de programación para crear soluciones que faciliten el acceso al crédito usando inteligencia artificial."
  },

  // --- EVENTOS EN SANTIAGO ---
  {
    id: 10,
    title: "Cripto & Asado Santiago",
    dayOfWeek: "TUE", // Martes
    time: "19:30 - 22:30",
    location_type: "presencial",
    location_city: "Santiago",
    location_detail: "Espacio Cowork El Golf, Las Condes",
    tags: ["CRIPTO", "INVESTMENT"],
    description: "El clásico meetup informal de la comunidad cripto chilena. Conversaciones, debate y buena comida."
  },
  {
    id: 11,
    title: "IA Generativa en el Sector Financiero",
    dayOfWeek: "THU", // Jueves
    time: "18:00 - 20:30",
    location_type: "presencial",
    location_city: "Santiago",
    location_detail: "Auditorio Edificio BCI, Las Condes",
    tags: ["IA", "FINTECH"],
    description: "Casos de uso reales de inteligencia artificial generativa integrados en el procesamiento de datos bancarios."
  },
  {
    id: 12,
    title: "Webinar: Privacidad y Zero Knowledge Proofs",
    dayOfWeek: "FRI", // Viernes
    time: "17:00 - 18:30",
    location_type: "virtual",
    location_city: "Santiago",
    location_detail: "Zoom Webinars",
    tags: ["CRIPTO"],
    description: "Introducción técnica a las pruebas de conocimiento cero y su rol en la privacidad de las transacciones digitales."
  },
  {
    id: 13,
    title: "Tech Hangout Santiago",
    dayOfWeek: "SUN", // Domingo
    time: "16:00 - 19:00",
    location_type: "presencial",
    location_city: "Santiago",
    location_detail: "Parque Bicentenario, Vitacura",
    tags: ["IA", "FINTECH", "INVESTMENT"],
    description: "Encuentro al aire libre para conversar sobre tecnología, startups y oportunidades de financiamiento en Chile."
  }
];

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
export async function getEvents(city, referenceDate = new Date()) {
  // Rango de consulta: +/- 35 días de la fecha de referencia para cubrir vistas mensual y semanal
  const startDate = new Date(referenceDate);
  startDate.setDate(startDate.getDate() - 35);
  const endDate = new Date(referenceDate);
  endDate.setDate(endDate.getDate() + 35);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  let dbEvents = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('location_city', city)
        .gte('event_date', startDateStr)
        .lte('event_date', endDateStr);

      if (!error && data && data.length > 0) {
        dbEvents = data.map(e => ({
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
          luma_url: e.luma_url
        }));
        console.log(`Cargados ${dbEvents.length} eventos reales desde Supabase para ${city}.`);
        return dbEvents;
      } else if (error) {
        console.error("Error al consultar eventos en Supabase:", error.message);
      }
    } catch (err) {
      console.error("Excepción al consultar Supabase:", err);
    }
  }

  // Fallback a eventos mock si no hay datos en Supabase
  console.log("No se obtuvieron eventos de Supabase. Usando fallback de eventos de prueba.");
  const filtered = mockEvents.filter(e => e.location_city === city);

  // Calcular el lunes de la semana que contiene a referenceDate
  const date = new Date(referenceDate);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);

  // Formateador YYYY-MM-DD
  const formatDate = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const daysOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  return filtered.map(event => {
    const idx = daysOrder.indexOf(event.dayOfWeek);
    const eventDate = new Date(monday);
    eventDate.setDate(monday.getDate() + idx);

    return {
      ...event,
      date: formatDate(eventDate)
    };
  });
}

/**
 * Simula la detección de ubicación del usuario basada en IP.
 */
export async function detectUserLocation() {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (res.ok) {
      const data = await res.json();
      // Mapear país/ciudad a las opciones soportadas
      const country = data.country_code; // AR, CO, CL, etc.
      const city = data.city;
      
      if (country === 'CO' || city === 'Bogota' || city === 'Bogotá') {
        return { city: "Bogotá", cityName: "Bogotá, Colombia" };
      } else if (country === 'CL' || city === 'Santiago') {
        return { city: "Santiago", cityName: "Santiago, Chile" };
      }
    }
  } catch (e) {
    console.warn("Error al autodetectar IP:", e.message);
  }
  
  // Default fallback
  return {
    city: "AMBA",
    cityName: "Buenos Aires (AMBA)"
  };
}
