document.addEventListener('DOMContentLoaded', function() {
    console.log('Popup脚本已加载');
    
    // 加载地点缓存
    loadLocationCache();
    
    // 加载并显示数据
    loadAndDisplayData();
    
    // 监听storage变化
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        console.log('Storage发生变化:', changes);
        if (namespace === 'local' && (changes.bristolUserInfo || changes.bristolStatus)) {
            loadAndDisplayData();
        }
    });

    // 绑定自动生成按钮事件
    const autoGenerateBtn = document.getElementById('autoGenerateBtn');
    if (autoGenerateBtn) {
        autoGenerateBtn.addEventListener('click', function() {
            // 查找第一个被选中的课程
            const checkboxes = document.querySelectorAll('.event-checkbox:checked');
            let eventToUse = null;
            
            if (checkboxes.length > 0) {
                // 如果有选中，使用第一个选中的
                const index = parseInt(checkboxes[0].dataset.index);
                eventToUse = currentTimetableData[index];
            } else if (currentTimetableData.length > 0) {
                // 如果没有选中但有课程，尝试使用第一个（或者提示用户选择）
                // 这里为了方便，如果没有选中的，我们提示用户先选择一个
                 showCheckinStatus('请先选择一个课程以生成对应的签到码', 'error');
                 return;
            }
            
            if (eventToUse && eventToUse.eventRef) {
                // 生成签到码
                const code = generateValidCode(eventToUse.eventRef);
                if (code) {
                    const otcInput = document.getElementById('otcInput');
                    if (otcInput) {
                        otcInput.value = code;
                        // 闪烁效果提示已填充
                        otcInput.style.transition = 'background-color 0.2s';
                        otcInput.style.backgroundColor = '#e0f2fe'; // 浅蓝
                        setTimeout(() => {
                            otcInput.style.backgroundColor = 'rgba(255,255,255,0.9)';
                        }, 300);
                        
                        showCheckinStatus(`已为课程 "${eventToUse.desc1 || '未知课程'}" 生成签到码: ${code}`, 'success');
                    }
                }
            } else {
                showCheckinStatus('无法获取课程信息或课程没有eventRef', 'error');
            }
        });
    }
});

function loadAndDisplayData() {
    updateStatus('正在加载数据...');
    
    chrome.storage.local.get(['bristolUserInfo', 'bristolStatus', 'lastUpdated', 'lastStatusCheck'], function(result) {
        console.log('从storage获取的数据:', result);
        
        if (result.bristolUserInfo) {
            // 显示用户信息（如果用户信息中缺少cookie，则尝试使用状态信息中的cookie）
            const displayData = { ...result.bristolUserInfo };
            if ((!displayData.cookie || displayData.cookie === '-') && result.bristolStatus && result.bristolStatus.cookie) {
                displayData.cookie = result.bristolStatus.cookie;
            }
            displayUserInfo(displayData);
            updateStatus(`用户信息已加载 (${result.lastUpdated ? new Date(result.lastUpdated).toLocaleString() : '未知时间'})`);
        } else if (result.bristolStatus) {
            // 显示状态信息
            displayStatusInfo(result.bristolStatus);
            updateStatus(`状态信息已加载 (${result.lastStatusCheck ? new Date(result.lastStatusCheck).toLocaleString() : '未知时间'})`);
        } else {
            // 显示无数据状态
            showNoDataMessage();
            updateStatus('未检测到Bristol University数据');
        }
    });
}

function displayUserInfo(userInfo) {
    hideNoDataMessage();
    
    document.getElementById('personID').textContent = userInfo.personID || '未知';
    document.getElementById('firstname').textContent = userInfo.firstname || '未知';
    document.getElementById('surname').textContent = userInfo.surname || '未知';
    document.getElementById('email').textContent = userInfo.email || '未知';
    document.getElementById('serviceUsername').textContent = userInfo.serviceUsername || '未知';
    document.getElementById('cookie').textContent = userInfo.cookie || '无Cookie信息';
    
    // 显示课程表按钮（当有cookie时）
    const timetableSection = document.getElementById('timetableSection');
    if (userInfo.cookie && userInfo.cookie !== '无Cookie信息') {
        timetableSection.style.display = 'block';
        
        // 初始化日期输入框的默认值
        initializeDateInputs();
        
        // 绑定课程表按钮事件
        const getTimetableBtn = document.getElementById('getTimetableBtn');
        getTimetableBtn.onclick = () => {
            // 显示使用说明
    const usageInstructions = document.getElementById('usageInstructions');
    if (usageInstructions) {
        usageInstructions.style.display = 'block';
    }
            
            getTimetable(userInfo.cookie);
        };
    } else {
        timetableSection.style.display = 'none';
        
        // 隐藏协议确认部分和签到按钮
        const checkinBtn = document.getElementById('oneClickCheckinBtn');
        const twoColumnContainer = document.getElementById('twoColumnContainer');
        
        if (checkinBtn) {
            checkinBtn.style.display = 'none';
        }
        if (twoColumnContainer) {
            twoColumnContainer.style.display = 'none';
        }
    }
    
    // 显示清除数据部分
    const clearDataSection = document.getElementById('clearDataSection');
    clearDataSection.style.display = 'block';
    
    // 绑定清除数据按钮事件
    const clearDataBtn = document.getElementById('clearDataBtn');
    clearDataBtn.onclick = clearAllData;
    
    document.getElementById('userInfo').style.display = 'block';
}

function displayStatusInfo(statusInfo) {
    hideNoDataMessage();
    
    // 创建状态显示区域
    const statusDiv = document.getElementById('statusInfo') || createStatusInfoDiv();
    statusDiv.innerHTML = `
        <div class="info-item">
            <span class="label">组织代码:</span>
            <span class="value">${statusInfo.orgCode || '未知'}</span>
        </div>
        <div class="info-item">
            <span class="label">认证状态:</span>
            <span class="value">${statusInfo.status || '未知'}</span>
        </div>
        <div class="info-item">
            <span class="label">消息:</span>
            <span class="value">${statusInfo.message || '无消息'}</span>
        </div>
        <div class="info-item">
            <span class="label">检测时间:</span>
            <span class="value">${statusInfo.timestamp ? new Date(statusInfo.timestamp).toLocaleString() : '未知'}</span>
        </div>
    `;
    statusDiv.style.display = 'block';
    
    // 隐藏用户信息区域
    document.getElementById('userInfo').style.display = 'none';
}

function createStatusInfoDiv() {
    const statusDiv = document.createElement('div');
    statusDiv.id = 'statusInfo';
    statusDiv.className = 'status-info';
    
    // 插入到用户信息区域之前
    const userInfoDiv = document.getElementById('userInfo');
    userInfoDiv.parentNode.insertBefore(statusDiv, userInfoDiv);
    
    return statusDiv;
}

function showNoDataMessage() {
    document.getElementById('userInfo').style.display = 'none';
    const statusDiv = document.getElementById('statusInfo');
    if (statusDiv) {
        statusDiv.style.display = 'none';
    }
    document.getElementById('noData').style.display = 'block';
}

function hideNoDataMessage() {
    document.getElementById('noData').style.display = 'none';
}

function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

// 监听storage变化，实时更新数据
chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local' && (changes.bristolUserInfo || changes.bristolStatus)) {
        // 统一调用加载方法以合并可能来自状态信息的cookie
        loadAndDisplayData();
    }
});

// 获取课程表功能
// 初始化日期输入框的默认值
function initializeDateInputs() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    // 如果输入框为空，设置默认值
    if (!startDateInput.value) {
        const today = new Date();
        startDateInput.value = today.toISOString().split('T')[0];
    }
    
    if (!endDateInput.value) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 3); // 3天后
        endDateInput.value = futureDate.toISOString().split('T')[0];
    }
}

async function getTimetable(cookie) {
    const getTimetableBtn = document.getElementById('getTimetableBtn');
    const timetableResult = document.getElementById('timetableResult');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    // 获取用户输入的日期，如果为空则使用默认值
    let startDate = startDateInput.value;
    let endDate = endDateInput.value;
    
    // 如果没有输入日期，使用默认值
    if (!startDate) {
        const today = new Date();
        startDate = today.toISOString().split('T')[0]; // 今天
        startDateInput.value = startDate;
    }
    
    if (!endDate) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 3); // 3天后
        endDate = futureDate.toISOString().split('T')[0];
        endDateInput.value = endDate;
    }
    
    // 转换为API需要的格式
    const startDateTime = new Date(startDate + 'T00:00:00.000Z').toISOString();
    const endDateTime = new Date(endDate + 'T23:59:59.000Z').toISOString();
    
    // 禁用按钮并显示加载状态
    getTimetableBtn.disabled = true;
    getTimetableBtn.textContent = '获取中...';
    timetableResult.style.display = 'block';
    timetableResult.className = 'timetable-result';
    timetableResult.textContent = `正在获取课程表数据...\n时间范围: ${startDate} 至 ${endDate}`;
    
    try {
        // 构建请求URL - Sheffield API端点
        const url = `https://i.sheffield.ac.uk/campusm/sso/cal2/Course%20Timetable%20(2025-26)?start=${encodeURIComponent(startDateTime)}&end=${encodeURIComponent(endDateTime)}`;
        
        console.log('发送课程表请求:', url);
        console.log('使用Cookie:', cookie);
        console.log('查询时间范围:', startDate, '至', endDate);
        
        // 发送请求
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Host': 'i.sheffield.ac.uk',
                'Connection': 'keep-alive',
                'sec-ch-ua-platform': '"Windows"',
                'cache-control': 'no-cache',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
                'pragma': 'no-cache',
                'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
                'sec-ch-ua-mobile': '?0',
                'Accept': '*/*',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Dest': 'empty',
                'Referer': 'https://i.sheffield.ac.uk/campusm/home',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en,zh-CN;q=0.9,zh;q=0.8',
                'Cookie': cookie
            }
        });
        
        console.log('课程表请求响应状态:', response.status);
        
        if (response.ok) {
            // 优先按JSON解析
            const contentType = response.headers.get('content-type') || '';
            let payload;
            if (contentType.includes('application/json')) {
                payload = await response.json();
            } else {
                const text = await response.text();
                try {
                    payload = JSON.parse(text);
                } catch (_) {
                    // 非JSON响应，作为错误处理
                    timetableResult.className = 'timetable-result timetable-error';
                    timetableResult.textContent = `课程表获取成功，但响应不是JSON，无法解析为事件列表。`;
                    return;
                }
            }
            
            // 渲染为表格：只保留关键字段
            const events = Array.isArray(payload?.events) ? payload.events : (Array.isArray(payload) ? payload : []);
            
            // 获取所有地点信息并批量获取坐标
            const locations = events.map(ev => ev.locAdd1 || ev.locCode).filter(loc => loc && loc.trim());
            
            const tasks = [];
            
            // 任务1: 批量获取坐标
            if (locations.length > 0) {
                console.log('开始获取地点坐标...');
                tasks.push(batchGetCoordinates(locations).then(() => console.log('地点坐标获取完成')));
            }
            
            // 任务2: 获取签到历史
            let historyMap = {};
            tasks.push(fetchCheckinHistory(cookie).then(map => {
                historyMap = map;
                console.log('签到历史获取完成', Object.keys(map).length);
            }));
            
            await Promise.all(tasks);
            
            renderTimetable(events, historyMap);
        } else {
            // 显示错误结果
            const errorText = await response.text();
            console.error('课程表请求失败:', response.status, errorText);
            
            timetableResult.className = 'timetable-result timetable-error';
            timetableResult.textContent = `课程表获取失败！\n状态码: ${response.status}\n错误信息: ${errorText || '未知错误'}`;
        }
        
    } catch (error) {
        console.error('课程表请求异常:', error);
        
        // 显示异常结果
        timetableResult.className = 'timetable-result timetable-error';
        timetableResult.textContent = `课程表获取异常！\n错误: ${error.message}`;
    } finally {
        // 恢复按钮状态
        getTimetableBtn.disabled = false;
        getTimetableBtn.textContent = '获取课程表';
    }
}

// 将课程表事件渲染为表格，仅保留关键字段
function renderTimetable(events, historyMap = {}) {
    const timetableResult = document.getElementById('timetableResult');
    timetableResult.className = 'timetable-result timetable-success';
    
    if (!events || events.length === 0) {
        timetableResult.textContent = '没有查询到任何课程安排。';
        return;
    }

    // 排序：按开始时间
    const sorted = [...events].sort((a, b) => new Date(a.start || a.calDate) - new Date(b.start || b.calDate));

    // 更新全局数据以匹配排序后的显示顺序，确保索引对应正确
    currentTimetableData = sorted;

    const rowsHtml = sorted.map((ev, index) => {
         const start = ev.start || ev.calDate;
         const end = ev.end || '';
         const title = ev.desc1 || '-';
         const location = ev.locAdd1 || ev.locCode || '-';
         const ref = ev.eventRef || '-';
         
         // 获取签到状态
         const status = historyMap[ref];
         let statusDisplay = '-';
         if (status === 'validated') {
             statusDisplay = '<span style="color:#16a34a;font-weight:bold;">✓ 已签到</span>';
         } else if (status === 'attended') {
             statusDisplay = '<span style="color:#16a34a;font-weight:bold;">✓ 已出席</span>';
         } else if (status) {
             statusDisplay = `<span style="color:#f59e0b;">${status}</span>`;
         }
         
         // 获取地点坐标信息
         const coordinates = locationCache[location];
         let locationDisplay = escapeHtml(location);
         
         // 如果有坐标信息，添加地图链接
         if (coordinates && typeof coordinates.latitude === 'number' && typeof coordinates.longitude === 'number') {
             const mapLink = generateMapLink(coordinates, location);
             const coordText = `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`;
             locationDisplay = `
                 <div style="margin-bottom: 2px;">${escapeHtml(location)}</div>
                 <div style="font-size: 10px; opacity: 0.7;">
                     <a href="${mapLink}" target="_blank" style="color: #fbbf24; text-decoration: none; font-weight: 500;" title="在地图中查看">
                         📍 ${coordText}
                     </a>
                 </div>
             `;
         }
         
         return `<tr>
             <td><input type="checkbox" class="event-checkbox" data-index="${index}"></td>
             <td>${formatTimeRange(start, end)}</td>
             <td>${escapeHtml(title)}</td>
             <td>${locationDisplay}</td>
             <td>${statusDisplay}</td>
         </tr>`;
     }).join('');

    timetableResult.innerHTML = `
         <div style="margin-bottom:8px;opacity:.85;color:#000;">共 ${sorted.length} 条</div>
         <table class="timetable-table">
             <thead>
                 <tr>
                     <th>选择</th>
                     <th>时间</th>
                     <th>标题</th>
                     <th>地点</th>
                     <th>状态</th>
                 </tr>
             </thead>
             <tbody>
                 ${rowsHtml}
             </tbody>
         </table>
     `;
}

function formatTimeRange(startIso, endIso) {
    if (!startIso) return '-';
    try {
        const start = new Date(startIso);
        const end = endIso ? new Date(endIso) : null;
        const dateStr = start.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const startStr = start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const endStr = end ? end.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
        return end ? `${dateStr} ${startStr} - ${endStr}` : `${dateStr} ${startStr}`;
    } catch {
        return startIso;
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 地点坐标缓存
let locationCache = {};

// 从storage加载缓存
async function loadLocationCache() {
    try {
        const result = await chrome.storage.local.get(['locationCache']);
        if (result.locationCache) {
            locationCache = result.locationCache;
        }
    } catch (error) {
        console.error('加载地点缓存失败:', error);
    }
}

// 保存缓存到storage
async function saveLocationCache() {
    try {
        await chrome.storage.local.set({ locationCache: locationCache });
    } catch (error) {
        console.error('保存地点缓存失败:', error);
    }
}

// 提取建筑物主要名称的函数
function extractBuildingName(location) {
    // 常见的建筑物名称映射
    const buildingMappings = {
        "Merchant Venturer's Building": "Merchant Venturers Building",
        "Chemistry Building": "Chemistry Building",
        "Queens Building": "Queens Building",
        "Engineering Building": "Engineering Building",
        "Physics Building": "Physics Building",
        "Mathematics Building": "Mathematics Building",
        "Computer Science Building": "Computer Science Building"
    };
    
    // 尝试匹配建筑物名称
    for (const [pattern, name] of Object.entries(buildingMappings)) {
        if (location.includes(pattern)) {
            return name;
        }
    }
    
    // 如果没有匹配，尝试提取冒号前的部分
    const colonIndex = location.indexOf(':');
    if (colonIndex > 0) {
        return location.substring(0, colonIndex).trim();
    }
    
    return location;
}

// 新增：地点归类的归一化键
function normalizeLocationKey(location) {
    let key = extractBuildingName(location || '').trim();
    // 移除括号、房间号等附加信息
    key = key.replace(/\s*\([^)]*\)\s*/g, ''); // 括号内容
    key = key.replace(/\b(room|rm|lecture\s*theatre|lt)\b.*$/i, '').trim(); // 常见房间/厅后缀
    key = key.split('#')[0].split('-')[0].trim(); // 去掉#和-后内容
    key = key.replace(/\s+/g, ' ');
    return key.toLowerCase();
}

// 新增：多API地理编码（无密钥）
async function geocodeByApis(query) {
    // 1) Nominatim (OpenStreetMap)
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Bristol Auto Checkin Assistant' }
        });
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                return {
                    latitude: parseFloat(data[0].lat),
                    longitude: parseFloat(data[0].lon),
                    display_name: data[0].display_name,
                    provider: 'nominatim'
                };
            }
        }
    } catch (_) {}

    // 小延迟避免被动触发节流
    await new Promise(r => setTimeout(r, 150));

    // 2) geocode.maps.co (基于Nominatim的公共服务)
    try {
        const url = `https://geocode.maps.co/search?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Bristol Auto Checkin Assistant' }
        });
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                return {
                    latitude: parseFloat(data[0].lat),
                    longitude: parseFloat(data[0].lon),
                    display_name: data[0].display_name || data[0].display_name,
                    provider: 'maps.co'
                };
            }
        }
    } catch (_) {}

    await new Promise(r => setTimeout(r, 150));

    // 3) Open-Meteo Geocoding API（免费无密钥）
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Bristol Auto Checkin Assistant' }
        });
        if (response.ok) {
            const data = await response.json();
            const results = data && (data.results || data.response || []);
            if (Array.isArray(results) && results.length > 0) {
                return {
                    latitude: parseFloat(results[0].latitude),
                    longitude: parseFloat(results[0].longitude),
                    display_name: `${results[0].name}, ${results[0].country}`,
                    provider: 'open-meteo'
                };
            }
        }
    } catch (_) {}

    return null;
}

// 获取地点经纬度的函数（多层级查询策略）
async function getLocationCoordinates(location) {
    // 检查缓存
    if (locationCache[location]) {
        return locationCache[location];
    }
    
    // 定义多个查询策略，从具体到一般
    const queries = [
        `${location}, University of Bristol, Bristol, UK`,
        `${extractBuildingName(location)}, University of Bristol, Bristol, UK`,
        `${extractBuildingName(location)}, Bristol, UK`,
        `University of Bristol, Bristol, UK`
    ];
    
    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        
        try {
            const coordinates = await geocodeByApis(query);
            if (coordinates) {
                // 缓存结果并保存
                locationCache[location] = {
                    latitude: coordinates.latitude,
                    longitude: coordinates.longitude,
                    display_name: coordinates.display_name,
                    query_used: query,
                    strategy: i + 1,
                    provider: coordinates.provider
                };
                await saveLocationCache();
                return locationCache[location];
            }
        } catch (error) {
            console.error(`地理编码查询失败 (策略${i + 1}):`, error);
        }
        
        // 在查询之间添加延迟
        if (i < queries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    // 如果所有策略都失败，缓存null避免重复请求
    locationCache[location] = null;
    await saveLocationCache();
    return null;
}

// 获取签到历史
async function fetchCheckinHistory(cookie) {
    try {
        const response = await fetch('https://i.sheffield.ac.uk/campusm/attendance/checkin-history', {
            method: 'GET',
            headers: {
                'Host': 'i.sheffield.ac.uk',
                'Connection': 'keep-alive',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Referer': 'https://i.sheffield.ac.uk/campusm/home',
                'Cookie': cookie
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            // 确保 checkInEntries 是数组
            const entries = Array.isArray(data.checkInEntries) ? data.checkInEntries : (data.checkInEntries ? [data.checkInEntries] : []);
            
            const map = {};
            entries.forEach(entry => {
                if (entry.eventRef) {
                    map[entry.eventRef] = entry.checkInStatus;
                }
            });
            return map;
        }
    } catch (e) {
        console.error('获取签到历史失败', e);
    }
    return {};
}

// 批量获取地点坐标（返回统计信息）
async function batchGetCoordinates(locations) {
    const uniqueLocations = [...new Set((locations || []).filter(loc => loc && loc.trim()))];
    // 1) 按归一化键分组
    const groupMap = new Map(); // key -> Set(originalLoc)
    for (const loc of uniqueLocations) {
        const key = normalizeLocationKey(loc);
        if (!groupMap.has(key)) groupMap.set(key, new Set());
        groupMap.get(key).add(loc);
    }

    // 2) 优先用已有缓存命中并传播到组内其它项
    let successGroups = 0;
    const keysToFetch = [];
    for (const [key, origSet] of groupMap.entries()) {
        let hit = null;
        for (const orig of origSet) {
            const c = locationCache[orig];
            if (c && typeof c.latitude === 'number' && typeof c.longitude === 'number') { hit = c; break; }
        }
        if (hit) {
            for (const orig of origSet) {
                const c = locationCache[orig];
                if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') {
                    locationCache[orig] = hit;
                }
            }
            successGroups++;
        } else {
            keysToFetch.push(key);
        }
    }

    // 若全部命中，无需请求
    if (keysToFetch.length === 0) {
        await saveLocationCache();
        return { successCount: successGroups, totalCount: groupMap.size };
    }

    // 3) 并发请求（受限并发）对每个归一化键进行一次地理编码
    const limit = 4; // 默认并发度，可调 2-6
    const resultsByKey = new Map();
    const tasks = keysToFetch.map(key => async () => {
        // 小延迟避免公共API节流
        await new Promise(r => setTimeout(r, 80));
        const res = await getLocationCoordinates(key);
        if (res && typeof res.latitude === 'number' && typeof res.longitude === 'number') {
            resultsByKey.set(key, res);
        }
    });

    let idx = 0;
    async function worker() {
        while (idx < tasks.length) {
            const my = tasks[idx++];
            try { await my(); } catch (e) { console.error('并发获取坐标任务出错:', e); }
        }
    }
    const workers = Array(Math.min(limit, tasks.length)).fill(0).map(() => worker());
    await Promise.all(workers);

    // 4) 将成功结果传播到各组的原始地点，并计数
    for (const [key, res] of resultsByKey.entries()) {
        const origSet = groupMap.get(key);
        if (!origSet) continue;
        for (const orig of origSet) {
            locationCache[orig] = res;
        }
        successGroups++;
    }

    await saveLocationCache();
    return { successCount: successGroups, totalCount: groupMap.size };
}

// 生成地图链接
function generateMapLink(coordinates, locationName) {
    if (!coordinates) return null;
    
    const { latitude, longitude } = coordinates;
    // 使用OpenStreetMap链接
    return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=18&layers=M`;
}

// 全局变量存储当前课程表数据
let currentTimetableData = [];

// 修改renderTimetable函数，保存数据并显示一键签到按钮
function renderTimetableWithCheckin(events) {
    currentTimetableData = events || [];
    renderTimetable(events);
    
    // 显示一键签到按钮
    const checkinBtn = document.getElementById('oneClickCheckinBtn');
    if (currentTimetableData.length > 0) {
        checkinBtn.style.display = 'block';
    } else {
        checkinBtn.style.display = 'none';
    }
}

// 一键签到功能
async function oneClickCheckin(cookie) {
    const checkinBtn = document.getElementById('oneClickCheckinBtn');
    const checkinStatus = document.getElementById('checkinStatus');
    
    // 获取选中的课程
    const checkboxes = document.querySelectorAll('.event-checkbox:checked');
    if (checkboxes.length === 0) {
        showCheckinStatus('请先选择要签到的课程！', 'error');
        return;
    }
    
    // 禁用按钮
    checkinBtn.disabled = true;
    checkinBtn.textContent = '签到中...';
    
    let successCount = 0;
    let failCount = 0;
    const results = [];
    
    try {
        for (const checkbox of checkboxes) {
            const index = parseInt(checkbox.dataset.index);
            const event = currentTimetableData[index];
            
            if (!event) {
                results.push(`课程 ${index + 1}: 数据错误`);
                failCount++;
                continue;
            }
            
            try {
                const result = await performCheckin(event, cookie);
                if (result.success) {
                    // 使用返回的消息或默认消息
                    const message = result.message || '签到成功';
                    results.push(`✓ ${event.desc1 || '课程'}: ${message}`);
                    successCount++;
                } else {
                    results.push(`✗ ${event.desc1 || '课程'}: ${result.error}`);
                    failCount++;
                }
            } catch (error) {
                results.push(`✗ ${event.desc1 || '课程'}: ${error.message}`);
                failCount++;
            }
            
            // 添加延迟避免请求过快
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // 显示结果
        const statusClass = failCount === 0 ? 'success' : (successCount === 0 ? 'error' : 'success');
        const summary = `签到完成！成功: ${successCount}, 失败: ${failCount}`;
        showCheckinStatus(`${summary}\n\n${results.join('\n')}`, statusClass);
        
    } catch (error) {
        console.error('一键签到异常:', error);
        showCheckinStatus(`签到异常: ${error.message}`, 'error');
    } finally {
        // 恢复按钮状态
        checkinBtn.disabled = false;
        checkinBtn.textContent = '一键签到';
    }
}

// 执行单个课程签到
async function performCheckin(event, cookie) {
    const eventRef = event.eventRef;
    const eventStart = event.start;
    const eventEnd = event.end;
    const eventDesc = event.desc1 || '';
    const location = event.locAdd1 || event.locCode || '';
    
    // 获取OTC密码
    const otcInput = document.getElementById('otcInput');
    let otcCode = otcInput ? otcInput.value.trim() : '';
    
    // 如果用户没有输入OTC，尝试自动生成
    if (!otcCode && eventRef) {
        console.log('用户未输入OTC，尝试自动生成...');
        const generatedOtc = generateValidCode(eventRef);
        if (generatedOtc) {
            otcCode = generatedOtc;
            console.log('已自动生成OTC:', otcCode);
            // 可选：在界面上显示使用的代码（如果需要）
        }
    }

    // 获取地点坐标
    const coordinates = locationCache[location];
    let deviceLat = 53.381130; // 默认坐标（Sheffield University, Diamond Building）
    let deviceLong = -1.487890;
    
    if (coordinates && coordinates.latitude && coordinates.longitude) {
        deviceLat = coordinates.latitude;
        deviceLong = coordinates.longitude;
    }
    
    // 构建签到请求数据
    const checkinData = {
        eventRef: eventRef,
        eventStart: eventStart,
        eventEnd: eventEnd,
        eventDesc: eventDesc,
        deviceTime: new Date().toISOString().replace('Z', '+00:00'),
        checkInType: "OTC",
        deviceLat: deviceLat,
        deviceLong: deviceLong,
        devicePrecision: 28,
        locationRef: location,
        otc: otcCode || null, // 使用用户输入的OTC密码（或自动生成的），如果为空则为null
        qr: null
    };
    
    console.log('发送签到请求:', checkinData);
    
    try {
        const response = await fetch('https://i.sheffield.ac.uk/campusm/attendance/checkin', {
            method: 'POST',
            headers: {
                'Host': 'i.sheffield.ac.uk',
                'Connection': 'keep-alive',
                'Content-Length': JSON.stringify(checkinData).length.toString(),
                'sec-ch-ua-platform': '"Windows"',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
                'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
                'content-type': 'application/json; charset=utf-8',
                'sec-ch-ua-mobile': '?0',
                'Accept': '*/*',
                'Origin': 'https://i.sheffield.ac.uk',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Dest': 'empty',
                'Referer': 'https://i.sheffield.ac.uk/campusm/home',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en,zh-CN;q=0.9,zh;q=0.8',
                'Cookie': cookie
            },
            body: JSON.stringify(checkinData)
        });
        
        console.log('签到响应状态:', response.status);
        
        if (response.ok) {
            const responseText = await response.text();
            console.log('签到响应内容:', responseText);
            
            try {
                // 首先尝试解析JSON响应
                let parsedResponse;
                try {
                    parsedResponse = JSON.parse(responseText);
                    console.log('解析JSON响应:', parsedResponse);
                } catch (jsonError) {
                    // 如果JSON解析失败，尝试XML解析
                    console.log('JSON解析失败，尝试XML解析');
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(responseText, "text/xml");
                    
                    // 查找checkinStatus字段
                    const checkinStatusElement = xmlDoc.querySelector('checkinStatus');
                    const descriptionElement = xmlDoc.querySelector('description');
                    
                    if (checkinStatusElement) {
                        parsedResponse = {
                            checkinStatus: checkinStatusElement.textContent,
                            description: descriptionElement ? descriptionElement.textContent : ''
                        };
                    } else {
                        throw new Error('无法解析响应格式');
                    }
                }
                
                // 统一处理解析后的响应
                if (parsedResponse && parsedResponse.checkinStatus) {
                    const status = parsedResponse.checkinStatus;
                    const description = parsedResponse.description || '';
                    
                    console.log('签到状态:', status, '描述:', description);
                    
                    if (status === 'validated') {
                        // 签到成功（包括重复签到）
                        const message = description === 'Duplicate check-in' ? '重复签到（已签到过）' : '签到成功';
                        return { success: true, status: status, message: message, response: responseText };
                    } else if (status === 'invalid' || status === 'unvalidated') {
                        // 签到失败
                        const errorMsg = description === 'Duplicate check-in' ? '重复签到失败' : `签到失败: ${description || status}`;
                        return { success: false, status: status, error: errorMsg, response: responseText };
                    } else {
                        // 未知状态
                        return { success: false, status: status, error: `未知签到状态: ${status}`, response: responseText };
                    }
                } else {
                    // 无法找到状态字段，按成功处理（向后兼容）
                    return { success: true, response: responseText };
                }
            } catch (parseError) {
                console.error('解析签到响应失败:', parseError);
                // 解析失败，按成功处理（向后兼容）
                return { success: true, response: responseText };
            }
        } else {
            const errorText = await response.text();
            console.error('签到失败:', response.status, errorText);
            return { success: false, error: `HTTP ${response.status}: ${errorText}` };
        }
        
    } catch (error) {
        console.error('签到请求异常:', error);
        return { success: false, error: error.message };
    }
}

// 显示签到状态
function showCheckinStatus(message, type = 'success') {
    const checkinStatus = document.getElementById('checkinStatus');
    checkinStatus.style.display = 'block';
    checkinStatus.className = `checkin-status checkin-${type}`;
    checkinStatus.textContent = message;
}

// 更新OTC输入框标签
function updateOtcLabel() {
    const label = document.querySelector('label[for="otcInput"]');
    if (!label) return;
    
    const checkedBoxes = document.querySelectorAll('.event-checkbox:checked');
    if (checkedBoxes.length > 0) {
        const index = parseInt(checkedBoxes[0].dataset.index);
        const event = currentTimetableData[index];
        if (event) {
            const courseName = event.desc1 || '未知课程';
            label.textContent = `📝 OTC签到密码 (${courseName})`;
            return;
        }
    }
    label.textContent = '📝 OTC签到密码 (老师提供)';
}

// 修改原有的renderTimetable调用
const originalRenderTimetable = renderTimetable;
renderTimetable = function(events, historyMap) {
    currentTimetableData = events || [];
    originalRenderTimetable(events, historyMap);
    
    // 绑定checkbox变化事件以更新OTC标签
    const checkboxes = document.querySelectorAll('.event-checkbox');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateOtcLabel);
    });
    updateOtcLabel();
    
    // 显示协议确认部分和一键签到按钮
    const checkinBtn = document.getElementById('oneClickCheckinBtn');
    const otcInputSection = document.getElementById('otcInputSection');
    
    if (currentTimetableData.length > 0) {
        // 显示OTC输入区域
        if (otcInputSection) {
            otcInputSection.style.display = 'block';
        }
        
        // 显示使用说明
        const twoColumnContainer = document.getElementById('twoColumnContainer');
        if (twoColumnContainer) {
    // 使用单列纵向布局，避免与内部样式冲突导致并排
    twoColumnContainer.style.display = 'block';
  }
        
        checkinBtn.style.display = 'block';
        
        // 添加事件监听器（如果还没有添加）
        if (!checkinBtn.hasAttribute('data-listener-added')) {
            checkinBtn.addEventListener('click', function() {
                
                // 获取当前cookie
                chrome.storage.local.get(['bristolUserInfo', 'bristolStatus'], function(result) {
                    let cookie = null;
                    if (result.bristolUserInfo && result.bristolUserInfo.cookie) {
                        cookie = result.bristolUserInfo.cookie;
                    } else                         if (result.bristolStatus && result.bristolStatus.cookie) {
                        cookie = result.bristolStatus.cookie;
                    }
                    
                    if (cookie) {
                        oneClickCheckin(cookie);
                    } else {
                        showCheckinStatus('未找到有效的Cookie，请先登录Sheffield系统', 'error');
                    }
                });
            });
            checkinBtn.setAttribute('data-listener-added', 'true');
        }
    } else {
        
        // 隐藏OTC输入区域
        if (otcInputSection) {
            otcInputSection.style.display = 'none';
        }
        
        // 隐藏使用说明
        const twoColumnContainer = document.getElementById('twoColumnContainer');
        if (twoColumnContainer) {
            twoColumnContainer.style.display = 'none';
        }
        
        checkinBtn.style.display = 'none';
    }
};
 

// 清除所有数据的函数
function clearAllData() {
    if (confirm('确定要清除所有数据吗？这将删除所有存储的用户信息和状态数据，程序将重新开始监听和获取数据。')) {
        // 清除Chrome存储中的所有相关数据
        chrome.storage.local.clear(function() {
            console.log('所有数据已清除');
            
            // 重新加载页面状态
            showNoDataMessage();
            updateStatus('数据已清除，请重新访问Bristol网站获取数据');
            
            // 隐藏用户信息区域
            document.getElementById('userInfo').style.display = 'none';
            
            // 显示成功消息
            alert('数据清除成功！请重新访问Bristol大学网站以获取新的用户信息。');
        });
    }
}

// 捐赠功能导航逻辑
document.addEventListener('DOMContentLoaded', function() {
    // 捐赠图标点击事件
    const donationIcon = document.getElementById('donationIcon');
    if (donationIcon) {
        donationIcon.addEventListener('click', function() {
            showPage('donationPage');
        });
    }
    
    // 捐赠页面返回按钮
    const backFromDonation = document.getElementById('backFromDonation');
    if (backFromDonation) {
        backFromDonation.addEventListener('click', function() {
            showPage('mainPage');
        });
    }
    
    // 感谢页面返回按钮
    const backFromThankYou = document.getElementById('backFromThankYou');
    if (backFromThankYou) {
        backFromThankYou.addEventListener('click', function() {
            showPage('mainPage');
        });
    }
    
    // 捐赠按钮点击事件 - 监听链接点击后显示感谢页面
    const donateBtn = document.getElementById('donateBtn');
    if (donateBtn) {
        donateBtn.addEventListener('click', function() {
            // 延迟显示感谢页面，给用户时间完成捐赠
            setTimeout(function() {
                showPage('thankYouPage');
            }, 2000);
        });
    }
});

// 页面切换函数
function showPage(pageId) {
    // 隐藏所有页面
    const pages = document.querySelectorAll('.page-container');
    pages.forEach(page => {
        page.classList.remove('active');
    });
    
    // 显示指定页面
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
}


// =========================================
// 签到码生成器相关逻辑 (移植自 签到码生成器.js)
// =========================================

// --- 第1部分: SHA256 哈希函数 ---
var sha256 = (function() {
    // 这是一个简化的SHA256实现
    return function(ascii) {
        function rightRotate(value, amount) {
            return (value >>> amount) | (value << (32 - amount));
        };
        var mathPow = Math.pow;
        var maxWord = mathPow(2, 32);
        var lengthProperty = 'length'
        var i, j; 
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
        ascii += '\x80' 
        while (ascii[lengthProperty] % 64 - 56) ascii += '\x00' 
        for (i = 0; i < ascii[lengthProperty]; i++) {
            j = ascii.charCodeAt(i);
            if (j >> 8) return; 
            words[i >> 2] |= j << ((3 - i) % 4) * 8;
        }
        words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
        words[words[lengthProperty]] = (asciiBitLength)
        for (j = 0; j < words[lengthProperty];) {
            var w = words.slice(j, j += 16); 
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
  */
  function hashToAlpha(hashHex, length) {
    // 原始逻辑只取哈希值的前13位进行转换，以保证数字大小在安全范围内
    const hexSubstring = hashHex.substring(0, 13);
    const num = parseInt(hexSubstring, 16);
    return intToAlpha(num, length);
  }
  
  /**
   * 生成校验和
   */
  function generateChecksumFromCombinedString(body, salt, checksumLength) {
      // 关键发现：直接拼接 body 和 salt
      const combinedString = body + salt;
      const hash = sha256(combinedString);
      return hashToAlpha(hash, checksumLength);
  }
  
  /**
   * 生成有效的签到码
   * @param {string} salt - 课程的 eventRef。
   * @param {string} [prefix='ABC'] - 你想要使用的前缀 (任意3位大写字母)。
   * @returns {string} 一个完整的、有效的6位签到码。
   */
  function generateValidCode(salt, prefix) {
      // 如果没有提供前缀，随机生成一个3位字母前缀
      if (!prefix) {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          prefix = '';
          for (let i = 0; i < 3; i++) {
              prefix += chars.charAt(Math.floor(Math.random() * chars.length));
          }
      }
      
      if (prefix.length !== 3) {
          console.error("前缀必须是3位大写字母！");
          return null;
      }
      
      const body = prefix.toUpperCase();
      const checksum = generateChecksumFromCombinedString(body, salt, 3);
      const fullCode = body + checksum;
      
      console.log(`为课程 "${salt}" 生成签到码: ${fullCode} (前缀: ${body})`);
      
      return fullCode;
  }