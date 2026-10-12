import { decorateIcons, getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

/** Paths that should never appear in the auto-built navigation */
const NAV_EXCLUDES = new Set(['/nav', '/footer']);

function closeSearch(nav) {
  const search = nav?.querySelector('.nav-search');
  if (!search) return;
  const toggle = search.querySelector('.nav-search-toggle');
  const panel = search.querySelector('.nav-search-panel');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  if (panel) {
    panel.hidden = true;
    panel.classList.remove('is-open');
  }
  search.classList.remove('is-open');
}

function closeOnEscape(e) {
  if (e.code !== 'Escape') return;
  const nav = document.getElementById('nav');
  if (!nav) return;

  const searchOpen = nav.querySelector('.nav-search.is-open');
  if (searchOpen) {
    closeSearch(nav);
    searchOpen.querySelector('.nav-search-toggle')?.focus();
    return;
  }

  const navSections = nav.querySelector('.nav-sections');
  if (!navSections) return;
  const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
  if (navSectionExpanded && isDesktop.matches) {
    // eslint-disable-next-line no-use-before-define
    toggleAllNavSections(navSections);
    const dropToggle = navSectionExpanded.querySelector('.nav-drop-toggle');
    if (dropToggle) dropToggle.focus();
    else navSectionExpanded.focus();
  } else if (!isDesktop.matches) {
    // eslint-disable-next-line no-use-before-define
    toggleMenu(nav, navSections);
    nav.querySelector('.nav-hamburger button')?.focus();
  }
}

function closeOnFocusLost(e) {
  const nav = e.currentTarget;
  if (!nav.contains(e.relatedTarget)) {
    closeSearch(nav);
    const navSections = nav.querySelector('.nav-sections');
    if (!navSections) return;
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections, false);
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections, false);
    }
  }
}

function openOnKeydown(e) {
  const focused = document.activeElement;
  if (!focused?.classList?.contains('nav-drop-toggle')) return;
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    const drop = focused.closest('.nav-drop');
    if (!drop) return;
    const dropExpanded = drop.getAttribute('aria-expanded') === 'true';
    // eslint-disable-next-line no-use-before-define
    toggleAllNavSections(focused.closest('.nav-sections'));
    drop.setAttribute('aria-expanded', dropExpanded ? 'false' : 'true');
    focused.setAttribute('aria-expanded', dropExpanded ? 'false' : 'true');
  }
}

function focusNavSection() {
  document.activeElement.addEventListener('keydown', openOnKeydown);
}

/**
 * Toggles all nav sections
 * @param {Element} sections The container element
 * @param {Boolean} expanded Whether the element should be expanded or collapsed
 */
function toggleAllNavSections(sections, expanded = false) {
  if (!sections) return;
  const isExpanded = expanded === true || expanded === 'true';
  sections.querySelectorAll(':scope .default-content-wrapper > ul > li').forEach((section) => {
    section.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    const toggle = section.querySelector(':scope > .nav-drop-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  });
}

/**
 * Toggles the entire nav
 * @param {Element} nav The container element
 * @param {Element} navSections The nav sections within the container element
 * @param {*} forceExpanded Optional param to force nav expand behavior when not null
 */
function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
  const button = nav.querySelector('.nav-hamburger button');
  document.body.style.overflowY = (expanded || isDesktop.matches) ? '' : 'hidden';
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  toggleAllNavSections(navSections, !(expanded || isDesktop.matches));
  if (button) {
    button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  }
  if (expanded) closeSearch(nav);

  // enable nav dropdown keyboard accessibility
  if (navSections) {
    const navDrops = navSections.querySelectorAll('.nav-drop-toggle');
    if (isDesktop.matches) {
      navDrops.forEach((drop) => {
        drop.addEventListener('focus', focusNavSection);
      });
    } else {
      navDrops.forEach((drop) => {
        drop.removeEventListener('focus', focusNavSection);
      });
    }
  }

  // enable menu collapse on escape keypress
  if (!expanded || isDesktop.matches) {
    window.addEventListener('keydown', closeOnEscape);
    nav.addEventListener('focusout', closeOnFocusLost);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
    nav.removeEventListener('focusout', closeOnFocusLost);
  }
}

/**
 * Converts a path segment into a readable label.
 * @param {string} path
 * @param {string} [title]
 * @returns {string}
 */
function pathToLabel(path, title) {
  if (title) return title;
  const segment = path.split('/').filter(Boolean).pop() || 'Home';
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Fetches all rows from the site query index.
 * @param {string} indexUrl
 * @returns {Promise<object[]>}
 */
async function fetchIndexPages(indexUrl) {
  const limit = 500;
  const separator = indexUrl.includes('?') ? '&' : '?';
  const firstResp = await fetch(`${indexUrl}${separator}offset=0&limit=${limit}`);
  if (!firstResp.ok) return [];

  const firstJson = await firstResp.json();
  const pages = [...(firstJson.data || [])];
  const total = firstJson.total || pages.length;
  if (pages.length >= total) return pages;

  const requests = [];
  for (let offset = limit; offset < total; offset += limit) {
    requests.push(
      fetch(`${indexUrl}${separator}offset=${offset}&limit=${limit}`)
        .then((resp) => (resp.ok ? resp.json() : { data: [] })),
    );
  }
  const batches = await Promise.all(requests);
  batches.forEach((json) => pages.push(...(json.data || [])));
  return pages;
}

/**
 * Builds a parent/child nav tree from indexed pages.
 * @param {object[]} pages
 * @returns {{ path: string, title: string, description: string, children: object[] }[]}
 */
function buildNavTree(pages) {
  const items = pages
    .filter((page) => {
      const path = (page.path || '').replace(/\/$/, '') || '/';
      if (path === '/') return false;
      if (NAV_EXCLUDES.has(path)) return false;
      const leaf = path.split('/').pop();
      if (NAV_EXCLUDES.has(`/${leaf}`)) return false;
      if (String(page.robots || '').includes('noindex')) return false;
      if (String(page['hide-in-nav'] || page.hideInNav || '').toLowerCase() === 'true') return false;
      return true;
    })
    .map((page) => {
      const path = page.path.replace(/\/$/, '') || '/';
      return {
        path,
        title: pathToLabel(path, page['nav-title'] || page.title),
        description: page.description || page['og:description'] || '',
        navOrder: Number(page['nav-order'] || page.navOrder || 0) || 0,
        children: [],
      };
    })
    .sort((a, b) => a.navOrder - b.navOrder || a.path.localeCompare(b.path));

  const byPath = new Map(items.map((item) => [item.path, item]));
  const roots = [];

  byPath.forEach((item) => {
    const parts = item.path.split('/').filter(Boolean);
    let parent = null;
    for (let i = parts.length - 1; i >= 1; i -= 1) {
      const parentPath = `/${parts.slice(0, i).join('/')}`;
      if (byPath.has(parentPath)) {
        parent = byPath.get(parentPath);
        break;
      }
    }
    if (parent) parent.children.push(item);
    else roots.push(item);
  });

  return roots;
}

/**
 * Renders a mega-menu child link with optional summary.
 * @param {{ path: string, title: string, description?: string }} child
 * @returns {HTMLElement}
 */
function renderNavChild(child) {
  const childItem = document.createElement('li');
  childItem.className = 'nav-child';
  const childLink = document.createElement('a');
  childLink.href = child.path;
  childLink.className = 'nav-child-link';

  const title = document.createElement('span');
  title.className = 'nav-child-title';
  title.textContent = child.title;
  childLink.append(title);

  if (child.description) {
    const summary = document.createElement('p');
    summary.className = 'nav-child-summary';
    summary.textContent = child.description;
    childLink.append(summary);
  }

  childItem.append(childLink);
  return childItem;
}

/**
 * Renders nav sections markup expected by header CSS.
 * @param {{ path: string, title: string, description?: string, children: object[] }[]} tree
 * @returns {HTMLElement}
 */
function renderNavSections(tree) {
  const section = document.createElement('div');
  section.className = 'nav-sections';

  const wrapper = document.createElement('div');
  wrapper.className = 'default-content-wrapper';

  const ul = document.createElement('ul');
  tree.forEach((item) => {
    const li = document.createElement('li');

    if (item.children?.length) {
      li.classList.add('nav-drop');
      li.setAttribute('aria-expanded', 'false');

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'nav-drop-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = item.title;
      li.append(toggle);

      const mega = document.createElement('div');
      mega.className = 'nav-mega';

      const parentLink = document.createElement('a');
      parentLink.href = item.path;
      parentLink.className = 'nav-mega-parent';
      parentLink.textContent = `${item.title}.`;
      mega.append(parentLink);

      const childList = document.createElement('ul');
      childList.className = 'nav-children';
      item.children.forEach((child) => childList.append(renderNavChild(child)));
      mega.append(childList);
      li.append(mega);
    } else {
      const link = document.createElement('a');
      link.href = item.path;
      link.className = 'nav-link';
      link.textContent = item.title;
      li.append(link);
    }

    ul.append(li);
  });

  wrapper.append(ul);
  section.append(wrapper);
  return section;
}

/**
 * Loads and builds navigation from the query index.
 * @returns {Promise<{ path: string, title: string, description: string, children: object[] }[]>}
 */
async function loadNavTreeFromIndex() {
  const indexMeta = getMetadata('nav-index');
  const indexUrl = indexMeta || '/query-index.json';
  try {
    const pages = await fetchIndexPages(indexUrl);
    return buildNavTree(pages);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to build navigation from query index', e);
    return [];
  }
}

/**
 * Decorates dropdown behavior on nav section items.
 * @param {Element} navSections
 */
function decorateNavSections(navSections) {
  if (!navSections) return;
  navSections.querySelectorAll(':scope .default-content-wrapper > ul > li.nav-drop').forEach((navSection) => {
    const toggle = navSection.querySelector(':scope > .nav-drop-toggle');
    const openDrop = () => {
      if (!isDesktop.matches) return;
      const expanded = navSection.getAttribute('aria-expanded') === 'true';
      toggleAllNavSections(navSections);
      navSection.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    };
    toggle?.addEventListener('click', openDrop);
    navSection.addEventListener('click', (e) => {
      if (!isDesktop.matches) return;
      if (e.target.closest('.nav-mega')) return;
      if (e.target.closest('.nav-drop-toggle')) return;
      openDrop();
    });
  });
}

/**
 * Marks the audience link matching the current path as active.
 * @param {Element} navAudience
 */
function markActiveAudience(navAudience) {
  if (!navAudience) return;
  const current = window.location.pathname.replace(/\/$/, '') || '/';
  navAudience.querySelectorAll('a').forEach((link) => {
    const href = new URL(link.href, window.location.origin).pathname.replace(/\/$/, '') || '/';
    if (href === current || (href !== '/' && current.startsWith(`${href}/`))) {
      link.classList.add('nav-audience-active');
      link.setAttribute('aria-current', href === current ? 'page' : 'true');
    }
  });
}

/**
 * Builds a Login CTA container from an existing link or a default /login fallback.
 * @param {Element|null} loginLink
 * @returns {HTMLElement}
 */
function buildLogin(loginLink) {
  const login = document.createElement('div');
  login.className = 'nav-login';
  if (loginLink) {
    const btn = loginLink.cloneNode(true);
    btn.classList.add('nav-login-btn');
    btn.classList.remove('button', 'primary', 'secondary', 'accent');
    const btnContainer = loginLink.closest('.button-container, .button-wrapper');
    loginLink.remove();
    if (btnContainer && !btnContainer.querySelector('a, button')) btnContainer.remove();
    login.append(btn);
  } else {
    const btn = document.createElement('a');
    btn.href = '/login';
    btn.className = 'nav-login-btn';
    btn.textContent = 'Login';
    login.append(btn);
  }
  return login;
}

/**
 * Promotes a Login link from tools into a dedicated CTA container.
 * Falls back to /login so the mobile bar always matches the Westpac layout.
 * @param {Element} navTools
 * @returns {HTMLElement}
 */
function promoteLogin(navTools) {
  const links = navTools ? [...navTools.querySelectorAll('a')] : [];
  let loginLink = links.find((a) => /login/i.test(a.textContent.trim()));
  if (!loginLink && links.length) loginLink = links[links.length - 1];
  return buildLogin(loginLink || null);
}

/**
 * Builds the search control and expandable panel.
 * @returns {HTMLElement}
 */
function buildSearch() {
  const search = document.createElement('div');
  search.className = 'nav-search';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-search-toggle';
  toggle.setAttribute('aria-label', 'Search');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<span class="icon icon-search"></span>';

  const panel = document.createElement('form');
  panel.className = 'nav-search-panel';
  panel.action = '/search';
  panel.method = 'get';
  panel.hidden = true;
  panel.innerHTML = `
    <label class="nav-search-label" for="nav-search-input">Search</label>
    <input id="nav-search-input" class="nav-search-input" type="search" name="q" placeholder="Search" autocomplete="off">
    <button type="submit" class="nav-search-submit">Search</button>
    <button type="button" class="nav-search-close" aria-label="Close search"></button>
  `;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.hidden = !open;
    panel.classList.toggle('is-open', open);
    search.classList.toggle('is-open', open);
    if (open) {
      panel.querySelector('#nav-search-input')?.focus();
    }
  };

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
  });
  panel.querySelector('.nav-search-close')?.addEventListener('click', () => {
    setOpen(false);
    toggle.focus();
  });

  search.append(toggle, panel);
  decorateIcons(search);
  return search;
}

/**
 * Assigns brand / audience / tools classes from fragment sections.
 * @param {Element} nav
 */
function classifyFragmentSections(nav) {
  const sections = [...nav.children];
  if (sections.length >= 3) {
    sections[0].classList.add('nav-brand');
    sections[1].classList.add('nav-audience');
    sections[2].classList.add('nav-tools');
  } else if (sections.length === 2) {
    sections[0].classList.add('nav-brand');
    sections[1].classList.add('nav-tools');
  } else if (sections.length === 1) {
    sections[0].classList.add('nav-brand');
  }
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);

  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  nav.setAttribute('aria-label', 'Main');

  const fragmentRoot = document.createElement('div');
  if (fragment) {
    while (fragment.firstElementChild) fragmentRoot.append(fragment.firstElementChild);
  }
  classifyFragmentSections(fragmentRoot);

  let navBrand = fragmentRoot.querySelector('.nav-brand');
  if (!navBrand) {
    navBrand = document.createElement('div');
    navBrand.className = 'nav-brand';
    navBrand.innerHTML = '<p><a href="/">Home</a></p>';
  }

  const brandLink = navBrand.querySelector('a');
  if (brandLink) {
    brandLink.classList.remove('button', 'primary', 'secondary', 'accent');
    const brandContainer = brandLink.closest('.button-container, .button-wrapper');
    if (brandContainer) brandContainer.className = '';
  }

  const navAudience = fragmentRoot.querySelector('.nav-audience');
  markActiveAudience(navAudience);

  const navTools = fragmentRoot.querySelector('.nav-tools');
  // dedicated nav-search replaces authored search icons in tools
  navTools?.querySelectorAll('.icon-search').forEach((icon) => {
    const host = icon.closest('li, p') || icon;
    host.remove();
  });
  const navLogin = promoteLogin(navTools);
  const navSearch = buildSearch();

  const navTree = await loadNavTreeFromIndex();
  const navSections = renderNavSections(navTree);
  decorateNavSections(navSections);

  const hamburger = document.createElement('div');
  hamburger.classList.add('nav-hamburger');
  hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation">
      <span class="nav-hamburger-icon"></span>
    </button>`;
  hamburger.addEventListener('click', () => toggleMenu(nav, navSections));

  const navTop = document.createElement('div');
  navTop.className = 'nav-top';
  navTop.append(hamburger, navBrand);
  if (navAudience) navTop.append(navAudience);
  if (navTools) navTop.append(navTools);
  if (navLogin) navTop.append(navLogin);
  navTop.append(navSearch);

  const navBottom = document.createElement('div');
  navBottom.className = 'nav-bottom';
  navBottom.append(navSections);

  nav.append(navTop, navBottom);
  nav.setAttribute('aria-expanded', 'false');
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);
}
