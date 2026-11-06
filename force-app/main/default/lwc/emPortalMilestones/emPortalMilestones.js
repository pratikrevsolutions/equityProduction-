import { LightningElement, api } from 'lwc';
/**
 * EM Portal Milestones - thin Experience Cloud (LWR) wrapper around c/emUpcomingMilestones for the portal's
 * Milestones page. Keeps the LEX component LEX-only. Phase 5, 2026-09-16.
 */
export default class EmPortalMilestones extends LightningElement {
    @api title = 'Upcoming milestones';
    @api horizonDays = 60;
}