import { LightningElement, api } from 'lwc';
/**
 * EM Portal Home - thin Experience Cloud (LWR) wrapper around c/emStudyOpsHome.
 * The LEX component keeps LEX-only targets (mixed lightningCommunity__* targets broke it in
 * Lightning Experience, WU7 abcc891); this wrapper carries the site targets instead. WU8 (2026-09-10).
 */
export default class EmPortalHome extends LightningElement {
    @api horizonDays = 60;
    @api studiesPath = '/studies';
}