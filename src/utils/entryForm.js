// Defaults, validation and payload mapping for the Faculty Daily Activity Entry form.
import { minutesBetween, toISODate } from './format';

export const emptyHeader = (facultyCode = '', date = toISODate()) => ({
  facultyCode,
  activityDate: date,
  facultyIn: 'Center',
  timeFrom: '',
  timeTo: '',
});

export const EMPTY_DETAILS = {
  class: {
    courseId: '', batchNo: '', classIn: '', chapterNo: '', chapterType: '', dayOrder: '', noOfStudents: '', todaySessionType: '', todaySessionDetail: '',
    dailyTest: '', dailyActivityPost: '',
  },
  seminar: { seminarType: '', collegeName: '', dept: '', sec: '', totalStudent: '', yop: '', databaseCollected: '', assistance: '', remarks: '' },
  marketing: {
    marketingType: 'TC calls', collegeName: '', dept: '', sec: '', yop: '', total: '', freshRepeat: '',
    gradeA: '', gradeBPlus: '', gradeBMinus: '', gradeD: '', gradeNR: '', enquiryFormNo: '', registerNo: '', remarks: '',
  },
  learning: { courseId: '', materialType: '', chapterNo: '', pages: '', chapterDetails: '' },
  selfLearning: { learningType: 'Self Learning', courseId: '', chapterNo: '', chapterDetails: '' },
  database: { databaseName: '', fileName: '', records: '', storedPlace: '' },
  travelling: { fromPlace: '', toPlace: '', mode: '', purpose: '', remarks: '' },
  // Software and System Fault are no longer entered (tabs removed); kept so old entries still open.
  software: { softwareName: '', softwareActivity: '', location: '', systems: '', remarks: '' },
  others: { heading: '', remarks: '' },
  systemFault: { productType: '', location: '', advproNo: '', productNo: '', faultError: '', faultStatus: '', solution: '', remarks: '' },
};

export const EMPTY_OUTSTATION = {
  collegeName: '', dept: '', sec: '', totalAbsent: '', yop: '', assistanceFaculty: '',
  videosShown: '', guidedExercisePpt: '', mentiQuiz: '', taskGiven: '',
};

// Optional Yes / No questions of the College / OD section.
export const OD_CHECKS = [
  ['videosShown', 'Videos shown'],
  ['guidedExercisePpt', 'Guided exercise PPT shown', 'PPT shown'],
  ['mentiQuiz', 'Menti quiz conducted', 'Menti quiz'],
  ['taskGiven', 'Task given'],
];

// Optional Yes / No questions of every Class entry (Center and College / OD).
export const CLASS_CHECKS = [
  ['dailyTest', 'Daily test'],
  ['dailyActivityPost', 'Daily activity post'],
];

// Day Order of the class (1 to 20), for Center and College / OD.
export const DAY_ORDERS = Array.from({ length: 20 }, (_, i) => String(i + 1));

// Self Learning / Knowledge Sharing tab: the two modes share the same fields.
export const SELF_LEARNING_TYPES = ['Self Learning', 'Knowledge Sharing'];

// Marketing sub-types that record a count, and the label of that count.
export const MARKETING_COUNT_LABEL = { 'TC calls': 'Total Calls', Mailers: 'Total Mails', SMS: 'Total SMS', 'Label Printout': 'Total Labels' };

export const MARKETING_GRADE_FIELDS = [
  ['gradeA', 'A'],
  ['gradeBPlus', 'B+'],
  ['gradeBMinus', 'B-'],
  ['gradeD', 'D'],
  ['gradeNR', 'NR'],
];

/** Others may take at most 1 hour per person per day (all roles). */
export const OTHERS_DAILY_LIMIT = 60;

export const freshDetails = () => JSON.parse(JSON.stringify(EMPTY_DETAILS));

const REQUIRED = {
  class: ['courseId', 'chapterNo', 'noOfStudents', 'todaySessionType'],
  seminar: ['seminarType', 'collegeName', 'dept', 'totalStudent'],
  marketing: ['marketingType'],
  learning: ['courseId', 'chapterDetails'],
  selfLearning: ['learningType', 'courseId', 'chapterDetails'],
  database: ['databaseName', 'fileName', 'records'],
  travelling: ['fromPlace', 'toPlace', 'mode'],
  software: ['softwareName', 'softwareActivity'],
  others: ['heading', 'remarks'],
  systemFault: ['productType', 'location', 'advproNo', 'faultError', 'faultStatus'],
};

export const isRequired = (tab, field) => REQUIRED[tab]?.includes(field);

const NUMERIC = ['noOfStudents', 'totalStudent', 'totalAbsent', 'total', 'records', 'systems', 'pages', 'yop', 'gradeA', 'gradeBPlus', 'gradeBMinus', 'gradeD', 'gradeNR'];

/** Returns { header: {...}, details: {...}, outstation: {...} } error maps. */
export function validateEntry({ header, tab, details, outstation }) {
  const errors = { header: {}, details: {}, outstation: {} };
  if (!header.facultyCode) errors.header.facultyCode = 'Select a faculty';
  if (!header.activityDate) errors.header.activityDate = 'Activity date is required';
  else if (header.activityDate > toISODate()) errors.header.activityDate = 'Activity date cannot be in the future';
  if (!header.timeFrom) errors.header.timeFrom = 'Required';
  if (!header.timeTo) errors.header.timeTo = 'Required';
  if (header.timeFrom && header.timeTo && minutesBetween(header.timeFrom, header.timeTo) <= 0) errors.header.timeTo = 'Must be after Time From';

  REQUIRED[tab].forEach((f) => {
    if (!String(details[f] ?? '').trim()) errors.details[f] = 'Required';
  });
  if (tab === 'class') {
    if (header.facultyIn === 'Outstation') {
      if (!details.classIn) errors.details.classIn = 'Required';
      ['collegeName', 'dept'].forEach((f) => {
        if (!String(outstation[f] ?? '').trim()) errors.outstation[f] = 'Required';
      });
      if (Number(outstation.totalAbsent || 0) > Number(details.noOfStudents || 0)) errors.outstation.totalAbsent = 'Cannot exceed No of Students';
    }
  }
  Object.entries(details).forEach(([k, v]) => {
    if (NUMERIC.includes(k) && v !== '' && !/^\d+$/.test(String(v))) errors.details[k] = 'Numbers only';
  });
  if (tab === 'marketing') {
    const t = details.marketingType;
    if (MARKETING_COUNT_LABEL[t]) {
      if (!details.collegeName) errors.details.collegeName = 'Required';
      if (!details.total) errors.details.total = 'Required';
    }
    if (t === 'Councelling' && !details.enquiryFormNo) errors.details.enquiryFormNo = 'Required';
    if (t === 'Registration' && !details.registerNo) errors.details.registerNo = 'Required';
    if (details.yop && !/^\d{4}$/.test(details.yop)) errors.details.yop = 'Enter a 4-digit year';
  }
  Object.entries(outstation).forEach(([k, v]) => {
    if (NUMERIC.includes(k) && v !== '' && !/^\d+$/.test(String(v)) && !errors.outstation[k]) errors.outstation[k] = 'Numbers only';
  });

  const count = Object.keys(errors.header).length + Object.keys(errors.details).length + Object.keys(errors.outstation).length;
  return { errors, valid: count === 0 };
}

/** Shape sent to POST/PUT /api/daily-entries. */
export function buildPayload({ header, tab, details, outstation }) {
  let d = { ...details };
  // Only keep the fields of this tab (an edited old entry may still carry retired fields).
  if (tab === 'learning' || tab === 'selfLearning') d = Object.fromEntries(Object.entries(d).filter(([k]) => k in EMPTY_DETAILS[tab]));
  if (tab === 'marketing') {
    const t = d.marketingType;
    const keep = MARKETING_COUNT_LABEL[t]
      ? ['marketingType', 'collegeName', 'dept', 'sec', 'yop', 'total', 'freshRepeat', 'remarks', ...(t === 'TC calls' ? MARKETING_GRADE_FIELDS.map(([k]) => k) : [])]
      : ['marketingType', t === 'Councelling' ? 'enquiryFormNo' : 'registerNo', 'remarks'];
    d = Object.fromEntries(Object.entries(d).filter(([k]) => keep.includes(k)));
  }
  if (tab === 'class') {
    if (header.facultyIn === 'Center') d.classIn = '';
    else d.batchNo = '';
  }
  return {
    facultyCode: header.facultyCode,
    activityDate: header.activityDate,
    facultyIn: header.facultyIn,
    timeFrom: header.timeFrom,
    timeTo: header.timeTo,
    activityType: tab,
    details: d,
    // College / OD keeps Total Student in its block too (older reports read it from there).
    outstation: tab === 'class' && header.facultyIn === 'Outstation' ? { ...outstation, totalStudent: d.noOfStudents } : null,
  };
}
