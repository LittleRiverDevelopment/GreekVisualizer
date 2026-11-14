/**
 * Named scenarios live in localStorage on this browser only.
 * Nothing is uploaded, and there is no account.
 */

import { parseScenario, serializeScenario } from './url';
import type { AppModel } from './model';

export const STORAGE_KEY = 'greekvisualizer.scenarios.v1';
export const THEME_KEY = 'greekvisualizer.theme';

export interface SavedScenario {
  id: string;
  name: string;
  savedAt: string;
  search: string;
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function loadSavedScenarios(): SavedScenario[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSaved);
  } catch {
    return [];
  }
}

function isSaved(value: unknown): value is SavedScenario {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<SavedScenario>;
  return typeof row.id === 'string' && typeof row.name === 'string' && typeof row.search === 'string' && typeof row.savedAt === 'string';
}

export function writeSavedScenarios(rows: SavedScenario[]): void {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function saveScenario(name: string, model: AppModel): SavedScenario[] {
  const trimmed = name.trim().slice(0, 80);
  const row: SavedScenario = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed || 'Untitled scenario',
    savedAt: new Date().toISOString(),
    search: serializeScenario(model),
  };
  const next = [row, ...loadSavedScenarios()].slice(0, 40);
  writeSavedScenarios(next);
  return next;
}

export function deleteScenario(id: string): SavedScenario[] {
  const next = loadSavedScenarios().filter((row) => row.id !== id);
  writeSavedScenarios(next);
  return next;
}

export function modelFromSaved(row: SavedScenario): ParseResultSafe {
  return parseScenario(row.search);
}

interface ParseResultSafe {
  model: AppModel;
  warning: string | null;
}

export function loadTheme(): 'light' | 'dark' | null {
  if (!canUseStorage()) return null;
  const value = localStorage.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function storeTheme(theme: 'light' | 'dark'): void {
  if (!canUseStorage()) return;
  localStorage.setItem(THEME_KEY, theme);
}
