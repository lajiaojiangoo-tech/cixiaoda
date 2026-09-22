/**
 * 初始化数据库云函数
 *
 * 部署后调用一次即可批量创建单词书和对应单词数据。支持分步骤执行：
 * 先插单词书（step=books），再分别插四级和高考单词（step=words1/words2），
 * 也可不传 step 一键全部初始化。
 *
 * 幂等设计：已存在数据不会重复插入，靠检查集合中是否已有同条件记录来判定。
 * 注意：必须先插单词书再插单词（单词表依赖 bookId 字段关联单词书）。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const BOOK_ID_CET4 = 'book_cet4';
const BOOK_ID_GAOKAO = 'book_gaokao';

const SAMPLE_BOOKS = [
  {
    _id: BOOK_ID_CET4,
    name: '大学英语四级核心词汇',
    coverImage: '',
    description: '涵盖 CET-4 最常考的 2000 个核心词汇，适合备考大学生',
    totalWords: 2000
  },
  {
    _id: BOOK_ID_GAOKAO,
    name: '高考高频词汇',
    coverImage: '',
    description: '高考英语真题中出现频率最高的 2000 个词汇',
    totalWords: 2000
  }
];

const BOOK1_WORDS = require('./cet4_words');
const BOOK2_WORDS = require('./gaokao_words');

/**
 * 种子数据写入函数。
 * 先检查集合中是否已有符合条件的记录（通过 filterFields 指定的字段判断），
 * 已有则跳过，避免重复插入导致数据膨胀。
 */
async function seedCollection(collectionName, data, filterFields = []) {
  let existingCount = 0;
  if (data.length > 0 && filterFields.length > 0) {
    // 用指定字段构造查询条件（如 bookId），只检查同条件的数据是否已存在
    const query = {};
    for (const field of filterFields) {
      if (data[0][field] !== undefined) {
        query[field] = data[0][field];
      }
    }
    if (Object.keys(query).length > 0) {
      const res = await db.collection(collectionName).where(query).count();
      existingCount = res.total;
    }
  } else {
    const res = await db.collection(collectionName).count();
    existingCount = res.total;
  }

  if (existingCount > 0) {
    return { skipped: true, count: existingCount };
  }
  // 分批写入，每批 100 条并发插入以利用云数据库批量能力
  let inserted = 0;
  const BATCH = 100;
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH);
    await Promise.all(batch.map(item => db.collection(collectionName).add({ data: item })));
    inserted += batch.length;
  }
  return { inserted };
}

exports.main = async (event, context) => {
  try {
    const { step } = event;

    if (step === 'books') {
      const r = await seedCollection('wordbooks', SAMPLE_BOOKS);
      return { code: 0, data: r, message: '单词书初始化完成' };
    }
    if (step === 'words1') {
      const r = await seedCollection('words', BOOK1_WORDS, ['bookId']);
      return { code: 0, data: r, message: '四级单词初始化完成' };
    }
    if (step === 'words2') {
      const r = await seedCollection('words', BOOK2_WORDS, ['bookId']);
      return { code: 0, data: r, message: '高考单词初始化完成' };
    }

    // 不传 step 时执行全部初始化。先确保单词书写入成功，再写单词（依赖 bookId 外键）
    const r1 = await seedCollection('wordbooks', SAMPLE_BOOKS);
    if (r1.inserted > 0) {
      await seedCollection('words', BOOK1_WORDS, ['bookId']);
      await seedCollection('words', BOOK2_WORDS, ['bookId']);
    }
    return { code: 0, data: r1, message: '数据库初始化完成' };
  } catch (err) {
    return { code: -1, data: null, message: err.message || '初始化失败' };
  }
};
