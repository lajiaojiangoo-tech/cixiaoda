/**
 * 加入生词本云函数
 *
 * 将指定单词加入用户的生词本，用于后续集中复习。
 * 先检查是否已存在，避免重复插入产生冗余数据。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { wordId } = event;

  if (!wordId) {
    return { code: 400, data: null, message: '缺少 wordId 参数' };
  }
  if (!openid) {
    return { code: 401, data: null, message: '未授权' };
  }

  try {
    // 查询是否已存在，避免重复插入
    const existing = await db.collection('user_vocabulary')
      .where({ _openid: openid, wordId })
      .get();

    if (existing.data.length > 0) {
      return { code: 0, data: { alreadyExists: true }, message: '已在生词本中' };
    }

    await db.collection('user_vocabulary').add({
      data: {
        _openid: openid,
        wordId,
        addedAt: db.serverDate()
      }
    });

    return { code: 0, data: { alreadyExists: false }, message: '已加入生词本' };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '加入生词本失败' };
  }
};
