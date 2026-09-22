/**
 * 更新单词学习状态云函数
 *
 * status 取值：0=未学, 1=认识, 2=模糊, 3=不认识。
 * 根据状态自动计算下次复习时间：认识1天后、模糊4小时后、不认识1小时后。
 * 必须携带 bookId 参数，避免跨词书误更新同 wordId 的记录。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 根据学习状态推算最佳复习间隔。
 * 状态越差间隔越短，帮助用户在遗忘前及时巩固。
 */
function calcNextReview(status) {
  if (status === 0) return null;
  const now = Date.now();
  const intervals = {
    1: 24 * 60 * 60 * 1000,      // 认识 → 1天后
    2: 4 * 60 * 60 * 1000,        // 模糊 → 4小时后
    3: 1 * 60 * 60 * 1000         // 不认识 → 1小时后
  };
  return new Date(now + (intervals[status] || 24 * 60 * 60 * 1000));
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { wordId, status, bookId } = event;

  if (!wordId || status === undefined) {
    return { code: 400, data: null, message: '缺少 wordId 或 status' };
  }
  if (![0, 1, 2, 3].includes(status)) {
    return { code: 400, data: null, message: 'status 值无效（0=未学, 1=认识, 2=模糊, 3=不认识）' };
  }
  if (!openid) {
    return { code: 401, data: null, message: '未授权' };
  }

  try {
    // bookId 是定位记录的必要条件，缺少时直接拒绝以保护数据完整性
    if (!bookId) {
      return { code: 400, data: null, message: '缺少 bookId 参数' };
    }
    const existing = await db.collection('user_progress')
      .where({ _openid: openid, bookId, wordId })
      .get();

    const nextReview = calcNextReview(status);

    if (existing.data.length > 0) {
      await db.collection('user_progress').doc(existing.data[0]._id).update({
        data: {
          status,
          nextReviewTime: nextReview,
          updatedAt: db.serverDate()
        }
      });
    } else {
      // 极少数异常情况（如进度未被正常初始化）下兜底创建记录
      await db.collection('user_progress').add({
        data: {
          _openid: openid,
          bookId,
          wordId,
          status,
          testCount: 0,
          testCorrectCount: 0,
          nextReviewTime: nextReview,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    }

    return {
      code: 0,
      data: { status, nextReviewTime: nextReview },
      message: 'ok'
    };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '更新状态失败' };
  }
};
