import { SESSION_TAPE_LENGTH_IN_SECONDS } from '../story/sessionTape.js';

/**
 * The Session 14 tape as the deck on the lab's desk plays it: its sound and
 * its clock.
 *
 * The tape's own soundtrack -- the room, the restraints, the fall, the alarm
 * -- is src/assets/audio/tape/session_14.m4a, built by
 * blender/build_session_tape_audio.py. The two voices are separate clips the
 * host plays at their subtitles' times. Until the soundtrack exists the tape
 * runs on a clock of its own and the host plays stand-in sounds over it.
 *
 * The soundtrack is found with an import.meta.glob for the same reason the
 * voice clips are (world/AudioEngine.js): a plain import of a file that is not
 * there fails the BUILD, and a glob that matches nothing is just empty.
 *
 * Whichever it is, the caller sees the same thing: the `audio` to route
 * through the mixer, a clock, and whether the tape is moving.
 */
const AUDIO_FILES = import.meta.glob('../assets/audio/tape/session_14.{m4a,mp3,ogg,wav}', {
  query: '?url',
  import: 'default',
  eager: true
});
const AUDIO_URL = Object.values(AUDIO_FILES)[0] ?? null;

/**
 * The tape the deck plays.
 *
 * @returns {{
 *   hasRecording: boolean,
 *   audio: HTMLAudioElement|null,
 *   currentTimeInSeconds: number,
 *   durationInSeconds: number,
 *   isRunning: boolean,
 *   hasEnded: boolean,
 *   play: () => void,
 *   stop: () => void,
 *   update: (deltaTimeInSeconds: number) => void
 * }}
 */
export function createSessionTapeSource() {
  let audio = null;
  if (AUDIO_URL) {
    audio = document.createElement('audio');
    audio.src = AUDIO_URL;
    audio.preload = 'auto';
    // A file that will not decode falls back to the stand-in rather than
    // leaving the deck turning over silence that never ends.
    audio.addEventListener('error', () => {
      console.warn('[tape] session_14 audio failed to load -- using the stand-in', audio.error);
      audio = null;
    });
  }

  let playing = false;
  let paused = false;
  let failed = false;
  let placeholderTime = 0;
  const usingAudio = () => audio !== null;

  return {
    get hasRecording() { return usingAudio(); },
    get audio() { return audio; },
    get hasFailed() { return failed; },
    get currentTimeInSeconds() { return usingAudio() ? audio.currentTime : placeholderTime; },
    get durationInSeconds() {
      return usingAudio() && Number.isFinite(audio.duration) ? audio.duration : SESSION_TAPE_LENGTH_IN_SECONDS;
    },
    /** Whether the tape is actually moving past the head: played, and neither paused nor run out. */
    get isRunning() {
      if (!playing || paused) return false;
      return usingAudio() ? !audio.paused && !audio.ended : placeholderTime < SESSION_TAPE_LENGTH_IN_SECONDS;
    },
    get hasEnded() {
      return usingAudio() ? audio.ended : placeholderTime >= SESSION_TAPE_LENGTH_IN_SECONDS;
    },

    /** Starts the tape from the beginning. */
    play() {
      playing = true;
      paused = false;
      failed = false;
      placeholderTime = 0;
      if (!usingAudio()) return;
      audio.currentTime = 0;
      audio.play().catch((err) => {
        failed = true;
        console.warn('[tape] the tape would not play', err);
      });
    },

    /** Pause the recording's own clock with the game, preserving its position. */
    setPaused(value) {
      paused = value;
      if (!usingAudio() || !playing) return;
      if (paused) audio.pause();
      else audio.play().catch(() => { failed = true; });
    },

    /** Stops the tape and rewinds it, the way the deck does when it is stopped. */
    stop() {
      playing = false;
      paused = false;
      placeholderTime = 0;
      if (!usingAudio()) return;
      audio.pause();
      audio.currentTime = 0;
    },

    /**
     * Advances the stand-in's clock. The recording runs on its own clock, so
     * for it this does nothing.
     *
     * @param {number} deltaTimeInSeconds - frame time.
     */
    update(deltaTimeInSeconds) {
      if (!playing || paused || usingAudio()) return;
      placeholderTime = Math.min(SESSION_TAPE_LENGTH_IN_SECONDS, placeholderTime + deltaTimeInSeconds);
    }
  };
}
