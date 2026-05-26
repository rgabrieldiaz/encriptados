import { getEvents, detectUserLocation } from './api/events.js';

// ==========================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================================================
const state = {
  currentCity: "AMBA",
  currentCityName: "Buenos Aires (AMBA)",
  events: [],
  userCalendar: JSON.parse(localStorage.getItem('encriptados_calendar')) || [],
  mouse: { x: 0, y: 0, targetX: 0, targetY: 0 }
};

// Mapeo de nombres completos de días de la semana para mobile
const dayNameMap = {
  MON: "Lunes",
  TUE: "Martes",
  WED: "Miércoles",
  THU: "Jueves",
  FRI: "Viernes",
  SAT: "Sábado",
  SUN: "Domingo"
};

// ==========================================================================
// REFERENCIAS A ELEMENTOS DEL DOM
// ==========================================================================
const dom = {
  screen: document.getElementById('perspective-screen'),
  locationSelector: document.getElementById('location-selector'),
  locationDisplay: document.getElementById('current-location-display'),
  locationDropdown: document.getElementById('location-dropdown'),
  calendarGrid: document.getElementById('calendar-grid'),
  columns: document.querySelectorAll('.calendar-column'),
  eventModal: document.getElementById('event-modal'),
  modalCloseBtn: document.getElementById('modal-close-btn'),
  modalTags: document.getElementById('modal-tags'),
  modalTitle: document.getElementById('modal-title'),
  modalDate: document.getElementById('modal-date'),
  modalTime: document.getElementById('modal-time'),
  modalLocation: document.getElementById('modal-location'),
  modalDescription: document.getElementById('modal-description'),
  modalAddBtn: document.getElementById('modal-add-btn'),
  toastContainer: document.getElementById('toast-container'),
  canvas: document.getElementById('space-canvas')
};

// ==========================================================================
// CANVAS DE PARTICULAS Y CONSTELACIONES DE FONDO
// ==========================================================================
let ctx;
let particles = [];
const particleCount = 60;
const connectionDistance = 120;

class Particle {
  constructor(w, h) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.radius = Math.random() * 1.5 + 0.5;
    this.alpha = Math.random() * 0.5 + 0.3;
    this.color = Math.random() > 0.5 ? '#00FFFF' : '#8A2BE2';
  }

  update(w, h, parallaxX, parallaxY) {
    // Movimiento básico autónomo
    this.x += this.vx;
    this.y += this.vy;

    // Límites de pantalla (rebote suave)
    if (this.x < 0 || this.x > w) this.vx *= -1;
    if (this.y < 0 || this.y > h) this.vy *= -1;
  }

  draw(parallaxX, parallaxY) {
    // Aplicamos el paralaje relativo a la posición del mouse
    const drawX = this.x + parallaxX * 15;
    const drawY = this.y + parallaxY * 15;

    ctx.beginPath();
    ctx.arc(drawX, drawY, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.alpha;
    ctx.fill();
  }
}

function initCanvas() {
  if (!dom.canvas) return;
  ctx = dom.canvas.getContext('2d');
  resizeCanvas();

  particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle(dom.canvas.width, dom.canvas.height));
  }

  window.addEventListener('resize', resizeCanvas);
  animateCanvas();
}

function resizeCanvas() {
  dom.canvas.width = window.innerWidth;
  dom.canvas.height = window.innerHeight;
}

function animateCanvas() {
  ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);

  // Calcular el paralaje en base a la posición del ratón
  // El centro de la pantalla es (0,0), el rango va de -1 a 1
  const parallaxX = (state.mouse.x / window.innerWidth) - 0.5;
  const parallaxY = (state.mouse.y / window.innerHeight) - 0.5;

  const w = dom.canvas.width;
  const h = dom.canvas.height;

  // Dibujar Cuadrícula Geométrica Cyberpunk en perspectiva sutil
  ctx.strokeStyle = 'rgba(138, 43, 226, 0.04)';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1.0;

  // Líneas horizontales de cuadrícula (perspectiva hacia el centro-abajo)
  const gridRows = 25;
  const horizonY = h * 0.35; // Punto de fuga
  for (let i = 0; i <= gridRows; i++) {
    const ratio = i / gridRows;
    // Espaciado exponencial para dar sensación de profundidad
    const y = horizonY + (h - horizonY) * Math.pow(ratio, 2.5);
    
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Líneas verticales convergentes (efecto fuga 3D)
  const gridCols = 30;
  const centerX = w / 2 + parallaxX * -30; // Movimiento reactivo
  for (let i = 0; i <= gridCols; i++) {
    const startX = (w / gridCols) * i;
    ctx.beginPath();
    ctx.moveTo(startX, h);
    ctx.lineTo(centerX + (startX - w/2) * 0.15, horizonY);
    ctx.stroke();
  }

  // Dibujar y conectar partículas (Constelaciones)
  particles.forEach(p => {
    p.update(w, h, parallaxX, parallaxY);
    p.draw(parallaxX, parallaxY);
  });

  // Dibujar enlaces entre estrellas cercanas
  ctx.lineWidth = 0.5;
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const p1 = particles[i];
      const p2 = particles[j];

      const drawX1 = p1.x + parallaxX * 15;
      const drawY1 = p1.y + parallaxY * 15;
      const drawX2 = p2.x + parallaxX * 15;
      const drawY2 = p2.y + parallaxY * 15;

      const dx = drawX1 - drawX2;
      const dy = drawY1 - drawY2;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < connectionDistance) {
        // La opacidad depende de la cercanía
        const opacity = (1 - dist / connectionDistance) * 0.15;
        ctx.strokeStyle = p1.color === '#00FFFF' ? 'rgba(0, 255, 255, ' + opacity + ')' : 'rgba(138, 43, 226, ' + opacity + ')';
        ctx.beginPath();
        ctx.moveTo(drawX1, drawY1);
        ctx.lineTo(drawX2, drawY2);
        ctx.stroke();
      }
    }
  }

  requestAnimationFrame(animateCanvas);
}

// ==========================================================================
// RENDERIZADO DE LA PERSPECTIVA 3D Y EFECTO TILT
// ==========================================================================
function init3DEffects() {
  window.addEventListener('mousemove', (e) => {
    state.mouse.targetX = e.clientX;
    state.mouse.targetY = e.clientY;
  });

  // Animación del tilt de la pantalla para suavizado por interpolación lineal (Lerp)
  function updateScreenTilt() {
    // Lerp
    state.mouse.x += (state.mouse.targetX - state.mouse.x) * 0.08;
    state.mouse.y += (state.mouse.targetY - state.mouse.y) * 0.08;

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // Calcular inclinación máxima (-4 a +4 grados en Y, -2.5 a +2.5 en X)
    const rotateY = ((state.mouse.x - centerX) / centerX) * 5.0;
    const rotateX = -((state.mouse.y - centerY) / centerY) * 3.0;

    // Solo aplicamos si la pantalla es de escritorio (ancho > 1024px)
    if (window.innerWidth > 1024 && dom.screen) {
      dom.screen.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg) translateZ(0)`;
    }

    requestAnimationFrame(updateScreenTilt);
  }

  updateScreenTilt();
}

// ==========================================================================
// LOGICA DE EVENTOS Y RENDERIZADO DINÁMICO
// ==========================================================================

/**
 * Carga eventos filtrados por ciudad y los renderiza en la grilla.
 */
async function loadEventsByCity(city) {
  // Animación de salida (fade out de la grilla)
  dom.calendarGrid.style.opacity = '0.3';
  dom.calendarGrid.style.transform = 'translateZ(10px) scale(0.99)';
  dom.calendarGrid.style.transition = 'all 0.3s ease';

  try {
    const events = await getEvents(city);
    state.events = events;
    renderEvents();
  } catch (error) {
    console.error("Error al cargar los eventos:", error);
  } finally {
    // Animación de entrada
    setTimeout(() => {
      dom.calendarGrid.style.opacity = '1';
      dom.calendarGrid.style.transform = 'translateZ(20px) scale(1)';
    }, 150);
  }
}

/**
 * Renderiza los eventos en sus columnas correspondientes.
 */
function renderEvents() {
  // 1. Limpiar todas las columnas
  dom.columns.forEach(col => {
    const wrapper = col.querySelector('.events-wrapper');
    wrapper.innerHTML = '';
    col.classList.remove('has-events');
  });

  // Mapeamos los días de las columnas para mobile
  dom.columns.forEach(col => {
    const day = col.getAttribute('data-day');
    col.setAttribute('data-day-full', dayNameMap[day] || day);
  });

  // 2. Insertar las tarjetas en la columna correcta
  state.events.forEach(event => {
    const column = Array.from(dom.columns).find(col => col.getAttribute('data-day') === event.dayOfWeek);
    if (!column) return;

    column.classList.add('has-events');
    const wrapper = column.querySelector('.events-wrapper');

    const card = createEventCard(event);
    wrapper.appendChild(card);
  });

  // Ajustar inclinación individual de tarjetas en 3D
  setupCard3DInteractions();
}

/**
 * Crea el elemento DOM para una tarjeta de evento.
 */
function createEventCard(event) {
  const card = document.createElement('article');
  card.className = 'event-card';
  card.dataset.id = event.id;

  // Indicador de tipo (presencial o virtual)
  const indicator = document.createElement('div');
  indicator.className = `event-card-type-indicator ${event.location_type}`;
  card.appendChild(indicator);

  // Tags
  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'event-card-tags';
  event.tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = `event-tag tag-${tag.toLowerCase()}`;
    span.textContent = `#${tag}`;
    tagsContainer.appendChild(span);
  });
  card.appendChild(tagsContainer);

  // Título
  const title = document.createElement('h3');
  title.className = 'event-card-title';
  title.textContent = event.title;
  card.appendChild(title);

  // Horario
  const time = document.createElement('span');
  time.className = 'event-card-time';
  time.textContent = event.time;
  card.appendChild(time);

  // Lógica del botón de calendario
  const isAdded = state.userCalendar.includes(event.id);
  const actionDiv = document.createElement('div');
  actionDiv.className = 'event-card-action';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-card-add';
  if (isAdded) {
    addBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Agregado
    `;
    addBtn.style.background = 'linear-gradient(90deg, rgba(0, 255, 255, 0.15) 0%, rgba(0, 255, 255, 0.05) 100%)';
    addBtn.style.borderColor = 'var(--neon-cyan)';
    addBtn.style.color = 'var(--neon-cyan)';
  } else {
    addBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      A mi Calendario
    `;
  }

  // Interacción al agregar al calendario
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Evitar abrir el modal de detalles
    toggleCalendarEvent(event, addBtn);
  });

  actionDiv.appendChild(addBtn);
  card.appendChild(actionDiv);

  // Abrir Modal de detalles al hacer click en la tarjeta
  card.addEventListener('click', () => {
    openEventModal(event);
  });

  return card;
}

/**
 * Configura los efectos de rotación individual 3D e inclinación sutil (tilt) al pasar el cursor sobre las tarjetas.
 */
function setupCard3DInteractions() {
  const cards = document.querySelectorAll('.event-card');
  if (window.innerWidth <= 1024) {
    cards.forEach(card => card.style.transform = '');
    return;
  }

  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left; // Posición x del cursor dentro del elemento
      const y = e.clientY - rect.top;  // Posición y del cursor dentro del elemento

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Calcular inclinación máxima relativa a la tarjeta (máximo 12 grados de rotación)
      const rotateX = -((y - centerY) / centerY) * 10;
      const rotateY = ((x - centerX) / centerX) * 10;

      card.style.transform = `translateY(-6px) translateZ(50px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
      card.style.boxShadow = `
        0 20px 35px rgba(0, 0, 0, 0.8),
        0 0 15px rgba(0, 255, 255, 0.25)
      `;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateZ(35px) rotateX(0deg) rotateY(0deg) scale(1)';
      card.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.5)';
      card.style.borderColor = 'rgba(255, 255, 255, 0.07)';
    });
  });
}

// ==========================================================================
// INTERACCIONES CON EL CALENDARIO (GUARDADO / TOASTS)
// ==========================================================================

/**
 * Agrega o elimina un evento del calendario del usuario, persistiendo en localStorage y notificando.
 */
function toggleCalendarEvent(event, buttonElement) {
  const index = state.userCalendar.indexOf(event.id);
  const isAdding = index === -1;

  if (isAdding) {
    state.userCalendar.push(event.id);
    showToast("EVENTO REGISTRADO", `${event.title} añadido a tu calendario.`, "success");
    
    // Cambiar estado visual del botón
    buttonElement.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Agregado
    `;
    buttonElement.style.background = 'linear-gradient(90deg, rgba(0, 255, 255, 0.15) 0%, rgba(0, 255, 255, 0.05) 100%)';
    buttonElement.style.borderColor = 'var(--neon-cyan)';
    buttonElement.style.color = 'var(--neon-cyan)';
    buttonElement.style.boxShadow = '0 0 10px rgba(0, 255, 255, 0.15)';
  } else {
    state.userCalendar.splice(index, 1);
    showToast("EVENTO ELIMINADO", `${event.title} removido de tu calendario.`, "info");
    
    // Restaurar estado visual original del botón
    buttonElement.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      A mi Calendario
    `;
    buttonElement.style.background = '';
    buttonElement.style.borderColor = '';
    buttonElement.style.color = '';
    buttonElement.style.boxShadow = '';
  }

  // Guardar en almacenamiento local
  localStorage.setItem('encriptados_calendar', JSON.stringify(state.userCalendar));

  // Si el modal está abierto, sincronizar el botón de acción del modal
  updateModalButtonState(event.id);
}

/**
 * Muestra una notificación Toast flotante con diseño glassmorphic y glow.
 */
function showToast(title, message, type = "success") {
  const toast = document.createElement('div');
  toast.className = 'toast';

  // Icono dinámico para el toast
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
    <div class="toast-content">
      <span class="toast-title">${title}</span>
      <span class="toast-message">${message}</span>
    </div>
  `;

  dom.toastContainer.appendChild(toast);

  // Forzar reflow para animación
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // Destruir después de 4.5 segundos
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 4500);
}

// ==========================================================================
// MODAL DE DETALLE DE EVENTOS
// ==========================================================================
let currentActiveModalEventId = null;

function openEventModal(event) {
  currentActiveModalEventId = event.id;
  
  // Renderizar tags
  dom.modalTags.innerHTML = '';
  event.tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = `event-tag tag-${tag.toLowerCase()}`;
    span.textContent = `#${tag}`;
    dom.modalTags.appendChild(span);
  });

  // Rellenar contenido
  dom.modalTitle.textContent = event.title;
  
  // Dar formato amigable a la fecha
  const parts = event.date.split('-');
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  const localDateStr = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  dom.modalDate.textContent = localDateStr.charAt(0).toUpperCase() + localDateStr.slice(1);

  dom.modalTime.textContent = `${event.time} hs`;
  dom.modalLocation.textContent = `${event.location_detail} (${event.location_city})`;
  dom.modalDescription.textContent = event.description;

  // Actualizar botón de acción del modal
  updateModalButtonState(event.id);

  // Quitar listener anterior y añadir el nuevo para manejar clicks del botón del modal
  dom.modalAddBtn.onclick = () => {
    const addBtnOnCard = document.querySelector(`.event-card[data-id="${event.id}"] .btn-card-add`);
    toggleCalendarEvent(event, addBtnOnCard);
  };

  // Abrir modal con animación
  dom.eventModal.classList.add('open');
  document.body.style.overflow = 'hidden'; // Evitar scroll
}

function updateModalButtonState(eventId) {
  if (currentActiveModalEventId !== eventId || !dom.modalAddBtn) return;

  const isAdded = state.userCalendar.includes(eventId);
  if (isAdded) {
    dom.modalAddBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Agregado a mi Calendario
    `;
    dom.modalAddBtn.style.background = 'linear-gradient(135deg, rgba(0,255,255,0.2) 0%, rgba(138,43,226,0.2) 100%)';
    dom.modalAddBtn.style.boxShadow = 'inset 0 0 10px rgba(0, 255, 255, 0.2)';
    dom.modalAddBtn.style.border = '1px solid var(--neon-cyan)';
  } else {
    dom.modalAddBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="12" y1="14" x2="12" y2="20" />
        <line x1="9" y1="17" x2="15" y2="17" />
      </svg>
      Añadir a mi Calendario
    `;
    dom.modalAddBtn.style.background = '';
    dom.modalAddBtn.style.boxShadow = '';
    dom.modalAddBtn.style.border = '';
  }
}

function closeEventModal() {
  dom.eventModal.classList.remove('open');
  document.body.style.overflow = ''; // Restaurar scroll
  currentActiveModalEventId = null;
}

// ==========================================================================
// INTERACCIONES CON EL SELECTOR DE UBICACIÓN
// ==========================================================================
function initLocationDropdown() {
  // Toggle abrir dropdown
  dom.locationSelector.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.locationSelector.classList.toggle('open');
  });

  // Cerrar al clickear afuera
  document.addEventListener('click', () => {
    dom.locationSelector.classList.remove('open');
  });

  // Selección de región
  const listItems = dom.locationDropdown.querySelectorAll('li');
  listItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const city = item.getAttribute('data-city');
      const cityName = item.querySelector('span').textContent;

      if (state.currentCity === city) {
        dom.locationSelector.classList.remove('open');
        return;
      }

      // Actualizar estado de clase activa en la lista
      listItems.forEach(li => li.classList.remove('active'));
      item.classList.add('active');

      // Actualizar estado global y pantalla
      state.currentCity = city;
      state.currentCityName = cityName;
      dom.locationDisplay.textContent = cityName;
      dom.locationSelector.classList.remove('open');

      // Cargar eventos de la nueva región
      loadEventsByCity(city);
    });
  });
}

// ==========================================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================================================
async function initApp() {
  // 1. Iniciar Fondo de Partículas y Cuadrícula
  initCanvas();

  // 2. Iniciar inclinación 3D general
  init3DEffects();

  // 3. Iniciar Dropdown de región
  initLocationDropdown();

  // 4. Configurar eventos de cierre del modal
  dom.modalCloseBtn.addEventListener('click', closeEventModal);
  dom.eventModal.addEventListener('click', (e) => {
    if (e.target === dom.eventModal) {
      closeEventModal();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
      closeEventModal();
    }
  });

  // Re-ajustar efectos 3D si cambia tamaño de pantalla
  window.addEventListener('resize', () => {
    setupCard3DInteractions();
  });

  // 5. Autodetección de Ubicación por IP (Simulación)
  try {
    const locationData = await detectUserLocation();
    state.currentCity = locationData.city;
    state.currentCityName = locationData.cityName;
    dom.locationDisplay.textContent = locationData.cityName;

    // Sincronizar active en el listado del dropdown
    const listItems = dom.locationDropdown.querySelectorAll('li');
    listItems.forEach(li => {
      if (li.getAttribute('data-city') === locationData.city) {
        li.classList.add('active');
      } else {
        li.classList.remove('active');
      }
    });
  } catch (error) {
    console.warn("No se pudo autodetectar ubicación. Usando AMBA por defecto.");
    dom.locationDisplay.textContent = "Buenos Aires (AMBA)";
  }

  // 6. Cargar eventos iniciales filtrados por ubicación detectada
  await loadEventsByCity(state.currentCity);
}

// Arrancar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initApp);
