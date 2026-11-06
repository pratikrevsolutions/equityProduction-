import { LightningElement, api, wire } from 'lwc';
import { gql, graphql } from 'lightning/uiGraphQLApi';
import { recordUrl, studyUrl } from 'c/emSiteUrls';
import { updateRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import USER_ID from '@salesforce/user/Id';

/**
 * "My onboarding work" — the viewer's open onboarding items across every study, bucketed Overdue / This week /
 * Later, with the study (or site → study) each belongs to and one-click Complete (LDS → F-08 recalc).
 * Gated items (EM_Blocked_By__c) show a lock instead. GraphQL in user context, no Apex. Phase 4 WU6.
 */
export default class EmMyOnboardingWork extends LightningElement {
    @api title = 'My onboarding work';
    variables = { me: USER_ID, first: 100 };
    rows = []; loaded = false; gqlErrors; localDone = []; busyId = null; showLater = false;
    todayIso = new Date().toISOString().slice(0, 10);

    queryDoc = gql`
        query mine($me: ID, $first: Int) { uiapi { query {
            Task(where: { and: [ { OwnerId: { eq: $me } }, { Status: { ne: "Completed" } } ] },
                 first: $first, orderBy: { ActivityDate: { order: ASC, nulls: LAST } }) {
                edges { node {
                    Id Subject { value } Status { value } ActivityDate { value displayValue }
                    EM_Workstream__c { value } EM_Is_Required__c { value } EM_Item_Key__c { value } EM_Blocked_By__c { value } WhatId { value }
                } }
                totalCount
            } } } }`;

    nameVars = { first: 200 };
    namesDoc = gql`
        query names($first: Int) { uiapi { query {
            CareProgram(first: $first) { edges { node { Id Name { value } } } }
            CareProgramSite(first: $first) { edges { node { Id Name { value } CareProgramId { value } } } }
        } } }`;
    studyNames = {}; siteInfo = {};
    @wire(graphql, { query: '$namesDoc', variables: '$nameVars' })
    wiredNames({ data }) {
        if (data) {
            const s = {}; const si = {};
            (data.uiapi.query.CareProgram.edges || []).forEach(({ node }) => { s[node.Id] = node.Name.value; });
            (data.uiapi.query.CareProgramSite.edges || []).forEach(({ node }) => { si[node.Id] = { name: node.Name.value, cp: node.CareProgramId.value }; });
            this.studyNames = s; this.siteInfo = si;
        }
    }
    get version() { return 'v3'; }

    @wire(graphql, { query: '$queryDoc', variables: '$variables' })
    wired({ data, errors }) {
        this.gqlErrors = errors;
        if (data) {
            const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
            const weekIso = weekEnd.toISOString().slice(0, 10);
            this.rows = (data.uiapi.query.Task.edges || []).filter(({ node }) => node.EM_Item_Key__c && node.EM_Item_Key__c.value).map(({ node }) => {
                const due = node.ActivityDate.value;
                const whatId = node.WhatId.value;
                const site = this.siteInfo[whatId];
                const studyId = site ? site.cp : whatId;
                const bucket = !due ? 'later' : due < this.todayIso ? 'overdue' : due <= weekIso ? 'week' : 'later';
                const blocked = !!(node.EM_Blocked_By__c && node.EM_Blocked_By__c.value);
                return {
                    id: node.Id, subject: node.Subject.value, url: recordUrl('Task', node.Id),
                    due, dueLabel: due ? (node.ActivityDate.displayValue || due) : 'No date',
                    dueClass: 'due' + (bucket === 'overdue' ? ' overdue' : ''),
                    workstream: node.EM_Workstream__c.value || '', required: node.EM_Is_Required__c.value === true,
                    studyId, site: site ? site.name : '', bucket, blocked
                };
            });
            this.loaded = true;
        }
    }
    get live() { return this.rows.filter(r => !this.localDone.includes(r.id)); }
    bucket(name) { return this.live.filter(r => r.bucket === name).map(r => ({ ...r, isBusy: r.id === this.busyId, studyName: this.studyNames[r.studyId] || 'Study', studyUrl: studyUrl(r.studyId) })); }
    @api maxRows = 8;               // per bucket; 'Show all' expands
    expandedBuckets = {};
    capped(name) { const all = this.bucket(name); const cap = Number(this.maxRows || 8); return this.expandedBuckets[name] || all.length <= cap ? all : all.slice(0, cap); }
    get overdue() { return this.capped('overdue'); }
    get thisWeek() { return this.capped('week'); }
    get overdueMore() { const n = this.bucket('overdue').length - this.overdue.length; return n > 0 ? `Show all ${this.bucket('overdue').length} overdue` : ''; }
    get weekMore() { const n = this.bucket('week').length - this.thisWeek.length; return n > 0 ? `Show all ${this.bucket('week').length} due this week` : ''; }
    handleExpand(evt) { const b = evt.currentTarget.dataset.bucket; this.expandedBuckets = { ...this.expandedBuckets, [b]: true }; }
    get later() { return this.bucket('later'); }
    get overdueCount() { return this.bucket('overdue').length; }
    get weekCount() { return this.bucket('week').length; }
    get laterCount() { return this.later.length; }
    get total() { return this.live.length; }
    get badge() { return `${this.total} open`; }
    get hasOverdue() { return this.overdueCount > 0; }
    get hasWeek() { return this.weekCount > 0; }
    get hasLater() { return this.laterCount > 0; }
    get laterVisible() { return this.showLater && this.hasLater; }
    get laterToggle() { return this.showLater ? 'Hide later items' : `Show ${this.laterCount} later items`; }
    get showEmpty() { return this.loaded && this.total === 0 && !this.gqlErrors; }
    get errorText() { return this.gqlErrors ? this.gqlErrors.map(e => e.message).join('; ') : ''; }
    handleToggleLater() { this.showLater = !this.showLater; }
    async handleComplete(evt) {
        const id = evt.currentTarget.dataset.id; const row = this.rows.find(r => r.id === id);
        this.busyId = id;
        try {
            await updateRecord({ fields: { Id: id, Status: 'Completed' } });
            this.localDone = [...this.localDone, id];
            this.dispatchEvent(new ShowToastEvent({ title: 'Item completed', message: row ? row.subject : '', variant: 'success' }));
            this.variables = { me: USER_ID, first: this.variables.first === 100 ? 101 : 100 };
        } catch (e) {
            const body = e && e.body; const msg = body && (body.message || (body.output && body.output.errors && body.output.errors.map(x => x.message).join('; '))) || (e && e.message) || 'Unknown error';
            this.dispatchEvent(new ShowToastEvent({ title: 'Could not complete', message: msg, variant: 'error', mode: 'sticky' }));
        } finally { this.busyId = null; }
    }
}