import { getEvents, detectUserLocation, supabase } from './api/events.js';

// ==========================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================================================
// Constantes para Navegación Diaria
const daysOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const state = {
  currentCity: "AMBA",
  currentCityName: "Buenos Aires (AMBA)",
  events: [],
  userCalendar: JSON.parse(localStorage.getItem('encriptados_calendar')) || [],
  mouse: { x: 0, y: 0, targetX: 0, targetY: 0 },
  currentView: "diario", // 'diario', 'semanal', 'mensual'
  activeDay: daysOrder[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1],
  referenceDate: new Date(), // Fecha enfocada por el calendario
  currentDate: new Date()    // Fecha de hoy real de su sistema
};

let weekDates = {};
const dayTitleMap = {};

function getMondayOfDate(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function recalculateWeek() {
  const monday = getMondayOfDate(state.referenceDate);
  const monthsSpanish = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
  ];
  const daysSpanish = [
    "DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"
  ];

  daysOrder.forEach((day, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    weekDates[day] = d;

    const dayName = daysSpanish[d.getDay()];
    const dayNum = d.getDate();
    const monthName = monthsSpanish[d.getMonth()];
    dayTitleMap[day] = `${dayName}, ${dayNum} DE ${monthName}`;
  });
}

// Inicializar fechas
recalculateWeek();

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
  canvas: document.getElementById('space-canvas'),
  
  // Nuevos selectores para la barra de controles
  viewSwitcher: document.getElementById('view-switcher'),
  timePeriodPill: document.getElementById('time-period-pill'),
  viewTabs: document.querySelectorAll('.view-tab'),
  switcherSlider: document.getElementById('switcher-slider'),
  dayNavigation: document.getElementById('day-navigation'),
  activeDayTitle: document.getElementById('active-day-title'),
  prevDayBtn: document.getElementById('prev-day-btn'),
  nextDayBtn: document.getElementById('next-day-btn'),
  calendarDaysHeader: document.getElementById('calendar-days-header'),
  monthGrid: document.getElementById('calendar-month-grid'),

  // Selectores para Sugerir Evento
  btnSuggestTrigger: document.getElementById('btn-suggest-trigger'),
  suggestModal: document.getElementById('suggest-modal'),
  suggestCloseBtn: document.getElementById('suggest-close-btn'),
  suggestForm: document.getElementById('suggest-form'),
  suggestUrlInput: document.getElementById('suggest-url-input'),
  suggestLoader: document.getElementById('suggest-loader'),
  suggestError: document.getElementById('suggest-error'),
  previewArea: document.getElementById('preview-area'),
  previewCard: document.getElementById('preview-card'),
  previewIndicator: document.getElementById('preview-indicator'),
  previewTags: document.getElementById('preview-tags'),
  previewCardTitle: document.getElementById('preview-card-title'),
  previewCardTime: document.getElementById('preview-card-time'),
  btnConfirmSave: document.getElementById('btn-confirm-save')
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
    const events = await getEvents(city, state.referenceDate);
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

  // Mapeamos los días de las columnas para mobile y marcamos hoy
  const today = new Date();
  dom.columns.forEach(col => {
    const day = col.getAttribute('data-day');
    const d = weekDates[day];
    const isToday = d && d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    
    const baseName = dayNameMap[day] || day;
    col.setAttribute('data-day-full', isToday ? `${baseName} (HOY)` : baseName);

    if (isToday) {
      col.classList.add('today-column');
    } else {
      col.classList.remove('today-column');
    }
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

  // Sincronizar la vista activa al recargar eventos
  if (state.currentView === 'mensual') {
    renderMonthGrid();
  } else if (state.currentView === 'diario') {
    updateActiveDayColumn();
  }
}

/**
 * Crea el elemento DOM para una tarjeta de evento.
 */
function createEventCard(event) {
  const card = document.createElement('article');
  card.className = 'event-card';
  card.dataset.id = event.id;

  const isAdded = state.userCalendar.includes(event.id);
  if (isAdded) {
    card.classList.add('is-saved');
  }

  // 1. Botón de Bookmark (Arriba a la derecha)
  const bookmarkBtn = document.createElement('button');
  bookmarkBtn.className = `btn-bookmark ${isAdded ? 'active' : ''}`;
  bookmarkBtn.setAttribute('aria-label', 'Guardar evento');
  bookmarkBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="${isAdded ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>
  `;
  card.appendChild(bookmarkBtn);

  // 1b. Miniatura del evento (Thumbnail cuadrado)
  const thumbContainer = document.createElement('div');
  thumbContainer.className = 'event-card-thumb';
  const thumbImg = document.createElement('img');
  thumbImg.src = 'src/assets/event-placeholder.png';
  thumbImg.alt = event.title;
  thumbContainer.appendChild(thumbImg);
  card.appendChild(thumbContainer);

  // 2. Título (arriba del evento)
  const title = document.createElement('h3');
  title.className = 'event-card-title';
  title.textContent = event.title;
  card.appendChild(title);

  // 3. Horario (comienzo y fin)
  const parts = event.date.split('-');
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const formattedMonth = months[dateObj.getMonth()];
  const formattedDate = `${dateObj.getDate()} ${formattedMonth} ${dateObj.getFullYear()}`;
  
  const time = document.createElement('span');
  time.className = 'event-card-time';
  time.textContent = `${formattedDate} - ${event.time}`;
  card.appendChild(time);

  // 4. Fila de metadatos (Hashtags + Indicador de Tipo)
  const metaContainer = document.createElement('div');
  metaContainer.className = 'event-card-meta-row';

  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'event-card-tags';
  event.tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = `event-tag tag-${tag.toLowerCase()}`;
    span.textContent = `#${tag}`;
    tagsContainer.appendChild(span);
  });
  metaContainer.appendChild(tagsContainer);

  // Indicador de tipo circular
  const indicator = document.createElement('div');
  indicator.className = `event-badge-indicator ${event.location_type}`;
  if (event.location_type === 'presencial') {
    indicator.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    `;
    indicator.title = 'Presencial';
  } else {
    indicator.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    `;
    indicator.title = 'Virtual';
  }
  metaContainer.appendChild(indicator);
  card.appendChild(metaContainer);

  // 5. Botón de agregar a calendario (abajo de todo)
  const actionDiv = document.createElement('div');
  actionDiv.className = 'event-card-action';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-card-add';
  updateButtonVisualState(addBtn, isAdded);

  // Interacción al agregar al calendario
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDropdownMenu(e, event, addBtn);
  });

  // Interacción al guardar/bookmarkear
  bookmarkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
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
      card.style.borderColor = '';
    });
  });
}

// ==========================================================================
// CONTROL DE VISTAS (DIARIO, SEMANAL, MENSUAL) Y NAVEGACIÓN
// ==========================================================================

function initViewSwitcher() {
  if (!dom.viewSwitcher) return;

  dom.viewTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.getAttribute('data-view');
      switchView(view);
    });
  });

  // Ajustar slider al redimensionar pantalla
  window.addEventListener('resize', () => {
    updateSwitcherSlider();
  });
  
  // Ajuste inicial para posicionar el slider neón sobre la tab por defecto (Diario)
  setTimeout(updateSwitcherSlider, 100);
}

function updateSwitcherSlider() {
  const activeTab = Array.from(dom.viewTabs).find(tab => tab.classList.contains('active'));
  if (activeTab && dom.switcherSlider) {
    dom.switcherSlider.style.left = `${activeTab.offsetLeft}px`;
    dom.switcherSlider.style.width = `${activeTab.offsetWidth}px`;
  }
}

function switchView(viewName) {
  state.currentView = viewName;

  // Actualizar clases activas en pestañas
  dom.viewTabs.forEach(tab => {
    if (tab.getAttribute('data-view') === viewName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  updateSwitcherSlider();

  // Mostrar / Ocultar componentes según la vista seleccionada
  if (viewName === 'diario') {
    dom.dayNavigation.classList.remove('hidden');
    dom.calendarDaysHeader.style.display = 'none';
    dom.calendarGrid.style.display = 'grid';
    dom.monthGrid.classList.remove('active');

    dom.calendarGrid.className = 'calendar-grid view-diario';
    
    // Activar la columna correspondiente
    updateActiveDayColumn();
  } else if (viewName === 'semanal') {
    dom.dayNavigation.classList.remove('hidden'); // Mostrar navegación
    // En mobile ocultamos la cabecera semanal por CSS, en desktop la mostramos
    if (window.innerWidth > 768) {
      dom.calendarDaysHeader.style.display = 'grid';
    } else {
      dom.calendarDaysHeader.style.display = 'none';
    }
    dom.calendarGrid.style.display = 'grid';
    dom.monthGrid.classList.remove('active');

    dom.calendarGrid.className = 'calendar-grid view-semanal';

    // Asegurarse de que todas las columnas de días se muestren (limpiar active-day-col)
    dom.columns.forEach(col => {
      col.classList.remove('active-day-col');
    });
  } else if (viewName === 'mensual') {
    dom.dayNavigation.classList.remove('hidden'); // Mostrar navegación
    dom.calendarDaysHeader.style.display = 'none'; // Ocultar cabecera en mensual para evitar confusión
    dom.calendarGrid.style.display = 'none';
    dom.monthGrid.classList.add('active');

    renderMonthGrid();
  }

  // Actualizar el título de la navegación según la vista
  updateNavigationTitle();

  // Recalcular interacciones 3D para adaptarlas
  setupCard3DInteractions();

  // Actualizar estado del pill temporal
  updatePeriodPillState();
}

function updateActiveDayColumn() {
  dom.columns.forEach(col => {
    const day = col.getAttribute('data-day');
    if (day === state.activeDay) {
      col.classList.add('active-day-col');
    } else {
      col.classList.remove('active-day-col');
    }
  });

  updateNavigationTitle();
}

function initDayNavigation() {
  if (!dom.prevDayBtn || !dom.nextDayBtn) return;

  dom.prevDayBtn.addEventListener('click', () => {
    navigateCalendar(-1);
  });

  dom.nextDayBtn.addEventListener('click', () => {
    navigateCalendar(1);
  });
}

async function navigateCalendar(direction) {
  if (state.currentView === 'diario') {
    const currentIndex = daysOrder.indexOf(state.activeDay);
    let newIndex = currentIndex + direction;

    if (newIndex < 0) {
      // Retroceder 1 semana
      state.referenceDate.setDate(state.referenceDate.getDate() - 7);
      recalculateWeek();
      state.activeDay = 'SUN';
      await loadEventsForCurrentWeek();
    } else if (newIndex >= daysOrder.length) {
      // Avanzar 1 semana
      state.referenceDate.setDate(state.referenceDate.getDate() + 7);
      recalculateWeek();
      state.activeDay = 'MON';
      await loadEventsForCurrentWeek();
    } else {
      state.activeDay = daysOrder[newIndex];
      updateActiveDayColumn();
      updatePeriodPillState();
    }
  } else if (state.currentView === 'semanal') {
    // Avanzar/Retroceder 1 semana
    state.referenceDate.setDate(state.referenceDate.getDate() + (direction * 7));
    recalculateWeek();
    await loadEventsForCurrentWeek();
  } else if (state.currentView === 'mensual') {
    // Avanzar/Retroceder 1 mes
    state.referenceDate.setMonth(state.referenceDate.getMonth() + direction);
    state.referenceDate.setDate(1); // Día 1 seguro
    recalculateWeek();
    await loadEventsForCurrentWeek();
  }
}

async function loadEventsForCurrentWeek() {
  await loadEventsByCity(state.currentCity);
  renderWeekDaysHeader();
  if (state.currentView === 'diario') {
    updateActiveDayColumn();
  } else if (state.currentView === 'mensual') {
    renderMonthGrid();
  }
  updateNavigationTitle();
  updatePeriodPillState();
}

function renderWeekDaysHeader() {
  if (!dom.calendarDaysHeader) return;
  const headers = dom.calendarDaysHeader.querySelectorAll('.day-label-col');
  const dayHeaderMap = {
    MON: "LUN",
    TUE: "MAR",
    WED: "MIÉ",
    THU: "JUE",
    FRI: "VIE",
    SAT: "SÁB",
    SUN: "DOM"
  };

  daysOrder.forEach((day, index) => {
    if (headers[index]) {
      const label = dayHeaderMap[day] || day;
      if (state.currentView === 'mensual') {
        headers[index].innerHTML = label;
      } else {
        const d = weekDates[day];
        const dayNum = d.getDate();
        const today = new Date();
        const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        
        if (isToday) {
          headers[index].innerHTML = `<span class="header-day-num" style="color: var(--neon-purple); text-shadow: 0 0 5px rgba(138, 43, 226, 0.6); font-size: 14px; display: block; margin-top: 4px;">${dayNum} <span style="font-size: 9px; font-weight: 800; vertical-align: middle; background: rgba(138, 43, 226, 0.2); padding: 1px 4px; border-radius: 4px; border: 1px solid rgba(138, 43, 226, 0.4); margin-left: 2px;">HOY</span></span>`;
        } else {
          headers[index].innerHTML = `<span class="header-day-num" style="color: var(--neon-cyan); text-shadow: 0 0 5px rgba(0, 255, 255, 0.3); font-size: 14px; display: block; margin-top: 4px;">${dayNum}</span>`;
        }
      }
    }
  });
}

function updateNavigationTitle() {
  if (!dom.activeDayTitle) return;

  const monthsSpanish = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
  ];
  const daysSpanish = [
    "DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"
  ];

  if (state.currentView === 'diario') {
    const d = weekDates[state.activeDay];
    if (d) {
      const dayName = daysSpanish[d.getDay()];
      const dayNum = d.getDate();
      const monthName = monthsSpanish[d.getMonth()];
      dom.activeDayTitle.textContent = `${dayName}, ${dayNum} DE ${monthName}`;
    }
  } else if (state.currentView === 'semanal') {
    const mon = weekDates['MON'];
    const sun = weekDates['SUN'];
    if (mon && sun) {
      const monNum = mon.getDate();
      const monMonth = monthsSpanish[mon.getMonth()];
      const sunNum = sun.getDate();
      const sunMonth = monthsSpanish[sun.getMonth()];
      const year = mon.getFullYear();

      if (mon.getMonth() === sun.getMonth()) {
        dom.activeDayTitle.textContent = `SEMANA DEL ${monNum} AL ${sunNum} DE ${monMonth} ${year}`;
      } else {
        dom.activeDayTitle.textContent = `SEMANA DEL ${monNum} DE ${monMonth} AL ${sunNum} DE ${sunMonth} ${year}`;
      }
    }
  } else if (state.currentView === 'mensual') {
    const year = state.referenceDate.getFullYear();
    const monthName = monthsSpanish[state.referenceDate.getMonth()];
    dom.activeDayTitle.textContent = `${monthName} ${year}`;
  }
}

function updatePeriodPillState() {
  if (!dom.timePeriodPill) return;

  const today = new Date();
  let text = '';
  let isActive = false;

  if (state.currentView === 'diario') {
    text = 'Hoy';
    const ref = state.referenceDate;
    const isSameDate = ref.getDate() === today.getDate() &&
                       ref.getMonth() === today.getMonth() &&
                       ref.getFullYear() === today.getFullYear();
    const todayDayOfWeek = daysOrder[today.getDay() === 0 ? 6 : today.getDay() - 1];
    isActive = isSameDate && (state.activeDay === todayDayOfWeek);
  } else if (state.currentView === 'semanal') {
    text = 'Esta semana';
    const refMonday = getMondayOfDate(state.referenceDate);
    const todayMonday = getMondayOfDate(today);
    isActive = refMonday.getDate() === todayMonday.getDate() &&
               refMonday.getMonth() === todayMonday.getMonth() &&
               refMonday.getFullYear() === todayMonday.getFullYear();
  } else if (state.currentView === 'mensual') {
    text = 'Este mes';
    isActive = state.referenceDate.getMonth() === today.getMonth() &&
               state.referenceDate.getFullYear() === today.getFullYear();
  }

  dom.timePeriodPill.textContent = text;
  if (isActive) {
    dom.timePeriodPill.classList.add('active');
  } else {
    dom.timePeriodPill.classList.remove('active');
  }
}

function renderMonthGrid() {
  if (!dom.monthGrid) return;

  dom.monthGrid.innerHTML = '';

  const year = state.referenceDate.getFullYear();
  const month = state.referenceDate.getMonth();

  const firstDay = new Date(year, month, 1);
  let inactiveDaysBefore = firstDay.getDay() - 1;
  if (inactiveDaysBefore < 0) inactiveDaysBefore = 6;

  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const totalDaysInPrevMonth = new Date(year, month, 0).getDate();
  const prevMonthStartDay = totalDaysInPrevMonth - inactiveDaysBefore + 1;

  const totalCells = Math.ceil((inactiveDaysBefore + totalDaysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'month-cell';

    const dayOfWeek = daysOrder[i % 7];

    if (i < inactiveDaysBefore) {
      cell.classList.add('inactive');
      const dayNum = prevMonthStartDay + i;
      cell.innerHTML = `<span class="month-day-num">${dayNum}</span>`;
    } else if (i >= inactiveDaysBefore + totalDaysInMonth) {
      cell.classList.add('inactive');
      const dayNum = i - (inactiveDaysBefore + totalDaysInMonth) + 1;
      cell.innerHTML = `<span class="month-day-num">${dayNum}</span>`;
    } else {
      const dayNum = i - inactiveDaysBefore + 1;
      const cellDate = new Date(year, month, dayNum);

      cell.setAttribute('data-day-num', dayNum);
      cell.setAttribute('data-day-of-week', dayOfWeek);

      const dayNumSpan = document.createElement('span');
      dayNumSpan.className = 'month-day-num';
      dayNumSpan.textContent = dayNum;
      cell.appendChild(dayNumSpan);

      // Resaltar si es hoy real (día de hoy en el sistema)
      const today = new Date();
      if (dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
        cell.classList.add('today');
      }

      // Buscar eventos del día formateado en YYYY-MM-DD
      const mmStr = String(month + 1).padStart(2, '0');
      const ddStr = String(dayNum).padStart(2, '0');
      const dateStr = `${year}-${mmStr}-${ddStr}`;

      const dayEvents = state.events.filter(e => e.date === dateStr);

      if (dayEvents.length > 0) {
        cell.classList.add('has-events');

        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'month-cell-events-container';

        dayEvents.forEach(event => {
          const card = createEventCard(event);
          card.addEventListener('click', (e) => {
            e.stopPropagation();
            openEventModal(event);
          });
          eventsContainer.appendChild(card);
        });

        cell.appendChild(eventsContainer);
      }

      cell.addEventListener('click', () => {
        state.referenceDate = new Date(year, month, dayNum);
        recalculateWeek();
        state.activeDay = dayOfWeek;
        
        loadEventsForCurrentWeek().then(() => {
          switchView('diario');
        });
      });
    }

    dom.monthGrid.appendChild(cell);
  }
}

// ==========================================================================
// INTERACCIONES CON EL CALENDARIO (GUARDADO / TOASTS)
// ==========================================================================

/**
 * Agrega o elimina un evento de favoritos (local storage) y sincroniza los botones.
 */
function toggleCalendarEvent(event, buttonElement) {
  const index = state.userCalendar.indexOf(event.id);
  const isAdding = index === -1;

  if (isAdding) {
    state.userCalendar.push(event.id);
    showToast("EVENTO REGISTRADO", `${event.title} añadido a tus favoritos.`, "success");
  } else {
    state.userCalendar.splice(index, 1);
    showToast("EVENTO ELIMINADO", `${event.title} removido de tus favoritos.`, "info");
  }

  // Guardar en almacenamiento local
  localStorage.setItem('encriptados_calendar', JSON.stringify(state.userCalendar));

  // Sincronizar el estado de todos los botones visibles de este evento (grilla y modal)
  syncAllButtonsForEvent(event.id);
}

/**
 * Sincroniza visualmente todos los botones que corresponden a un evento específico.
 */
function syncAllButtonsForEvent(eventId) {
  const isAdded = state.userCalendar.includes(eventId);
  
  // Sincronizar tarjetas de la grilla
  const cards = document.querySelectorAll(`.event-card[data-id="${eventId}"]`);
  cards.forEach(card => {
    // Sincronizar clase de guardado para el borde
    if (isAdded) {
      card.classList.add('is-saved');
    } else {
      card.classList.remove('is-saved');
    }

    // Sincronizar botón de bookmark
    const bookmarkBtn = card.querySelector('.btn-bookmark');
    if (bookmarkBtn) {
      if (isAdded) {
        bookmarkBtn.classList.add('active');
        const svg = bookmarkBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', 'currentColor');
      } else {
        bookmarkBtn.classList.remove('active');
        const svg = bookmarkBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', 'none');
      }
    }

    // Sincronizar botón de agregar
    const btn = card.querySelector('.btn-card-add');
    if (btn) updateButtonVisualState(btn, isAdded);
  });
  
  // Sincronizar botón del modal si está abierto
  if (currentActiveModalEventId === eventId && dom.modalAddBtn) {
    updateButtonVisualState(dom.modalAddBtn, isAdded);
  }
}

/**
 * Actualiza el estado y diseño visual de los botones de agregar al calendario.
 */
function updateButtonVisualState(buttonElement, isAdded) {
  if (!buttonElement) return;
  if (isAdded) {
    buttonElement.innerHTML = `
      <span>En mi calendario</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 13px; height: 13px; margin-left: 6px;">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    `;
    buttonElement.classList.add('added');
  } else {
    buttonElement.innerHTML = `
      <span>Añadir al calendario</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 13px; height: 13px; margin-left: 6px;">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    `;
    buttonElement.classList.remove('added');
  }
  // Limpiar estilos en línea previos
  buttonElement.style.background = '';
  buttonElement.style.borderColor = '';
  buttonElement.style.color = '';
  buttonElement.style.boxShadow = '';
}

/**
 * Despliega el menú flotante con las opciones de calendario para un evento.
 */
function openDropdownMenu(e, event, triggerElement) {
  e.stopPropagation();
  
  // Cerrar cualquier dropdown abierto antes
  closeAllDropdowns();
  
  const dropdown = document.createElement('div');
  dropdown.className = 'calendar-dropdown';
  
  const isSaved = state.userCalendar.includes(event.id);
  dropdown.innerHTML = `
    <button class="dropdown-item local-save ${isSaved ? 'saved' : ''}" data-action="local">
      <span class="item-icon">${isSaved ? '★' : '☆'}</span>
      <span>${isSaved ? 'Quitar de Favoritos' : 'Guardar en el Sitio'}</span>
    </button>
    <div class="dropdown-divider"></div>
    <a class="dropdown-item" href="${getGoogleCalendarUrl(event)}" target="_blank" data-action="google">
      <span class="item-icon">🌐</span>
      <span>Google Calendar</span>
    </a>
    <a class="dropdown-item" href="${getOutlookUrl(event, false)}" target="_blank" data-action="outlook">
      <span class="item-icon">✉️</span>
      <span>Outlook Web</span>
    </a>
    <a class="dropdown-item" href="${getOutlookUrl(event, true)}" target="_blank" data-action="office365">
      <span class="item-icon">🏢</span>
      <span>Microsoft 365</span>
    </a>
    <a class="dropdown-item" href="${getYahooUrl(event)}" target="_blank" data-action="yahoo">
      <span class="item-icon">🟣</span>
      <span>Yahoo Calendar</span>
    </a>
    <button class="dropdown-item" data-action="apple">
      <span class="item-icon">🍎</span>
      <span>Apple Calendar (.ics)</span>
    </button>
  `;
  
  // Obtener posición del disparador
  const rect = triggerElement.getBoundingClientRect();
  
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${rect.bottom + 6}px`;
  dropdown.style.left = `${rect.right - 180}px`;
  dropdown.style.width = '180px';
  dropdown.style.zIndex = '9999';
  
  // Manejador del archivo de Apple (.ics)
  dropdown.querySelector('[data-action="apple"]').addEventListener('click', () => {
    downloadIcsFile(event);
    showToast("ARCHIVO DESCARGADO", "Archivo iCal (.ics) guardado con éxito.", "success");
    closeAllDropdowns();
  });
  
  // Manejador del favorito local
  dropdown.querySelector('[data-action="local"]').addEventListener('click', () => {
    toggleCalendarEvent(event, triggerElement);
    closeAllDropdowns();
  });
  
  // Mostrar Toast informando que se abre el enlace para servicios externos
  dropdown.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      const name = link.querySelector('span:last-child').textContent;
      showToast("REDIRECCIONANDO", `Abriendo ${name}...`, "info");
      closeAllDropdowns();
    });
  });
  
  document.body.appendChild(dropdown);
  
  // Forzar reflow y mostrar con transición suave
  requestAnimationFrame(() => {
    dropdown.classList.add('show');
  });
  
  // Event listeners globales para cerrar dropdowns
  setTimeout(() => {
    document.addEventListener('click', closeAllDropdownsOnOutsideClick);
    window.addEventListener('scroll', closeAllDropdowns, { passive: true });
    window.addEventListener('resize', closeAllDropdowns, { passive: true });
  }, 0);
}

function closeAllDropdowns() {
  const dropdowns = document.querySelectorAll('.calendar-dropdown');
  dropdowns.forEach(d => {
    d.classList.remove('show');
    setTimeout(() => d.remove(), 150);
  });
  document.removeEventListener('click', closeAllDropdownsOnOutsideClick);
  window.removeEventListener('scroll', closeAllDropdowns);
  window.removeEventListener('resize', closeAllDropdowns);
}

function closeAllDropdownsOnOutsideClick(e) {
  if (!e.target.closest('.calendar-dropdown') && !e.target.closest('.btn-card-add') && !e.target.closest('.calendar-add-btn')) {
    closeAllDropdowns();
  }
}

// ==========================================================================
// FORMATEADORES Y PARSER PARA SERVICIOS DE CALENDARIO
// ==========================================================================

function parseEventTimes(dateStr, timeStr) {
  const parts = timeStr.split("-").map(s => s.trim());
  const startHourMin = parts[0].split(":");
  const endHourMin = parts[1].split(":");
  
  const [year, month, day] = dateStr.split("-").map(Number);
  
  const start = new Date(year, month - 1, day, Number(startHourMin[0]), Number(startHourMin[1]), 0);
  const end = new Date(year, month - 1, day, Number(endHourMin[0]), Number(endHourMin[1]), 0);
  
  return { start, end };
}

function formatIsoDate(d) {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function getGoogleCalendarUrl(event) {
  const { start, end } = parseEventTimes(event.date, event.time);
  const fmtStart = formatIsoDate(start);
  const fmtEnd = formatIsoDate(end);
  
  const baseUrl = "https://calendar.google.com/calendar/render";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${fmtStart}/${fmtEnd}`,
    details: event.description || "",
    location: event.location_detail || ""
  });
  return `${baseUrl}?${params.toString()}`;
}

function getOutlookUrl(event, isOffice365 = false) {
  const { start, end } = parseEventTimes(event.date, event.time);
  const baseUrl = isOffice365 
    ? "https://outlook.office.com/calendar/0/deeplink/compose"
    : "https://outlook.live.com/calendar/0/deeplink/compose";
  
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: event.description || "",
    location: event.location_detail || ""
  });
  return `${baseUrl}?${params.toString()}`;
}

function getYahooUrl(event) {
  const { start, end } = parseEventTimes(event.date, event.time);
  const baseUrl = "https://calendar.yahoo.com/";
  const params = new URLSearchParams({
    v: "60",
    title: event.title,
    st: formatIsoDate(start),
    et: formatIsoDate(end),
    desc: event.description || "",
    in_loc: event.location_detail || ""
  });
  return `${baseUrl}?${params.toString()}`;
}

function downloadIcsFile(event) {
  const { start, end } = parseEventTimes(event.date, event.time);
  const fmtStart = formatIsoDate(start);
  const fmtEnd = formatIsoDate(end);
  
  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Encriptados//Calendar Event//ES
BEGIN:VEVENT
UID:${event.id}-${Date.now()}@encriptados
DTSTAMP:${formatIsoDate(new Date())}
DTSTART:${fmtStart}
DTEND:${fmtEnd}
SUMMARY:${event.title}
DESCRIPTION:${(event.description || "").replace(/\n/g, "\\n")}
LOCATION:${event.location_detail || ""}
END:VEVENT
END:VCALENDAR`;

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================
function showToast(title, message, type = 'success') {
  if (!dom.toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const isDanger = type === 'danger' || type === 'error';
  const iconHtml = isDanger 
    ? `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
         <circle cx="12" cy="12" r="10"></circle>
         <line x1="12" y1="8" x2="12" y2="12"></line>
         <line x1="12" y1="16" x2="12.01" y2="16"></line>
       </svg>`
    : `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
         <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
         <polyline points="22 4 12 14.01 9 11.01"></polyline>
       </svg>`;

  toast.innerHTML = `
    ${iconHtml}
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
  const isAdded = state.userCalendar.includes(event.id);
  updateButtonVisualState(dom.modalAddBtn, isAdded);

  // Quitar listener anterior y añadir el nuevo para abrir el dropdown al hacer click
  dom.modalAddBtn.onclick = (e) => {
    e.stopPropagation();
    openDropdownMenu(e, event, dom.modalAddBtn);
  };

  // Abrir modal con animación
  dom.eventModal.classList.add('open');
  document.body.style.overflow = 'hidden'; // Evitar scroll
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
      loadEventsForCurrentWeek();
    });
  });
}

// ==========================================================================
// SUGERIR EVENTO: SCRAPING Y PREVISUALIZACIÓN CON IA
// ==========================================================================

function initSuggestModal() {
  if (!dom.btnSuggestTrigger || !dom.suggestModal) return;

  // Abrir modal al clickear disparador
  dom.btnSuggestTrigger.addEventListener('click', () => {
    dom.suggestModal.showModal();
    resetSuggestModal();
  });

  // Cerrar al clickear botón de cerrar
  dom.suggestCloseBtn.addEventListener('click', () => {
    dom.suggestModal.close();
    resetSuggestModal();
  });

  // Fallback de light-dismiss para navegadores que no lo soportan nativamente
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    dom.suggestModal.addEventListener('click', (event) => {
      if (event.target !== dom.suggestModal) return;
      const rect = dom.suggestModal.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isDialogContent) {
        dom.suggestModal.close();
        resetSuggestModal();
      }
    });
  }

  // Interacción al enviar formulario
  dom.suggestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = dom.suggestUrlInput.value.trim();
    if (!url) return;

    // Resetear estados visuales
    dom.suggestError.classList.add('hidden');
    dom.previewArea.classList.add('hidden');
    dom.suggestLoader.classList.remove('hidden');
    dom.suggestForm.classList.add('hidden'); // Ocultar input durante carga

    try {
      if (!supabase) {
        throw new Error("El cliente de base de datos no está inicializado.");
      }

      console.log(`Invocando suggest-event Edge Function para: ${url}`);
      const { data, error } = await supabase.functions.invoke('suggest-event', {
        body: { url }
      });

      if (error) {
        // Intentar parsear el JSON de error si existe
        let errorMsg = "Error al analizar el evento con IA.";
        try {
          const bodyErr = JSON.parse(error.message);
          errorMsg = bodyErr.error || errorMsg;
        } catch {
          errorMsg = error.message || errorMsg;
        }
        throw new Error(errorMsg);
      }

      if (!data) {
        throw new Error("No se devolvieron datos para este evento.");
      }

      // Guardar temporalmente en el estado global para guardar al confirmar
      state.lastScrapedEvent = data;

      // Renderizar vista previa 3D de la tarjeta
      renderSuggestPreviewCard(data);

      // Mostrar previsualización
      dom.previewArea.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      dom.suggestError.textContent = err.message || "Ocurrió un error inesperado al analizar el evento.";
      dom.suggestError.classList.remove('hidden');
      dom.suggestForm.classList.remove('hidden'); // Volver a mostrar form en caso de error
    } finally {
      dom.suggestLoader.classList.add('hidden');
    }
  });

  // Confirmar y Guardar en la base de datos
  dom.btnConfirmSave.addEventListener('click', async () => {
    if (!state.lastScrapedEvent) return;

    dom.btnConfirmSave.disabled = true;
    const originalText = dom.btnConfirmSave.innerHTML;
    dom.btnConfirmSave.innerHTML = `
      <div class="cyber-spinner" style="width: 14px; height: 14px; border-width: 2px; border-top-color: var(--neon-cyan); border-bottom-color: var(--neon-purple); display: inline-block; vertical-align: middle;"></div>
      <span style="vertical-align: middle; margin-left: 6px;">Guardando...</span>
    `;

    try {
      const { error } = await supabase
        .from('events')
        .insert(state.lastScrapedEvent);

      if (error) {
        // Manejar duplicado de luma_url
        if (error.code === '23505') {
          throw new Error("Este evento ya ha sido registrado previamente.");
        }
        throw new Error(error.message || "No se pudo guardar el evento en la base de datos.");
      }

      // Éxito
      showToast("EVENTO AGREGADO", `"${state.lastScrapedEvent.title}" se publicó correctamente.`, "success");
      dom.suggestModal.close();
      resetSuggestModal();

      // Forzar recarga de los eventos en la grilla y el calendario
      await loadEventsForCurrentWeek();
    } catch (err) {
      console.error(err);
      showToast("ERROR AL PUBLICAR", err.message, "danger");
      dom.btnConfirmSave.innerHTML = originalText;
      dom.btnConfirmSave.disabled = false;
    }
  });
}

function resetSuggestModal() {
  dom.suggestForm.reset();
  dom.suggestForm.classList.remove('hidden');
  dom.suggestLoader.classList.add('hidden');
  dom.suggestError.classList.add('hidden');
  dom.previewArea.classList.add('hidden');
  state.lastScrapedEvent = null;
  dom.btnConfirmSave.disabled = false;
}

function renderSuggestPreviewCard(event) {
  if (!dom.previewCard) return;

  // Actualizar indicador circular (presencial / virtual)
  const indicator = dom.previewIndicator;
  if (indicator) {
    indicator.className = `event-badge-indicator ${event.location_type}`;
    if (event.location_type === 'presencial') {
      indicator.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      `;
      indicator.title = 'Presencial';
    } else {
      indicator.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 7l-7 5 7 5V7z" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      `;
      indicator.title = 'Virtual';
    }
  }

  // Título
  dom.previewCardTitle.textContent = event.title;

  // Tiempo
  const parts = event.event_date.split('-');
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const formattedMonth = months[dateObj.getMonth()];
  const formattedDate = `${dateObj.getDate()} ${formattedMonth} ${dateObj.getFullYear()}`;
  dom.previewCardTime.textContent = `${formattedDate} - ${event.time_range}`;

  // Tags
  dom.previewTags.innerHTML = '';
  event.tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = `event-tag tag-${tag.toLowerCase()}`;
    span.textContent = `#${tag}`;
    dom.previewTags.appendChild(span);
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

  // Iniciar Selector de Vistas y Navegación Diaria
  initViewSwitcher();
  initDayNavigation();

  // Inicializar botón/pill de período temporal
  if (dom.timePeriodPill) {
    dom.timePeriodPill.addEventListener('click', async () => {
      const today = new Date();
      state.referenceDate = new Date(today);
      const todayDayOfWeek = daysOrder[today.getDay() === 0 ? 6 : today.getDay() - 1];
      state.activeDay = todayDayOfWeek;
      recalculateWeek();
      await loadEventsForCurrentWeek();
    });
  }

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

  // Inicializar modal de sugerencias
  initSuggestModal();

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

  // 6. Cargar eventos iniciales filtrados por ubicación detectada y configurar fechas
  recalculateWeek();
  await loadEventsForCurrentWeek();

  // 7. Inicializar la vista predeterminada (Diario)
  switchView(state.currentView);
}

// Arrancar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initApp);
