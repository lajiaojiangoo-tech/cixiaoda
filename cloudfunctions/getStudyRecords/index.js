/**
 * 获取学习日历云函数（月视图）
 *
 * 返回指定月份中每天的学习记录（新词数、复习数、时长、测试数），
 * 供前端日历热力图组件展示。通过日期范围查询避免拉取全量数据。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { year, month, bookId } = event;

  if (!year || !month || month < 1 || month > 12) {
    return { code: 400, data: null, message: '参数错误：year 和 month 无效' };
  }
  if (!openid) {
    return { code: 401, data: null, message: '未授权' };
  }

  try {
    // 计算月份范围：从当月1日到次月1日，用 date 字符串做范围查询
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const whereClause = {
      _openid: openid,
      date: db.command.gte(startDate).and(db.command.lt(endDate))
    };
    if (bookId) whereClause.bookId = bookId;
    const records = await db.collection('study_records')
      .where(whereClause)
      .orderBy('date', 'asc')
      .get();

    // 按日期组织成 key-value 映射，前端直接按日期索引
    const calendarData = {};
    for (const r of records.data) {
      calendarData[r.date] = {
        newWordsCount: r.newWordsCount || 0,
        reviewCount: r.reviewCount || 0,
        duration: r.duration || 0,
        testCount: r.testCount || 0
      };
    }

    return {
      code: 0,
      data: {
        year,
        month,
        records: calendarData
      },
      message: 'ok'
    };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '获取学习记录失败' };
  }
};
