/**
 * 云开发 API 封装
 * 统一调用云函数
 */

/** 调用云函数 */
function callCloudFunction(name, data = {}) {
  return wx.cloud.callFunction({
    name,
    data
  }).then(res => {
    const result = res.result || {};
    if (result.code === 0) {
      return result.data;
    }
    throw new Error(result.message || '云函数调用失败');
  }).catch(err => {
    console.error(`[cloud] ${name} 调用失败:`, err);
    throw err;
  });
}

/** 获取用户 openid */
function login() {
  return callCloudFunction('login');
}

/** 获取用户数据 */
function getUserData() {
  return callCloudFunction('getUserData');
}

/** 同步用户设置 */
function syncUserSettings(settings) {
  return callCloudFunction('syncUserSettings', { settings });
}

/** 获取单词书列表（分页 + 模糊搜索） */
function getWordbooks({ keyword = '', page = 1, pageSize = 20 } = {}) {
  return callCloudFunction('getWordbooks', { keyword, page, pageSize });
}

/** 初始化用户学习进度 */
function initUserProgress(bookId) {
  return callCloudFunction('initUserProgress', { bookId });
}

/** 更新单词学习状态 */
function updateWordStatus(wordId, status, bookId) {
  return callCloudFunction('updateWordStatus', { wordId, status, bookId });
}

/** 获取今日待学/待复习词 */
function getTodayStudyWords(bookId) {
  return callCloudFunction('getTodayStudyWords', { bookId });
}

/** 提交测试结果 */
function submitTestResult(data) {
  return callCloudFunction('submitTestResult', data);
}

/** 加入生词本 */
function addToVocabulary(wordId) {
  return callCloudFunction('addToVocabulary', { wordId });
}

/** 移出生词本 */
function removeFromVocabulary(wordId) {
  return callCloudFunction('removeFromVocabulary', { wordId });
}

/** 批量移出生词本 */
function batchRemoveFromVocabulary(wordIds) {
  return callCloudFunction('batchRemoveFromVocabulary', { wordIds });
}

/** 获取生词本列表 */
function getVocabularyList({ keyword = '', sortBy = 'time', page = 1, pageSize = 20 } = {}) {
  return callCloudFunction('getVocabularyList', { keyword, sortBy, page, pageSize });
}

/** 获取学习日历记录 */
function getStudyRecords(year, month) {
  return callCloudFunction('getStudyRecords', { year, month });
}

/** 获取学习统计（支持按词书过滤） */
function getStatistics(params = {}) {
  return callCloudFunction('getStatistics', params);
}

/** 提交反馈 */
function addFeedback(data) {
  return callCloudFunction('addFeedback', data);
}

/** 批量同步进度 */
function batchSyncProgress(records) {
  return callCloudFunction('batchSyncProgress', { records });
}

/** 根据 ID 列表批量获取单词详情 */
function getWordsByIds(ids) {
  return callCloudFunction('getWordsByIds', { ids });
}

module.exports = {
  login,
  getUserData,
  syncUserSettings,
  getWordbooks,
  initUserProgress,
  updateWordStatus,
  getTodayStudyWords,
  submitTestResult,
  addToVocabulary,
  removeFromVocabulary,
  batchRemoveFromVocabulary,
  getVocabularyList,
  getStudyRecords,
  getStatistics,
  addFeedback,
  batchSyncProgress,
  getWordsByIds
};
