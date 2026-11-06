import { LightningElement, api } from 'lwc';
import { siteUrl } from 'c/emSiteUrls';

/**
 * EM Portal Page Banner - the blue gradient page title strip used at the top of every portal page
 * (twin of the home hero): icon, title, subtitle, optional back link. Phase 5, 2026-09-16.
 */
export default class EmPortalPageBanner extends LightningElement {
    @api title = 'Page title';
    @api subtitle = '';
    @api iconName = '';
    @api backLabel = '';
    @api backPath = '/';

    get hasSubtitle() { return !!(this.subtitle && this.subtitle.trim()); }
    get hasIcon() { return !!(this.iconName && this.iconName.trim()); }
    get hasBack() { return !!(this.backLabel && this.backLabel.trim()); }
    get backHref() { return siteUrl(this.backPath || '/'); }
}