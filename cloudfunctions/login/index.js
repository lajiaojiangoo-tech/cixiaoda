/**
 * 登录云函数
 *
 * 借助微信云开发的免鉴权能力，直接从上下文获取用户的 openid。
 * 前端无需处理复杂登录态，每次调用云函数时微信会自动注入身份信息。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  return {
    code: 0,
    data: {
      openid: wxContext.OPENID,
      appid: wxContext.APPID,
      unionid: wxContext.UNIONID || ''
    },
    message: 'ok'
  };
};
