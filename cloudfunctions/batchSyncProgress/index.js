/**
 * 批量同步本地缓存进度到云端云函数
 *
 * 供前端在离线学习后将本地缓存的进度批量上传。
 * 同步 user_progress（单词状态）和 study_records（学习记录）两个集合：
 * - user_progress：对每条记录执行 upsert（存在则更新，不存在则创建）
 * - study_records：按「词书+日期」聚合后更新或创建
 * 并发处理以提升同步速度，同时用 Promise.all 控制在合理并发量内。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { records } = event;

  if (!records || !Array.isArray(records) || records.length === 0) {
    return { code: 400, data: null, message: '缺少同步数据' };
  }
  if (!openid) {
    return { code: 401, data: null, message: '未授权' };
  }
  if (records.some(r => !r.bookId)) {
    return { code: 400, data: null, message: '同步数据中缺少 bookId' };
  }

  try {
    let updated = 0;
    let created = 0;
    let studyDays = {}; // 按 bookId|date 分组聚合学习记录

    const batchPromises = records.map(async (r) => {
      const { wordId, bookId, status, testCount, testCorrectCount, nextReviewTime, date, duration } = r;

      if (!wordId) return;

      // ---- 同步 user_progress（单词学习进度） ----
      const query = { _openid: openid, bookId, wordId };
      const existing = await db.collection('user_progress')
        .where(query)
        .get();

      if (existing.data.length > 0) {
        const current = existing.data[0];
        const updateData = { updatedAt: db.serverDate() };

        // 只同步有值的字段，保留云端已有字段不受影响
        if (status !== undefined && status >= 0) updateData.status = status;
        if (testCount !== undefined) updateData.testCount = testCount;
        if (testCorrectCount !== undefined) updateData.testCorrectCount = testCorrectCount;
        if (nextReviewTime) updateData.nextReviewTime = new Date(nextReviewTime);

        await db.collection('user_progress').doc(current._id).update({ data: updateData });
        updated++;
      } else {
        await db.collection('user_progress').add({
          data: {
            _openid: openid,
            bookId,
            wordId,
            status: status || 0,
            testCount: testCount || 0,
            testCorrectCount: testCorrectCount || 0,
            nextReviewTime: nextReviewTime ? new Date(nextReviewTime) : null,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
        created++;
      }

      // ---- 收集学习记录数据，稍后按日期聚合写入 ----
      if (date) {
        const key = `${bookId}|${date}`;
        if (!studyDays[key]) {
          studyDays[key] = { bookId, date, wordIds: new Set(), durations: [] };
        }
        studyDays[key].wordIds.add(wordId);
        if (duration) studyDays[key].durations.push(duration);
      }
    });

    await Promise.all(batchPromises);

    // ---- 写入 study_records（按词书+日期聚合，一天一条） ----
    const studyPromises = Object.entries(studyDays).map(async ([key, info]) => {
      const existingRecord = await db.collection('study_records')
        .where({ _openid: openid, bookId: info.bookId, date: info.date })
        .get();

      if (existingRecord.data.length > 0) {
        await db.collection('study_records').doc(existingRecord.data[0]._id).update({
          data: {
            wordsCount: db.command.inc(info.wordIds.size),
            duration: db.command.inc(info.durations.reduce((a, b) => a + b, 0)),
            updatedAt: db.serverDate()
          }
        });
      } else {
        await db.collection('study_records').add({
          data: {
            _openid: openid,
            bookId: info.bookId,
            date: info.date,
            wordsCount: info.wordIds.size,
            duration: info.durations.reduce((a, b) => a + b, 0),
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
      }
    });
    await Promise.all(studyPromises);

    return {
      code: 0,
      data: { updated, created, studyDays: Object.keys(studyDays).length, total: records.length },
      message: '同步完成'
    };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '批量同步失败' };
  }
};
