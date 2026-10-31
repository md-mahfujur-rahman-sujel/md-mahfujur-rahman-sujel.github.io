(() => {
  'use strict';
  const root = document.documentElement;
  const compact = matchMedia('(max-width:900px)');
  const preference = matchMedia('(prefers-reduced-motion:reduce)');
  const dialog = document.getElementById('explorer');
  const dock = document.querySelector('.mobile-dock');
  const motionToggle = document.getElementById('motion-toggle');
  let savedMotion = false;
  try { savedMotion = localStorage.getItem('motion') === 'reduced'; } catch {}
  let reduced = preference.matches || savedMotion;
  let data = null;
  let fetching = false;
  let opener = null;
  let closing = false;
  let pendingSection = null;
  let scrollYBeforeSheet = 0;
  let scrollEpoch = 0;
  let activeFilter = 'all';
  let selectedWeek = 51;
  const counters = new Map();
  const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const longDateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const colors = { HTML: '#FBCA03', CSS: '#B6A3E8', JavaScript: '#E7D87D', TypeScript: '#82B7EB', Java: '#D9AA7D', Kotlin: '#E10F19', Python: '#A2BCD7', SCSS: '#DDA3C0' };
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const shortDate = value => validDate(value) ? dateFormat.format(new Date(value)) : '—';
  const longDate = value => validDate(value) ? longDateFormat.format(new Date(value)) : '—';
  const count = (value, className = '') => {
    const node = element('span', className, finite(value) ? value.toLocaleString('en') : '—');
    if (finite(value)) node.dataset.count = value;
    return node;
  };
  function age(value) {
    const delta = (Date.parse(value) - Date.now()) / 1000;
    if (Math.abs(delta) < 60) return 'just now';
    const [unit, divisor] = Math.abs(delta) < 3600 ? ['minute', 60] : Math.abs(delta) < 86400 ? ['hour', 3600] : Math.abs(delta) < 2592000 ? ['day', 86400] : Math.abs(delta) < 31536000 ? ['month', 2592000] : ['year', 31536000];
    return relativeFormat.format(Math.trunc(delta / divisor), unit);
  }
  function time(value, prefix = '') {
    const node = element('time', 'event-time');
    if (validDate(value)) {
      node.dateTime = value;
      node.dataset.prefix = prefix;
      node.textContent = prefix + age(value);
      node.title = new Date(value).toUTCString();
    } else node.textContent = 'Timestamp unavailable';
    return node;
  }
  function meter(value, color) {
    const track = element('span', 'meter');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('i');
    fill.style.setProperty('--fill', Math.max(0, Math.min(1, value)));
    if (color) fill.style.background = color;
    track.append(fill);
    return track;
  }
  function heading(text, suffix) {
    const row = element('div', 'component-heading');
    row.append(element('h3', '', text));
    if (suffix) row.append(element('span', 'micro-label', suffix));
    return row;
  }
  function setMotion() {
    reduced = preference.matches || savedMotion;
    root.dataset.motion = reduced ? 'reduced' : 'full';
    motionToggle.setAttribute('aria-pressed', String(reduced));
    motionToggle.textContent = preference.matches ? 'Reduce motion: system' : `Reduce motion: ${reduced ? 'on' : 'off'}`;
    motionToggle.disabled = preference.matches;
    if (reduced) {
      for (const [node, frame] of counters) {
        cancelAnimationFrame(frame);
        node.textContent = formatCounter(node, Number(node.dataset.count));
      }
      counters.clear();
      $$('.is-revealing').forEach(node => node.classList.remove('is-revealing'));
      for (const animation of document.getAnimations()) {
        if (animation.effect?.target?.closest('.mobile-workspace,.mobile-only,.mobile-dock,#explorer')) animation.cancel();
      }
      $('#typed-copy').textContent = typedLines[0];
      dock.classList.remove('is-hidden');
    }
    document.dispatchEvent(new CustomEvent('motionchange'));
    freezeImages();
  }
  motionToggle.addEventListener('click', () => {
    savedMotion = !savedMotion;
    try { localStorage.setItem('motion', savedMotion ? 'reduced' : 'full'); } catch {}
    setMotion();
  });
  preference.addEventListener('change', setMotion);

  function openExplorer(source) {
    if (!compact.matches || dialog.open || closing) return;
    opener = source;
    scrollYBeforeSheet = window.scrollY;
    history.pushState({ ...history.state, explorer: true }, '', '#explorer');
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    document.dispatchEvent(new CustomEvent('explorerchange'));
    $('#explorer-close').focus();
    if (!reduced) dialog.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
  function finishClose() {
    if (!dialog.open) return;
    dialog.close();
    document.body.style.overflow = '';
    closing = false;
    document.dispatchEvent(new CustomEvent('explorerchange'));
    opener?.focus({ preventScroll: true });
    const target = pendingSection;
    pendingSection = null;
    // Anything that scrolls between now and the next frame owns the position;
    // restoring the pre-sheet scroll would yank the page back under the user.
    const epoch = scrollEpoch;
    if (target) history.replaceState(history.state, '', target);
    // History restores its scroll position after popstate has finished.
    requestAnimationFrame(() => {
      if (target) $(target)?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' });
      else if (scrollEpoch === epoch) window.scrollTo({ top: scrollYBeforeSheet, behavior: 'instant' });
    });
  }
  function closeExplorer(target = null) {
    if (!dialog.open || closing) return;
    pendingSection = target;
    closing = true;
    if (history.state?.explorer) history.back();
    else finishClose();
  }
  $('#explorer-open').addEventListener('click', event => openExplorer(event.currentTarget));
  $$('[data-open-explorer]').forEach(button => button.addEventListener('click', () => openExplorer(button)));
  $('#explorer-close').addEventListener('click', () => closeExplorer());
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeExplorer(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = $$('a[href],button:not(:disabled),[tabindex="0"]', dialog);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientY < rect.top || event.clientX < rect.left || event.clientX > rect.right || event.clientY > rect.bottom) closeExplorer();
    }
    const link = event.target.closest('a');
    if (link) {
      const href = link.getAttribute('href');
      if (href.startsWith('#')) { event.preventDefault(); closeExplorer(href); }
      else closeExplorer();
    }
  });
  window.addEventListener('popstate', () => {
    if (dialog.open && !history.state?.explorer) finishClose();
    else if (history.state?.explorer && !dialog.open && compact.matches) {
      opener = $('#explorer-open');
      scrollYBeforeSheet = window.scrollY;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
      document.dispatchEvent(new CustomEvent('explorerchange'));
    }
  });
  let dragStart = null;
  $$('.sheet-handle,.sheet-heading').forEach(handle => {
    handle.addEventListener('pointerdown', event => {
      if (event.target.closest('button') || reduced) return;
      dragStart = event.clientY;
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (dragStart !== null) dialog.style.transform = `translateY(${Math.max(0, event.clientY - dragStart)}px)`;
    });
    const end = event => {
      if (dragStart === null) return;
      const distance = event.clientY - dragStart;
      dragStart = null;
      dialog.style.transform = '';
      if (event.type !== 'pointercancel' && distance > 80) closeExplorer();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
  document.addEventListener('keydown', event => {
    if (compact.matches && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (dialog.open) closeExplorer(); else openExplorer($('#explorer-open'));
    }
  });

  const typedLines = ['trying out new things...', 'shipping React, Spring Boot & Android', 'from first sketch to polished release'];
  let typedElapsed = 0;
  let lastTypedAt = performance.now();
  setInterval(() => {
    const now = performance.now();
    const delta = now - lastTypedAt;
    lastTypedAt = now;
    if (!compact.matches || reduced || document.hidden || dialog.open || !$('.mobile-workspace').classList.contains('in-view')) return;
    typedElapsed += Math.min(delta, 100);
    const index = Math.floor(typedElapsed / 4000) % typedLines.length;
    const length = Math.min(typedLines[index].length, Math.floor((typedElapsed % 4000) / 42));
    $('#typed-copy').textContent = typedLines[index].slice(0, length);
  }, 60);
  const reactor = $('.reactor-button');
  reactor.disabled = false;
  let pulseTimer;
  reactor.addEventListener('click', () => {
    if (reduced) return;
    clearTimeout(pulseTimer);
    reactor.classList.add('is-pulsing');
    pulseTimer = setTimeout(() => reactor.classList.remove('is-pulsing'), 1200);
  });
  $$('.tech-chip').forEach(button => button.addEventListener('click', () => {
    if (reduced) return;
    const ripple = element('span', 'chip-ripple');
    ripple.setAttribute('aria-hidden', 'true');
    button.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  }));
  $$('.tech-track').forEach(track => track.append(element('span', 'track-playhead')));
  setInterval(() => {
    if (!compact.matches || reduced || document.hidden || !$('.stack-component').classList.contains('in-view')) return;
    $$('.track-playhead').forEach((playhead, index) => {
      playhead.animate([{ transform: 'translateX(0)', opacity: 0 }, { opacity: .8, offset: .25 }, { transform: `translateX(${playhead.parentElement.clientWidth - 48}px)`, opacity: 0 }], { duration: 1200, delay: index * 240, easing: 'ease-in-out' });
    });
  }, 6000);

  function formatCounter(node, value) {
    const decimals = Number(node.dataset.decimals || 0);
    return (decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString('en')).padStart(Number(node.dataset.pad || 0), '0');
  }
  function animateCounter(node) {
    if (node.dataset.counted) return;
    node.dataset.counted = 'true';
    const final = Number(node.dataset.count);
    if (reduced || !compact.matches) { node.textContent = formatCounter(node, final); return; }
    const start = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - start) / 900);
      node.textContent = formatCounter(node, final * (1 - (1 - progress) ** 3));
      if (progress < 1 && !document.hidden && !reduced) counters.set(node, requestAnimationFrame(frame));
      else { node.textContent = formatCounter(node, final); counters.delete(node); }
    }
    counters.set(node, requestAnimationFrame(frame));
  }
  const revealed = new WeakSet();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const node = entry.target;
      node.classList.toggle('in-view', entry.isIntersecting);
      if (!compact.matches || !entry.isIntersecting || revealed.has(node)) continue;
      revealed.add(node);
      if (!reduced) {
        node.classList.add('is-revealing');
        setTimeout(() => node.classList.remove('is-revealing'), 1800);
        if (node.classList.contains('mobile-workspace')) reactor.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 900, easing: 'cubic-bezier(.2,.7,.2,1)' });
      }
      $$('[data-count]', node).forEach(animateCounter);
      $$('.ring-value', node).forEach(ring => {
        const end = ring.getAttribute('stroke-dashoffset');
        if (!reduced) ring.animate([{ strokeDashoffset: '302' }, { strokeDashoffset: end }], { duration: 900, easing: 'ease-out' });
      });
    }
  }, { threshold: .15 });
  function observe(parent = document) {
    $$('.motion-zone,.info-cards li,.cards .card,.metric-card,.contribution-card,.language-card,.streak-card,.weekly-card,.activity-card,.repo-card,.activity-component', parent).forEach((node, index) => {
      node.style.setProperty('--stagger', `${Math.min(index % 6, 5) * 60}ms`);
      observer.observe(node);
    });
  }

  let lastScroll = window.scrollY;
  let scrollFrame = 0;
  let lastDockChange = lastScroll;
  function scrollSpy() {
    scrollFrame = 0;
    if (dialog.open) return;
    const y = window.scrollY;
    if (compact.matches) {
      if (!reduced && Math.abs(y - lastDockChange) > 12) {
        dock.classList.toggle('is-hidden', y > lastScroll && y > 120 && y + innerHeight < document.documentElement.scrollHeight - 80);
        lastDockChange = y;
      }
      lastScroll = y;
    }
    const sections = ['top', 'about', 'projects', 'stack', 'telemetry', 'repositories', 'activity', 'contact'];
    let current = 'top';
    for (const id of sections.slice(1)) {
      const node = document.getElementById(id);
      if (node && node.getBoundingClientRect().top <= 150) current = id;
    }
    if (y + innerHeight >= document.documentElement.scrollHeight - 12) current = 'contact';
    if (compact.matches) {
      const dockMap = { about: 'top', repositories: 'telemetry', contact: 'activity' };
      const dockCurrent = dockMap[current] || current;
      $$('.mobile-dock a').forEach(link => {
        if (link.dataset.section === dockCurrent) {
          link.setAttribute('aria-current', 'location');
          $('.dock-indicator').style.transform = `translateX(${link.offsetLeft + link.offsetWidth / 2 - 16}px)`;
        } else link.removeAttribute('aria-current');
      });
    }
    const navCurrent = current === 'top' ? 'about' : current;
    $$('.nav a[href^="#"]').forEach(link => {
      if (link.getAttribute('href') === `#${navCurrent}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', () => {
    scrollEpoch++;
    if (!scrollFrame) scrollFrame = requestAnimationFrame(scrollSpy);
  }, { passive: true });
  window.addEventListener('resize', scrollSpy, { passive: true });
  requestAnimationFrame(scrollSpy);
  $$('.mobile-dock a,.hero-tabs a').forEach(link => link.addEventListener('click', () => {
    dock.classList.remove('is-hidden');
    const target = $(link.getAttribute('href'));
    if (!reduced && target) {
      const title = $('h2', target);
      title?.animate([{ opacity: .6 }, { opacity: 1 }], { duration: 480 });
    }
  }));

  function renderTelemetry(stats) {
    const host = $('#telemetry-component');
    const profile = stats.profile;
    const contribution = stats.contributions;
    const languages = stats.languages;
    if (!profile && !contribution && !Array.isArray(languages)) return false;
    const grid = element('div', 'telemetry-grid');
    if (profile) {
      const tiles = element('div', 'node-stats');
      [['REPOSITORIES', profile.repos], ['STARS', profile.stars], ['FOLLOWERS', profile.followers], ['FOLLOWING', profile.following]].forEach(([label, value]) => {
        const tile = element('div', 'metric-card');
        tile.append(element('span', '', label));
        const strong = element('strong'); strong.append(count(value)); tile.append(strong);
        tiles.append(tile);
      });
      const since = element('p', 'member-line');
      since.textContent = validDate(profile.memberSince) ? `Member since ${new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(profile.memberSince))}` : 'Member since: unavailable';
      tiles.append(since); grid.append(tiles);
    }
    if (contribution && finite(contribution.total)) {
      const card = element('div', 'contribution-card');
      card.append(heading('CONTRIBUTIONS', '12 MONTHS'));
      const body = element('div', 'contribution-body');
      const ring = element('div', 'contribution-ring');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 112 112'); svg.setAttribute('aria-hidden', 'true');
      const ratio = contribution.windowDays ? contribution.activeDays / contribution.windowDays : 0;
      for (let i = 0; i < 2; i++) {
        const circle = document.createElementNS(svg.namespaceURI, 'circle');
        circle.setAttribute('cx', '56'); circle.setAttribute('cy', '56'); circle.setAttribute('r', '48');
        if (i) { circle.classList.add('ring-value'); circle.setAttribute('stroke-dasharray', '302'); circle.setAttribute('stroke-dashoffset', String(302 * (1 - Math.max(0, Math.min(1, ratio))))); }
        svg.append(circle);
      }
      const total = element('strong'); total.append(count(contribution.total));
      ring.append(svg, total);
      const copy = element('div', 'contribution-copy');
      copy.append(element('p', '', 'contributions in the last 12 months'));
      const active = element('p'); active.append(element('b', '', `${contribution.activeDays} active days`)); copy.append(active);
      copy.append(element('p', '', `Peak ${contribution.peak?.count ?? 0} · ${shortDate(contribution.peak?.date)}`));
      body.append(ring, copy); card.append(body);
      const year = new Date().getUTCFullYear();
      const elapsed = Math.max(0, Math.min(1, (Date.now() - Date.UTC(year, 0, 1)) / (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1))));
      const yearLine = element('p', 'year-progress', `${year} · ${Math.round(elapsed * 100)}% elapsed · ring shows active-day consistency`);
      yearLine.append(meter(elapsed)); card.append(yearLine); grid.append(card);
      const calendar = renderCalendar(contribution);
      if (calendar) grid.append(calendar);
    }
    if (Array.isArray(languages)) {
      const card = element('div', 'language-card'); card.append(heading('LANGUAGES', 'BY BYTES'));
      const list = element('ul', 'language-list');
      languages.forEach(language => {
        if (!finite(language.pct) || typeof language.name !== 'string') return;
        const item = element('li', 'language-row');
        item.style.setProperty('--language', colors[language.name] || '#A9C7FF');
        const row = element('div'); const label = element('span', 'language-name');
        label.append(element('i', 'language-dot'), document.createTextNode(language.name));
        const percent = element('span'); const number = count(language.pct); number.dataset.decimals = '1'; number.textContent = language.pct.toFixed(1); percent.append(number, document.createTextNode('%'));
        row.append(label, percent); item.append(row, meter(language.pct / 100)); list.append(item);
      });
      if (!languages.length) list.append(element('li', '', 'No language data yet.'));
      card.append(list, element('p', 'bytes-total', `${finite(stats.bytesTotal) ? stats.bytesTotal.toLocaleString('en') : '—'} total bytes · owned, non-fork repositories`));
      grid.append(card);
    }
    if (contribution && finite(contribution.total)) {
      const streakGrid = element('div', 'streak-grid');
      const current = contribution.currentStreak;
      const longest = contribution.longestStreak;
      [['CURRENT STREAK', current?.days, 'days', `${shortDate(current?.from)} – ${shortDate(current?.to)}`], ['LONGEST STREAK', longest?.days, 'days', `${shortDate(longest?.from)} – ${shortDate(longest?.to)}`], ['ACTIVE DAYS', contribution.activeDays, 'days', `${Math.round(100 * contribution.activeDays / (contribution.windowDays || 1))}% consistency`]].forEach(([label, value, unit, detail], index) => {
        const card = element('div', 'streak-card'); card.append(element('span', 'micro-label', label));
        const strong = element('strong'); strong.append(count(value), element('small', '', ` ${unit}`)); card.append(strong);
        if (index === 0 && Array.isArray(contribution.days)) {
          const strip = element('div', 'streak-strip'); strip.setAttribute('aria-label', 'Last 14 days of contributions');
          const days = contribution.days.slice(-14);
          const peak = Math.max(1, ...days.map(day => day.count));
          days.forEach(day => {
            const bar = element('span', day.count ? '' : 'empty'); bar.style.setProperty('--height', `${Math.max(8, day.count / peak * 100)}%`);
            bar.title = `${day.date}: ${day.count} contributions`; bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', bar.title); strip.append(bar);
          }); card.append(strip);
        }
        card.append(element('p', '', detail)); streakGrid.append(card);
      });
      grid.append(streakGrid);
      if (Array.isArray(contribution.weeks) && contribution.weeks.length === 52 && contribution.weeks.every(week => validDate(week.start) && finite(week.count))) grid.append(renderWeeks(contribution.weeks));
    }
    if (!contribution) {
      const fallback = element('div', 'contribution-card');
      fallback.append(heading('CONTRIBUTIONS', 'UNAVAILABLE'));
      fallback.append(element('p', 'fallback-note', 'The contribution source could not be reached. The panel below is the last saved snapshot, so it can lag live data by up to three hours.'));
      const image = $('#telemetry .panel-fallback img').cloneNode();
      image.src = 'assets/telemetry.svg';
      fallback.append(image);
      grid.append(fallback);
    }
    if (contribution || (Array.isArray(stats.repos) && stats.repos.length)) grid.append(renderActivityOverview(stats, contribution));
    grid.append(time(stats.generatedAt, stats.status === 'partial' ? 'PARTIAL SYNC · data updated ' : 'SYNC OK · data updated '));
    grid.lastChild.className = 'sync-line';
    if (!profile || !contribution || !Array.isArray(languages)) grid.append(element('p', 'data-source', 'Partial snapshot: some GitHub data is unavailable. Missing values are not zero.'));
    if (contribution) grid.append(element('p', 'data-source', `Contribution window ends ${contribution.asOf || stats.generatedAt.slice(0, 10)} UTC. Counts and streaks reflect that snapshot.`));
    host.replaceChildren(grid); return true;
  }
  function renderCalendar(contribution) {
    const days = contribution?.days;
    if (!Array.isArray(days) || days.length < 7) return null;
    const weeks = Math.floor(days.length / 7);
    const peak = Math.max(1, ...days.map(day => day.count));
    const intensity = day => !day.count ? 0 : Math.min(4, Math.ceil(day.count / peak * 4));
    const card = element('div', 'calendar-card');
    card.append(heading('CONTRIBUTION CALENDAR', '52 WEEKS'));
    const columns = `repeat(${weeks}, minmax(0, 1fr))`;
    const months = element('div', 'calendar-months');
    months.style.gridTemplateColumns = columns;
    months.setAttribute('aria-hidden', 'true');
    let month = -1;
    for (let week = 0; week < weeks; week++) {
      const start = days[week * 7]?.date;
      if (!validDate(start)) continue;
      const date = new Date(start);
      if (date.getUTCMonth() === month) continue;
      month = date.getUTCMonth();
      const label = element('span', '', date.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }));
      const span = Math.min(4, weeks - week);
      label.style.gridColumn = span > 1 ? `${week + 1} / span ${span}` : String(week + 1);
      months.append(label);
    }
    const grid = element('div', 'calendar-grid');
    grid.style.gridTemplateColumns = columns;
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', `Contribution calendar from ${longDate(days[0].date)} to ${longDate(days.at(-1).date)}: ${contribution.total} contributions on ${contribution.activeDays} active days, peak ${contribution.peak?.count ?? peak} on ${longDate(contribution.peak?.date)}.`);
    for (let week = 0; week < weeks; week++) {
      const column = element('div', 'calendar-week');
      for (let row = 0; row < 7; row++) {
        const day = days[week * 7 + row];
        if (!day) { column.append(element('span', 'calendar-day')); continue; }
        const cell = element('span', `calendar-day l${intensity(day)}`);
        cell.title = `${longDate(day.date)}: ${day.count} contribution${day.count === 1 ? '' : 's'}`;
        column.append(cell);
      }
      grid.append(column);
    }
    const legend = element('div', 'calendar-legend');
    legend.setAttribute('aria-label', 'Contribution intensity from less to more');
    legend.append(element('span', '', 'Less'));
    for (let level = 0; level <= 4; level++) legend.append(element('i', `calendar-swatch l${level}`));
    legend.append(element('span', '', 'More'));
    card.append(months, grid, legend, element('p', 'calendar-note', 'Each cell is one day. Brighter cells mean more contributions.'));
    return card;
  }
  function renderWeeks(weeks) {
    const card = element('div', 'weekly-card'); card.append(heading('ACTIVITY CARRIER', '52 WEEKS'));
    const chart = element('div', 'weekly-chart');
    const bars = element('div', 'week-bars'); bars.setAttribute('aria-hidden', 'true');
    const peak = Math.max(1, ...weeks.map(week => week.count));
    const peakIndex = weeks.findIndex(week => week.count === peak);
    weeks.forEach((week, index) => {
      const bar = element('span', `week-bar${index === peakIndex ? ' is-peak' : ''}`);
      bar.style.setProperty('--height', `${Math.max(2, week.count / peak * 100)}%`);
      bar.style.setProperty('--bar-delay', `${index * 10}ms`); bars.append(bar);
    });
    const months = element('div', 'chart-months');
    [0, 10, 20, 30, 40, 51].forEach(index => months.append(element('span', '', new Date(weeks[index].start).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }))));
    chart.append(bars, months);
    const output = element('output', 'chart-tooltip'); output.id = 'week-output';
    const range = element('input', 'chart-range'); range.type = 'range'; range.min = '0'; range.max = '51'; range.step = '1'; range.value = String(selectedWeek); range.setAttribute('aria-label', 'Select contribution week'); range.setAttribute('aria-describedby', 'week-output');
    function select(index) {
      selectedWeek = Math.max(0, Math.min(51, index));
      const week = weeks[selectedWeek];
      output.textContent = `Week of ${shortDate(week.start)} ${week.start.slice(0, 4)} · ${week.count} contributions`;
      range.value = String(selectedWeek); range.setAttribute('aria-valuetext', output.textContent);
      [...bars.children].forEach((bar, i) => bar.classList.toggle('is-selected', i === selectedWeek));
    }
    range.addEventListener('input', () => select(Number(range.value)));
    function selectPointer(event) {
      const rect = bars.getBoundingClientRect();
      select(Math.floor((event.clientX - rect.left) / rect.width * 52));
    }
    let dragging = false;
    chart.addEventListener('pointerdown', event => { dragging = true; chart.setPointerCapture(event.pointerId); selectPointer(event); });
    chart.addEventListener('pointermove', event => { if (dragging) selectPointer(event); });
    chart.addEventListener('pointerup', () => { dragging = false; });
    chart.addEventListener('pointercancel', () => { dragging = false; });
    select(selectedWeek);
    const table = element('table'); table.append(element('caption', '', 'Weekly contribution counts'));
    const head = element('thead'); const header = element('tr');
    ['Week starting', 'Contributions'].forEach(label => { const cell = element('th', '', label); cell.scope = 'col'; header.append(cell); }); head.append(header); table.append(head);
    const body = element('tbody'); weeks.forEach(week => { const row = element('tr'); row.append(element('td', '', week.start), element('td', '', String(week.count))); body.append(row); }); table.append(body);
    const hiddenTable = element('div', 'sr-only'); hiddenTable.append(table);
    card.append(chart, element('p', 'chart-hint', `Peak: ${peakIndex < 0 ? 'no contributions yet' : `${peak} · week of ${shortDate(weeks[peakIndex].start)}`}. Touch the chart or use the slider.`), range, output, hiddenTable);
    return card;
  }
  function renderActivityOverview(stats, contribution) {
    const card = element('div', 'activity-card');
    card.append(heading('ACTIVITY OVERVIEW', 'LAST 12 MONTHS'));
    const body = element('div', 'activity-body');
    const contributed = element('div', 'contributed');
    contributed.append(element('h4', 'micro-label', 'CONTRIBUTED TO'));
    const repos = Array.isArray(stats.repos) ? stats.repos : [];
    const links = repos.map(repo => ({ slug: repo.slug || `${repo.owner}/${repo.name}`, url: safeRepoUrl(repo) })).filter(item => item.url);
    if (links.length) {
      const list = element('ul', 'contributed-list');
      links.forEach(item => {
        const entry = element('li');
        const link = element('a', '', item.slug);
        link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        entry.append(link); list.append(entry);
      });
      contributed.append(list);
    } else {
      contributed.append(element('p', 'fallback-note', 'Repository activity is unavailable in this snapshot.'));
    }
    body.append(contributed);

    const axes = [
      ['codeReviews', 'Code review', 'top'],
      ['issues', 'Issues', 'right'],
      ['pullRequests', 'Pull requests', 'bottom'],
      ['commits', 'Commits', 'left']
    ];
    const types = contribution?.types;
    const known = types && axes.every(([key]) => finite(types[key]));
    const radar = element('div', 'activity-radar');
    if (known) {
      const total = axes.reduce((sum, [key]) => sum + types[key], 0);
      const share = key => total ? types[key] / total : 0;
      const percent = key => {
        const value = share(key);
        return value > 0 && value < 0.01 ? '<1%' : `${Math.round(value * 100)}%`;
      };
      const wrap = element('div', 'radar-wrap');
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 200 200'); svg.setAttribute('class', 'radar-svg'); svg.setAttribute('aria-hidden', 'true');
      const points = { top: [100, 22], right: [178, 100], bottom: [100, 178], left: [22, 100] };
      for (let level = 1; level <= 4; level++) {
        const ring = document.createElementNS(ns, 'polygon');
        ring.setAttribute('points', Object.values(points).map(([x, y]) => `${100 + (x - 100) * level / 4},${100 + (y - 100) * level / 4}`).join(' '));
        ring.setAttribute('class', 'radar-ring'); svg.append(ring);
      }
      Object.values(points).forEach(([x, y]) => {
        const axis = document.createElementNS(ns, 'line');
        axis.setAttribute('x1', '100'); axis.setAttribute('y1', '100'); axis.setAttribute('x2', String(x)); axis.setAttribute('y2', String(y));
        axis.setAttribute('class', 'radar-axis'); svg.append(axis);
      });
      const corners = axes.map(([key, , side]) => {
        const [x, y] = points[side]; const scale = share(key);
        return [100 + (x - 100) * scale, 100 + (y - 100) * scale];
      });
      const shape = document.createElementNS(ns, 'polygon');
      shape.setAttribute('points', corners.map(point => point.join(',')).join(' ')); shape.setAttribute('class', 'radar-shape'); svg.append(shape);
      corners.forEach(([x, y]) => {
        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y)); dot.setAttribute('r', '3.5'); dot.setAttribute('class', 'radar-dot'); svg.append(dot);
      });
      axes.forEach(([key, text, side]) => {
        const item = element('span', `radar-label radar-${side}`);
        item.append(element('b', '', percent(key)), document.createTextNode(` ${text}`));
        wrap.append(item);
      });
      wrap.append(svg);
      radar.append(wrap);
      if (!total) radar.append(element('p', 'fallback-note', 'No classified contributions in this window yet.'));
    } else {
      radar.append(element('p', 'fallback-note', contribution ? 'Activity mix needs an authenticated data refresh; this snapshot has daily totals only.' : 'Activity mix is unavailable in this snapshot.'));
    }
    body.append(radar);
    card.append(body);
    return card;
  }
  function safeRepoUrl(repo) {
    const slug = repo.slug || `${repo.owner}/${repo.name}`;
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug) ? `https://github.com/${slug}` : null;
  }
  function renderRepositories(stats) {
    if (!Array.isArray(stats.repos)) return false;
    const host = $('#repositories-component');
    const toolbar = element('div', 'repo-toolbar'); toolbar.setAttribute('aria-label', 'Repository filters');
    const resultCount = element('p', 'repo-count'); resultCount.setAttribute('role', 'status');
    const list = element('div', 'repo-list');
    function filter(role, animate = false) {
      activeFilter = role;
      $$('.filter-button', toolbar).forEach(button => button.setAttribute('aria-pressed', String(button.dataset.role === role)));
      let visible = 0;
      $$('.repo-card', list).forEach(card => {
        card.hidden = role !== 'all' && card.dataset.role !== role;
        if (!card.hidden) {
          visible++;
          if (animate && !reduced) card.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: Math.min(visible - 1, 5) * 60, easing: 'ease-out' });
        }
      });
      resultCount.textContent = `${visible} ${visible === 1 ? 'repository' : 'repositories'}${role === 'all' ? ' · all roles' : ` · ${role}`}`;
    }
    [['all', 'ALL'], ['owner', 'OWNED'], ['collaborator', 'COLLAB']].forEach(([role, label]) => {
      const button = element('button', 'filter-button', label); button.type = 'button'; button.dataset.role = role;
      button.addEventListener('click', () => filter(role, true)); toolbar.append(button);
    });
    const legendButton = element('button', 'legend-button', 'LANGS'); legendButton.type = 'button'; legendButton.setAttribute('aria-expanded', 'false'); legendButton.setAttribute('aria-controls', 'repository-languages');
    const legend = element('div', 'language-legend'); legend.id = 'repository-languages'; legend.hidden = true;
    [...new Set(stats.repos.map(repo => repo.language).filter(Boolean))].forEach(language => {
      const label = element('span', 'language-name'); const dot = element('i', 'language-dot'); dot.style.setProperty('--language', colors[language] || '#A9C7FF'); label.append(dot, document.createTextNode(language)); legend.append(label);
    });
    legendButton.addEventListener('click', () => { legend.hidden = !legend.hidden; legendButton.setAttribute('aria-expanded', String(!legend.hidden)); }); toolbar.append(legendButton);
    stats.repos.forEach((repo, index) => {
      const url = safeRepoUrl(repo); if (!url) return;
      const card = element('a', 'repo-card'); card.href = url; card.target = '_blank'; card.rel = 'noopener noreferrer'; card.dataset.role = repo.role;
      const top = element('div', 'repo-topline'); top.append(element('span', '', `/${String(index + 1).padStart(2, '0')}`), element('span', '', repo.role === 'collaborator' ? 'COLLABORATOR' : 'OWNER'));
      const meta = element('div', 'repo-meta'); const lang = element('span'); const dot = element('i', 'language-dot'); dot.style.setProperty('--language', colors[repo.language] || '#A9C7FF');
      lang.append(dot, document.createTextNode(repo.language || 'Not specified'));
      meta.append(element('span', 'kind-badge', repo.kind), lang, element('span', '', `Stars ${repo.stars ?? '—'}`), element('span', '', `Forks ${repo.forks ?? '—'}`), time(repo.updatedAt, 'Updated '));
      const open = element('span', 'repo-open'); open.append(document.createTextNode('Open repository'), element('span', '', '↗'));
      card.append(top, element('h3', '', repo.name), element('p', '', repo.desc || 'No description provided.'), meta, open); list.append(card);
    });
    host.replaceChildren(toolbar, legend, resultCount, list); filter(activeFilter); return true;
  }
  function renderActivity(stats) {
    if (!Array.isArray(stats.events)) return false;
    const host = $('#activity-component');
    const card = element('div', 'activity-component'); card.append(heading('ACTIVITY.LOG', 'PUBLIC EVENTS'));
    const list = element('ol', 'activity-list');
    const groups = [];
    for (const event of stats.events) {
      if (!validDate(event.at) || typeof event.type !== 'string' || typeof event.summary !== 'string') continue;
      const last = groups.at(-1);
      if (last && last[0].type === event.type && last[0].repo === event.repo && last[0].summary === event.summary) last.push(event);
      else groups.push([event]);
    }
    groups.forEach(group => {
      const event = group[0];
      const row = element('li', 'activity-event');
      row.append(element('span', 'event-type', event.type.replace(/Event$/, '').toUpperCase()), element('p', 'event-summary', event.summary), element('span', 'event-repo', event.repo));
      if (group.length === 1) row.append(time(event.at));
      else {
        const details = element('details', 'event-group'); const summary = element('summary');
        summary.append(document.createTextNode(`${group.length} ${event.type.toLowerCase() === 'push' ? 'pushes' : 'events'} · `), time(group.at(-1).at), document.createTextNode(' to '), time(event.at));
        const times = element('ul'); group.forEach(item => { const li = element('li'); li.append(time(item.at)); times.append(li); }); details.append(summary, times); row.append(details);
      }
      list.append(row);
    });
    if (!groups.length) list.append(element('li', 'event-summary', 'No recent public events.'));
    card.classList.add('motion-zone');
    const prompt = element('p', 'terminal-prompt', 'sujel@ewu ~ $ tail -f activity.log ');
    const cursor = element('span', 'terminal-cursor', '_'); cursor.setAttribute('aria-hidden', 'true'); prompt.append(cursor);
    const raw = element('details', 'raw-data'); raw.append(element('summary', '', 'RAW JSON'), element('pre', '', JSON.stringify(stats.events, null, 2)));
    card.append(list, prompt, raw); host.replaceChildren(card); return true;
  }
  function updateTimes() {
    $$('time[datetime]').forEach(node => { node.textContent = (node.dataset.prefix || '') + age(node.dateTime); });
    if (data) {
      $('.footer-sync').textContent = `Data updated ${age(data.generatedAt)}`;
      $('.hero-sync').textContent = `sync ${age(data.generatedAt)}`;
      $('.monitor-refresh').textContent = age(data.generatedAt);
    }
  }
  function render(stats) {
    const focusedId = document.activeElement?.id;
    for (const [id, renderer] of [['telemetry', renderTelemetry], ['repositories', renderRepositories], ['activity', renderActivity]]) {
      const section = document.getElementById(id);
      const success = renderer(stats);
      section.classList.toggle('has-data', success);
      $(`#${id}-component`).hidden = !success;
    }
    data = stats;
    updateTimes(); observe(); freezeImages();
    if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  }
  async function loadData() {
    if (fetching || !compact.matches || document.hidden) return;
    fetching = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const retry = $('.retry-data'); retry.disabled = true;
    try {
      const response = await fetch('data/stats.json', { cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw new Error('Data unavailable');
      const stats = await response.json();
      if (!stats || !validDate(stats.generatedAt)) throw new Error('Invalid snapshot');
      if (!data || data.generatedAt !== stats.generatedAt) {
        if (!document.activeElement?.closest('.panel-component')) render(stats);
      }
      $('.data-notice').textContent = 'Some live data is unavailable. Showing the saved snapshot where needed.';
    } catch {
      if (!data) $('.data-notice').textContent = 'Live data is unavailable. The saved SVG snapshots are still available below each heading.';
      else $('.footer-sync').textContent = `Refresh unavailable · last data ${age(data.generatedAt)}`;
    } finally { clearTimeout(timeout); fetching = false; retry.disabled = false; }
  }
  $('.retry-data').addEventListener('click', loadData);
  setInterval(() => { if (!document.hidden) updateTimes(); }, 60000);
  setInterval(loadData, 180000);

  const frozen = new Map();
  let imageRevision = 0;
  async function freezeImages() {
    const revision = ++imageRevision;
    for (const [image] of frozen) {
      if (!image.isConnected) { URL.revokeObjectURL(image.src); frozen.delete(image); }
    }
    if (!reduced && !compact.matches) {
      for (const [image, original] of frozen) { URL.revokeObjectURL(image.src); image.src = original; }
      frozen.clear(); return;
    }
    for (const image of $$('img[src$=".svg"]')) {
      if (frozen.has(image)) continue;
      const original = image.getAttribute('src');
      try {
        const response = await fetch(original);
        if (!response.ok) continue;
        const source = await response.text();
        if ((!reduced && !compact.matches) || revision !== imageRevision) return;
        const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
        if (svg.querySelector('parsererror')) continue;
        svg.querySelectorAll('animate,animateTransform,animateMotion,set').forEach(node => node.remove());
        const style = svg.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = '*{animation:none!important;transition:none!important}.rise{opacity:1!important}.t1{opacity:1!important}.t2,.t3{opacity:0!important}';
        svg.documentElement.append(style);
        frozen.set(image, original);
        image.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
      } catch {}
    }
  }
  document.addEventListener('visibilitychange', () => {
    root.classList.toggle('page-hidden', document.hidden);
    if (document.hidden) {
      for (const [node, frame] of counters) { cancelAnimationFrame(frame); node.textContent = formatCounter(node, Number(node.dataset.count)); }
      counters.clear();
    } else { updateTimes(); loadData(); }
  });
  compact.addEventListener('change', () => {
    if (!compact.matches && dialog.open) closeExplorer();
    loadData(); scrollSpy(); freezeImages();
  });
  root.classList.add('js-ready');
  setMotion(); observe(); scrollSpy(); loadData();

  const hero = $('.hero svg');
  const reactorGroup = $('.rc', hero);
  let desktopFrame = 0;
  let pointer = null;
  function desktopReactor() {
    desktopFrame = 0;
    if (reduced || compact.matches || !reactorGroup) return;
    const rect = reactorGroup.parentNode.getBoundingClientRect();
    const bounds = hero.getBoundingClientRect();
    const k = bounds.width ? 1280 / bounds.width : 1;
    const dx = pointer ? (pointer.x - rect.left - rect.width / 2) * k : 0;
    const dy = pointer ? (pointer.y - rect.top - rect.height / 2) * k : 0;
    const distance = Math.hypot(dx, dy);
    const near = Boolean(pointer) && distance < 130;
    const pull = pointer ? Math.max(0, Math.min(1, 1 - distance / 420)) : 0;
    hero.style.setProperty('--rx', `${pointer ? Math.max(-7, Math.min(7, dx * .05)) : 0}px`);
    hero.style.setProperty('--ry', `${pointer ? Math.max(-7, Math.min(7, dy * .05)) : 0}px`);
    hero.style.setProperty('--rs', near ? '1.14' : String(1 + pull * .06));
    hero.classList.toggle('near', near);
  }
  const scheduleDesktop = () => { if (!compact.matches && !reduced && !desktopFrame) desktopFrame = requestAnimationFrame(desktopReactor); };
  window.addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY }; scheduleDesktop(); }, { passive: true });
  window.addEventListener('pointerdown', event => { pointer = { x: event.clientX, y: event.clientY }; scheduleDesktop(); }, { passive: true });
  window.addEventListener('scroll', scheduleDesktop, { passive: true });
  root.addEventListener('mouseleave', () => { pointer = null; scheduleDesktop(); });
})();
