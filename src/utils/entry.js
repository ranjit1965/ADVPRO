import { ACTIVITY_LABEL } from './constants';

/** One-line description of an entry, used in tables and timelines. */
export function entrySummary(e) {
  const d = e.details || {};
  switch (e.activityType) {
    case 'class':
      return [d.batchNo || d.classIn, d.courseId, d.chapterNo && `Ch ${d.chapterNo}`, d.dayOrder && `Day ${d.dayOrder}`, d.todaySessionType].filter(Boolean).join(' · ');
    case 'seminar':
      return [d.seminarType, d.collegeName || d.courseId, d.dept, d.facultyRole === 'Assistance Faculty' && 'Assistance'].filter(Boolean).join(' · ');
    case 'facultyDevelopment':
      return [d.fdType, d.remarks].filter(Boolean).join(' · ');
    case 'marketing':
      return [d.marketingType, d.collegeName || d.databaseName, d.fileName, d.total && `${d.total} total`, d.records && `${d.records} records`, d.enquiryFormNo, d.courseId, d.registerNo, d.utilizationCheck && `Utilization ${d.utilizationCheck}`, d.labCreation].filter(Boolean).join(' · ');
    case 'learning':
      return [d.materialType, d.courseId, d.chapterNo && `Ch ${d.chapterNo}`].filter(Boolean).join(' · ');
    case 'selfLearning':
      return [d.learningType, d.courseId, d.chapterNo && `Ch ${d.chapterNo}`, d.chapterType, d.materialType, d.classMode].filter(Boolean).join(' · ');
    case 'database':
      return [d.databaseName, d.fileName, d.records && `${d.records} records`].filter(Boolean).join(' · ');
    case 'travelling':
      return [d.fromPlace && d.toPlace && `${d.fromPlace} → ${d.toPlace}`, d.mode].filter(Boolean).join(' · ');
    case 'software':
      return [d.softwareName, d.softwareActivity, d.location].filter(Boolean).join(' · ');
    case 'others':
      return [d.heading, d.remarks].filter(Boolean).join(' · ');
    case 'systemFault':
      return [d.advproNo, d.productType, d.faultError, d.faultStatus].filter(Boolean).join(' · ');
    default:
      return ACTIVITY_LABEL[e.activityType] || '';
  }
}

/** Activity codes printed in the C.Type column of the Daily Activity Report (same as the old software). */
export const C_TYPE_LEGEND = [
  ['CL', 'Class'],
  ['GL', 'Seminar Guest'],
  ['IV', 'Seminar Industrial Visit'],
  ['IN', 'Internship'],
  ['CO', 'Counseling'],
  ['MK', 'Marketing Support'],
  ['CP', 'Learn Preparation'],
  ['SL', 'Learn Self Preparation'],
  ['KS', 'Knowledge Sharing'],
  ['CA', 'Class Attended'],
  ['FD', 'Faculty Development'],
  ['DB', 'DataBase'],
  ['TR', 'Travelling'],
  ['SW', 'Software'],
  ['SF', 'System Fault'],
  ['OT', 'Others'],
];

function cType(e) {
  const d = e.details || {};
  switch (e.activityType) {
    case 'class':
      return 'CL';
    case 'seminar':
      return d.seminarType === 'Guest Lecture' ? 'GL' : d.seminarType === 'Internship' ? 'IN' : 'IV';
    case 'marketing':
      return d.marketingType === 'Councelling' ? 'CO' : d.marketingType === 'DataBase Creation/Download' ? 'DB' : 'MK';
    case 'learning':
      return 'CP';
    case 'selfLearning':
      return d.learningType === 'Knowledge Sharing' ? 'KS' : d.learningType === 'Class Attended' ? 'CA' : 'SL';
    case 'facultyDevelopment':
      return 'FD';
    case 'database':
      return 'DB';
    case 'travelling':
      return 'TR';
    case 'software':
      return 'SW';
    case 'systemFault':
      return 'SF';
    default:
      return 'OT';
  }
}

/**
 * One row of the Daily Activity Report in the old software's columns:
 * Batch No, Paper Name, S.No, S.Type, College Name, Dept, YOP, Topic, C.Type.
 */
export function reportRow(e, courses = []) {
  const d = e.details || {};
  const o = e.outstation || {};
  const join = (...parts) => parts.filter(Boolean).join(' · ');
  const paper = d.courseId ? (courses.find((c) => c.id === d.courseId)?.name || d.courseId).toUpperCase() : '';
  const atCollege = e.activityType === 'class' && e.facultyIn === 'Outstation';
  const row = {
    batchNo: e.activityType === 'class' ? d.batchNo || d.classIn || '' : '',
    paper,
    sNo: ['class', 'learning', 'selfLearning', 'seminar'].includes(e.activityType) ? d.chapterNo || '' : '',
    // L = Lab / Practical, T = Theory
    sType: d.chapterType ? (/^(lab|practical)/i.test(d.chapterType) ? 'L' : d.chapterType.charAt(0).toUpperCase()) : '',
    college: atCollege ? o.collegeName : d.collegeName || '',
    dept: atCollege ? o.dept : d.dept || '',
    yop: atCollege ? o.yop : d.yop || '',
    cType: cType(e),
    // Main / Assistance faculty (Class at College / OD, Seminar)
    role: ({ 'Main Faculty': 'Main', 'Assistance Faculty': 'Assistance' })[(atCollege ? o.facultyRole : e.activityType === 'seminar' ? d.facultyRole : '') || ''] || '',
    mainFaculty: (atCollege ? o.mainFaculty : e.activityType === 'seminar' ? d.mainFaculty : '') || '',
  };
  switch (e.activityType) {
    case 'class':
      row.topic = join(d.todaySessionDetail || d.todaySessionType, d.dayOrder && `Day ${d.dayOrder}`);
      break;
    case 'learning':
      row.topic = join(d.materialType, d.chapterDetails, d.pages && `Qty ${d.pages}`);
      break;
    case 'selfLearning':
      row.topic = join(d.learningType, d.classFaculty && `by ${d.classFaculty}`, d.classMode, d.trainee && `to ${d.trainee}`, d.materialType, d.chapterDetails);
      break;
    case 'seminar':
      row.topic = join(d.seminarType, d.chapterDetails, d.totalStudent && `${d.totalStudent} students`, d.remarks);
      break;
    case 'facultyDevelopment':
      row.topic = join(d.fdType, d.remarks);
      break;
    case 'marketing':
      row.topic = join(d.marketingType, d.databaseName, d.fileName, d.total && `${d.total} total`, d.records && `${d.records} records`, d.enquiryFormNo, d.courseId, d.registerNo, d.utilizationCheck && `Utilization ${d.utilizationCheck}`, d.labCreation, d.remarks);
      break;
    case 'others':
      row.topic = join(d.heading, d.remarks && d.remarks.toLowerCase() !== String(d.heading || '').toLowerCase() ? d.remarks : '');
      break;
    default:
      row.topic = join(entrySummary(e), d.purpose, d.solution, d.remarks);
  }
  return row;
}
