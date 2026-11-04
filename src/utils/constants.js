// Activity tabs, in the same order as the legacy "Faculty Daily Activity Entry" screen.
export const ACTIVITY_TYPES = [
  { key: 'class', label: 'Class' },
  { key: 'seminar', label: 'Seminar / Work Shop' },
  { key: 'marketing', label: 'Marketing Support' },
  { key: 'learning', label: 'Course Preparation' },
  { key: 'selfLearning', label: 'Self Learning / Knowledge Sharing' },
  { key: 'database', label: 'DataBase Creation/Download' },
  { key: 'travelling', label: 'Travelling Time' },
  { key: 'others', label: 'Others' },
];

// Software and System Fault are no longer entered; the labels stay so old entries still show.
export const RETIRED_ACTIVITY_LABEL = { software: 'Software', systemFault: 'System Fault' };
export const ACTIVITY_LABEL = { ...Object.fromEntries(ACTIVITY_TYPES.map((a) => [a.key, a.label])), ...RETIRED_ACTIVITY_LABEL };

export const FACULTY_IN = {
  CENTER: 'Center',
  OUTSTATION: 'Outstation',
};

/** Stored value stays 'Outstation' (old entries keep working); people see "College / OD". */
export const FACULTY_IN_LABEL = { Center: 'Center', Outstation: 'College / OD' };
export const facultyInLabel = (v) => FACULTY_IN_LABEL[v] || v;
export const FACULTY_IN_OPTIONS = [
  { value: 'Center', label: 'Center' },
  { value: 'Outstation', label: 'College / OD' },
];


export const FAULT_STATUS = ['Open', 'In Progress', 'Resolved'];

// Activities that count toward activity performance. The legacy screen notes that
// "Others" is not a part of activity performance.
export const NON_PERFORMANCE_TYPES = ['others'];

export const PAGE_SIZE_OPTIONS = [10, 25, 50];
