import { LightningElement, api } from 'lwc';
import { siteUrl } from 'c/emSiteUrls';

/**
 * EM Portal Footer - site footer for the EM Study Portal (LWR) theme footer region.
 * Left: organisation line + optional environment note; right: configurable links ("Label|/path;...") and a
 * support e-mail. Paths resolve through c/emSiteUrls (site-relative); absolute http(s)/mailto links pass through.
 * Phase 5, 2026-09-16.
 */
export default class EmPortalFooter extends LightningElement {
    @api orgName = 'Equity Medical';
    @api text = 'Study onboarding portal';
    @api environmentNote = '';
    @api links = '';
    @api supportEmail = '';
    @api supportLabel = 'Support';
    @api hideYear = false;

    get year() { return new Date().getFullYear(); }
    get showYear() { return !this.hideYear; }
    get hasNote() { return !!(this.environmentNote && this.environmentNote.trim()); }
    get hasSupport() { return !!(this.supportEmail && this.supportEmail.trim()); }
    get supportHref() { return `mailto:${(this.supportEmail || '').trim()}`; }
    get linkItems() {
        return String(this.links || '').split(';').map((item, i) => {
            const [label, path] = item.split('|').map((x) => (x || '').trim());
            if (!label) return null;
            return { key: `${i}-${label}`, label, href: siteUrl(path || '/') };
        }).filter(Boolean);
    }
    get hasLinks() { return this.linkItems.length > 0 || this.hasSupport; }
}