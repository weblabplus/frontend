// Τοπικό αντίγραφο των κατηγοριών εξετάσεων για το frontend.
// Πηγή: @medilab/core (packages/core/src/constants/examCatalog.ts) — κρατάμε
// μόνο ό,τι χρειάζεται το UI, ώστε το frontend να είναι ανεξάρτητο project.

export enum TestCategory {
  HEMATOLOGY = 'hematology',
  BIOCHEMISTRY = 'biochemistry',
  HORMONES = 'hormones',
  TUMOR_MARKERS = 'tumor_markers',
  IMMUNOLOGY = 'immunology',
  MICROBIOLOGY = 'microbiology',
  URINALYSIS = 'urinalysis',
  COAGULATION = 'coagulation',
  CARDIAC = 'cardiac',
  THYROID = 'thyroid',
  LIPID_PROFILE = 'lipid_profile',
  OTHER = 'other',
}

/** Ελληνικές ετικέτες κατηγοριών (για UI dropdowns) */
export const EXAM_CATEGORY_LABELS_EL: Record<TestCategory, string> = {
  [TestCategory.HEMATOLOGY]: 'Αιματολογικές',
  [TestCategory.BIOCHEMISTRY]: 'Βιοχημικές',
  [TestCategory.HORMONES]: 'Ορμονολογικές',
  [TestCategory.TUMOR_MARKERS]: 'Καρκινικοί Δείκτες',
  [TestCategory.IMMUNOLOGY]: 'Ανοσολογικές',
  [TestCategory.MICROBIOLOGY]: 'Μικροβιολογικές',
  [TestCategory.URINALYSIS]: 'Ουρολογικές',
  [TestCategory.COAGULATION]: 'Πηκτικότητα',
  [TestCategory.CARDIAC]: 'Καρδιολογικοί Δείκτες',
  [TestCategory.THYROID]: 'Θυρεοειδικές',
  [TestCategory.LIPID_PROFILE]: 'Λιπιδαιμικές',
  [TestCategory.OTHER]: 'Άλλες',
};
