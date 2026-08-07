function removeAccents(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
function cleanStoreStr(str) {
  if (!str) return '';
  return removeAccents(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function extractDigits(str) {
  const m = String(str || '').match(/\d{3,}/g);
  return m ? m.join('') : '';
}

function isStoreMatch(sched, zip) {
  // 1. EXACT CODE MATCH
  const codeS = cleanStoreStr(sched.storeCode).replace(/\s/g, '');
  const codeZ = cleanStoreStr(zip.storeCode).replace(/\s/g, '');
  if (codeS && codeZ && codeS.length >= 3 && codeS === codeZ) {
    return true;
  }

  // 2. NUMERIC CODE MATCH
  const numS = extractDigits(sched.storeCode);
  const numZ = extractDigits(zip.storeCode);
  if (numS && numZ && numS.length >= 3 && numZ.length >= 3 && numS === numZ) {
    const prefixS = cleanStoreStr(sched.storeCode).replace(/[0-9\s]/g, '');
    const prefixZ = cleanStoreStr(zip.storeCode).replace(/[0-9\s]/g, '');
    
    // Nếu cả hai đều có prefix thì prefix phải khớp (vd: BHX == BHX)
    if (prefixS && prefixZ && prefixS === prefixZ) return true;
    
    // Nếu một trong hai KHÔNG CÓ prefix (chỉ có số), không tự động match ngay
    // vì "010" có thể là của "BHX010" hoặc "LCM010". Để phần NAME MATCH quyết định.
  }

  // 3. NAME MATCH
  const nameS = cleanStoreStr(sched.storeName);
  const nameZ = cleanStoreStr(zip.storeName);
  
  if (nameS && nameZ) {
    // Kiểm tra xem tên có quá ngắn hoặc chỉ là số không
    const isSShortOrNum = /^\d+$/.test(nameS.replace(/\s/g, '')) || nameS.length < 5;
    const isZShortOrNum = /^\d+$/.test(nameZ.replace(/\s/g, '')) || nameZ.length < 5;
    
    // Chỉ dùng includes khi cả 2 chuỗi đều đủ dài và có chữ (không phải chỉ toàn số)
    if (!isSShortOrNum && !isZShortOrNum) {
      if (nameS.includes(nameZ) || nameZ.includes(nameS)) return true;
    }

    // Khớp gần đúng theo từ
    const wordsZ = nameZ.split(' ').filter(w => w.length > 1);
    const wordsS = nameS.split(' ').filter(w => w.length > 1);
    const zAllInS = wordsZ.length >= 2 && wordsZ.every(w => nameS.includes(w));
    const sAllInZ = wordsS.length >= 2 && wordsS.every(w => nameZ.includes(w));
    if (zAllInS || sAllInZ) return true;
  }

  return false;
}

const sched1 = { storeCode: 'BHX010', storeName: 'BHX Lê Văn Việt 010' };
const zip1 = { storeCode: '010', storeName: '010' };
const sched2 = { storeCode: 'LCM010', storeName: 'Lotte Mart 010' };

console.log("sched1 vs zip1:", isStoreMatch(sched1, zip1));
console.log("sched2 vs zip1:", isStoreMatch(sched2, zip1));

const sched3 = { storeCode: 'AE0002', storeName: 'Aeon Bình Tân' };
const zip3 = { storeCode: 'AE0002', storeName: 'AEON BINH TAN' };
console.log("sched3 vs zip3:", isStoreMatch(sched3, zip3));

const sched4 = { storeCode: '', storeName: 'GO An Lạc' };
const zip4 = { storeCode: '', storeName: 'GO An Lac' };
console.log("sched4 vs zip4:", isStoreMatch(sched4, zip4));
