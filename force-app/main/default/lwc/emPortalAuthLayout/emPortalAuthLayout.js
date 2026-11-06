import { LightningElement, api } from 'lwc';
import EM_LOGO from '@salesforce/resourceUrl/EM_Logo';

/**
 * Theme layout for the Onboarding Hub sign-in pages. The page content
 * (community_login components) renders in the default slot.
 * @slot default
 */
export default class EmPortalAuthLayout extends LightningElement {
    static renderMode = 'light';

    @api siteTitle = 'Onboarding Hub';
    @api tagline = 'Equity Medical study onboarding';
    @api highlights = '';
    @api environmentNote = '';
    @api supportEmail = '';

    logoSrc = EM_LOGO;
    year = new Date().getFullYear();

    get highlightItems() {
        return (this.highlights || '')
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s)
            .map((label, i) => ({ key: 'h' + i, label }));
    }
    get hasHighlights() { return this.highlightItems.length > 0; }
    get hasNote() { return !!(this.environmentNote && this.environmentNote.trim()); }
    get hasSupport() { return !!(this.supportEmail && this.supportEmail.trim()); }
    get supportHref() { return 'mailto:' + this.supportEmail.trim(); }
}