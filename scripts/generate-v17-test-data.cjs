const fs = require('fs');
const path = require('path');

const data = [
  ['date', 'feedback', 'raw_amount', 'sales'],
  ['2025-01-01', '这产品太棒了，物流也很快，五星好评！', '¥1,200.50', 1000],
  ['2025-01-02', '包装坏了，客服态度极其恶劣，不建议购买。', '$50.00', 1200],
  ['2025-01-03', '一般般吧，勉强能用，没有什么特色。', '100.00', 800],
  ['2025-01-04', 'Excellent quality and fast shipping!', '€15.99', 1500],
  ['2025-01-05', '退货流程太麻烦了，等了一个星期。', '2,300', 1100],
  ['2025-02-01', '续购，一如既往的好用。', '¥1,200.50', 2000],
  ['2025-02-02', '非常失望，实物和图片严重不符。', '$45.00', 1800],
];

// Wrap each field in double quotes and escape existing double quotes
const csvContent = data.map(row => 
  row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
).join('\n');
const filePath = path.join(process.cwd(), 'test_v17_augmentation.csv');

fs.writeFileSync(filePath, csvContent);
console.log(`Test data generated at: ${filePath}`);
