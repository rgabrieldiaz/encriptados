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

/**
 * Obtiene los eventos filtrados por ciudad y con fechas mapeadas dinámicamente
 * al lunes de la semana actual enfocada por el calendario.
 *
 * @param {string} city Ciudad seleccionada
 * @param {Date} referenceDate Fecha de referencia del calendario (por defecto hoy)
 */
export async function getEvents(city, referenceDate = new Date()) {
  // Simular latencia de red
  await new Promise(resolve => setTimeout(resolve, 300));

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

  // Mapear los eventos estáticos a las fechas dinámicas correspondientes a esa semana
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
  await new Promise(resolve => setTimeout(resolve, 400));
  return {
    city: "AMBA",
    cityName: "Buenos Aires (AMBA)"
  };
}