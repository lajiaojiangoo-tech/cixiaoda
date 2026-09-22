/**
 * 工具函数集
 */

/** 日期格式化：yyyy-MM-dd HH:mm:ss */
function formatDate(date, pattern = 'yyyy-MM-dd HH:mm:ss') {
  if (!date) return '';
  const d = typeof date === 'number' ? new Date(date) : date;
  const map = {
    'yyyy': d.getFullYear(),
    'MM': String(d.getMonth() + 1).padStart(2, '0'),
    'dd': String(d.getDate()).padStart(2, '0'),
    'HH': String(d.getHours()).padStart(2, '0'),
    'mm': String(d.getMinutes()).padStart(2, '0'),
    'ss': String(d.getSeconds()).padStart(2, '0')
  };
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, k => map[k]);
}

/** 获取今日日期字符串 yyyy-MM-dd */
function getTodayStr() {
  return formatDate(new Date(), 'yyyy-MM-dd');
}

/** 防抖 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

/** 显示轻提示（封装 wx.showToast） */
function showToast(title, icon = 'none', duration = 2000) {
  wx.showToast({ title, icon, duration });
}

module.exports = {
  formatDate,
  getTodayStr,
  debounce,
  showToast
};
