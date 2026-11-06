import { LightningElement, api, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import USER_ID from '@salesforce/user/Id';
import NAME_FIELD from '@salesforce/schema/User.Name';
import EM_LOGO from '@salesforce/resourceUrl/EM_Logo';
import { siteUrl, logoutUrl } from 'c/emSiteUrls';

/**
 * EM Portal Header - branded site header for the EM Study Portal (LWR) theme header region.
 * Logo (EM_Logo static resource, overridable), site title, configurable navigation, signed-in user + Log out.
 * Nav links: "Label|/path" items separated by ";" - paths are site-relative and resolved through c/emSiteUrls,
 * so the same component works whatever URL prefix the site has. No Apex; user name via LDS. Phase 5, 2026-09-16.
 */
export default class EmPortalHeader extends LightningElement {
    @api siteTitle = 'Study Portal';
    @api tagline = '';
    @api homePath = '/';
    @api navLinks = 'Home|/;Studies|/studies;My work|/my-work;Milestones|/milestones';
    @api logoUrl = '';
    @api hideLogo = false;
    @api hideUser = false;
    @api accentColor = '#0b5cab';
    @api logoutLabel = 'Log out';
    menuOpen = false;
    userName = '';

    @wire(getRecord, { recordId: USER_ID, fields: [NAME_FIELD] })
    wiredUser({ data }) { if (data) this.userName = data.fields.Name.value || ''; }

    get logoSrc() { return this.logoUrl && this.logoUrl.trim() ? this.logoUrl.trim() : EM_LOGO; }
    get showLogo() { return !this.hideLogo; }
    get showUser() { return !this.hideUser && !!USER_ID; }
    get homeHref() { return siteUrl(this.homePath || '/'); }
    get logoutHref() { return logoutUrl(); }
    get hasTagline() { return !!(this.tagline && this.tagline.trim()); }
    get barStyle() { return `border-bottom-color:${this.accentColor || '#0b5cab'};`; }
    get userInitial() { return this.userName ? this.userName.trim().charAt(0).toUpperCase() : ''; }
    get menuIcon() { return this.menuOpen ? 'utility:close' : 'utility:rows'; }
    get navClass() { return this.menuOpen ? 'nav open' : 'nav'; }

    get links() {
        let current = '';
        try { current = (window.location.pathname || '').replace(/\/+$/, '') || '/'; } catch (e) { /* ignore */ }
        return String(this.navLinks || '').split(';').map((item, i) => {
            const [label, path] = item.split('|').map((x) => (x || '').trim());
            if (!label) return null;
            const href = siteUrl(path || '/');
            const norm = href.replace(/\/+$/, '') || '/';
            const isHome = (path || '/') === '/';
            const active = isHome ? current === norm : (current === norm || current.startsWith(`${norm}/`));
            return { key: `${i}-${label}`, label, href, className: active ? 'link active' : 'link', style: active ? `border-bottom-color:${this.accentColor || '#0b5cab'};` : '' };
        }).filter(Boolean);
    }
    toggleMenu() { this.menuOpen = !this.menuOpen; }
    closeMenu() { this.menuOpen = false; }
}