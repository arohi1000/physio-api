/**
 * Placeholder clinic identity for generated PDFs. The schema has no field for
 * a clinic display name or a practitioner's professional credentials/
 * registration number — real values are branding and clinical content
 * (EXECUTION-PLAN.md §8: both are on the escalation list, never guessed) —
 * so these mirror the placeholder already used for the seeded doctor's name
 * and the Swagger document title elsewhere in this codebase, clearly marked
 * here as placeholders pending the doctor's own copy.
 */
export const CLINIC_NAME = 'Physio Clinic';
export const CLINIC_TAGLINE = 'Physiotherapy & Rehabilitation';
export const DOCTOR_CREDENTIALS_PLACEHOLDER = 'Registered Physiotherapist';

/**
 * Titles a doctor for a patient-facing document without doubling the honorific.
 * A doctor's stored name may or may not already carry one — the seeded record
 * reads "Dr. Meera Sharma" — and prepending unconditionally printed
 * "Dr. Dr. Meera Sharma" on a receipt handed to a patient.
 */
export function formatDoctorName(name: string): string {
  return /^(dr|prof)\.?\s/i.test(name.trim())
    ? name.trim()
    : `Dr. ${name.trim()}`;
}
