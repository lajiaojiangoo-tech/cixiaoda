/**
 * 移出生词本云函数
 *
 * 从用户的生词本中移除指定单词。不报错（即使原本就不存在也返回成功），
 * 这是为了让前端无需关心单词是否已在生词本中，简化调用逻辑。
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
    const existing = await db.collection('user_vocabulary')
      .where({ _openid: openid, wordId })
      .get();

    if (existing.data.length > 0) {
      await db.collection('user_vocabulary').doc(existing.data[0]._id).remove();
    }

    return { code: 0, data: null, message: '已移出生词本' };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '移出生词本失败' };
  }
};
