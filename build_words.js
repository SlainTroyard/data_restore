// Node 脚本：将爬取的 cet4_core_words.json 转成小程序内部使用的词库格式
//
// 使用方法（在项目根目录 c:/Users/liuxf/WeChatProjects/cet4 下）：
//   1. 在命令行执行：
//        node data/build_words.js
//   2. 生成文件：
//        data/cet4_words_built.json   原始 JSON 版本
//        data/cet4_words_built.js     供小程序引入的 ES Module
//
// 小程序中会通过 utils/data-import.js 里的 importCet4CoreWords() 导入这个词库。

const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, 'cet4_core_words.json');
const OUT_JSON_PATH = path.join(__dirname, 'cet4_words_built.json');
const OUT_JS_PATH = path.join(__dirname, 'cet4_words_built.js');

/** 提取音标：优先用字段，其次从 HTML 中解析 span.phonetic */
function extractPhonetic(item) {
  if (item.phonetic_br_e) return item.phonetic_br_e.trim();
  if (item.phonetic_am_e) return item.phonetic_am_e.trim();
  if (item.meaning_html) {
    const m = item.meaning_html.match(/<span class="phonetic">([^<]+)<\/span>/);
    if (m) return m[1].trim();
  }
  return '';
}

/** 提取简要释义：从 meaning_text 中去掉单词和音标，只保留前半部分定义，去掉“同义词”段落 */
function extractMeaning(item) {
  if (!item.meaning_text) return '';
  const raw = item.meaning_text.replace(/\r\n/g, '\n');
  const lines = raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines.length) return '';

  let idx = 0;
  const lowerWord = (item.word || '').toLowerCase();
  if (lines[idx].toLowerCase() === lowerWord) {
    idx += 1;
  }
  if (idx < lines.length && /^\[.*\]$/.test(lines[idx])) {
    idx += 1;
  }

  const meaningLines = [];
  for (; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (!line) continue;
    // 截断“同义词：”后面的内容，避免释义里塞太多近义词
    if (line.startsWith('同义词：')) break;
    meaningLines.push(line);
    // 控制长度，太长对小程序展示也不友好
    if (meaningLines.join(' ').length > 220) break;
  }

  return meaningLines.join(' ');
}

/** 从 meaning_text 中抓取英文引号里的例句，最多 3 条 */
function extractExamples(item) {
  const examples = [];
  if (!item.meaning_text) return examples;

  const raw = item.meaning_text.replace(/\r\n/g, '\n');
  const lines = raw.split('\n');

  for (const line of lines) {
    if (line.indexOf('"') === -1) continue;
    const matches = line.match(/"([^"]+)"/g);
    if (!matches) continue;
    for (const m of matches) {
      const content = m.slice(1, -1).trim();
      if (content && examples.length < 3) {
        examples.push({ en: content, cn: '' });
      }
    }
    if (examples.length >= 3) break;
  }

  return examples;
}

function build() {
  if (!fs.existsSync(SRC_PATH)) {
    console.error('找不到源文件：', SRC_PATH);
    process.exit(1);
  }

  const rawText = fs.readFileSync(SRC_PATH, 'utf8');
  let rawData;
  try {
    rawData = JSON.parse(rawText);
  } catch (err) {
    console.error('解析 cet4_core_words.json 失败：', err);
    process.exit(1);
  }

  if (!Array.isArray(rawData)) {
    console.error('源数据不是数组格式，检查 cet4_core_words.json');
    process.exit(1);
  }

  const built = [];
  rawData.forEach((item, index) => {
    if (!item || !item.word) return;

    const word = String(item.word).trim();
    if (!word) return;

    const id = `cet4_${String(index + 1).padStart(5, '0')}`;
    const phonetic = extractPhonetic(item);
    const meaning = extractMeaning(item);
    const detail = item.meaning_text ? item.meaning_text.replace(/\r\n/g, '\n').trim() : '';
    const examples = extractExamples(item);

    // 如果连释义都没有，就跳过（很多 Wikipedia/无解释的条目）
    if (!meaning && !detail) return;

    built.push({
      id,
      word,
      phonetic,
      meaning,
      detail,
      examples,
      audioBrUrl: item.audio_br_url || '',
      audioAmUrl: item.audio_am_url || '',
      sourceUrl: item.detail_url || ''
    });
  });

  // 写 JSON 版（便于检查）
  fs.writeFileSync(OUT_JSON_PATH, JSON.stringify(built, null, 2), 'utf8');

  // 写 JS 模块版：供小程序直接 import
  const jsContent =
    '// 自动生成：请不要手改。来源 data/build_words.js\n' +
    'const words = ' +
    JSON.stringify(built, null, 2) +
    ';\n\n' +
    'export default words;\n';

  fs.writeFileSync(OUT_JS_PATH, jsContent, 'utf8');

  console.log(`转换完成：共处理 ${rawData.length} 条，生成有效词条 ${built.length} 条。`);
  console.log(`已生成：${path.relative(process.cwd(), OUT_JSON_PATH)}`);
  console.log(`已生成：${path.relative(process.cwd(), OUT_JS_PATH)}`);
}

build();

