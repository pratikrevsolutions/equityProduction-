import { LightningElement, api } from 'lwc';
import hasFinanceAccess from '@salesforce/customPermission/EM_Finance_Access';

/**
 * EM Portal Study Tabs - Onboarding Hub (LWR) study page body under the study card: "Details" (default; the
 * 6 key fields via c/emPortalRecordDetails' exclusiveFields) and "Care Program Team Members" (that related
 * list only, with a New button - related-list id is hardcoded in the markup, not bound to the relatedLists
 * design property, so Sites/Study Records can't come back via a stale Experience Builder property value).
 * The open tab follows ?tab=onboarding so a link can land on it.
 */
const TABS = new Set(['onboarding', 'details']);
// The nine amounts of the "Contract & Budget — Amounts (finance only)" section = the fields of EM_PS_Budget_Fields.
// Hidden unless the user holds EM_Finance_Access (EM_Finance_Budget): BudgetAmount is readable through standard
// profile FLS, so field security alone does not keep it from non-finance users.
const FINANCE_FIELDS = ['EM_Original_CTA_Value__c', 'EM_Original_CPP__c', 'BudgetAmount', 'Advertising_Budget__c',
    'EM_Subject_Stipend__c', 'EM_Current_CTA_Value__c', 'EM_Current_CPP__c', 'EM_Fixed_SSU_Fees__c', 'Total_Compensation__c'];

export default class EmPortalStudyTabs extends LightningElement {
    @api recordId;
    // Kept so the existing page placement's design properties still resolve to a real @api (Salesforce
    // rejects a deploy otherwise) - not read anymore; the Care Program Team Members tab is hardcoded.
    @api itemsTitle;
    @api maxLists;
    @api relatedLists;

    activeTab = 'details';

    get hiddenFields() { return hasFinanceAccess ? '' : FINANCE_FIELDS.join(','); }

    connectedCallback() {
        try {
            const t = new URL(window.location.href).searchParams.get('tab');
            if (TABS.has(t)) this.activeTab = t;
        } catch (e) { /* keep the default tab */ }
    }

    handleActive(event) {
        const value = event.target.value;
        if (value === this.activeTab) return;
        this.activeTab = value;
        try {
            const url = new URL(window.location.href);
            if (value === 'details') url.searchParams.delete('tab');
            else url.searchParams.set('tab', value);
            window.history.replaceState(window.history.state, '', url.toString());
        } catch (e) { /* URL sync is a convenience only */ }
    }
}