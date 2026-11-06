import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

/**
 * Abbey's Study card — header for the CareProgram record page. Pared down 2026-11-03 per Abbey's ask: shows
 * only Onboarding Status, Onboarding Step, Onboarding Progress, Program Sponsor, Protocol Number and Target
 * Activation Date (mirrors the standard record page's compact-layout header), plus the study Name as a title.
 * Read-only by design.
 */
const F = (n) => `CareProgram.${n}`;
const FIELDS = [
    'Name', 'Protocol_Number__c', 'EM_Overall_Status__c', 'Onboarding_Status__c',
    'Onboarding_Progress__c', 'Target_Activation_Date__c'
].map(F);
const OPTIONAL_FIELDS = ['CareProgram.Sponsor.Name'];

export default class EmStudyCard extends LightningElement {
    @api recordId;
    record;

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS, optionalFields: OPTIONAL_FIELDS })
    wiredRecord({ data }) {
        if (data) this.record = data;
    }

    v(f) { return getFieldValue(this.record, F(f)); }

    get name() { return this.v('Name') || ''; }

    get onboardingStatus() { return this.v('EM_Overall_Status__c') || 'Not Started'; }
    get onboardingStep() { return this.v('Onboarding_Status__c') || '—'; }

    get progress() {
        const p = this.v('Onboarding_Progress__c');
        return p === null || p === undefined ? 0 : Math.max(0, Math.min(100, Math.round(p)));
    }
    get progressLabel() { return `${this.progress}%`; }

    get sponsor() { return getFieldValue(this.record, 'CareProgram.Sponsor.Name') || '—'; }
    get protocol() { return this.v('Protocol_Number__c') || '—'; }

    get targetDate() {
        const d = this.v('Target_Activation_Date__c');
        if (!d) return '—';
        return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}