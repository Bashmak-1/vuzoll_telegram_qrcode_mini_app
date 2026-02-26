// === GLOBAL CONFIG & STATE ===
const tg = window.Telegram.WebApp;
tg.expand();

const HEADERS = { 
    "Content-Type": "application/json", 
    "ngrok-skip-browser-warning": "true" 
};

// Стан додатка
let API_BASE = "";
let cart = []; // Кошик товарів
let currentUserRole = 'worker'; // Роль за замовчуванням
let currentPollingInterval = 5000; // 5 сек
let pollingTimer = null;
let lastUserActionTime = Date.now();

// Конфігурація полінгу
const POLLING_MIN_INTERVAL = 5000;
const POLLING_MAX_INTERVAL = 60000;
const POLLING_GROWTH_FACTOR = 1.5;

// Локальний буфер логів
const debugLogs = [];