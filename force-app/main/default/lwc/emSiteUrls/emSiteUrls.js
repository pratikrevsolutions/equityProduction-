/**
 * URL helper shared by the EM components (runtime detection, WU8 2026-09-10; generic site detection Phase 5 2026-09-16).
 * Replaces the static `@salesforce/community/basePath` import: per the LWC guide a component that imports
 * @salesforce/community can target only Experience Builder pages, and the import broke the LEX home/record pages
 * (Session 46 regression). Exports: inSite, basePath, siteUrl, recordUrl, hasRecordPage, studyUrl, logoutUrl.
 *
 * Detection order:
 *   1. /lightning/... and /one/... are always the core org (never a site).
 *   2. A known site prefix (KNOWN_SITE_PATHS) at the start of the pathname -> that prefix is the base path.
 *   3. Otherwise, if the host is an Experience Cloud host (*.my.site.com, *.salesforce-experience.com, legacy
 *      *.force.com site domains, but NOT *.lightning.force.com / *.vf.force.com) the first path segment is the
 *      site's URL prefix (a root-prefix site yields ''), so a NEW site with any prefix works without a code change.
 *   4. Everything else (Flow runtime, Visualforce, Builder frames on other paths) resolves to the core org and
 *      uses Lightning record URLs.
 *
 * Inside an LWR site the pages live under the prefix (e.g. /studyportal/, /studyportal/careprogram/<Id>);
 * an Aura site would use /<prefix>/s/....
 */
const KNOWN_SITE_PATHS = ['/studyportal'];
// Framework/system first segments that are never a site URL prefix.
const RESERVED = new Set(['sfsites', 'secur', 'apex', 'servlet', 's', '_ui', 'setup', 'flow', 'visualforce', 'lwr', 'resource', 'login', '_nc_external', 'services', 'home', 'lightning', 'one']);
// Object pages in the site (urlPrefix of each detail route). Task / CareProgramSite / DocumentChecklistItem /
// ResearchStudy pages added WU11e 2026-09-25 (emPortalRecordPage).
const OBJECT_ROUTE = { CareProgram: 'careprogram', Task: 'task', CareProgramSite: 'studysite', DocumentChecklistItem: 'checklistitem', ResearchStudy: 'researchstudy' };

function isSiteHost(host) {
    const h = (host || '').toLowerCase();
    if (!h) return false;
    if (h.endsWith('.my.site.com') || h.endsWith('.salesforce-experience.com')) return true;
    if (h.endsWith('.force.com')) {
        // core-org hosts that also end with .force.com
        return !(h.includes('.lightning.force.com') || h.includes('.vf.force.com') || h.includes('.visual.force.com') || h.includes('.my.salesforce.com'));
    }
    return false;
}

function detect() {
    try {
        const loc = (typeof window !== 'undefined' && window.location) || {};
        const p = loc.pathname || '';
        const host = loc.hostname || '';
        if (p.startsWith('/lightning') || p.startsWith('/one/')) return { site: false, base: '' };
        for (const base of KNOWN_SITE_PATHS) {
            if (p === base || p.startsWith(`${base}/`)) return { site: true, base };
        }
        if (isSiteHost(host)) {
            const seg = p.split('/')[1] || '';
            if (!seg || RESERVED.has(seg.toLowerCase())) return { site: true, base: '' }; // root-prefix site or a framework path
            return { site: true, base: `/${seg}` };
        }
    } catch (e) {
        // defensive: sandboxed frames / LWS may deny location access - treat as core org
    }
    return { site: false, base: '' };
}

const detected = detect();
const SITE = detected.site;
export const inSite = SITE;
export const basePath = detected.base;

/** Join a site-relative path ('/', '/studies', 'my-work') onto the site base path. Outside a site returns the path unchanged. */
export function siteUrl(path) {
    const p = path == null ? '' : String(path).trim();
    if (/^(https?:)?\/\//i.test(p) || p.startsWith('mailto:') || p.startsWith('tel:') || p.startsWith('#')) return p;
    const rel = p.startsWith('/') ? p : `/${p}`;
    return SITE ? `${basePath}${rel}` : rel;
}
export function recordUrl(objectApiName, id) {
    if (!id) return '#';
    if (SITE) {
        const route = OBJECT_ROUTE[objectApiName];
        return route ? `${basePath}/${route}/${id}` : `${basePath}/`;
    }
    return `/lightning/r/${objectApiName}/${id}/view`;
}
/** True when the object has a page here: always in the core org, in a site only for the routed objects above. */
export function hasRecordPage(objectApiName) { return !SITE || !!OBJECT_ROUTE[objectApiName]; }
export function studyUrl(id) { return recordUrl('CareProgram', id); }
export function logoutUrl() { return SITE ? `${basePath}/secur/logout.jsp` : '/secur/logout.jsp'; }