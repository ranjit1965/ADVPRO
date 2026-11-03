import { ACTIVITY_LABEL } from './constants';

/** One-line description of an entry, used in tables and timelines. */
export function entrySummary(e) {
  const d = e.details || {};
  switch (e.activityType) {
    case 'class':
      return [d.batchNo || d.classIn, d.courseId, d.chapterNo && `Ch ${d.chapterNo}`, d.dayOrder && `Day ${d.dayOrder}`, d.todaySessionType].filter(Boolean).join(' · ');
    case 'seminar':
      return [d.seminarType, d.collegeName, d.dept].filter(Boolean).join(' · ');
    case 'marketing':
      return [d.marketingType, d.collegeName, d.total && `${d.total} total`, d.enquiryFormNo, d.registerNo].filter(Boolean).join(' · ');
    case 'learning':
      return [d.materialType, d.courseId, d.chapterNo && `Ch ${d.chapterNo}`].filter(Boolean).join(' · ');
    case 'selfLearning':
      return [d.learningType, d.courseId, d.chapterNo && `Ch ${d.chapterNo}`].filter(Boolean).join(' · ');
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
