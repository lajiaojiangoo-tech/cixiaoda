/**
 * 提交反馈云函数
 *
 * 保存用户反馈（建议/问题/其他）到数据库。内容至少 5 个字以过滤无意义提交，
 * 反馈类型必须在预设范围内，防止脏数据写入。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { type, content, contact } = event;

  if (!content || content.trim().length < 5) {
    return { code: 400, data: null, message: '反馈内容不能少于5个字' };
  }
  if (!['建议', '问题', '其他'].includes(type)) {
    return { code: 400, data: null, message: '反馈类型无效' };
  }

  try {
    await db.collection('feedbacks').add({
      data: {
        _openid: openid || '',
        type,
        content: content.trim(),
        contact: contact || '',
        createdAt: db.serverDate()
      }
    });

    return { code: 0, data: null, message: '反馈提交成功，感谢您的反馈！' };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '提交反馈失败' };
  }
};
