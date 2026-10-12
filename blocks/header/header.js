import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

/** Paths that should never appear in the auto-built navigation */
const NAV_EXCLUDES = new Set(['/nav', '/footer']);

function closeOnEscape(e) {
  if (e.code === 'Escape') {
    const nav = document.getElementById('nav');
    const navSections = nav.querySelector('.nav-sections');
    if (!navSections) return;
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections);
      navSectionExpanded.focus();
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections);
      nav.querySelector('button').focus();
    }
  }
}

function closeOnFocusLost(e) {
  const nav = e.currentTarget;
  if (!nav.contains(e.relatedTarget)) {
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
  const isNavDrop = focused.className === 'nav-drop';
  if (isNavDrop && (e.code === 'Enter' || e.code === 'Space')) {
    const dropExpanded = focused.getAttribute('aria-expanded') === 'true';
    // eslint-disable-next-line no-use-before-define
    toggleAllNavSections(focused.closest('.nav-sections'));
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
  sections.querySelectorAll(':scope .default-content-wrapper > ul > li').forEach((section) => {
    section.setAttribute('aria-expanded', expanded);
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
  toggleAllNavSections(navSections, expanded || isDesktop.matches ? 'false' : 'true');
  button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  // enable nav dropdown keyboard accessibility
  if (navSections) {
    const navDrops = navSections.querySelectorAll('.nav-drop');
    if (isDesktop.matches) {
      navDrops.forEach((drop) => {
        if (!drop.hasAttribute('tabindex')) {
          drop.setAttribute('tabindex', 0);
          drop.addEventListener('focus', focusNavSection);
        }
      });
    } else {
      navDrops.forEach((drop) => {
        drop.removeAttribute('tabindex');
        drop.removeEventListener('focus', focusNavSection);
      });
    }
  }

  // enable menu collapse on escape keypress
  if (!expanded || isDesktop.matches) {
    // collapse menu on escape press
    window.addEventListener('keydown', closeOnEscape);
    // collapse menu on focus lost
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
 * @returns {{ path: string, title: string, children: object[] }[]}
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
 * Renders nav sections markup expected by header CSS.
 * @param {{ path: string, title: string, children: object[] }[]} tree
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
    const link = document.createElement('a');
    link.href = item.path;
    link.textContent = item.title;
    li.append(link);

    if (item.children?.length) {
      const childList = document.createElement('ul');
      item.children.forEach((child) => {
        const childItem = document.createElement('li');
        const childLink = document.createElement('a');
        childLink.href = child.path;
        childLink.textContent = child.title;
        childItem.append(childLink);
        childList.append(childItem);
      });
      li.append(childList);
    }

    ul.append(li);
  });

  wrapper.append(ul);
  section.append(wrapper);
  return section;
}

/**
 * Loads and builds navigation from the query index.
 * @returns {Promise<{ path: string, title: string, children: object[] }[]>}
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
  navSections.querySelectorAll(':scope .default-content-wrapper > ul > li').forEach((navSection) => {
    if (navSection.querySelector('ul')) navSection.classList.add('nav-drop');
    navSection.addEventListener('click', (e) => {
      // on desktop, only toggle when clicking the top-level label (not a child link)
      if (!isDesktop.matches) return;
      if (e.target.closest('ul ul')) return;
      const expanded = navSection.getAttribute('aria-expanded') === 'true';
      toggleAllNavSections(navSections);
      navSection.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    });
  });
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  // load nav fragment for brand + tools; sections are built from the page index
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);

  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  if (fragment) {
    while (fragment.firstElementChild) nav.append(fragment.firstElementChild);
  }

  const classes = ['brand', 'sections', 'tools'];
  classes.forEach((c, i) => {
    const section = nav.children[i];
    if (section) section.classList.add(`nav-${c}`);
  });

  let navBrand = nav.querySelector('.nav-brand');
  if (!navBrand) {
    navBrand = document.createElement('div');
    navBrand.className = 'nav-brand';
    navBrand.innerHTML = '<p><a href="/">Home</a></p>';
    nav.prepend(navBrand);
  }

  const brandLink = navBrand.querySelector('a');
  if (brandLink) {
    brandLink.classList.remove('button', 'primary', 'secondary', 'accent');
    const brandContainer = brandLink.closest('.button-container, .button-wrapper');
    if (brandContainer) brandContainer.className = '';
  }

  const navTree = await loadNavTreeFromIndex();
  const generatedSections = renderNavSections(navTree);
  const existingSections = nav.querySelector('.nav-sections');
  if (existingSections) {
    existingSections.replaceWith(generatedSections);
  } else {
    navBrand.after(generatedSections);
  }

  const navSections = nav.querySelector('.nav-sections');
  decorateNavSections(navSections);

  // hamburger for mobile
  const hamburger = document.createElement('div');
  hamburger.classList.add('nav-hamburger');
  hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation">
      <span class="nav-hamburger-icon"></span>
    </button>`;
  hamburger.addEventListener('click', () => toggleMenu(nav, navSections));
  nav.prepend(hamburger);
  nav.setAttribute('aria-expanded', 'false');
  // prevent mobile nav behavior on window resize
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);
}
