import { LightningElement, api } from 'lwc';
/**
 * EM Portal Onboarding Items - thin Experience Cloud (LWR) wrapper around c/emOnboardingItems for the
 * Care Program Detail object page ({!recordId}). Keeps the LEX component LEX-only. WU8 (2026-09-10).
 */
export default class EmPortalOnboardingItems extends LightningElement {
    @api recordId;
    @api title = 'Onboarding Items';
}