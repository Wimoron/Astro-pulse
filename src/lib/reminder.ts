/** Daily reminder: a local notification on this phone. Nothing is sent to any server. */
const KEY = 'ap-reminder-v1';
const ID = 4101;
export interface Reminder {
  on: boolean;
  hour: number;
  minute: number;
}
export const DEFAULT_REMINDER: Reminder = { on: false, hour: 18, minute: 0 };

export function loadReminder(): Reminder {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Reminder | null;
    if (j && typeof j.hour === 'number' && typeof j.minute === 'number') return { on: !!j.on, hour: j.hour, minute: j.minute };
  } catch {
    /* blocked or corrupt storage */
  }
  return DEFAULT_REMINDER;
}
function save(r: Reminder) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* storage can be full or blocked */
  }
}

export async function reminderSupported(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Turns the reminder on at the given time, or off. Returns a message when it could not be done. */
export async function setReminder(r: Reminder): Promise<{ ok: boolean; message?: string }> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: ID }] });
    if (!r.on) {
      save(r);
      return { ok: true };
    }
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return { ok: false, message: 'Notifications are blocked. Allow them for AstroPulse in your phone settings, then try again.' };
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID,
          title: 'Today’s star is ready',
          body: 'Is there a planet in it? One minute to find out.',
          schedule: { on: { hour: r.hour, minute: r.minute }, allowWhileIdle: true },
        },
      ],
    });
    save(r);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not set the reminder on this device.' };
  }
}
export async function clearReminder() {
  save(DEFAULT_REMINDER);
  await setReminder(DEFAULT_REMINDER);
}
