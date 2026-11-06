import { LightningElement, api } from 'lwc';
/**
 * EM Portal My Work - thin Experience Cloud (LWR) wrapper around c/emMyOnboardingWork for the portal's
 * My work page. Keeps the LEX component LEX-only. Phase 5, 2026-09-16.
 */
export default class EmPortalMyWork extends LightningElement {
    @api title = 'My onboarding work';
    @api maxRows = 8;
}