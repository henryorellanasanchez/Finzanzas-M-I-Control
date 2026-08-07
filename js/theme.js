/* Tema claro/oscuro con modo sistema y sincronizacion automatica. */
import { THEME_KEY } from './constants.js';
import { state } from './state.js';

const THEME_COLORS = { light: '#F7F3EA', dark: '#1B1916' };
let systemThemeQuery = null;

function systemTheme(){
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function syncStatusBarColor(theme){
  const meta = document.getElementById('meta-theme-color');
  if(meta) meta.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.light);
}

export function applyTheme(mode){
  const effective = mode==='system' ? systemTheme() : mode;
  if(effective==='dark'){
    document.documentElement.setAttribute('data-theme','dark');
    document.getElementById('theme-toggle').textContent='☼';
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('theme-toggle').textContent='◐';
  }
  document.documentElement.dataset.themeMode = mode;
  const selector = document.getElementById('theme-mode');
  if(selector) selector.value = mode;
  syncStatusBarColor(effective);
  setTimeout(async ()=>{
    if(state.appBootstrapped){
      const { refresh } = await import('./ui.js');
      refresh();
    }
  }, 50);
}

export function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
  applyTheme(cur);
  try{ localStorage.setItem(THEME_KEY, cur); }catch(e){}
}

export function changeThemeMode(mode){
  const next = ['system','light','dark'].includes(mode) ? mode : 'system';
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
  applyTheme(next);
}

export function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch(e){}
  const mode = ['dark','light','system'].includes(saved) ? saved : 'system';
  applyTheme(mode);
  systemThemeQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if(systemThemeQuery){
    const onSystemThemeChange = ()=>{
      let current = 'system';
      try{ current = localStorage.getItem(THEME_KEY) || 'system'; }catch(e){}
      if(current==='system') applyTheme('system');
    };
    if(systemThemeQuery.addEventListener) systemThemeQuery.addEventListener('change', onSystemThemeChange);
    else if(systemThemeQuery.addListener) systemThemeQuery.addListener(onSystemThemeChange);
  }
}
