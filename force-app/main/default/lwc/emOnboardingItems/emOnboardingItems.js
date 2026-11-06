import { LightningElement, api, wire } from 'lwc';
import { gql, graphql } from 'lightning/uiGraphQLApi';
import { recordUrl } from 'c/emSiteUrls';
import { updateRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import USER_ID from '@salesforce/user/Id';

/**
 * Onboarding items panel for the Study (CareProgram) record page — Show & Tell #3 (2026-09-03):
 * Abbey: onboarding is NOT sequential, show what is done per workstream; Nicholas: next task on top,
 * top-to-bottom, completed items collapsed, no repeated "View More". Reads the template Tasks on the
 * study AND its Care Program Sites through GraphQL in user context (FLS applies), groups them by
 * workstream, and offers one-click Complete (LDS updateRecord → F-08 EM_Onboarding_Task_Sync
 * recalculates progress / status / next action). No Apex.
 * The per-workstream tiles moved to the page header (emStudyCard → c-em-onboarding-tiles) on 2026-09-22
 * (WU10-20 S4); this panel no longer draws them.
 * Wire-cache guard: a completed row is tracked locally (localDone) so a cached re-emission cannot
 * resurrect it (same finding as emRandomizationQueue, 2026-09-03).
 */
const WORKSTREAMS = ['Contract & Budget', 'Regulatory & IRB', 'SSU', 'Site Readiness',
    'CRIO & eSource', 'Recruitment Readiness', 'Greenlight & Activation'];

export default class EmOnboardingItems extends LightningElement {
    @api recordId;
    @api title = 'Onboarding Items';

    siteVars;
    taskVars;                       // FIELD (wire reactivity tracks fields, never getters)
    siteNames = {};
    rawTasks = [];
    tasksLoaded = false;
    gqlErrors;
    localDone = [];                 // ids completed from this panel
    filter = 'open';                // open | overdue | mine | all
    expanded = {};                  // workstream -> boolean (user overrides)
    showDone = {};                  // workstream -> boolean
    busyId = null;
    todayIso = new Date().toISOString().slice(0, 10);

    connectedCallback() {
        this.siteVars = { cpId: this.recordId };
        this.taskVars = { ids: [this.recordId], first: 200 };
    }

    siteQuery = gql`
        query sites($cpId: ID) {
            uiapi { query { CareProgramSite(where: { CareProgramId: { eq: $cpId } }, first: 50) {
                edges { node { Id Name { value } } } } } }
        }`;

    @wire(graphql, { query: '$siteQuery', variables: '$siteVars' })
    wiredSites({ data, errors }) {
        if (errors) { this.gqlErrors = errors; return; }
        if (data) {
            const names = {};
            const ids = [this.recordId];
            (data.uiapi.query.CareProgramSite.edges || []).forEach(({ node }) => {
                names[node.Id] = node.Name.value; ids.push(node.Id);
            });
            this.siteNames = names;
            if (ids.length !== this.taskVars.ids.length) this.taskVars = { ids, first: this.taskVars.first };
        }
    }

    taskQuery = gql`
        query items($ids: [ID], $first: Int) {
            uiapi { query { Task(where: { WhatId: { in: $ids } }, first: $first, orderBy: { ActivityDate: { order: ASC, nulls: LAST } }) {
                edges { node {
                    Id Subject { value } Status { value } ActivityDate { value displayValue }
                    EM_Workstream__c { value } EM_Is_Required__c { value } EM_Path_Step__c { value }
                    EM_Item_Key__c { value } EM_Source__c { value } EM_Auto_Completed__c { value } EM_Blocked_By__c { value }
                    WhatId { value } OwnerId { value } Owner { ... on User { Name { value } } } Description { value }
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

    // ---------------------------------------------------------------- derived model
    get items() {
        const subjectByKey = {};
        this.rawTasks.forEach(n => { if (n.EM_Item_Key__c && n.EM_Item_Key__c.value && !(n.EM_Item_Key__c.value in subjectByKey)) subjectByKey[n.EM_Item_Key__c.value] = n.Subject.value; });
        return this.rawTasks.map(n => {
            const status = this.localDone.includes(n.Id) ? 'Completed' : (n.Status.value || 'Not Started');
            const done = status === 'Completed';
            const due = n.ActivityDate.value;
            const overdue = !done && !!due && due < this.todayIso;
            const site = n.WhatId.value !== this.recordId ? (this.siteNames[n.WhatId.value] || 'Site') : null;
            const ws = n.EM_Workstream__c.value || 'Other';
            const blockedBy = !done && n.EM_Blocked_By__c ? n.EM_Blocked_By__c.value : null;
            return {
                blocked: !!blockedBy, blockedLabel: blockedBy ? `Waiting for: ${subjectByKey[blockedBy] || blockedBy}` : '',
                id: n.Id, key: n.EM_Item_Key__c.value, subject: n.Subject.value, status, done, due,
                dueLabel: due ? (n.ActivityDate.displayValue || due) : 'No date', overdue, site,
                required: n.EM_Is_Required__c.value === true, step: n.EM_Path_Step__c.value,
                source: n.EM_Source__c.value, auto: n.EM_Auto_Completed__c.value === true,
                owner: n.Owner && n.Owner.Name ? n.Owner.Name.value : '', mine: n.OwnerId.value === USER_ID,
                hint: n.Description ? n.Description.value : '', workstream: ws,
                url: recordUrl('Task', n.Id)
            };
        });
    }

    passesFilter(it) {
        if (this.filter === 'all') return true;
        if (this.filter === 'overdue') return it.overdue;
        if (this.filter === 'mine') return it.mine && !it.done;
        return !it.done;                                   // open
    }

    decorate(it, idx) {
        return { ...it, rowClass: 'item' + (it.done ? ' is-done' : '') + (it.overdue ? ' is-overdue' : '') + (it.blocked ? ' is-blocked' : ''),
            isBusy: it.id === this.busyId, index: idx + 1,
            dueClass: 'due' + (it.overdue ? ' overdue' : ''),
            sourceLabel: it.done ? (it.auto ? 'Auto-completed from evidence' : 'Completed by hand') : (it.source === 'Exception' ? 'Re-opened (exception)' : '') };
    }

    get upNext() {
        const open = this.items.filter(i => !i.done && !i.blocked);
        const req = open.filter(i => i.required);
        const pick = (req.length ? req : open).slice().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0];
        return pick ? this.decorate(pick, 0) : null;
    }

    get summary() {
        const all = this.items; const done = all.filter(i => i.done).length;
        const req = all.filter(i => i.required); const reqDone = req.filter(i => i.done).length;
        const overdue = all.filter(i => i.overdue).length;
        const pct = req.length ? Math.round(reqDone * 100 / req.length) : 0;
        return { total: all.length, done, open: all.length - done, req: req.length, reqDone, overdue, pct,
            pctLabel: `${pct}%`, pctStyle: `width:${pct}%` };
    }

    get groups() {
        const wsList = [...WORKSTREAMS, ...[...new Set(this.items.map(i => i.workstream))].filter(w => !WORKSTREAMS.includes(w))];
        return wsList.map(ws => {
            const its = this.items.filter(i => i.workstream === ws);
            if (!its.length) return null;
            const open = its.filter(i => !i.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
            const done = its.filter(i => i.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
            const visibleOpen = open.filter(i => this.passesFilter(i));
            const showDone = this.showDone[ws] === true || this.filter === 'all';
            const complete = open.length === 0;
            const expanded = ws in this.expanded ? this.expanded[ws] : !complete;
            if (this.filter !== 'all' && this.filter !== 'open' && visibleOpen.length === 0) return null;
            return { name: ws, expanded, complete, count: `${done.length}/${its.length}`,
                openCount: open.length, doneCount: done.length, hasDone: done.length > 0, showDone,
                doneToggleLabel: showDone ? `Hide ${done.length} completed` : `Show ${done.length} completed`,
                headerClass: 'group-head' + (complete ? ' is-complete' : ''),
                chevron: expanded ? 'utility:chevrondown' : 'utility:chevronright',
                openRows: visibleOpen.map((i, k) => this.decorate(i, k)),
                doneRows: showDone ? done.map((i, k) => this.decorate(i, k)) : [],
                emptyOpen: visibleOpen.length === 0 && !complete,
                statusLine: complete ? 'All items complete' : `${open.length} open · ${done.length} done`
            };
        }).filter(Boolean);
    }

    get hasItems() { return this.items.length > 0; }
    get showEmpty() { return this.tasksLoaded && !this.hasItems && !this.gqlErrors; }
    get errorText() { return this.gqlErrors ? this.gqlErrors.map(e => e.message).join('; ') : ''; }
    get filterOptions() {
        const s = this.summary;
        return [
            { value: 'open', label: `Open (${s.open})` }, { value: 'overdue', label: `Overdue (${s.overdue})` },
            { value: 'mine', label: 'Mine' }, { value: 'all', label: `All (${s.total})` }
        ].map(o => ({ ...o, variant: o.value === this.filter ? 'brand' : 'neutral' }));
    }

    // ---------------------------------------------------------------- handlers
    handleFilter(evt) { this.filter = evt.currentTarget.dataset.value; }
    handleToggleGroup(evt) {
        const ws = evt.currentTarget.dataset.ws;
        const g = this.groups.find(x => x.name === ws);
        this.expanded = { ...this.expanded, [ws]: !(g ? g.expanded : true) };
    }
    handleToggleDone(evt) {
        const ws = evt.currentTarget.dataset.ws;
        this.showDone = { ...this.showDone, [ws]: !this.showDone[ws] };
    }
    async handleComplete(evt) {
        const id = evt.currentTarget.dataset.id;
        const it = this.items.find(i => i.id === id);
        this.busyId = id;
        try {
            await updateRecord({ fields: { Id: id, Status: 'Completed' } });
            this.localDone = [...this.localDone, id];
            this.dispatchEvent(new ShowToastEvent({ title: 'Item completed', variant: 'success',
                message: `${it ? it.subject : 'Item'} marked complete — progress and the next action are recalculated.` }));
            this.taskVars = { ids: this.taskVars.ids, first: this.taskVars.first === 200 ? 201 : 200 };
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Could not complete the item', message: this.errorMessage(e), variant: 'error', mode: 'sticky' }));
        } finally { this.busyId = null; }
    }
    errorMessage(e) {
        const body = e && e.body;
        if (body) {
            if (Array.isArray(body)) return body.map(b => b.message).join('; ');
            if (body.output && body.output.errors && body.output.errors.length) return body.output.errors.map(x => x.message).join('; ');
            if (body.output && body.output.fieldErrors) { const m = []; Object.values(body.output.fieldErrors).forEach(a => a.forEach(x => m.push(x.message))); if (m.length) return m.join('; '); }
            if (body.message) return body.message;
        }
        return (e && e.message) || 'Unknown error';
    }
}