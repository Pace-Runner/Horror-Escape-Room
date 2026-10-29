import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, CHAPTERS } from './achievements.js';

/**
 * The main menu's Chapters panel: a card per level, unlocked only once the
 * player has reached it in a real run (core/Progress.js), and the achievement
 * list beside it. Plain DOM, built fresh on every open so it always shows
 * what is saved now.
 */
export function createChapterSelect({ root, progress, onPick = () => {}, onClose = () => {} }) {
  const chapterList = root.querySelector('#chapter-list');
  const achievementList = root.querySelector('#achievement-list');
  const tally = root.querySelector('#achievement-tally');
  root.querySelector('#chapter-close').addEventListener('click', () => onClose());
  root.querySelector('#progress-reset').addEventListener('click', (event) => {
    const button = event.currentTarget;
    // Two presses, so a stray click never wipes a player's whole history.
    if (button.dataset.armed !== 'true') {
      button.dataset.armed = 'true';
      button.textContent = 'Press again to erase all progress';
      return;
    }
    progress.resetAll();
    render();
  });

  function renderChapters() {
    chapterList.replaceChildren(...CHAPTERS.map((chapter) => {
      const unlocked = progress.isLevelUnlocked(chapter.key);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'chapter-card';
      card.dataset.still = chapter.still;
      card.disabled = !unlocked;
      card.innerHTML = '<span class="chapter-card-title"></span><span class="chapter-card-state"></span>';
      card.querySelector('.chapter-card-title').textContent = chapter.title;
      card.querySelector('.chapter-card-state').textContent = unlocked ? 'Play' : '🔒 Not yet explored';
      if (unlocked) card.addEventListener('click', () => onPick(chapter.key));
      return card;
    }));
  }

  function renderAchievements() {
    const earned = ACHIEVEMENTS.filter((a) => progress.has(a.id)).length;
    tally.textContent = `${earned} / ${ACHIEVEMENTS.length}`;
    const sections = ACHIEVEMENT_CATEGORIES.map((category) => {
      const section = document.createElement('section');
      section.className = 'achievement-group';
      const heading = document.createElement('h3');
      heading.textContent = category;
      section.append(heading);
      for (const def of ACHIEVEMENTS.filter((a) => a.category === category)) {
        const done = progress.has(def.id);
        const secret = def.hidden && !done;
        const row = document.createElement('div');
        row.className = 'achievement' + (done ? ' is-earned' : '');
        row.innerHTML = '<span class="achievement-title"></span><span class="achievement-desc"></span>';
        row.querySelector('.achievement-title').textContent = secret ? '???' : def.title;
        row.querySelector('.achievement-desc').textContent = secret ? 'Keep exploring.' : def.description;
        if (def.counter && !done) {
          const bar = document.createElement('progress');
          bar.max = def.target;
          bar.value = Math.min(def.target, progress.count(def.counter));
          row.append(bar);
        }
        section.append(row);
      }
      return section;
    });
    achievementList.replaceChildren(...sections);
  }

  function render() {
    renderChapters();
    renderAchievements();
  }

  return {
    open(view = 'chapters') {
      root.dataset.view = view;
      root.querySelector('#chapter-title').textContent = view === 'achievements' ? 'Achievements' : 'Chapters';
      const reset = root.querySelector('#progress-reset');
      reset.dataset.armed = 'false';
      reset.textContent = 'Reset progress';
      render();
      root.classList.remove('hidden');
      (view === 'achievements' ? root.querySelector('#chapter-close') : (chapterList.querySelector('.chapter-card:not(:disabled)') ?? root.querySelector('#chapter-close'))).focus({ preventScroll: true });
    },
    close() { root.classList.add('hidden'); },
    get isOpen() { return !root.classList.contains('hidden'); }
  };
}
