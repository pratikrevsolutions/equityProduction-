import { LightningElement, api, wire } from 'lwc';
import { gql, graphql, refreshGraphQL } from 'lightning/uiGraphQLApi';
import { updateRecord } from 'lightning/uiRecordApi';
import { studyUrl } from 'c/emSiteUrls';

/**
 * Study portfolio — Abbey's "at a glance" weekly view (Show & Tell #3, 2026-09-03: "I don't want to go into
 * every study individually"). Sits on the Study Onboarding home page (LEX) and in the portal (emPortalStudyPortfolio).
 * WU10-18 A2 (Abbey, Show & Tell 2026-09-15): location filter — a study belongs to every location it has a Care Program
 * Site row at (else its Site Location picklist); the choice is remembered per browser and narrows the tiles as well.
 * Abbey's Study Onboarding Dashboard Redesign v2 (mockup, 2026-10-23): one pipeline-stage row per study instead of the
 * workstream % bars.
 * Milestone fields redesign (JT, review call 2026-10-27): the 7 milestone columns below (SSU Packet, Finance, IRB,
 * eSource, SIV, Activation Letter, Greenlight Status) used to be derived from several real workstream fields each with
 * bespoke tier logic; the client removed the auto-generated onboarding Tasks that used to carry this status and asked
 * for direct fields instead (EM_Milestone_Status_Stamp stamps each field's paired *_Status_Date__c on change).
 * - Est. Internal Greenlight (Internal_Greenlight_Date__c) shows the target/actual date, a countdown once a patient
 *   hasn't been screened yet, and the two milestones Abbey back-dates off it: marketing kickoff (-30d) and the
 *   recruitment meeting (-7d). Internal Greenlight (Internal_Greenlight__c) is the actual sign-off, Site-Lead owned.
 *   The "Greenlight Status" workstream is the SAME field, not a separate one — JT's spreadsheet "Internal Greenlight"
 *   category turned out to be this already-existing milestone. Checking it does NOT re-stamp Internal_Greenlight_Date__c
 *   (unlike the other 6 workstreams) — that date is a deliberately-entered actual/target date reused by the Est.
 *   Internal Greenlight tile, not a "moment I clicked this" timestamp.
 * - Study Team grid: CareProgramTeamMember by Role (Principal Investigator / SSU Owner / Regulatory Lead /
 *   Contracts-Finance / CRIO-eSource / Primary CRC / Site Lead); "Not assigned" in red when a role has no member yet.
 *   Sub-Investigators and Unblinded Staff aren't CareProgramTeamMember rows — they're pre-existing free-text capacity
 *   fields directly on CareProgram (EM_Sub_I__c, EM_Unblinded_CRCs__c), so up to 2-3 names are typed into one field
 *   rather than one row per person. Unblinded Staff shows "N/A" instead of "Not assigned" when
 *   EM_Unblinded_Team_Required__c is false.
 * - Two tabs instead of the six stat tiles: Onboarding (not yet site-activated) / Enrolling (site activated). Sort by
 *   soonest est. internal greenlight by default (Abbey's ask: "who do I need to chase next").
 * Card redesign v2 (client reference, 2026-10-28, superseding the same-day "card-alt" stepper version): light card
 * with a colored left accent bar (green greenlit / red overdue / amber otherwise), identity + 2 combined header
 * stats (Internal Greenlight, with the est. date folded in underneath it; a compact Milestones list — recruitment
 * meeting / marketing live / first patient), then the 7 workstreams as side-by-side bordered boxes (not stacked
 * rows) — each with a header showing "current/total" (or the tier word for the 2-value fields, where a fraction
 * reads oddly), a tier-colored bar, and the checkbox list underneath (checkbox UI restored — the circle/stepper
 * look from the same-day v1 didn't survive client review). Only the current value is ever checked; earlier values
 * are shown muted/disabled, matching the pre-"card-alt" checklist exactly, just boxed per workstream.
 * GraphQL in user context, no Apex; writes go through lightning/uiRecordApi + refreshGraphQL.
 */
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtShort = (iso) => { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${MONTHS_SHORT[+m - 1]} ${+d}`; };
const fmtLong = (iso) => { if (!iso) return ''; const [y] = iso.split('-'); return `${fmtShort(iso)}, ${y}`; };
const fmtDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const h = d.getHours(); const h12 = h % 12 || 12; const ampm = h < 12 ? 'AM' : 'PM';
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${h12}:${mins} ${ampm}`;
};
const DAY_MS = 86400000;
const daysBetween = (fromIso, toIso) => Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / DAY_MS);
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ALL_LOCATIONS = '__all__';
const NO_SITE = '__none__';
const LOCATION_KEY = 'emStudyPortfolio.location';
// 'Manhattan (UWS)' and the study picklist's 'Manhattan' are the same place
const locationName = (name) => (name || '').replace(/^Equity Medical - /, '').replace(/\s*\(.*\)\s*$/, '').trim();
const STEPS = ['Study Awarded', 'Contract Executed', 'Regulatory Packet Received', 'Regulatory Packet Complete',
    'IRB Submitted', 'Budget Finalized', 'eSource Completed', 'Internal Greenlight', 'Site Activated'];
const phaseBadge = (v) => { if (!v) return null; const m = /\d+/.exec(v); return m ? `Ph${m[0]}` : v; };

// first name on the field (free-text, comma-separated for multi-person fields) → up to 2 initials for the avatar badge
const initials = (name) => {
    if (!name) return '';
    const first = name.split(',')[0].trim();
    const words = first.split(/\s+/).filter(w => w && w.replace(/\./g, '').toLowerCase() !== 'dr');
    return words.slice(0, 2).map(w => w[0].toUpperCase()).join('');
};

// Default status-pill wording per tier; a couple of fields use client-specific wording instead (Activation Letter's
// "Not Received", Greenlight Status's "Approved") — see tierLabels overrides below.
const TIER_LABELS = { done: 'Complete', active: 'In Progress', todo: 'Not Started' };

// The 7 onboarding workstream fields (JT's spreadsheet, 2026-10-27; picklist values updated 2026-10-28 per his
// "Tasks or Status (2)" sheet — Finance gained "CTA with EM", IRB gained "ICF with EM" / "ICF with Sponsor"). tier is
// positional: first value = todo, last value = done, anything in between = active. Drives both the step-tracker and
// the status pill.
const MILESTONE_FIELDS = [
    { key: 'ssu', label: 'SSU Packet', field: 'SSU_Packet_Milestone_Status__c', dateField: 'SSU_Packet_Milestone_Status_Date__c',
        values: ['Awaiting SSU Packet', 'SSU Packet in Queue', 'SSU Packet Submitted'] },
    { key: 'finance', label: 'Finance', field: 'Finance_Milestone_Status__c', dateField: 'Finance_Milestone_Status_Date__c',
        values: ['Awaiting CTA', 'CTA Review in Queue', 'CTA with EM', 'CTA with Sponsor', 'CTA Signed'] },
    { key: 'irb', label: 'IRB', field: 'IRB_Milestone_Status__c', dateField: 'IRB_Milestone_Status_Date__c',
        values: ['IRB - Awaiting ICF', 'IRB - ICF in Process', 'IRB - ICF with EM', 'IRB - ICF with Sponsor', 'IRB - Submitted', 'IRB - Approved'] },
    { key: 'esource', label: 'eSource', field: 'eSource_Milestone_Status__c', dateField: 'eSource_Milestone_Status_Date__c',
        values: ['eSource - Awaiting Docs', 'eSource - In Process', 'eSource - CRC Review', 'eSource - Budget Build', 'eSource - Greenlight'] },
    { key: 'siv', label: 'SIV', field: 'SIV_Milestone_Status__c', dateField: 'SIV_Milestone_Status_Date__c',
        values: ['Not Scheduled', 'Scheduling in Process', 'Scheduled', 'Occurred'] },
    { key: 'letter', label: 'Activation Letter', field: 'Activation_Letter_Milestone_Status__c', dateField: 'Activation_Letter_Milestone_Status_Date__c',
        values: ['No', 'Yes'], tierLabels: { todo: 'Not Received' } },
    // same field the Est. Internal Greenlight tile already uses — not a duplicate; see header comment
    { key: 'greenlightMilestone', label: 'Greenlight Status', field: 'Internal_Greenlight__c', dateField: 'Internal_Greenlight_Date__c',
        values: ['No', 'Yes'], boolean: true, noAutoStamp: true, tierLabels: { done: 'Approved' } }
];

// Study Team grid, row-major reading order to match the client's 3-column layout (card-alt reference).
// 'field' entries read straight off the CareProgram record instead of a CareProgramTeamMember role
// (Sub-Investigators and Unblinded Staff are free-text capacity fields already on CareProgram, not team-member rows).
const TEAM_ROLES = [
    { key: 'pi', label: 'Principal Investigator', role: 'Principal Investigator' },
    { key: 'site', label: 'Site Lead', role: 'Site Lead' },
    { key: 'crc', label: 'Lead CRC', role: 'Primary CRC' },
    { key: 'subi', label: 'Sub-Investigators', field: 'EM_Sub_I__c' },
    { key: 'ssu', label: 'SSU', role: 'SSU Owner' },
    { key: 'reg', label: 'Regulatory', role: 'Regulatory Lead' },
    { key: 'fin', label: 'Finance', role: 'Contracts / Finance' },
    { key: 'esrc', label: 'eSource', role: 'CRIO / eSource' },
    { key: 'unblinded', label: 'Unblinded Staff', field: 'EM_Unblinded_CRCs__c', naField: 'EM_Unblinded_Team_Required__c' }
];
const SORTS = [
    { value: 'greenlight', label: 'Est. internal greenlight (soonest)' },
    { value: 'risk', label: 'At risk first' },
    { value: 'sponsor', label: 'Sponsor (A–Z)' }
];
// Status Override values (prod adds On Track, 2026-10-08)
const OVERALL_CLASS = { 'On Track': 'ontrack', 'Pending External Party': 'pending', 'On Hold': 'hold', 'Withdrawn / Cancelled': 'gone' };

export default class EmStudyPortfolio extends LightningElement {
    @api title = 'Study Onboarding';
    @api subtitle = 'Where every study stands in each onboarding workstream.';
    variables = { first: 200 };
    rows = [];
    loaded = false;
    gqlErrors;
    tab = 'onboarding';
    sortBy = 'greenlight';
    search = '';
    location = ALL_LOCATIONS;
    siteLocations = {}; // CareProgramId -> Set of location names
    team = {}; // CareProgramId -> { role: name }
    saveError = '';
    todayIso = new Date().toISOString().slice(0, 10);
    wiredPortfolio; // full wired value, kept so a save can refreshGraphQL() this query

    queryDoc = gql`
        query portfolio($first: Int) {
            uiapi { query { CareProgram(first: $first, orderBy: { Name: { order: ASC } }) { edges { node {
                Id Name { value } Protocol_Number__c { value } Condition__c { value displayValue } Phase__c { value displayValue }
                Sponsor { Name { value } }
                Onboarding_Status__c { value } EM_Status_Override__c { value displayValue }
                EM_Site_Progress_Notes__c { value } EM_PI__c { value } EM_Site_Location__c { value }
                Next_Action_Due__c { value } At_Risk__c { value } Study_Awarded_Date__c { value }
                Internal_Greenlight__c { value } Internal_Greenlight_Date__c { value }
                EM_Sub_I__c { value } EM_Unblinded_CRCs__c { value } EM_Unblinded_Team_Required__c { value }
                First_Patient_Ready_Date__c { value } First_Patient_Screened_Date__c { value }
                SSU_Packet_Milestone_Status__c { value } SSU_Packet_Milestone_Status_Date__c { value }
                Finance_Milestone_Status__c { value } Finance_Milestone_Status_Date__c { value }
                IRB_Milestone_Status__c { value } IRB_Milestone_Status_Date__c { value }
                eSource_Milestone_Status__c { value } eSource_Milestone_Status_Date__c { value }
                SIV_Milestone_Status__c { value } SIV_Milestone_Status_Date__c { value }
                Activation_Letter_Milestone_Status__c { value } Activation_Letter_Milestone_Status_Date__c { value }
            } } } } }
        }`;

    siteQueryDoc = gql`
        query portfolioSites($first: Int) {
            uiapi { query { CareProgramSite(first: $first) { edges { node {
                Id CareProgramId { value } EM_Site__c { value }
            } } } } }
        }`;
    siteVariables = { first: 500 };

    teamQueryDoc = gql`
        query portfolioTeam($first: Int) {
            uiapi { query { CareProgramTeamMember(first: $first) { edges { node {
                CareProgramId { value } Role { value } Contact__r { Name { value } } User { Name { value } } Account { Name { value } }
            } } } } }
        }`;
    teamVariables = { first: 2000 };

    connectedCallback() {
        try { this.location = window.localStorage.getItem(LOCATION_KEY) || ALL_LOCATIONS; } catch (e) { this.location = ALL_LOCATIONS; }
    }

    @wire(graphql, { query: '$siteQueryDoc', variables: '$siteVariables' })
    wiredSites({ data }) {
        // no access to site rows = no location data; the board still works, filtering falls back to the study's Site Location
        if (data) {
            const map = {};
            (data.uiapi.query.CareProgramSite.edges || []).forEach(({ node }) => {
                const study = node.CareProgramId && node.CareProgramId.value;
                const loc = locationName(node.EM_Site__c && node.EM_Site__c.value);
                if (study && loc) (map[study] = map[study] || new Set()).add(loc);
            });
            this.siteLocations = map;
        }
    }

    @wire(graphql, { query: '$teamQueryDoc', variables: '$teamVariables' })
    wiredTeam({ data }) {
        // no access to team rows = Study Team grid shows "Not assigned" everywhere; the board still works
        if (data) {
            const map = {};
            (data.uiapi.query.CareProgramTeamMember.edges || []).forEach(({ node }) => {
                const study = node.CareProgramId && node.CareProgramId.value;
                const role = node.Role && node.Role.value;
                // Client request 2026-11-03: team members are identified by a Contact, not a User - Contact__r is now
                // authoritative; User/Account are legacy fallbacks for rows that still predate the Contact field.
                const name = (node.Contact__r && node.Contact__r.Name && node.Contact__r.Name.value)
                    || (node.User && node.User.Name && node.User.Name.value)
                    || (node.Account && node.Account.Name && node.Account.Name.value);
                if (study && role && name) (map[study] = map[study] || {})[role] = name;
            });
            this.team = map;
        }
    }

    @wire(graphql, { query: '$queryDoc', variables: '$variables' })
    wired(result) {
        this.wiredPortfolio = result;
        const { data, errors } = result;
        this.gqlErrors = errors;
        if (data) {
            // Client ask 2026-11-05: a withdrawn/cancelled study drops off this board entirely (not just a styled
            // pill) - Status Override is the single source of truth here since Onboarding Status (EM_Overall_Status__c)
            // is just a formula mirroring it.
            this.rows = (data.uiapi.query.CareProgram.edges || [])
                .map(({ node }) => this.toRow(node))
                .filter(r => r.values.EM_Status_Override__c !== 'Withdrawn / Cancelled');
            this.loaded = true;
        }
    }

    toRow(n) {
        const r = {}; const label = {};
        Object.keys(n).forEach(k => {
            const x = n[k];
            if (x && typeof x === 'object' && 'value' in x) { r[k] = x.value; label[k] = x.displayValue || x.value; } else r[k] = x;
        });
        const status = r.Onboarding_Status__c || 'Not Started';
        const activated = status === 'Site Activated';
        const started = STEPS.indexOf(status) >= 0;
        const override = r.EM_Status_Override__c;
        const notes = (r.EM_Site_Progress_Notes__c || '').trim();
        const due = r.Next_Action_Due__c;
        const sponsor = n.Sponsor && n.Sponsor.Name ? n.Sponsor.Name.value : null;
        const awarded = r.Study_Awarded_Date__c;
        return {
            id: n.Id, name: r.Name, url: studyUrl(n.Id), values: r, labels: label, activated,
            // no sponsor yet (test / early studies): the study name stands in so the card still says which study it is
            sponsor: sponsor || r.Name, protocol: r.Protocol_Number__c || 'No protocol',
            condition: label.Condition__c || 'Indication not set', phase: phaseBadge(r.Phase__c), phaseLabel: label.Phase__c || null,
            overall: override ? label.EM_Status_Override__c : 'Not Set',
            overallClass: 'emsp-overall emsp-' + (OVERALL_CLASS[override] || 'unset'),
            awardedDate: awarded, awardedLabel: awarded ? fmtLong(awarded) : null,
            awardedDaysAgo: awarded ? daysBetween(awarded, this.todayIso) : null,
            greenlit: r.Internal_Greenlight__c === true, greenlightDate: r.Internal_Greenlight_Date__c,
            screened: !!r.First_Patient_Screened_Date__c,
            atRisk: r.At_Risk__c === true,
            notes, hasNotes: !!notes,
            overdue: !!due && due < this.todayIso && !activated,
            bucket: activated ? 'activated' : started ? 'inflight' : 'notstarted',
            studyLocation: locationName(r.EM_Site_Location__c),
            haystack: `${r.Name} ${r.Protocol_Number__c} ${label.Condition__c} ${sponsor || ''} ${override} ${notes}`.toLowerCase()
        };
    }

    // One entry per workstream field: current position (currentIdx) drives both the step-tracker's circle
    // states/connector colors and the tier (todo/active/done) used for the status pill + ring/summary math.
    // -1 = nothing picked yet (true for every pre-existing CareProgram; Salesforce's picklist `default` never
    // backfills rows that already existed when the field was added).
    milestoneState(row) {
        const r = row.values;
        return MILESTONE_FIELDS.map(m => {
            const raw = r[m.field];
            const value = m.boolean ? (raw === true ? 'Yes' : raw === false ? 'No' : null) : raw;
            const currentIdx = value ? m.values.indexOf(value) : -1;
            const tier = currentIdx < 0 ? null : currentIdx === m.values.length - 1 ? 'done' : currentIdx === 0 ? 'todo' : 'active';
            return { m, currentIdx, length: m.values.length, tier, dateIso: r[m.dateField] };
        });
    }

    // One bordered box per workstream: a checkbox list (every value listed, only the current one checked and dated —
    // same semantics as the original pre-"card-alt" checklist) plus a header showing how far along it is. Fields
    // with more than 2 values show "current/total" (SSU 3/3, eSource 4/5, ...); the two binary fields (Activation
    // Letter, Greenlight Status) show the tier word instead, since "1/2" reads oddly for a yes/no field. Once a
    // value is set, earlier values are disabled — a workstream can move forward, never back to an earlier value.
    workstreamColumns(row) {
        return this.milestoneState(row).map(s => {
            const { m, currentIdx, length, tier, dateIso } = s;
            const labels = Object.assign({}, TIER_LABELS, m.tierLabels);
            const items = m.values.map((v, idx) => {
                const checked = idx === currentIdx;
                return {
                    key: v, value: v, checked,
                    disabled: currentIdx >= 0 && idx < currentIdx,
                    rowClass: 'emsp-ms-row' + (checked ? ` emsp-ms-${tier}` : ''),
                    dateLine: checked && dateIso ? (m.noAutoStamp ? fmtLong(dateIso) : fmtDateTime(dateIso)) : ''
                };
            });
            const headerRight = length > 2 ? `${Math.max(currentIdx + 1, 0)}/${length}` : (tier ? labels[tier] : 'Not Started');
            return {
                key: m.key, label: m.label, field: m.field, boolean: !!m.boolean, items, headerRight,
                barClass: 'emsp-wk-bar emsp-wk-bar-' + (tier || 'todo')
            };
        });
    }

    // Internal_Greenlight_Date__c back-dates marketing kickoff (-30d) and the recruitment meeting (-7d), Abbey's rule
    greenlightInfo(row) {
        const date = row.greenlightDate;
        const glLabel = row.greenlit ? 'Greenlit' : 'Pending';
        const glDotClass = 'emsp-gl-dot' + (row.greenlit ? ' emsp-gl-dot-yes' : '');
        if (!date) return { estDateOnly: 'Not yet set', hasTimeline: false, glLabel, glDotClass };
        if (row.greenlit) {
            return {
                estDateOnly: fmtLong(date),
                estSub: row.screened ? 'Enrolling' : 'Awaiting first patient',
                estSubClass: row.screened ? 'emsp-tl-done' : 'emsp-tl-pending',
                hasTimeline: true, glLabel, glDotClass, ...this.timeline(date)
            };
        }
        const days = daysBetween(this.todayIso, date);
        const sub = days >= 0 ? `in ${days} days` : `${-days} days overdue`;
        return {
            estDateOnly: fmtLong(date),
            estSub: sub, estSubClass: 'emsp-tl-pending',
            hasTimeline: true, glLabel, glDotClass, ...this.timeline(date)
        };
    }

    timeline(greenlightDate) {
        const kickoff = addDays(greenlightDate, -30);
        const recruit = addDays(greenlightDate, -7);
        const kickoffDue = kickoff <= this.todayIso;
        const recruitDue = recruit <= this.todayIso;
        const recruitDays = daysBetween(this.todayIso, recruit);
        return {
            marketingText: kickoffDue ? 'Marketing live' : `Mktg kickoff ${fmtShort(kickoff)}`,
            marketingClass: kickoffDue ? 'emsp-tl-done' : 'emsp-tl-pending',
            recruitText: recruitDue ? `Recruitment mtg held ${fmtShort(recruit)}` : `Recruitment mtg ${fmtShort(recruit)} (in ${recruitDays}d)`,
            recruitClass: recruitDue ? 'emsp-tl-done' : (recruitDays <= 7 ? 'emsp-tl-soon' : 'emsp-tl-pending')
        };
    }

    teamGrid(row) {
        const assigned = this.team[row.id] || {};
        return TEAM_ROLES.map(t => {
            if (t.field) {
                // naField = false means this study doesn't need this role at all ("N/A"), distinct from "nobody assigned yet"
                if (t.naField && row.values[t.naField] === false) {
                    return { key: t.key, label: t.label, name: 'N/A', cls: 'emsp-team-name', initials: '' };
                }
                const name = (row.values[t.field] || '').trim();
                return { key: t.key, label: t.label, name: name || 'Not assigned', cls: name ? 'emsp-team-name' : 'emsp-team-name emsp-team-missing', initials: name ? initials(name) : '' };
            }
            const name = assigned[t.role];
            return { key: t.key, label: t.label, name: name || 'Not assigned', cls: name ? 'emsp-team-name' : 'emsp-team-name emsp-team-missing', initials: name ? initials(name) : '' };
        });
    }

    locationsOf(r) {
        const set = this.siteLocations[r.id];
        if (set && set.size) return [...set];
        return r.studyLocation ? [r.studyLocation] : [];
    }
    get locationRows() {
        if (this.location === ALL_LOCATIONS) return this.rows;
        return this.rows.filter(r => {
            const locs = this.locationsOf(r);
            return this.location === NO_SITE ? locs.length === 0 : locs.includes(this.location);
        });
    }
    get locationOptions() {
        const names = new Set(); let unsited = false;
        this.rows.forEach(r => { const l = this.locationsOf(r); if (l.length) l.forEach(x => names.add(x)); else unsited = true; });
        if (this.location !== ALL_LOCATIONS && this.location !== NO_SITE) names.add(this.location);
        const opts = [{ label: 'All locations', value: ALL_LOCATIONS }, ...[...names].sort().map(n => ({ label: n, value: n }))];
        if (unsited) opts.push({ label: 'No site yet', value: NO_SITE });
        return opts;
    }
    get sortOptions() { return SORTS; }

    get counts() {
        const rows = this.locationRows;
        const c = { onboarding: 0, enrolling: 0 };
        rows.forEach(r => { c[r.bucket === 'activated' ? 'enrolling' : 'onboarding']++; });
        return c;
    }
    get tabs() {
        const c = this.counts;
        return [
            { key: 'onboarding', label: 'Onboarding', count: c.onboarding, cls: 'emsp-tab' + (this.tab === 'onboarding' ? ' emsp-tab-active' : '') },
            { key: 'enrolling', label: 'Enrolling', count: c.enrolling, cls: 'emsp-tab' + (this.tab === 'enrolling' ? ' emsp-tab-active' : '') }
        ];
    }
    get filteredRows() {
        const s = this.search.trim().toLowerCase();
        const wantActivated = this.tab === 'enrolling';
        return this.locationRows.filter(r => {
            if (wantActivated !== (r.bucket === 'activated')) return false;
            return !s || r.haystack.includes(s) || this.locationsOf(r).join(' ').toLowerCase().includes(s);
        }).sort((a, b) => {
            if (this.sortBy === 'sponsor') return a.sponsor.localeCompare(b.sponsor);
            if (this.sortBy === 'risk') return (b.atRisk - a.atRisk) || (b.overdue - a.overdue) || a.sponsor.localeCompare(b.sponsor);
            // 'greenlight': soonest est./actual internal greenlight first, undated studies sort last
            if (!a.greenlightDate && !b.greenlightDate) return a.sponsor.localeCompare(b.sponsor);
            if (!a.greenlightDate) return 1;
            if (!b.greenlightDate) return -1;
            return a.greenlightDate.localeCompare(b.greenlightDate);
        });
    }
    get visibleRows() {
        return this.filteredRows.map(r => ({
            ...r,
            workstreams: this.workstreamColumns(r),
            greenlight: this.greenlightInfo(r),
            teamGrid: this.teamGrid(r),
            location: this.locationsOf(r).join(', ') || 'Not assigned',
            accentClass: 'emsp-scard' + (r.greenlit ? ' emsp-accent-green' : r.overdue ? ' emsp-accent-red' : ' emsp-accent-amber')
        }));
    }
    get hasRows() { return this.filteredRows.length > 0; }
    get showEmpty() { return this.loaded && !this.hasRows && !this.gqlErrors; }
    get errorText() { return this.gqlErrors ? this.gqlErrors.map(e => e.message).join('; ') : ''; }

    handleTab(evt) { this.tab = evt.currentTarget.dataset.key; }
    handleSort(evt) { this.sortBy = evt.detail.value; }
    handleSearch(evt) { this.search = evt.target.value || ''; }
    handleLocation(evt) {
        this.location = evt.detail.value || ALL_LOCATIONS;
        try { window.localStorage.setItem(LOCATION_KEY, this.location); } catch (e) { /* storage unavailable: filter still works for this visit */ }
    }

    // Checking an unchecked box sets the field to that value. Un-checking the current box (2026-11-04, client ask)
    // clears the workstream back to not-started: blank for the tiered picklist fields (the same "nothing picked
    // yet" state pre-existing studies start in - see milestoneState's currentIdx -1 case) and false for the one
    // boolean field (Greenlight Status). Clearing re-enables every box in the row since currentIdx goes back to -1.
    // Earlier values are disabled in the template, so this only ever un-checks the current one.
    async handleMilestoneCheck(evt) {
        const { id, field, value, boolean } = evt.currentTarget.dataset;
        const isBoolean = boolean === 'true';
        const payload = evt.target.checked ? (isBoolean ? value === 'Yes' : value) : (isBoolean ? false : null);
        this.saveError = '';
        try {
            await updateRecord({ fields: { Id: id, [field]: payload } });
            await refreshGraphQL(this.wiredPortfolio);
        } catch (e) {
            this.saveError = (e && e.body && e.body.message) || 'Could not save that change.';
        }
    }
}