import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { getRecord } from 'lightning/uiRecordApi';
import USER_ID from '@salesforce/user/Id';
import NAME_FIELD from '@salesforce/schema/User.FirstName';
import { inSite, siteUrl } from 'c/emSiteUrls';

/**
 * Study Onboarding home (Abbey's landing page, Show & Tell #3 "at a glance" ask): greeting + quick actions,
 * the portfolio board full-width, then My onboarding work beside Upcoming milestones. Pure composition of the
 * three EM widgets so the layout does not depend on the home-page template's regions. Phase 4 WU6.
 */
export default class EmStudyOpsHome extends NavigationMixin(LightningElement) {
    @api horizonDays = 60;
    /** Site-relative path of the Studies page when rendered inside the EM Study Portal (Phase 5). */
    @api studiesPath = '/studies';
    firstName = '';
    get inLex() { return !inSite; }
    get studiesHref() { return siteUrl(this.studiesPath || '/'); }
    @wire(getRecord, { recordId: USER_ID, fields: [NAME_FIELD] })
    wiredUser({ data }) { if (data) this.firstName = data.fields.FirstName.value || ''; }
    get greeting() {
        const h = new Date().getHours();
        const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
        return this.firstName ? `${part}, ${this.firstName}` : part;
    }
    get today() { return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
    handleNewStudy() {
        this[NavigationMixin.Navigate]({ type: 'standard__objectPage', attributes: { objectApiName: 'CareProgram', actionName: 'new' } });
    }
    handleStudies() {
        this[NavigationMixin.Navigate]({ type: 'standard__objectPage', attributes: { objectApiName: 'CareProgram', actionName: 'list' }, state: { filterName: 'Recent' } });
    }
    handleReports() {
        this[NavigationMixin.Navigate]({ type: 'standard__objectPage', attributes: { objectApiName: 'Report', actionName: 'home' } });
    }
    handleSites() {
        this[NavigationMixin.Navigate]({ type: 'standard__objectPage', attributes: { objectApiName: 'CareProgramSite', actionName: 'list' }, state: { filterName: 'Recent' } });
    }
}