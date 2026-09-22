/**
 * 获取学习统计云函数
 *
 * 返回累计学习单词数、今日已学数、总学习时长和连续打卡天数。
 * 连续打卡的计算逻辑：从今天（或昨天，如果今天没学）开始往前追溯，
 * 遇到断档即停止。这种策略允许用户"今天忘学了但昨天有学"时仍能维持连续天数，
 * 给予一定的容错空间。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { bookId } = event;

  if (!openid) {
    return { code: 401, data: null, message: '未授权' };
  }

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 构建查询条件，bookId 可选：传了则只统计指定词书，不传则统计全部
    const progressQuery = { _openid: openid, status: db.command.gt(0) };
    const todayQuery = { _openid: openid, status: db.command.gt(0), updatedAt: db.command.gte(todayStart) };
    const studyQuery = { _openid: openid };
    if (bookId) {
      progressQuery.bookId = bookId;
      todayQuery.bookId = bookId;
      studyQuery.bookId = bookId;
    }

    // 累计学习单词数（status>0 表示已学）
    const learnedResult = await db.collection('user_progress')
      .where(progressQuery)
      .count();
    const totalLearned = learnedResult.total;

    // 今日已学单词数（今天 updatedAt 之后 status>0 的记录）
    const todayLearnedResult = await db.collection('user_progress')
      .where(todayQuery)
      .count();
    const todayLearned = todayLearnedResult.total;

    // 拉取所有学习记录计算总时长和连续打卡天数
    const studyCount = await db.collection('study_records')
      .where(studyQuery).count();
    const BATCH = 100;
    let allRecords = [];
    for (let i = 0; i < studyCount.total; i += BATCH) {
      const res = await db.collection('study_records')
        .where(studyQuery).skip(i).limit(BATCH).get();
      allRecords.push(...res.data);
    }
    const totalDuration = allRecords.reduce((sum, r) => sum + (r.duration || 0), 0);

    // 去重并降序排列所有学习日期
    const dateSet = new Set(allRecords.map(r => r.date));
    const studyDates = [...dateSet].sort().reverse();

    // 计算连续打卡天数
    let streak = 0;
    if (studyDates.length > 0) {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      let startDate;

      // 容错策略：今天学了就从今天算；今天没学但从昨天开始连续也算（允许遗漏一天）
      if (studyDates[0] === todayStr) {
        startDate = new Date(todayStr);
      } else {
        const yesterday = new Date(todayStr);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);
        if (studyDates[0] === yesterdayStr) {
          startDate = yesterday;
        } else {
          // 最近学习日既不是今天也不是昨天，连续打卡已经中断
          startDate = null;
        }
      }

      if (startDate) {
        let currentDate = new Date(startDate);
        let idx = 0;

        // 从起始日向前逐天匹配，直到遇到断档
        while (idx < studyDates.length) {
          const expected = currentDate.toISOString().slice(0, 10);
          if (studyDates[idx] === expected) {
            streak++;
            currentDate.setDate(currentDate.getDate() - 1);
            idx++;
          } else {
            break;
          }
        }
      }
    }

    return {
      code: 0,
      data: {
        totalLearned,
        totalDuration,
        streak,
        todayLearned,
        totalStudyDays: studyDates.length
      },
      message: 'ok'
    };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '获取统计失败' };
  }
};
