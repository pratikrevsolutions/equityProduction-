import { LightningElement, api, wire } from 'lwc';
import { gql, graphql } from 'lightning/uiGraphQLApi';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { NavigationMixin } from 'lightning/navigation';
import { encodeDefaultFieldValues } from 'lightning/pageReferenceUtils';

/**
 * Layout-independent related list for the Patient 360 and the recruitment-journey page.
 * Grace's classic Account layouts cannot hold the LSC/FSL child related lists
 * (HealthCondition, CareProgramEnrollee, Assessment, ServiceAppointment), so
 * force:relatedListSingleContainer renders nothing for them. This component
 * queries the child object directly through the GraphQL wire adapter (same
 * approach as emPatientSnapshot) and renders a lightning-datatable. No Apex.
 *
 * Configured entirely from the FlexiPage (design attributes): child object,
 * the lookup field on the child that points at the patient, the columns, sort.
 */
export default class EmRelatedRecords extends NavigationMixin(LightningElement) {
    @api recordId;
    @api childObject;                 // e.g. HealthCondition
    @api parentField;                 // lookup on the child, e.g. PatientId
    @api parentIdSource = 'Account Id'; // 'Account Id' | 'Person Contact Id'
    @api fields;                      // comma list; first is the link column. Supports Rel.Field (one level)
    @api title = 'Related Records';
    @api iconName = 'standard:record';
    @api maxRows = 10;
    @api sortField = 'CreatedDate';
    @api sortDescending = false;
    @api showNew = false;
    @api emptyMessage = 'No records yet.';

    queryDoc;
    personContactId;
    objectInfo;
    rows = [];
    totalCount = 0;
    error;
    loaded = false;

    connectedCallback() {
        this.queryDoc = this.buildQuery();
    }

    // ---------- config parsing ----------
    get fieldSpecs() {
        return (this.fields || '')
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean)
            .map((path) => {
                const [rel, fld] = path.includes('.') ? path.split('.') : [null, path];
                return { path, rel, fld, key: path.replace('.', '_') };
            });
    }

    get parentId() {
        return this.parentIdSource === 'Person Contact Id'
            ? this.personContactId
            : this.recordId;
    }

    // ---------- wires ----------
    // Only resolve PersonContactId when a tab asks for it — on non-Account pages
    // (Opportunity, Lead) the parent is simply the record itself.
    get contactLookupFields() {
        return this.parentIdSource === 'Person Contact Id' ? ['Account.PersonContactId'] : undefined;
    }

    @wire(getRecord, { recordId: '$recordId', fields: '$contactLookupFields' })
    wiredAccount({ data }) {
        if (data) this.personContactId = getFieldValue(data, 'Account.PersonContactId');
    }

    @wire(getObjectInfo, { objectApiName: '$childObject' })
    wiredInfo({ data }) {
        if (data) this.objectInfo = data;
    }

    get variables() {
        return { pid: this.parentId || '000000000000000AAA' };
    }

    @wire(graphql, { query: '$queryDoc', variables: '$variables' })
    wiredRecords({ data, errors }) {
        this.loaded = true;
        if (errors) {
            this.error = errors.map((e) => e.message).join('; ');
            this.rows = [];
            return;
        }
        this.error = undefined;
        const result = data?.uiapi?.query?.[this.childObject];
        if (!result) return;
        this.totalCount = result.totalCount ?? 0;
        this.rows = (result.edges || []).map(({ node }) => {
            const row = { Id: node.Id, recordUrl: '/' + node.Id };
            this.fieldSpecs.forEach((s) => {
                const cell = s.rel ? node[s.rel]?.[s.fld] : node[s.fld];
                row[s.key] = this.cellValue(cell);
            });
            return row;
        });
    }

    cellValue(cell) {
        if (cell === null || cell === undefined) return '';
        if (typeof cell !== 'object') return cell;
        if (cell.displayValue !== null && cell.displayValue !== undefined) return cell.displayValue;
        return cell.value ?? '';
    }

    buildQuery() {
        const specs = this.fieldSpecs;
        if (!this.childObject || !this.parentField || !specs.length) return undefined;
        const selections = specs
            .map((s) => (s.rel ? `${s.rel} { ${s.fld} { value displayValue } }` : `${s.fld} { value displayValue }`))
            .join(' ');
        const order = this.sortDescending ? 'DESC' : 'ASC';
        const first = Number(this.maxRows) > 0 ? Number(this.maxRows) : 10;
        const q = `query relatedRecords($pid: ID) {
            uiapi {
                query {
                    ${this.childObject}(
                        where: { ${this.parentField}: { eq: $pid } },
                        first: ${first},
                        orderBy: { ${this.sortField || 'CreatedDate'}: { order: ${order} } }
                    ) { totalCount edges { node { Id ${selections} } } }
                }
            }
        }`;
        return gql`${q}`;
    }

    // ---------- presentation ----------
    get columns() {
        const info = this.objectInfo;
        return this.fieldSpecs.map((s, i) => {
            const label = this.labelFor(s, info);
            if (i === 0) {
                return {
                    label,
                    fieldName: 'recordUrl',
                    type: 'url',
                    typeAttributes: { label: { fieldName: s.key }, target: '_self' }
                };
            }
            const dataType = !s.rel && info?.fields?.[s.fld]?.dataType;
            if (dataType === 'Boolean') {
                return { label, fieldName: s.key, type: 'boolean', initialWidth: 110 };
            }
            return { label, fieldName: s.key, type: 'text' };
        });
    }

    labelFor(spec, info) {
        if (!info) return spec.fld;
        if (spec.rel) {
            const lookup = Object.values(info.fields).find((f) => f.relationshipName === spec.rel);
            const base = lookup ? lookup.label : spec.rel;
            return spec.fld === 'Name' ? base : `${base} ${spec.fld}`;
        }
        return info.fields[spec.fld]?.label || spec.fld;
    }

    get heading() {
        return `${this.title} (${this.totalCount})`;
    }

    get hasRows() {
        return this.rows.length > 0;
    }

    get showEmpty() {
        return this.loaded && !this.error && !this.hasRows;
    }

    get hasMore() {
        return this.totalCount > this.rows.length;
    }

    get moreLabel() {
        return `Showing ${this.rows.length} of ${this.totalCount}`;
    }

    handleNew() {
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: { objectApiName: this.childObject, actionName: 'new' },
            state: {
                defaultFieldValues: encodeDefaultFieldValues({ [this.parentField]: this.parentId }),
                nooverride: '1'
            }
        });
    }
}