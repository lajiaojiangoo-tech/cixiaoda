/**
 * 提交测试结果云函数
 *
 * 批量更新每道题的测试计数和单词状态（答对标记为"认识"，答错标记为"不认识"）。
 * 同时按「用户+词书+日期」粒度聚合学习记录，方便统计每日学习量和连续打卡。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { results, bookId, duration } = event;

  if (!results || !Array.isArray(results) || results.length === 0) {
    return { code: 400, data: null, message: '缺少测试结果数据' };
  }
  if (!openid) {
    return { code: 401, data: null, message: '未授权' };
  }
  if (!bookId) {
    return { code: 400, data: null, message: '缺少 bookId 参数' };
  }

  try {
    let correctCount = 0;

    // 逐条处理每道题的测试结果，更新对应的 user_progress 记录
    const updatePromises = results.map(async (r) => {
      const { wordId, isCorrect } = r;

      // 用 bookId+wordId 定位进度记录，防止不同词书中相同 ID 的单词被误更新
      const query = { _openid: openid, wordId, bookId };
      const existing = await db.collection('user_progress')
        .where(query)
        .get();

      if (existing.data.length > 0) {
        const record = existing.data[0];
        const newTestCount = (record.testCount || 0) + 1;
        const newCorrect = (record.testCorrectCount || 0) + (isCorrect ? 1 : 0);

        // 答对了标记为"认识"，答错了标记为"不认识"以触发短期复习
        const newStatus = isCorrect ? 1 : 3;

        await db.collection('user_progress').doc(record._id).update({
          data: {
            testCount: newTestCount,
            testCorrectCount: newCorrect,
            status: newStatus,
            updatedAt: db.serverDate()
          }
        });

        if (isCorrect) correctCount++;
      }
    });

    await Promise.all(updatePromises);

    // 更新或创建当日的学习记录（按日期聚合，一天一条）
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);

    const existingRecord = await db.collection('study_records')
      .where({ _openid: openid, bookId, date: dateStr })
      .get();

    if (existingRecord.data.length > 0) {
      await db.collection('study_records').doc(existingRecord.data[0]._id).update({
        data: {
          testCount: db.command.inc(results.length),
          duration: db.command.inc(duration || 0),
          updatedAt: db.serverDate()
        }
      });
    } else {
      await db.collection('study_records').add({
        data: {
          _openid: openid,
          bookId,
          date: dateStr,
          newWordsCount: 0,
          reviewCount: 0,
          testCount: results.length,
          duration: duration || 0,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    }

    const total = results.length;
    return {
      code: 0,
      data: {
        total,
        correct: correctCount,
        wrong: total - correctCount,
        accuracy: total > 0 ? Math.round((correctCount / total) * 100) : 0
      },
      message: '测试结果已保存'
    };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '提交测试结果失败' };
  }
};
