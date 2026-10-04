import { useSyncExternalStore } from 'react';

// Per-browser (localStorage, not synced to the hub) — whether a device
// chimes is a property of the device/browser, like tab-audio muting.
const SOUND_KEY = 'citinet-notification-sound';
const soundUrl = (file: string) => `${import.meta.env.BASE_URL ?? '/'}sounds/${file}`.replace(/\/{2,}/g, '/');
const SOUND_URL = soundUrl('new-notification.mp3');
const ACCEPT_URL = soundUrl('accept.mp3');

const soundListeners = new Set<() => void>();

export function isNotificationSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
  } catch {
    /* private mode etc. — preference just won't persist */
  }
  soundListeners.forEach((l) => l());
}

export function useNotificationSoundEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      soundListeners.add(l);
      return () => {
        soundListeners.delete(l);
      };
    },
    isNotificationSoundEnabled,
    () => true,
  );
}

let audio: HTMLAudioElement | null = null;

// Browsers block audio until the user has interacted with the page once; a
// rejected play() (fresh tab, nothing clicked yet) is expected, not an error.
export function playNotificationSound(): void {
  if (!isNotificationSoundEnabled()) return;
  try {
    if (!audio) audio = new Audio(SOUND_URL);
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    /* no audio support — silently skip */
  }
}

let acceptAudio: HTMLAudioElement | null = null;

// Short confirmation for a finished upload (whole batch sent). Shares the
// notification-sound toggle — one switch for every sound the app makes on its
// own, same as mobile. Never throws: a failed chime must not turn a
// successful upload into an error.
export function playUploadCompleteSound(): void {
  if (!isNotificationSoundEnabled()) return;
  try {
    if (!acceptAudio) acceptAudio = new Audio(ACCEPT_URL);
    acceptAudio.currentTime = 0;
    acceptAudio.play().catch(() => {});
  } catch {
    /* no audio support — silently skip */
  }
}

// Conversation currently open on the Messages screen — so a message in the
// thread you're already reading doesn't chime. Module-level: read from a
// poll callback, never rendered.
let activeConversationId: string | null = null;
export function setActiveConversation(id: string | null): void {
  activeConversationId = id;
}
export function getActiveConversation(): string | null {
  return activeConversationId;
}
