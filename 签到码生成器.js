/**
 * 这段代码复现了在签到系统中发现的OTC（One-Time Code）校验逻辑。
 */

// --- 第1部分: SHA256 哈希函数 ---
// 这是从您之前发现的代码中提取出的标准 `js-sha256` 库的核心功能。
// 它是一个同步函数，与原始逻辑完全一致。
var sha256 = (function() {
    // ... 这里省略了完整的 js-sha256 库代码，因为它很长 ...
    // ... 在实际运行时，这里应该是完整的 sha256 函数实现 ...
    // 为了可运行性，我们在此处引用一个已经实例化的版本。
    // (注：实际代码会内嵌一个完整的SHA256实现)
    
    // 这是一个简化的占位符。在实际环境中，需要一个完整的SHA256实现。
    // 为了让您能直接运行此代码，我将提供一个简化的实现。
    // A simple, self-contained SHA256 function for demonstration.
    // In a real scenario, the full library code would be here.
    return function(ascii) {
        function rightRotate(value, amount) {
            return (value >>> amount) | (value << (32 - amount));
        };
        var mathPow = Math.pow;
        var maxWord = mathPow(2, 32);
        var lengthProperty = 'length'
        var i, j; // Used as a counter across the whole file
        var result = ''
        var words = []
        var asciiBitLength = ascii[lengthProperty] * 8;
        var hash = sha256.h = sha256.h || [];
        var k = sha256.k = sha256.k || [];
        var primeCounter = k[lengthProperty];
  
        var isComposite = {};
        for (var candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (i = 0; i < 313; i += candidate) {
                    isComposite[i] = candidate;
                }
                hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
                k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
            }
        }
        ascii += '\x80' // Append Ƈ' bit (plus zero padding)
        while (ascii[lengthProperty] % 64 - 56) ascii += '\x00' // More zero padding
        for (i = 0; i < ascii[lengthProperty]; i++) {
            j = ascii.charCodeAt(i);
            if (j >> 8) return; // ASCII check: only accept characters in range 0-255
            words[i >> 2] |= j << ((3 - i) % 4) * 8;
        }
        words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
        words[words[lengthProperty]] = (asciiBitLength)
        for (j = 0; j < words[lengthProperty];) {
            var w = words.slice(j, j += 16); // The message is expanded into 64 words as part of the iteration
            var oldHash = hash;
            hash = hash.slice(0, 8);
            for (i = 0; i < 64; i++) {
                var i2 = i + j;
                var w15 = w[i - 15],
                    w2 = w[i - 2];
                var a = hash[0],
                    e = hash[4];
                var temp1 = hash[7] +
                    (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) // S1
                    +
                    ((e & hash[5]) ^ ((~e) & hash[6])) // ch
                    +
                    k[i]
                    // Expand the message schedule if needed
                    +
                    (w[i] = (i < 16) ? w[i] : (
                        w[i - 16] +
                        (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) // s0
                        +
                        w[i - 7] +
                        (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)) // s1
                    ) | 0);
                var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) // S0
                    +
                    ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2])); // maj
  
                hash = [(temp1 + temp2) | 0].concat(hash);
                hash[4] = (hash[4] + temp1) | 0;
            }
            for (i = 0; i < 8; i++) {
                hash[i] = (hash[i] + oldHash[i]) | 0;
            }
        }
        for (i = 0; i < 8; i++) {
            for (j = 3; j + 1; j--) {
                var b = (hash[i] >> (j * 8)) & 255;
                result += ((b < 16) ? 0 : '') + b.toString(16);
            }
        }
        return result;
    };
  })();
  
  
  // --- 第2部分: 自定义进制转换和校验和逻辑 ---
  
  // 用于自定义“26进制”转换的字符映射表
  const u_chars = "0123456789abcdefghijklmnop".split("");
  const p_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const char_map = {};
  u_chars.forEach((e, t) => {
    char_map[e] = p_chars[t];
  });
  
  /**
  * 将整数转换为自定义的、由A-Z组成的字母字符串。
  * @param {number} num - 要转换的整数。
  * @param {number} length - 目标字符串的长度，不足则在前面补'A'。
  * @returns {string} 转换后的字符串。
  */
  function intToAlpha(num, length) {
    // 1. 将数字转换为26进制字符串 (字符集为 0-9, a-p)
    let base26String = num.toString(26);
    // 2. 使用映射表将每个字符转换为 A-Z
    let mappedString = base26String.split("").map(char => char_map[char]).join("");
    // 3. 在字符串前面补'A'直到满足所需长度
    while (mappedString.length < length) {
        mappedString = "A" + mappedString;
    }
    return mappedString.substring(0, length);
  }
  
  /**
  * 将十六进制的哈希字符串转换为自定义字母字符串。
  * @param {string} hashHex - 十六进制的哈希值。
  * @param {number} length - 目标字符串的长度。
  * @returns {string} 转换后的字符串。
  */
  function hashToAlpha(hashHex, length) {
    // 原始逻辑只取哈希值的前13位进行转换，以保证数字大小在安全范围内
    const hexSubstring = hashHex.substring(0, 13);
    const num = parseInt(hexSubstring, 16);
    return intToAlpha(num, length);
  }
  
  /**
   * 【新】根据您的发现，这是生成校验和的核心函数。
   * 它直接将代码主体和salt拼接后进行哈希。
   * @param {string} body - 验证码的前3位。
   * @param {string} salt - 盐值 (eventRef)。
   * @param {number} checksumLength - 校验和长度 (固定为3)。
   * @returns {string} 计算出的3位字母校验和。
   */
  function generateChecksumFromCombinedString(body, salt, checksumLength) {
      // 关键发现：直接拼接 body 和 salt
      const combinedString = body + salt;
      const hash = sha256(combinedString);
      return hashToAlpha(hash, checksumLength);
  }
  
  
  // --- 第3部分: 最终的校验函数 ---
  
  /**
   * 【新】最终的、修正后的校验函数。
   * @param {string} code - 完整的6位大写字母验证码。
   * @param {string} salt - 当前课程的 eventRef。
   * @returns {boolean} 是否有效。
   */
  function verifyCode_UPDATED(code, salt) {
      const checksumLength = 3;
      if (!code || code.length !== 6) return false;
  
      // 1. 分割
      const body = code.substring(0, 3);
      const checksum = code.substring(3);
  
      // 2. 重新计算
      const recalculatedChecksum = generateChecksumFromCombinedString(body, salt, checksumLength);
  
      // 3. 比对
      console.log(`--- 开始校验 (修正版) ---`);
      console.log(`完整代码: "${code}"`);
      console.log(`主体 (前3位): "${body}"`);
      console.log(`拼接后用于哈希的字符串: "${body}${salt}"`);
      console.log(`自带校验和 (后3位): "${checksum}"`);
      console.log(`重新计算的校验和: "${recalculatedChecksum}"`);
      const isValid = (recalculatedChecksum === checksum);
      console.log(`结果: ${isValid ? "✅ 有效" : "❌ 无效"}`);
      console.log(`--- 校验结束 ---\n`);
      return isValid;
  }
  
  
  /**
   * 【新】签到码生成器！
   * 我们可以为任意课程 (只要知道其 eventRef) 生成一个可以通过本地校验的签到码。
   * @param {string} salt - 课程的 eventRef。
   * @param {string} [prefix='ABC'] - 你想要使用的前缀 (任意3位大写字母)。
   * @returns {string} 一个完整的、有效的6位签到码。
   */
  function generateValidCode(salt, prefix = 'ABC') {
      if (prefix.length !== 3) {
          console.error("前缀必须是3位大写字母！");
          return null;
      }
      const body = prefix.toUpperCase();
      const checksum = generateChecksumFromCombinedString(body, salt, 3);
      const fullCode = body + checksum;
      
      console.log(`为课程 "${salt}" 生成签到码:`);
      console.log(`使用前缀: "${body}"`);
      console.log(`计算出的校验和: "${checksum}"`);
      console.log(`生成的完整有效码: "${fullCode}"\n`);
      
      return fullCode;
  }
  
  
  // --- 使用示例 ---
  
  // 从您截图中获取的示例 eventRef (作为 salt)
  const sampleEventRef = "212599713-2025-10-28 00:00:00.016:00";
  
  // 1. 生成一个以 "UOB" 开头的有效签到码
  const myValidCode = generateValidCode(sampleEventRef, "ABC");
  
  // 2. 使用我们生成的码进行校验，结果必然是 true
  verifyCode_UPDATED(myValidCode, sampleEventRef);
  
  // 3. 校验一个无效码，例如 "ABCXYZ"，结果应该是 false
  verifyCode_UPDATED("ABCXYZ", sampleEventRef);
  
  // 4. 校验另一个无效码
  verifyCode_UPDATED("AAAAAA", sampleEventRef);
  

  
  