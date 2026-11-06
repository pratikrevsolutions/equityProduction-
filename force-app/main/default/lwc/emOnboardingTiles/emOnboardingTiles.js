import { LightningElement, api, wire } from 'lwc';
import { gql, graphql } from 'lightning/uiGraphQLApi';

/**
 * Per-workstream onboarding tiles (done/total, overdue, complete) for the Study (CareProgram) header.
 * Moved out of emOnboardingItems into the study card on 2026-09-22 (WU10-20 S4, Show & Tell 16-Sep:
 * Abbey wants the 7 workstream cards in the page header and the 9-step ladder gone from the card).
 * Same data as the items panel: template Tasks on the study AND its Care Program Sites through GraphQL
 * in user context (FLS applies). Read-only; LDS keeps the wire current when a Task is completed from
 * emOnboardingItems (updateRecord re-emits GraphQL results that contain the record). No Apex.
 */
const WORKSTREAMS = ['Contract & Budget', 'Regulatory & IRB', 'SSU', 'Site Readiness',
    'CRIO & eSource', 'Recruitment Readiness', 'Greenlight & Activation'];
const SHORT = { 'Contract & Budget': 'Contract & Budget', 'Regulatory & IRB': 'Regulatory & IRB', 'SSU': 'SSU',
    'Site Readiness': 'Site Readiness', 'CRIO & eSource': 'CRIO & eSource', 'Recruitment Readiness': 'Recruitment',
    'Greenlight & Activation': 'Greenlight' };

export default class EmOnboardingTiles extends LightningElement {
    @api recordId;

    siteVars;
    taskVars;                       // FIELD (wire reactivity tracks fields, never getters)
    rawTasks = [];
    tasksLoaded = false;
    gqlErrors;
    todayIso = new Date().toISOString().slice(0, 10);

    connectedCallback() {
        this.siteVars = { cpId: this.recordId };
        this.taskVars = { ids: [this.recordId], first: 200 };
    }

    siteQuery = gql`
        query sites($cpId: ID) {
            uiapi { query { CareProgramSite(where: { CareProgramId: { eq: $cpId } }, first: 50) {
                edges { node { Id } } } } }
        }`;

    @wire(graphql, { query: '$siteQuery', variables: '$siteVars' })
    wiredSites({ data, errors }) {
        if (errors) { this.gqlErrors = errors; return; }
        if (data) {
            const ids = [this.recordId, ...(data.uiapi.query.CareProgramSite.edges || []).map(({ node }) => node.Id)];
            if (ids.length !== this.taskVars.ids.length) this.taskVars = { ids, first: this.taskVars.first };
        }
    }

    taskQuery = gql`
        query tiles($ids: [ID], $first: Int) {
            uiapi { query { Task(where: { WhatId: { in: $ids } }, first: $first) {
                edges { node {
                    Id Status { value } ActivityDate { value } EM_Workstream__c { value } EM_Item_Key__c { value }
                } } } } }
        }`;

    @wire(graphql, { query: '$taskQuery', variables: '$taskVars' })
    wiredTasks({ data, errors }) {
        this.gqlErrors = errors;
        if (data) {
            this.rawTasks = (data.uiapi.query.Task.edges || []).map(({ node }) => node).filter(n => n.EM_Item_Key__c && n.EM_Item_Key__c.value);
            this.tasksLoaded = true;
        }
    }

    get tiles() {
        return WORKSTREAMS.map(ws => {
            const its = this.rawTasks.filter(n => (n.EM_Workstream__c.value || 'Other') === ws);
            const done = its.filter(n => n.Status.value === 'Completed').length;
            const overdue = its.filter(n => n.Status.value !== 'Completed' && !!n.ActivityDate.value && n.ActivityDate.value < this.todayIso).length;
            const pct = its.length ? Math.round(done * 100 / its.length) : 0;
            const state = !its.length ? 'none' : done === its.length ? 'complete' : overdue ? 'overdue' : done ? 'active' : 'pending';
            return { name: ws, short: SHORT[ws], count: `${done}/${its.length}`, style: `width:${pct}%`,
                tileClass: `tile state-${state}`, hasOverdue: overdue > 0, overdueLabel: `${overdue} overdue`,
                isComplete: state === 'complete', title: `${ws}: ${done} of ${its.length} done${overdue ? `, ${overdue} overdue` : ''}` };
        });
    }

    get hasItems() { return this.rawTasks.length > 0; }
    get showEmpty() { return this.tasksLoaded && !this.hasItems && !this.gqlErrors; }
    get errorText() { return this.gqlErrors ? this.gqlErrors.map(e => e.message).join('; ') : ''; }
}