import newsAudioUrl from '../assets/audio/news_intro.MP3?url';
import exteriorPhotoUrl from '../assets/cutscene/news_01_exterior.png?url';
import windowPhotoUrl from '../assets/cutscene/news_02_window.png?url';
import aftermathPhotoUrl from '../assets/cutscene/news_03_aftermath.png?url';
import figurePhotoUrl from '../assets/cutscene/news_04_figure.png?url';

// Opening-news image changes. Keep these separate from the playback code so
// editorial timing can be adjusted without touching the cutscene behaviour.
export const PHOTO_CUES = [
  { time: 0.0, image: exteriorPhotoUrl, slot: 0 },
  { time: 18.0, image: windowPhotoUrl, slot: 1 },
  { time: 29.0, image: aftermathPhotoUrl, slot: 2 },
  { time: 56.0, image: figurePhotoUrl, slot: 3, strongFlash: true }
];

export const FINAL_RADIO_TIME = 68.0;
export const CUTSCENE_END_TIME = 72.24;

// Transcribed directly from Video Project 13.srt. These remain editable data,
// rather than being embedded in the timeline update code.
export const OPENING_NEWS_SUBTITLE_CUES = [
  { start: 0.190, end: 2.620, text: 'Good evening. We begin tonight with' },
  { start: 2.620, end: 5.050, text: 'developing news from a privately operated' },
  { start: 5.050, end: 7.075, text: 'medical research facility on the' },
  { start: 7.075, end: 9.505, text: 'outskirts of the city. Emergency services' },
  { start: 9.505, end: 11.935, text: 'sealed the property late last night' },
  { start: 11.935, end: 14.770, text: 'following reports of a power failure, an' },
  { start: 14.770, end: 16.795, text: 'explosion and multiple injuries. Our' },
  { start: 16.795, end: 19.225, text: 'reporter is at the scene. Authorities' },
  { start: 19.225, end: 21.655, text: 'arrived shortly after 11:00 PM. The' },
  { start: 21.655, end: 24.085, text: 'facility is believed to have been' },
  { start: 24.085, end: 25.705, text: 'conducting experimental medical research' },
  { start: 25.705, end: 28.540, text: 'under a program referred to internally as' },
  { start: 28.540, end: 31.129, text: 'Project Hollow. Officials have refused to' },
  { start: 31.129, end: 33.103, text: 'confirm exactly what happened inside,' },
  { start: 33.103, end: 35.471, text: 'however, one trial subject is still' },
  { start: 35.471, end: 37.839, text: 'unaccounted for. We asked the facility' },
  { start: 37.839, end: 39.813, text: 'spokesperson whether that individual may' },
  { start: 39.813, end: 42.576, text: 'have left the premises. There is no' },
  { start: 42.576, end: 44.945, text: 'immediate danger to the public. One' },
  { start: 44.945, end: 47.313, text: 'participant could not be located during' },
  { start: 47.313, end: 49.682, text: 'the initial evacuation, but there is' },
  { start: 49.682, end: 52.050, text: 'currently no evidence to suggest they' },
  { start: 52.050, end: 54.418, text: 'left the facility. We would strongly' },
  { start: 54.418, end: 56.392, text: 'discourage speculation at this time.' },
  { start: 56.392, end: 58.366, text: 'Several nearby residents have reported' },
  { start: 58.366, end: 61.017, text: 'hearing screaming before. The power went' },
  { start: 61.017, end: 63.710, text: 'out. Are you saying those reports' },
  { start: 63.710, end: 66.404, text: 'are false? I\'m saying I can\'t' },
  { start: 66.404, end: 68.649, text: 'comment on unverified witness accounts.' },
  { start: 68.649, end: 71.342, text: 'Unit 3, hold the perimeter. Nobody' },
  { start: 71.342, end: 72.240, text: 'goes inside.' }
];

function preloadImage(url) {
  const image = new Image();
  image.src = url;
  return image.decode?.().catch(() => undefined) ?? Promise.resolve();
}

export function createOpeningNewsCutscene({ root }) {
  const photoCards = [...root.querySelectorAll('.onc-photo-card')];
  const subtitle = root.querySelector('.onc-subtitle');
  const audio = new Audio();
  audio.preload = 'auto';

  let preloadPromise = null;
  let rafId = 0;
  let isPlaying = false;
  let resolvePlayback = null;

  function preload() {
    if (!preloadPromise) {
      const audioReady = fetch(newsAudioUrl).then((response) => {
        if (!response.ok) throw new Error(`News audio: HTTP ${response.status}`);
        return response.blob();
      }).then((blob) => new Promise((resolve) => {
        const finish = () => {
          audio.removeEventListener('canplaythrough', finish);
          audio.removeEventListener('error', finish);
          resolve();
        };
        audio.addEventListener('canplaythrough', finish, { once: true });
        audio.addEventListener('error', finish, { once: true });
        audio.src = URL.createObjectURL(blob);
        audio.load();
      }));
      preloadPromise = Promise.all([
        audioReady, ...PHOTO_CUES.map((cue) => preloadImage(cue.image))
      ]).catch((error) => console.warn('Opening asset preload failed:', error));
    }
    return preloadPromise;
  }

  function showPhoto(cue) {
    const card = photoCards[cue.slot];
    card.querySelector('img').src = cue.image;
    card.classList.remove('is-photo-change', 'is-strong-flash');
    void card.offsetWidth;
    card.classList.add('is-visible', 'is-photo-change');
    if (cue.strongFlash) card.classList.add('is-strong-flash');
    window.setTimeout(() => card.classList.remove('is-photo-change'), 520);
  }

  function setActivePhoto(photoIndex) {
    const cue = PHOTO_CUES[photoIndex];
    for (const card of photoCards) card.classList.remove('is-active');
    root.classList.remove('onc-stage-1', 'onc-stage-2', 'onc-stage-3', 'onc-stage-4');
    root.classList.add(`onc-stage-${photoIndex + 1}`);
    showPhoto(cue);
    photoCards[cue.slot].classList.add('is-active');
  }

  function update(time, state) {
    const photoIndex = PHOTO_CUES.findLastIndex((cue) => cue.time <= time);
    if (photoIndex !== state.photoIndex) {
      state.photoIndex = photoIndex;
      setActivePhoto(Math.max(photoIndex, 0));
    }

    const cue = OPENING_NEWS_SUBTITLE_CUES.find((entry) => time >= entry.start && time < entry.end);
    const nextSubtitle = cue?.text ?? '';
    if (subtitle.textContent !== nextSubtitle) subtitle.textContent = nextSubtitle;
    photoCards[3].classList.toggle('is-final-radio', time >= FINAL_RADIO_TIME);
  }

  function finish({ skipped = false } = {}) {
    if (!isPlaying) return false;
    cancelAnimationFrame(rafId);
    audio.pause();
    subtitle.textContent = '';
    isPlaying = false;
    resolvePlayback?.({ skipped });
    resolvePlayback = null;
    return true;
  }

  function close() {
    root.classList.add('is-ending');
    return new Promise((resolve) => {
      window.setTimeout(() => {
        root.classList.remove('is-open', 'is-ending', 'onc-stage-1', 'onc-stage-2', 'onc-stage-3', 'onc-stage-4');
        for (const card of photoCards) card.classList.remove('is-visible', 'is-photo-change', 'is-strong-flash', 'is-final-radio', 'is-active');
        root.setAttribute('aria-hidden', 'true');
        resolve();
      }, 260);
    });
  }

  return {
    preload,
    close,
    /**
     * Lays all four photographs out as the report ends, without the flashes,
     * so a skipped report rests on the same screen as one watched through.
     */
    showAllPhotos() {
      root.classList.remove('onc-stage-1', 'onc-stage-2', 'onc-stage-3');
      root.classList.add('onc-stage-4');
      for (const cue of PHOTO_CUES) {
        const card = photoCards[cue.slot];
        card.querySelector('img').src = cue.image;
        card.classList.remove('is-active', 'is-photo-change', 'is-strong-flash');
        card.classList.add('is-visible');
      }
    },
    /** True from play() until close() has finished: the report covers the screen. */
    get isOpen() {
      return root.classList.contains('is-open');
    },
    skip() {
      return finish({ skipped: true });
    },
    play() {
      if (isPlaying) return Promise.resolve();
      isPlaying = true;
      preload();
      audio.currentTime = 0;
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      const startedAt = performance.now();
      const state = { photoIndex: -1 };
      for (const card of photoCards) card.classList.remove('is-visible', 'is-photo-change', 'is-strong-flash', 'is-final-radio', 'is-active');
      setActivePhoto(0);
      state.photoIndex = 0;

      // Called directly from Start Game's click path, preserving the browser's
      // user gesture for the one-shot news report.
      audio.play().catch((error) => console.warn('Opening news audio could not start:', error));

      return new Promise((resolve) => {
        resolvePlayback = resolve;
        const tick = () => {
          const elapsed = (performance.now() - startedAt) / 1000;
          const time = !audio.paused && audio.currentTime > 0 ? audio.currentTime : elapsed;
          update(time, state);
          if (audio.ended || time >= CUTSCENE_END_TIME) {
            finish();
            return;
          }
          rafId = requestAnimationFrame(tick);
        };
        tick();
      });
    }
  };
}
