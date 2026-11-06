import { LightningElement, api, wire } from 'lwc';
import { gql, graphql } from 'lightning/uiGraphQLApi';
import { recordUrl, studyUrl, inSite } from 'c/emSiteUrls';

/**
 * Upcoming onboarding milestones across all studies for the next N days (default 60): target activations,
 * scheduled SIVs, sponsor activations and next-action due dates — one timeline, overdue first. Also the
 * "recently awarded" strip. Read-only GraphQL in user context, no Apex. Phase 4 WU6.
 */
const TYPES = {
    target: { label: 'Target activation', cls: 'type target' },
    siv: { label: 'SIV scheduled', cls: 'type siv' },
    sponsor: { label: 'Sponsor activation', cls: 'type sponsor' },
    next: { label: 'Next action due', cls: 'type next' }
};
export default class EmUpcomingMilestones extends LightningElement {
    @api title = 'Upcoming milestones';
    @api horizonDays = 60;
    variables = { first: 100 };
    studies = []; loaded = false; gqlErrors;
    queryDoc = gql`
        query ms($first: Int) { uiapi { query { CareProgram(first: $first) { edges { node {
            Id Name { value } Onboarding_Status__c { value }
            Target_Activation_Date__c { value displayValue } SIV_Scheduled_Date__c { value displayValue } SIV_Status__c { value } SIV_Completed__c { value }
            Sponsor_Activation_Date__c { value displayValue } Next_Action__c { value } Next_Action_Due__c { value displayValue }
            Study_Awarded_Date__c { value displayValue } Activation_Date__c { value } At_Risk__c { value }
        } } } } } }`;
    @wire(graphql, { query: '$queryDoc', variables: '$variables' })
    wired({ data, errors }) {
        this.gqlErrors = errors;
        if (data) { this.studies = (data.uiapi.query.CareProgram.edges || []).map(e => e.node); this.loaded = true; }
    }
    get todayIso() { return new Date().toISOString().slice(0, 10); }
    get horizonIso() { const d = new Date(); d.setDate(d.getDate() + Number(this.horizonDays || 60)); return d.toISOString().slice(0, 10); }
    daysFrom(iso) { return Math.round((new Date(iso + 'T00:00:00') - new Date(this.todayIso + 'T00:00:00')) / 86400000); }
    get items() {
        const out = [];
        this.studies.forEach(s => {
            const v = f => s[f] && s[f].value; const dv = f => s[f] && (s[f].displayValue || s[f].value);
            const activated = v('Onboarding_Status__c') === 'Site Activated' || !!v('Activation_Date__c');
            if (activated) return;
            const push = (type, f, extra) => {
                const iso = v(f); if (!iso || iso > this.horizonIso) return;
                const days = this.daysFrom(iso);
                out.push({ key: `${s.Id}-${type}`, type, ...TYPES[type], study: s.Name.value, url: studyUrl(s.Id),
                    iso, date: dv(f), days, when: days < 0 ? `${-days} d overdue` : days === 0 ? 'today' : `in ${days} d`,
                    whenClass: 'when' + (days < 0 ? ' overdue' : days <= 7 ? ' soon' : ''), extra: extra || '', atRisk: v('At_Risk__c') === true });
            };
            push('target', 'Target_Activation_Date__c', v('Onboarding_Status__c') || 'Not Started');
            if (v('SIV_Completed__c') !== true) push('siv', 'SIV_Scheduled_Date__c');
            push('sponsor', 'Sponsor_Activation_Date__c');
            push('next', 'Next_Action_Due__c', v('Next_Action__c'));
        });
        return out.sort((a, b) => a.iso.localeCompare(b.iso));
    }
    get hasItems() { return this.items.length > 0; }
    get count() { return `${this.items.length} in ${this.horizonDays} days`; }
    get recentAwards() {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30); const c = cutoff.toISOString().slice(0, 10);
        return this.studies.filter(s => s.Study_Awarded_Date__c && s.Study_Awarded_Date__c.value >= c)
            .map(s => ({ id: s.Id, name: s.Name.value, url: studyUrl(s.Id), date: s.Study_Awarded_Date__c.displayValue || s.Study_Awarded_Date__c.value, status: (s.Onboarding_Status__c && s.Onboarding_Status__c.value) || 'Not Started' }))
            .sort((a, b) => b.date.localeCompare(a.date));
    }
    get hasRecent() { return this.recentAwards.length > 0; }
    get showEmpty() { return this.loaded && !this.hasItems && !this.gqlErrors; }
    get errorText() { return this.gqlErrors ? this.gqlErrors.map(e => e.message).join('; ') : ''; }
}