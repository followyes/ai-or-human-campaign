// Original, synthesized UI sounds — no external media or music files.
const AUDIO_SETTING_KEY = "ai-or-human.campaign.sounds.v1";
const SUCCESS_NOTES = Object.freeze([
  { at: 0, frequency: 560, endFrequency: 700, length: .115, volume: .11, wave: "sine" },
  { at: .095, frequency: 800, endFrequency: 1000, length: .19, volume: .095, wave: "sine" }
]);
const FAILURE_NOTES = Object.freeze([
  { at: 0, frequency: 355, endFrequency: 270, length: .20, volume: .10, wave: "triangle" },
  { at: .11, frequency: 250, endFrequency: 185, length: .23, volume: .07, wave: "sine" }
]);

export function createCampaignSounds() {
  let context = null;
  let fallbackEnabled = true;
  function isEnabled() {
    try {
      const stored = window.localStorage.getItem(AUDIO_SETTING_KEY);
      return stored === null ? fallbackEnabled : stored !== "off";
    } catch { return fallbackEnabled; }
  }
  function setEnabled(value) {
    fallbackEnabled = Boolean(value);
    try { window.localStorage.setItem(AUDIO_SETTING_KEY, value ? "on" : "off"); }
    catch { /* Still respect mute for the current session. */ }
  }
  function play(type) {
    if (!isEnabled()) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return; // Graceful fallback for old or restrictive browsers.
    try {
      if (!context || context.state === "closed") context = new Context();
      if (context.state === "suspended") void context.resume().catch(() => {});
      const notes = type === "success" ? SUCCESS_NOTES : FAILURE_NOTES;
      const start = context.currentTime + .01;
      notes.forEach(note => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = note.wave;
        oscillator.frequency.setValueAtTime(note.frequency, start + note.at);
        oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, start + note.at + note.length);
        gain.gain.setValueAtTime(.0001, start + note.at);
        gain.gain.exponentialRampToValueAtTime(note.volume, start + note.at + .022);
        gain.gain.exponentialRampToValueAtTime(.0001, start + note.at + note.length);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start + note.at);
        oscillator.stop(start + note.at + note.length + .015);
      });
    } catch { /* Audio is optional. Never interrupt gameplay. */ }
  }
  return { isEnabled, setEnabled, play };
}
