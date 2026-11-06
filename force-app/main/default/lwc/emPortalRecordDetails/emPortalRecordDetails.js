import { LightningElement, api, wire } from 'lwc';
import { getLayout } from 'lightning/uiLayoutApi';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

/**
 * EM Portal Record Details - the record's fields laid out exactly like its Salesforce page layout (Full, view):
 * same sections, headings, column order and collapsible sections, read live from the UI API so layout edits
 * show up without a deploy. Inline edit as in Lightning: a pencil on every field the user may update (FLS +
 * layout), which switches the form to edit mode with Save / Cancel. Fields the user cannot read are left out;
 * sections left with nothing readable are hidden, and so are fields named in hiddenFields. Built for the Onboarding Hub study page (Study Details tab).
 * Session 85, 2026-10-01.
 */
const SKIP_FIELDS = new Set(['Id']);

export default class EmPortalRecordDetails extends LightningElement {
    @api recordId;
    @api objectApiName;
    /** Comma-separated field API names to leave out (e.g. finance amounts for non-finance users). */
    @api hiddenFields = '';
    /** Abbey's ask (2026-11-03): when set, shows ONLY these comma-separated field API names (in this order,
     * one per row) instead of mirroring the full page layout - the layout has far more fields than a portal
     * viewer needs. Takes over from the layout-sections rendering entirely when non-empty. Named "exclusive"
     * not "only" - LWC reserves @api names starting with "on" for event handlers. */
    @api exclusiveFields = '';

    layout;
    objectInfo;
    loadError;
    editing = false;
    saving = false;
    savedMessage;
    collapsed = new Set();
    focusField;

    @wire(getObjectInfo, { objectApiName: '$objectApiName' })
    wiredInfo({ data, error }) {
        if (data) this.objectInfo = data;
        else if (error) this.loadError = this.message(error);
    }

    @wire(getLayout, { objectApiName: '$objectApiName', layoutType: 'Full', mode: 'View' })
    wiredLayout({ data, error }) {
        if (data) this.layout = data;
        else if (error) this.loadError = this.message(error);
    }

    get exclusiveFieldList() { return (this.exclusiveFields || '').split(',').map(f => f.trim()).filter(Boolean); }

    get sections() {
        if (!this.objectInfo) return [];
        const fields = this.objectInfo.fields || {};
        if (this.exclusiveFieldList.length) {
            const rows = this.exclusiveFieldList.map((apiName, ri) => {
                const info = fields[apiName];
                if (!info) return { key: `only-${ri}`, items: [{ key: `only-${ri}-0`, cls: 'em-prd-cell em-prd-cell_full', blank: true }] };
                const editable = !!(info.updateable && !info.calculated);
                const item = {
                    key: `only-${ri}-0`, cls: 'em-prd-cell em-prd-cell_full', blank: false, apiName, editable,
                    required: false, editTitle: `Edit ${info.label}`
                };
                return { key: `only-${ri}`, items: [item] };
            }).filter(r => r.items.some(i => !i.blank));
            if (!rows.length) return [];
            return [{ key: 'only', rows, open: true, useHeading: false, heading: '', chevron: 'utility:chevrondown', ariaExpanded: 'true' }];
        }
        if (!this.layout) return [];
        const hidden = new Set((this.hiddenFields || '').split(',').map(f => f.trim()).filter(Boolean));
        const out = [];
        (this.layout.sections || []).forEach((sec, si) => {
            const key = sec.id || `s${si}`;
            const cols = Number(sec.columns) || 2;
            let readable = 0;
            const rows = (sec.layoutRows || []).map((row, ri) => {
                const items = (row.layoutItems || []).map((item, ii) => {
                    const comp = (item.layoutComponents || []).find(c => c.componentType === 'Field' && c.apiName);
                    const apiName = comp && comp.apiName;
                    const info = apiName && fields[apiName];
                    const base = { key: `${key}-${ri}-${ii}`, cls: cols === 1 ? 'em-prd-cell em-prd-cell_full' : 'em-prd-cell' };
                    if (!info || SKIP_FIELDS.has(apiName) || hidden.has(apiName)) return { ...base, blank: true };
                    readable++;
                    const editable = !!(info.updateable && item.editableForUpdate !== false && !info.calculated);
                    return {
                        ...base, blank: false, apiName, editable, required: !!(item.required && editable),
                        editTitle: `Edit ${item.label || info.label}`
                    };
                });
                return { key: `${key}-${ri}`, items };
            }).filter(r => r.items.some(i => !i.blank));
            if (!readable) return;
            const open = !this.collapsed.has(key);
            out.push({
                key, rows, open, useHeading: sec.useHeading !== false && !!sec.heading, heading: sec.heading,
                chevron: open ? 'utility:chevrondown' : 'utility:chevronright', ariaExpanded: String(open)
            });
        });
        return out;
    }

    toggleSection(event) {
        const key = event.currentTarget.dataset.key;
        const next = new Set(this.collapsed);
        if (next.has(key)) next.delete(key); else next.add(key);
        this.collapsed = next;
    }

    startEdit(event) {
        this.focusField = event.currentTarget.dataset.field;
        this.savedMessage = undefined;
        this.editing = true;
    }

    renderedCallback() {
        if (!this.editing || !this.focusField) return;
        const el = this.template.querySelector(`lightning-input-field[data-focus="${this.focusField}"]`)
            || [...this.template.querySelectorAll('lightning-input-field')].find(f => f.fieldName === this.focusField);
        this.focusField = undefined;
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    }

    cancelEdit() {
        this.template.querySelectorAll('lightning-input-field').forEach(f => f.reset());
        this.editing = false;
    }

    handleSubmit() { this.saving = true; }

    handleSuccess() {
        this.saving = false;
        this.editing = false;
        this.savedMessage = 'Saved.';
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => { this.savedMessage = undefined; }, 3000);
    }

    handleError() { this.saving = false; }

    message(e) {
        return (e && e.body && (e.body.message || (Array.isArray(e.body) && e.body[0] && e.body[0].message)))
            || 'The details could not be loaded.';
    }
}