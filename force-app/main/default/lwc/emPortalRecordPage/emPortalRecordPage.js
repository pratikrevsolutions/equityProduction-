import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { getRecord } from 'lightning/uiRecordApi';
import { getRelatedListsInfo, getRelatedListInfoBatch, getRelatedListRecordsBatch } from 'lightning/uiRelatedListApi';
import { recordUrl, siteUrl, hasRecordPage } from 'c/emSiteUrls';

/**
 * EM Portal Record Page - generic Experience Cloud (LWR) object page body for the Onboarding Hub: title strip,
 * the record on its Full page layout (standard record form, inline edit per the user's FLS) and the object's
 * related lists (UI API, first rows each, links to the matching site page via c/emSiteUrls). Used for Task,
 * Study Site (CareProgramSite), Document Checklist Item and Research Study, and in lists-only mode under the
 * study card on the Care Program page. `relatedLists` (comma-separated relatedListIds) replaces the layout's
 * lists - needed because the UI API serves lists that are not on the layout (e.g. DocumentChecklistItemPR on
 * CareProgramSite) but not Task / activity lists (those are the Onboarding Items panel). WU11d, 2026-09-25.
 */
const SKIP_LISTS = new Set(['OpenActivities', 'ActivityHistories', 'CombinedAttachments', 'AttachedContentDocuments',
    'ProcessSteps', 'ProcessInstanceHistory', 'Histories', 'RecordActions', 'FeedSubscriptionsForEntity']);
const MAX_LISTS = 6;
const PAGE = 10;

export default class EmPortalRecordPage extends LightningElement {
    @api recordId;
    @api objectApiName;
    @api maxLists = MAX_LISTS;
    @api relatedLists = '';
    @api listsOnly = false;
    // Abbey's ask (2026-11-03): a "New" button on one chosen related list, e.g. relatedListId "CareProgramTeamMembers".
    // Opens an inline create form (not standard__objectPage navigation - LWR sites need a dedicated Object Page
    // registered per object for that to resolve, which none of these related objects have). newParentField is set
    // on the new record automatically (hidden field); newFields are the fields shown for the person to fill in.
    // Off by default so the other objects this component already serves (Task, CareProgramSite, ResearchStudy, etc.)
    // are unaffected.
    @api newEnabledList = '';
    @api newParentField = '';
    @api newFields = '';

    showNewModal = false;
    newModalObjectApiName;
    newModalLabel = '';

    objectInfo;
    nameField;
    record;
    listIds = [];
    listInfos = {};
    lists = [];
    loadError;

    @wire(getObjectInfo, { objectApiName: '$objectApiName' })
    wiredInfo({ data, error }) {
        if (data) {
            this.objectInfo = data;
            this.nameField = (data.nameFields && data.nameFields[0]) || 'Name';
        } else if (error) this.loadError = this.message(error);
    }

    get titleFields() {
        return this.nameField ? [`${this.objectApiName}.${this.nameField}`] : undefined;
    }

    @wire(getRecord, { recordId: '$recordId', optionalFields: '$titleFields' })
    wiredRecord({ data }) { if (data) this.record = data; }

    connectedCallback() {
        const fixed = (this.relatedLists || '').split(',').map(x => x.trim()).filter(Boolean);
        if (fixed.length) this.listIds = fixed;
    }

    get layoutListsObject() { return (this.relatedLists || '').trim() ? undefined : this.objectApiName; }

    @wire(getRelatedListsInfo, { parentObjectApiName: '$layoutListsObject' })
    wiredLists({ data }) {
        if (!data) return;
        this.listIds = (data.relatedLists || [])
            .map(l => l.relatedListId)
            .filter(id => id && !SKIP_LISTS.has(id))
            .slice(0, Number(this.maxLists) || MAX_LISTS);
    }

    @wire(getRelatedListInfoBatch, { parentObjectApiName: '$objectApiName', relatedListNames: '$listIdsOrUndef' })
    wiredListInfos({ data }) {
        if (!data) return;
        const infos = {};
        (data.results || []).forEach(r => {
            if (r.statusCode === 200 && r.result) infos[r.result.listReference.relatedListId] = r.result;
        });
        this.listInfos = infos;
    }

    get listIdsOrUndef() { return this.listIds.length ? this.listIds : undefined; }

    get recordParams() {
        const ids = Object.keys(this.listInfos);
        if (!ids.length || !this.recordId) return undefined;
        return ids.map(id => {
            const info = this.listInfos[id];
            const obj = info.listReference.objectApiName || info.objectApiNames?.[0];
            const fields = (info.displayColumns || []).map(c => `${obj}.${c.fieldApiName}`);
            return { relatedListId: id, optionalFields: fields, pageSize: PAGE };
        });
    }

    @wire(getRelatedListRecordsBatch, { parentRecordId: '$recordId', relatedListParameters: '$recordParams' })
    wiredRows({ data }) {
        if (!data) return;
        const out = [];
        (data.results || []).forEach(r => {
            if (r.statusCode !== 200 || !r.result) return;
            const id = r.result.listReference.relatedListId;
            const info = this.listInfos[id];
            if (!info) return;
            const cols = (info.displayColumns || []).slice(0, 5);
            const records = r.result.records || [];
            out.push({
                id, label: info.label, count: `${records.length}${r.result.nextPageToken ? '+' : ''}`, more: !!r.result.nextPageToken,
                canCreate: id === this.newEnabledList,
                columns: cols.map(c => ({ key: c.fieldApiName, label: c.label })),
                rows: records.map(rec => ({
                    id: rec.id,
                    url: hasRecordPage(rec.apiName) ? recordUrl(rec.apiName, rec.id) : null,
                    cells: cols.map((c, i) => ({ key: `${rec.id}-${c.fieldApiName}`, value: this.cell(rec, c.fieldApiName), link: i === 0 && hasRecordPage(rec.apiName) }))
                }))
            });
        });
        this.lists = out.sort((a, b) => this.listIds.indexOf(a.id) - this.listIds.indexOf(b.id));
    }

    cell(rec, path) {
        let node = rec;
        for (const part of path.split('.')) {
            const f = node && node.fields && node.fields[part];
            if (!f) return '';
            if (f.value && typeof f.value === 'object' && f.value.fields) { node = f.value; continue; }
            return f.displayValue ?? (f.value == null ? '' : String(f.value));
        }
        return '';
    }

    message(e) { return (e && e.body && (e.body.message || (Array.isArray(e.body) && e.body[0]?.message))) || 'This record could not be loaded.'; }

    get objectLabel() { return this.objectInfo ? this.objectInfo.label : ''; }
    get title() {
        const f = this.record && this.nameField && this.record.fields[this.nameField];
        return (f && (f.displayValue || f.value)) || this.objectLabel;
    }
    get iconUrl() { return this.objectInfo && this.objectInfo.themeInfo ? this.objectInfo.themeInfo.iconUrl : null; }
    get hasLists() { return this.lists.length > 0; }
    get recordMode() { return !(this.listsOnly === true || this.listsOnly === 'true'); }

    get newFieldList() { return (this.newFields || '').split(',').map(f => f.trim()).filter(Boolean); }

    handleNewClick(e) {
        const listId = e.currentTarget.dataset.listId;
        const info = this.listInfos[listId];
        const objectApiName = info && (info.listReference.objectApiName || info.objectApiNames?.[0]);
        if (!objectApiName) return;
        this.newModalObjectApiName = objectApiName;
        this.newModalLabel = info.label;
        this.showNewModal = true;
    }

    closeNewModal() { this.showNewModal = false; }

    handleCreateSuccess() {
        this.showNewModal = false;
        window.location.reload();
    }

    handleBack(e) {
        e.preventDefault();
        if (window.history.length > 1) window.history.back();
        else window.location.assign(siteUrl('/'));
    }
}