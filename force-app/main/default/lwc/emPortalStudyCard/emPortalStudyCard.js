import { LightningElement, api } from 'lwc';
/**
 * EM Portal Study Card - thin Experience Cloud (LWR) wrapper around c/emStudyCard for the
 * Care Program Detail object page ({!recordId}). Keeps the LEX component LEX-only. WU8 (2026-09-10).
 */
export default class EmPortalStudyCard extends LightningElement {
    @api recordId;
}